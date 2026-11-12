const SVG_NS = "http://www.w3.org/2000/svg";
let nodeArtClipSequence = 0;

export const NODE_VISUAL_KINDS = Object.freeze([
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

const KIND_ALIASES = Object.freeze({
  activity: "event",
  goal: "portal",
  "map-effect": "foghorn",
  reward: "coin",
  treasure: "gem",
});

const DEFAULT_GLYPHS = Object.freeze({
  learning: "步",
  coin: "1",
  gem: "◆",
  event: "!",
  mooring: "⚓",
  foghorn: "鸣",
  "cloud-gate": "闸",
  anchor: "踪",
  key: "钥",
  home: "屋",
  portal: "∞",
  junction: "↗",
  item: "✦",
  transport: "↟",
});

const SHAPE_SPECS = Object.freeze({
  learning: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M -24 -18 Q -24 -24 -18 -24 H 18 Q 24 -24 24 -18 V 10 Q 24 17 17 17 H 8 L 16 27 L -1 17 H -18 Q -24 17 -24 10 Z",
    }),
    insetScale: 0.79,
    glossPath: "M -14 -13 Q 0 -20 14 -13",
  }),
  coin: Object.freeze({
    tag: "circle",
    attributes: Object.freeze({ r: 21 }),
    insetScale: 0.76,
    glossPath: "M -12 -12 Q 0 -18 12 -12",
  }),
  gem: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M 0 -24 L 22 -3 L 0 24 L -22 -3 Z",
    }),
    insetScale: 0.78,
    glossPath: "M -10 -10 L 0 -18 L 10 -10",
  }),
  event: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M 0 -26 L 7 -14 L 20 -20 L 18 -7 L 29 0 L 17 7 L 21 21 L 7 17 L 0 29 L -7 17 L -21 21 L -17 7 L -29 0 L -18 -7 L -20 -20 L -7 -14 Z",
    }),
    insetScale: 0.76,
    glossPath: "M -9 -12 Q 0 -18 9 -12",
  }),
  mooring: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M -22 -15 L 0 -26 L 22 -15 L 25 9 L 0 25 L -25 9 Z",
    }),
    insetScale: 0.77,
    glossPath: "M -12 -13 L 0 -19 L 12 -13",
  }),
  foghorn: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M -23 -18 Q 0 -29 23 -18 L 27 7 Q 15 25 0 27 Q -15 25 -27 7 Z",
    }),
    insetScale: 0.77,
    glossPath: "M -13 -14 Q 0 -20 13 -14",
  }),
  "cloud-gate": Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M -24 -18 Q -24 -24 -18 -24 H 18 Q 24 -24 24 -18 V 18 Q 24 24 18 24 H -18 Q -24 24 -24 18 Z",
    }),
    insetScale: 0.78,
    glossPath: "M -13 -15 H 13",
  }),
  anchor: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M -21 -15 L 0 -25 L 21 -15 L 21 12 L 0 24 L -21 12 Z",
    }),
    insetScale: 0.78,
    glossPath: "M -11 -13 L 0 -18 L 11 -13",
  }),
  key: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M -23 -17 H 14 Q 23 -17 23 -8 V 10 Q 23 19 14 19 H -23 Z",
    }),
    insetScale: 0.78,
    glossPath: "M -14 -11 H 12 Q 16 -11 17 -7",
  }),
  home: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M -25 -6 L 0 -27 L 25 -6 V 23 H -25 Z",
    }),
    insetScale: 0.78,
    glossPath: "M -12 -9 L 0 -19 L 12 -9",
  }),
  portal: Object.freeze({
    tag: "circle",
    attributes: Object.freeze({ r: 25 }),
    insetScale: 0.77,
    glossPath: "M -14 -12 Q 0 -21 14 -12",
  }),
  junction: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M 0 -25 L 25 0 L 0 25 L -25 0 Z",
    }),
    insetScale: 0.76,
    glossPath: "M -10 -7 L 0 -17 L 10 -7",
  }),
  item: Object.freeze({
    tag: "path",
    attributes: Object.freeze({
      d: "M 0 -25 L 7 -8 L 25 0 L 7 8 L 0 25 L -7 8 L -25 0 L -7 -8 Z",
    }),
    insetScale: 0.74,
    glossPath: "M -6 -8 L 0 -17 L 6 -8",
  }),
  transport: Object.freeze({
    tag: "rect",
    attributes: Object.freeze({
      x: -23,
      y: -17,
      width: 46,
      height: 35,
      rx: 9,
    }),
    insetScale: 0.78,
    glossPath: "M -13 -10 H 13",
  }),
});

const DETAIL_SPECS = Object.freeze({
  learning: Object.freeze([
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M -14 -7 H 14 M -14 0 H 7",
        class: "node-visual-detail-stroke node-visual-detail-learning-lines",
      }),
    }),
    Object.freeze({
      tag: "circle",
      attributes: Object.freeze({
        cx: 13,
        cy: 7,
        r: 2.2,
        class: "node-visual-detail-dot node-visual-detail-learning-dot",
      }),
    }),
  ]),
  coin: Object.freeze([
    Object.freeze({
      tag: "circle",
      attributes: Object.freeze({
        r: 13,
        class: "node-visual-detail-stroke node-visual-detail-coin-ring",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M 0 -18 V -14 M 13 -13 L 10 -10 M 18 0 H 14 M 13 13 L 10 10 M 0 18 V 14 M -13 13 L -10 10 M -18 0 H -14 M -13 -13 L -10 -10",
        class: "node-visual-detail-stroke node-visual-detail-coin-ticks",
      }),
    }),
  ]),
  gem: Object.freeze([
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M 0 -18 L 10 -3 L 0 17 L -10 -3 Z M -20 -3 H 20 M 0 -18 V 17",
        class: "node-visual-detail-stroke node-visual-detail-gem-facets",
      }),
    }),
  ]),
  event: Object.freeze([
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M 0 -16 L 5 -7 L 14 -10 L 10 0 L 14 10 L 5 7 L 0 16 L -5 7 L -14 10 L -10 0 L -14 -10 L -5 -7 Z",
        class: "node-visual-detail-stroke node-visual-detail-event-burst",
      }),
    }),
    Object.freeze({
      tag: "circle",
      attributes: Object.freeze({
        r: 4,
        class: "node-visual-detail-dot node-visual-detail-event-core",
      }),
    }),
  ]),
  mooring: Object.freeze([
    Object.freeze({
      tag: "circle",
      attributes: Object.freeze({
        cy: -10,
        r: 4,
        class: "node-visual-detail-stroke node-visual-detail-mooring-eye",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M 0 -6 V 12 M -13 3 H 13 M -15 8 Q -10 17 0 17 Q 10 17 15 8",
        class: "node-visual-detail-stroke node-visual-detail-mooring-hook",
      }),
    }),
  ]),
  foghorn: Object.freeze([
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M -15 -6 H -6 V 6 H -15 Q -19 0 -15 -6 Z M -6 -8 L 7 -13 V 13 L -6 8 Z",
        class: "node-visual-detail-stroke node-visual-detail-foghorn-bell",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M 11 -7 Q 18 0 11 7 M 16 -11 Q 27 0 16 11",
        class: "node-visual-detail-stroke node-visual-detail-foghorn-waves",
      }),
    }),
  ]),
  "cloud-gate": Object.freeze([
    Object.freeze({
      tag: "circle",
      attributes: Object.freeze({
        r: 11,
        class: "node-visual-detail-stroke node-visual-detail-cloud-gate-wheel",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M 0 -11 V 11 M -11 0 H 11 M -8 -8 L 8 8 M 8 -8 L -8 8",
        class: "node-visual-detail-stroke node-visual-detail-cloud-gate-spokes",
      }),
    }),
  ]),
  anchor: Object.freeze([
    Object.freeze({
      tag: "ellipse",
      attributes: Object.freeze({
        cx: -7,
        cy: 5,
        rx: 4,
        ry: 7,
        transform: "rotate(-24 -7 5)",
        class: "node-visual-detail-dot node-visual-detail-fairy-footprint",
      }),
    }),
    Object.freeze({
      tag: "ellipse",
      attributes: Object.freeze({
        cx: 8,
        cy: -5,
        rx: 4,
        ry: 7,
        transform: "rotate(24 8 -5)",
        class: "node-visual-detail-dot node-visual-detail-fairy-footprint",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M -14 -8 L -11 -12 M -8 -10 L -6 -15 M 13 5 L 16 1 M 8 8 L 9 3",
        class: "node-visual-detail-stroke node-visual-detail-fairy-spark",
      }),
    }),
  ]),
  key: Object.freeze([
    Object.freeze({
      tag: "circle",
      attributes: Object.freeze({
        cx: -10,
        cy: 0,
        r: 7,
        class: "node-visual-detail-stroke node-visual-detail-key-bow",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M -3 0 H 16 V 7 M 9 0 V 6",
        class: "node-visual-detail-stroke node-visual-detail-key-shaft",
      }),
    }),
  ]),
  home: Object.freeze([
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M -16 -4 L 0 -17 L 16 -4 M -14 -3 V 15 H 14 V -3 M -4 15 V 3 H 4 V 15",
        class: "node-visual-detail-stroke node-visual-detail-home-house",
      }),
    }),
    Object.freeze({
      tag: "rect",
      attributes: Object.freeze({
        x: 7,
        y: 1,
        width: 5,
        height: 5,
        rx: 1,
        class: "node-visual-detail-stroke node-visual-detail-home-window",
      }),
    }),
  ]),
  junction: Object.freeze([
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M 0 15 V -4 M 0 -4 L -11 -14 M -11 -14 H -4 M -11 -14 V -7 M 0 -4 L 11 -14 M 11 -14 H 4 M 11 -14 V -7",
        class: "node-visual-detail-stroke node-visual-detail-junction-arrows",
      }),
    }),
  ]),
  item: Object.freeze([
    Object.freeze({
      tag: "circle",
      attributes: Object.freeze({
        r: 7,
        class: "node-visual-detail-stroke node-visual-detail-item-core",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M 0 -17 V -8 M 17 0 H 8 M 0 17 V 8 M -17 0 H -8",
        class: "node-visual-detail-stroke node-visual-detail-item-compass",
      }),
    }),
  ]),
  transport: Object.freeze([
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M -15 5 H 7 L 15 -3 M 7 -8 L 15 -3 L 10 5",
        class: "node-visual-detail-stroke node-visual-detail-transport-launch",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M -15 -9 H -6 M -15 -3 H -9 M -15 3 H -11",
        class: "node-visual-detail-stroke node-visual-detail-transport-speed",
      }),
    }),
  ]),
  portal: Object.freeze([
    Object.freeze({
      tag: "ellipse",
      attributes: Object.freeze({
        rx: 13,
        ry: 18,
        class: "node-visual-detail-stroke node-visual-detail-portal-ring",
      }),
    }),
    Object.freeze({
      tag: "path",
      attributes: Object.freeze({
        d: "M -18 0 H 10 M 4 -7 L 12 0 L 4 7",
        class: "node-visual-detail-stroke node-visual-detail-portal-arrow",
      }),
    }),
  ]),
});

function normalizedKind(kind) {
  const source = typeof kind === "string" ? kind.trim() : "";
  const candidate = KIND_ALIASES[source] || source;
  return NODE_VISUAL_KINDS.includes(candidate) ? candidate : "learning";
}

export function nodeVisualSpec(kind) {
  const normalized = normalizedKind(kind);
  return Object.freeze({
    kind: normalized,
    defaultGlyph: DEFAULT_GLYPHS[normalized],
    shape: SHAPE_SPECS[normalized],
    details: DETAIL_SPECS[normalized],
  });
}

function svgElement(documentRef, name, attributes = {}) {
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function shapeElement(documentRef, spec, className, attributes = {}) {
  return svgElement(documentRef, spec.shape.tag, {
    ...spec.shape.attributes,
    ...attributes,
    class: className,
    "aria-hidden": "true",
  });
}

function requireSvgHost(group) {
  if (!group || typeof group.append !== "function") {
    throw new TypeError("appendNodeVisualLayers requires an SVG group");
  }
  const documentRef = group.ownerDocument || globalThis.document;
  if (!documentRef?.createElementNS) {
    throw new TypeError("appendNodeVisualLayers requires an SVG-capable document");
  }
  return documentRef;
}

function nodeArtClipId(kind, requestedId) {
  const normalized = String(requestedId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized) return `node-art-clip-${normalized}`;
  nodeArtClipSequence += 1;
  return `node-art-clip-${kind}-${nodeArtClipSequence}`;
}

export function appendNodeVisualLayers(group, {
  kind = "learning",
  glyph,
  label = "",
  assetRef = "",
  artMode = "interior",
  clipId = "",
} = {}) {
  const documentRef = requireSvgHost(group);
  const spec = nodeVisualSpec(kind);
  const normalizedAssetRef = typeof assetRef === "string" ? assetRef.trim() : "";
  const normalizedArtMode = artMode === "complete" ? "complete" : "interior";
  const token = svgElement(documentRef, "g", {
    class: (
      `node-visual-token node-visual-token-${spec.kind} `
      + `${normalizedAssetRef ? "has-node-art" : ""} `
      + `${normalizedAssetRef && normalizedArtMode === "complete"
        ? "has-complete-node-art"
        : ""}`
    ).trim(),
    "data-node-visual-kind": spec.kind,
  });
  if (normalizedAssetRef) {
    token.setAttribute("data-node-art-ref", normalizedAssetRef);
    token.setAttribute("data-node-art-mode", normalizedArtMode);
  }

  let title = null;
  if (label) {
    title = svgElement(documentRef, "title", {
      class: "node-visual-title",
    });
    title.textContent = String(label);
    token.append(title);
  }

  const shadow = shapeElement(
    documentRef,
    spec,
    "space-shape-shadow node-visual-layer node-visual-shadow",
    { transform: "translate(0 5)" },
  );
  const base = shapeElement(
    documentRef,
    spec,
    "space-shape node-visual-layer node-visual-base",
  );
  const rim = shapeElement(
    documentRef,
    spec,
    "node-visual-layer node-visual-rim",
    {
      fill: "none",
      "vector-effect": "non-scaling-stroke",
    },
  );
  const inset = shapeElement(
    documentRef,
    spec,
    "node-visual-layer node-visual-inset",
    {
      fill: "none",
      transform: `scale(${spec.shape.insetScale})`,
      "vector-effect": "non-scaling-stroke",
    },
  );

  const detail = svgElement(documentRef, "g", {
    class: `node-visual-layer node-visual-detail node-visual-detail-${spec.kind}`,
    "aria-hidden": "true",
  });
  spec.details.forEach(({ tag, attributes }) => {
    detail.append(svgElement(documentRef, tag, {
      ...attributes,
      "aria-hidden": "true",
    }));
  });

  const glyphElement = svgElement(documentRef, "text", {
    x: 0,
    y: 6,
    "text-anchor": "middle",
    class: "space-glyph node-visual-layer node-visual-glyph",
    "aria-hidden": "true",
  });
  glyphElement.textContent = glyph === undefined || glyph === null
    ? spec.defaultGlyph
    : String(glyph);

  const gloss = svgElement(documentRef, "path", {
    d: spec.shape.glossPath,
    class: "node-visual-layer node-visual-gloss",
    fill: "none",
    "aria-hidden": "true",
  });

  let artDefs = null;
  let artClip = null;
  let artImage = null;
  if (normalizedAssetRef) {
    if (normalizedArtMode === "interior") {
      const resolvedClipId = nodeArtClipId(spec.kind, clipId);
      artDefs = svgElement(documentRef, "defs", {
        class: "node-visual-art-defs",
        "aria-hidden": "true",
      });
      artClip = svgElement(documentRef, "clipPath", {
        id: resolvedClipId,
        clipPathUnits: "userSpaceOnUse",
      });
      artClip.append(shapeElement(
        documentRef,
        spec,
        "node-visual-art-clip-shape",
        { transform: "scale(.82)" },
      ));
      artDefs.append(artClip);
    }

    artImage = svgElement(documentRef, "image", {
      x: normalizedArtMode === "complete" ? -31 : -25,
      y: normalizedArtMode === "complete" ? -31 : -25,
      width: normalizedArtMode === "complete" ? 62 : 50,
      height: normalizedArtMode === "complete" ? 62 : 50,
      href: normalizedAssetRef,
      preserveAspectRatio: normalizedArtMode === "complete"
        ? "xMidYMid meet"
        : "xMidYMid slice",
      class: (
        "node-visual-layer node-visual-art "
        + `node-visual-art-${normalizedArtMode}`
      ),
      "pointer-events": "none",
      decoding: "async",
      "aria-hidden": "true",
    });
    if (artClip) {
      artImage.setAttribute("clip-path", `url(#${artClip.getAttribute("id")})`);
    }
    artImage.addEventListener?.("load", () => {
      token.classList?.add("is-art-ready");
      token.classList?.remove("is-art-unavailable");
    }, { once: true });
    artImage.addEventListener?.("error", () => {
      token.classList?.add("is-art-unavailable");
      token.classList?.remove("is-art-ready");
      artImage.removeAttribute?.("href");
    }, { once: true });
  }

  if (normalizedArtMode === "complete" && artImage) {
    token.append(
      shadow,
      base,
      detail,
      glyphElement,
      rim,
      inset,
      gloss,
      artImage,
    );
  } else {
    token.append(
      shadow,
      base,
      detail,
      glyphElement,
      ...(artDefs && artImage ? [artDefs, artImage] : []),
      rim,
      inset,
      gloss,
    );
  }
  group.append(token);

  return {
    kind: spec.kind,
    token,
    title,
    shadow,
    base,
    rim,
    inset,
    detail,
    glyph: glyphElement,
    gloss,
    artDefs,
    artClip,
    artImage,
  };
}
