import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  isCloudHarborPresentation, cloudHarborNodePresentation, cloudHarborNodeVisualKind,
  cloudHarborLandmark, cloudHarborRouteChoice,
} from "../public/prototypes/universal-board/cloud-harbor-presentation.js";
import { WORLD_REGISTRIES } from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";
import { presentationForLevelOneNode } from "../public/prototypes/universal-board/level-one-presentations.js";

const worldRefs = ["1.0.0", "1.1.0", "1.2.0", "1.2.1", "1.3.0"]
  .map((version) => `world.ximitu.cloud-harbor@${version}`);
const mechanicalCopy = /吊机|吊车|雾笛|门塔|水塔|炮台|大炮|水门|信号炮|灯塔|滑翔器|[📯🗼🏗⚓]/u;

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("scope uses the official registered world versions or the explicit cloud-harbor theme", () => {
  for (const worldRef of worldRefs) assert.equal(isCloudHarborPresentation(null, worldRef), true);
  assert.equal(isCloudHarborPresentation({ id: "cloud-harbor" }, "custom-world@1.0.0"), true);
  assert.equal(isCloudHarborPresentation(null, "world.ximitu.cloud-harbor@999.0.0"), false);
  assert.equal(isCloudHarborPresentation({ id: "orbit-lab" }, "world.ximitu.beyond-cloud@1.0.0"), false);
});

test("non-harbor adapters preserve the original objects and semantic visual kinds", () => {
  const context = { theme: { id: "orbit-lab" }, worldRef: "world.ximitu.beyond-cloud@1.0.0" };
  const presentation = freeze({ label: "引力水门", icon: "🗼", category: "map-effect", trigger: "final-landing" });
  const node = freeze({ id: "n12b", mapEffectRef: "harbor.cloudfall-gate.v1" });
  const landmark = freeze({ x: 1, y: 2, label: "轨道塔", icon: "🗼" });
  const choice = freeze({ title: "轨道炮台", options: { e1: { edgeId: "e1", label: "发射线" } } });
  assert.equal(cloudHarborNodePresentation({ node, presentation, ...context }), presentation);
  assert.equal(cloudHarborLandmark(landmark, context), landmark);
  assert.equal(cloudHarborRouteChoice(choice, context), choice);
  for (const kind of ["foghorn", "cloud-gate", "anchor", "mooring", "transport"]) {
    assert.equal(cloudHarborNodeVisualKind(kind, context), kind);
  }
});

test("all registered harbor versions share neutral node copy without changing frozen rule data", () => {
  for (const worldRef of worldRefs) {
    const composition = freeze(structuredClone(resolveWorldComposition(worldRef, WORLD_REGISTRIES)));
    const before = JSON.stringify(composition);
    for (const node of composition.board.nodes) {
      const presentation = presentationForLevelOneNode(node.id);
      const original = JSON.stringify(presentation);
      const adapted = cloudHarborNodePresentation({ node, presentation, worldRef, theme: composition.theme });
      for (const key of ["label", "teaser", "firstCopy", "repeatCopy", "badge"]) {
        assert.doesNotMatch(adapted[key], mechanicalCopy, `${worldRef} ${node.id}.${key}`);
      }
      assert.equal(adapted.nodeId, presentation.nodeId);
      assert.equal(adapted.rewardRef, presentation.rewardRef);
      assert.equal(adapted.semanticType, presentation.semanticType);
      assert.equal(adapted.zoneId, presentation.zoneId);
      assert.equal(JSON.stringify(presentation), original);
      if (node.transportProfileRef && node.transportTargetId) {
        assert.equal(adapted.label, "云路捷径");
      }
    }
    assert.equal(JSON.stringify(composition), before);
  }
});

test("actual transport copy preserves its accepted category, trigger, endpoints and scoring metadata", () => {
  for (const worldRef of worldRefs) {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    for (const node of composition.board.nodes.filter((item) => item.transportProfileRef && item.transportTargetId)) {
      const presentation = freeze({
        category: "transport", trigger: "final-landing", tone: "transport", icon: "➜",
        badgeLabel: "自动传送", shortLabel: "信号炮发射", detail: "炮台旧文案", hasDirectReward: false,
        transportTargetId: node.transportTargetId, transportProfileRef: node.transportProfileRef,
        points: 500, receipt: { id: "locked-receipt", amount: 500 },
      });
      const adapted = cloudHarborNodePresentation({ node, presentation, worldRef });
      for (const key of ["category", "trigger", "tone", "hasDirectReward", "transportTargetId", "transportProfileRef", "points", "receipt"]) {
        assert.equal(adapted[key], presentation[key]);
      }
      assert.match(adapted.detail, /最终停在.*路过不触发.*不额外消耗骰点.*真实最终停格/);
      assert.doesNotMatch(adapted.detail, mechanicalCopy);
    }
  }
});

test("old opening and reveal effects remain distinct from transport and the retired new-world node", () => {
  for (const worldRef of worldRefs.slice(0, -1)) {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    const presentation = freeze({ category: "map-effect", trigger: "final-landing", icon: "📯", label: "水门", shortLabel: "旧效果", detail: "旧效果", hasDirectReward: false });
    const gate = cloudHarborNodePresentation({ node: composition.board.nodes.find((n) => n.id === "n12b"), presentation, worldRef });
    assert.equal(gate.label, "云阶入口");
    assert.equal(gate.category, "map-effect");
    assert.equal(gate.trigger, "final-landing");
    assert.match(gate.detail, /只开路，不移动棋子/);
    assert.doesNotMatch(gate.detail, /滑到|弹跳/);
    const glow = cloudHarborNodePresentation({ node: composition.board.nodes.find((n) => n.id === "n05b"), presentation, worldRef });
    assert.equal(glow.label, "航道微光");
    assert.match(glow.detail, /原有的目标揭示效果/);
    assert.equal(glow.category, "map-effect");
  }
  const current = resolveWorldComposition(worldRefs.at(-1), WORLD_REGISTRIES);
  const presentation = freeze({ category: "ordinary", trigger: "final-landing", label: "港口雾笛台", detail: "只领取真实最终格积分", teaser: "雾笛旧文案" });
  const scenic = cloudHarborNodePresentation({ node: current.board.nodes.find((n) => n.id === "n05b"), presentation, worldRef: current.worldRef });
  assert.equal(scenic.category, "ordinary");
  assert.equal(scenic.label, "海湾观景台");
  assert.equal(scenic.detail, presentation.detail);
  assert.doesNotMatch(scenic.teaser, /揭示|触发|雾笛/);
});

test("departure remains a next-edge transition while its marker becomes a small light", () => {
  const presentation = freeze({ category: "region-transition", trigger: "next-edge-pass", icon: "🗼", label: "远航灯塔门", shortLabel: "停在本格不触发", detail: "点亮灯塔", hasDirectReward: false });
  const adapted = cloudHarborNodePresentation({ node: { id: "n18" }, presentation, worldRef: worldRefs[0] });
  assert.equal(adapted.category, presentation.category);
  assert.equal(adapted.trigger, presentation.trigger);
  assert.equal(adapted.label, "离港光点");
  assert.equal(adapted.icon, "✦");
  assert.match(adapted.detail, /停在本格不会离港.*走到下一格/);
});

test("mechanical node fallback kinds are neutral while transport and route identity remain", () => {
  for (const worldRef of worldRefs) {
    for (const kind of ["foghorn", "cloud-gate", "map-effect"]) assert.equal(cloudHarborNodeVisualKind(kind, { worldRef }), "event");
    for (const kind of ["anchor", "mooring"]) assert.equal(cloudHarborNodeVisualKind(kind, { worldRef }), "learning");
    for (const kind of ["transport", "junction", "portal", "learning"]) assert.equal(cloudHarborNodeVisualKind(kind, { worldRef }), kind);
  }
});

test("only decorative tower and anchor landmarks disappear", () => {
  const context = { theme: { id: "cloud-harbor" } };
  for (const landmark of [{ label: "风暴塔", icon: "⚡" }, { label: "起航站", icon: "⚓" }, { label: "水塔" }, { icon: "🗼" }]) {
    assert.equal(cloudHarborLandmark(freeze(landmark), context), null);
  }
  const cloud = freeze({ x: 570, y: 225, icon: "☁", label: "云桥", id: "cloud-bridge" });
  assert.deepEqual(cloudHarborLandmark(cloud, context), cloud);
});

test("route metadata adapters retain edge keys, choice order and locked destinations", () => {
  const original = freeze({
    title: "水门岔路", copy: "水门已经打开，踏上云阶抵达灯塔前方。", junctionNodeId: "n14",
    options: {
      e14: { edgeId: "e14", label: "灯塔主路", description: "沿 n15、n16 前进。", targetNodeId: "n15", routeNodeIds: ["n15", "n16"] },
      e14c: { edgeId: "e14c", label: "云阶捷径", description: "只消耗 1 步直达 n17，会跳过 n15 和 n16。", targetNodeId: "n17", condition: { cloudRouteOpen: true } },
    },
  });
  const before = JSON.stringify(original);
  for (const worldRef of worldRefs) {
    const adapted = cloudHarborRouteChoice(original, { worldRef });
    assert.deepEqual(Object.keys(adapted.options), ["e14", "e14c"]);
    assert.equal(adapted.junctionNodeId, original.junctionNodeId);
    assert.equal(adapted.options.e14.routeNodeIds, original.options.e14.routeNodeIds);
    assert.equal(adapted.options.e14c.condition, original.options.e14c.condition);
    assert.equal(adapted.options.e14c.description, original.options.e14c.description);
    assert.doesNotMatch(adapted.title + adapted.copy + adapted.options.e14.label, mechanicalCopy);
    const runtime = cloudHarborRouteChoice({ ...original, options: Object.values(original.options) }, { worldRef });
    assert.deepEqual(runtime.options.map((item) => item.edgeId), ["e14", "e14c"]);
    assert.deepEqual(runtime.options.map((item) => item.targetNodeId), ["n15", "n17"]);
  }
  assert.equal(JSON.stringify(original), before);
});

test("missing optional presentation input is safe", () => {
  assert.equal(cloudHarborNodePresentation(), undefined);
  assert.equal(cloudHarborLandmark(null, { worldRef: worldRefs[0] }), null);
  assert.equal(cloudHarborRouteChoice(undefined, { worldRef: worldRefs[0] }), undefined);
});

const appSource = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");

function appFunction(name, nextName) {
  const start = appSource.indexOf(`async function ${name}(`);
  const end = appSource.indexOf(`async function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `actual app function ${name} is available`);
  return appSource.slice(start, end);
}

function effectHarness({ reducedMotion = false, missingDevice = false } = {}) {
  const element = (tagName) => ({
    tagName, className: "", dataset: {}, children: [], textContent: "",
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
  });
  const glow = element("glow");
  const facility = element("facility");
  const steps = [element("step-1"), element("step-2")];
  const fxLayer = element("fx-layer");
  fxLayer.dataset.unrelated = "preserved";
  const animations = [];
  const phases = [];
  const centers = [];
  const sounds = [];
  const runtime = freeze({ mapState: { cloudRouteOpen: false, cloudReefCleared: true }, turn: 8, teams: [{ id: "team-1", nodeId: "n12b" }] });
  const runtimeBefore = JSON.stringify(runtime);
  let resolveAnimations;
  let rejectAnimations;
  let animationStarted;
  const started = new Promise((resolve) => { animationStarted = resolve; });
  const pending = new Promise((resolve, reject) => {
    resolveAnimations = resolve;
    rejectAnimations = reject;
  });
  const context = {
    runtime,
    nodes: {
      board: {
        querySelector(selector) {
          if (selector === ".departure-beacon-device") return null;
          assert.match(selector, /data-map-effect-node-id="n12b".*\.harbor-terrain-glow$/);
          return missingDevice ? null : glow;
        },
        querySelectorAll(selector) {
          assert.equal(selector, '.cloud-stair-route[data-edge-id="e14c"] .cloud-stair-step');
          return steps;
        },
      },
      fxLayer,
      voiceState: { textContent: "" },
    },
    document: { createElement: element },
    textElement(tagName, className, textContent) { return Object.assign(element(tagName), { className, textContent }); },
    async centerTransportPair(...ids) { centers.push(ids); },
    setFacilityPresentationPhase(target, phase) {
      phases.push({ target, phase });
      return target ? facility : null;
    },
    reducedMotionRequested: () => reducedMotion,
    facilitySoundDurationScale: (full, first, repeat) => full ? first : repeat,
    presentationDuration: (duration) => duration,
    boardSounds: { play(...args) { sounds.push(args); } },
    animationFinished(target, frames, options) {
      animations.push({ target, frames, options });
      animationStarted();
      return pending;
    },
  };
  return {
    context, glow, facility, steps, fxLayer, animations, phases, centers, sounds,
    resolveAnimations, rejectAnimations, started,
    assertUnchanged() {
      assert.equal(JSON.stringify(runtime), runtimeBefore);
      assert.equal(context.runtime, runtime);
    },
  };
}

function assertVisibleOpacity(animation) {
  assert.ok(animation.frames.every((frame) => Number.isFinite(frame.opacity)), "every frame explicitly animates initially hidden light opacity");
  assert.ok(animation.frames.some((frame) => frame.opacity > 0), "light becomes visible");
}

test("actual old cloud gate animates one glow, waits and cleans up without changing map state", async () => {
  const source = appFunction("playCloudfallGate", "playDepartureBeacon");
  for (const reducedMotion of [false, true]) {
    for (const firstTime of [true, false]) {
      const harness = effectHarness({ reducedMotion });
      const play = runInNewContext(`"use strict"; ${source}; playCloudfallGate`, harness.context);
      const effect = freeze({ nodeId: "n12b", mapEffectRef: "harbor.cloudfall-gate.v1", effectId: "old-gate", firstTime });
      let finished = false;
      const playing = play(effect, freeze({ id: "team-1", label: "云朵队" })).then(() => { finished = true; });
      await Promise.race([harness.started, playing]);
      assert.equal(finished, false, "presentation awaits animation completion");
      assert.deepEqual(harness.centers, [["n12b", "n14"]]);
      const glowAnimations = harness.animations.filter((item) => item.target === harness.glow);
      assert.equal(glowAnimations.length, 1, "a single glow must not receive competing wheel/water animations");
      assertVisibleOpacity(glowAnimations[0]);
      assert.equal(glowAnimations[0].options.duration, reducedMotion ? 260 : firstTime ? 1180 : 680);
      for (const step of harness.steps) assert.equal(harness.animations.filter((item) => item.target === step).length, 1);
      const banner = harness.fxLayer.children[0];
      assert.match(banner.className, /cloudfall-gate-banner/);
      assert.match(banner.children[1].textContent, firstTime ? /为全班开启了云阶捷径/ : /云阶捷径持续开放/);
      assertVisibleOpacity(harness.animations.find((item) => item.target === banner));
      assert.equal(harness.fxLayer.dataset.effectId, "old-gate");
      harness.assertUnchanged();
      harness.resolveAnimations();
      await playing;
      assert.deepEqual(harness.phases, [{ target: harness.glow, phase: "active" }, { target: harness.facility, phase: "settled" }]);
      assert.deepEqual(harness.fxLayer.children, []);
      assert.deepEqual(harness.fxLayer.dataset, { unrelated: "preserved" });
      assert.equal(harness.sounds[0][0], "cloudfall-gate");
      harness.assertUnchanged();
    }
  }
});

test("actual departure celebrates without a device and always clears the banner", async () => {
  const source = appFunction("playDepartureBeacon", "playLandingConfirmation");
  for (const reducedMotion of [false, true]) {
    for (const firstTime of [true, false]) {
      for (const interrupted of [false, true]) {
        const harness = effectHarness({ reducedMotion, missingDevice: true });
        const play = runInNewContext(`"use strict"; ${source}; playDepartureBeacon`, harness.context);
        const effect = freeze({ fromNodeId: "n18", toNodeId: "n19", effectId: "departure", firstTime });
        const playing = play(effect, freeze({ id: "team-1", label: "云朵队" }));
        await Promise.race([harness.started, playing]);
        assert.deepEqual(harness.centers, [["n18", "n19"]]);
        const banner = harness.fxLayer.children[0];
        assert.match(banner.className, /departure-beacon-banner/);
        assert.match(banner.children[1].textContent, firstTime ? /云朵队 点亮航道/ : /云朵队 已离开启航海湾/);
        const bannerAnimation = harness.animations.find((item) => item.target === banner);
        assertVisibleOpacity(bannerAnimation);
        assert.equal(bannerAnimation.options.duration, reducedMotion ? 260 : firstTime ? 1080 : 650);
        assert.equal(harness.fxLayer.dataset.effectId, "departure");
        assert.equal(harness.sounds.length, 1);
        assert.equal(harness.sounds[0][0], "departure-beacon");
        assert.match(harness.context.nodes.voiceState.textContent, /离港光点亮起/);
        harness.assertUnchanged();
        if (interrupted) {
          const rejected = assert.rejects(playing, /animation interrupted/);
          harness.rejectAnimations(new Error("animation interrupted"));
          await rejected;
        } else {
          harness.resolveAnimations();
          await playing;
        }
        assert.deepEqual(harness.phases, [{ target: undefined, phase: "active" }, { target: null, phase: "settled" }]);
        assert.deepEqual(harness.fxLayer.children, []);
        assert.deepEqual(harness.fxLayer.dataset, { unrelated: "preserved" });
        harness.assertUnchanged();
      }
    }
  }
});

test("actual historical foghorn light frames become visible in normal and reduced motion", async () => {
  const foghornStart = appSource.indexOf("async function playHarborFoghorn(");
  const start = appSource.indexOf("animationFinished(device, reducedMotion", foghornStart);
  const end = appSource.indexOf("\n    ...reticles.map", start);
  assert.ok(foghornStart >= 0 && start > foghornStart && end > start);
  const expression = appSource.slice(start, end).trim().replace(/,$/, "");
  for (const reducedMotion of [false, true]) {
    for (const fullAnimation of [false, true]) {
      const device = freeze({ id: "initially-hidden-terrain-glow" });
      const calls = [];
      await runInNewContext(`"use strict"; ${expression}`, {
        device, reducedMotion, fullAnimation,
        animationFinished(target, frames, options) { calls.push({ target, frames, options }); return Promise.resolve(); },
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].target, device);
      assertVisibleOpacity(calls[0]);
      assert.equal(calls[0].options.duration, reducedMotion ? 240 : fullAnimation ? 520 : 360);
      if (!reducedMotion) {
        assert.equal(calls[0].frames[0].opacity, 0);
        assert.equal(calls[0].frames.at(-1).opacity, 0);
      }
    }
  }
});
