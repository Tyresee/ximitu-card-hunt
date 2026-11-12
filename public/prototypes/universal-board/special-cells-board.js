// 特效格 board presentation: SVG markers, corner legend, landing big text and
// the teacher's 完成 / 取消 dialog. Display only — every value shown here comes
// from the server snapshot (session.specialCells / turn.specialCell).
import { SPECIAL_CELL_TYPE_BY_ID, SPECIAL_CELL_GROUP_MOVE_LESSON_CAP, groupSpecialCells } from "./special-cells-core.js";
import { specialCellIconHtml } from "./special-cells-intro.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (name, attributes = {}) => {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
};

export function liveSpecialCells(snapshot) {
  if (!snapshot?.cells?.length) return [];
  const consumed = new Set(snapshot.consumed || []);
  return snapshot.cells.filter((cell) => !consumed.has(cell.cellId));
}

export function specialCellsMovesExhausted(snapshot) {
  return (snapshot?.groupMoveSuccesses || 0) >= SPECIAL_CELL_GROUP_MOVE_LESSON_CAP;
}

/** Short effect text on the marker's chip (distinct from the tile's own printed points). */
export const SPECIAL_CELL_SHORT_LABELS = Object.freeze({
  star: "×1.5", double: "×2", crown: "×3", bag: "+100", redpack: "+50",
  move1: "前进1", move2: "前进2", move3: "前进3", reroll: "再掷", double_dice: "下次双骰",
});

export function specialCellShortLabel(typeId) {
  return SPECIAL_CELL_SHORT_LABELS[typeId] || SPECIAL_CELL_TYPE_BY_ID[typeId]?.effect || "";
}

const chipWidth = (text) => Math.max(36, Array.from(text).reduce((sum, ch) => sum + (/[\u0000-\u00ff]/.test(ch) ? 7.6 : 13), 0) + 16);

/**
 * Marker drawn inside the node's own <g transform="translate(x y)">: the reward
 * icon floats above the tile in a soft glow, with a coloured effect chip under
 * it (×1.5 / +100 / 再掷). Rare types sparkle. Motion is CSS-only and off for
 * prefers-reduced-motion.
 */
export function specialCellMarker(cell, { hidden = false, exhausted = false } = {}) {
  const type = SPECIAL_CELL_TYPE_BY_ID[cell.type];
  const rare = type.rarity === 2;
  const group = svg("g", {
    class: `special-cell-marker type-${type.id}${rare ? " is-rare" : ""}${hidden ? " is-intro-hidden" : ""}${exhausted ? " is-exhausted" : ""}`,
    "data-special-cell-id": cell.cellId, "data-special-cell-type": type.id, "aria-hidden": "true",
  });
  group.style.setProperty("--sc-color", type.color);
  group.style.setProperty("--sc-glow", type.glow);
  // Position lives on an outer group; CSS animations only touch the inner groups.
  const anchor = svg("g", { class: "sc-marker-anchor", transform: "translate(0 -48)" });
  const pop = svg("g", { class: "sc-marker-pop" });
  const bob = svg("g", { class: "sc-marker-bob" });
  // Filter-free on purpose (perf): soft glow = stacked translucent circles, shadow = offset disc.
  // CSS filter/blur on SVG children is re-rasterised every time the board repaints.
  const haloR = rare ? 33 : 29;
  bob.append(
    svg("circle", { class: "sc-marker-halo", r: haloR }),
    svg("circle", { class: "sc-marker-halo is-core", r: haloR - 6 }),
    svg("circle", { class: "sc-marker-shadow", cy: 3, r: 21 }),
  );
  if (rare) bob.append(svg("circle", { class: "sc-marker-rare-ring", r: 24.5 }));
  bob.append(svg("circle", { class: "sc-marker-plate", r: 21 }));
  const glyph = svg("text", { class: "sc-marker-glyph", x: 0, y: 1, "text-anchor": "middle" });
  glyph.textContent = type.icon;
  if (Array.from(type.icon).length > 1) glyph.setAttribute("font-size", "18");
  bob.append(glyph);
  const text = specialCellShortLabel(type.id);
  const chip = svg("g", { class: "sc-marker-chip", transform: "translate(0 23)" });
  const width = chipWidth(text);
  chip.append(
    svg("rect", { class: "sc-marker-chip-shadow", x: -width / 2, y: -8, width, height: 20, rx: 10 }),
    svg("rect", { class: "sc-marker-chip-body", x: -width / 2, y: -10, width, height: 20, rx: 10 }),
  );
  const chipText = svg("text", { x: 0, y: 0.5, "text-anchor": "middle" });
  chipText.textContent = text;
  chip.append(chipText);
  bob.append(chip);
  if (rare) {
    for (const [x, y, size, delay] of [[-29, -17, 12, 0], [29, -11, 10, 0.5], [-24, 15, 9, 1], [26, 17, 11, 1.4]]) {
      const spark = svg("text", { class: "sc-marker-spark", x, y, "font-size": size, "text-anchor": "middle" });
      spark.style.setProperty("--spark-delay", `${delay}s`);
      spark.textContent = "✦";
      bob.append(spark);
    }
  }
  pop.append(bob);
  anchor.append(pop);
  group.append(anchor);
  if (exhausted) {
    const note = svg("text", { class: "sc-marker-note", x: 0, y: -90, "text-anchor": "middle" });
    note.textContent = "今天走够啦";
    group.append(note);
  }
  return group;
}

export function revealSpecialCellMarker(root, cellId, animate) {
  root?.querySelectorAll(`[data-special-cell-id="${CSS.escape(cellId)}"]`).forEach((marker) => {
    marker.classList.remove("is-intro-hidden");
    if (animate) { marker.classList.remove("is-landed"); void marker.getBBox?.(); marker.classList.add("is-landed"); }
  });
}

/**
 * Corner legend + (before the first roll only) 掉落数量 / 只留全班格 / 重新掉落 / 重播.
 * state: { snapshot, locked, busy, status, density, multipliersEnabled, collapsed }
 */
export function renderSpecialCellsLegend(host, state, handlers) {
  const { snapshot } = state;
  host.hidden = !snapshot || state.hiddenDuringIntro;
  if (host.hidden) return;
  if (!host.__scBound) {
    // The legend sits inside the draggable board viewport; keep its buttons
    // out of the pan gesture (pointer capture would swallow the click).
    host.__scBound = true;
    for (const name of ["pointerdown", "mousedown", "touchstart", "wheel"]) {
      host.addEventListener(name, (event) => event.stopPropagation(), { passive: true });
    }
  }
  host.classList.toggle("is-collapsed", Boolean(state.collapsed));
  // render() runs often; rebuilding the buttons between pointerdown and
  // pointerup would swallow the teacher's click, so only rebuild on change.
  const key = JSON.stringify([snapshot.drawNumber, snapshot.cells?.length, snapshot.consumed, snapshot.groupMoveSuccesses,
    state.locked, state.busy, state.status, state.density, state.multipliersEnabled, state.collapsed]);
  if (host.__scKey === key) return;
  host.__scKey = key;
  const head = document.createElement("button");
  head.type = "button"; head.className = "sc-legend-head";
  head.innerHTML = `<span>🎁 本节课宝藏</span><span class="sc-caret">▾</span>`;
  head.setAttribute("aria-expanded", String(!state.collapsed));
  head.addEventListener("click", () => handlers.onToggleCollapsed?.());
  const body = document.createElement("div"); body.className = "sc-legend-body";
  const consumed = new Set(snapshot.consumed || []);
  const exhausted = specialCellsMovesExhausted(snapshot);
  for (const { type, cells } of groupSpecialCells(snapshot.cells || [])) {
    const left = cells.filter((cell) => !consumed.has(cell.cellId)).length;
    const row = document.createElement("div");
    row.className = `sc-lrow${type.rarity === 2 ? " rare" : ""}${!left || (exhausted && type.category === "move") ? " is-spent" : ""}`;
    row.style.setProperty("--c", type.color); row.style.setProperty("--g", type.glow);
    row.innerHTML = `<span class="li emo">${specialCellIconHtml(type.icon)}</span><span class="ln">${type.name}<br><span class="le">${type.effect}</span></span><span class="lc">×${left}</span>`;
    body.append(row);
  }
  if (!snapshot.cells?.length) body.textContent = state.status || "宝藏准备中…";
  const nodes = [head, body];
  if (exhausted) {
    const note = document.createElement("div"); note.className = "sc-legend-note"; note.textContent = "全班前进：今天走够啦（本节课已 3 次）";
    nodes.push(note);
  }
  if (!state.locked) {
    const controls = document.createElement("div"); controls.className = "sc-legend-controls";
    const seg = document.createElement("div"); seg.className = "sc-seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "特效格数量");
    for (const [value, label] of [["few", "少"], ["normal", "中"], ["many", "多"]]) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.setAttribute("aria-pressed", String(state.density === value)); button.disabled = state.busy;
      button.addEventListener("click", () => handlers.onDensity?.(value));
      seg.append(button);
    }
    const densityRow = document.createElement("div"); densityRow.append("掉落数量 ", seg);
    const toggle = document.createElement("label");
    const box = document.createElement("input"); box.type = "checkbox"; box.checked = !state.multipliersEnabled; box.disabled = state.busy;
    box.addEventListener("change", () => handlers.onMultipliers?.(!box.checked));
    toggle.append(box, "只留全班格（关闭倍率类）");
    const buttons = document.createElement("div"); buttons.className = "sc-btn-row";
    const redraw = document.createElement("button"); redraw.type = "button"; redraw.className = "sc-btn"; redraw.textContent = "✨ 重新掉落";
    redraw.disabled = state.busy; redraw.addEventListener("click", () => handlers.onRedraw?.());
    const replay = document.createElement("button"); replay.type = "button"; replay.className = "sc-btn secondary"; replay.textContent = "↺ 重播";
    replay.disabled = state.busy || !snapshot.cells?.length; replay.addEventListener("click", () => handlers.onReplay?.());
    buttons.append(redraw, replay);
    controls.append(densityRow, toggle, buttons);
    if (state.status) { const status = document.createElement("div"); status.className = "sc-legend-status"; status.textContent = state.status; controls.append(status); }
    nodes.push(controls);
  }
  host.replaceChildren(...nodes);
}

function ensureLayer(className) {
  let layer = document.querySelector(`.${className}`);
  if (!layer) { layer = document.createElement("div"); layer.className = className; layer.hidden = true; document.body.append(layer); }
  return layer;
}

/** Big landing text, e.g. 「200 × 2 = 400！」. */
export function showSpecialCellBanner({ typeId, text, sub = "" }, { hold = 1800, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const type = SPECIAL_CELL_TYPE_BY_ID[typeId];
  const layer = ensureLayer("sc-banner");
  layer.setAttribute("role", "status");
  layer.innerHTML = `<div class="sc-banner-card" style="--c:${type.color};--g:${type.glow}"><div class="sc-banner-icon emo">${specialCellIconHtml(type.icon)}</div><div class="sc-banner-text"></div><div class="sc-banner-sub"></div></div>`;
  layer.querySelector(".sc-banner-text").textContent = text;
  layer.querySelector(".sc-banner-sub").textContent = sub;
  layer.hidden = false;
  return sleep(hold).then(() => { layer.hidden = true; });
}

/** 「老师有一个小挑战！」 with two big buttons; resolves with the server result. */
export function askSpecialCellGroupMove({ typeId, onDecision }) {
  const type = SPECIAL_CELL_TYPE_BY_ID[typeId];
  const layer = ensureLayer("sc-dialog");
  layer.setAttribute("role", "dialog"); layer.setAttribute("aria-modal", "true");
  layer.innerHTML = `<div class="sc-dialog-card"><div class="sc-dialog-icon emo">${specialCellIconHtml(type.icon)}</div>
    <div class="sc-dialog-title">老师有一个小挑战！</div>
    <div class="sc-dialog-sub">全班做到后点「完成」，大家一起${type.effect.replace("全班 +", "前进 ").replace(" 格", " 格")}</div>
    <div class="sc-dialog-actions"><button type="button" class="confirm">完成 ✓</button><button type="button" class="cancel">取消</button></div>
    <div class="sc-dialog-status" aria-live="polite"></div></div>`;
  layer.hidden = false;
  const confirm = layer.querySelector(".confirm"), cancel = layer.querySelector(".cancel"), status = layer.querySelector(".sc-dialog-status");
  confirm.focus({ preventScroll: true });
  return new Promise((resolve) => {
    const decide = async (decision) => {
      confirm.disabled = cancel.disabled = true; status.textContent = "";
      try { const result = await onDecision(decision); layer.hidden = true; resolve({ decision, result }); }
      catch (error) { status.textContent = error?.message || "未能保存，请再点一次"; confirm.disabled = cancel.disabled = false; }
    };
    confirm.addEventListener("click", () => decide("confirm"));
    cancel.addEventListener("click", () => decide("cancel"));
  });
}
