const WORLD_TWO_ALLOWED_LANDING_INPUTS = Object.freeze([
  "boardTemplateRef",
  "nodeId",
  "routeNodeIds",
  "routeEdgeIds",
  "mapState",
  "stableRandomSeed",
  "playerId",
]);

function landingProfile(definition) {
  const { rewards = [], ...details } = definition;
  return Object.freeze({
    trigger: "final-landing",
    allowedInputs: WORLD_TWO_ALLOWED_LANDING_INPUTS,
    ...details,
    rewards: Object.freeze(
      rewards.map((reward) => Object.freeze({ ...reward })),
    ),
  });
}

/**
 * World 02 deliberately reuses the existing coin → star → key → card economy.
 * Discoveries and shared scenery changes are curiosity rewards, not currencies.
 * None of these definitions may inspect learning content, transcript, or score.
 */
export const EXPANSION_WORLD_LANDING_PROFILES = Object.freeze({
  "world2.ordinary.v1": landingProfile({
    kind: "ordinary",
    presentationRef: null,
    settlementPolicy: "no-op",
    trackDiscovery: false,
  }),
  "world2.quiet-task.v1": landingProfile({
    kind: "quiet",
    presentationRef: "world2.star-trail.short.v1",
  }),
  "world2.arrival-vista.v1": landingProfile({
    kind: "world-vista",
    presentationRef: "world2.arrival-vista.v1",
  }),
  "world2.zone-vista.star-gate.v1": landingProfile({
    kind: "world-vista",
    presentationRef: "world2.star-gate-vista.v1",
  }),
  "world2.zone-vista.cloud-whale.v1": landingProfile({
    kind: "world-vista",
    presentationRef: "world2.cloud-whale-vista.v1",
  }),
  "world2.zone-vista.crystal-grove.v1": landingProfile({
    kind: "world-vista",
    presentationRef: "world2.crystal-grove-vista.v1",
  }),
  "world2.coin-cache.v1": landingProfile({
    kind: "resource",
    presentationRef: "world2.coin-cache.v1",
    rewards: [{ resource: "coin", amount: 1 }],
  }),
  "world2.star-bloom.v1": landingProfile({
    kind: "resource",
    presentationRef: "world2.star-bloom.v1",
    rewards: [{ resource: "star", amount: 1 }],
  }),
  "world2.key-forge.v1": landingProfile({
    kind: "resource",
    presentationRef: "world2.moon-key-forge.v1",
    rewards: [{ resource: "key", amount: 1 }],
  }),
  "world2.junction-choice.v1": landingProfile({
    kind: "route-choice",
    presentationRef: "world2.junction-choice.v1",
  }),
  "world2.aurora-bridge-choice.v1": landingProfile({
    kind: "conditional-route-choice",
    presentationRef: "world2.aurora-bridge-choice.v1",
  }),
  "world2.discovery.star-gate.v1": landingProfile({
    kind: "discovery",
    collectionRef: "world-atlas.v1",
    discoveryId: "world2.star-gate-map",
    oncePerPlayer: true,
    presentationRef: "world2.discovery.star-gate.v1",
  }),
  "world2.discovery.cloud-whale.v1": landingProfile({
    kind: "discovery",
    collectionRef: "world-atlas.v1",
    discoveryId: "world2.cloud-whale-song",
    oncePerPlayer: true,
    presentationRef: "world2.discovery.cloud-whale.v1",
  }),
  "world2.discovery.crystal-grove.v1": landingProfile({
    kind: "discovery",
    collectionRef: "world-atlas.v1",
    discoveryId: "world2.crystal-grove-spectrum",
    oncePerPlayer: true,
    presentationRef: "world2.discovery.crystal-grove.v1",
  }),
  "world2.discovery.moon-ruins.v1": landingProfile({
    kind: "discovery",
    collectionRef: "world-atlas.v1",
    discoveryId: "world2.moon-ruins-glyph",
    oncePerPlayer: true,
    presentationRef: "world2.discovery.moon-ruins.v1",
  }),
  "world2.transport.comet-lift.v1": landingProfile({
    kind: "transport",
    presentationRef: "world2.comet-lift.v1",
  }),
  "world2.transport.bubble-geyser.v1": landingProfile({
    kind: "transport",
    presentationRef: "world2.bubble-geyser.v1",
  }),
  "world2.map.echo-observatory.v1": landingProfile({
    kind: "map-effect",
    mapEffectRef: "beyond-cloud.echo-observatory.v1",
    presentationRef: "world2.echo-observatory.v1",
  }),
  "world2.map.constellation-lens.v1": landingProfile({
    kind: "map-effect",
    mapEffectRef: "beyond-cloud.constellation-lens.v1",
    presentationRef: "world2.constellation-lens.v1",
  }),
  "world2.map.cloud-whale-beacon.v1": landingProfile({
    kind: "map-effect",
    mapEffectRef: "beyond-cloud.cloud-whale-beacon.v1",
    presentationRef: "world2.cloud-whale-beacon.v1",
  }),
  "world2.map.cloud-whale-pool.v1": landingProfile({
    kind: "map-effect",
    mapEffectRef: "beyond-cloud.cloud-whale-pool.v1",
    presentationRef: "world2.cloud-whale-pool.v1",
  }),
  "world2.map.prism-telescope.v1": landingProfile({
    kind: "map-effect",
    mapEffectRef: "beyond-cloud.prism-telescope.v1",
    presentationRef: "world2.prism-telescope.v1",
  }),
  "world2.map.prism-tree.v1": landingProfile({
    kind: "map-effect",
    mapEffectRef: "beyond-cloud.prism-tree.v1",
    presentationRef: "world2.prism-tree.v1",
    firstStateChanges: Object.freeze({ auroraBridgeOpen: true }),
  }),
  "world2.map.aurora-projector.v1": landingProfile({
    kind: "map-effect",
    mapEffectRef: "beyond-cloud.aurora-projector.v1",
    presentationRef: "world2.aurora-projector.v1",
  }),
  "world2.map.moon-dial.v1": landingProfile({
    kind: "map-effect",
    mapEffectRef: "beyond-cloud.moon-dial.v1",
    presentationRef: "world2.moon-dial.v1",
  }),
  "world2.world-gallery.v1": landingProfile({
    kind: "collection-gallery",
    collectionRef: "world-atlas.v1",
    presentationRef: "world2.world-gallery.v1",
  }),
  "world2.forward-portal.v1": landingProfile({
    kind: "world-transition",
    trigger: "after-enter",
    direction: "forward",
    settlementPolicy: "movement-only-no-reward",
    presentationRef: "world2.forward-portal.v1",
  }),
});

function boardNode({
  id,
  x,
  y,
  zoneId,
  spaceRole,
  landingProfileRef,
  ...details
}) {
  const node = {
    id,
    x,
    y,
    zoneId,
    spaceRole,
    landingProfileRef,
    ...details,
  };
  if (Array.isArray(node.transportCaptureNodeIds)) {
    node.transportCaptureNodeIds = Object.freeze([...node.transportCaptureNodeIds]);
  }
  return Object.freeze(node);
}

const WORLD_TWO_NODES = Object.freeze([
  // Zone 05 · 星门浮岛 · 16 nodes.
  boardNode({
    id: "w2n01",
    x: 80,
    y: 520,
    zoneId: "zone-05",
    spaceRole: "learning",
    landingProfileRef: "world2.arrival-vista.v1",
  }),
  boardNode({
    id: "w2n02",
    x: 160,
    y: 520,
    zoneId: "zone-05",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n03",
    x: 240,
    y: 480,
    zoneId: "zone-05",
    spaceRole: "item",
    landingProfileRef: "world2.discovery.star-gate.v1",
  }),
  boardNode({
    id: "w2n04",
    x: 320,
    y: 420,
    zoneId: "zone-05",
    spaceRole: "junction",
    landingProfileRef: "world2.junction-choice.v1",
  }),
  boardNode({
    id: "w2n05a",
    x: 390,
    y: 330,
    zoneId: "zone-05",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n06a",
    x: 485,
    y: 280,
    zoneId: "zone-05",
    spaceRole: "transport",
    landingProfileRef: "world2.transport.comet-lift.v1",
    transportProfileRef: "jump.comet-lift.v1",
    transportTargetId: "w2n09",
    transportCaptureNodeIds: ["w2n08"],
  }),
  boardNode({
    id: "w2n05b",
    x: 390,
    y: 510,
    zoneId: "zone-05",
    spaceRole: "map-effect",
    landingProfileRef: "world2.map.echo-observatory.v1",
    mapEffectRef: "beyond-cloud.echo-observatory.v1",
  }),
  boardNode({
    id: "w2n06b",
    x: 485,
    y: 535,
    zoneId: "zone-05",
    spaceRole: "treasure",
    landingProfileRef: "world2.star-bloom.v1",
  }),
  boardNode({
    id: "w2n07",
    x: 590,
    y: 410,
    zoneId: "zone-05",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n08",
    x: 690,
    y: 340,
    zoneId: "zone-05",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n09",
    x: 790,
    y: 270,
    zoneId: "zone-05",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n10",
    x: 880,
    y: 205,
    zoneId: "zone-05",
    spaceRole: "map-effect",
    landingProfileRef: "world2.map.constellation-lens.v1",
    mapEffectRef: "beyond-cloud.constellation-lens.v1",
  }),
  boardNode({
    id: "w2n11",
    x: 970,
    y: 150,
    zoneId: "zone-05",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n12",
    x: 1060,
    y: 190,
    zoneId: "zone-05",
    spaceRole: "treasure",
    landingProfileRef: "world2.star-bloom.v1",
  }),
  boardNode({
    id: "w2n13",
    x: 1110,
    y: 120,
    zoneId: "zone-05",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n14",
    x: 1160,
    y: 70,
    zoneId: "zone-05",
    spaceRole: "learning",
    landingProfileRef: "world2.zone-vista.star-gate.v1",
  }),

  // Zone 06 · 云鲸航道 · 17 nodes.
  boardNode({
    id: "w2n15",
    x: 1240,
    y: 90,
    zoneId: "zone-06",
    spaceRole: "learning",
    landingProfileRef: "world2.arrival-vista.v1",
  }),
  boardNode({
    id: "w2n16",
    x: 1340,
    y: 125,
    zoneId: "zone-06",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n17",
    x: 1440,
    y: 170,
    zoneId: "zone-06",
    spaceRole: "item",
    landingProfileRef: "world2.discovery.cloud-whale.v1",
  }),
  boardNode({
    id: "w2n18",
    x: 1540,
    y: 220,
    zoneId: "zone-06",
    spaceRole: "junction",
    landingProfileRef: "world2.junction-choice.v1",
  }),
  boardNode({
    id: "w2n19a",
    x: 1640,
    y: 130,
    zoneId: "zone-06",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n20a",
    x: 1745,
    y: 110,
    zoneId: "zone-06",
    spaceRole: "transport",
    landingProfileRef: "world2.transport.bubble-geyser.v1",
    transportProfileRef: "jump.bubble-geyser.v1",
    transportTargetId: "w2n23",
    transportCaptureNodeIds: ["w2n22"],
  }),
  boardNode({
    id: "w2n21a",
    x: 1850,
    y: 160,
    zoneId: "zone-06",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n19b",
    x: 1630,
    y: 285,
    zoneId: "zone-06",
    spaceRole: "map-effect",
    landingProfileRef: "world2.map.cloud-whale-beacon.v1",
    mapEffectRef: "beyond-cloud.cloud-whale-beacon.v1",
  }),
  boardNode({
    id: "w2n20b",
    x: 1740,
    y: 330,
    zoneId: "zone-06",
    spaceRole: "treasure",
    landingProfileRef: "world2.star-bloom.v1",
  }),
  boardNode({
    id: "w2n21b",
    x: 1850,
    y: 290,
    zoneId: "zone-06",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n22",
    x: 1950,
    y: 230,
    zoneId: "zone-06",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n23",
    x: 2050,
    y: 300,
    zoneId: "zone-06",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n24",
    x: 2140,
    y: 380,
    zoneId: "zone-06",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n25",
    x: 2200,
    y: 460,
    zoneId: "zone-06",
    spaceRole: "map-effect",
    landingProfileRef: "world2.map.cloud-whale-pool.v1",
    mapEffectRef: "beyond-cloud.cloud-whale-pool.v1",
  }),
  boardNode({
    id: "w2n26",
    x: 2180,
    y: 535,
    zoneId: "zone-06",
    spaceRole: "treasure",
    landingProfileRef: "world2.star-bloom.v1",
  }),
  boardNode({
    id: "w2n27",
    x: 2060,
    y: 545,
    zoneId: "zone-06",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n28",
    x: 1940,
    y: 540,
    zoneId: "zone-06",
    spaceRole: "learning",
    landingProfileRef: "world2.zone-vista.cloud-whale.v1",
  }),

  // Zone 07 · 极光晶林 · 16 nodes.
  boardNode({
    id: "w2n29",
    x: 2020,
    y: 620,
    zoneId: "zone-07",
    spaceRole: "learning",
    landingProfileRef: "world2.arrival-vista.v1",
  }),
  boardNode({
    id: "w2n30",
    x: 2120,
    y: 680,
    zoneId: "zone-07",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n31",
    x: 2200,
    y: 760,
    zoneId: "zone-07",
    spaceRole: "item",
    landingProfileRef: "world2.discovery.crystal-grove.v1",
  }),
  boardNode({
    id: "w2n32",
    x: 2180,
    y: 850,
    zoneId: "zone-07",
    spaceRole: "junction",
    landingProfileRef: "world2.junction-choice.v1",
  }),
  boardNode({
    id: "w2n33a",
    x: 2080,
    y: 790,
    zoneId: "zone-07",
    spaceRole: "map-effect",
    landingProfileRef: "world2.map.prism-telescope.v1",
    mapEffectRef: "beyond-cloud.prism-telescope.v1",
  }),
  boardNode({
    id: "w2n34a",
    x: 1970,
    y: 800,
    zoneId: "zone-07",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n35a",
    x: 1870,
    y: 850,
    zoneId: "zone-07",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n33b",
    x: 2240,
    y: 920,
    zoneId: "zone-07",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n34b",
    x: 2140,
    y: 1000,
    zoneId: "zone-07",
    spaceRole: "treasure",
    landingProfileRef: "world2.star-bloom.v1",
  }),
  boardNode({
    id: "w2n35b",
    x: 2000,
    y: 1040,
    zoneId: "zone-07",
    spaceRole: "map-effect",
    landingProfileRef: "world2.map.prism-tree.v1",
    mapEffectRef: "beyond-cloud.prism-tree.v1",
  }),
  boardNode({
    id: "w2n36",
    x: 1870,
    y: 960,
    zoneId: "zone-07",
    spaceRole: "learning",
    landingProfileRef: "world2.aurora-bridge-choice.v1",
  }),
  boardNode({
    id: "w2n37",
    x: 1740,
    y: 920,
    zoneId: "zone-07",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n38",
    x: 1600,
    y: 900,
    zoneId: "zone-07",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n39",
    x: 1470,
    y: 930,
    zoneId: "zone-07",
    spaceRole: "map-effect",
    landingProfileRef: "world2.map.aurora-projector.v1",
    mapEffectRef: "beyond-cloud.aurora-projector.v1",
  }),
  boardNode({
    id: "w2n40",
    x: 1350,
    y: 980,
    zoneId: "zone-07",
    spaceRole: "treasure",
    landingProfileRef: "world2.star-bloom.v1",
  }),
  boardNode({
    id: "w2n41",
    x: 1230,
    y: 1040,
    zoneId: "zone-07",
    spaceRole: "learning",
    landingProfileRef: "world2.zone-vista.crystal-grove.v1",
  }),

  // Zone 08 · 月轮遗迹 · 13 nodes.
  boardNode({
    id: "w2n42",
    x: 1120,
    y: 1010,
    zoneId: "zone-08",
    spaceRole: "learning",
    landingProfileRef: "world2.arrival-vista.v1",
  }),
  boardNode({
    id: "w2n43",
    x: 990,
    y: 960,
    zoneId: "zone-08",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n44",
    x: 860,
    y: 930,
    zoneId: "zone-08",
    spaceRole: "item",
    landingProfileRef: "world2.discovery.moon-ruins.v1",
  }),
  boardNode({
    id: "w2n45",
    x: 720,
    y: 920,
    zoneId: "zone-08",
    spaceRole: "junction",
    landingProfileRef: "world2.junction-choice.v1",
  }),
  boardNode({
    id: "w2n46a",
    x: 600,
    y: 850,
    zoneId: "zone-08",
    spaceRole: "item",
    landingProfileRef: "world2.key-forge.v1",
  }),
  boardNode({
    id: "w2n47a",
    x: 490,
    y: 800,
    zoneId: "zone-08",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n46b",
    x: 610,
    y: 1000,
    zoneId: "zone-08",
    spaceRole: "treasure",
    landingProfileRef: "world2.star-bloom.v1",
  }),
  boardNode({
    id: "w2n47b",
    x: 470,
    y: 1020,
    zoneId: "zone-08",
    spaceRole: "map-effect",
    landingProfileRef: "world2.map.moon-dial.v1",
    mapEffectRef: "beyond-cloud.moon-dial.v1",
  }),
  boardNode({
    id: "w2n48",
    x: 360,
    y: 900,
    zoneId: "zone-08",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n49",
    x: 260,
    y: 840,
    zoneId: "zone-08",
    spaceRole: "reward",
    landingProfileRef: "world2.coin-cache.v1",
  }),
  boardNode({
    id: "w2n50",
    x: 180,
    y: 760,
    zoneId: "zone-08",
    spaceRole: "learning",
    landingProfileRef: "world2.quiet-task.v1",
  }),
  boardNode({
    id: "w2n51",
    x: 110,
    y: 690,
    zoneId: "zone-08",
    spaceRole: "item",
    landingProfileRef: "world2.world-gallery.v1",
  }),
  boardNode({
    id: "w2n52",
    x: 70,
    y: 610,
    zoneId: "zone-08",
    spaceRole: "goal",
    landingProfileRef: "world2.forward-portal.v1",
    worldExitRef: "world-link.world-02-to-next.v1",
    exitDirection: "forward",
  }),
]);

export const EXPANSION_WORLD_ORDINARY_NODE_IDS = Object.freeze([
  "w2n01",
  "w2n02",
  "w2n05a",
  "w2n06b",
  "w2n07",
  "w2n09",
  "w2n11",
  "w2n13",
  "w2n14",
  "w2n16",
  "w2n19a",
  "w2n21a",
  "w2n21b",
  "w2n22",
  "w2n24",
  "w2n26",
  "w2n27",
  "w2n29",
  "w2n30",
  "w2n34a",
  "w2n35a",
  "w2n33b",
  "w2n34b",
  "w2n37",
  "w2n38",
  "w2n41",
  "w2n43",
  "w2n47a",
  "w2n46b",
  "w2n48",
  "w2n50",
]);

const WORLD_TWO_ORDINARY_NODE_ID_SET = new Set(
  EXPANSION_WORLD_ORDINARY_NODE_IDS,
);

const WORLD_TWO_NODE_BY_ID = new Map(
  WORLD_TWO_NODES.map((node) => [node.id, node]),
);

function roadEdge(id, from, to, details = {}) {
  const start = WORLD_TWO_NODE_BY_ID.get(from);
  const end = WORLD_TWO_NODE_BY_ID.get(to);
  if (!start || !end) throw new Error(`invalid World 02 edge ${id}: ${from} → ${to}`);
  const availableWhen = details.availableWhen
    ? Object.freeze({ ...details.availableWhen })
    : undefined;
  return Object.freeze({
    id,
    from,
    to,
    terrainType: "cloud-road",
    pathData: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    ...details,
    ...(availableWhen ? { availableWhen } : {}),
  });
}

const WORLD_TWO_EDGES = Object.freeze([
  // Zone 05.
  roadEdge("w2e01", "w2n01", "w2n02"),
  roadEdge("w2e02", "w2n02", "w2n03"),
  roadEdge("w2e03", "w2n03", "w2n04"),
  roadEdge("w2e04a", "w2n04", "w2n05a", { order: 0 }),
  roadEdge("w2e04b", "w2n04", "w2n05b", { order: 1 }),
  roadEdge("w2e05a", "w2n05a", "w2n06a"),
  roadEdge("w2e06a", "w2n06a", "w2n07"),
  roadEdge("w2e05b", "w2n05b", "w2n06b"),
  roadEdge("w2e06b", "w2n06b", "w2n07"),
  roadEdge("w2e07", "w2n07", "w2n08"),
  roadEdge("w2e08", "w2n08", "w2n09"),
  roadEdge("w2e09", "w2n09", "w2n10"),
  roadEdge("w2e10", "w2n10", "w2n11"),
  roadEdge("w2e11", "w2n11", "w2n12"),
  roadEdge("w2e12", "w2n12", "w2n13"),
  roadEdge("w2e13", "w2n13", "w2n14"),
  roadEdge("w2e14x", "w2n14", "w2n15", { terrainType: "world-seam" }),

  // Zone 06.
  roadEdge("w2e15", "w2n15", "w2n16"),
  roadEdge("w2e16", "w2n16", "w2n17"),
  roadEdge("w2e17", "w2n17", "w2n18"),
  roadEdge("w2e18a", "w2n18", "w2n19a", { order: 0 }),
  roadEdge("w2e18b", "w2n18", "w2n19b", { order: 1 }),
  roadEdge("w2e19a", "w2n19a", "w2n20a"),
  roadEdge("w2e20a", "w2n20a", "w2n21a"),
  roadEdge("w2e21a", "w2n21a", "w2n22"),
  roadEdge("w2e19b", "w2n19b", "w2n20b"),
  roadEdge("w2e20b", "w2n20b", "w2n21b"),
  roadEdge("w2e21b", "w2n21b", "w2n22"),
  roadEdge("w2e22", "w2n22", "w2n23"),
  roadEdge("w2e23", "w2n23", "w2n24"),
  roadEdge("w2e24", "w2n24", "w2n25"),
  roadEdge("w2e25", "w2n25", "w2n26"),
  roadEdge("w2e26", "w2n26", "w2n27"),
  roadEdge("w2e27", "w2n27", "w2n28"),
  roadEdge("w2e28x", "w2n28", "w2n29", { terrainType: "world-seam" }),

  // Zone 07.
  roadEdge("w2e29", "w2n29", "w2n30"),
  roadEdge("w2e30", "w2n30", "w2n31"),
  roadEdge("w2e31", "w2n31", "w2n32"),
  roadEdge("w2e32a", "w2n32", "w2n33a", { order: 0 }),
  roadEdge("w2e32b", "w2n32", "w2n33b", { order: 1 }),
  roadEdge("w2e33a", "w2n33a", "w2n34a"),
  roadEdge("w2e34a", "w2n34a", "w2n35a"),
  roadEdge("w2e35a", "w2n35a", "w2n36"),
  roadEdge("w2e33b", "w2n33b", "w2n34b"),
  roadEdge("w2e34b", "w2n34b", "w2n35b"),
  roadEdge("w2e35b", "w2n35b", "w2n36"),
  roadEdge("w2e36", "w2n36", "w2n37", { order: 0 }),
  roadEdge("w2e37", "w2n37", "w2n38"),
  roadEdge("w2e38", "w2n38", "w2n39"),
  roadEdge("w2e39", "w2n39", "w2n40"),
  roadEdge("w2e40", "w2n40", "w2n41"),
  roadEdge("w2e36c", "w2n36", "w2n39", {
    order: 1,
    terrainType: "aurora-bridge",
    availableWhen: { stateKey: "auroraBridgeOpen", equals: true },
    pathData: "M 1870 960 C 1760 850 1575 850 1470 930",
  }),
  roadEdge("w2e41x", "w2n41", "w2n42", { terrainType: "world-seam" }),

  // Zone 08.
  roadEdge("w2e42", "w2n42", "w2n43"),
  roadEdge("w2e43", "w2n43", "w2n44"),
  roadEdge("w2e44", "w2n44", "w2n45"),
  roadEdge("w2e45a", "w2n45", "w2n46a", { order: 0 }),
  roadEdge("w2e45b", "w2n45", "w2n46b", { order: 1 }),
  roadEdge("w2e46a", "w2n46a", "w2n47a"),
  roadEdge("w2e47a", "w2n47a", "w2n48"),
  roadEdge("w2e46b", "w2n46b", "w2n47b"),
  roadEdge("w2e47b", "w2n47b", "w2n48"),
  roadEdge("w2e48", "w2n48", "w2n49"),
  roadEdge("w2e49", "w2n49", "w2n50"),
  roadEdge("w2e50", "w2n50", "w2n51"),
  roadEdge("w2e51", "w2n51", "w2n52"),
]);

const WORLD_TWO_ZONES = Object.freeze([
  Object.freeze({
    id: "zone-05",
    label: "星门浮岛",
    bounds: Object.freeze({ x: 0, y: 0, width: 1200, height: 620 }),
  }),
  Object.freeze({
    id: "zone-06",
    label: "云鲸航道",
    bounds: Object.freeze({ x: 1200, y: 0, width: 1200, height: 560 }),
  }),
  Object.freeze({
    id: "zone-07",
    label: "极光晶林",
    bounds: Object.freeze({ x: 1200, y: 560, width: 1200, height: 560 }),
  }),
  Object.freeze({
    id: "zone-08",
    label: "月轮遗迹",
    bounds: Object.freeze({ x: 0, y: 560, width: 1200, height: 560 }),
  }),
]);

const WORLD_TWO_ART_REGIONS = Object.freeze([
  Object.freeze({
    id: "region-zone-05",
    zoneId: "zone-05",
    layoutContractRef: "board.ximitu-card-hunt.world-02.zone-05-layout.v1",
    artBox: Object.freeze({ x: 0, y: 0, width: 1200, height: 620 }),
    clipPath: "M 8 44 Q 8 8 44 8 H 1156 Q 1192 8 1192 44 V 576 Q 1192 612 1156 612 H 44 Q 8 612 8 576 Z",
  }),
  Object.freeze({
    id: "region-zone-06",
    zoneId: "zone-06",
    layoutContractRef: "board.ximitu-card-hunt.world-02.zone-06-layout.v1",
    artBox: Object.freeze({ x: 1200, y: 0, width: 1200, height: 560 }),
    clipPath: "M 1208 44 Q 1208 8 1244 8 H 2356 Q 2392 8 2392 44 V 516 Q 2392 552 2356 552 H 1244 Q 1208 552 1208 516 Z",
  }),
  Object.freeze({
    id: "region-zone-07",
    zoneId: "zone-07",
    layoutContractRef: "board.ximitu-card-hunt.world-02.zone-07-layout.v1",
    artBox: Object.freeze({ x: 1200, y: 560, width: 1200, height: 560 }),
    clipPath: "M 1208 604 Q 1208 568 1244 568 H 2356 Q 2392 568 2392 604 V 1076 Q 2392 1112 2356 1112 H 1244 Q 1208 1112 1208 1076 Z",
  }),
  Object.freeze({
    id: "region-zone-08",
    zoneId: "zone-08",
    layoutContractRef: "board.ximitu-card-hunt.world-02.zone-08-layout.v1",
    artBox: Object.freeze({ x: 0, y: 560, width: 1200, height: 560 }),
    clipPath: "M 8 604 Q 8 568 44 568 H 1156 Q 1192 568 1192 604 V 1076 Q 1192 1112 1156 1112 H 44 Q 8 1112 8 1076 Z",
  }),
]);

/**
 * Independent BoardTemplate slice. It is intentionally not registered in the
 * current runtime yet; integration must happen through a future board registry.
 */
export const EXPANSION_WORLD_BOARD_TEMPLATE = Object.freeze({
  kind: "BoardTemplate",
  id: "ximitu-card-hunt-world-02.v1",
  version: "1.0.0",
  title: "云外秘境",
  worldOrder: 2,
  viewBox: Object.freeze([0, 0, 1200, 620]),
  worldSize: Object.freeze({ width: 2400, height: 1120 }),
  entryNodeId: "w2n01",
  entry: Object.freeze({ id: "main", nodeId: "w2n01" }),
  startNodeId: "w2n01",
  forwardExitNodeId: "w2n52",
  forwardExit: Object.freeze({
    nodeId: "w2n52",
    direction: "forward",
    linkSlotRef: "world-link.world-02-to-next.v1",
    transitionPolicy: "after-enter",
    stepCost: 0,
    continueRemainingSteps: true,
  }),
  exits: Object.freeze([
    Object.freeze({
      id: "forward",
      nodeId: "w2n52",
      transitionProfileRef: "world.portal.forward.v1",
    }),
  ]),
  renderBudget: Object.freeze({
    maxMountedBoards: 1,
    maxRegionImages: 4,
    maxNodes: 72,
    maxEdges: 80,
  }),
  zones: WORLD_TWO_ZONES,
  artRegions: WORLD_TWO_ART_REGIONS,
  nodes: WORLD_TWO_NODES,
  edges: WORLD_TWO_EDGES,
});

/**
 * SVG/CSS fallback semantics only. No generated or bitmap art is referenced.
 */
export const EXPANSION_WORLD_FALLBACK_THEME = Object.freeze({
  kind: "ThemePack",
  id: "beyond-cloud-fallback.v1",
  version: "1.0.0",
  title: "云外秘境 · 几何回退",
  palette: Object.freeze({
    page: "#eef5ff",
    terrain: "#f8f4ff",
    route: "#d9f0ff",
    ink: "#16345f",
    primary: "#ffe16d",
    secondary: "#73dfca",
    accent: "#9b7cff",
  }),
  zoneNames: Object.freeze({
    "zone-05": "星门浮岛",
    "zone-06": "云鲸航道",
    "zone-07": "极光晶林",
    "zone-08": "月轮遗迹",
  }),
  regionFallbacks: Object.freeze({
    "region-zone-05": Object.freeze({ fill: "#dff4ff", motif: "star-islands" }),
    "region-zone-06": Object.freeze({ fill: "#d7f5f1", motif: "cloud-whale" }),
    "region-zone-07": Object.freeze({ fill: "#e5ddff", motif: "aurora-grove" }),
    "region-zone-08": Object.freeze({ fill: "#e9edff", motif: "moon-ruins" }),
  }),
});

export const EXPANSION_WORLD_THEME = Object.freeze({
  ...EXPANSION_WORLD_FALLBACK_THEME,
  id: "beyond-cloud",
  version: "2.0.0",
  title: "云外秘境 · 完整世界美术",
  regionArt: Object.freeze({
    "region-zone-05": Object.freeze({
      assetRef: "/assets/board-themes/beyond-cloud/regions/zone-05-v2.jpg",
      layoutContractRef: "board.ximitu-card-hunt.world-02.zone-05-layout.v1",
      fallbackFill: "#dff4ff",
      transitionFill: "#dff4ff",
      transitionStyle: "star-gate",
    }),
    "region-zone-06": Object.freeze({
      assetRef: "/assets/board-themes/beyond-cloud/regions/zone-06-v2.jpg",
      layoutContractRef: "board.ximitu-card-hunt.world-02.zone-06-layout.v1",
      fallbackFill: "#d7f5f1",
      transitionFill: "#d7f5f1",
      transitionStyle: "cloud-whale",
    }),
    "region-zone-07": Object.freeze({
      assetRef: "/assets/board-themes/beyond-cloud/regions/zone-07-v2.jpg",
      layoutContractRef: "board.ximitu-card-hunt.world-02.zone-07-layout.v1",
      fallbackFill: "#e5ddff",
      transitionFill: "#e5ddff",
      transitionStyle: "aurora",
    }),
    "region-zone-08": Object.freeze({
      assetRef: "/assets/board-themes/beyond-cloud/regions/zone-08-v2.jpg",
      layoutContractRef: "board.ximitu-card-hunt.world-02.zone-08-layout.v1",
      fallbackFill: "#e9edff",
      transitionFill: "#e9edff",
      transitionStyle: "moon-ruins",
    }),
  }),
});

export const EXPANSION_WORLD_LEVEL_PACK = Object.freeze({
  kind: "LevelPack",
  id: "ximitu-card-hunt.world-02",
  version: "1.0.0",
  title: "云外秘境远征",
  subtitle: "追踪星门图鉴，穿过云鲸航道和月轮遗迹",
  ordinaryNodeIds: EXPANSION_WORLD_ORDINARY_NODE_IDS,
  fairyAnchorNodeIds: Object.freeze([
    "w2n08",
    "w2n17",
    "w2n23",
    "w2n31",
    "w2n40",
    "w2n50",
  ]),
  initialMapState: Object.freeze({
    auroraBridgeOpen: false,
  }),
  initialLevelState: Object.freeze({
    discoveredNodeIds: Object.freeze([]),
    displayedDiscoveryIds: Object.freeze([]),
    discoveredNodeIdsByPlayerId: Object.freeze({}),
    discoveriesByPlayerId: Object.freeze({}),
  }),
  landingProfiles: EXPANSION_WORLD_LANDING_PROFILES,
  nodeBindings: Object.freeze(Object.fromEntries(
    WORLD_TWO_NODES.map((node) => [
      node.id,
      Object.freeze({
        nodeId: node.id,
        rewardRef: WORLD_TWO_ORDINARY_NODE_ID_SET.has(node.id)
          ? "world2.ordinary.v1"
          : node.landingProfileRef,
      }),
    ]),
  )),
});
