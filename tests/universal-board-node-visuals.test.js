import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  NODE_VISUAL_KINDS,
  appendNodeVisualLayers,
  nodeVisualSpec,
} from "../public/prototypes/universal-board/node-visuals.js";

const source = readFileSync(
  new URL("../public/prototypes/universal-board/node-visuals.js", import.meta.url),
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
    this.classList = {
      add: (...names) => {
        const next = classNames(this);
        names.forEach((name) => next.add(name));
        this.setAttribute("class", [...next].join(" "));
      },
      remove: (...names) => {
        const next = classNames(this);
        names.forEach((name) => next.delete(name));
        this.setAttribute("class", [...next].join(" "));
      },
      contains: (name) => classNames(this).has(name),
    };
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

  append(...children) {
    this.children.push(...children);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  dispatch(name) {
    this.listeners.get(name)?.();
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

test("node visual module covers every current semantic node kind", () => {
  assert.deepEqual(NODE_VISUAL_KINDS, [
    "learning",
    "coin",
    "gem",
    "event",
    "mooring",
    "foghorn",
    "cloud-gate",
    "anchor",
    "key",
    "home",
    "portal",
    "junction",
    "item",
    "transport",
  ]);

  for (const kind of NODE_VISUAL_KINDS) {
    const spec = nodeVisualSpec(kind);
    assert.equal(spec.kind, kind);
    assert.ok(["circle", "path", "rect"].includes(spec.shape.tag));
    assert.ok(spec.defaultGlyph);
    assert.ok(spec.details.length > 0);
    assert.equal(typeof spec.shape.glossPath, "string");
  }
});

test("appendNodeVisualLayers preserves the stable seven-layer SVG fallback contract", () => {
  const ownerDocument = new FakeSvgDocument();

  for (const kind of NODE_VISUAL_KINDS) {
    const host = new FakeSvgElement(ownerDocument, "g");
    const layers = appendNodeVisualLayers(host, {
      kind,
      glyph: `glyph-${kind}`,
      label: `label-${kind}`,
    });

    assert.equal(host.children.length, 1);
    assert.equal(host.children[0], layers.token);
    assert.equal(layers.kind, kind);
    assert.equal(layers.token.getAttribute("data-node-visual-kind"), kind);
    assert.ok(classNames(layers.token).has(`node-visual-token-${kind}`));
    assert.ok(classNames(layers.shadow).has("node-visual-shadow"));
    assert.ok(classNames(layers.base).has("node-visual-base"));
    assert.ok(classNames(layers.rim).has("node-visual-rim"));
    assert.ok(classNames(layers.inset).has("node-visual-inset"));
    assert.ok(classNames(layers.detail).has(`node-visual-detail-${kind}`));
    assert.ok(classNames(layers.glyph).has("node-visual-glyph"));
    assert.ok(classNames(layers.gloss).has("node-visual-gloss"));
    assert.equal(layers.glyph.textContent, `glyph-${kind}`);
    assert.equal(layers.title.textContent, `label-${kind}`);

    const orderedLayers = layers.token.children.filter((child) => (
      classNames(child).has("node-visual-layer")
    ));
    assert.deepEqual(orderedLayers, [
      layers.shadow,
      layers.base,
      layers.detail,
      layers.glyph,
      layers.rim,
      layers.inset,
      layers.gloss,
    ]);
    assert.equal(layers.artDefs, null);
    assert.equal(layers.artClip, null);
    assert.equal(layers.artImage, null);
  }
});

test("optional node art is clipped, non-interactive, and fails back without rerendering", () => {
  const ownerDocument = new FakeSvgDocument();
  const host = new FakeSvgElement(ownerDocument, "g");
  const layers = appendNodeVisualLayers(host, {
    kind: "learning",
    glyph: "?",
    label: "朗读任务 · n01",
    assetRef: "/assets/board-themes/cloud-harbor/nodes-v2/learning-v2.jpg",
    clipId: "cloud-harbor-n01",
  });

  assert.ok(classNames(layers.token).has("has-node-art"));
  assert.equal(
    layers.token.getAttribute("data-node-art-ref"),
    "/assets/board-themes/cloud-harbor/nodes-v2/learning-v2.jpg",
  );
  assert.equal(layers.artClip.getAttribute("id"), "node-art-clip-cloud-harbor-n01");
  assert.equal(layers.artClip.getAttribute("clipPathUnits"), "userSpaceOnUse");
  assert.equal(
    layers.artImage.getAttribute("clip-path"),
    "url(#node-art-clip-cloud-harbor-n01)",
  );
  assert.equal(layers.artImage.getAttribute("pointer-events"), "none");
  assert.equal(layers.artImage.getAttribute("preserveAspectRatio"), "xMidYMid slice");

  const orderedLayers = layers.token.children.filter((child) => (
    classNames(child).has("node-visual-layer")
  ));
  assert.deepEqual(orderedLayers, [
    layers.shadow,
    layers.base,
    layers.detail,
    layers.glyph,
    layers.artImage,
    layers.rim,
    layers.inset,
    layers.gloss,
  ]);

  layers.artImage.dispatch("load");
  assert.ok(classNames(layers.token).has("is-art-ready"));

  const failedHost = new FakeSvgElement(ownerDocument, "g");
  const failed = appendNodeVisualLayers(failedHost, {
    kind: "coin",
    assetRef: "/missing-node.jpg",
    clipId: "cloud-harbor-n02",
  });
  failed.artImage.dispatch("error");
  assert.ok(classNames(failed.token).has("is-art-unavailable"));
  assert.equal(failed.artImage.getAttribute("href"), null);
  assert.ok(failed.base);
  assert.ok(failed.glyph);
});

test("complete node art owns its full frame while SVG remains a hidden load fallback", () => {
  const ownerDocument = new FakeSvgDocument();
  const host = new FakeSvgElement(ownerDocument, "g");
  const layers = appendNodeVisualLayers(host, {
    kind: "learning",
    glyph: "?",
    label: "朗读任务 · n01",
    assetRef: "/assets/board-themes/cloud-harbor/nodes-v3/learning-v3.png",
    artMode: "complete",
    clipId: "cloud-harbor-n01",
  });

  assert.ok(classNames(layers.token).has("has-node-art"));
  assert.ok(classNames(layers.token).has("has-complete-node-art"));
  assert.equal(layers.token.getAttribute("data-node-art-mode"), "complete");
  assert.equal(layers.artDefs, null);
  assert.equal(layers.artClip, null);
  assert.equal(layers.artImage.getAttribute("clip-path"), null);
  assert.equal(layers.artImage.getAttribute("x"), "-31");
  assert.equal(layers.artImage.getAttribute("y"), "-31");
  assert.equal(layers.artImage.getAttribute("width"), "62");
  assert.equal(layers.artImage.getAttribute("height"), "62");
  assert.equal(layers.artImage.getAttribute("preserveAspectRatio"), "xMidYMid meet");
  assert.equal(layers.artImage.getAttribute("pointer-events"), "none");
  assert.ok(classNames(layers.artImage).has("node-visual-art-complete"));

  const orderedLayers = layers.token.children.filter((child) => (
    classNames(child).has("node-visual-layer")
  ));
  assert.deepEqual(orderedLayers, [
    layers.shadow,
    layers.base,
    layers.detail,
    layers.glyph,
    layers.rim,
    layers.inset,
    layers.gloss,
    layers.artImage,
  ]);

  layers.artImage.dispatch("load");
  assert.ok(classNames(layers.token).has("is-art-ready"));
  layers.artImage.dispatch("error");
  assert.ok(classNames(layers.token).has("is-art-unavailable"));
  assert.equal(classNames(layers.token).has("is-art-ready"), false);
  assert.equal(layers.artImage.getAttribute("href"), null);
  assert.ok(layers.base);
  assert.ok(layers.rim);
});

test("visual aliases normalize safely and unknown kinds use the learning fallback", () => {
  assert.equal(nodeVisualSpec("activity").kind, "event");
  assert.equal(nodeVisualSpec("goal").kind, "portal");
  assert.equal(nodeVisualSpec("map-effect").kind, "foghorn");
  assert.equal(nodeVisualSpec("reward").kind, "coin");
  assert.equal(nodeVisualSpec("treasure").kind, "gem");
  assert.equal(nodeVisualSpec("not-a-node-kind").kind, "learning");
});

test("node visual module remains independent of board and assessment state", () => {
  assert.doesNotMatch(
    source,
    /\b(?:BOARD_TEMPLATE|LEARNING_PACKS|runtime|score|transcript|assessment|dice)\b/i,
  );
  assert.doesNotMatch(source, /\binnerHTML\b/);
  assert.match(source, /createElementNS/);
  assert.match(source, /export function appendNodeVisualLayers/);
});
