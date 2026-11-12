const SVG_NS = "http://www.w3.org/2000/svg";

const FACILITY_DEFAULTS = Object.freeze({
  "mooring-crane": Object.freeze({
    label: "停靠锚吊机",
    state: "idle",
  }),
  "signal-cannon": Object.freeze({
    label: "云霄信号炮",
    state: "ready",
  }),
  "harbor-foghorn": Object.freeze({
    label: "港口雾笛",
    state: "ready",
  }),
  "cloudfall-gate": Object.freeze({
    label: "云瀑水门",
    state: "closed",
  }),
  "departure-beacon": Object.freeze({
    label: "远航灯塔信号",
    state: "dark",
  }),
});

function normalizedState(state, fallback) {
  const source = typeof state === "string" ? state.trim().toLowerCase() : "";
  return /^[a-z][a-z0-9-]*$/.test(source) ? source : fallback;
}

function normalizedAimAngle(aimAngle) {
  const numeric = Number(aimAngle);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-180, Math.min(180, numeric));
}

function requireSvgHost(host) {
  if (!host || typeof host.append !== "function") {
    throw new TypeError("harbor facility visuals require an SVG host");
  }
  const documentRef = host.ownerDocument || globalThis.document;
  if (!documentRef?.createElementNS) {
    throw new TypeError("harbor facility visuals require an SVG-capable document");
  }
  return documentRef;
}

function svgElement(documentRef, name, attributes = {}) {
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function decorativeElement(documentRef, name, attributes = {}) {
  return svgElement(documentRef, name, {
    ...attributes,
    "aria-hidden": "true",
  });
}

function normalizedAssetRef(assetRef) {
  const source = typeof assetRef === "string" ? assetRef.trim() : "";
  return source.startsWith("/") ? source : null;
}

function setArtFallbackState(fallbackElements, state) {
  fallbackElements
    .filter(Boolean)
    .forEach((element) => {
      element.setAttribute("data-facility-art-fallback", state);
    });
}

export function appendFacilityArtImage(documentRef, host, {
  assetRef,
  className,
  x,
  y,
  width,
  height,
  fallbackElements = [],
} = {}) {
  const resolvedAssetRef = normalizedAssetRef(assetRef);
  if (!resolvedAssetRef) return null;

  const image = decorativeElement(documentRef, "image", {
    x,
    y,
    width,
    height,
    class: `facility-art-image ${className || ""}`.trim(),
    preserveAspectRatio: "xMidYMid meet",
    "pointer-events": "none",
    decoding: "async",
    "data-facility-art-state": "loading",
  });
  setArtFallbackState(fallbackElements, "visible");
  const revealArt = () => {
    image.setAttribute("data-facility-art-state", "ready");
    setArtFallbackState(fallbackElements, "hidden");
  };
  const revealFallback = () => {
    image.removeAttribute("href");
    image.setAttribute("data-facility-art-state", "unavailable");
    setArtFallbackState(fallbackElements, "visible");
  };
  image.addEventListener?.("load", revealArt, { once: true });
  image.addEventListener?.("error", revealFallback, { once: true });
  image.setAttribute("href", resolvedAssetRef);
  host.append(image);
  return image;
}

function facilityRoot(host, kind, {
  state,
  label,
  phase = "idle",
} = {}) {
  const documentRef = requireSvgHost(host);
  const defaults = FACILITY_DEFAULTS[kind];
  if (!defaults) throw new TypeError(`unknown harbor facility kind: ${kind}`);
  const visualState = normalizedState(state, defaults.state);
  const visualPhase = normalizedState(phase, "idle");
  const visualLabel = typeof label === "string" && label.trim()
    ? label.trim()
    : defaults.label;
  const facility = svgElement(documentRef, "g", {
    class: (
      `harbor-facility harbor-facility-${kind} `
      + `facility-state-${visualState}`
    ),
    "data-facility-kind": kind,
    "data-facility-state": visualState,
    "data-facility-phase": visualPhase,
  });
  const title = svgElement(documentRef, "title", {
    class: "harbor-facility-title",
  });
  title.textContent = visualLabel;
  facility.append(title);
  host.append(facility);
  return {
    documentRef,
    facility,
    title,
    kind,
    state: visualState,
    phase: visualPhase,
    label: visualLabel,
  };
}

export function appendMooringCrane(host, {
  state,
  label,
  phase,
  art,
} = {}) {
  const root = facilityRoot(host, "mooring-crane", { state, label, phase });
  const { documentRef, facility } = root;

  const shadow = decorativeElement(documentRef, "ellipse", {
    cx: 0,
    cy: 31,
    rx: 49,
    ry: 9,
    class: "facility-shadow facility-crane-shadow",
  });
  const base = decorativeElement(documentRef, "g", {
    class: "facility-crane-base",
  });
  base.append(
    decorativeElement(documentRef, "path", {
      d: "M -42 20 H -13 L -7 29 H -47 Z",
      class: "facility-crane-foot facility-crane-foot-left",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 12 20 H 41 L 47 29 H 7 Z",
      class: "facility-crane-foot facility-crane-foot-right",
    }),
    decorativeElement(documentRef, "rect", {
      x: -34,
      y: 13,
      width: 68,
      height: 12,
      rx: 5,
      class: "facility-crane-platform",
    }),
  );
  const baseArt = appendFacilityArtImage(documentRef, base, {
    assetRef: art?.baseAssetRef,
    className: "facility-crane-base-art",
    x: -55,
    y: 3,
    width: 110,
    height: 69,
    fallbackElements: [...base.children],
  });

  const motion = decorativeElement(documentRef, "g", {
    class: "facility-crane-motion",
  });
  const mast = decorativeElement(documentRef, "g", {
    class: "facility-crane-mast",
  });
  mast.append(
    decorativeElement(documentRef, "path", {
      d: "M -27 14 L -17 -45 H -6 L -9 14 Z",
      class: "facility-crane-mast-body",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -20 -31 H -8 M -23 -16 H -9 M -25 0 H -10",
      class: "facility-crane-mast-braces",
    }),
  );
  const boom = decorativeElement(documentRef, "g", {
    class: "facility-crane-boom",
  });
  boom.append(
    decorativeElement(documentRef, "path", {
      d: "M -16 -43 L 35 -30 L 31 -20 L -18 -35 Z",
      class: "facility-crane-boom-body",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -8 -39 L 28 -29 M 4 -36 L 0 -29 M 18 -33 L 14 -25",
      class: "facility-crane-boom-braces",
    }),
    decorativeElement(documentRef, "circle", {
      cx: 32,
      cy: -25,
      r: 5,
      class: "facility-crane-pulley",
    }),
  );
  const cable = decorativeElement(documentRef, "g", {
    class: "facility-crane-cable",
  });
  cable.append(
    decorativeElement(documentRef, "path", {
      d: "M 32 -25 V 1",
      class: "facility-crane-cable-line",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 26 0 Q 32 9 38 0",
      class: "facility-crane-hook",
    }),
  );
  motion.append(mast, boom);
  const upperArt = appendFacilityArtImage(documentRef, motion, {
    assetRef: art?.upperAssetRef,
    className: "facility-crane-upper-art",
    x: -40,
    y: -54,
    width: 78,
    height: 74,
    fallbackElements: [mast, boom],
  });
  motion.append(cable);

  const anchorCrate = decorativeElement(documentRef, "g", {
    class: "facility-mooring-anchor-crate",
    transform: "translate(32 12)",
  });
  anchorCrate.append(
    decorativeElement(documentRef, "rect", {
      x: -17,
      y: -10,
      width: 34,
      height: 23,
      rx: 5,
      class: "facility-anchor-crate-body",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -17 -5 H 17 M -8 -10 V 13 M 8 -10 V 13",
      class: "facility-anchor-crate-braces",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 0 -5 V 7 M -7 2 Q -5 10 0 10 Q 5 10 7 2 M -7 2 V 6 M 7 2 V 6",
      class: "facility-anchor-crate-glyph",
    }),
  );
  const crateArt = appendFacilityArtImage(documentRef, anchorCrate, {
    assetRef: art?.crateAssetRef,
    className: "facility-crane-crate-art",
    x: -20,
    y: -16,
    width: 40,
    height: 40,
    fallbackElements: [...anchorCrate.children],
  });

  facility.append(shadow, base, motion, anchorCrate);
  return {
    ...root,
    shadow,
    base,
    motion,
    mast,
    boom,
    cable,
    anchorCrate,
    artImages: {
      base: baseArt,
      upper: upperArt,
      crate: crateArt,
    },
  };
}

export function appendSignalCannon(host, {
  state,
  label,
  phase,
  art,
  aimAngle = 0,
} = {}) {
  const root = facilityRoot(host, "signal-cannon", { state, label, phase });
  const { documentRef, facility } = root;
  const angle = normalizedAimAngle(aimAngle);
  facility.setAttribute("data-aim-angle", String(angle));

  const shadow = decorativeElement(documentRef, "ellipse", {
    cx: 0,
    cy: 29,
    rx: 48,
    ry: 10,
    class: "facility-shadow facility-cannon-shadow",
  });
  const cloudPad = decorativeElement(documentRef, "g", {
    class: "facility-cannon-cloud-pad",
  });
  cloudPad.append(
    decorativeElement(documentRef, "ellipse", {
      cx: -24,
      cy: 22,
      rx: 22,
      ry: 11,
      class: "facility-cloud-puff facility-cloud-puff-left",
    }),
    decorativeElement(documentRef, "ellipse", {
      cx: 0,
      cy: 18,
      rx: 28,
      ry: 14,
      class: "facility-cloud-puff facility-cloud-puff-center",
    }),
    decorativeElement(documentRef, "ellipse", {
      cx: 27,
      cy: 23,
      rx: 21,
      ry: 10,
      class: "facility-cloud-puff facility-cloud-puff-right",
    }),
  );

  const base = decorativeElement(documentRef, "g", {
    class: "facility-cannon-base",
  });
  base.append(
    decorativeElement(documentRef, "path", {
      d: "M -30 4 H 13 L 25 20 H -37 Z",
      class: "facility-cannon-carriage",
    }),
    decorativeElement(documentRef, "circle", {
      cx: -24,
      cy: 21,
      r: 10,
      class: "facility-cannon-wheel facility-cannon-wheel-left",
    }),
    decorativeElement(documentRef, "circle", {
      cx: 12,
      cy: 21,
      r: 10,
      class: "facility-cannon-wheel facility-cannon-wheel-right",
    }),
    decorativeElement(documentRef, "circle", {
      cx: -24,
      cy: 21,
      r: 4,
      class: "facility-cannon-wheel-hub facility-cannon-wheel-hub-left",
    }),
    decorativeElement(documentRef, "circle", {
      cx: 12,
      cy: 21,
      r: 4,
      class: "facility-cannon-wheel-hub facility-cannon-wheel-hub-right",
    }),
  );
  const baseArtLayer = decorativeElement(documentRef, "g", {
    class: "facility-cannon-base-art-layer",
  });
  const baseArt = appendFacilityArtImage(documentRef, baseArtLayer, {
    assetRef: art?.baseAssetRef,
    className: "facility-cannon-base-art",
    x: -49,
    y: -15,
    width: 78,
    height: 69,
    fallbackElements: [cloudPad, base],
  });

  const aimAxis = decorativeElement(documentRef, "g", {
    class: "facility-cannon-aim-axis",
    transform: `rotate(${angle})`,
  });
  const aim = decorativeElement(documentRef, "g", {
    class: "facility-cannon-aim",
  });
  aim.append(
    decorativeElement(documentRef, "rect", {
      x: -30,
      y: -17,
      width: 54,
      height: 22,
      rx: 9,
      class: "facility-cannon-barrel",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 20 -19 L 37 -14 L 37 2 L 20 7 Z",
      class: "facility-cannon-muzzle",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -24 -12 H 15 M -20 -5 H 17",
      class: "facility-cannon-barrel-ribs",
    }),
  );
  const barrelArt = appendFacilityArtImage(documentRef, aim, {
    assetRef: art?.barrelAssetRef,
    className: "facility-cannon-barrel-art",
    x: -32,
    y: -20,
    width: 74,
    height: 39,
    fallbackElements: [...aim.children],
  });
  aimAxis.append(aim);

  const core = decorativeElement(documentRef, "g", {
    class: "facility-cannon-core",
    transform: "translate(-8 -6)",
  });
  core.append(
    decorativeElement(documentRef, "circle", {
      r: 12,
      class: "facility-cannon-core-ring facility-cannon-core-ring-outer",
    }),
    decorativeElement(documentRef, "circle", {
      r: 6,
      class: "facility-cannon-core-ring facility-cannon-core-ring-inner",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 0 -17 V -13 M 17 0 H 13 M 0 17 V 13 M -17 0 H -13",
      class: "facility-cannon-core-ticks",
    }),
  );

  const bubblePod = decorativeElement(documentRef, "g", {
    class: "facility-cannon-bubble-pod",
    transform: "translate(-22 -1)",
  });
  bubblePod.append(
    decorativeElement(documentRef, "circle", {
      r: 11,
      class: "facility-cannon-bubble-shell",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -6 -4 Q 0 -9 6 -4",
      class: "facility-cannon-bubble-gloss",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -7 7 H 7 L 4 12 H -4 Z",
      class: "facility-cannon-bubble-seat",
    }),
  );

  facility.append(
    shadow,
    cloudPad,
    base,
    baseArtLayer,
    aimAxis,
    core,
    bubblePod,
  );
  return {
    ...root,
    aimAngle: angle,
    shadow,
    cloudPad,
    base,
    aimAxis,
    aim,
    core,
    bubblePod,
    muzzle: aim.children[1],
    artImages: {
      base: baseArt,
      barrel: barrelArt,
    },
  };
}

export function appendHarborFoghorn(host, {
  state,
  label,
  phase,
  art,
} = {}) {
  const root = facilityRoot(host, "harbor-foghorn", { state, label, phase });
  const { documentRef, facility } = root;

  const shadow = decorativeElement(documentRef, "ellipse", {
    cx: 0,
    cy: 27,
    rx: 43,
    ry: 9,
    class: "facility-shadow facility-foghorn-shadow",
  });
  const base = decorativeElement(documentRef, "g", {
    class: "facility-foghorn-base",
  });
  base.append(
    decorativeElement(documentRef, "path", {
      d: "M -21 7 H 12 L 22 25 H -31 Z",
      class: "facility-foghorn-stand",
    }),
    decorativeElement(documentRef, "rect", {
      x: -27,
      y: 21,
      width: 55,
      height: 8,
      rx: 4,
      class: "facility-foghorn-foot",
    }),
  );

  const motion = decorativeElement(documentRef, "g", {
    class: "facility-foghorn-motion",
  });
  const throat = decorativeElement(documentRef, "path", {
    d: "M -31 -10 H -9 V 10 H -31 Q -38 0 -31 -10 Z",
    class: "facility-foghorn-throat",
  });
  const diaphragm = decorativeElement(documentRef, "g", {
    class: "facility-foghorn-diaphragm",
    transform: "translate(-9 0)",
  });
  diaphragm.append(
    decorativeElement(documentRef, "ellipse", {
      rx: 5,
      ry: 12,
      class: "facility-foghorn-diaphragm-ring",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -2 -8 Q 3 0 -2 8",
      class: "facility-foghorn-diaphragm-membrane",
    }),
  );
  const bell = decorativeElement(documentRef, "path", {
    d: "M -8 -14 L 27 -26 V 26 L -8 14 Z",
    class: "facility-foghorn-bell",
  });
  const waves = decorativeElement(documentRef, "g", {
    class: "facility-foghorn-waves",
  });
  waves.append(
    decorativeElement(documentRef, "path", {
      d: "M 34 -12 Q 47 0 34 12",
      class: "facility-foghorn-wave facility-foghorn-wave-near",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 42 -20 Q 63 0 42 20",
      class: "facility-foghorn-wave facility-foghorn-wave-far",
    }),
  );
  motion.append(throat, diaphragm, bell);
  const bodyArt = appendFacilityArtImage(documentRef, motion, {
    assetRef: art?.bodyAssetRef,
    className: "facility-foghorn-body-art",
    x: -45,
    y: -50,
    width: 74,
    height: 88,
    fallbackElements: [base, throat, diaphragm, bell],
  });
  motion.append(waves);

  const lampMount = decorativeElement(documentRef, "g", {
    class: "facility-foghorn-lamp-mount",
    transform: "translate(-20 -22)",
  });
  const lamp = decorativeElement(documentRef, "g", {
    class: "facility-foghorn-lamp",
  });
  lamp.append(
    decorativeElement(documentRef, "path", {
      d: "M -7 7 H 7 L 5 12 H -5 Z",
      class: "facility-foghorn-lamp-base",
    }),
    decorativeElement(documentRef, "circle", {
      cy: 0,
      r: 7,
      class: "facility-foghorn-lamp-lens",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -3 -3 Q 0 -5 3 -3",
      class: "facility-foghorn-lamp-gloss",
    }),
  );
  const lampArt = appendFacilityArtImage(documentRef, lamp, {
    assetRef: art?.lampAssetRef,
    className: "facility-foghorn-lamp-art",
    x: -10,
    y: -13,
    width: 20,
    height: 26,
    fallbackElements: [...lamp.children],
  });
  lampMount.append(lamp);

  facility.append(shadow, base, motion, lampMount);
  return {
    ...root,
    shadow,
    base,
    motion,
    throat,
    diaphragm,
    bell,
    waves,
    lampMount,
    lamp,
    artImages: {
      body: bodyArt,
      lamp: lampArt,
    },
  };
}

export function appendCloudfallGate(host, {
  state,
  label,
  phase,
  art,
} = {}) {
  const root = facilityRoot(host, "cloudfall-gate", { state, label, phase });
  const { documentRef, facility } = root;

  const shadow = decorativeElement(documentRef, "ellipse", {
    cx: 12,
    cy: 31,
    rx: 66,
    ry: 10,
    class: "facility-shadow facility-cloudfall-shadow",
  });
  const base = decorativeElement(documentRef, "g", {
    class: "facility-cloudfall-base",
  });
  base.append(
    decorativeElement(documentRef, "path", {
      d: "M -48 22 H 2 L 10 31 H -55 Z",
      class: "facility-cloudfall-plinth",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -39 20 V -25 H -26 V 20 M -10 20 V -25 H 3 V 20 M -43 -25 H 7 V -15 H -43 Z",
      class: "facility-cloudfall-frame",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -25 -14 H -11 V 20 H -25 Z",
      class: "facility-cloudfall-sluice",
    }),
  );
  const baseArt = appendFacilityArtImage(documentRef, base, {
    assetRef: art?.baseAssetRef,
    className: "facility-cloudfall-base-art",
    x: -58,
    y: -38,
    width: 80,
    height: 55,
    fallbackElements: [...base.children],
  });

  const wheelMount = decorativeElement(documentRef, "g", {
    class: "facility-cloudfall-wheel-mount",
    transform: "translate(-17 -2)",
  });
  const wheel = decorativeElement(documentRef, "g", {
    class: "facility-cloudfall-wheel",
  });
  wheel.append(
    decorativeElement(documentRef, "circle", {
      r: 16,
      class: "facility-cloudfall-wheel-rim",
    }),
    decorativeElement(documentRef, "circle", {
      r: 5,
      class: "facility-cloudfall-wheel-hub",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 0 -15 V 15 M -15 0 H 15 M -11 -11 L 11 11 M 11 -11 L -11 11",
      class: "facility-cloudfall-wheel-spokes",
    }),
  );
  const wheelArt = appendFacilityArtImage(documentRef, wheel, {
    assetRef: art?.wheelAssetRef,
    className: "facility-cloudfall-wheel-art",
    x: -19,
    y: -18,
    width: 38,
    height: 36,
    fallbackElements: [...wheel.children],
  });
  wheelMount.append(wheel);

  const water = decorativeElement(documentRef, "g", {
    class: "facility-cloudfall-water",
  });
  water.append(
    decorativeElement(documentRef, "path", {
      d: "M -24 -12 Q -17 -5 -24 2 Q -17 9 -24 20",
      class: "facility-cloudfall-water-stream facility-cloudfall-water-stream-left",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -17 -12 Q -10 -5 -17 2 Q -10 9 -17 20",
      class: "facility-cloudfall-water-stream facility-cloudfall-water-stream-right",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -33 24 Q -19 17 -5 24 Q 9 31 21 24",
      class: "facility-cloudfall-water-pool",
    }),
  );

  const cloudSteps = decorativeElement(documentRef, "g", {
    class: "facility-cloudfall-cloud-steps",
  });
  const stepPositions = [
    { x: 17, y: 19, scale: 0.82 },
    { x: 39, y: 4, scale: 0.92 },
    { x: 64, y: -13, scale: 1 },
  ];
  const steps = stepPositions.map(({ x, y, scale }, index) => {
    const step = decorativeElement(documentRef, "g", {
      class: `facility-cloudfall-cloud-step facility-cloudfall-cloud-step-${index + 1}`,
      transform: `translate(${x} ${y}) scale(${scale})`,
      "data-cloud-step": index + 1,
    });
    step.append(
      decorativeElement(documentRef, "ellipse", {
        cx: -8,
        cy: 0,
        rx: 12,
        ry: 7,
        class: "facility-cloudfall-step-puff facility-cloudfall-step-puff-left",
      }),
      decorativeElement(documentRef, "ellipse", {
        cx: 3,
        cy: -3,
        rx: 15,
        ry: 10,
        class: "facility-cloudfall-step-puff facility-cloudfall-step-puff-center",
      }),
      decorativeElement(documentRef, "ellipse", {
        cx: 14,
        cy: 1,
        rx: 11,
        ry: 7,
        class: "facility-cloudfall-step-puff facility-cloudfall-step-puff-right",
      }),
    );
    cloudSteps.append(step);
    return step;
  });

  facility.append(shadow, base, wheelMount, water, cloudSteps);
  return {
    ...root,
    shadow,
    base,
    wheelMount,
    wheel,
    water,
    cloudSteps,
    steps,
    artImages: {
      base: baseArt,
      wheel: wheelArt,
    },
  };
}

export function appendDepartureBeacon(host, {
  state,
  label,
  phase,
  art,
  pedestal = false,
} = {}) {
  const root = facilityRoot(host, "departure-beacon", { state, label, phase });
  const { documentRef, facility } = root;

  // New terrain has no baked lighthouse. Anchor its existing signal effect to
  // a small physical lantern beside the route instead of floating lens artwork.
  if (pedestal) {
    const stand = decorativeElement(documentRef, "g", { class: "facility-beacon-pedestal", "pointer-events": "none" });
    stand.append(
      decorativeElement(documentRef, "ellipse", { cx: 0, cy: 39, rx: 23, ry: 7, fill: "#527b6b", opacity: .2 }),
      decorativeElement(documentRef, "path", { d: "M -15 27 L -13 38 Q 0 45 13 38 L 15 27 Z", fill: "#b4cdb8", stroke: "#789d88", "stroke-width": 1.5 }),
      decorativeElement(documentRef, "path", { d: "M -8 29 L -6 9 H 6 L 8 29 Q 0 35 -8 29 Z", fill: "#e2dfbe", stroke: "#9eac81", "stroke-width": 1.5 }),
      decorativeElement(documentRef, "path", { d: "M -14 -12 Q 0 -32 14 -12 Z", fill: "#739c90", stroke: "#4e7e73", "stroke-width": 1.5 }),
    );
    facility.append(stand);
  }

  const beam = decorativeElement(documentRef, "g", {
    class: "facility-beacon-beam",
  });
  beam.append(
    decorativeElement(documentRef, "path", {
      d: "M 4 -3 L 126 -35 L 126 29 L 4 4 Z",
      class: "facility-beacon-beam-cone",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 8 0 L 116 -20",
      class: "facility-beacon-beam-core",
    }),
  );

  const lens = decorativeElement(documentRef, "g", {
    class: "facility-beacon-lens",
  });
  lens.append(
    decorativeElement(documentRef, "circle", {
      r: 17,
      class: "facility-beacon-lens-halo",
    }),
    decorativeElement(documentRef, "circle", {
      r: 9,
      class: "facility-beacon-lens-glass",
    }),
    decorativeElement(documentRef, "path", {
      d: "M -4 -4 Q 0 -8 4 -4",
      class: "facility-beacon-lens-gloss",
    }),
  );
  const lensArt = appendFacilityArtImage(documentRef, lens, {
    assetRef: art?.lensAssetRef,
    className: "facility-beacon-lens-art",
    x: -19,
    y: -17,
    width: 38,
    height: 34,
    fallbackElements: [...lens.children],
  });

  const flags = decorativeElement(documentRef, "g", {
    class: "facility-beacon-flags",
  });
  flags.append(
    decorativeElement(documentRef, "path", {
      d: "M -28 18 V -17 M -27 -15 Q -13 -21 1 -14 Q -13 -6 -27 -10 Z",
      class: "facility-beacon-flag facility-beacon-flag-left",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 22 20 V -11 M 23 -9 Q 34 -14 45 -8 Q 34 -2 23 -5 Z",
      class: "facility-beacon-flag facility-beacon-flag-right",
    }),
  );

  const birds = decorativeElement(documentRef, "g", {
    class: "facility-beacon-birds",
  });
  birds.append(
    decorativeElement(documentRef, "path", {
      d: "M 45 -37 Q 52 -44 59 -37 Q 66 -44 73 -37",
      class: "facility-beacon-bird facility-beacon-bird-near",
    }),
    decorativeElement(documentRef, "path", {
      d: "M 75 -54 Q 80 -59 85 -54 Q 90 -59 95 -54",
      class: "facility-beacon-bird facility-beacon-bird-far",
    }),
  );

  facility.append(beam, lens, flags, birds);
  return {
    ...root,
    lens,
    beam,
    flags,
    birds,
    artImages: {
      lens: lensArt,
    },
  };
}
