// Landing points printed on the tile itself (score style "A"): the stone is
// tinted by value tier and the number sits on its top face, so tile and score
// read as one object. Presentation only; amounts come from the locked rule.

export const TILE_POINT_TIERS = Object.freeze([
  Object.freeze({ id: "t1000", min: 1000, top: "#efe0ff", front: "#9b5de5", line: "#7d45c9", ink: "#4e2783" }),
  Object.freeze({ id: "t500", min: 500, top: "#ffe3c2", front: "#f08a24", line: "#d0701a", ink: "#8a4300" }),
  Object.freeze({ id: "t300", min: 300, top: "#dbefff", front: "#4a90d9", line: "#3a78bd", ink: "#1f4f86" }),
  Object.freeze({ id: "t200", min: 200, top: "#dff6d6", front: "#5fb36a", line: "#4c9a57", ink: "#2d6b37" }),
  Object.freeze({ id: "t100", min: -Infinity, top: "#fff4cc", front: "#e2b552", line: "#c99a3a", ink: "#8a5a10" }),
]);

export function tilePointsTier(amount, valueScale = 1) {
  const value = Number(amount) / (valueScale === 5 ? 5 : 1);
  return TILE_POINT_TIERS.find((tier) => value >= tier.min) || TILE_POINT_TIERS.at(-1);
}

/** Printed text: just the number; a transport entry shows where the points are paid. */
export function tilePointsText({ amount, transported = false }) {
  return transported ? `→${amount}` : String(amount);
}

/**
 * Tint the grounded stone and print the number on it.
 * group: the node's <g class="board-space">; token: its .grounded-node (or null for classic nodes).
 * occupied: a pawn stands here → the number moves to a tab on the stone's front edge.
 */
export function appendTilePoints(group, { svgElement, amount, transported = false, token = null, occupied = false, valueScale = 1 }) {
  const tier = tilePointsTier(amount, valueScale);
  const text = tilePointsText({ amount, transported });
  group.classList.add("has-tile-points", `tile-tier-${tier.id}`);
  group.classList.toggle("has-tile-pawn", Boolean(occupied));
  group.setAttribute("data-tile-points-tier", tier.id);
  group.style.setProperty("--tile-top", tier.top);
  group.style.setProperty("--tile-front", tier.front);
  group.style.setProperty("--tile-line", tier.line);
  group.style.setProperty("--tile-ink", tier.ink);
  if (token) {
    token.style.setProperty("--grounded-stone-top", tier.top);
    token.style.setProperty("--grounded-stone-front", tier.front);
    token.style.setProperty("--grounded-stone-line", tier.line);
  }
  const long = text.length >= 4;
  const points = svgElement("g", {
    class: `tile-points${token ? " is-grounded" : " is-classic"}${long ? " is-long" : ""}`,
    "data-tile-points": String(amount),
    "aria-hidden": "true",
  });
  // Tab on the stone's front edge: used for classic nodes and when a pawn covers the top face.
  const tab = svgElement("g", { class: "tile-points-tab", transform: "translate(0 25)" });
  const tabWidth = long ? 46 : 38;
  tab.append(
    svgElement("rect", { class: "tile-points-tab-shadow", x: -tabWidth / 2, y: -7.5, width: tabWidth, height: 18, rx: 9 }),
    svgElement("rect", { x: -tabWidth / 2, y: -9, width: tabWidth, height: 18, rx: 9 }),
  );
  const tabText = svgElement("text", { x: 0, y: 0.5, "text-anchor": "middle", "dominant-baseline": "central" });
  tabText.textContent = text;
  tab.append(tabText);
  const face = svgElement("text", {
    class: "tile-points-face", x: 0, y: -1.5, "text-anchor": "middle", "dominant-baseline": "central",
    transform: "scale(1 .9)",
  });
  face.textContent = text;
  points.append(face, tab);
  group.append(points);
  return points;
}
