import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { appendGroundedNodeVisual } from "../public/prototypes/universal-board/grounded-node-visuals.js";
import { createGroundedRouteVisuals } from "../public/prototypes/universal-board/grounded-route-visuals.js";
import { crystalRouteSurfaces, CRYSTAL_TERRAIN_TONES } from "../public/prototypes/universal-board/crystal-terrain-visuals.js";
import {
  BOARD_TEMPLATE, THEME_PACKS, LEGACY_CLOUD_HARBOR_THEME_V2,
  PREVIOUS_BOARD_TEMPLATE_V21, PREVIOUS_CLOUD_HARBOR_THEME_V21,
} from "../public/prototypes/universal-board/packs.js";

class SvgElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.textContent = "";
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) { this.children.push(...children); }
}

const svgDocument = {
  createElementNS(namespace, tagName) {
    assert.equal(namespace, "http://www.w3.org/2000/svg");
    return new SvgElement(this, tagName);
  },
};

function svgElement(tagName, attributes = {}) {
  const element = svgDocument.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

function deepFreeze(value) {
  Object.values(value).forEach((child) => {
    if (child && typeof child === "object") deepFreeze(child);
  });
  return Object.freeze(value);
}

test("grounded roads preserve authoritative paths and keep DOM bounded as the route grows", () => {
  const paths = deepFreeze({
    stone: [
      { id: "curve", d: "M 12.25 45 C 19 -3 87 64 91 90" },
      { id: "line", d: "M 91 90 L 128.5 76" },
    ],
    timber: [{ id: "dock", d: "M 0 0 Q 8.2 9 12.25 45" }],
  });
  const before = JSON.stringify(paths);
  const options = { paths, prefix: "board-one", svgElement };
  const { defs, group } = createGroundedRouteVisuals(options);
  assert.equal(JSON.stringify(paths), before);
  assert.equal(group.children.length, 2);
  for (const material of group.children) {
    const entries = paths[material.getAttribute("data-route-material")];
    assert.equal(material.getAttribute("data-edge-ids"), entries.map(({ id }) => id).join(" "));
    assert.ok(material.children.length > 0 && material.children.length <= 6);
    for (const layer of material.children) {
      assert.equal(layer.tagName, "path");
      assert.equal(layer.getAttribute("d"), entries.map(({ d }) => d).join(" "));
      assert.equal(layer.getAttribute("transform"), null, "road surfaces must not move the centerline");
    }
  }
  const largePaths = deepFreeze(Object.fromEntries(Object.entries(paths).map(([material, entries]) => [
    material, Array.from({ length: 512 }, (_, index) => ({ ...entries[index % entries.length], id: `e${index}` })),
  ])));
  const large = createGroundedRouteVisuals({ ...options, paths: largePaths });
  assert.equal(descendants(large.group).length, descendants(group).length);
  assert.ok(descendants(group).length + descendants(defs).length <= 32);
  for (const decoration of [...descendants(defs), ...descendants(group)]) {
    assert.equal(decoration.getAttribute("pointer-events"), "none");
    assert.equal(decoration.getAttribute("aria-hidden"), "true");
    assert.equal(decoration.getAttribute("focusable"), "false");
    assert.equal(decoration.getAttribute("tabindex"), null);
  }
  const other = createGroundedRouteVisuals({ ...options, prefix: "board-two" });
  const ids = descendants(defs).map((element) => element.getAttribute("id")).filter(Boolean);
  const otherIds = descendants(other.defs).map((element) => element.getAttribute("id")).filter(Boolean);
  assert.equal(ids.some((id) => otherIds.includes(id)), false, "board textures need isolated SVG ids");
  assert.throws(() => createGroundedRouteVisuals({ ...options, prefix: "invalid prefix" }), TypeError);
});

test("ordinary stonework adds no reward object, input target or accessible duplicate", () => {
  const parent = svgElement("g", {
    role: "button", tabindex: "0", "aria-label": "普通道路", transform: "translate(80 520)",
    "pointer-events": "bounding-box", "data-node-id": "n01",
  });
  const attributes = [...parent.attributes];
  const input = deepFreeze({ kind: "coin", ordinary: true, facility: true, glyph: "1" });
  const token = appendGroundedNodeVisual(parent, input);
  assert.deepEqual([...parent.attributes], attributes);
  assert.equal(parent.children[0], token);
  assert.equal(token.getAttribute("aria-hidden"), "true");
  assert.ok(descendants(token).length <= 12);
  assert.equal(descendants(token).some((element) => /grounded-node-(?:object|mark)/.test(element.getAttribute("class") || "")), false);
  for (const element of descendants(token)) {
    assert.equal(element.getAttribute("pointer-events"), "none");
    assert.equal(element.getAttribute("role"), null);
    assert.equal(element.getAttribute("tabindex"), null);
    assert.equal(element.getAttribute("aria-label"), null);
    assert.ok(!["image", "a", "foreignObject"].includes(element.tagName));
  }
  const footprint = descendants(token).find((element) => element.getAttribute("class") === "grounded-node-footprint");
  assert.ok(footprint, "smaller art must retain the original complete-art hit bounds");
  assert.deepEqual(["x", "y", "width", "height"].map((name) => footprint.getAttribute(name)), ["-31", "-31", "62", "62"]);
  assert.equal(footprint.getAttribute("opacity"), "0");
});

test("special node visuals remain small noninteractive geometry without duplicating facility artwork", () => {
  for (const kind of ["coin", "gem", "star", "junction", "foghorn", "cloud-gate", "transport", "item", "portal"]) {
    const parent = svgElement("g");
    const input = deepFreeze({ kind, ordinary: false, facility: ["foghorn", "cloud-gate", "transport"].includes(kind) });
    const token = appendGroundedNodeVisual(parent, input);
    assert.ok(descendants(token).length <= 20, `${kind} must stay bounded`);
    for (const decoration of descendants(token)) {
      assert.equal(decoration.getAttribute("pointer-events"), "none");
      assert.equal(decoration.getAttribute("tabindex"), null);
      assert.ok(!["image", "foreignObject"].includes(decoration.tagName));
    }
    if (input.facility) {
      assert.equal(descendants(token).some((element) => (element.getAttribute("class") || "").includes("grounded-node-object")), false);
    }
  }
});

test("crystal presentation covers four terrain regions while the previous board retains its first-zone sample", () => {
  const theme = THEME_PACKS["cloud-harbor"];
  const scene = theme.scenePresentation;
  assert.equal(scene.boardRef, `${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}`);
  assert.deepEqual(scene.zoneIds, BOARD_TEMPLATE.zones.map(({ id }) => id));
  assert.deepEqual(PREVIOUS_CLOUD_HARBOR_THEME_V21.scenePresentation.zoneIds, ["zone-01"]);
  assert.equal(Object.hasOwn(LEGACY_CLOUD_HARBOR_THEME_V2, "scenePresentation"), false);
  for (const other of Object.values(THEME_PACKS).filter((entry) => entry !== theme)) {
    assert.equal(Object.hasOwn(other, "scenePresentation"), false);
  }
  for (const id of scene.timberEdgeIds) assert.ok(BOARD_TEMPLATE.edges.some((edge) => edge.id === id));
  for (const id of scene.facilityNodeIds) assert.ok(BOARD_TEMPLATE.nodes.some((node) => node.id === id));

  // Exercise the real renderer guard without booting its browser/application dependencies.
  const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
  const selection = app.match(/function groundedSceneSelection\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(selection);
  const nodes = deepFreeze([{ id: "first", zoneId: "zone-01" }, { id: "second", zoneId: "zone-02" }]);
  const select = (activeBoardTemplate, selectedTheme = theme) => runInNewContext(`${selection}; groundedSceneSelection()`, {
    theme: selectedTheme, activeBoardTemplate, visualBoardTemplate: { nodes },
    activeNodePresentation: (id) => nodes.find((node) => node.id === id),
  });
  assert.deepEqual([...select(BOARD_TEMPLATE).nodeIds], ["first", "second"]);
  assert.deepEqual([...select(PREVIOUS_BOARD_TEMPLATE_V21, PREVIOUS_CLOUD_HARBOR_THEME_V21).nodeIds], ["first"]);
  for (const incompatible of [
    { ...BOARD_TEMPLATE, version: "2.0.0" },
    { ...BOARD_TEMPLATE, id: "another-board" },
  ]) {
    const result = select(incompatible);
    assert.equal(result.scene, null);
    assert.equal(result.nodeIds.size, 0);
  }
  assert.equal(select(BOARD_TEMPLATE, LEGACY_CLOUD_HARBOR_THEME_V2).nodeIds.size, 0);
});

test("terrain transitions preserve paths and interpolate from the actual endpoint colors", () => {
  const nodes = deepFreeze([
    { id: "a", x: 1100, y: 200, zoneId: "zone-01" },
    { id: "b", x: 1300, y: 210, zoneId: "zone-02" },
    { id: "c", x: 1400, y: 260, zoneId: "zone-02" },
  ]);
  const edges = deepFreeze([
    { id: "seam", from: "a", to: "b", pathData: "M 1100 200 C 1180 210 1210 190 1300 210" },
    { id: "grass", from: "b", to: "c", pathData: "M 1300 210 L 1400 260" },
  ]);
  const before = JSON.stringify({ nodes, edges });
  const surfaces = crystalRouteSurfaces({
    edges, nodeById: new Map(nodes.map((node) => [node.id, node])),
    zoneForNode: (node) => node.zoneId, edgePath: (edge) => edge.pathData,
  });
  assert.deepEqual(surfaces.flatMap(({ entries }) => entries.map(({ id }) => id)).sort(), ["grass", "seam"]);
  const { defs, group } = createGroundedRouteVisuals({ prefix: "terrain-test", surfaces, svgElement });
  const gradients = descendants(defs).filter((element) => element.tagName === "linearGradient");
  assert.equal(gradients.length, 4);
  for (const gradient of gradients) {
    assert.deepEqual(["x1", "y1", "x2", "y2"].map((name) => gradient.getAttribute(name)), ["1100", "200", "1300", "210"]);
    const tone = gradient.getAttribute("id").split("-").at(-1);
    assert.equal(gradient.children[0].getAttribute("stop-color"), CRYSTAL_TERRAIN_TONES["zone-01"][tone]);
    assert.equal(gradient.children[1].getAttribute("stop-color"), CRYSTAL_TERRAIN_TONES["zone-02"][tone]);
  }
  for (const material of group.children) {
    const edge = edges.find(({ id }) => id === material.getAttribute("data-edge-ids"));
    for (const path of material.children) assert.equal(path.getAttribute("d"), edge.pathData);
  }
  assert.equal(JSON.stringify({ nodes, edges }), before);
});
