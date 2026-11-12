// Terrain colors are presentation only. Coordinates and paths are supplied by
// the board renderer, including any validated layout-editor overrides.
export const CRYSTAL_TERRAIN_TONES = Object.freeze({
  "zone-01": Object.freeze({ contact: "#466f6b", edge: "#83bdb0", surface: "#c6e6d7", stepping: "#e2f2e7" }),
  "zone-02": Object.freeze({ contact: "#6e7842", edge: "#bac681", surface: "#e6edb8", stepping: "#f6f4d6" }),
  "zone-03": Object.freeze({ contact: "#80598d", edge: "#c49bcf", surface: "#ead1ef", stepping: "#f9e9fa" }),
  "zone-04": Object.freeze({ contact: "#4c588a", edge: "#9aabd4", surface: "#cddbf3", stepping: "#e7edfc" }),
});

/** Every ordinary edge is assigned once. Cross-terrain paths get an oriented
 * material gradient; this never clips, reroutes, or duplicates a movement edge. */
export function crystalRouteSurfaces({ edges, nodeById, zoneForNode, edgePath, timberEdgeIds = [] }) {
  const timberIds = new Set(timberEdgeIds);
  const groups = new Map();
  for (const edge of edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    const fromZone = zoneForNode(from);
    const toZone = zoneForNode(to);
    const material = timberIds.has(edge.id) ? "timber" : "stone";
    const crossing = fromZone !== toZone && material !== "timber";
    const id = material === "timber" ? "timber" : crossing ? `seam-${edge.id}` : fromZone;
    if (!groups.has(id)) {
      groups.set(id, {
        id, material, entries: [],
        palette: material === "timber" ? undefined : CRYSTAL_TERRAIN_TONES[fromZone],
        transition: crossing ? {
          from: { x: from.x, y: from.y, palette: CRYSTAL_TERRAIN_TONES[fromZone] },
          to: { x: to.x, y: to.y, palette: CRYSTAL_TERRAIN_TONES[toZone] },
        } : undefined,
      });
    }
    groups.get(id).entries.push({ id: edge.id, d: edgePath(edge) });
  }
  return [...groups.values()];
}
