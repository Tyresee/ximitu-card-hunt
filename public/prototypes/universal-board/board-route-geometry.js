function requireNode(nodeById, nodeId, edgeId) {
  const node = nodeById.get(nodeId);
  if (!node) {
    throw new Error(`Could not resolve ${nodeId} for ${edgeId}`);
  }
  return node;
}

export function resolvedEdgePathData(edge, nodeById) {
  if (typeof edge?.pathData === "string" && edge.pathData.trim()) {
    return edge.pathData;
  }
  const from = requireNode(nodeById, edge?.from, edge?.id || "edge");
  const to = requireNode(nodeById, edge?.to, edge?.id || "edge");
  const middleX = (from.x + to.x) / 2;
  const branchCurve = edge.id.endsWith("a") ? -22 : edge.id.endsWith("b") ? 22 : 0;
  const middleY = (from.y + to.y) / 2 + branchCurve;
  return `M ${from.x} ${from.y} Q ${middleX} ${middleY} ${to.x} ${to.y}`;
}

export function compoundRoutePathData(edges, nodeById) {
  return edges.map((edge) => resolvedEdgePathData(edge, nodeById)).join(" ");
}

export function resolvedTransportPreviewPathData(space, nodeById) {
  const target = nodeById.get(space?.transportTargetId);
  const through = nodeById.get(space?.transportCaptureNodeIds?.[0]);
  if (!space || !target) return "";
  if (!through) {
    return `M ${space.x} ${space.y} Q ${(space.x + target.x) / 2} ${
      Math.min(space.y, target.y) - 90
    } ${target.x} ${target.y}`;
  }
  return (
    `M ${space.x} ${space.y} `
    + `Q ${(space.x + through.x) / 2} ${Math.min(space.y, through.y) - 76} `
    + `${through.x} ${through.y - 20} `
    + `Q ${(through.x + target.x) / 2} ${Math.min(through.y - 20, target.y) - 55} `
    + `${target.x} ${target.y}`
  );
}
