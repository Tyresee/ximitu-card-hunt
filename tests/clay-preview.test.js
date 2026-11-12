import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import {
  isClayPreviewRequest, withClayPreviewTheme, appendClayPreviewTile,
  appendClayRouteMaterial, appendClayRoutePavers, installClayPreviewDemo,
} from "../public/prototypes/universal-board/clay-preview.js";
import { WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, CRYSTAL_V121_WORLD_REF, BEYOND_CLOUD_WORLD_REF } from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";
import { fitCameraViewport, viewportSize, cameraBounds, clampCamera, centerCameraOnPoint, isPointVisible }
  from "../public/prototypes/universal-board/camera-core.js";

const root = new URL("../", import.meta.url);
const composition = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
const location = (hostname = "127.0.0.1", search = "?visualPreview=clay") => ({ hostname, search });
const appSource = readFileSync(new URL("public/prototypes/universal-board/app.js", root), "utf8");

function appFunction(name) {
  const begin = appSource.indexOf(`function ${name}(`);
  const end = appSource.indexOf("\n}\n", begin) + 2;
  assert.ok(begin >= 0 && end > begin, name);
  return appSource.slice(begin, end);
}

test("clay visuals require an explicit loopback URL and never activate on production or the editor", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.equal(isClayPreviewRequest(location(host)), true);
    assert.equal(isClayPreviewRequest(location(host, "?visualPreview=clay&demo=1")), true);
    for (const query of ["", "?visualPreview=paper", "?visualPreview=Clay", "?visualPreview=clay&layoutEditor=1"]) {
      assert.equal(isClayPreviewRequest(location(host, query)), false, `${host}${query}`);
    }
  }
  for (const host of ["wordattack.timclass.cn", "127.0.0.1.evil.test", "localhost.example", "192.168.1.2", ""]) {
    assert.equal(isClayPreviewRequest(location(host)), false, host);
  }
  assert.equal(isClayPreviewRequest(null), false);
});

test("the opt-in skin copies only display assets, retaining registered identity and exact board data", () => {
  const theme = composition.theme;
  const before = JSON.stringify({ theme, board: composition.board, level: composition.level });
  const preview = withClayPreviewTheme(theme, { board: composition.board, enabled: true });
  assert.notEqual(preview, theme);
  assert.equal(preview.id, theme.id);
  assert.equal(preview.version, theme.version);
  assert.equal(preview.clayPreview, true);
  const visualKeys = new Set(["regionArt", "routeSkin"]);
  for (const key of Object.keys(theme)) if (!visualKeys.has(key)) assert.equal(preview[key], theme[key], key);
  assert.deepEqual(Object.keys(preview.regionArt), Object.keys(theme.regionArt));
  for (const [id, art] of Object.entries(theme.regionArt)) {
    assert.notEqual(preview.regionArt[id], art);
    assert.match(preview.regionArt[id].assetRef, /^\/assets\/board-themes\/cloud-harbor\/clay-preview\/regions\//);
    for (const key of Object.keys(art)) if (!["assetRef", "transitionFill"].includes(key)) {
      assert.equal(preview.regionArt[id][key], art[key], `${id}.${key}`);
    }
  }
  assert.equal(JSON.stringify({ theme, board: composition.board, level: composition.level }), before);
  assert.equal(withClayPreviewTheme(theme, { board: composition.board }), theme, "normal pages do not acquire preview assets");
  for (const ref of [CRYSTAL_V121_WORLD_REF, BEYOND_CLOUD_WORLD_REF]) {
    const other = resolveWorldComposition(ref, WORLD_REGISTRIES);
    assert.equal(withClayPreviewTheme(other.theme, { board: other.board, enabled: true }), other.theme,
      "archived geometry and other worlds keep their original art");
  }
});

test("the real clay camera changes only its fitted desktop display box, preserving mobile, normal, editor and board geometry", () => {
  const board = composition.board;
  const before = JSON.stringify(board);
  const start = board.nodes.find(node => node.id === board.startNodeId);
  const startZone = board.zones.find(({ bounds }) => start.x >= bounds.x && start.x <= bounds.x + bounds.width
    && start.y >= bounds.y && start.y <= bounds.y + bounds.height);
  const focus = startZone ? { x: startZone.bounds.x + startZone.bounds.width / 2,
    y: startZone.bounds.y + startZone.bounds.height / 2 } : start;
  for (const { width, height, clayPreview, editorActive } of [
    { width: 1440, height: 900, clayPreview: true, editorActive: false },
    { width: 700, height: 900, clayPreview: true, editorActive: false },
    { width: 699, height: 844, clayPreview: true, editorActive: false },
    { width: 390, height: 844, clayPreview: true, editorActive: false },
    { width: 1440, height: 900, clayPreview: false, editorActive: false },
    { width: 1440, height: 900, clayPreview: false, editorActive: true },
  ]) {
    const context = { visualBoardTemplate: board, activeBoardTemplate: board,
      nodeById: new Map(board.nodes.map(node => [node.id, node])), theme: { clayPreview },
      cameraCanvasSize: { width, height }, layoutEditor: { active: editorActive },
      fitCameraViewport, viewportSize, cameraBounds, clampCamera, centerCameraOnPoint, isPointVisible };
    for (const name of ["cameraBoardTemplate", "initialBoardCamera"]) runInNewContext(appFunction(name), context);
    const display = context.cameraBoardTemplate();
    const fitted = editorActive ? board : fitCameraViewport(board, width, height);
    const cropped = clayPreview && width >= 700;
    if (editorActive) assert.equal(display, board, "the editor retains its exact canvas object");
    assert.deepEqual([...display.viewBox], cropped
      ? [0, 0, fitted.viewBox[2] * .94, fitted.viewBox[3] * .94] : [...fitted.viewBox]);
    assert.equal(display.viewBox[0], 0, "the display crop never introduces a negative world origin");
    assert.equal(display.viewBox[1], 0);
    for (const key of Object.keys(board)) if (key !== "viewBox") assert.equal(display[key], board[key], key);
    const preferred = centerCameraOnPoint(focus, display);
    const expectedInitial = cropped
      ? clampCamera({ x: 0, y: start.y - viewportSize(display).height * .585 }, cameraBounds(display))
      : isPointVisible(start, preferred, display, 80) ? preferred : centerCameraOnPoint(start, display);
    assert.deepEqual(context.initialBoardCamera(), expectedInitial);
    assert.equal(JSON.stringify(board), before, "camera derivation never changes saved nodes, paths, world bounds or rules");
  }
  const editor = { visualBoardTemplate: board, layoutEditor: { active: true }, theme: { clayPreview: true },
    cameraCanvasSize: { width: 1440, height: 900 }, fitCameraViewport };
  runInNewContext(appFunction("cameraBoardTemplate"), editor);
  assert.equal(editor.cameraBoardTemplate(), board, "entering the editor also bypasses an already active clay display crop");
});

class SvgElement extends EventTarget {
  constructor(tagName, attrs = {}) {
    super(); this.tagName = tagName; this.attrs = new Map(); this.children = []; this.parentNode = null;
    for (const [key, value] of Object.entries(attrs)) this.setAttribute(key, value);
    const tokens = () => new Set((this.getAttribute("class") || "").split(/\s+/).filter(Boolean));
    this.classList = {
      add: (...names) => { const s = tokens(); names.forEach(n => s.add(n)); this.setAttribute("class", [...s].join(" ")); },
      remove: (...names) => { const s = tokens(); names.forEach(n => s.delete(n)); this.setAttribute("class", [...s].join(" ")); },
      contains: name => tokens().has(name),
    };
  }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  removeAttribute(key) { this.attrs.delete(key); }
  append(...nodes) { nodes.forEach(node => { node.parentNode = this; this.children.push(node); }); }
  insertBefore(node, sibling) {
    const i = this.children.indexOf(sibling); node.parentNode = this;
    if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
  }
  get firstChild() { return this.children[0] || null; }
  after(node) { this.parentNode.insertBefore(node, this.parentNode.children[this.parentNode.children.indexOf(this) + 1]); }
  cloneNode() { return new SvgElement(this.tagName, Object.fromEntries(this.attrs)); }
}
const svgElement = (tag, attrs) => new SvgElement(tag, attrs);

function tileFixture() {
  const group = svgElement("g", { class: "board-space has-tile-points", "data-node-id": "n03", tabindex: "0",
    transform: "translate(240 520)", "aria-label": "最终停格可得 1000 家园积分", role: "button" });
  const hit = svgElement("path", { class: "space-hit-area", d: "M -31 -31 H 31 V 31 H -31 Z" });
  const stone = svgElement("g", { class: "grounded-node" });
  const number = svgElement("text", { class: "tile-points-face" }); number.textContent = "1000";
  group.append(hit, stone, number);
  return { group, hit, stone, number };
}

test("a clay tile keeps original hit, focus, coordinates and live number; fallback remains until a successful load", () => {
  const { group, hit, stone, number } = tileFixture();
  const before = Object.fromEntries([...group.attrs].filter(([name]) => name !== "class"));
  const art = appendClayPreviewTile(group, { svgElement, amount: 1000, valueScale: 5, enabled: true });
  assert.equal(art.getAttribute("href"), "/assets/board-themes/cloud-harbor/clay-preview/tiles/points-1000-v3.webp");
  assert.equal(art.getAttribute("pointer-events"), "none");
  assert.equal(art.getAttribute("aria-hidden"), "true");
  assert.equal(art.getAttribute("tabindex"), null);
  assert.deepEqual(["x", "y", "width", "height"].map(k => art.getAttribute(k)), ["-37", "-28", "74", "56"]);
  assert.equal(group.classList.contains("has-clay-tile"), false, "old stone is the loading fallback");
  assert.equal(group.classList.contains("has-engraved-tile"), false, "live number remains until the exact numbered asset loads");
  art.dispatchEvent(new Event("load"));
  assert.equal(group.classList.contains("has-clay-tile"), true);
  assert.equal(group.classList.contains("has-engraved-tile"), true);
  assert.ok(group.children.includes(hit) && group.children.includes(stone) && group.children.includes(number));
  assert.equal(number.textContent, "1000");
  assert.deepEqual(Object.fromEntries([...group.attrs].filter(([name]) => name !== "class")), before);
  art.dispatchEvent(new Event("error"));
  assert.equal(group.classList.contains("has-clay-tile"), false, "an asset failure restores the original stone");
  assert.equal(group.classList.contains("has-engraved-tile"), false, "failure also restores the live amount");
  assert.equal(art.getAttribute("href"), null);
  assert.equal(group.children.length, 4, "error neither rebuilds the board nor removes the original node");
  art.dispatchEvent(new Event("load"));
  assert.equal(group.classList.contains("has-clay-tile"), false, "a failed image cannot hide fallback through a late repeated load");
});

test("all five point tiers keep their existing meanings, and normal rendering makes no optional tile image", () => {
  const disabled = tileFixture();
  assert.equal(appendClayPreviewTile(disabled.group, { svgElement: () => assert.fail("disabled skin must not create nodes"), amount: 1000 }), null);
  assert.equal(disabled.group.children.length, 3);
  for (const [base, color] of [[100, "yellow"], [200, "green"], [300, "blue"], [500, "orange"], [1000, "purple"]]) {
    for (const [amount, valueScale] of [[base, 1], [base * 5, 5]]) {
      const art = appendClayPreviewTile(tileFixture().group, { svgElement, amount, valueScale, enabled: true });
      const asset = valueScale === 5 ? `points-${amount}-v3` : `${color}-v2`;
      assert.ok(art.getAttribute("href").endsWith(`/tiles/${asset}.webp`));
    }
  }
  const unsupported = tileFixture();
  const fallback = appendClayPreviewTile(unsupported.group, { svgElement, amount: 777, valueScale: 5, enabled: true });
  assert.ok(fallback.getAttribute("href").endsWith("/tiles/yellow-v2.webp"), "unrecognized amounts never borrow a different printed value");
  fallback.dispatchEvent(new Event("load"));
  assert.equal(unsupported.group.classList.contains("has-engraved-tile"), false);
});

test("clay road material reuses the exact authored path and stays decorative", () => {
  const group = svgElement("g");
  const path = svgElement("path", { class: "grounded-route-surface", d: "M 10 20 C 35 40 60 70 80 90",
    "pointer-events": "none", "aria-hidden": "true", "stroke-width": "24" });
  group.append(path);
  const before = [...path.attrs];
  group.querySelectorAll = selector => {
    assert.equal(selector, ".grounded-route-stone > .grounded-route-surface"); return [path];
  };
  appendClayRouteMaterial(group);
  assert.deepEqual([...path.attrs], before);
  assert.equal(group.children.length, 2);
  const texture = group.children[1];
  assert.equal(texture.getAttribute("d"), path.getAttribute("d"));
  assert.equal(texture.getAttribute("stroke-width"), path.getAttribute("stroke-width"));
  assert.equal(texture.getAttribute("pointer-events"), "none");
  assert.equal(texture.getAttribute("aria-hidden"), "true");
  assert.equal(texture.getAttribute("tabindex"), null);
  assert.equal(texture.getAttribute("stroke"), "url(#route-texture-pattern)");
});

function paverFixture(paths, geometryByPath) {
  const group = svgElement("g", { class: "grounded-routes", "data-rules-owner": "unchanged" });
  const base = paths.map(({ id, d }) => svgElement("path", { class: "grounded-route-surface", d, "data-edge-id": id }));
  group.append(...base);
  const before = base.map(path => [...path.attrs]);
  const probes = [];
  const make = (tag, attrs) => {
    const element = svgElement(tag, attrs);
    if (tag === "path" && geometryByPath.has(attrs.d)) {
      const geometry = geometryByPath.get(attrs.d);
      element.getTotalLength = () => geometry.length;
      element.getPointAtLength = distance => {
        assert.ok(distance >= 0 && distance <= geometry.length, "sampling stays inside the authored edge");
        return geometry.point(distance);
      };
      probes.push(element);
    }
    return element;
  };
  const layer = appendClayRoutePavers(group, { svgElement: make, paths });
  return { group, base, before, layer, probes };
}

function stampTransform(image) {
  const match = image.getAttribute("transform").match(/^translate\(([-.\d]+) ([-.\d]+)\) rotate\(([-.\d]+)\)$/);
  assert.ok(match, "paver position and tangent use SVG transforms");
  return { x: Number(match[1]), y: Number(match[2]), angle: Number(match[3]) };
}

test("paver stamps cover each real edge's endpoints without joining disconnected paths or changing its geometry", () => {
  const horizontal = "M 10 20 L 186 20", vertical = "M 1010 520 L 1010 696";
  const paths = [{ id: "edge-left", d: horizontal }, { id: "edge-remote", d: vertical }];
  const snapshot = structuredClone(paths);
  const f = paverFixture(paths, new Map([
    [horizontal, { length: 176, point: distance => ({ x: 10 + distance, y: 20 }) }],
    [vertical, { length: 176, point: distance => ({ x: 1010, y: 520 + distance }) }],
  ]));
  assert.deepEqual(paths, snapshot);
  assert.deepEqual(f.base.map(path => [...path.attrs]), f.before, "the real road keeps every authored attribute");
  assert.equal(f.probes.length, 2, "each disconnected edge gets its own geometry probe");
  assert.equal(f.layer.children.length, 4);
  for (const id of paths.map(path => path.id)) {
    const images = f.layer.children.filter(image => image.getAttribute("data-edge-id") === id);
    assert.equal(images.length, 2);
    const positions = images.map(stampTransform);
    const expectedAngle = id === "edge-left" ? 0 : 90;
    for (const [i, image] of images.entries()) {
      assert.equal(image.getAttribute("pointer-events"), "none");
      assert.equal(image.getAttribute("aria-hidden"), "true");
      assert.equal(image.getAttribute("tabindex"), null);
      assert.equal(image.getAttribute("preserveAspectRatio"), "xMidYMid slice", "paver art crops to its stamp without stretching");
      assert.equal(positions[i].angle, expectedAngle);
      assert.ok(positions[i].x < 200 || positions[i].x === 1010, "no decoration bridges the gap between paths");
    }
    const centers = positions.map(point => id === "edge-left" ? point.x : point.y);
    const endpoints = id === "edge-left" ? [10, 186] : [520, 696];
    const widths = images.map(image => Number(image.getAttribute("width")));
    assert.ok(centers[0] - widths[0] / 2 <= endpoints[0], "the first paver reaches the source endpoint");
    assert.ok(centers[1] + widths[1] / 2 >= endpoints[1], "the last paver reaches the target endpoint");
    assert.ok(centers[0] + widths[0] / 2 >= centers[1] - widths[1] / 2, "neighboring stamps leave no seam gap");
    assert.ok(endpoints[0] - (centers[0] - widths[0] / 2) <= 4, "endpoint overscan stays decorative and small");
    assert.ok(centers[1] + widths[1] / 2 - endpoints[1] <= 4);
  }
});

test("pavers follow actual curved path samples and local tangents rather than endpoint interpolation", () => {
  const d = "M 40 0 A 40 40 0 0 1 0 40", length = Math.PI * 20;
  const f = paverFixture([{ id: "curve", d }], new Map([[d, { length,
    point: distance => ({ x: 40 * Math.cos(distance / 40), y: 40 * Math.sin(distance / 40) }) }]]));
  assert.equal(f.layer.children.length, 1);
  const point = stampTransform(f.layer.children[0]);
  assert.ok(Math.abs(point.x - Math.sqrt(800)) < 1e-9);
  assert.ok(Math.abs(point.y - Math.sqrt(800)) < 1e-9);
  assert.ok(Math.abs(point.angle - 135) < 1e-9);
  assert.notEqual(point.x, 20, "the true arc midpoint is not the straight chord midpoint");
});

test("paver art activates only when the entire layer loads and any failure permanently restores its base road", () => {
  const d = "M 0 0 L 200 0";
  const make = () => paverFixture([{ id: "edge", d }], new Map([[d, { length: 200, point: x => ({ x, y: 0 }) }]]));
  for (const failureTiming of ["before-ready", "after-ready"]) {
    const f = make(), images = f.layer.children;
    assert.equal(f.layer.getAttribute("opacity"), "0");
    assert.equal(f.group.classList.contains("has-clay-pavers"), false);
    assert.equal(images.length, 3);
    assert.equal(f.layer.getAttribute("aria-hidden"), "true");
    assert.equal(f.layer.getAttribute("pointer-events"), "none");
    for (const image of images) assert.ok(image.getAttribute("href").endsWith("/routes/clay-pavers-section-v1.webp"));
    images[0].dispatchEvent(new Event("load"));
    assert.equal(f.group.classList.contains("has-clay-pavers"), false, "one loaded image cannot hide parts of the fallback");
    if (failureTiming === "after-ready") {
      images.slice(1).forEach(image => image.dispatchEvent(new Event("load")));
      assert.equal(f.layer.getAttribute("opacity"), "1");
      assert.equal(f.group.classList.contains("has-clay-pavers"), true);
    }
    images[1].dispatchEvent(new Event("error"));
    images.forEach(image => image.dispatchEvent(new Event("load")));
    assert.equal(f.layer.getAttribute("opacity"), "0");
    assert.equal(f.group.classList.contains("has-clay-pavers"), false, "late loads cannot hide the restored fallback");
    assert.deepEqual(f.base.map(path => [...path.attrs]), f.before);
    assert.ok(f.base.every(path => f.group.children.includes(path)), "failure never removes the original road");
    assert.equal(f.group.getAttribute("data-rules-owner"), "unchanged");
  }
});

test("missing path geometry and zero-length edges leave the base route as-is", () => {
  const paths = [{ id: "unavailable", d: "M 10 20 L 20 20" }, { id: "zero", d: "M 30 40" }];
  const f = paverFixture(paths, new Map([[paths[1].d, { length: 0, point: () => assert.fail("zero length cannot be sampled") }]]));
  assert.equal(f.layer, null);
  assert.equal(f.group.children.length, paths.length);
  assert.deepEqual(f.base.map(path => [...path.attrs]), f.before);
  assert.equal(f.group.classList.contains("has-clay-pavers"), false);
});

function demoFixture({ loc = location("localhost", "?visualPreview=clay&demo=1"), state } = {}) {
  state ||= { ready: false, students: [{ id: "pupil-a" }, { id: "pupil-b" }, { id: "pupil-c" }], gameSession: null, hasCurrentSave: false };
  const queue = [], calls = [], instances = [], body = {};
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnects = 0; instances.push(this); }
    observe(element, options) { assert.equal(element, body); assert.deepEqual(options, { childList: true, subtree: true }); }
    disconnect() { this.disconnects++; }
  }
  const observer = installClayPreviewDemo({ location: loc, getState: () => state,
    start: students => calls.push(students), documentRef: { body }, Observer, defer: fn => queue.push(fn) });
  const flush = () => { while (queue.length) queue.shift()(); };
  return { observer, state, calls, instances, queue, flush };
}

test("fixture auto-start waits for readiness and uses only two existing synthetic pupils exactly once", () => {
  const f = demoFixture(); f.flush();
  assert.deepEqual(f.calls, []);
  f.state.ready = true;
  f.observer.callback(); f.observer.callback();
  assert.equal(f.queue.length, 1, "repeated DOM mutations queue only one start check");
  f.flush();
  assert.deepEqual(f.calls, [f.state.students.slice(0, 2)]);
  assert.equal(f.observer.disconnects, 1);
  f.observer.callback(); f.flush();
  assert.equal(f.calls.length, 1);
});

test("fixture convenience never overwrites a live or saved game, and is absent without both local opt-ins", () => {
  for (const saved of [{ hasCurrentSave: true }, { gameSession: { sessionId: "original-game" } }]) {
    const f = demoFixture({ state: { ready: true, students: [{ id: "a" }, { id: "b" }], ...saved } });
    f.flush(); assert.deepEqual(f.calls, []); assert.equal(f.observer.disconnects, 1);
  }
  for (const loc of [location("wordattack.timclass.cn", "?visualPreview=clay&demo=1"),
    location("localhost", "?demo=1"), location("localhost"), location("localhost", "?visualPreview=clay&demo=1&layoutEditor=1")]) {
    const f = demoFixture({ loc }); assert.equal(f.observer, null); assert.deepEqual(f.instances, []); f.flush(); assert.deepEqual(f.calls, []);
  }
});

function webpInfo(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString("ascii", offset, offset + 4), size = buffer.readUInt32LE(offset + 4), data = offset + 8;
    if (type === "VP8X") return { width: buffer.readUIntLE(data + 4, 3) + 1,
      height: buffer.readUIntLE(data + 7, 3) + 1, alpha: Boolean(buffer[data] & 0x10) };
    if (type === "VP8 ") return { width: buffer.readUInt16LE(data + 6) & 0x3fff,
      height: buffer.readUInt16LE(data + 8) & 0x3fff, alpha: false };
    if (type === "VP8L") { const bits = buffer.readUInt32LE(data + 1); return {
      width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: Boolean(bits & 0x10000000) }; }
    offset = data + size + (size % 2);
  }
  assert.fail("WebP has no supported image header");
}

test("referenced clay assets exist, region crops match the unchanged art boxes, and tile alpha metadata is verified", () => {
  const theme = withClayPreviewTheme(composition.theme, { board: composition.board, enabled: true });
  for (const region of composition.board.artRegions) {
    const path = new URL(`public${theme.regionArt[region.id].assetRef}`, root);
    const info = webpInfo(readFileSync(path));
    const rasterDensity = region.id === "region-zone-01" ? 2 : 1;
    assert.deepEqual([info.width, info.height], [region.artBox.width * rasterDensity, region.artBox.height * rasterDensity],
      `${region.id}: raster density preserves the exact authored art-box aspect`);
  }
  const route = webpInfo(readFileSync(new URL(`public${theme.routeSkin.textureAssetRef}`, root)));
  assert.equal(route.width, route.height); assert.ok(route.width >= 256);
  const manifest = JSON.parse(readFileSync(new URL("art-source/cloud-harbor/clay-preview/tiles/manifest-v2.json", root), "utf8"));
  assert.equal(manifest.outputs.length, 5);
  for (const asset of manifest.outputs) {
    const bytes = readFileSync(new URL(asset.file, root));
    assert.deepEqual(webpInfo(bytes), { width: 320, height: 240, alpha: true });
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, asset.name);
    assert.ok(asset.assetRef.endsWith(`/tiles/${asset.name}-v2.webp`));
  }
  const engraved = JSON.parse(readFileSync(new URL("art-source/cloud-harbor/clay-preview/tiles/manifest-v3.json", root), "utf8"));
  assert.deepEqual(engraved.outputs.map(asset => [asset.amount, asset.color]),
    [[500, "yellow"], [1000, "green"], [1500, "blue"], [2500, "orange"], [5000, "purple"]]);
  for (const asset of engraved.outputs) {
    const bytes = readFileSync(new URL(asset.file, root));
    assert.deepEqual(webpInfo(bytes), { width: 320, height: 240, alpha: true });
    assert.equal(asset.valueScale, 5);
    assert.equal(asset.numeralText, String(asset.amount));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    assert.ok(asset.assetRef.endsWith(`/tiles/points-${asset.amount}-v3.webp`));
  }
  const paver = JSON.parse(readFileSync(new URL("art-source/cloud-harbor/clay-preview/routes/paver-manifest-v1.json", root), "utf8"));
  const bytes = readFileSync(new URL(paver.output.file, root));
  assert.deepEqual(webpInfo(bytes), { width: 720, height: 180, alpha: true });
  assert.equal(createHash("sha256").update(bytes).digest("hex"), paver.output.sha256);
  assert.ok(paver.output.assetRef.endsWith("/routes/clay-pavers-section-v1.webp"));
});

test("local visual styles remain opt-in, exclude the editor, and cannot restyle the locked dice or add SVG filters", () => {
  for (const name of ["clay-preview.css", "clay-board.css"]) {
    const css = readFileSync(new URL(`public/prototypes/universal-board/${name}`, root), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(css, /physical-die|dice-roll|dice-stage|dice-board-result|dice-overlay/);
    assert.doesNotMatch(css, /(?:^|[;{\s])(?:backdrop-)?filter\s*:/m);
    for (const match of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const selector = match[1].trim();
      assert.ok(selector.includes('body[data-visual-preview="clay"]'), `${name}: ${selector}`);
      assert.ok(selector.includes(':not([data-layout-editor-active="true"])'), `${name}: ${selector}`);
    }
  }
  const boardCss = readFileSync(new URL("public/prototypes/universal-board/clay-board.css", root), "utf8");
  const hidingRules = [...boardCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector, body]) => selector.includes("has-clay-tile") && /visibility\s*:\s*hidden/.test(body));
  assert.ok(hidingRules.length > 0, "loaded raster art must hide the old stone while loading/error leaves it visible");
  for (const [, selector] of hidingRules) assert.match(selector.trim(), /\.grounded-node-stone$/,
    "the loaded skin must retain the footprint, junction/portal marks and live point text");
});
