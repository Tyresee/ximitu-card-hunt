import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { appendHarborLightHost } from "../public/prototypes/universal-board/harbor-light-host.js";
import { isCurrentCloudHarborWorldRef, WORLD_REGISTRIES } from "../public/prototypes/universal-board/world-packs.js";
import { cloudHarborRouteChoice } from "../public/prototypes/universal-board/cloud-harbor-presentation.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";
import { nodeLandingPointsPresentation } from "../public/prototypes/universal-board/node-landing-points-presentation.js";

// 2026-10-20: the rainbow slide (彩虹滑道) and cloud trampoline (云朵弹垫) were removed.
// Their cells n05b, n06a, n12b and n34 are plain learning landings on the current board.
const boardDir = new URL("../public/prototypes/universal-board/", import.meta.url);
const appSource = readFileSync(new URL("app.js", boardDir), "utf8");
const harborWorldRefs = ["1.0.0", "1.1.0", "1.2.0", "1.2.1", "1.3.0"].map((version) => `world.ximitu.cloud-harbor@${version}`);
const currentWorldRef = harborWorldRefs.at(-1);
const RETIRED_CELLS = ["n05b", "n06a", "n12b", "n34"];


class Element {
  constructor(ownerDocument, tagName) {
    Object.assign(this, { ownerDocument, tagName, children: [], attributes: new Map(), listeners: new Map(), style: {}, dataset: {} });
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  append(...children) {
    for (const child of children) {
      if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child);
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  addEventListener(key, callback) { this.listeners.set(key, callback); }
  dispatch(key) { this.listeners.get(key)?.(); }
}
function makeDocument() {
  return {
    createElementNS(_, tag) { return new Element(this, tag); },
    createElement(tag) { return new Element(this, tag); },
  };
}
function descendants(element) { return element.children.flatMap((child) => [child, ...descendants(child)]); }
function findClass(element, className) {
  return descendants(element).find((child) => (child.getAttribute("class") || "").split(" ").includes(className));
}


test("current board keeps the retired facility cells as plain learning landings", () => {
  const composition = resolveWorldComposition(currentWorldRef, WORLD_REGISTRIES);
  for (const id of RETIRED_CELLS) {
    const node = composition.board.nodes.find((entry) => entry.id === id);
    assert.ok(node, `${id} still exists on the route`);
    assert.equal(node.spaceRole, "learning");
    for (const key of ["transportProfileRef", "transportTargetId", "mapEffectRef", "facilityKind"]) {
      assert.equal(Object.hasOwn(node, key), false, `${id} has no ${key}`);
    }
    assert.ok(composition.board.edges.some((edge) => edge.to === id), `${id} is still reachable`);
    assert.ok(composition.board.edges.some((edge) => edge.from === id), `${id} still leads onward`);
    assert.equal(composition.level.nodeBindings[id].semanticType, "ordinary");
  }
  assert.equal(composition.board.nodes.some((node) => node.spaceRole === "transport"), false);
  assert.doesNotMatch(JSON.stringify(composition.theme), /trampoline|rainbow-slide|facilities-v2|illustrated-facilities/);
});

test("historical harbor snapshots keep their frozen launchers and render only a neutral light", () => {
  for (const worldRef of harborWorldRefs.slice(0, -1)) {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    const before = JSON.stringify(composition.board);
    for (const [nodeId, targetId] of [["n06a", "n09"], ["n34", "n37"]]) {
      const source = composition.board.nodes.find((node) => node.id === nodeId);
      assert.equal(source.transportProfileRef, "jump.launcher.v1");
      assert.equal(source.transportTargetId, targetId);
      const host = new Element(makeDocument(), "g");
      const light = appendHarborLightHost(host, { kind: "route", active: true, label: "云路捷径" });
      assert.match(light.getAttribute("class"), /harbor-light-host/);
      assert.deepEqual(descendants(light).map((child) => child.tagName), ["title", "ellipse"]);
      assert.equal(light.children[0].textContent, "云路捷径");
    }
    assert.equal(JSON.stringify(composition.board), before);
  }
});

test("current route choice copy is neutral and preserves choice identities", () => {
  const original = {
    n04: { options: { e04a: { label: "云霄炮台线", edgeId: "e04a", targetNodeId: "n05a" }, e04b: { label: "雾笛侦察线", edgeId: "e04b", targetNodeId: "n05b" } } },
    n10: { options: { e10a: { label: "星光云梯", edgeId: "e10a" }, e10b: { label: "云瀑工务线", edgeId: "e10b", description: "最终停在云瀑水门，才会为全班永久开路。" } } },
  };
  const before = structuredClone(original);
  const context = vm.createContext({ ROUTE_CHOICE_META: original, isCurrentCloudHarborWorldRef, cloudHarborRouteChoice });
  const start = appSource.indexOf("function routeChoiceMetaForComposition(");
  vm.runInContext(appSource.slice(start, appSource.indexOf("function chooseRouteForMove(", start)), context);
  for (const worldRef of [harborWorldRefs[3], currentWorldRef]) {
    for (const nodeId of ["n04", "n10"]) {
      const adapted = context.routeChoiceMetaForComposition(nodeId, { worldRef });
      assert.doesNotMatch(JSON.stringify(adapted), /炮台|信号炮|雾笛|弹垫|弹床|滑道|滑梯/);
    }
    const n04 = context.routeChoiceMetaForComposition("n04", { worldRef });
    assert.deepEqual(Object.keys(n04.options), ["e04a", "e04b"]);
    assert.equal(n04.options.e04b.targetNodeId, "n05b");
  }
  const current = context.routeChoiceMetaForComposition("n10", { worldRef: currentWorldRef });
  assert.equal(current.title, "云岸岔路");
  assert.match(current.options.e10b.description, /最终停格家园积分/);
  assert.deepEqual(original, before);
});

test("retired cells show their own landing amount, never a transported destination amount", () => {
  const composition = resolveWorldComposition(currentWorldRef, WORLD_REGISTRIES);
  const rule = {
    kind: "server_verified_final_landing", enabled: true,
    worlds: [{ worldRef: currentWorldRef, nodes: [
      { nodeId: "n05b", points: 150 }, { nodeId: "n06a", points: 100 }, { nodeId: "n09", points: 200 },
      { nodeId: "n12b", points: 300 }, { nodeId: "n14", points: 200 },
      { nodeId: "n34", points: 100 }, { nodeId: "n37", points: 300 },
    ] }],
  };
  for (const [id, expected] of [["n05b", 150], ["n06a", 100], ["n12b", 300], ["n34", 100]]) {
    const node = composition.board.nodes.find((entry) => entry.id === id);
    const view = nodeLandingPointsPresentation({ rule, worldRef: currentWorldRef, node, board: composition.board });
    assert.equal(view.amount, expected);
    assert.equal(view.destinationId, id);
    assert.equal(view.transported, false);
    assert.equal(view.badgeText, `+${expected} 分`);
    assert.match(view.ariaLabel, new RegExp(`最终停格可得 ${expected} 家园积分`));
  }
});

test("point presentation fails closed for an unlocked rule, a missing destination, or another world", () => {
  const worldRef = "world.ximitu.cloud-harbor@1.3.0";
  const board = { nodes: [{ id: "source", spaceRole: "transport", transportTargetId: "target" }, { id: "target" }] };
  const rule = { kind: "server_verified_final_landing", enabled: true, worlds: [{ worldRef, nodes: [{ nodeId: "source", points: 999 }, { nodeId: "target", points: 200 }] }] };
  const input = { rule, worldRef, board, node: board.nodes[0] };
  for (const override of [
    { rule: null }, { rule: { ...rule, enabled: false } },
    { worldRef: "world.ximitu.cloud-harbor@1.2.1" },
    { node: { ...input.node, transportTargetId: "missing" } },
    { rule: { ...rule, worlds: [{ worldRef, nodes: [{ nodeId: "source", points: 999 }] }] } },
  ]) assert.equal(nodeLandingPointsPresentation({ ...input, ...override }), null);
});

test("no shipped board code, style or asset references the removed facilities", () => {
  const names = readdirSync(boardDir, { recursive: true }).map(String);
  assert.equal(names.some((name) => /playground|illustrated-facilit|facilities-v2|trampoline|rainbow-slide/i.test(name)), false);
  for (const name of names.filter((entry) => /\.(?:js|css|html)$/.test(entry))) {
    const source = readFileSync(new URL(name, boardDir), "utf8");
    assert.doesNotMatch(source, /playground|cloud-trampoline|rainbow-slide|弹垫|气垫|弹床|滑道|滑梯/i, name);
  }
});
