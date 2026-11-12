import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
} from "../public/prototypes/universal-board/expansion-world.js";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");

export const DEFAULT_OUTPUT_DIRECTORY = join(
  PROJECT_DIRECTORY,
  "art-source",
  "world-02-layout-guides",
);

const ROLE_STYLE = Object.freeze({
  learning: Object.freeze({ fill: "#ffffff", stroke: "#173f63", radius: 11 }),
  reward: Object.freeze({ fill: "#ffe16d", stroke: "#8a5a24", radius: 12 }),
  item: Object.freeze({ fill: "#ff9ecb", stroke: "#8d2c61", radius: 12 }),
  junction: Object.freeze({ fill: "#9b7cff", stroke: "#40218e", radius: 15 }),
  transport: Object.freeze({ fill: "#52dff2", stroke: "#06697e", radius: 15 }),
  "map-effect": Object.freeze({ fill: "#73dfca", stroke: "#127d67", radius: 14 }),
  treasure: Object.freeze({ fill: "#ffbd5c", stroke: "#8a4b18", radius: 13 }),
  goal: Object.freeze({ fill: "#ff6b7f", stroke: "#8c2035", radius: 16 }),
});

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stableSha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getRegionContext(
  boardTemplate,
  region,
) {
  const zone = boardTemplate.zones.find(({ id }) => id === region.zoneId);
  if (!zone) {
    throw new Error(
      `World layout guide ${region.id} references missing zone ${region.zoneId}`,
    );
  }

  const { x, y, width, height } = region.artBox;
  if (
    ![x, y, width, height].every(Number.isFinite)
    || width <= 0
    || height <= 0
  ) {
    throw new Error(`World layout guide ${region.id} has an invalid artBox`);
  }
  if (
    x !== zone.bounds.x
    || y !== zone.bounds.y
    || width !== zone.bounds.width
    || height !== zone.bounds.height
  ) {
    throw new Error(
      `World layout guide ${region.id} artBox must equal ${zone.id} bounds`,
    );
  }

  const nodes = boardTemplate.nodes.filter(({ zoneId }) => zoneId === zone.id);
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const edges = boardTemplate.edges.filter(({ from, to }) => (
    nodeIds.has(from) || nodeIds.has(to)
  ));
  const internalEdges = edges.filter(({ from, to }) => (
    nodeIds.has(from) && nodeIds.has(to)
  ));
  const boundaryEdges = edges.filter(({ from, to }) => (
    nodeIds.has(from) !== nodeIds.has(to)
  ));
  const branchNodes = nodes.filter((node) => (
    boardTemplate.edges.filter(({ from }) => from === node.id).length > 1
  ));
  const branchNodeIds = new Set(branchNodes.map(({ id }) => id));
  const branchEdges = boardTemplate.edges.filter(({ from }) => (
    branchNodeIds.has(from)
  ));
  const conditionalEdges = edges.filter(({ availableWhen }) => (
    Boolean(availableWhen)
  ));
  const transportNodes = nodes.filter(({ transportTargetId }) => (
    Boolean(transportTargetId)
  ));
  const facilityNodes = nodes.filter((node) => (
    Boolean(node.mapEffectRef) || Boolean(node.worldExitRef)
  ));

  for (const edge of edges) {
    if (!edge.pathData) {
      throw new Error(
        `World layout guide ${region.id} requires pathData for ${edge.id}`,
      );
    }
  }

  return {
    boardTemplate,
    region,
    zone,
    nodes,
    nodeIds,
    edges,
    internalEdges,
    boundaryEdges,
    branchNodes,
    branchEdges,
    conditionalEdges,
    transportNodes,
    facilityNodes,
  };
}

export function createRegionTopologySummary(
  boardTemplate,
  region,
) {
  const context = getRegionContext(boardTemplate, region);
  const transportCaptureNodeIds = context.transportNodes.flatMap(
    ({ transportCaptureNodeIds = [] }) => transportCaptureNodeIds,
  );
  const transportTargetNodeIds = context.transportNodes.map(
    ({ transportTargetId }) => transportTargetId,
  );
  const topologyProjection = {
    boardTemplateId: boardTemplate.id,
    region: {
      id: region.id,
      zoneId: region.zoneId,
      layoutContractRef: region.layoutContractRef,
      artBox: region.artBox,
      clipPath: region.clipPath,
    },
    nodes: context.nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      zoneId: node.zoneId,
      spaceRole: node.spaceRole,
      landingProfileRef: node.landingProfileRef,
      transportTargetId: node.transportTargetId || null,
      transportCaptureNodeIds: node.transportCaptureNodeIds || [],
      mapEffectRef: node.mapEffectRef || null,
      worldExitRef: node.worldExitRef || null,
    })),
    edges: context.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      terrainType: edge.terrainType,
      pathData: edge.pathData,
      order: edge.order ?? null,
      availableWhen: edge.availableWhen || null,
    })),
  };

  return Object.freeze({
    boardTemplateId: boardTemplate.id,
    regionId: region.id,
    zoneId: region.zoneId,
    layoutContractRef: region.layoutContractRef,
    artBox: Object.freeze({ ...region.artBox }),
    nodeCount: context.nodes.length,
    nodeIds: Object.freeze(context.nodes.map(({ id }) => id)),
    guideEdgeCount: context.edges.length,
    guideEdgeIds: Object.freeze(context.edges.map(({ id }) => id)),
    internalEdgeCount: context.internalEdges.length,
    boundaryEdgeCount: context.boundaryEdges.length,
    branchNodeIds: Object.freeze(context.branchNodes.map(({ id }) => id)),
    branchEdgeIds: Object.freeze(context.branchEdges.map(({ id }) => id)),
    conditionalEdgeIds: Object.freeze(
      context.conditionalEdges.map(({ id }) => id),
    ),
    transportNodeIds: Object.freeze(
      context.transportNodes.map(({ id }) => id),
    ),
    transportCaptureNodeIds: Object.freeze(transportCaptureNodeIds),
    transportTargetNodeIds: Object.freeze(transportTargetNodeIds),
    facilityNodeIds: Object.freeze(
      context.facilityNodes.map(({ id }) => id),
    ),
    topologySha256: stableSha256(topologyProjection),
  });
}

function roleStyle(node) {
  return ROLE_STYLE[node.spaceRole] || ROLE_STYLE.learning;
}

function clearanceRadius(node) {
  if (node.spaceRole === "transport") return 108;
  if (node.spaceRole === "map-effect" || node.spaceRole === "goal") return 86;
  if (node.spaceRole === "junction") return 78;
  return 58;
}

function chooseLegendBox(context) {
  const { x, y, width, height } = context.region.artBox;
  const panel = {
    width: Math.min(420, width - 48),
    height: Math.min(186, height - 48),
  };
  const candidates = [
    { x: x + 24, y: y + 24 },
    { x: x + width - panel.width - 24, y: y + 24 },
    { x: x + 24, y: y + height - panel.height - 24 },
    {
      x: x + width - panel.width - 24,
      y: y + height - panel.height - 24,
    },
  ];
  const margin = 20;

  return candidates
    .map((candidate, index) => {
      const overlapCount = context.nodes.filter((node) => (
        node.x >= candidate.x - margin
        && node.x <= candidate.x + panel.width + margin
        && node.y >= candidate.y - margin
        && node.y <= candidate.y + panel.height + margin
      )).length;
      return { ...candidate, ...panel, overlapCount, index };
    })
    .sort((a, b) => (
      a.overlapCount - b.overlapCount || a.index - b.index
    ))[0];
}

function renderEdgePaths(edges, {
  className,
  stroke,
  strokeWidth,
  dasharray,
  opacity,
  markerEnd,
}) {
  return edges.map((edge) => {
    const attributes = [
      `data-edge-id="${escapeXml(edge.id)}"`,
      `data-from="${escapeXml(edge.from)}"`,
      `data-to="${escapeXml(edge.to)}"`,
      `data-terrain-type="${escapeXml(edge.terrainType)}"`,
      `d="${escapeXml(edge.pathData)}"`,
      `class="${escapeXml(className)}"`,
      `fill="none"`,
      `stroke="${stroke}"`,
      `stroke-width="${strokeWidth}"`,
      `stroke-linecap="round"`,
      `stroke-linejoin="round"`,
    ];
    if (dasharray) attributes.push(`stroke-dasharray="${dasharray}"`);
    if (opacity !== undefined) attributes.push(`opacity="${opacity}"`);
    if (markerEnd) attributes.push(`marker-end="${markerEnd}"`);
    return `    <path ${attributes.join(" ")}><title>${escapeXml(
      `${edge.id} · ${edge.from} → ${edge.to}`,
    )}</title></path>`;
  }).join("\n");
}

function renderTransportPath(
  node,
  nodeById,
) {
  const captureNodes = (node.transportCaptureNodeIds || []).map((nodeId) => {
    const captureNode = nodeById.get(nodeId);
    if (!captureNode) {
      throw new Error(`Transport ${node.id} references missing capture ${nodeId}`);
    }
    return captureNode;
  });
  const targetNode = nodeById.get(node.transportTargetId);
  if (!targetNode) {
    throw new Error(
      `Transport ${node.id} references missing target ${node.transportTargetId}`,
    );
  }
  const pathNodes = [node, ...captureNodes, targetNode];
  const pathData = pathNodes.map(({ x, y }, index) => (
    `${index === 0 ? "M" : "L"} ${x} ${y}`
  )).join(" ");
  const labelNodes = [
    { node, prefix: "LAUNCH" },
    ...captureNodes.map((captureNode) => ({
      node: captureNode,
      prefix: "PASS",
    })),
    { node: targetNode, prefix: "LAND" },
  ];

  return [
    `    <path data-transport-node-id="${escapeXml(node.id)}" d="${pathData}" fill="none" stroke="#3ed7ee" stroke-width="118" stroke-linecap="round" stroke-linejoin="round" opacity="0.17" />`,
    `    <path data-transport-node-id="${escapeXml(node.id)}" d="${pathData}" fill="none" stroke="#087f9a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="13 11" marker-end="url(#transport-arrow)" />`,
    ...labelNodes.map(({ node: labelNode, prefix }, index) => (
      `    <text data-transport-label="${prefix.toLowerCase()}" x="${labelNode.x}" y="${labelNode.y - 25 - (index % 2) * 4}" text-anchor="middle" style="paint-order:stroke;stroke:#ffffff;stroke-width:5;stroke-linejoin:round">${prefix} · ${escapeXml(labelNode.id)} · ${labelNode.x},${labelNode.y}</text>`
    )),
  ].join("\n");
}

function renderBranchAnnotation(
  context,
  node,
) {
  const outgoing = context.boardTemplate.edges.filter(({ from }) => (
    from === node.id
  ));
  const { x, y, width, height } = context.region.artBox;
  const labelX = clamp(node.x, x + 150, x + width - 150);
  const preferredY = node.y - 34;
  const labelY = preferredY < y + 26 ? node.y + 44 : preferredY;
  return [
    `    <g data-branch-node-id="${escapeXml(node.id)}" data-branch-edge-ids="${escapeXml(outgoing.map(({ id }) => id).join(" "))}">`,
    `      <title>${escapeXml(`BRANCH · ${node.id} · ${outgoing.map(({ id }) => id).join(" / ")}`)}</title>`,
    `      <circle cx="${node.x}" cy="${node.y}" r="27" fill="none" stroke="#6b3ed1" stroke-width="5" stroke-dasharray="7 5" />`,
    `      <text x="${labelX}" y="${clamp(labelY, y + 20, y + height - 12)}" text-anchor="middle" style="paint-order:stroke;stroke:#ffffff;stroke-width:5;stroke-linejoin:round">BRANCH · ${escapeXml(node.id)} · ${outgoing.length} WAYS</text>`,
    "    </g>",
  ].join("\n");
}

function renderFacilityAnchor(
  context,
  node,
) {
  const { x, y, width, height } = context.region.artBox;
  const reference = node.mapEffectRef || node.worldExitRef;
  const label = node.worldExitRef ? "FORWARD PORTAL" : "FACILITY";
  const labelX = clamp(node.x, x + 180, x + width - 180);
  const labelY = clamp(node.y + 47, y + 24, y + height - 14);
  return [
    `    <g data-facility-node-id="${escapeXml(node.id)}" data-facility-ref="${escapeXml(reference)}">`,
    `      <title>${escapeXml(`${label} · ${node.id} · ${reference}`)}</title>`,
    `      <path d="M ${node.x} ${node.y - 22} L ${node.x + 22} ${node.y} L ${node.x} ${node.y + 22} L ${node.x - 22} ${node.y} Z" fill="none" stroke="#127d67" stroke-width="5" />`,
    `      <text x="${labelX}" y="${labelY}" text-anchor="middle" style="paint-order:stroke;stroke:#ffffff;stroke-width:5;stroke-linejoin:round">${label} · ${escapeXml(node.id)}</text>`,
    "    </g>",
  ].join("\n");
}

function renderNode(
  context,
  node,
) {
  const style = roleStyle(node);
  const { x, y, width, height } = context.region.artBox;
  const labelY = node.y + 30 > y + height - 8 ? node.y - 23 : node.y + 30;
  const labelX = clamp(node.x, x + 34, x + width - 34);
  return [
    `    <circle data-node-id="${escapeXml(node.id)}" data-space-role="${escapeXml(node.spaceRole)}" data-landing-profile-ref="${escapeXml(node.landingProfileRef)}" cx="${node.x}" cy="${node.y}" r="${style.radius}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="4"><title>${escapeXml(`${node.id} · ${node.spaceRole} · ${node.landingProfileRef}`)}</title></circle>`,
    `    <text data-node-label="${escapeXml(node.id)}" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeXml(node.id)}</text>`,
  ].join("\n");
}

function renderLegend(
  context,
  summary,
) {
  const box = chooseLegendBox(context);
  const left = box.x + 20;
  const top = box.y + 29;
  return `
  <g id="legend" font-family="Arial, &quot;PingFang SC&quot;, sans-serif">
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="16" fill="#ffffff" fill-opacity="0.94" stroke="#173f63" stroke-width="2" />
    <text x="${left}" y="${top}" fill="#123d61" font-size="18" font-weight="900">${escapeXml(context.zone.id.toUpperCase())} · ${escapeXml(context.zone.label)} · ART GUIDE</text>
    <text x="${left}" y="${top + 23}" fill="#55738a" font-size="12" font-weight="700">${context.region.artBox.width} × ${context.region.artBox.height} · ${summary.nodeCount} nodes · ${summary.guideEdgeCount} visible edges</text>
    <path d="M ${left + 2} ${top + 49} H ${left + 48}" stroke="#ffd05a" stroke-width="18" stroke-linecap="round" opacity="0.75" />
    <text x="${left + 62}" y="${top + 54}" fill="#173f63" font-size="13" font-weight="700">路线安全走廊：仅低矮地表 / 云雾</text>
    <rect x="${left}" y="${top + 67}" width="48" height="18" fill="url(#no-tall-hatch)" stroke="#eb3152" stroke-width="2" />
    <text x="${left + 62}" y="${top + 81}" fill="#173f63" font-size="13" font-weight="700">节点净空：不得放置高物或文字</text>
    <path d="M ${left + 1} ${top + 104} H ${left + 49}" stroke="#087f9a" stroke-width="4" stroke-dasharray="9 6" />
    <text x="${left + 62}" y="${top + 109}" fill="#173f63" font-size="13" font-weight="700">运输净空：仅天空、光迹或轻薄云层</text>
    <text x="${left}" y="${top + 136}" fill="#b1243c" font-size="11" font-weight="900">DO NOT GENERATE: 棋格、路线、角色、文字、HUD</text>
  </g>`;
}

export function renderWorldLayoutGuide(
  boardTemplate,
  region,
) {
  const context = getRegionContext(boardTemplate, region);
  const summary = createRegionTopologySummary(boardTemplate, region);
  const nodeById = new Map(
    boardTemplate.nodes.map((node) => [node.id, node]),
  );
  const { x, y, width, height } = region.artBox;
  const regularEdges = context.edges.filter(({ availableWhen }) => (
    !availableWhen
  ));
  const titleId = `${context.zone.id}-guide-title`;
  const descriptionId = `${context.zone.id}-guide-description`;

  const safeCorridors = renderEdgePaths(context.edges, {
    className: "route-safe-path",
    stroke: "#ffd05a",
    strokeWidth: 154,
    opacity: 0.4,
  });
  const routeOutlines = renderEdgePaths(regularEdges, {
    className: "route-outline",
    stroke: "#ffffff",
    strokeWidth: 17,
  });
  const routeCenterlines = renderEdgePaths(regularEdges, {
    className: "route-centerline",
    stroke: "#174b73",
    strokeWidth: 5,
    dasharray: "10 8",
  });
  const conditionalOutlines = renderEdgePaths(context.conditionalEdges, {
    className: "conditional-route-outline",
    stroke: "#ffffff",
    strokeWidth: 19,
  });
  const conditionalCenterlines = renderEdgePaths(context.conditionalEdges, {
    className: "conditional-route-centerline",
    stroke: "#23bdda",
    strokeWidth: 7,
    dasharray: "4 10",
  });
  const transportPaths = context.transportNodes.length > 0
    ? context.transportNodes.map((node) => (
      renderTransportPath(node, nodeById)
    )).join("\n")
    : "    <desc>No transport anchor is authored in this region.</desc>";
  const facilityAnchors = context.facilityNodes.length > 0
    ? context.facilityNodes.map((node) => (
      renderFacilityAnchor(context, node)
    )).join("\n")
    : "    <desc>No map facility anchor is authored in this region.</desc>";

  const sourceLabel = boardTemplate === EXPANSION_WORLD_BOARD_TEMPLATE
    ? "EXPANSION_WORLD_BOARD_TEMPLATE"
    : "the supplied BoardTemplate";

  return `<!-- Generated by scripts/export-world-layout-guides.mjs from ${sourceLabel}. Do not hand-edit coordinates. -->
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="${x} ${y} ${width} ${height}"
  data-board-template-ref="${escapeXml(boardTemplate.id)}"
  data-region-id="${escapeXml(region.id)}"
  data-zone-id="${escapeXml(region.zoneId)}"
  data-layout-contract-ref="${escapeXml(region.layoutContractRef)}"
  data-art-box="${x} ${y} ${width} ${height}"
  data-topology-sha256="${summary.topologySha256}"
  role="img"
  aria-labelledby="${titleId} ${descriptionId}"
>
  <title id="${titleId}">${escapeXml(context.zone.label)} 1:1 美术布局引导图</title>
  <desc id="${descriptionId}">${escapeXml(
    `${context.zone.label} uses the exact ${region.layoutContractRef} artBox, BoardTemplate nodes, edges and pathData. All markings are production guidance and must not be baked into background art.`,
  )}</desc>
  <metadata id="topology-summary">${escapeXml(JSON.stringify(summary))}</metadata>

  <defs>
    <pattern id="minor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#bdd5e5" stroke-width="1" opacity="0.45" />
    </pattern>
    <pattern id="major-grid" width="100" height="100" patternUnits="userSpaceOnUse">
      <rect width="100" height="100" fill="url(#minor-grid)" />
      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#7fa4bd" stroke-width="1.5" opacity="0.65" />
    </pattern>
    <pattern id="no-tall-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="14" height="14" fill="#ff5a6f" opacity="0.1" />
      <rect width="5" height="14" fill="#ff3557" opacity="0.24" />
    </pattern>
    <marker id="transport-arrow" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M 0 0 L 14 7 L 0 14 z" fill="#087f9a" />
    </marker>
  </defs>

  <g id="guide-canvas">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#effaff" />
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#major-grid)" />
    <path id="art-region-clip-outline" data-source-clip-path="true" d="${escapeXml(region.clipPath)}" fill="none" stroke="#6b3ed1" stroke-width="3" stroke-dasharray="14 9" opacity="0.75" />
  </g>

  <g id="route-safe-corridor" fill="none">
${safeCorridors}
  </g>

  <g id="no-tall-object-zones" fill="url(#no-tall-hatch)" stroke="#eb3152" stroke-width="2.5" stroke-dasharray="9 7">
${context.nodes.map((node) => (
    `    <circle data-clearance-node-id="${escapeXml(node.id)}" cx="${node.x}" cy="${node.y}" r="${clearanceRadius(node)}" />`
  )).join("\n")}
  </g>

  <g id="transport-clearance" fill="#06697e" font-family="Arial, &quot;PingFang SC&quot;, sans-serif" font-size="13" font-weight="900">
${transportPaths}
  </g>

  <g id="route-centerline" fill="none">
${routeOutlines}
${routeCenterlines}
  </g>

  <g id="conditional-route-centerline" fill="none">
${conditionalOutlines}
${conditionalCenterlines}
${context.conditionalEdges.map((edge) => {
    const start = nodeById.get(edge.from);
    const end = nodeById.get(edge.to);
    const condition = `${edge.availableWhen.stateKey}=${edge.availableWhen.equals}`;
    const labelX = clamp((start.x + end.x) / 2, x + 190, x + width - 190);
    const labelY = clamp((start.y + end.y) / 2 - 58, y + 20, y + height - 20);
    return `    <text data-conditional-edge-label="${escapeXml(edge.id)}" data-condition="${escapeXml(condition)}" x="${labelX}" y="${labelY}" fill="#06697e" font-family="Arial, &quot;PingFang SC&quot;, sans-serif" font-size="13" font-weight="900" text-anchor="middle" style="paint-order:stroke;stroke:#ffffff;stroke-width:5;stroke-linejoin:round"><title>${escapeXml(`${edge.id} · AURORA BRIDGE · ${condition}`)}</title>${escapeXml(`${edge.id} · AURORA BRIDGE`)}</text>`;
  }).join("\n")}
  </g>

  <g id="branch-annotations" fill="#40218e" font-family="Arial, &quot;PingFang SC&quot;, sans-serif" font-size="13" font-weight="900">
${context.branchNodes.map((node) => (
    renderBranchAnnotation(context, node)
  )).join("\n")}
  </g>

  <g id="facility-anchors" fill="#0e6b58" font-family="Arial, &quot;PingFang SC&quot;, sans-serif" font-size="12" font-weight="900">
${facilityAnchors}
  </g>

  <g id="route-nodes" font-family="Arial, &quot;PingFang SC&quot;, sans-serif" font-size="11" font-weight="900" fill="#123d61">
${context.nodes.map((node) => renderNode(context, node)).join("\n")}
  </g>

${renderLegend(context, summary)}

  <g id="art-box-boundary" fill="none" stroke="#0d3556" stroke-width="4" stroke-dasharray="16 8">
    <rect x="${x + 2}" y="${y + 2}" width="${width - 4}" height="${height - 4}" />
  </g>
  <g id="coordinate-labels" fill="#0d3556" font-family="Arial, sans-serif" font-size="12" font-weight="900">
    <text x="${x + 8}" y="${y + 18}">${x},${y}</text>
    <text x="${x + width - 8}" y="${y + 18}" text-anchor="end">${x + width},${y}</text>
    <text x="${x + 8}" y="${y + height - 8}">${x},${y + height}</text>
    <text x="${x + width - 8}" y="${y + height - 8}" text-anchor="end">${x + width},${y + height}</text>
  </g>
</svg>
`;
}

export function getRegionGuideFilename(region) {
  return `${region.zoneId}-layout-guide.svg`;
}

export async function exportWorldLayoutGuides({
  boardTemplate = EXPANSION_WORLD_BOARD_TEMPLATE,
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
} = {}) {
  await mkdir(outputDirectory, { recursive: true });
  const exported = [];

  for (const region of boardTemplate.artRegions) {
    const filename = getRegionGuideFilename(region);
    const outputPath = join(outputDirectory, filename);
    const source = renderWorldLayoutGuide(boardTemplate, region);
    await writeFile(outputPath, source, "utf8");
    exported.push(Object.freeze({
      regionId: region.id,
      zoneId: region.zoneId,
      layoutContractRef: region.layoutContractRef,
      outputPath,
      topologySummary: createRegionTopologySummary(boardTemplate, region),
    }));
  }

  return Object.freeze(exported);
}

const invokedAsScript = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const exported = await exportWorldLayoutGuides();
  for (const guide of exported) {
    process.stdout.write(
      `${guide.zoneId} ${guide.layoutContractRef} → ${guide.outputPath}\n`,
    );
  }
}
