import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  routeChoiceLayout, routeChoiceTapAction, routeChoiceTagOffset, routeChoiceLandingText,
  createBoardRouteChoiceLayer, ROUTE_CHOICE_PILL,
} from "../public/prototypes/universal-board/board-route-choice.js";
import { tilePointsTier, tilePointsText, appendTilePoints, TILE_POINT_TIERS } from "../public/prototypes/universal-board/tile-points-visuals.js";
import { BOARD_TEMPLATES } from "../public/prototypes/universal-board/world-packs.js";
import { SPECIAL_CELL_TYPES } from "../public/prototypes/universal-board/special-cells-core.js";

const boardDir = new URL("../public/prototypes/universal-board/", import.meta.url);
const read = (name) => readFileSync(new URL(name, boardDir), "utf8");
const appSource = read("app.js");
const boardUiCss = read("board-ui.css");
const specialCss = read("special-cells.css");

// ---- tiny SVG DOM fake --------------------------------------------------------
function makeDom({ focusVisible = true } = {}) {
  const doc = { activeElement: null };
  class El {
    constructor(tag) {
      Object.assign(this, { tag, attrs: {}, children: [], listeners: {}, textContent: "", ownerDocument: doc, parentNode: null });
      this.cls = new Set();
      this.style = { setProperty: (key, value) => { this.style[key] = value; } };
      this.classList = {
        add: (...names) => names.forEach((name) => this.cls.add(name)),
        remove: (...names) => names.forEach((name) => this.cls.delete(name)),
        contains: (name) => this.cls.has(name),
        toggle: (name, on) => { const next = on === undefined ? !this.cls.has(name) : Boolean(on); if (next) this.cls.add(name); else this.cls.delete(name); return next; },
      };
    }
    setAttribute(key, value) { if (key === "class") this.cls = new Set(String(value).split(/\s+/).filter(Boolean)); else this.attrs[key] = String(value); }
    getAttribute(key) { return key === "class" ? [...this.cls].join(" ") : this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    hasAttribute(key) { return key in this.attrs; }
    toggleAttribute(key, on) { if (on) this.attrs[key] = ""; else delete this.attrs[key]; }
    append(...kids) { kids.forEach((kid) => { kid.parentNode = this; this.children.push(kid); }); }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    fire(name, event = {}) {
      const full = { defaultPrevented: false, propagationStopped: false, ...event };
      full.preventDefault = () => { full.defaultPrevented = true; };
      full.stopPropagation = () => { full.propagationStopped = true; };
      (this.listeners[name] || []).forEach((fn) => fn(full));
      return full;
    }
    focus() { doc.activeElement = this; this.fire("focus"); }
    matches() { return focusVisible; }
    all(predicate, found = []) { if (predicate(this)) found.push(this); this.children.forEach((kid) => kid.all(predicate, found)); return found; }
    byClass(name) { return this.all((el) => el.cls.has(name)); }
  }
  const svgElement = (tag, attributes = {}) => { const el = new El(tag); Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v)); return el; };
  doc.createElementNS = (_ns, tag) => new El(tag);
  return { doc, svgElement };
}

// ---- fork geometry across every fork in the current worlds 1 and 2 ------------
function forksOf(board) {
  const byId = new Map(board.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  board.edges.forEach((edge) => { if (!outgoing.has(edge.from)) outgoing.set(edge.from, []); outgoing.get(edge.from).push(edge); });
  return [...outgoing].filter(([, edges]) => edges.length > 1).map(([id, edges]) => ({
    id, junction: byId.get(id),
    options: edges.map((edge) => {
      const route = [edge.to];
      for (let k = 0; k < 2; k += 1) { const next = (outgoing.get(route.at(-1)) || [])[0]; if (!next) break; route.push(next.to); }
      const pts = route.map((nodeId) => byId.get(nodeId));
      return { edgeId: edge.id, firstNode: pts[0], probe: { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length } };
    }),
  }));
}

const CURRENT_BOARDS = ["ximitu-card-hunt-board.v1@2.3.0", "ximitu-card-hunt-world-02.v1@1.0.0"];

test("fork buttons: every fork in worlds 1 and 2 gets two labelled buttons beside the junction, inside the world", () => {
  const seen = [];
  for (const ref of CURRENT_BOARDS) {
    const board = BOARD_TEMPLATES[ref];
    assert.ok(board, ref);
    for (const fork of forksOf(board)) {
      const layout = routeChoiceLayout({ junction: fork.junction, options: fork.options, worldSize: board.worldSize });
      seen.push(fork.id);
      assert.equal(layout.buttons.length, 2, fork.id);
      const labels = layout.buttons.map((b) => b.label).sort().join("/");
      assert.ok(["上路/下路", "右路/左路"].includes(labels), `${fork.id}: ${labels}`);
      assert.notEqual(layout.buttons[0].color, layout.buttons[1].color);
      for (const button of layout.buttons) {
        const distance = Math.hypot(button.x - fork.junction.x, button.y - fork.junction.y);
        assert.ok(distance >= 100, `${fork.id} button too close to the pawn (${distance})`);
        assert.ok(button.x - ROUTE_CHOICE_PILL.width / 2 >= 0 && button.x + ROUTE_CHOICE_PILL.width / 2 <= board.worldSize.width, `${fork.id} x`);
        assert.ok(button.y - ROUTE_CHOICE_PILL.height / 2 >= 0 && button.y + ROUTE_CHOICE_PILL.height / 2 <= board.worldSize.height, `${fork.id} y`);
      }
      const [a, b] = layout.buttons;
      assert.ok(Math.abs(a.x - b.x) >= ROUTE_CHOICE_PILL.width || Math.abs(a.y - b.y) >= ROUTE_CHOICE_PILL.height, `${fork.id} buttons overlap`);
      // Button order on screen matches its label.
      const top = layout.orientation === "vertical" ? [...layout.buttons].sort((p, q) => p.y - q.y)[0] : [...layout.buttons].sort((p, q) => p.x - q.x)[0];
      assert.equal(top.label, layout.orientation === "vertical" ? "上路" : "左路", fork.id);
    }
  }
  for (const id of ["n04", "n10", "n21", "n29", "w2n04", "w2n18", "w2n32", "w2n36", "w2n45"]) assert.ok(seen.includes(id), `fork ${id} covered`);
});

test("fork buttons: n04 and n10 read 上路 / 下路 with the up branch first", () => {
  const board = BOARD_TEMPLATES["ximitu-card-hunt-board.v1@2.3.0"];
  const forks = Object.fromEntries(forksOf(board).map((fork) => [fork.id, fork]));
  for (const [id, up, down] of [["n04", "e04a", "e04b"], ["n10", "e10a", "e10b"]]) {
    const layout = routeChoiceLayout({ junction: forks[id].junction, options: forks[id].options, worldSize: board.worldSize });
    assert.equal(layout.orientation, "vertical");
    assert.deepEqual(Object.fromEntries(layout.buttons.map((b) => [b.edgeId, b.label])), { [up]: "上路", [down]: "下路" });
  }
});

test("touch: first tap previews, second tap on the same button confirms; mouse confirms at once", () => {
  assert.equal(routeChoiceTapAction({ pointerType: "touch", armedEdgeId: null, edgeId: "e04a" }), "arm");
  assert.equal(routeChoiceTapAction({ pointerType: "touch", armedEdgeId: "e04b", edgeId: "e04a" }), "arm");
  assert.equal(routeChoiceTapAction({ pointerType: "touch", armedEdgeId: "e04a", edgeId: "e04a" }), "confirm");
  assert.equal(routeChoiceTapAction({ pointerType: "pen", armedEdgeId: "e04a", edgeId: "e04a" }), "confirm");
  assert.equal(routeChoiceTapAction({ pointerType: "mouse", armedEdgeId: null, edgeId: "e04a" }), "confirm");
});

test("landing tag text and placement", () => {
  assert.equal(routeChoiceLandingText(300), "停在 +300");
  assert.equal(routeChoiceLandingText(undefined), "停在这里");
  assert.equal(routeChoiceTagOffset({ orientation: "vertical", rank: 0 }), -62);
  assert.equal(routeChoiceTagOffset({ orientation: "vertical", rank: 0, hasFloatingMarker: true }), -104);
  assert.equal(routeChoiceTagOffset({ orientation: "vertical", rank: 1 }), 50);
  assert.equal(routeChoiceTagOffset({ orientation: "horizontal", rank: 0 }), 50);
});

function buildLayer({ focusVisible = true } = {}) {
  const { doc, svgElement } = makeDom({ focusVisible });
  const confirmed = [], previews = [];
  const state = { previewEdgeId: null, armedEdgeId: null, selectedEdgeId: null };
  const routes = [
    { edgeId: "e04b", rank: 1, label: "下路", color: "#7b4fd6", x: 272, y: 488, angle: -21, edgePaths: ["M 0 0 L 1 1"], landing: { x: 680, y: 330 }, landingText: "停在 +100", ariaLabel: "下路" },
    { edgeId: "e04a", rank: 0, label: "上路", color: "#2fa35b", x: 272, y: 420, angle: -80, edgePaths: ["M 0 0 L 1 1"], landing: { x: 610, y: 280 }, landingText: "停在 +200", ariaLabel: "上路" },
  ];
  const ui = createBoardRouteChoiceLayer({ svgElement, junctionNodeId: "n04", routes, state,
    onPreview: (edgeId, reason) => previews.push([edgeId, reason]), onConfirm: (edgeId) => confirmed.push(edgeId) });
  const buttons = ui.layer.byClass("brc-button");
  const previewsEls = ui.previews.byClass("brc-preview");
  return { doc, ui, state, buttons, previewsEls, confirmed, previews };
}

test("on-map layer: buttons are real focusable buttons in on-screen order, both routes always previewed lightly", () => {
  const { ui, buttons, previewsEls } = buildLayer();
  assert.deepEqual(buttons.map((b) => b.getAttribute("data-route-choice-edge-id")), ["e04a", "e04b"]);
  buttons.forEach((b) => { assert.equal(b.getAttribute("role"), "button"); assert.equal(b.getAttribute("tabindex"), "0"); assert.ok(b.getAttribute("aria-label")); });
  assert.equal(previewsEls.length, 2, "both route previews are drawn");
  assert.equal(ui.layer.byClass("brc-preview-line").length, 0, "route lines live in the under-tile layer, not over the numbers");
  assert.equal(ui.layer.hasAttribute("data-has-preview"), false);
  const tags = ui.layer.byClass("brc-landing-tag").map((tag) => tag.byClass ? tag.all((el) => el.tag === "text")[0].textContent : "");
  assert.deepEqual(tags.sort(), ["停在 +100", "停在 +200"]);
});

test("on-map layer: mouse hover previews, click confirms through the existing handler", () => {
  const { buttons, confirmed, state, previewsEls } = buildLayer();
  buttons[1].fire("pointerenter", { pointerType: "mouse" });
  assert.equal(state.previewEdgeId, "e04b");
  assert.ok(buttons[1].cls.has("is-previewed") && previewsEls[1].cls.has("is-previewed") && !previewsEls[0].cls.has("is-previewed"));
  const down = buttons[1].fire("pointerdown", { pointerType: "mouse" });
  assert.ok(down.propagationStopped, "a press on a button never starts a board pan");
  buttons[1].fire("click", {});
  assert.deepEqual(confirmed, ["e04b"]);
});

test("on-map layer: touch needs two taps on the same button", () => {
  const { buttons, confirmed, state } = buildLayer();
  buttons[0].fire("pointerdown", { pointerType: "touch" }); buttons[0].fire("click", {});
  assert.equal(state.armedEdgeId, "e04a"); assert.ok(buttons[0].cls.has("is-armed")); assert.deepEqual(confirmed, []);
  buttons[1].fire("pointerdown", { pointerType: "touch" }); buttons[1].fire("click", {});
  assert.equal(state.armedEdgeId, "e04b"); assert.ok(!buttons[0].cls.has("is-armed")); assert.deepEqual(confirmed, []);
  buttons[1].fire("pointerdown", { pointerType: "touch" }); buttons[1].fire("click", {});
  assert.deepEqual(confirmed, ["e04b"]);
});

test("on-map layer: keyboard focus previews, arrows move between buttons, Enter/Space confirm", () => {
  const { buttons, confirmed, state, doc } = buildLayer();
  buttons[0].focus();
  assert.equal(state.previewEdgeId, "e04a");
  const arrow = buttons[0].fire("keydown", { key: "ArrowDown" });
  assert.ok(arrow.defaultPrevented && arrow.propagationStopped, "arrows do not pan the camera");
  assert.equal(doc.activeElement, buttons[1]); assert.equal(state.previewEdgeId, "e04b");
  buttons[1].fire("keydown", { key: "ArrowDown" });
  assert.equal(doc.activeElement, buttons[0], "wraps around");
  buttons[0].fire("keydown", { key: " " });
  buttons[0].fire("keydown", { key: "Enter" });
  assert.deepEqual(confirmed, ["e04a", "e04a"]);
});

test("on-map layer: programmatic (non-keyboard) focus does not preview; locked layer ignores input", () => {
  const { buttons, state } = buildLayer({ focusVisible: false });
  buttons[0].focus();
  assert.equal(state.previewEdgeId, null);
  const { svgElement } = makeDom();
  const confirmed = [];
  const locked = createBoardRouteChoiceLayer({ svgElement, junctionNodeId: "n04", state: { selectedEdgeId: "e04a" },
    routes: [{ edgeId: "e04a", rank: 0, label: "上路", color: "#000", x: 0, y: 0, angle: 0, edgePaths: [] }, { edgeId: "e04b", rank: 1, label: "下路", color: "#111", x: 0, y: 60, angle: 0, edgePaths: [] }],
    onConfirm: (edgeId) => confirmed.push(edgeId) });
  const lockedButtons = locked.layer.byClass("brc-button");
  lockedButtons[1].fire("click", {});
  assert.deepEqual(confirmed, []);
  assert.ok(locked.layer.cls.has("is-locked") && lockedButtons[0].cls.has("is-selected"));
  assert.equal(lockedButtons[1].getAttribute("tabindex"), "-1");
});

// ---- score A: points printed on tiles ------------------------------------------
test("tile tiers: 100 yellow / 200 green / 300 blue / 500 orange / 1000 purple", () => {
  assert.deepEqual([50, 100, 200, 300, 500, 1000, 3000].map((n) => tilePointsTier(n).id), ["t100", "t100", "t200", "t300", "t500", "t1000", "t1000"]);
  assert.equal(new Set(TILE_POINT_TIERS.map((tier) => tier.top)).size, TILE_POINT_TIERS.length);
  assert.equal(tilePointsText({ amount: 300 }), "300");
  assert.equal(tilePointsText({ amount: 200, transported: true }), "→200");
});

test("tile points: tints the stone, prints the number, and switches to the front tab under a pawn", () => {
  const { svgElement } = makeDom();
  const group = svgElement("g", { class: "board-space" });
  const token = svgElement("g", { class: "grounded-node" });
  const points = appendTilePoints(group, { svgElement, amount: 300, token, occupied: true });
  assert.ok(group.cls.has("has-tile-points") && group.cls.has("tile-tier-t300") && group.cls.has("has-tile-pawn"));
  assert.equal(token.style["--grounded-stone-top"], "#dbefff");
  assert.equal(group.style["--tile-ink"], "#1f4f86");
  assert.ok(points.cls.has("is-grounded"));
  const texts = points.all((el) => el.tag === "text").map((el) => el.textContent);
  assert.deepEqual(texts, ["300", "300"]);
  const classic = appendTilePoints(svgElement("g"), { svgElement, amount: 1000 });
  assert.ok(classic.cls.has("is-classic") && classic.cls.has("is-long"));
});

test("tile points CSS: number on the top face, tab only for classic tiles or under a pawn", () => {
  assert.match(boardUiCss, /\.tile-points\.is-grounded \.tile-points-tab \{ display: none; \}/);
  assert.match(boardUiCss, /\.has-tile-pawn \.tile-points\.is-grounded \.tile-points-face \{ display: none; \}/);
  assert.match(boardUiCss, /\.has-tile-pawn \.tile-points\.is-grounded \.tile-points-tab \{ display: inline; \}/);
});

// ---- bonus A: floating icon + coloured chip ---------------------------------------
test("bonus marker: icon floats above the tile with a coloured effect chip; rares sparkle", async () => {
  const { doc } = makeDom();
  globalThis.document = doc;
  const { specialCellMarker, specialCellShortLabel } = await import("../public/prototypes/universal-board/special-cells-board.js");
  for (const type of SPECIAL_CELL_TYPES) {
    const label = specialCellShortLabel(type.id);
    assert.ok(label && label.length <= 4, `${type.id}: ${label}`);
    assert.ok(!/^\d+$/.test(label), `${type.id} chip must not look like the tile's plain number`);
    const marker = specialCellMarker({ cellId: `c-${type.id}`, type: type.id });
    assert.equal(marker.getAttribute("data-special-cell-type"), type.id);
    assert.equal(marker.byClass("sc-marker-plate").length, 1, "intro comet target kept");
    assert.equal(marker.byClass("sc-marker-anchor")[0].getAttribute("transform"), "translate(0 -48)");
    const chip = marker.byClass("sc-marker-chip")[0];
    assert.equal(chip.all((el) => el.tag === "text")[0].textContent, label);
    assert.equal(marker.byClass("sc-marker-spark").length, type.rarity === 2 ? 4 : 0, type.id);
    assert.equal(marker.byClass("sc-marker-ring").length, 0, "no dashed ring around the tile any more");
  }
  assert.deepEqual(["star", "double", "crown", "bag", "reroll"].map(specialCellShortLabel), ["×1.5", "×2", "×3", "+100", "再掷"]);
  delete globalThis.document;
});

test("bonus chip is white-on-colour, tile number is ink-on-tint (never the same style)", () => {
  assert.match(specialCss, /\.sc-marker-chip \.sc-marker-chip-body \{ fill: var\(--sc-color\)/);
  assert.match(specialCss, /\.sc-marker-chip text \{ fill: #fff/);
  assert.match(boardUiCss, /\.tile-points-face \{[^}]*fill: var\(--tile-ink\)/);
});

// ---- motion + wiring ----------------------------------------------------------------
test("reduced motion: bob, sparkle, breathe and flow only run with no-preference", () => {
  const motionFree = (css) => css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
  for (const [name, css] of [["special-cells.css", specialCss], ["board-ui.css", boardUiCss]]) {
    const rest = motionFree(css);
    for (const keyframe of ["sc-bob", "sc-twinkle", "brc-breathe", "brc-flow", "sc-spin"]) {
      assert.ok(!new RegExp(`animation:[^;]*${keyframe}`).test(rest), `${name}: ${keyframe} must be behind no-preference`);
    }
  }
});

test("app wiring: points pill replaced, on-map choice owns the fork and the modal stays as fallback", () => {
  assert.doesNotMatch(appSource, /class: "node-platform-points"/);
  assert.match(appSource, /appendTilePoints\(group, \{/);
  assert.match(appSource, /const routeChoiceLayer = boardRouteChoiceLayer\(\);/);
  assert.match(appSource, /boardWorld\.insertBefore\(routeChoiceLayer\.previews, spaceLayer\);/);
  assert.match(appSource, /nodes\.routeChoiceStage\.hidden = Boolean\(boardChoice\);/);
  // The board buttons confirm by clicking the modal's own button → same lock/sound/resolve path.
  assert.match(appSource, /button\.dataset\.edgeId === edgeId\);\n\s*target\?\.click\(\);/);
  assert.match(appSource, /onBoard: composition\.worldRef === activeWorldComposition\.worldRef/);
  assert.match(read("index.html"), /board-ui\.css/);
});
