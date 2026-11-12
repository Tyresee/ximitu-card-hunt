import { tilePointsTier } from "./tile-points-visuals.js";

const ASSET_ROOT = "/assets/board-themes/cloud-harbor/clay-preview";
const TILE_COLORS = { t100: "yellow", t200: "green", t300: "blue", t500: "orange", t1000: "purple" };
const ENGRAVED_VALUES = new Set([500, 1000, 1500, 2500, 5000]);

export function isClayPreviewRequest(location) {
  const query = new URLSearchParams(location?.search || "");
  return ["127.0.0.1", "localhost", "[::1]"].includes(location?.hostname)
    && query.get("visualPreview") === "clay" && query.get("layoutEditor") !== "1";
}

export function withClayPreviewTheme(baseTheme, { board, enabled = false } = {}) {
  if (!enabled || board?.id !== "ximitu-card-hunt-board.v1" || board.version !== "2.3.0") return baseTheme;
  return {
    ...baseTheme,
    clayPreview: true,
    regionArt: Object.fromEntries(Object.entries(baseTheme.regionArt || {}).map(([id, art]) => [id, {
      ...art,
      assetRef: `${ASSET_ROOT}/regions/${id.replace("region-", "")}-${id === "region-zone-01" ? "v4" : "v2"}.webp`,
      transitionFill: "#b7d99b",
    }])),
    routeSkin: { ...baseTheme.routeSkin,
      textureAssetRef: `${ASSET_ROOT}/routes/clay-stone-v1.webp`, patternSize: 96 },
  };
}

export function appendClayPreviewTile(group, { svgElement, amount, valueScale = 1, enabled = false } = {}) {
  if (!enabled) return null;
  const color = TILE_COLORS[tilePointsTier(amount, valueScale).id];
  const engraved = valueScale === 5 && ENGRAVED_VALUES.has(amount);
  const image = svgElement("image", {
    class: "clay-tile-art", x: -37, y: -28, width: 74, height: 56,
    "pointer-events": "none", "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet",
  });
  let failed = false;
  image.addEventListener("load", () => {
    if (failed) return;
    group.classList.add("has-clay-tile");
    if (engraved) group.classList.add("has-engraved-tile");
  }, { once: true });
  image.addEventListener("error", () => {
    failed = true;
    group.classList.remove("has-clay-tile", "has-engraved-tile");
    image.removeAttribute("href");
  }, { once: true });
  group.append(image);
  image.setAttribute("href", `${ASSET_ROOT}/tiles/${engraved ? `points-${amount}-v3` : `${color}-v2`}.webp`);
  return image;
}

export function appendClayRouteMaterial(group) {
  for (const surface of group.querySelectorAll(".grounded-route-stone > .grounded-route-surface")) {
    const texture = surface.cloneNode(false);
    texture.setAttribute("class", "clay-route-material");
    texture.setAttribute("stroke", "url(#route-texture-pattern)");
    texture.setAttribute("stroke-opacity", ".32");
    texture.setAttribute("pointer-events", "none");
    surface.after(texture);
  }
}

/** Place material along each real edge independently; never bridge M-subpaths. */
export function appendClayRoutePavers(group, { svgElement, paths = [] } = {}) {
  const layer = svgElement("g", {
    class: "clay-route-pavers", "pointer-events": "none", "aria-hidden": "true", opacity: 0,
  });
  const images = [];
  for (const { id, d } of paths) {
    const probe = svgElement("path", { d });
    if (typeof probe.getTotalLength !== "function") continue;
    const length = probe.getTotalLength();
    if (!(length > 0)) continue;
    const count = Math.max(1, Math.ceil(length / 88));
    for (let i = 0; i < count; i++) {
      const distance = length * (i + .5) / count;
      const point = probe.getPointAtLength(distance);
      const before = probe.getPointAtLength(Math.max(0, distance - 2));
      const after = probe.getPointAtLength(Math.min(length, distance + 2));
      const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
      const width = length / count + 7;
      const image = svgElement("image", {
        class: "clay-route-paver", "data-edge-id": id,
        x: -width / 2, y: -15, width, height: 30, preserveAspectRatio: "xMidYMid slice",
        transform: `translate(${point.x} ${point.y}) rotate(${angle})`,
        "pointer-events": "none", "aria-hidden": "true",
      });
      images.push(image); layer.append(image);
    }
  }
  if (!images.length) return null;
  let remaining = images.length;
  let failed = false;
  for (const image of images) {
    image.addEventListener("load", () => {
      remaining--;
      if (!failed && remaining === 0) {
        layer.setAttribute("opacity", "1"); group.classList.add("has-clay-pavers");
      }
    }, { once: true });
    image.addEventListener("error", () => {
      failed = true; layer.setAttribute("opacity", "0"); group.classList.remove("has-clay-pavers");
    }, { once: true });
  }
  group.append(layer);
  for (const image of images) image.setAttribute("href", `${ASSET_ROOT}/routes/clay-pavers-section-v1.webp`);
  return layer;
}

export function appendClaySpecialFlag(marker, { svgElement, label } = {}) {
  const art = svgElement("g", { class: "clay-special-art", "pointer-events": "none", "aria-hidden": "true" });
  const image = svgElement("image", { x: -36.9, y: -79.1, width: 80, height: 80,
    preserveAspectRatio: "xMidYMid meet", "pointer-events": "none", "aria-hidden": "true" });
  const fontSize = /[^\u0000-\u00ff]/.test(label) ? (Array.from(label).length >= 4 ? 12 : 16)
    : (label.length >= 4 ? 20 : 23);
  const text = svgElement("text", { class: "clay-special-label", x: 10.3, y: -49.3,
    "font-size": fontSize, "text-anchor": "middle", "dominant-baseline": "central" });
  text.textContent = label;
  art.append(image, text);
  marker.append(art);
  let failed = false;
  image.addEventListener("load", () => { if (!failed) marker.classList.add("has-clay-flag"); }, { once: true });
  image.addEventListener("error", () => {
    failed = true;
    marker.classList.remove("has-clay-flag"); image.removeAttribute("href");
  }, { once: true });
  image.setAttribute("href", `${ASSET_ROOT}/special/gold-flag-v1.webp`);
  return art;
}

// Fixture convenience only. It cannot run on a production host, and the app
// additionally waits for the local QA configuration and isolated roster.
export function installClayPreviewDemo({ location, getState, start, documentRef = globalThis.document,
  Observer = globalThis.MutationObserver, defer = globalThis.queueMicrotask } = {}) {
  if (!isClayPreviewRequest(location) || new URLSearchParams(location.search).get("demo") !== "1") return null;
  let complete = false;
  let queued = false;
  const check = () => {
    queued = false;
    if (complete) return;
    const state = getState();
    if (state.gameSession || state.hasCurrentSave) {
      complete = true; observer.disconnect(); return;
    }
    if (!state.ready || state.students.length < 2) return;
    complete = true;
    observer.disconnect();
    start(state.students.slice(0, 2));
  };
  const observer = new Observer(() => {
    if (!queued && !complete) { queued = true; defer(check); }
  });
  observer.observe(documentRef.body, { childList: true, subtree: true });
  defer(check);
  return observer;
}
