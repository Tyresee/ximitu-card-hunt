// On-map route choice (fork buttons beside the junction). Presentation only:
// the existing route-choice flow keeps ownership of the decision, the server
// keeps authority over the move. The buttons just preview each real route and
// hand the chosen edge back through `onConfirm`.

export const ROUTE_CHOICE_COLORS = Object.freeze(["#2fa35b", "#7b4fd6", "#e07b12"]);
export const ROUTE_CHOICE_PILL = Object.freeze({ width: 132, height: 54, gap: 14, distance: 150, margin: 18 });

const LABELS = Object.freeze({
  vertical: Object.freeze({ 2: ["上路", "下路"], 3: ["上路", "中路", "下路"] }),
  horizontal: Object.freeze({ 2: ["左路", "右路"], 3: ["左路", "中路", "右路"] }),
});

const unit = (x, y) => {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Where the fork buttons go and what they say.
 * options: [{ edgeId, firstNode: {x,y}, probe?: {x,y} }] in plan order. `probe` (e.g. the
 * mean of the first few route nodes) gives the branch's overall heading; the arrow
 * itself points at the first node.
 * Returns buttons in plan order: { edgeId, label, color, x, y, angle, rank }.
 */
export function routeChoiceLayout({ junction, options, worldSize, pill = ROUTE_CHOICE_PILL }) {
  const directions = options.map((option) => {
    const probe = option.probe || option.firstNode;
    return unit(probe.x - junction.x, probe.y - junction.y);
  });
  const arrows = options.map((option) => unit(option.firstNode.x - junction.x, option.firstNode.y - junction.y));
  const spreadY = Math.max(...directions.map((d) => d.y)) - Math.min(...directions.map((d) => d.y));
  const spreadX = Math.max(...directions.map((d) => d.x)) - Math.min(...directions.map((d) => d.x));
  const orientation = spreadY >= spreadX ? "vertical" : "horizontal";
  const axis = orientation === "vertical" ? "y" : "x";
  const ranked = options.map((option, index) => ({ index, value: directions[index][axis] }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const rankByIndex = new Map(ranked.map((entry, rank) => [entry.index, rank]));
  const names = LABELS[orientation][options.length];

  // Sit the buttons on the side the branches do NOT go to, so they never hide a branch.
  const mean = unit(directions.reduce((sum, d) => sum + d.x, 0), directions.reduce((sum, d) => sum + d.y, 0));
  const away = mean.x === 0 && mean.y === 0 ? { x: -1, y: 0 } : { x: -mean.x, y: -mean.y };
  const anchor = { x: junction.x + (away.x * pill.distance), y: junction.y + (away.y * pill.distance) };
  const step = orientation === "vertical" ? pill.height + pill.gap : pill.width + pill.gap;
  const halfW = pill.width / 2, halfH = pill.height / 2;
  const middle = (options.length - 1) / 2;
  const extentX = orientation === "horizontal" ? middle * step : 0;
  const extentY = orientation === "vertical" ? middle * step : 0;
  const width = Number(worldSize?.width) || Infinity, height = Number(worldSize?.height) || Infinity;
  anchor.x = clamp(anchor.x, halfW + extentX + pill.margin, width - halfW - extentX - pill.margin);
  anchor.y = clamp(anchor.y, halfH + extentY + pill.margin, height - halfH - extentY - pill.margin);

  const buttons = options.map((option, index) => {
    const rank = rankByIndex.get(index);
    const offset = (rank - middle) * step;
    const d = arrows[index];
    return {
      edgeId: option.edgeId,
      rank,
      label: names?.[rank] || option.fallbackLabel || `第${index + 1}条路`,
      color: ROUTE_CHOICE_COLORS[rank % ROUTE_CHOICE_COLORS.length],
      x: Math.round(anchor.x + (orientation === "horizontal" ? offset : 0)),
      y: Math.round(anchor.y + (orientation === "vertical" ? offset : 0)),
      angle: Math.round((Math.atan2(d.y, d.x) * 180) / Math.PI),
    };
  });
  return { orientation, anchor, buttons };
}

/**
 * Vertical offset of a route's landing tag: the top route labels above its stop
 * (clear of a floating bonus icon), the others below, so tags never sit on the
 * other branch.
 */
export function routeChoiceTagOffset({ orientation, rank, hasFloatingMarker = false }) {
  if (orientation === "vertical" && rank === 0) return hasFloatingMarker ? -104 : -62;
  return 50;
}

/** Text on the landing tag of a route preview. */
export function routeChoiceLandingText(amount) {
  return Number.isFinite(amount) ? `停在 +${amount}` : "停在这里";
}

/**
 * Touch/pen: first tap previews (arms), a second tap on the same button confirms.
 * Mouse and keyboard confirm straight away (hover/focus already previewed).
 */
export function routeChoiceTapAction({ pointerType, armedEdgeId, edgeId }) {
  if (pointerType === "touch" || pointerType === "pen") return armedEdgeId === edgeId ? "confirm" : "arm";
  return "confirm";
}

/**
 * Build the SVG layer. Pure DOM; app.js wires the callbacks.
 * routes: [{ edgeId, label, color, x, y, angle, ariaLabel, edgePaths: [d...], landing: {x,y}, landingText, landingIcon }]
 * state: { previewEdgeId, armedEdgeId, selectedEdgeId }
 */
export function createBoardRouteChoiceLayer({ svgElement, junctionNodeId, routes, state = {}, onPreview, onConfirm }) {
  routes = routes.slice().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)); // DOM/Tab order = on-screen order
  const layer = svgElement("g", {
    class: `board-route-choice${state.selectedEdgeId ? " is-locked" : ""}`,
    "data-junction-node-id": junctionNodeId,
    role: "group",
    "aria-label": "选择要走的路",
  });
  // Route lines + landing rings go UNDER the tiles (app inserts `previews` below the
  // space layer) so printed numbers stay readable; tags and buttons sit on top.
  const previews = svgElement("g", { class: "brc-previews", "data-junction-node-id": junctionNodeId, "aria-hidden": "true" });
  const tags = svgElement("g", { class: "brc-tags", "aria-hidden": "true" });
  const buttons = svgElement("g", { class: "brc-buttons" });
  const items = new Map();
  const halfW = ROUTE_CHOICE_PILL.width / 2, halfH = ROUTE_CHOICE_PILL.height / 2;

  routes.forEach((route) => {
    const preview = svgElement("g", { class: "brc-preview", "data-route-choice-edge-id": route.edgeId, style: `--brc-color:${route.color}` });
    route.edgePaths.forEach((d) => preview.append(svgElement("path", { d, class: "brc-preview-under" })));
    route.edgePaths.forEach((d) => preview.append(svgElement("path", { d, class: "brc-preview-line" })));
    const tagGroup = svgElement("g", { class: "brc-preview brc-preview-tag", "data-route-choice-edge-id": route.edgeId, style: `--brc-color:${route.color}` });
    if (route.landing) {
      const landing = svgElement("g", { class: "brc-landing", transform: `translate(${route.landing.x} ${route.landing.y})` });
      landing.append(svgElement("ellipse", { class: "brc-landing-ring", rx: 40, ry: 30 }));
      preview.append(landing);
      const tagAnchor = svgElement("g", { transform: `translate(${route.landing.x} ${route.landing.y + (route.tagOffsetY ?? 50)})` });
      const tag = svgElement("g", { class: "brc-landing-tag" });
      const text = `${route.landingIcon ? `${route.landingIcon} ` : ""}${route.landingText}`;
      const tagWidth = Math.max(84, Array.from(text).reduce((sum, ch) => sum + (/[\u0000-\u00ff]/.test(ch) ? 8.5 : 15.5), 0) + 22);
      tag.append(
        svgElement("rect", { class: "brc-shadow", x: -tagWidth / 2, y: -12.5, width: tagWidth, height: 30, rx: 15 }),
        svgElement("rect", { x: -tagWidth / 2, y: -15, width: tagWidth, height: 30, rx: 15 }),
      );
      const label = svgElement("text", { x: 0, y: 1, "text-anchor": "middle", "dominant-baseline": "central" });
      label.textContent = text;
      tag.append(label);
      tagAnchor.append(tag);
      tagGroup.append(tagAnchor);
    }
    previews.append(preview);
    tags.append(tagGroup);

    const button = svgElement("g", {
      class: "brc-button",
      role: "button",
      tabindex: state.selectedEdgeId ? "-1" : "0",
      "aria-label": route.ariaLabel || route.label,
      "aria-disabled": String(Boolean(state.selectedEdgeId)),
      "data-route-choice-edge-id": route.edgeId,
      transform: `translate(${route.x} ${route.y})`,
      style: `--brc-color:${route.color}`,
    });
    const body = svgElement("g", { class: "brc-button-body" });
    body.append(
      svgElement("rect", { class: "brc-button-hit", x: -halfW - 10, y: -halfH - 8, width: (halfW + 10) * 2, height: (halfH + 8) * 2, rx: halfH + 8 }),
      svgElement("rect", { class: "brc-button-shadow", x: -halfW, y: -halfH + 4, width: halfW * 2, height: halfH * 2, rx: halfH }),
      svgElement("rect", { class: "brc-button-pill", x: -halfW, y: -halfH, width: halfW * 2, height: halfH * 2, rx: halfH }),
    );
    const icon = svgElement("g", { class: "brc-button-icon", transform: `translate(${-halfW + 29} 0)` });
    icon.append(
      svgElement("circle", { r: 19 }),
      svgElement("path", { d: "M 11 0 L -1 -11 L -1 -4.5 L -10 -4.5 L -10 4.5 L -1 4.5 L -1 11 Z", transform: `rotate(${route.angle})` }),
    );
    const label = svgElement("text", { class: "brc-button-label", x: 20, y: 1, "text-anchor": "middle", "dominant-baseline": "central" });
    label.textContent = route.label;
    const hint = svgElement("text", { class: "brc-button-hint", x: 0, y: halfH + 20, "text-anchor": "middle", "dominant-baseline": "central", "aria-hidden": "true" });
    hint.textContent = "再点一下出发";
    body.append(icon, label, hint);
    button.append(body);
    buttons.append(button);
    items.set(route.edgeId, { preview, tag: tagGroup, button });
  });
  layer.append(tags, buttons);

  const sync = () => {
    const active = state.selectedEdgeId || state.armedEdgeId || state.previewEdgeId || null;
    for (const root of [layer, previews]) {
      root.toggleAttribute?.("data-has-preview", Boolean(active));
      if (active) root.setAttribute("data-preview-edge-id", active); else root.removeAttribute("data-preview-edge-id");
    }
    items.forEach(({ preview, tag, button }, edgeId) => {
      const on = edgeId === active;
      preview.classList.toggle("is-previewed", on);
      tag.classList.toggle("is-previewed", on);
      button.classList.toggle("is-previewed", on);
      button.classList.toggle("is-armed", edgeId === state.armedEdgeId && !state.selectedEdgeId);
      button.classList.toggle("is-selected", edgeId === state.selectedEdgeId);
    });
  };
  const preview = (edgeId, reason) => {
    if (state.selectedEdgeId) return;
    state.previewEdgeId = edgeId;
    if (edgeId !== state.armedEdgeId && reason !== "arm") state.armedEdgeId = null;
    sync();
    onPreview?.(edgeId, reason);
  };
  const confirm = (edgeId) => {
    if (state.selectedEdgeId) return;
    onConfirm?.(edgeId);
  };

  const order = routes.map((route) => route.edgeId);
  items.forEach(({ button }, edgeId) => {
    let pointerType = "mouse";
    // The board viewport pans on pointerdown; keep presses on a button out of the pan.
    for (const name of ["pointerdown", "mousedown", "touchstart"]) {
      button.addEventListener(name, (event) => {
        if (event.pointerType) pointerType = event.pointerType;
        else if (name === "touchstart") pointerType = "touch";
        event.stopPropagation();
      }, { passive: true });
    }
    button.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") preview(edgeId, "hover"); });
    button.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && state.previewEdgeId === edgeId && !state.armedEdgeId
        && button.ownerDocument?.activeElement !== button) preview(null, "hover");
    });
    button.addEventListener("focus", () => {
      const visible = (() => { try { return button.matches(":focus-visible"); } catch { return true; } })();
      if (visible) preview(edgeId, "focus");
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const action = routeChoiceTapAction({ pointerType, armedEdgeId: state.armedEdgeId, edgeId });
      pointerType = "mouse";
      if (action === "arm") { state.armedEdgeId = edgeId; preview(edgeId, "arm"); return; }
      confirm(edgeId);
    });
    button.addEventListener("keydown", (event) => {
      const index = order.indexOf(edgeId);
      let next = null;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); confirm(edgeId); return; }
      if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = order[(index - 1 + order.length) % order.length];
      if (["ArrowDown", "ArrowRight"].includes(event.key)) next = order[(index + 1) % order.length];
      if (!next) return;
      event.preventDefault(); event.stopPropagation();
      items.get(next).button.focus({ preventScroll: true });
      preview(next, "focus");
    });
  });
  sync();
  return { layer, previews, sync, focus(edgeId) { items.get(edgeId || order[0])?.button.focus({ preventScroll: true }); } };
}
