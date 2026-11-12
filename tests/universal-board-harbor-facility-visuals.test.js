import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  appendCloudfallGate,
  appendDepartureBeacon,
  appendHarborFoghorn,
  appendMooringCrane,
  appendSignalCannon,
} from "../public/prototypes/universal-board/harbor-facility-visuals.js";
import { THEME_PACKS, PREVIOUS_CLOUD_HARBOR_THEME_V21 } from "../public/prototypes/universal-board/packs.js";

const source = readFileSync(
  new URL(
    "../public/prototypes/universal-board/harbor-facility-visuals.js",
    import.meta.url,
  ),
  "utf8",
);
const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);

class FakeSvgElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.textContent = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(name, listener, options = {}) {
    this.listeners.set(name, { listener, once: options.once === true });
  }

  dispatch(name) {
    const entry = this.listeners.get(name);
    entry?.listener();
    if (entry?.once) this.listeners.delete(name);
  }

  append(...children) {
    this.children.push(...children);
  }
}

class FakeSvgDocument {
  createElementNS(namespace, tagName) {
    assert.equal(namespace, "http://www.w3.org/2000/svg");
    return new FakeSvgElement(this, tagName);
  }
}

function classNames(element) {
  return new Set((element.getAttribute("class") || "").split(/\s+/).filter(Boolean));
}

function descendants(element) {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function findByClass(element, className) {
  return descendants(element).find((candidate) => classNames(candidate).has(className));
}

function findAllByClass(element, className) {
  return descendants(element).filter((candidate) => classNames(candidate).has(className));
}

function makeHost() {
  const ownerDocument = new FakeSvgDocument();
  return new FakeSvgElement(ownerDocument, "g");
}

function assertFacilityRoot(result, host, kind, state, label) {
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0], result.facility);
  assert.equal(result.facility.getAttribute("data-facility-kind"), kind);
  assert.equal(result.facility.getAttribute("data-facility-state"), state);
  assert.ok(classNames(result.facility).has(`harbor-facility-${kind}`));
  assert.ok(classNames(result.facility).has(`facility-state-${state}`));
  assert.equal(result.title.tagName, "title");
  assert.equal(result.title.textContent, label);
}

test("mooring crane exposes crane motion and the anchor crate", () => {
  const host = makeHost();
  const result = appendMooringCrane(host, {
    state: "lifting",
    label: "锚箱正在装载",
  });

  assertFacilityRoot(result, host, "mooring-crane", "lifting", "锚箱正在装载");
  for (const className of [
    "facility-crane-base",
    "facility-crane-motion",
    "facility-crane-mast",
    "facility-crane-boom",
    "facility-crane-cable",
    "facility-crane-hook",
    "facility-mooring-anchor-crate",
    "facility-anchor-crate-glyph",
  ]) {
    assert.ok(findByClass(result.facility, className), `missing ${className}`);
  }
});

test("signal cannon exposes independently animatable aim and launch layers", () => {
  const host = makeHost();
  const result = appendSignalCannon(host, {
    state: "charging",
    label: "信号炮蓄力",
    aimAngle: 27.5,
  });

  assertFacilityRoot(result, host, "signal-cannon", "charging", "信号炮蓄力");
  assert.equal(result.facility.getAttribute("data-aim-angle"), "27.5");
  assert.equal(result.aimAxis.getAttribute("transform"), "rotate(27.5)");
  for (const className of [
    "facility-cannon-base",
    "facility-cannon-aim-axis",
    "facility-cannon-aim",
    "facility-cannon-core",
    "facility-cannon-bubble-pod",
    "facility-cannon-muzzle",
    "facility-cannon-cloud-pad",
  ]) {
    assert.ok(findByClass(result.facility, className), `missing ${className}`);
  }
});

test("harbor foghorn separates its acoustic and status parts", () => {
  const host = makeHost();
  const result = appendHarborFoghorn(host, {
    state: "sounding",
    label: "雾笛正在锁定",
  });

  assertFacilityRoot(result, host, "harbor-foghorn", "sounding", "雾笛正在锁定");
  for (const className of [
    "facility-foghorn-base",
    "facility-foghorn-motion",
    "facility-foghorn-bell",
    "facility-foghorn-throat",
    "facility-foghorn-diaphragm",
    "facility-foghorn-waves",
    "facility-foghorn-lamp",
  ]) {
    assert.ok(findByClass(result.facility, className), `missing ${className}`);
  }
  assert.equal(result.lamp.getAttribute("transform"), null);
  assert.equal(result.lampMount.getAttribute("transform"), "translate(-20 -22)");
});

test("cloudfall gate owns one wheel, water layer, and exactly three cloud steps", () => {
  const host = makeHost();
  const result = appendCloudfallGate(host, {
    state: "opening",
    label: "云瀑水门开启",
  });

  assertFacilityRoot(result, host, "cloudfall-gate", "opening", "云瀑水门开启");
  for (const className of [
    "facility-cloudfall-base",
    "facility-cloudfall-wheel",
    "facility-cloudfall-water",
    "facility-cloudfall-cloud-steps",
  ]) {
    assert.ok(findByClass(result.facility, className), `missing ${className}`);
  }
  const steps = findAllByClass(result.facility, "facility-cloudfall-cloud-step");
  assert.equal(steps.length, 3);
  assert.equal(result.wheel.getAttribute("transform"), null);
  assert.equal(result.wheelMount.getAttribute("transform"), "translate(-17 -2)");
  assert.deepEqual(
    steps.map((step) => step.getAttribute("data-cloud-step")),
    ["1", "2", "3"],
  );
});

test("departure beacon adds signal overlays without drawing another tower", () => {
  const host = makeHost();
  const result = appendDepartureBeacon(host, {
    state: "lit",
    label: "远航灯塔已点亮",
  });

  assertFacilityRoot(result, host, "departure-beacon", "lit", "远航灯塔已点亮");
  for (const className of [
    "facility-beacon-lens",
    "facility-beacon-beam",
    "facility-beacon-flags",
    "facility-beacon-birds",
  ]) {
    assert.ok(findByClass(result.facility, className), `missing ${className}`);
  }
  assert.equal(findByClass(result.facility, "facility-beacon-tower"), undefined);
  assert.doesNotMatch(source, /facility-beacon-tower/);
});

test("facility inputs are normalized and the module remains presentation-only", () => {
  const host = makeHost();
  const cannon = appendSignalCannon(host, {
    state: " charging now ",
    aimAngle: 999,
  });
  assert.equal(cannon.state, "ready");
  assert.equal(cannon.aimAngle, 180);

  assert.doesNotMatch(
    source,
    /\b(?:runtime|score|transcript|question|task|assessment|dice|learningPack)\b/i,
  );
  assert.doesNotMatch(source, /\binnerHTML\b/);
  assert.match(source, /createElementNS/);
});

test("cloud harbor facility art is a versioned visual-only ThemePack contract", () => {
  const facilitySkins = PREVIOUS_CLOUD_HARBOR_THEME_V21.facilitySkins;
  const expectedFields = {
    "mooring-crane": ["baseAssetRef", "crateAssetRef", "upperAssetRef"],
    "signal-cannon": ["barrelAssetRef", "baseAssetRef"],
    "harbor-foghorn": ["bodyAssetRef", "lampAssetRef"],
    "cloudfall-gate": ["baseAssetRef", "wheelAssetRef"],
    "departure-beacon": ["lensAssetRef"],
  };
  assert.deepEqual(Object.keys(facilitySkins).sort(), Object.keys(expectedFields).sort());

  const assetRefs = [];
  Object.entries(expectedFields).forEach(([kind, fields]) => {
    assert.deepEqual(Object.keys(facilitySkins[kind]).sort(), fields);
    fields.forEach((field) => {
      const assetRef = facilitySkins[kind][field];
      assert.match(
        assetRef,
        /^\/assets\/board-themes\/cloud-harbor\/facilities-v\d+\/[a-z0-9-]+-v\d+\.png$/,
      );
      const png = readFileSync(
        new URL(`../public${assetRef}`, import.meta.url),
      );
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(png[25], 6, `${assetRef} must preserve RGBA alpha`);
      assetRefs.push(assetRef);
    });
  });
  assert.equal(new Set(assetRefs).size, assetRefs.length);
  assert.equal(THEME_PACKS["orbit-lab"].facilitySkins, undefined);
  const { "departure-beacon": previousLens, ...sharedFacilitySkins } = facilitySkins;
  assert.ok(previousLens.lensAssetRef);
  assert.deepEqual(THEME_PACKS["cloud-harbor"].facilitySkins, sharedFacilitySkins,
    "the current theme keeps only historical facility artwork; the slide and trampoline are gone");
  assert.doesNotMatch(JSON.stringify(THEME_PACKS), /cloud-trampoline|rainbow-slide|facilities-v2\/(?:trampoline|slide)/);
});

test("facility art images stay decorative and use per-part SVG fallbacks", () => {
  const cases = [
    {
      append: appendMooringCrane,
      kind: "mooring-crane",
      art: THEME_PACKS["cloud-harbor"].facilitySkins["mooring-crane"],
      count: 3,
    },
    {
      append: appendSignalCannon,
      kind: "signal-cannon",
      art: THEME_PACKS["cloud-harbor"].facilitySkins["signal-cannon"],
      count: 2,
    },
    {
      append: appendHarborFoghorn,
      kind: "harbor-foghorn",
      art: THEME_PACKS["cloud-harbor"].facilitySkins["harbor-foghorn"],
      count: 2,
    },
    {
      append: appendCloudfallGate,
      kind: "cloudfall-gate",
      art: THEME_PACKS["cloud-harbor"].facilitySkins["cloudfall-gate"],
      count: 2,
    },
    {
      append: appendDepartureBeacon,
      kind: "departure-beacon",
      art: PREVIOUS_CLOUD_HARBOR_THEME_V21.facilitySkins["departure-beacon"],
      count: 1,
    },
  ];

  cases.forEach(({ append, kind, art, count }) => {
    const host = makeHost();
    const result = append(host, { art });
    const images = findAllByClass(result.facility, "facility-art-image");
    assert.equal(images.length, count, kind);
    images.forEach((image) => {
      assert.equal(image.tagName, "image");
      assert.equal(image.getAttribute("aria-hidden"), "true");
      assert.equal(image.getAttribute("pointer-events"), "none");
      assert.equal(image.getAttribute("preserveAspectRatio"), "xMidYMid meet");
      assert.equal(image.getAttribute("data-facility-art-state"), "loading");
      assert.match(image.getAttribute("href"), /^\/assets\//);
      assert.deepEqual([...image.listeners.keys()].sort(), ["error", "load"]);
    });
  });
});

test("facility bitmap load and error events never remove the SVG safety fallback", () => {
  const art = THEME_PACKS["cloud-harbor"].facilitySkins["mooring-crane"];
  const ready = appendMooringCrane(makeHost(), { art });
  const readyImage = ready.artImages.upper;
  assert.equal(ready.mast.getAttribute("data-facility-art-fallback"), "visible");
  assert.equal(ready.cable.getAttribute("data-facility-art-fallback"), null);
  const readyDescendantCount = descendants(ready.facility).length;
  readyImage.dispatch("load");
  assert.equal(readyImage.getAttribute("data-facility-art-state"), "ready");
  assert.equal(ready.mast.getAttribute("data-facility-art-fallback"), "hidden");
  assert.equal(ready.boom.getAttribute("data-facility-art-fallback"), "hidden");
  assert.equal(ready.cable.getAttribute("data-facility-art-fallback"), null);
  assert.equal(descendants(ready.facility).length, readyDescendantCount);

  const failed = appendMooringCrane(makeHost(), { art });
  const failedImage = failed.artImages.upper;
  const failedDescendantCount = descendants(failed.facility).length;
  failedImage.dispatch("error");
  assert.equal(failedImage.getAttribute("data-facility-art-state"), "unavailable");
  assert.equal(failedImage.getAttribute("href"), null);
  assert.equal(failed.mast.getAttribute("data-facility-art-fallback"), "visible");
  assert.equal(failed.boom.getAttribute("data-facility-art-fallback"), "visible");
  assert.equal(failed.cable.getAttribute("data-facility-art-fallback"), null);
  assert.equal(descendants(failed.facility).length, failedDescendantCount);
});

test("the board replaces mechanical harbor decoration through presentation only", () => {
  for (const renderer of ["appendMooringCrane", "appendSignalCannon", "appendHarborFoghorn", "appendCloudfallGate", "appendDepartureBeacon"]) {
    assert.doesNotMatch(appSource, new RegExp(`${renderer}\\(`));
  }
  assert.doesNotMatch(appSource, /facilityArt\(|illustratedFacilityArt|playground/i);
  assert.match(appSource, /appendHarborLightHost\(group, \{ kind: "route"/);
  assert.match(appSource, /appendHarborLightHost\(host, \{ kind: "departure"/);
  assert.doesNotMatch(
    JSON.stringify(THEME_PACKS["cloud-harbor"].facilitySkins),
    /\b(?:nodeId|edgeId|transform|score|transcript|question|dice|answer|knowledge)\b/i,
  );
});

test("SVG-fit auxiliary visuals follow their live route and node anchors", () => {
  assert.match(
    appSource,
    /pointsAlongSvgPath\(stairLine, edge, \[0\.25, 0\.5, 0\.75\]\)/,
  );
  assert.match(appSource, /const beaconNode = nodeById\.get\("n18"\)/);
  assert.match(
    appSource,
    /`translate\(\$\{beaconNode\.x\} \$\{beaconNode\.y\}\)`/,
  );
  assert.match(appSource, /"data-region-effect-ref": "harbor\.departure-beacon\.v1"/);
  assert.doesNotMatch(appSource, /pedestal: crystalBeacon/);
  assert.match(appSource, /"data-item-node-id": beaconNode\.id/);

  assert.doesNotMatch(appSource, /cx: (?:1098|1101|1078)/);
  assert.doesNotMatch(appSource, /transform: "translate\(1092 72\)"/);
});

test("crystal departure signal has a physical decorative stand and preserves its effect anchors", () => {
  const previous = appendDepartureBeacon(makeHost());
  const crystal = appendDepartureBeacon(makeHost(), { pedestal: true });
  assert.equal(findAllByClass(previous.facility, "facility-beacon-pedestal").length, 0);
  const stand = findAllByClass(crystal.facility, "facility-beacon-pedestal");
  assert.equal(stand.length, 1);
  assert.equal(stand[0].getAttribute("pointer-events"), "none");
  for (const part of descendants(stand[0])) {
    assert.equal(part.getAttribute("aria-hidden"), "true");
    assert.equal(part.getAttribute("tabindex"), null);
  }
  for (const anchor of ["lens", "beam", "flags", "birds"]) assert.ok(crystal[anchor]);
  assert.equal(findAllByClass(crystal.facility, "facility-art-image").length, 0);
});
