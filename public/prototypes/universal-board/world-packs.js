import {
  CRYSTAL_BOARD_TEMPLATE_V221,
  CRYSTAL_THEME_V221,
  CRYSTAL_WORLD_V121,
  CRYSTAL_WORLD_ROUTE_V121,
  CRYSTAL_GAME_RELEASE_V221,
} from "./crystal-harbor-v221-snapshots.js";
export { CRYSTAL_WORLD_ROUTE_V121, CRYSTAL_GAME_RELEASE_V221 };
import {
  PREVIOUS_CLOUD_HARBOR_WORLD_V11,
  PREVIOUS_XIMITU_WORLD_ROUTE,
  PREVIOUS_XIMITU_GAME_RELEASE,
} from "./cloud-harbor-published-snapshots.js";
export { PREVIOUS_XIMITU_WORLD_ROUTE, PREVIOUS_XIMITU_GAME_RELEASE };
import {
  CRYSTAL_BOARD_TEMPLATE_V220,
  CRYSTAL_THEME_V220,
  CRYSTAL_WORLD_V120,
  CRYSTAL_WORLD_ROUTE_V120,
  CRYSTAL_GAME_RELEASE_V220,
} from "./crystal-harbor-published-snapshots.js";
export { CRYSTAL_WORLD_ROUTE_V120, CRYSTAL_GAME_RELEASE_V220 };
import {
  BOARD_TEMPLATE,
  LEGACY_BOARD_TEMPLATE_V2,
  LEGACY_CLOUD_HARBOR_THEME_V2,
  THEME_PACKS,
  PREVIOUS_BOARD_TEMPLATE_V21,
  PREVIOUS_CLOUD_HARBOR_THEME_V21,
} from "./packs.js";
import {
  LEVEL_ONE,
  REWARD_DEFINITIONS,
  CURRENT_LEVEL_ONE,
} from "./level-one.js";
import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
  EXPANSION_WORLD_FALLBACK_THEME,
  EXPANSION_WORLD_LANDING_PROFILES,
  EXPANSION_WORLD_LEVEL_PACK,
  EXPANSION_WORLD_THEME,
} from "./expansion-world.js";

export const CLOUD_HARBOR_BOARD_REF = (
  `${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}`
);
export const LEGACY_CLOUD_HARBOR_BOARD_REF = (
  `${LEGACY_BOARD_TEMPLATE_V2.id}@${LEGACY_BOARD_TEMPLATE_V2.version}`
);
export const CLOUD_HARBOR_THEME_REF = (
  `${THEME_PACKS["cloud-harbor"].id}@${THEME_PACKS["cloud-harbor"].version}`
);
export const LEGACY_CLOUD_HARBOR_THEME_REF = (
  `${LEGACY_CLOUD_HARBOR_THEME_V2.id}@${LEGACY_CLOUD_HARBOR_THEME_V2.version}`
);
export const LEGACY_CLOUD_HARBOR_LEVEL_REF = `${LEVEL_ONE.id}@${LEVEL_ONE.version}`;
export const CLOUD_HARBOR_LEVEL_REF = `${CURRENT_LEVEL_ONE.id}@${CURRENT_LEVEL_ONE.version}`;
export const CLOUD_HARBOR_WORLD_REF = "world.ximitu.cloud-harbor@1.3.0";
export const CRYSTAL_V121_WORLD_REF = "world.ximitu.cloud-harbor@1.2.1";
export const CRYSTAL_V121_BOARD_REF = "ximitu-card-hunt-board.v1@2.2.1";
export const CRYSTAL_V121_THEME_REF = "cloud-harbor@2.2.1";
export const CRYSTAL_V121_ROUTE_REF = "route.ximitu-main@1.2.1";

export function isCurrentCloudHarborWorldRef(worldRef) {
  return worldRef === CLOUD_HARBOR_WORLD_REF;
}
export const CRYSTAL_V120_WORLD_REF = "world.ximitu.cloud-harbor@1.2.0";
export const CRYSTAL_V120_BOARD_REF = "ximitu-card-hunt-board.v1@2.2.0";
export const CRYSTAL_V120_THEME_REF = "cloud-harbor@2.2.0";
export const CRYSTAL_V120_ROUTE_REF = "route.ximitu-main@1.2.0";
export const PREVIOUS_CLOUD_HARBOR_WORLD_REF = "world.ximitu.cloud-harbor@1.1.0";
export const PREVIOUS_CLOUD_HARBOR_BOARD_REF = "ximitu-card-hunt-board.v1@2.1.0";
export const PREVIOUS_CLOUD_HARBOR_THEME_REF = "cloud-harbor@2.1.0";
export const PREVIOUS_XIMITU_WORLD_ROUTE_REF = "route.ximitu-main@1.1.0";
export const LEGACY_CLOUD_HARBOR_WORLD_REF = "world.ximitu.cloud-harbor@1.0.0";

export function isCloudHarborWorldRef(worldRef) {
  return [CLOUD_HARBOR_WORLD_REF, CRYSTAL_V121_WORLD_REF, CRYSTAL_V120_WORLD_REF, PREVIOUS_CLOUD_HARBOR_WORLD_REF,
    LEGACY_CLOUD_HARBOR_WORLD_REF].includes(worldRef);
}

export const GAME_OWNED_LAYOUT_WORLD_REFS = Object.freeze([
  CLOUD_HARBOR_WORLD_REF,
  CRYSTAL_V121_WORLD_REF,
  CRYSTAL_V120_WORLD_REF,
]);

export function isGameOwnedLayoutWorldRef(worldRef) {
  return GAME_OWNED_LAYOUT_WORLD_REFS.includes(worldRef);
}

export const BEYOND_CLOUD_BOARD_REF = (
  `${EXPANSION_WORLD_BOARD_TEMPLATE.id}@${EXPANSION_WORLD_BOARD_TEMPLATE.version}`
);
export const BEYOND_CLOUD_THEME_REF = (
  `${EXPANSION_WORLD_THEME.id}@${EXPANSION_WORLD_THEME.version}`
);
export const BEYOND_CLOUD_FALLBACK_THEME_REF = (
  `${EXPANSION_WORLD_FALLBACK_THEME.id}@${EXPANSION_WORLD_FALLBACK_THEME.version}`
);
export const BEYOND_CLOUD_LEVEL_REF = (
  `${EXPANSION_WORLD_LEVEL_PACK.id}@${EXPANSION_WORLD_LEVEL_PACK.version}`
);
export const BEYOND_CLOUD_WORLD_REF = "world.ximitu.beyond-cloud@1.0.0";

export const BOARD_TEMPLATES = Object.freeze({
  [LEGACY_CLOUD_HARBOR_BOARD_REF]: LEGACY_BOARD_TEMPLATE_V2,
  [PREVIOUS_CLOUD_HARBOR_BOARD_REF]: PREVIOUS_BOARD_TEMPLATE_V21,
  [CRYSTAL_V120_BOARD_REF]: CRYSTAL_BOARD_TEMPLATE_V220,
  [CRYSTAL_V121_BOARD_REF]: CRYSTAL_BOARD_TEMPLATE_V221,
  [CLOUD_HARBOR_BOARD_REF]: BOARD_TEMPLATE,
  [BEYOND_CLOUD_BOARD_REF]: EXPANSION_WORLD_BOARD_TEMPLATE,
});

export const THEME_PACK_REGISTRY = Object.freeze({
  [LEGACY_CLOUD_HARBOR_THEME_REF]: LEGACY_CLOUD_HARBOR_THEME_V2,
  [PREVIOUS_CLOUD_HARBOR_THEME_REF]: PREVIOUS_CLOUD_HARBOR_THEME_V21,
  [CRYSTAL_V120_THEME_REF]: CRYSTAL_THEME_V220,
  [CRYSTAL_V121_THEME_REF]: CRYSTAL_THEME_V221,
  [CLOUD_HARBOR_THEME_REF]: THEME_PACKS["cloud-harbor"],
  [BEYOND_CLOUD_THEME_REF]: EXPANSION_WORLD_THEME,
  [BEYOND_CLOUD_FALLBACK_THEME_REF]: EXPANSION_WORLD_FALLBACK_THEME,
});

export const LEVEL_PACKS = Object.freeze({
  [LEGACY_CLOUD_HARBOR_LEVEL_REF]: LEVEL_ONE,
  [CLOUD_HARBOR_LEVEL_REF]: CURRENT_LEVEL_ONE,
  [BEYOND_CLOUD_LEVEL_REF]: EXPANSION_WORLD_LEVEL_PACK,
});

export const WORLD_PACKS = Object.freeze({
  [LEGACY_CLOUD_HARBOR_WORLD_REF]: Object.freeze({
    kind: "WorldPack",
    id: "world.ximitu.cloud-harbor",
    version: "1.0.0",
    title: "云港远征",
    boardTemplateRef: LEGACY_CLOUD_HARBOR_BOARD_REF,
    themePackRef: LEGACY_CLOUD_HARBOR_THEME_REF,
    levelPackRef: LEGACY_CLOUD_HARBOR_LEVEL_REF,
    assetBudget: Object.freeze({ maxArtRegions: 4 }),
  }),
  [PREVIOUS_CLOUD_HARBOR_WORLD_REF]: PREVIOUS_CLOUD_HARBOR_WORLD_V11,
  [CRYSTAL_V120_WORLD_REF]: CRYSTAL_WORLD_V120,
  [CRYSTAL_V121_WORLD_REF]: CRYSTAL_WORLD_V121,
  [CLOUD_HARBOR_WORLD_REF]: Object.freeze({
    kind: "WorldPack",
    id: "world.ximitu.cloud-harbor",
    version: "1.3.0",
    title: "云港远征",
    boardTemplateRef: CLOUD_HARBOR_BOARD_REF,
    themePackRef: CLOUD_HARBOR_THEME_REF,
    levelPackRef: CLOUD_HARBOR_LEVEL_REF,
    assetBudget: Object.freeze({ maxArtRegions: 4 }),
  }),
  [BEYOND_CLOUD_WORLD_REF]: Object.freeze({
    kind: "WorldPack",
    id: "world.ximitu.beyond-cloud",
    version: "1.0.0",
    title: "云外秘境",
    boardTemplateRef: BEYOND_CLOUD_BOARD_REF,
    themePackRef: BEYOND_CLOUD_THEME_REF,
    levelPackRef: BEYOND_CLOUD_LEVEL_REF,
    assetBudget: Object.freeze({ maxArtRegions: 4 }),
  }),
});

export const LEGACY_XIMITU_WORLD_ROUTE = Object.freeze({
  kind: "WorldRoute",
  id: "route.ximitu-main",
  version: "1.0.0",
  title: "西米兔向前远征",
  entryWorldRef: LEGACY_CLOUD_HARBOR_WORLD_REF,
  transitions: Object.freeze([
    Object.freeze({
      fromWorldRef: LEGACY_CLOUD_HARBOR_WORLD_REF,
      exitId: "forward",
      toWorldRef: BEYOND_CLOUD_WORLD_REF,
    }),
  ]),
  repeatableTail: Object.freeze({
    worldRef: BEYOND_CLOUD_WORLD_REF,
    exitId: "forward",
    instancePolicy: "append-new-instance-v1",
  }),
});

export const LEGACY_XIMITU_WORLD_ROUTE_REF = (
  `${LEGACY_XIMITU_WORLD_ROUTE.id}@${LEGACY_XIMITU_WORLD_ROUTE.version}`
);

export const XIMITU_WORLD_ROUTE = Object.freeze({
  kind: "WorldRoute",
  id: "route.ximitu-main",
  version: "1.3.0",
  title: "西米兔向前远征",
  entryWorldRef: CLOUD_HARBOR_WORLD_REF,
  transitions: Object.freeze([
    Object.freeze({
      fromWorldRef: CLOUD_HARBOR_WORLD_REF,
      exitId: "forward",
      toWorldRef: BEYOND_CLOUD_WORLD_REF,
    }),
  ]),
  repeatableTail: Object.freeze({
    worldRef: BEYOND_CLOUD_WORLD_REF,
    exitId: "forward",
    instancePolicy: "append-new-instance-v1",
  }),
});

// A separate release policy keeps historic shared expeditions immutable.
export const CIRCUIT_WORLD_ROUTE = Object.freeze({
  kind: "WorldRoute",
  id: "route.ximitu-circuit",
  version: "1.0.0",
  title: "云港循环冒险",
  entryWorldRef: CLOUD_HARBOR_WORLD_REF,
  transitions: Object.freeze([]),
  circuit: Object.freeze({ policy: "individual-laps-v1", worldRef: CLOUD_HARBOR_WORLD_REF, exitId: "forward" }),
});
export const CIRCUIT_WORLD_ROUTE_REF = `${CIRCUIT_WORLD_ROUTE.id}@${CIRCUIT_WORLD_ROUTE.version}`;

export const WORLD_ROUTES = Object.freeze({
  [LEGACY_XIMITU_WORLD_ROUTE_REF]: LEGACY_XIMITU_WORLD_ROUTE,
  [PREVIOUS_XIMITU_WORLD_ROUTE_REF]: PREVIOUS_XIMITU_WORLD_ROUTE,
  [CRYSTAL_V120_ROUTE_REF]: CRYSTAL_WORLD_ROUTE_V120,
  [CRYSTAL_V121_ROUTE_REF]: CRYSTAL_WORLD_ROUTE_V121,
  [`${XIMITU_WORLD_ROUTE.id}@${XIMITU_WORLD_ROUTE.version}`]: XIMITU_WORLD_ROUTE,
  [CIRCUIT_WORLD_ROUTE_REF]: CIRCUIT_WORLD_ROUTE,
});

export const WORLD_REWARD_DEFINITIONS = Object.freeze({
  ...REWARD_DEFINITIONS,
  ...EXPANSION_WORLD_LANDING_PROFILES,
});

export const WORLD_REGISTRIES = Object.freeze({
  boardTemplates: BOARD_TEMPLATES,
  themePacks: THEME_PACK_REGISTRY,
  levelPacks: LEVEL_PACKS,
  worldPacks: WORLD_PACKS,
});

export const XIMITU_GAME_RELEASE = Object.freeze({
  kind: "GameRelease",
  id: "release.ximitu-card-hunt",
  version: "2.3.0",
  worldRouteRef: `${XIMITU_WORLD_ROUTE.id}@${XIMITU_WORLD_ROUTE.version}`,
  rewardDefinitionRefs: Object.freeze(Object.keys(WORLD_REWARD_DEFINITIONS)),
});

// The previous expedition release stays registered for exact saved-game recovery.
export const CIRCUIT_GAME_RELEASE = Object.freeze({
  kind: "GameRelease",
  id: "release.ximitu-card-hunt",
  version: "2.4.0",
  worldRouteRef: CIRCUIT_WORLD_ROUTE_REF,
  rewardDefinitionRefs: Object.freeze(Object.keys(WORLD_REWARD_DEFINITIONS)),
});
