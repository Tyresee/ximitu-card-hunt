// Theme-only road surfaces. The caller supplies the already resolved board paths;
// this module never resolves nodes, changes geometry, or owns route interaction.
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function defaultSvgElement(tagName, attributes) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, String(value));
  });
  return element;
}

function decorativeElement(svgElement, tagName, attributes = {}) {
  return svgElement(tagName, {
    ...attributes,
    "pointer-events": "none",
    "aria-hidden": "true",
    focusable: "false",
  });
}

function definitionIds(prefix) {
  if (typeof prefix !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix)) {
    throw new TypeError("Grounded route definitions need a unique SVG-safe prefix");
  }
  return {
    stone: `${prefix}-stone-grain`,
    timber: `${prefix}-timber-grain`,
  };
}

/** Create reusable vector texture definitions for one board instance. */
export function createGroundedRouteDefs({
  prefix,
  svgElement = defaultSvgElement,
} = {}) {
  const ids = definitionIds(prefix);
  const defs = decorativeElement(svgElement, "defs", {
    "data-grounded-route-defs": prefix,
  });
  const stone = decorativeElement(svgElement, "pattern", {
    id: ids.stone,
    width: 54,
    height: 42,
    patternUnits: "userSpaceOnUse",
    patternContentUnits: "userSpaceOnUse",
  });
  // These are bounded material marks inside a tile, never map geometry.
  [
    { x: 3, y: 5, width: 19, height: 11, rx: 4, fill: "#f3eddb", opacity: 0.52 },
    { x: 30, y: 22, width: 20, height: 12, rx: 4, fill: "#bcc2aa", opacity: 0.24 },
    { x: 28, y: 3, width: 13, height: 8, rx: 3, fill: "#eee7d4", opacity: 0.4 },
    { x: 7, y: 28, width: 13, height: 9, rx: 3, fill: "#c8c9b5", opacity: 0.26 },
  ].forEach((attributes) => stone.append(decorativeElement(svgElement, "rect", attributes)));
  stone.append(
    decorativeElement(svgElement, "circle", { cx: 25, cy: 21, r: 0.8, fill: "#a3a98d", opacity: 0.34 }),
    decorativeElement(svgElement, "circle", { cx: 49, cy: 10, r: 0.65, fill: "#a3a98d", opacity: 0.24 }),
  );

  const timber = decorativeElement(svgElement, "pattern", {
    id: ids.timber,
    width: 40,
    height: 26,
    patternUnits: "userSpaceOnUse",
    patternContentUnits: "userSpaceOnUse",
  });
  timber.append(
    decorativeElement(svgElement, "path", {
      d: "M 2 6 Q 11 3 23 6 M 14 18 Q 26 21 38 18",
      fill: "none",
      stroke: "#f0dcb7",
      "stroke-width": 1,
      "stroke-linecap": "round",
      opacity: 0.34,
    }),
    decorativeElement(svgElement, "path", {
      d: "M 5 9 Q 13 7 20 9 M 22 23 L 32 23",
      fill: "none",
      stroke: "#958467",
      "stroke-width": 0.65,
      "stroke-linecap": "round",
      opacity: 0.24,
    }),
  );
  defs.append(stone, timber);
  return defs;
}

function materialGroup(svgElement, material, entries, textureId, palette, surfaceId) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  // Joining independent M… subpaths preserves every supplied edge byte-for-byte.
  // It also keeps the number of DOM layers independent of the number of edges.
  const d = entries.map((entry) => entry.d).join(" ");
  const group = decorativeElement(svgElement, "g", {
    class: `grounded-route-material grounded-route-${material}`,
    "data-route-material": material,
    "data-edge-ids": entries.map((entry) => entry.id).join(" "),
    ...(surfaceId ? { "data-terrain-surface": surfaceId } : {}),
    ...(palette ? { style: Object.entries(palette)
      .map(([name, color]) => `--grounded-${material}-${name}:${color}`).join(";") } : {}),
  });
  const layers = material === "stone" ? [
    { name: "contact", stroke: "#64745d", width: 36, opacity: 0.15 },
    { name: "edge", stroke: "#adb397", width: 32, opacity: 0.84 },
    { name: "surface", stroke: "#ded8bd", width: 29, opacity: 1 },
    { name: "grain", stroke: `url(#${textureId})`, width: 28, opacity: 0.86 },
    { name: "stepping", stroke: "#eee8d4", width: 15, opacity: 0.66,
      "stroke-dasharray": "10 20", "stroke-dashoffset": 5 },
  ] : [
    { name: "contact", stroke: "#526354", width: 36, opacity: 0.22 },
    { name: "edge", stroke: "#9b9477", width: 32, opacity: 0.96 },
    { name: "surface", stroke: "#cdb98f", width: 29, opacity: 1 },
    { name: "grain", stroke: `url(#${textureId})`, width: 28, opacity: 0.8 },
    { name: "seams", stroke: "#9c8c6d", width: 29, opacity: 0.48,
      "stroke-dasharray": "1 10", "stroke-dashoffset": 5, "stroke-linecap": "butt" },
  ];
  layers.forEach(({ name, width, ...attributes }) => {
    group.append(decorativeElement(svgElement, "path", {
      d,
      class: `grounded-route-${name}`,
      fill: "none",
      "stroke-width": width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      ...attributes,
    }));
  });
  return group;
}

/**
 * Returns decorative compound paths only. Supply each visible, enabled edge
 * exactly once in stone or timber; leave all route selection and active-flow
 * layers in the parent renderer, above this group.
 *
 * @param {{prefix: string, paths: {stone?: {id: string, d: string}[],
 * timber?: {id: string, d: string}[]}, svgElement?: Function}} options
 */
export function createGroundedRouteLayer({
  paths = {},
  surfaces,
  prefix,
  svgElement = defaultSvgElement,
} = {}) {
  const ids = definitionIds(prefix);
  const group = decorativeElement(svgElement, "g", {
    class: "grounded-routes",
    "data-grounded-route-prefix": prefix,
  });
  const materials = surfaces || ["stone", "timber"].map((material) => ({ material, entries: paths[material] }));
  for (const { material, entries, palette, id } of materials) {
    const surface = materialGroup(svgElement, material, entries, ids[material], palette, id);
    if (surface) group.append(surface);
  }
  return group;
}

/** Build the matching defs and road group together, without attaching either. */
export function createGroundedRouteVisuals(options) {
  const defs = createGroundedRouteDefs(options);
  const svgElement = options.svgElement || defaultSvgElement;
  const surfaces = options.surfaces?.map((surface) => {
    if (!surface.transition) return surface;
    const { from, to } = surface.transition;
    const palette = {};
    for (const name of ["contact", "edge", "surface", "stepping"]) {
      const id = `${options.prefix}-${surface.id}-${name}`;
      const gradient = decorativeElement(svgElement, "linearGradient", {
        id, gradientUnits: "userSpaceOnUse", x1: from.x, y1: from.y, x2: to.x, y2: to.y,
        "data-terrain-transition": surface.id,
        "data-terrain-edge-id": surface.entries[0].id,
      });
      gradient.append(
        decorativeElement(svgElement, "stop", { offset: "0%", "stop-color": from.palette[name] }),
        decorativeElement(svgElement, "stop", { offset: "100%", "stop-color": to.palette[name] }),
      );
      defs.append(gradient);
      palette[name] = `url(#${id})`;
    }
    return { ...surface, palette };
  });
  return {
    defs,
    group: createGroundedRouteLayer({ ...options, surfaces }),
  };
}
