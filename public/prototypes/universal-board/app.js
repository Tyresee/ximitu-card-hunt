import {
  acceptAnswer,
  rollTeacherMove,
  rollTeacherWorldMove,
  acceptWorldAnswer,
  closeActivity,
  createRuntime,
  currentTask,
  findPendingRouteChoice,
  walkBoardPlan,
} from "./engine-core.js";
import {
  SENTENCE_ASSESSMENT_SOURCE,
  SentenceAssessmentClient,
} from "/js/sentence-assessment.js";
import {
  BROWSER_SENTENCE_SOURCE,
  BrowserSentenceCapture,
  browserSentenceCaptureSupported,
} from "/js/browser-sentence-capture.js";
import { BailianSentenceListener } from "/js/bailian-speech.js";
import { createTurnFlowGuard } from "./turn-flow-guard.js";
import { settlePointsOnlyAssetsForMove, pointsOnlyDiceRoll, pointsOnlyDiceFace, pointsOnlyDicePresentation } from "./points-only-economy.js";
import { createLandingPointsClient } from "./landing-points-client.js";
import { createGroupCoinFxLedger } from "./group-coin-fx-ledger.js";
import { createCoinGainFx, confirmedCoinGains, confirmedGroupCoinGains } from "./coin-gain-fx.js";
import { createBoardRouteChoiceLayer, routeChoiceLayout, routeChoiceLandingText, routeChoiceTagOffset } from "./board-route-choice.js";
import { automaticRouteChoice } from "./route-choice-equivalence.js";
import { routeChoiceOutcome } from "./route-choice-outcome.js";
import { appendTilePoints } from "./tile-points-visuals.js";
import { isClayPreviewRequest, withClayPreviewTheme, appendClayPreviewTile, appendClayRouteMaterial, appendClayRoutePavers, appendClaySpecialFlag, installClayPreviewDemo } from "./clay-preview.js";
import { isFivefoldRuleUpgrade } from "./landing-points-values.js";
import { DOUBLE_DICE_POLICY, doubleDiceSteps } from "./double-dice-core.js";
import { SPECIAL_CELLS_POLICY, SPECIAL_CELL_TYPE_BY_ID, specialCellAt, specialCellLandingCopy, GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending } from "./special-cells-core.js";
import { SpecialCellsIntroSequencer } from "./special-cells-intro.js";
import {
  liveSpecialCells, specialCellsMovesExhausted, specialCellMarker, specialCellShortLabel, revealSpecialCellMarker,
  renderSpecialCellsLegend, showSpecialCellBanner, askSpecialCellGroupMove,
} from "./special-cells-board.js";
import { homePointsSummary, pointsOnlyNodeOutcome, pointsOnlyNodeKind, pointsOnlyNodePresentation } from "./points-only-presentation.js";
import { LANDING_POINTS_KIND, assertLandingRoll, assertLandingPlan, recoverableLandingTurns } from "./landing-points-game.js";
import { appendGroundedNodeVisual } from "./grounded-node-visuals.js";
import { createGroundedRouteVisuals } from "./grounded-route-visuals.js";
import { crystalRouteSurfaces } from "./crystal-terrain-visuals.js";
import { airCrossingFrames, isAirCrossingEdge } from "./air-crossing-presentation.js";
import { DICE_THROW_DURATION, DICE_RESULT_HOLD_DURATION, DICE_STAGE_RESULT_DURATION, DICE_STAGE_EXIT_DURATION, DICE_RESULT_VIEW, DICE_FACE_ROTATIONS, diceThrowKeyframes, diceBevelPlanes, rewardReceiptCopy, startDiceFrameProbe } from "./game-feel.js";
import {
  ACTIVITY_TEMPLATES,
  EVALUATOR_REGISTRY,
  INTERACTION_TEMPLATES,
  LEARNING_PACKS,
  SESSION_CONFIGS,
  THEME_PACKS,
} from "./packs.js";
import {
  BEYOND_CLOUD_WORLD_REF,
  CLOUD_HARBOR_WORLD_REF,
  PREVIOUS_CLOUD_HARBOR_WORLD_REF,
  PREVIOUS_XIMITU_WORLD_ROUTE_REF,
  WORLD_ROUTES,
  isCloudHarborWorldRef,
  isCurrentCloudHarborWorldRef,
  isGameOwnedLayoutWorldRef,
  LEGACY_CLOUD_HARBOR_WORLD_REF,
  LEGACY_XIMITU_WORLD_ROUTE_REF,
  WORLD_REGISTRIES,
  XIMITU_WORLD_ROUTE,
  CIRCUIT_WORLD_ROUTE,
  CIRCUIT_WORLD_ROUTE_REF,
} from "./world-packs.js";
import {
  resolveWorldComposition,
  walkWorldPlan,
} from "./world-runtime-core.js";
import {
  cameraBounds,
  centerCameraOnPoint,
  clampCamera,
  dampCamera,
  fitCameraViewport,
  isPointVisible,
  screenDragToCamera,
  viewportSize,
} from "./camera-core.js";
import {
  compoundRoutePathData,
  resolvedEdgePathData,
  resolvedTransportPreviewPathData,
} from "./board-route-geometry.js";
import {
  acknowledgePresentation,
  buildSessionSummary,
  commitTriggeredTurn,
  completeBossSession,
  endBoardGame,
  createBoardSession,
  currentSessionSeat,
  isRestorableBoardSessionSnapshot,
  recordSpeechOutcome,
  resolveSessionActivity,
  sessionRound,
} from "/js/lib/voice-board-session-core.js";
import {
  CHARACTER_PROFILES,
  assignCharacter,
  characterSelectionComplete,
  diceTierForScore,
  minimumTurnsForSession,
  normalizeCharacterAssignments,
  turnRewardProfile,
} from "./experience-core.js";
import {
  FAIRY_STATUS,
  createFairyState,
} from "./treasure-core.js";
import {
  DEFAULT_DICE_PACK,
  DICE_PACK_FAMILY_IDS,
  DICE_REWARD_LIMITS,
  cloneDicePack,
  dicePacksEqual,
  generateLegendaryDiceFamilies,
  normalizeDicePack,
  rollDicePackFamily,
  runtimeDiceFaces,
  updateDicePackFace,
} from "./dice-pack-core.js";
import {
  DEFAULT_NODE_REWARD_PACK,
  NODE_REWARD_CATALOG,
  NODE_REWARD_LIMITS,
  NODE_REWARD_TYPES,
  NODE_REWARD_WORLD_REFS,
  cloneNodeRewardPack,
  nodeRewardCatalogEntry,
  nodeRewardChangedCount,
  nodeRewardLabel,
  nodeRewardPacksEqual,
  nodeRewardPolicy,
  normalizeNodeRewardPack,
  retargetNodeRewardPack,
  updateNodeRewardPolicy,
} from "./node-reward-pack-core.js";
import {
  CLASSROOM_EVENT_PROGRAM_CATALOG,
  CLASSROOM_EVENT_PROGRAM_LEARNING_REFS,
  CLASSROOM_EVENT_PROGRAM_WORLD_REFS,
  DEFAULT_CLASSROOM_EVENT_PROGRAM,
  classroomEvent,
  classroomEventAssignment,
  classroomEventChangedCount,
  classroomEventProgramsEqual,
  cloneClassroomEventProgram,
  learningPackRefFor,
  normalizeClassroomEventProgram,
  updateClassroomEventAssignment,
} from "./classroom-event-program-core.js";
import {
  migrateV4PlayerAssets,
  retireLegacyFairyCase,
  stableGuaranteeCursor,
} from "./player-assets-core.js";
import {
  STAR_ECONOMY_VERSION,
  createPlayerAssetsLedger,
  playerAssetSnapshot,
  playerAssetsView,
} from "./session-star-assets.js";
import {
  LEVEL_ONE,
  REWARD_DEFINITIONS,
  levelOneNodeKind,
  levelOnePhase,
} from "./level-one.js";
import { nodeOutcomePresentation } from "./node-outcome-presentation.js";
import {
  presentationForLevelOneNode,
} from "./level-one-presentations.js";
import {
  presentationForExpansionNode,
} from "./expansion-world-presentations.js";
import { buildActivityPresentation } from "./activity-presentation.js";
import { buildCollectionPresentationEvents } from "./collection-presentation.js";
import { createBoardSoundController } from "./sound-cues.js";
import {
  DICE_DOCK_STRENGTH_ORDER,
  diceProbabilitySummary,
  diceSelectionMood,
} from "./dice-presentation.js";
import { sentenceFramePresentation } from "./mission-answer-presentation.js";
import { appendNodeVisualLayers } from "./node-visuals.js";
import {
  createHarborMapState,
  settleHarborTurn,
} from "./harbor-items-core.js";
import { appendHarborLightHost } from "./harbor-light-host.js";
import {
  isCloudHarborPresentation,
  cloudHarborNodePresentation,
  cloudHarborNodeVisualKind,
  cloudHarborLandmark,
  cloudHarborRouteChoice,
} from "./cloud-harbor-presentation.js";
import { nodeLandingPointsPresentation } from "./node-landing-points-presentation.js";
import {
  applyBoardLayoutDraft,
  boardLayoutExport,
  createBoardLayoutDraft,
  normalizeBoardLayoutDraft,
  updateBoardLayoutDraft,
} from "./board-layout-editor-core.js";
import {
  NODE_AUTHORING_WORLD_REFS,
  createNodeAuthoringExchange,
  diffNodeAuthoringExchanges,
  normalizeNodeAuthoringExchange,
  projectNodeAuthoringExchange,
} from "./node-authoring-exchange-core.js";
import {
  authoringDraftFingerprint,
  createAuthoringDraftEnvelope,
  resolveAuthoringDraftRecord,
} from "./authoring-draft-envelope-core.js";

import { TEACHER_MODE, TEACHER_DICE, isTeacherSession, initializeTeacherSession,
  grantTeacherOpportunity, commitTeacherTurn } from "/js/lib/teacher-board-session.js";
import { teacherDiceFaces, teacherDiceLabel, teacherDiceRoll, sampleTeacherDice } from "./teacher-dice.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LOCAL_SESSION_KEY = "tim.voice-board.local-session.v1";
const LOCAL_SESSION_V4_BACKUP_KEY = `${LOCAL_SESSION_KEY}.v4-backup`;
const LOCAL_SESSION_V5_BACKUP_KEY = `${LOCAL_SESSION_KEY}.v5-backup`;
const LOCAL_SESSION_V6_BACKUP_KEY = `${LOCAL_SESSION_KEY}.v6-backup`;
const LOCAL_SESSION_V7_BACKUP_KEY = `${LOCAL_SESSION_KEY}.v7-backup`;
const LOCAL_SESSION_V8_BACKUP_KEY = `${LOCAL_SESSION_KEY}.v8-backup`;
const LOCAL_SESSION_V9_BACKUP_KEY = `${LOCAL_SESSION_KEY}.v9-backup`;
const LOCAL_SESSION_V10_BACKUP_KEY = `${LOCAL_SESSION_KEY}.v10-backup`;
const LOCAL_SESSION_V11_BACKUP_KEY = `${LOCAL_SESSION_KEY}.v11-backup`;
const LOCAL_SESSION_SCHEMA_VERSION = 12;
const LOCAL_LAYOUT_DRAFT_PREFIX = "tim.voice-board.board-layout-draft.v1:";
const LOCAL_LAYOUT_APPLIED_PREFIX = "tim.voice-board.board-layout-applied.v1:";
const BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION = "board-layout-registry.v1";
const LOCAL_DICE_PACK_DRAFT_KEY = "tim.voice-board.dice-pack-draft.v1";
const LOCAL_DICE_PACK_APPLIED_KEY = "tim.voice-board.dice-pack-applied.v1";
const DICE_PACK_REGISTRY_SCHEMA_VERSION = "dice-pack-registry.v1";
const LOCAL_NODE_REWARD_PACK_DRAFT_KEY = "tim.voice-board.node-reward-pack-draft.v1";
const LOCAL_NODE_REWARD_PACK_APPLIED_KEY = "tim.voice-board.node-reward-pack-applied.v1";
const NODE_REWARD_PACK_REGISTRY_SCHEMA_VERSION = "node-reward-pack-registry.v1";
const LOCAL_CLASSROOM_EVENT_PROGRAM_DRAFT_KEY = (
  "tim.voice-board.classroom-event-program-draft.v1"
);
const LOCAL_CLASSROOM_EVENT_PROGRAM_APPLIED_KEY = (
  "tim.voice-board.classroom-event-program-applied.v1"
);
const CLASSROOM_EVENT_PROGRAM_REGISTRY_SCHEMA_VERSION = (
  "classroom-event-program-registry.v1"
);
const CARD_CATALOG_REGISTRY_SCHEMA_VERSION = "card-catalog-registry.v1";
const CARD_CATALOG_SCHEMA_VERSION = "ximitu-card-catalog.v1";
const CARD_CATALOG_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const STUDENT_PROFILE_STORE_SCHEMA_VERSION = "student-profile-store.v1";
const NODE_AUTHORING_EXCHANGE_MAX_BYTES = 512 * 1024;
const DICE_CHOICE_RETRY = Symbol("dice-choice-retry");
const PAGE_QUERY = new URLSearchParams(window.location.search);
const QA_PAGE_REQUESTED = PAGE_QUERY.get("qa") === "1";
const LAYOUT_EDITOR_REQUESTED = PAGE_QUERY.get("layoutEditor") === "1";
const CLAY_PREVIEW_REQUESTED = isClayPreviewRequest(window.location);
if (CLAY_PREVIEW_REQUESTED) document.body.dataset.visualPreview = "clay";
const QA_HARNESS_REQUESTED = (
  QA_PAGE_REQUESTED
  && PAGE_QUERY.get("qaHarness") === "1"
);
const QA_FAST_MODE_REQUESTED = (
  QA_HARNESS_REQUESTED
  && PAGE_QUERY.get("qaFast") === "1"
);
const INITIAL_WORLD_COMPOSITION = resolveWorldComposition(
  CLOUD_HARBOR_WORLD_REF,
  WORLD_REGISTRIES,
);
let activeWorldComposition = INITIAL_WORLD_COMPOSITION;
let activeBoardTemplate = activeWorldComposition.board;
let activeLevelPack = activeWorldComposition.level;
let visualBoardTemplate = activeBoardTemplate;
let nodeById = new Map(activeBoardTemplate.nodes.map((node) => [node.id, node]));
const publishedBoardLayouts = new Map();
let publishedDicePackPublication = {
  status: "default",
  revision: null,
  updatedAt: null,
  pack: cloneDicePack(DEFAULT_DICE_PACK),
};
let sessionDicePackSnapshot = null;
let publishedNodeRewardPackPublication = {
  status: "default",
  revision: null,
  updatedAt: null,
  pack: cloneNodeRewardPack(DEFAULT_NODE_REWARD_PACK),
};
let sessionNodeRewardPackSnapshot = null;
let publishedClassroomEventProgramPublication = {
  status: "default",
  revision: null,
  updatedAt: null,
  program: cloneClassroomEventProgram(DEFAULT_CLASSROOM_EVENT_PROGRAM),
};
let sessionClassroomEventProgramSnapshot = null;
let publishedCardCatalogPublication = {
  status: "default",
  revision: null,
  updatedAt: null,
  updatedBy: null,
  schemaVersion: CARD_CATALOG_SCHEMA_VERSION,
  cards: [],
};
let sessionCardCatalogSnapshot = null;
const root = document.documentElement;
const PLAYER_PROFILES = [
  { glyph: "M", bodyClass: "pawn-team-0" },
  { glyph: "L", bodyClass: "pawn-team-1" },
  { glyph: "A", bodyClass: "pawn-team-2" },
  { glyph: "T", bodyClass: "pawn-team-3" },
  { glyph: "N", bodyClass: "pawn-team-4" },
  { glyph: "O", bodyClass: "pawn-team-5" },
  { glyph: "E", bodyClass: "pawn-team-6" },
  { glyph: "Z", bodyClass: "pawn-team-7" },
];
const DEMO_PLAYERS = ["Mia", "Leo", "Ava", "Tom", "Nina", "Owen", "Eli", "Zoe"];
const INTERACTION_RENDERERS = {
  "voice.mission-card.v1": renderVoiceSentenceCard,
};
const MAP_EFFECT_PRESENTERS = Object.freeze({
  "harbor.foghorn.v1": playHarborFoghorn,
  "harbor.cloudfall-gate.v1": playCloudfallGate,
});
const turnFlowGuard = createTurnFlowGuard({
  scoredSources: [SENTENCE_ASSESSMENT_SOURCE],
  teacherReviewSources: [
    SENTENCE_ASSESSMENT_SOURCE,
    BROWSER_SENTENCE_SOURCE,
  ],
  qaSource: "qa-harness",
});

function buildDemoTeams(playerCount) {
  const normalizedCount = Math.max(1, Math.min(8, Number(playerCount) || 1));
  const roster = selectedStudentProfiles().slice(0, normalizedCount);
  const players = roster.length === normalizedCount
    ? roster.map((student) => ({ id: student.id, displayName: studentGameName(student) }))
    : DEMO_PLAYERS.slice(0, normalizedCount).map((displayName, index) => ({
        id: `seat-${index + 1}`,
        displayName,
      }));
  return players.map((player) => ({
    id: `player-${player.id}`,
    label: player.displayName,
    members: [player.displayName],
  }));
}

const XIMITU_WORLD_ROUTE_REF = (
  `${XIMITU_WORLD_ROUTE.id}@${XIMITU_WORLD_ROUTE.version}`
);

function currentWorldRoute() {
  const routeRef = runtime?.world?.routeRef;
  if (!routeRef) return CIRCUIT_WORLD_ROUTE;
  const route = WORLD_ROUTES[routeRef];
  if (!route) throw new Error(`Unregistered saved world route: ${routeRef}`);
  return route;
}

function worldRouteTransitionForExit(worldRef, exitId) {
  const route = currentWorldRoute();
  if (route.circuit?.policy === "individual-laps-v1"
    && route.circuit.worldRef === worldRef && route.circuit.exitId === exitId) {
    return { fromWorldRef: worldRef, toWorldRef: worldRef, exitId, circuit: true };
  }
  const authored = route.transitions.find((transition) => (
    transition.fromWorldRef === worldRef
    && transition.exitId === exitId
  ));
  if (authored) return authored;
  const tail = route.repeatableTail;
  if (
    tail?.worldRef === worldRef
    && tail.exitId === exitId
    && tail.instancePolicy === "append-new-instance-v1"
  ) {
    return {
      fromWorldRef: worldRef,
      exitId,
      toWorldRef: worldRef,
      repeatableTail: true,
      instancePolicy: tail.instancePolicy,
    };
  }
  return null;
}

function worldRuntimeState({
  sessionId = "local-preview",
  worldRef = CLOUD_HARBOR_WORLD_REF,
  ordinal = 1,
  routeRef = CIRCUIT_WORLD_ROUTE_REF,
  mapState = {},
  levelState = {},
} = {}) {
  return {
    schemaVersion: "world-runtime.v1",
    routeRef,
    active: {
      instanceId: `${sessionId}:world:${ordinal}`,
      ordinal,
      worldPackRef: worldRef,
      mapState: structuredClone(mapState),
      levelState: structuredClone(levelState),
    },
    completed: [],
    processedTransitionIds: [],
  };
}

function worldTransitionPresentationRuntime({
  baselineRuntime,
  destinationComposition,
  destinationInstanceId,
  destinationOrdinal,
  entryNodeId,
}) {
  const mapState = structuredClone(
    destinationComposition.level.initialMapState || {},
  );
  const levelState = structuredClone(
    destinationComposition.level.initialLevelState || {},
  );
  const destinationTheme = composedThemeForWorld(destinationComposition);
  return {
    ...baselineRuntime,
    boardId: destinationComposition.board.id,
    themeId: destinationTheme.id,
    mapState,
    teams: baselineRuntime.teams.map((team) => ({
      ...team,
      nodeId: entryNodeId,
    })),
    world: {
      ...baselineRuntime.world,
      active: {
        instanceId: destinationInstanceId,
        ordinal: destinationOrdinal,
        worldPackRef: destinationComposition.worldRef,
        mapState: structuredClone(mapState),
        levelState,
      },
    },
  };
}

function composedThemeForWorld(composition, preferredTheme = null) {
  if (isCloudHarborWorldRef(composition.worldRef)) {
    const baseTheme = preferredTheme?.nodeSkins
      && preferredTheme.id === composition.theme.id
      && preferredTheme.version === composition.theme.version
      ? preferredTheme
      : composition.theme;
    return withClayPreviewTheme(baseTheme, { board: composition.board, enabled: CLAY_PREVIEW_REQUESTED });
  }
  const base = THEME_PACKS["cloud-harbor"];
  const worldTheme = composition.theme;
  const regionArt = Object.fromEntries(
    (composition.board.artRegions || []).map((region) => {
      const fallback = worldTheme.regionFallbacks?.[region.id] || {};
      const authoredArt = worldTheme.regionArt?.[region.id] || {};
      return [
        region.id,
        {
          ...authoredArt,
          fallbackFill: fallback.fill || worldTheme.palette?.terrain,
          transitionFill: authoredArt.transitionFill
            || fallback.fill
            || worldTheme.palette?.terrain,
          transitionStyle: authoredArt.transitionStyle || "aurora",
        },
      ];
    }),
  );
  return {
    ...base,
    ...worldTheme,
    regionArt,
    nodeSkins: base.nodeSkins,
    facilitySkins: {},
    routeSkin: {
      ...base.routeSkin,
      textureAssetRef: "",
      baseColor: worldTheme.palette?.route || base.routeSkin.baseColor,
      activeColor: worldTheme.palette?.accent || base.routeSkin.activeColor,
    },
    landmarks: [
      { x: 235, y: 390, icon: "✦", label: "星门浮岛" },
      { x: 1730, y: 195, icon: "🐋", label: "云鲸航道" },
      { x: 1930, y: 905, icon: "◇", label: "极光晶林" },
      { x: 610, y: 890, icon: "☾", label: "月轮遗迹" },
    ],
    transportSkins: {
      "jump.comet-lift.v1": {
        label: "彗星升降舱",
        announcement: "彗星轨道已经锁定！",
        deviceVariant: "comet-lift",
      },
      "jump.bubble-geyser.v1": {
        label: "云鲸泡泡喷泉",
        announcement: "泡泡航线正在升空！",
        deviceVariant: "bubble-geyser",
      },
    },
    mapEffectSkins: {
      "beyond-cloud.echo-observatory.v1": {
        label: "回声观测塔",
        announcement: "捕捉到一段远方回声！",
        resultCopy: "世界图鉴记录了新的声波线索",
        deviceVariant: "world-signal",
      },
      "beyond-cloud.constellation-lens.v1": {
        label: "星座棱镜",
        announcement: "隐藏星线正在显形！",
        resultCopy: "前方星路被棱镜照亮",
        deviceVariant: "world-prism",
      },
      "beyond-cloud.cloud-whale-beacon.v1": {
        label: "云鲸信标",
        announcement: "云鲸回应了远征信号！",
        resultCopy: "云鲸航道留下新的图鉴印记",
        deviceVariant: "world-beacon",
      },
      "beyond-cloud.cloud-whale-pool.v1": {
        label: "云鲸潮汐池",
        announcement: "星潮正在池中旋转！",
        resultCopy: "潮汐池显出一条发光航迹",
        deviceVariant: "world-tide",
      },
      "beyond-cloud.prism-telescope.v1": {
        label: "棱光望远镜",
        announcement: "镜筒锁定了极光深处！",
        resultCopy: "极光晶林出现新的远景",
        deviceVariant: "world-prism",
      },
      "beyond-cloud.prism-tree.v1": {
        label: "极光棱晶树",
        announcement: "棱晶树把光桥唤醒了！",
        resultCopy: "全班共享的极光桥已经开启",
        deviceVariant: "world-tree",
      },
      "beyond-cloud.aurora-projector.v1": {
        label: "极光投影仪",
        announcement: "天空投出了下一段航线！",
        resultCopy: "月轮遗迹的入口得到标记",
        deviceVariant: "world-aurora",
      },
      "beyond-cloud.moon-dial.v1": {
        label: "月轮星盘",
        announcement: "古老星盘重新开始转动！",
        resultCopy: "世界图鉴收录了月轮坐标",
        deviceVariant: "world-moon",
      },
    },
  };
}

function activateWorldComposition(
  worldRef,
  {
    preferredTheme = null,
    resetCamera = true,
    visitedNodeIds: nextVisitedNodeIds = null,
  } = {},
) {
  const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  activeWorldComposition = composition;
  activeBoardTemplate = composition.board;
  activeLevelPack = composition.level;
  applyConfirmedVisualBoard(composition.worldRef);
  theme = composedThemeForWorld(composition, preferredTheme);
  visitedNodeIds = nextVisitedNodeIds || new Set([activeBoardTemplate.startNodeId]);
  regionArtSceneCache = null;
  unavailableArtwork.clear();
  if (resetCamera) camera = initialBoardCamera();
  if (typeof nodes !== "undefined") {
    nodes.board.querySelectorAll("image").forEach((image) => {
      image.removeAttribute("href");
    });
    nodes.board.replaceChildren();
    nodes.miniMap.replaceChildren();
  }
  return composition;
}

function createPrototypeRuntime(mode = "voice") {
  const created = createRuntime({
    mode,
    board: activeBoardTemplate,
    theme,
    learningPack,
    teams: buildDemoTeams(playerCount),
    interactionTemplates: INTERACTION_TEMPLATES,
    evaluatorRegistry: EVALUATOR_REGISTRY,
    interactionRenderers: INTERACTION_RENDERERS,
  });
  return {
    ...created,
    mapState: isCloudHarborWorldRef(activeWorldComposition.worldRef)
      ? createHarborMapState(created.mapState)
      : structuredClone(activeLevelPack.initialMapState || {}),
    world: worldRuntimeState({
      worldRef: activeWorldComposition.worldRef,
      mapState: isCloudHarborWorldRef(activeWorldComposition.worldRef)
        ? createHarborMapState(created.mapState)
        : structuredClone(activeLevelPack.initialMapState || {}),
      levelState: activeLevelPack.initialLevelState || {},
    }),
  };
}

function createInitialFairy(runtimeValue) {
  void runtimeValue;
  return createFairyState();
}

let theme = withClayPreviewTheme(THEME_PACKS["cloud-harbor"], {
  board: activeBoardTemplate, enabled: CLAY_PREVIEW_REQUESTED,
});
let learningPack = LEARNING_PACKS.family;
let playerCount = 4;
let studentProfiles = [];
let selectedStudentIds = [];
let studentProfilesLoaded = false;
let studentProfilesLoading = false;
let studentProfilesError = "";
let sessionConfigurationLoading = true;
let studentCreateBusy = false;
let studentManagerSelectedId = null;
let studentManagerBusy = false;
let pendingStudentAssetSettlements = [];
let runtime = createPrototypeRuntime();
let gameSession = null;
let teacherSelectedSeatId = null;
let lastSessionSummary = null;
let movingTeamId = null;
let visualNodeId = null;
let visitedNodeIds = new Set();
let busy = false;
let attemptSequence = 0;
let boardWorld = null;
let miniCameraWindow = null;
let cameraCanvasSize = { width: window.innerWidth, height: window.innerHeight };
let camera = { x: 0, y: 0 };
let cameraAnimation = null;
let panGesture = null;
let cameraZoneKey = null;
let regionArtSceneCache = null;
const unavailableArtwork = new Set();
let sentenceListener = null;
let sentenceListenerTurnKey = null;
let speechStatus = "checking";
let speechTranscript = "";
let speechScoringStartedAt = 0;
let pendingSpeechDecision = null;
let pendingTurnCommand = null;
let voiceBoardAssessmentConfigured = false;
let voiceBoardKnowledgeAsrConfigured = false;
let voiceBoardAsrAuthenticated = false;
let voiceBoardBrowserFallbackAvailable = false;
let qaControlsEnabled = false;
let qaHarnessEnabled = false;
let layoutEditorAuthorized = false;
let layoutEditorOwnerUserId = null;
let authenticatedUserId = null;
// Per-task read of the special-cells snapshot (see currentSpecialCells).
let specialCellsRead = null;
const landingPoints = createLandingPointsClient({
  getUserId: () => authenticatedUserId,
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  onChange: () => { specialCellsRead = null; renderPlatformPoints(); renderTeacherPanel(); },
});
const landingRecoveryFlights = new Map();
let landingPointsMessage = "";
let boardLayoutRegistryLoaded = false;
let boardLayoutRegistryError = "";
let dicePackRegistryLoaded = false;
let nodeRewardPackRegistryLoaded = false;
let classroomEventProgramRegistryLoaded = false;
let cardCatalogRegistryLoaded = false;
const layoutEditor = {
  active: false,
  activePane: "nodes",
  tool: "node",
  worldRef: CLOUD_HARBOR_WORLD_REF,
  baseBoard: null,
  draft: null,
  selectedNodeId: null,
  grid: 1,
  undo: [],
  redo: [],
  gesture: null,
  revision: 0,
  restore: null,
  staleDraft: false,
  staleDraftRaw: "",
  draftSourceRevision: null,
  draftSourceFingerprint: "",
  draftNotice: "",
  storageAvailable: true,
  savedRevision: 0,
  lastSavedAt: "",
  exportedRevision: 0,
  publishedDraft: null,
  publishedRevision: null,
  publicationSource: "base",
  saving: false,
  publishError: "",
};
const dicePackEditor = {
  selectedFamilyId: "starter",
  draft: null,
  publishedPack: null,
  publishedRevision: null,
  publicationSource: "default",
  storageAvailable: true,
  staleDraft: false,
  staleDraftRaw: "",
  draftSourceRevision: null,
  draftSourceFingerprint: "",
  draftNotice: "",
  saving: false,
  publishError: "",
  lastSavedAt: "",
};
const nodeRewardEditor = {
  worldRef: CLOUD_HARBOR_WORLD_REF,
  selectedNodeId: null,
  draft: null,
  publishedPack: null,
  publishedRevision: null,
  publicationSource: "default",
  storageAvailable: true,
  staleDraft: false,
  staleDraftRaw: "",
  draftSourceRevision: null,
  draftSourceFingerprint: "",
  draftNotice: "",
  saving: false,
  publishError: "",
  lastSavedAt: "",
};
const classroomEventEditor = {
  learningRef: CLASSROOM_EVENT_PROGRAM_LEARNING_REFS[0] || "",
  worldRef: CLOUD_HARBOR_WORLD_REF,
  selectedNodeId: null,
  draft: null,
  publishedProgram: null,
  publishedRevision: null,
  publicationSource: "default",
  storageAvailable: true,
  staleDraft: false,
  staleDraftRaw: "",
  draftSourceRevision: null,
  draftSourceFingerprint: "",
  draftNotice: "",
  saving: false,
  publishError: "",
  lastSavedAt: "",
};
const cardCatalogEditor = {
  adding: false,
  uploadingCardId: null,
  query: "",
  error: "",
  notice: "",
};
const nodeAuthoringExchangeEditor = {
  baseline: null,
  candidate: null,
  diff: null,
  projected: null,
  generatedText: "",
  inputFingerprint: "",
  scopeSnapshot: null,
};
let characterAssignments = normalizeCharacterAssignments([], playerCount);
let selectedCharacterSeatIndex = 0;
let showtimeActive = false;
let showtimeSequence = 0;
let lastAnnouncedActiveTeamId = null;
let turnFeedbackDismissTimer = null;
let turnFeedbackExitTimer = null;
let playerAssetsLedger = createPlayerAssetsLedger({
  playerIds: runtime.teams.map((team, index) => `seat-${index + 1}`),
});
let visiblePlayerAssetsById = playerAssetsView(playerAssetsLedger);
let fairyState = createFairyState();
let pendingDiceChoice = null;
let lastDicePresentation = null;
let pendingRouteChoice = null;
let routeChoicePresentation = null;
let pendingCoinExchangeChoice = null;
let movePlanPresentation = null;
let activityResolutionPending = false;
let activeDiceDockIds = [];
let activeDiceMood = null;
let speechAttemptTurnKey = null;
let speechAttemptOrdinal = 0;
let scoreRetryUsedTurnKey = null;
let currentDiceRewardOriginPoint = null;
let rewardPresentationEpoch = 0;
const rewardPresentationQueues = new Map();
const boardSounds = createBoardSoundController({ windowRef: window });
const DICE_ROLL_DURATION = DICE_THROW_DURATION;
const TURN_FEEDBACK_AUTO_DISMISS_MS = 6500;
const TURN_FEEDBACK_EXIT_MS = 220;
const DICE_FAMILY_META = Object.freeze({
  starter: { label: "起步骰", description: "起步档位的六个实体骰面，逐面等概率抽取。" },
  brave: { label: "勇气骰", description: "勇气档位的六个实体骰面，逐面等概率抽取。" },
  support: { label: "课堂助力骰", description: "教师确认完成后使用的六个实体骰面。" },
  steady: { label: "稳健骰", description: "传奇区的稳健选择，按当前发布骰面随机抽取。" },
  sprint: { label: "冲刺骰", description: "传奇区的冲刺选择，按当前发布骰面随机抽取。" },
  treasure: { label: "寻宝骰", description: "传奇区的寻宝选择，按当前发布骰面随机前进。" },
});

function authoringDraftStaleStorageKey(storageKey, raw) {
  return `${storageKey}:stale:${layoutDraftRawHash(raw)}`;
}

function bindEditorDraftSource(editor, sourceRevision, sourceValue) {
  editor.draftSourceRevision = sourceRevision ?? null;
  editor.draftSourceFingerprint = authoringDraftFingerprint(sourceValue);
}

function editorDraftSourceMatches(editor, sourceRevision, sourceValue) {
  return Boolean(
    editor
    && !editor.staleDraftRaw
    && editor.draftSourceRevision === (sourceRevision ?? null)
    && editor.draftSourceFingerprint === authoringDraftFingerprint(sourceValue)
  );
}

function quarantineLocalAuthoringDraft(storageKey, raw, safeEnvelope) {
  const staleKey = authoringDraftStaleStorageKey(storageKey, raw);
  if (localStorage.getItem(staleKey) === null) {
    localStorage.setItem(staleKey, raw);
  }
  if (localStorage.getItem(staleKey) !== raw) {
    throw new Error("旧草稿备份校验失败");
  }
  localStorage.setItem(storageKey, JSON.stringify(safeEnvelope));
  return staleKey;
}

function loadLocalAuthoringDraft({
  storageKey,
  normalizeDraft,
  sourceRevision,
  sourceValue,
  cloneDraft = (value) => structuredClone(value),
  label,
}) {
  const normalizedSource = normalizeDraft(sourceValue);
  const safeEnvelope = createAuthoringDraftEnvelope(normalizedSource, {
    sourceRevision,
    sourceValue: normalizedSource,
  });
  let raw = "";
  try {
    raw = localStorage.getItem(storageKey) || "";
  } catch {
    return {
      draft: cloneDraft(normalizedSource),
      sourceRevision: sourceRevision ?? null,
      sourceFingerprint: safeEnvelope.sourceFingerprint,
      storageAvailable: false,
      staleDraft: false,
      staleDraftRaw: "",
      notice: `${label}的本地存储不可用，已从当前发布版读取。`,
    };
  }
  if (!raw) {
    return {
      draft: cloneDraft(normalizedSource),
      sourceRevision: sourceRevision ?? null,
      sourceFingerprint: safeEnvelope.sourceFingerprint,
      storageAvailable: true,
      staleDraft: false,
      staleDraftRaw: "",
      notice: "",
    };
  }
  try {
    const resolved = resolveAuthoringDraftRecord(JSON.parse(raw), {
      normalizeDraft,
      sourceRevision,
      sourceValue: normalizedSource,
    });
    if (resolved.migratedLegacy) {
      localStorage.setItem(storageKey, JSON.stringify(resolved.envelope));
    }
    return {
      draft: cloneDraft(resolved.draft),
      sourceRevision: resolved.envelope.sourceRevision,
      sourceFingerprint: resolved.envelope.sourceFingerprint,
      storageAvailable: true,
      staleDraft: false,
      staleDraftRaw: "",
      notice: resolved.migratedLegacy
        ? `${label}的旧格式草稿与当前发布版一致，已安全升级。`
        : "",
    };
  } catch {
    try {
      quarantineLocalAuthoringDraft(storageKey, raw, safeEnvelope);
      return {
        draft: cloneDraft(normalizedSource),
        sourceRevision: sourceRevision ?? null,
        sourceFingerprint: safeEnvelope.sourceFingerprint,
        storageAvailable: true,
        staleDraft: true,
        staleDraftRaw: "",
        notice: `${label}的旧草稿来源与当前发布版不一致，已备份且未自动合并；当前从最新发布版重新开始。`,
      };
    } catch {
      return {
        draft: cloneDraft(normalizedSource),
        sourceRevision: sourceRevision ?? null,
        sourceFingerprint: safeEnvelope.sourceFingerprint,
        storageAvailable: false,
        staleDraft: true,
        staleDraftRaw: raw,
        notice: `${label}的旧草稿来源无法确认且备份失败；已阻止编辑、导出与发布。`,
      };
    }
  }
}

function applyLoadedAuthoringDraft(editor, loaded) {
  editor.draft = loaded.draft;
  editor.storageAvailable = loaded.storageAvailable;
  editor.staleDraft = loaded.staleDraft;
  editor.staleDraftRaw = loaded.staleDraftRaw;
  editor.draftSourceRevision = loaded.sourceRevision;
  editor.draftSourceFingerprint = loaded.sourceFingerprint;
  editor.draftNotice = loaded.notice;
}

function persistLocalAuthoringDraft({
  editor,
  storageKey,
  normalizeDraft,
  sourceRevision,
  sourceValue,
}) {
  if (
    !editor?.draft
    || !editorDraftSourceMatches(editor, sourceRevision, sourceValue)
  ) {
    editor.storageAvailable = false;
    return false;
  }
  try {
    const normalized = normalizeDraft(editor.draft);
    const envelope = createAuthoringDraftEnvelope(normalized, {
      sourceRevision,
      sourceValue,
    });
    localStorage.setItem(storageKey, JSON.stringify(envelope));
    editor.storageAvailable = true;
    editor.staleDraft = false;
    editor.staleDraftRaw = "";
    return true;
  } catch {
    editor.storageAvailable = false;
    return false;
  }
}

function dicePackChangedFaceCount(draft, publishedPack) {
  if (!draft || !publishedPack) return 0;
  let changed = 0;
  DICE_PACK_FAMILY_IDS.forEach((familyId) => {
    for (let index = 0; index < 6; index += 1) {
      if (
        JSON.stringify(draft.families[familyId][index])
        !== JSON.stringify(publishedPack.families[familyId][index])
      ) {
        changed += 1;
      }
    }
  });
  return changed;
}

function loadDicePackEditorDraft() {
  const publication = effectivePublishedDicePackPublication();
  dicePackEditor.publishedPack = cloneDicePack(publication.pack);
  dicePackEditor.publishedRevision = publication.revision;
  dicePackEditor.publicationSource = publication.status;
  applyLoadedAuthoringDraft(dicePackEditor, loadLocalAuthoringDraft({
    storageKey: LOCAL_DICE_PACK_DRAFT_KEY,
    normalizeDraft: normalizeDicePack,
    sourceRevision: publication.revision,
    sourceValue: publication.pack,
    cloneDraft: cloneDicePack,
    label: "骰子配置",
  }));
  dicePackEditor.publishError = "";
  dicePackEditor.saving = false;
  dicePackEditor.lastSavedAt = "";
}

function persistDicePackEditorDraft() {
  return persistLocalAuthoringDraft({
    editor: dicePackEditor,
    storageKey: LOCAL_DICE_PACK_DRAFT_KEY,
    normalizeDraft: normalizeDicePack,
    sourceRevision: dicePackEditor.publishedRevision,
    sourceValue: dicePackEditor.publishedPack,
  });
}

function dicePackRewardOption(type) {
  return {
    none: "无奖励",
    coin: "金币",
    star: "星星",
  }[type] || type;
}

function renderDicePackEditorFaces() {
  if (!dicePackEditor.draft || !nodes.dicePackEditorFaces) return;
  const faces = dicePackEditor.draft.families[dicePackEditor.selectedFamilyId];
  nodes.dicePackEditorFaces.replaceChildren(...faces.map((face, faceIndex) => {
    const row = document.createElement("div");
    row.className = "dice-pack-face-row";
    row.dataset.faceIndex = String(faceIndex);
    const steps = document.createElement("select");
    steps.className = "dice-pack-face-steps";
    steps.setAttribute("aria-label", `第 ${faceIndex + 1} 面点数`);
    steps.replaceChildren(...[1, 2, 3, 4, 5, 6].map((value) => new Option(String(value), String(value), false, value === face.steps)));
    steps.disabled = dicePackEditor.saving || !dicePackEditor.storageAvailable;
    row.append(textElement("span", "dice-pack-face-index", String(faceIndex + 1)), steps);
    return row;
  }));
}

function syncDicePackEditorControls({ announce = "" } = {}) {
  if (!dicePackEditor.draft || !nodes.dicePackEditorSaveBar) return;
  const familyId = dicePackEditor.selectedFamilyId;
  const meta = DICE_FAMILY_META[familyId] || { label: familyId, description: "" };
  const faces = runtimeDiceFaces(dicePackEditor.draft, familyId);
  const changedCount = dicePackChangedFaceCount(
    dicePackEditor.draft,
    dicePackEditor.publishedPack,
  );
  const draftMatchesPublished = dicePacksEqual(
    dicePackEditor.draft,
    dicePackEditor.publishedPack,
  );
  const publishRequired = Boolean(
    layoutEditorOwnerUserId
    && dicePackEditor.publicationSource !== "active"
    && !dicePacksEqual(dicePackEditor.draft, DEFAULT_DICE_PACK),
  );
  const saveState = dicePackEditor.saving
    ? "saving"
    : !dicePackEditor.storageAvailable || dicePackEditor.publishError
      ? "error"
      : !draftMatchesPublished || publishRequired
        ? "dirty"
        : "saved";
  nodes.dicePackEditorFamily.value = familyId;
  nodes.dicePackEditorFamilyName.textContent = meta.label;
  const average = faces.reduce((total, face) => total + face.steps, 0) / faces.length;
  nodes.dicePackEditorFamilySummary.textContent = (
    `${diceProbabilitySummary(faces)} · 平均 ${average.toFixed(1)} 格 · 六面等概率`
  );
  const die = createPhysicalDie(familyId, faces, { mini: true });
  die.rotor.classList.add("is-waiting");
  nodes.dicePackEditorPreviewDie.replaceChildren(die.viewport);
  nodes.dicePackEditorSaveBar.dataset.saveState = saveState;
  nodes.dicePackEditorSaveBar.setAttribute("aria-busy", String(dicePackEditor.saving));
  nodes.dicePackEditorSave.disabled = (
    dicePackEditor.saving || !dicePackEditor.storageAvailable
  );
  nodes.layoutEditorClose.disabled = (
    layoutEditor.saving
    || dicePackEditor.saving
    || nodeRewardEditor.saving
    || classroomEventEditor.saving
  );
  if (saveState === "saving") {
    nodes.dicePackEditorSaveState.textContent = "正在校验并发布骰子配置…";
  } else if (saveState === "error") {
    nodes.dicePackEditorSaveState.textContent = dicePackEditor.publishError
      || dicePackEditor.draftNotice
      || "保存失败，当前骰子草稿尚未发布。";
  } else if (dicePackEditor.draftNotice) {
    nodes.dicePackEditorSaveState.textContent = dicePackEditor.draftNotice;
  } else if (saveState === "dirty") {
    nodes.dicePackEditorSaveState.textContent = "有未发布的骰面调整；新棋局暂时仍使用已发布版本。";
  } else if (dicePackEditor.lastSavedAt) {
    nodes.dicePackEditorSaveState.textContent = (
      `已于 ${dicePackEditor.lastSavedAt} 发布；新开的棋局会使用此版本。`
    );
  } else if (dicePackEditor.publicationSource === "active") {
    nodes.dicePackEditorSaveState.textContent = "已载入当前正式使用的骰子配置。";
  } else if (dicePackEditor.publicationSource === "qa-local") {
    nodes.dicePackEditorSaveState.textContent = "已载入当前测试浏览器使用的骰子配置。";
  } else {
    nodes.dicePackEditorSaveState.textContent = "当前使用内置默认骰子配置。";
  }
  nodes.dicePackEditorChangedCount.textContent = changedCount
    ? `骰子草稿 · 已修改 ${changedCount} 个骰面`
    : "骰子草稿 · 尚未修改";
  if (announce) nodes.dicePackEditorStatus.textContent = announce;
}

function renderDicePackEditor() {
  renderDicePackEditorFaces();
  syncDicePackEditorControls();
}

function updateDicePackEditorFace(faceIndex, update) {
  if (
    !dicePackEditor.draft
    || dicePackEditor.saving
    || !dicePackEditor.storageAvailable
  ) return;
  try {
    dicePackEditor.draft = updateDicePackFace(
      dicePackEditor.draft,
      dicePackEditor.selectedFamilyId,
      faceIndex,
      update,
    );
    dicePackEditor.publishError = "";
    persistDicePackEditorDraft();
    renderDicePackEditor();
  } catch (error) {
    dicePackEditor.publishError = error?.message || "骰面配置无效";
    syncDicePackEditorControls({ announce: dicePackEditor.publishError });
  }
}

async function publishDicePackEditorDraft() {
  const response = await fetch("/api/admin/dice-packs/v1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expectedUserId: layoutEditorOwnerUserId,
      expectedRevision: dicePackEditor.publishedRevision,
      pack: normalizeDicePack(dicePackEditor.draft),
    }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.message || "dice pack publish failed");
    error.code = payload?.error || `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  if (payload?.schemaVersion !== DICE_PACK_REGISTRY_SCHEMA_VERSION) {
    throw new Error("dice pack publish returned an incompatible schema");
  }
  const publication = normalizeDicePackPublication(payload.dicePack);
  if (!publication || publication.status !== "active") {
    throw new Error("dice pack publish did not return an active pack");
  }
  publishedDicePackPublication = publication;
  dicePackRegistryLoaded = true;
  return publication;
}

async function saveDicePackEditorDraft() {
  if (!dicePackEditor.draft || dicePackEditor.saving) return;
  if (!persistDicePackEditorDraft()) {
    syncDicePackEditorControls({ announce: "骰子草稿保存失败，请稍后重试" });
    return;
  }
  dicePackEditor.saving = true;
  dicePackEditor.publishError = "";
  syncDicePackEditorControls();
  try {
    let publication;
    if (layoutEditorOwnerUserId) {
      publication = await publishDicePackEditorDraft();
    } else if (qaControlsEnabled && QA_PAGE_REQUESTED) {
      localStorage.setItem(
        LOCAL_DICE_PACK_APPLIED_KEY,
        JSON.stringify(normalizeDicePack(dicePackEditor.draft)),
      );
      publication = {
        status: "qa-local",
        revision: null,
        updatedAt: null,
        pack: cloneDicePack(dicePackEditor.draft),
      };
    } else {
      throw new Error("只有项目所有者可以发布骰子配置");
    }
    dicePackEditor.publishedPack = cloneDicePack(publication.pack);
    dicePackEditor.publishedRevision = publication.revision;
    dicePackEditor.publicationSource = publication.status;
    bindEditorDraftSource(
      dicePackEditor,
      publication.revision,
      publication.pack,
    );
    dicePackEditor.draftNotice = "";
    persistDicePackEditorDraft();
    dicePackEditor.lastSavedAt = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    syncDicePackEditorControls({ announce: "骰子配置已发布，只影响之后新开的棋局" });
  } catch (error) {
    dicePackEditor.publishError = error?.status === 409
      ? "骰子配置已在其他页面更新，请刷新后重试；当前草稿仍保留。"
      : error?.message || "骰子配置发布失败，请重试。";
    syncDicePackEditorControls({ announce: dicePackEditor.publishError });
  } finally {
    dicePackEditor.saving = false;
    syncDicePackEditorControls();
  }
}

function resetDicePackEditorFamily() {
  if (
    !dicePackEditor.draft
    || dicePackEditor.saving
    || !dicePackEditor.storageAvailable
  ) return;
  const familyId = dicePackEditor.selectedFamilyId;
  dicePackEditor.draft = cloneDicePack({
    ...dicePackEditor.draft,
    families: {
      ...dicePackEditor.draft.families,
      [familyId]: structuredClone(DEFAULT_DICE_PACK.families[familyId]),
    },
  });
  dicePackEditor.publishError = "";
  persistDicePackEditorDraft();
  renderDicePackEditor();
  nodes.dicePackEditorStatus.textContent = `${DICE_FAMILY_META[familyId].label}已恢复默认骰面`;
}

function resetAllDicePackEditorFamilies() {
  if (dicePackEditor.saving || !dicePackEditor.storageAvailable) return;
  dicePackEditor.draft = cloneDicePack(DEFAULT_DICE_PACK);
  dicePackEditor.publishError = "";
  persistDicePackEditorDraft();
  renderDicePackEditor();
  nodes.dicePackEditorStatus.textContent = "六颗骰子已恢复默认骰面，尚未发布";
}

function loadNodeRewardEditorDraft() {
  const publication = effectivePublishedNodeRewardPackPublication();
  nodeRewardEditor.publishedPack = cloneNodeRewardPack(publication.pack);
  nodeRewardEditor.publishedRevision = publication.revision;
  nodeRewardEditor.publicationSource = publication.status;
  applyLoadedAuthoringDraft(nodeRewardEditor, loadLocalAuthoringDraft({
    storageKey: LOCAL_NODE_REWARD_PACK_DRAFT_KEY,
    normalizeDraft: normalizeNodeRewardPack,
    sourceRevision: publication.revision,
    sourceValue: publication.pack,
    cloneDraft: cloneNodeRewardPack,
    label: "节点奖励配置",
  }));
  nodeRewardEditor.worldRef = NODE_REWARD_WORLD_REFS.includes(layoutEditor.worldRef)
    ? layoutEditor.worldRef
    : CLOUD_HARBOR_WORLD_REF;
  const catalogWorld = NODE_REWARD_CATALOG[nodeRewardEditor.worldRef];
  nodeRewardEditor.selectedNodeId = catalogWorld.nodeById[layoutEditor.selectedNodeId]
    ? layoutEditor.selectedNodeId
    : catalogWorld.nodes[0]?.nodeId || null;
  nodeRewardEditor.publishError = "";
  nodeRewardEditor.saving = false;
  nodeRewardEditor.lastSavedAt = "";
}

function persistNodeRewardEditorDraft() {
  return persistLocalAuthoringDraft({
    editor: nodeRewardEditor,
    storageKey: LOCAL_NODE_REWARD_PACK_DRAFT_KEY,
    normalizeDraft: normalizeNodeRewardPack,
    sourceRevision: nodeRewardEditor.publishedRevision,
    sourceValue: nodeRewardEditor.publishedPack,
  });
}

function nodeRewardTypeLabel(type) {
  return {
    none: "无资源奖励",
    coin: "金币",
    star: "星星",
  }[type] || type;
}

function nodeRewardWorldLabel(worldRef) {
  const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  return `${composition.worldPack.title} · ${isCloudHarborWorldRef(worldRef) ? "世界 1" : "世界 2"}`;
}

function selectedNodeRewardCatalogEntry() {
  return nodeRewardCatalogEntry(
    nodeRewardEditor.worldRef,
    nodeRewardEditor.selectedNodeId,
  );
}

function renderNodeRewardEditorOptions() {
  if (!nodeRewardEditor.draft || !nodes.nodeRewardEditorWorld) return;
  nodes.nodeRewardEditorWorld.replaceChildren(...NODE_REWARD_WORLD_REFS.map((worldRef) => (
    new Option(nodeRewardWorldLabel(worldRef), worldRef)
  )));
  nodes.nodeRewardEditorWorld.value = nodeRewardEditor.worldRef;
  const catalogWorld = NODE_REWARD_CATALOG[nodeRewardEditor.worldRef];
  nodes.nodeRewardEditorNode.replaceChildren(...catalogWorld.nodes.map((entry) => {
    const composition = resolveWorldComposition(entry.worldRef, WORLD_REGISTRIES);
    const boardNode = composition.board.nodes.find(({ id }) => id === entry.nodeId);
    const lockMark = entry.editable ? "" : " · 固定";
    return new Option(
      `${entry.nodeId} · ${layoutEditorNodeLabel(boardNode)}${lockMark}`,
      entry.nodeId,
    );
  }));
  nodes.nodeRewardEditorNode.value = nodeRewardEditor.selectedNodeId;
}

function syncNodeRewardEditorControls({ announce = "" } = {}) {
  if (!nodeRewardEditor.draft || !nodes.nodeRewardEditorSaveBar) return;
  const entry = selectedNodeRewardCatalogEntry();
  if (!entry) return;
  const policy = nodeRewardPolicy(
    nodeRewardEditor.draft,
    entry.worldRef,
    entry.nodeId,
  );
  const composition = resolveWorldComposition(entry.worldRef, WORLD_REGISTRIES);
  const boardNode = composition.board.nodes.find(({ id }) => id === entry.nodeId);
  const zone = composition.board.zones.find(({ id }) => id === entry.zoneId);
  const outcome = nodeOutcomeForComposition(composition, entry.nodeId);
  const changedCount = nodeRewardChangedCount(nodeRewardEditor.draft);
  const draftMatchesPublished = nodeRewardPacksEqual(
    nodeRewardEditor.draft,
    nodeRewardEditor.publishedPack,
  );
  const publishRequired = Boolean(
    layoutEditorOwnerUserId
    && nodeRewardEditor.publicationSource !== "active"
    && !nodeRewardPacksEqual(nodeRewardEditor.draft, DEFAULT_NODE_REWARD_PACK)
  );
  const saveState = nodeRewardEditor.saving
    ? "saving"
    : !nodeRewardEditor.storageAvailable || nodeRewardEditor.publishError
      ? "error"
      : !draftMatchesPublished || publishRequired
        ? "dirty"
        : "saved";

  nodes.nodeRewardEditorWorld.value = entry.worldRef;
  nodes.nodeRewardEditorNode.value = entry.nodeId;
  nodes.nodeRewardEditorNodeName.textContent = (
    `${entry.nodeId} · ${layoutEditorNodeLabel(boardNode)}`
  );
  nodes.nodeRewardEditorNodeMeta.textContent = (
    `${composition.theme.zoneNames?.[zone?.id] || zone?.label || entry.zoneId || "未分区"}`
    + ` · ${entry.editable ? "资源奖励可编辑" : "规则节点只读"}`
  );
  nodes.nodeRewardEditorFixedEffect.textContent = entry.editable
    ? `节点效果：${outcome?.badgeLabel || "落点奖励"} · ${outcome?.shortLabel || "按默认规则结算"}`
    : `固定效果：${outcome?.badgeLabel || "规则节点"} · ${outcome?.shortLabel || "按地图规则触发"}`;
  nodes.nodeRewardEditorFixedDetail.textContent = entry.editable
    ? outcome?.detail || "只在棋子最终停在这里时结算资源。"
    : entry.lockReason;
  nodes.nodeRewardEditorBaseReward.textContent = (
    `默认资源：${nodeRewardLabel(entry.baseReward)}`
  );
  nodes.nodeRewardEditorReward.replaceChildren(...NODE_REWARD_TYPES.map((type) => (
    new Option(nodeRewardTypeLabel(type), type, false, type === policy.type)
  )));
  nodes.nodeRewardEditorReward.value = policy.type;
  nodes.nodeRewardEditorReward.disabled = (
    !entry.editable
    || nodeRewardEditor.saving
    || !nodeRewardEditor.storageAvailable
  );
  const limits = NODE_REWARD_LIMITS[policy.type];
  nodes.nodeRewardEditorAmount.min = String(limits.min);
  nodes.nodeRewardEditorAmount.max = String(limits.max);
  nodes.nodeRewardEditorAmount.value = String(policy.amount);
  nodes.nodeRewardEditorAmount.disabled = (
    !entry.editable
    || nodeRewardEditor.saving
    || !nodeRewardEditor.storageAvailable
    || policy.type === "none"
    || policy.type === "star"
  );
  nodes.nodeRewardEditorEffective.textContent = entry.editable
    ? `当前结算：${nodeRewardLabel(policy, entry.baseReward)}`
    : "当前结算：固定节点机制（不可在这里替换）";
  nodes.nodeRewardEditorResetNode.disabled = (
    nodeRewardEditor.saving
    || !nodeRewardEditor.storageAvailable
    || JSON.stringify(policy) === JSON.stringify(
      DEFAULT_NODE_REWARD_PACK.worlds[entry.worldRef].nodes[entry.nodeId],
    )
  );
  nodes.nodeRewardEditorResetWorld.disabled = (
    nodeRewardEditor.saving
    || !nodeRewardEditor.storageAvailable
    || !(
    NODE_REWARD_CATALOG[entry.worldRef].nodes.some(({ nodeId }) => (
      JSON.stringify(nodeRewardEditor.draft.worlds[entry.worldRef].nodes[nodeId])
      !== JSON.stringify(DEFAULT_NODE_REWARD_PACK.worlds[entry.worldRef].nodes[nodeId])
    ))
  ));
  nodes.nodeRewardEditorResetAll.disabled = (
    nodeRewardEditor.saving
    || !nodeRewardEditor.storageAvailable
    || changedCount === 0
  );
  nodes.nodeRewardEditorSaveBar.dataset.saveState = saveState;
  nodes.nodeRewardEditorSaveBar.setAttribute("aria-busy", String(nodeRewardEditor.saving));
  nodes.nodeRewardEditorSave.disabled = (
    nodeRewardEditor.saving || !nodeRewardEditor.storageAvailable
  );
  nodes.layoutEditorClose.disabled = (
    layoutEditor.saving || dicePackEditor.saving || nodeRewardEditor.saving
  );
  if (saveState === "saving") {
    nodes.nodeRewardEditorSaveState.textContent = "正在校验并发布节点奖励配置…";
  } else if (saveState === "error") {
    nodes.nodeRewardEditorSaveState.textContent = nodeRewardEditor.publishError
      || nodeRewardEditor.draftNotice
      || "保存失败，当前节点奖励草稿尚未发布。";
  } else if (nodeRewardEditor.draftNotice) {
    nodes.nodeRewardEditorSaveState.textContent = nodeRewardEditor.draftNotice;
  } else if (saveState === "dirty") {
    nodes.nodeRewardEditorSaveState.textContent = "有未发布的节点奖励调整；普通游戏仍使用已发布版本。";
  } else if (nodeRewardEditor.lastSavedAt) {
    nodes.nodeRewardEditorSaveState.textContent = (
      `已于 ${nodeRewardEditor.lastSavedAt} 发布；只影响之后新开的棋局。`
    );
  } else if (nodeRewardEditor.publicationSource === "active") {
    nodes.nodeRewardEditorSaveState.textContent = "已载入当前正式使用的节点奖励配置。";
  } else if (nodeRewardEditor.publicationSource === "qa-local") {
    nodes.nodeRewardEditorSaveState.textContent = "已载入当前测试浏览器使用的节点奖励配置。";
  } else {
    nodes.nodeRewardEditorSaveState.textContent = "当前使用内置默认节点奖励配置。";
  }
  nodes.nodeRewardEditorChangedCount.textContent = changedCount
    ? `节点奖励草稿 · 已修改 ${changedCount} 个节点`
    : "节点奖励草稿 · 尚未修改";
  if (announce) nodes.nodeRewardEditorStatus.textContent = announce;
}

function renderNodeRewardEditor() {
  renderNodeRewardEditorOptions();
  syncNodeRewardEditorControls();
}

function selectNodeRewardEditorNode(nodeId, { focusMap = true } = {}) {
  const entry = nodeRewardCatalogEntry(nodeRewardEditor.worldRef, nodeId);
  if (!entry) return;
  nodeRewardEditor.selectedNodeId = nodeId;
  if (focusMap && layoutEditor.worldRef === nodeRewardEditor.worldRef) {
    selectLayoutEditorNode(nodeId, { focus: true, renderScene: true });
  }
  syncNodeRewardEditorControls();
}

function switchNodeRewardEditorWorld(worldRef) {
  if (!NODE_REWARD_WORLD_REFS.includes(worldRef)) return;
  nodeRewardEditor.worldRef = worldRef;
  switchLayoutEditorWorld(worldRef);
  nodeRewardEditor.selectedNodeId = NODE_REWARD_CATALOG[worldRef].nodes[0]?.nodeId || null;
  renderNodeRewardEditor();
}

function updateNodeRewardEditorPolicy(update) {
  const entry = selectedNodeRewardCatalogEntry();
  if (
    !entry?.editable
    || !nodeRewardEditor.draft
    || nodeRewardEditor.saving
    || !nodeRewardEditor.storageAvailable
  ) return;
  try {
    nodeRewardEditor.draft = updateNodeRewardPolicy(
      nodeRewardEditor.draft,
      entry.worldRef,
      entry.nodeId,
      update,
    );
    nodeRewardEditor.publishError = "";
    persistNodeRewardEditorDraft();
    regionArtSceneCache = null;
    renderBoard();
    syncNodeRewardEditorControls();
  } catch (error) {
    nodeRewardEditor.publishError = error?.message || "节点奖励配置无效";
    syncNodeRewardEditorControls({ announce: nodeRewardEditor.publishError });
  }
}

async function publishNodeRewardEditorDraft() {
  const response = await fetch("/api/admin/node-reward-packs/v1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expectedUserId: layoutEditorOwnerUserId,
      expectedRevision: nodeRewardEditor.publishedRevision,
      pack: retargetNodeRewardPack(
        nodeRewardEditor.draft,
        publishedNodeRewardPackPublication.sourceWorldRef || CLOUD_HARBOR_WORLD_REF,
      ),
    }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.message || "node reward pack publish failed");
    error.code = payload?.error || `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  if (payload?.schemaVersion !== NODE_REWARD_PACK_REGISTRY_SCHEMA_VERSION) {
    throw new Error("node reward pack publish returned an incompatible schema");
  }
  const publication = normalizeNodeRewardPackPublication(payload.nodeRewardPack);
  if (!publication || publication.status !== "active") {
    throw new Error("node reward pack publish did not return an active pack");
  }
  publishedNodeRewardPackPublication = publication;
  nodeRewardPackRegistryLoaded = true;
  return publication;
}

async function saveNodeRewardEditorDraft() {
  if (!nodeRewardEditor.draft || nodeRewardEditor.saving) return;
  if (!persistNodeRewardEditorDraft()) {
    syncNodeRewardEditorControls({ announce: "节点奖励草稿保存失败，请稍后重试" });
    return;
  }
  nodeRewardEditor.saving = true;
  nodeRewardEditor.publishError = "";
  syncNodeRewardEditorControls();
  try {
    let publication;
    if (layoutEditorOwnerUserId) {
      publication = await publishNodeRewardEditorDraft();
    } else if (qaControlsEnabled && QA_PAGE_REQUESTED) {
      localStorage.setItem(
        LOCAL_NODE_REWARD_PACK_APPLIED_KEY,
        JSON.stringify(normalizeNodeRewardPack(nodeRewardEditor.draft)),
      );
      publication = {
        status: "qa-local",
        revision: null,
        updatedAt: null,
        pack: cloneNodeRewardPack(nodeRewardEditor.draft),
      };
      publishedNodeRewardPackPublication = publication;
    } else {
      throw new Error("只有项目所有者可以发布节点奖励配置");
    }
    nodeRewardEditor.publishedPack = cloneNodeRewardPack(publication.pack);
    nodeRewardEditor.publishedRevision = publication.revision;
    nodeRewardEditor.publicationSource = publication.status;
    bindEditorDraftSource(
      nodeRewardEditor,
      publication.revision,
      publication.pack,
    );
    nodeRewardEditor.draftNotice = "";
    persistNodeRewardEditorDraft();
    nodeRewardEditor.lastSavedAt = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    syncNodeRewardEditorControls({ announce: "节点奖励配置已发布，只影响之后新开的棋局" });
  } catch (error) {
    nodeRewardEditor.publishError = error?.status === 409
      ? "节点奖励已在其他页面更新，请刷新后重试；当前草稿仍保留。"
      : error?.message || "节点奖励配置发布失败，请重试。";
    syncNodeRewardEditorControls({ announce: nodeRewardEditor.publishError });
  } finally {
    nodeRewardEditor.saving = false;
    syncNodeRewardEditorControls();
  }
}

function resetSelectedNodeReward() {
  const entry = selectedNodeRewardCatalogEntry();
  if (!entry?.editable) return;
  updateNodeRewardEditorPolicy(
    DEFAULT_NODE_REWARD_PACK.worlds[entry.worldRef].nodes[entry.nodeId],
  );
  nodes.nodeRewardEditorStatus.textContent = "当前节点已恢复默认奖励，尚未发布";
}

function resetNodeRewardWorld() {
  if (
    !nodeRewardEditor.draft
    || nodeRewardEditor.saving
    || !nodeRewardEditor.storageAvailable
  ) return;
  const worldRef = nodeRewardEditor.worldRef;
  const next = cloneNodeRewardPack(nodeRewardEditor.draft);
  NODE_REWARD_CATALOG[worldRef].nodes.forEach(({ nodeId }) => {
    next.worlds[worldRef].nodes[nodeId] = structuredClone(
      DEFAULT_NODE_REWARD_PACK.worlds[worldRef].nodes[nodeId],
    );
  });
  nodeRewardEditor.draft = normalizeNodeRewardPack(next);
  nodeRewardEditor.publishError = "";
  persistNodeRewardEditorDraft();
  regionArtSceneCache = null;
  renderBoard();
  syncNodeRewardEditorControls({ announce: `${nodeRewardWorldLabel(worldRef)}已恢复默认奖励` });
}

function resetAllNodeRewards() {
  if (nodeRewardEditor.saving || !nodeRewardEditor.storageAvailable) return;
  nodeRewardEditor.draft = cloneNodeRewardPack(DEFAULT_NODE_REWARD_PACK);
  nodeRewardEditor.publishError = "";
  persistNodeRewardEditorDraft();
  regionArtSceneCache = null;
  renderBoard();
  syncNodeRewardEditorControls({ announce: "两个世界的节点奖励已恢复默认值，尚未发布" });
}

function loadClassroomEventEditorDraft() {
  const publication = effectivePublishedClassroomEventProgramPublication();
  classroomEventEditor.publishedProgram = cloneClassroomEventProgram(
    publication.program,
  );
  classroomEventEditor.publishedRevision = publication.revision;
  classroomEventEditor.publicationSource = publication.status;
  applyLoadedAuthoringDraft(classroomEventEditor, loadLocalAuthoringDraft({
    storageKey: LOCAL_CLASSROOM_EVENT_PROGRAM_DRAFT_KEY,
    normalizeDraft: normalizeClassroomEventProgram,
    sourceRevision: publication.revision,
    sourceValue: publication.program,
    cloneDraft: cloneClassroomEventProgram,
    label: "节点事件配置",
  }));
  const setupPack = Object.values(LEARNING_PACKS).find(
    ({ id }) => id === nodes.setupLearning?.value,
  ) || learningPack;
  const preferredLearningRef = learningPackRefFor(setupPack);
  classroomEventEditor.learningRef = CLASSROOM_EVENT_PROGRAM_LEARNING_REFS.includes(
    preferredLearningRef,
  ) ? preferredLearningRef : CLASSROOM_EVENT_PROGRAM_LEARNING_REFS[0];
  classroomEventEditor.worldRef = CLASSROOM_EVENT_PROGRAM_WORLD_REFS.includes(
    layoutEditor.worldRef,
  ) ? layoutEditor.worldRef : CLOUD_HARBOR_WORLD_REF;
  const world = CLASSROOM_EVENT_PROGRAM_CATALOG[
    classroomEventEditor.learningRef
  ]?.worlds?.[classroomEventEditor.worldRef];
  classroomEventEditor.selectedNodeId = world?.nodeById?.[layoutEditor.selectedNodeId]
    ? layoutEditor.selectedNodeId
    : world?.nodes?.[0]?.nodeId || null;
  classroomEventEditor.publishError = "";
  classroomEventEditor.saving = false;
  classroomEventEditor.lastSavedAt = "";
}

function persistClassroomEventEditorDraft() {
  return persistLocalAuthoringDraft({
    editor: classroomEventEditor,
    storageKey: LOCAL_CLASSROOM_EVENT_PROGRAM_DRAFT_KEY,
    normalizeDraft: normalizeClassroomEventProgram,
    sourceRevision: classroomEventEditor.publishedRevision,
    sourceValue: classroomEventEditor.publishedProgram,
  });
}

function classroomEventLearningCatalog() {
  return CLASSROOM_EVENT_PROGRAM_CATALOG[classroomEventEditor.learningRef] || null;
}

function selectedClassroomEventCatalogNode() {
  return classroomEventLearningCatalog()
    ?.worlds?.[classroomEventEditor.worldRef]
    ?.nodeById?.[classroomEventEditor.selectedNodeId] || null;
}

function classroomEventSourceTask(eventDefinition) {
  const sourceTaskRef = String(eventDefinition?.sourceTaskRef || "");
  const taskId = sourceTaskRef.split("#").at(-1) || "";
  const catalog = classroomEventLearningCatalog();
  const pack = Object.values(LEARNING_PACKS).find((candidate) => (
    candidate.id === catalog?.learningPackId
    && candidate.version === catalog?.learningPackVersion
  ));
  return pack?.tasks?.find((task) => task.id === taskId) || null;
}

function classroomEventTriggerLabel(trigger) {
  return {
    none: "不触发",
    "final-landing": "棋子完成全部移动并最终停在本格",
    "route-pass": "实际提交路线经过本格",
    "route-arrival": "带剩余骰点到达本路口",
    "fairy-route-pass": "精灵位于本格且实际路线经过",
    "after-enter": "进入本格后立即向前穿越",
    "next-edge-pass": "从本格继续跨出下一条边",
  }[trigger] || trigger || "按固定地图规则触发";
}

function renderClassroomEventEditorOptions() {
  if (!classroomEventEditor.draft || !nodes.classroomEventEditorLearning) return;
  nodes.classroomEventEditorLearning.replaceChildren(
    ...CLASSROOM_EVENT_PROGRAM_LEARNING_REFS.map((learningRef) => {
      const catalog = CLASSROOM_EVENT_PROGRAM_CATALOG[learningRef];
      return new Option(
        `${catalog.title} · ${catalog.learningPackVersion}`,
        learningRef,
      );
    }),
  );
  nodes.classroomEventEditorLearning.value = classroomEventEditor.learningRef;
  nodes.classroomEventEditorWorld.replaceChildren(
    ...CLASSROOM_EVENT_PROGRAM_WORLD_REFS.map((worldRef) => (
      new Option(nodeRewardWorldLabel(worldRef), worldRef)
    )),
  );
  nodes.classroomEventEditorWorld.value = classroomEventEditor.worldRef;
  const world = classroomEventLearningCatalog()?.worlds?.[classroomEventEditor.worldRef];
  const composition = resolveWorldComposition(
    classroomEventEditor.worldRef,
    WORLD_REGISTRIES,
  );
  nodes.classroomEventEditorNode.replaceChildren(...(world?.nodes || []).map((entry) => {
    const boardNode = composition.board.nodes.find(({ id }) => id === entry.nodeId);
    return new Option(
      `${entry.nodeId} · ${layoutEditorNodeLabel(boardNode)}${entry.editable ? "" : " · 真实落点转移"}`,
      entry.nodeId,
    );
  }));
  nodes.classroomEventEditorNode.value = classroomEventEditor.selectedNodeId;
}

function syncClassroomEventEditorControls({ announce = "" } = {}) {
  if (!classroomEventEditor.draft || !nodes.classroomEventEditorSaveBar) return;
  const catalogNode = selectedClassroomEventCatalogNode();
  if (!catalogNode) return;
  const assignment = classroomEventAssignment(
    classroomEventEditor.draft,
    classroomEventEditor.learningRef,
    classroomEventEditor.worldRef,
    classroomEventEditor.selectedNodeId,
  );
  const composition = resolveWorldComposition(
    classroomEventEditor.worldRef,
    WORLD_REGISTRIES,
  );
  const boardNode = composition.board.nodes.find(
    ({ id }) => id === classroomEventEditor.selectedNodeId,
  );
  const rewardRef = composition.level.nodeBindings?.[boardNode.id]?.rewardRef
    || boardNode.landingProfileRef
    || "";
  const outcome = nodeOutcomeForComposition(composition, boardNode.id);
  const eventEntries = Object.entries(
    classroomEventEditor.draft.learningPacks[
      classroomEventEditor.learningRef
    ].events,
  );
  const inheritLabel = boardNode.spaceRole === "activity"
    ? "沿用默认 · 跟随本轮刚完成的题目活动"
    : "沿用默认 · 不追加题目事件";
  nodes.classroomEventEditorEvent.replaceChildren(
    new Option(inheritLabel, "inherit"),
    new Option("不触发题目事件", "none"),
    ...eventEntries.map(([eventRef, eventDefinition]) => {
      const taskId = eventDefinition.sourceTaskRef.split("#").at(-1);
      const target = eventDefinition.content.target || eventDefinition.content.title;
      return new Option(`${taskId} · ${target}`, eventRef);
    }),
  );
  nodes.classroomEventEditorEvent.value = assignment.mode === "event"
    ? assignment.eventRef
    : assignment.mode;
  nodes.classroomEventEditorEvent.disabled = (
    !catalogNode.editable || classroomEventEditor.saving
  );

  nodes.classroomEventEditorTriggerWhen.textContent = classroomEventTriggerLabel(
    outcome.trigger,
  );
  nodes.classroomEventEditorTriggerEffect.textContent = (
    `${outcome.badgeLabel} · ${outcome.shortLabel}。${outcome.detail}`
  );
  const fixedSourceRef = boardNode.mapEffectRef
    || boardNode.transportProfileRef
    || rewardRef
    || boardNode.spaceRole;
  nodes.classroomEventEditorTriggerSource.textContent = (
    `${composition.worldPack.boardTemplateRef} / ${composition.worldPack.levelPackRef}`
    + ` · ${fixedSourceRef}`
    + (catalogNode.editable ? " · 题目事件只会在其后追加" : ` · ${catalogNode.lockReason}`)
  );

  const selectedEvent = assignment.mode === "event"
    ? classroomEvent(
        classroomEventEditor.draft,
        classroomEventEditor.learningRef,
        assignment.eventRef,
      )
    : null;
  const sourceTask = classroomEventSourceTask(selectedEvent);
  if (selectedEvent) {
    const sourcePrompt = sourceTask?.content?.promptText
      || sourceTask?.content?.responseScaffold
      || selectedEvent.sourceTaskRef;
    nodes.classroomEventEditorSourceQuestion.textContent = (
      `来源题目：${sourcePrompt} · ${selectedEvent.sourceTaskRef}`
    );
    nodes.classroomEventEditorTitle.textContent = selectedEvent.content.title;
    nodes.classroomEventEditorInstruction.textContent = selectedEvent.content.instruction;
    nodes.classroomEventEditorChallenge.textContent = (
      selectedEvent.content.challenge || "本事件没有额外错误句，直接完成活动步骤。"
    );
    nodes.classroomEventEditorTarget.textContent = selectedEvent.content.target;
  } else {
    const followsCurrentTask = assignment.mode === "inherit"
      && boardNode.spaceRole === "activity";
    nodes.classroomEventEditorSourceQuestion.textContent = followsCurrentTask
      ? "来源题目：运行时跟随本轮刚完成并已真实评分的题目"
      : "当前节点没有指定题目事件";
    nodes.classroomEventEditorTitle.textContent = assignment.mode === "none"
      ? "已明确关闭题目事件"
      : followsCurrentTask ? "沿用当前题目的默认课堂活动" : "不追加课堂活动";
    nodes.classroomEventEditorInstruction.textContent = followsCurrentTask
      ? "只有节点固定 Trigger 与奖励全部结算完毕后，才会打开该题的活动卡。"
      : "棋子完成移动后直接进入回合总结。";
    nodes.classroomEventEditorChallenge.textContent = "—";
    nodes.classroomEventEditorTarget.textContent = "—";
  }

  const changedCount = classroomEventChangedCount(classroomEventEditor.draft);
  const matchesPublished = classroomEventProgramsEqual(
    classroomEventEditor.draft,
    classroomEventEditor.publishedProgram,
  );
  const publishRequired = Boolean(
    layoutEditorOwnerUserId
    && classroomEventEditor.publicationSource !== "active"
    && !classroomEventProgramsEqual(
      classroomEventEditor.draft,
      DEFAULT_CLASSROOM_EVENT_PROGRAM,
    )
  );
  const saveState = classroomEventEditor.saving
    ? "saving"
    : !classroomEventEditor.storageAvailable || classroomEventEditor.publishError
      ? "error"
      : !matchesPublished || publishRequired
        ? "dirty"
        : "saved";
  const worldAssignments = classroomEventEditor.draft.learningPacks[
    classroomEventEditor.learningRef
  ].worlds[classroomEventEditor.worldRef].assignments;
  const worldChanged = Object.values(worldAssignments).some(({ mode }) => mode !== "inherit");
  nodes.classroomEventEditorResetNode.disabled = (
    classroomEventEditor.saving
    || !classroomEventEditor.storageAvailable
    || assignment.mode === "inherit"
    || !catalogNode.editable
  );
  nodes.classroomEventEditorResetWorld.disabled = (
    classroomEventEditor.saving
    || !classroomEventEditor.storageAvailable
    || !worldChanged
  );
  nodes.classroomEventEditorResetAll.disabled = (
    classroomEventEditor.saving
    || !classroomEventEditor.storageAvailable
    || changedCount === 0
  );
  nodes.classroomEventEditorSave.disabled = true;
  nodes.classroomEventEditorSaveBar.dataset.saveState = saveState;
  nodes.classroomEventEditorSaveBar.setAttribute(
    "aria-busy",
    String(classroomEventEditor.saving),
  );
  nodes.layoutEditorClose.disabled = (
    layoutEditor.saving
    || dicePackEditor.saving
    || nodeRewardEditor.saving
    || classroomEventEditor.saving
  );
  if (saveState === "saving") {
    nodes.classroomEventEditorSaveState.textContent = "正在校验并发布节点事件配置…";
  } else if (saveState === "error") {
    nodes.classroomEventEditorSaveState.textContent = classroomEventEditor.publishError
      || classroomEventEditor.draftNotice
      || "发布失败，当前事件草稿仍保留。";
  } else if (classroomEventEditor.draftNotice) {
    nodes.classroomEventEditorSaveState.textContent = classroomEventEditor.draftNotice;
  } else if (saveState === "dirty") {
    nodes.classroomEventEditorSaveState.textContent = "有未发布的节点事件调整；普通游戏仍使用已发布版本。";
  } else if (classroomEventEditor.lastSavedAt) {
    nodes.classroomEventEditorSaveState.textContent = (
      `已于 ${classroomEventEditor.lastSavedAt} 发布；只影响之后新开的棋局。`
    );
  } else if (classroomEventEditor.publicationSource === "active") {
    nodes.classroomEventEditorSaveState.textContent = "已载入当前正式节点事件配置。";
  } else if (classroomEventEditor.publicationSource === "qa-local") {
    nodes.classroomEventEditorSaveState.textContent = "已载入当前测试浏览器的节点事件配置。";
  } else {
    nodes.classroomEventEditorSaveState.textContent = "当前使用内置默认节点事件配置。";
  }
  nodes.classroomEventEditorChangedCount.textContent = changedCount
    ? `节点事件草稿 · 已修改 ${changedCount} 项绑定`
    : "节点事件草稿 · 尚未修改";
  if (announce) nodes.classroomEventEditorStatus.textContent = announce;
}

function renderClassroomEventEditor() {
  renderClassroomEventEditorOptions();
  syncClassroomEventEditorControls();
}

function selectClassroomEventEditorNode(nodeId, { focusMap = true } = {}) {
  const world = classroomEventLearningCatalog()?.worlds?.[classroomEventEditor.worldRef];
  if (!world?.nodeById?.[nodeId]) return;
  classroomEventEditor.selectedNodeId = nodeId;
  if (focusMap && layoutEditor.worldRef === classroomEventEditor.worldRef) {
    selectLayoutEditorNode(nodeId, { focus: true, renderScene: true });
  }
  syncClassroomEventEditorControls();
}

function switchClassroomEventEditorLearning(learningRef) {
  if (!CLASSROOM_EVENT_PROGRAM_LEARNING_REFS.includes(learningRef)) return;
  classroomEventEditor.learningRef = learningRef;
  const world = classroomEventLearningCatalog()?.worlds?.[classroomEventEditor.worldRef];
  if (!world?.nodeById?.[classroomEventEditor.selectedNodeId]) {
    classroomEventEditor.selectedNodeId = world?.nodes?.[0]?.nodeId || null;
  }
  renderClassroomEventEditor();
}

function switchClassroomEventEditorWorld(worldRef) {
  if (!CLASSROOM_EVENT_PROGRAM_WORLD_REFS.includes(worldRef)) return;
  classroomEventEditor.worldRef = worldRef;
  switchLayoutEditorWorld(worldRef);
  const world = classroomEventLearningCatalog()?.worlds?.[worldRef];
  classroomEventEditor.selectedNodeId = world?.nodes?.[0]?.nodeId || null;
  renderClassroomEventEditor();
}

function updateClassroomEventEditorAssignment(update) {
  const catalogNode = selectedClassroomEventCatalogNode();
  if (
    !catalogNode?.editable
    || !classroomEventEditor.draft
    || classroomEventEditor.saving
    || !classroomEventEditor.storageAvailable
  ) {
    return;
  }
  try {
    classroomEventEditor.draft = updateClassroomEventAssignment(
      classroomEventEditor.draft,
      classroomEventEditor.learningRef,
      classroomEventEditor.worldRef,
      classroomEventEditor.selectedNodeId,
      update,
    );
    classroomEventEditor.publishError = "";
    persistClassroomEventEditorDraft();
    renderClassroomEventEditor();
  } catch (error) {
    classroomEventEditor.publishError = error?.message || "节点事件配置无效";
    syncClassroomEventEditorControls({ announce: classroomEventEditor.publishError });
  }
}

function resetSelectedClassroomEvent() {
  updateClassroomEventEditorAssignment({ mode: "inherit", eventRef: "" });
  nodes.classroomEventEditorStatus.textContent = "当前节点已恢复默认事件，尚未发布";
}

function resetClassroomEventWorld() {
  if (
    !classroomEventEditor.draft
    || classroomEventEditor.saving
    || !classroomEventEditor.storageAvailable
  ) return;
  const next = cloneClassroomEventProgram(classroomEventEditor.draft);
  const assignments = next.learningPacks[classroomEventEditor.learningRef]
    .worlds[classroomEventEditor.worldRef].assignments;
  Object.keys(assignments).forEach((nodeId) => {
    assignments[nodeId] = { mode: "inherit", eventRef: "" };
  });
  classroomEventEditor.draft = normalizeClassroomEventProgram(next);
  classroomEventEditor.publishError = "";
  persistClassroomEventEditorDraft();
  renderClassroomEventEditor();
  nodes.classroomEventEditorStatus.textContent = "当前题目包与世界的节点事件已恢复默认";
}

function resetAllClassroomEvents() {
  if (classroomEventEditor.saving || !classroomEventEditor.storageAvailable) return;
  classroomEventEditor.draft = cloneClassroomEventProgram(
    DEFAULT_CLASSROOM_EVENT_PROGRAM,
  );
  classroomEventEditor.publishError = "";
  persistClassroomEventEditorDraft();
  renderClassroomEventEditor();
  nodes.classroomEventEditorStatus.textContent = "全部节点事件已恢复默认，尚未发布";
}

function setLayoutEditorTab(tab) {
  const pane = ["nodes", "dice", "codex"].includes(tab)
    ? tab
    : "nodes";
  const showNodes = pane === "nodes";
  const showDice = pane === "dice";
  const showRewards = false;
  const showCards = false;
  const showCodex = pane === "codex";
  layoutEditor.activePane = pane;
  setLayoutEditorTool(showNodes ? "node" : "pan");
  nodes.layoutEditorNodeTab.setAttribute("aria-selected", String(showNodes));
  nodes.layoutEditorDiceTab.setAttribute("aria-selected", String(showDice));
  nodes.layoutEditorRewardTab.setAttribute("aria-selected", String(showRewards));
  nodes.layoutEditorEventTab.setAttribute("aria-selected", "false");
  nodes.layoutEditorCardTab.setAttribute("aria-selected", String(showCards));
  nodes.layoutEditorCodexTab.setAttribute("aria-selected", String(showCodex));
  nodes.layoutEditorNodeTab.tabIndex = showNodes ? 0 : -1;
  nodes.layoutEditorDiceTab.tabIndex = showDice ? 0 : -1;
  nodes.layoutEditorRewardTab.tabIndex = showRewards ? 0 : -1;
  nodes.layoutEditorEventTab.tabIndex = -1;
  nodes.layoutEditorCardTab.tabIndex = showCards ? 0 : -1;
  nodes.layoutEditorCodexTab.tabIndex = showCodex ? 0 : -1;
  nodes.layoutEditorNodeSection.hidden = !showNodes;
  nodes.layoutEditorDiceSection.hidden = !showDice;
  nodes.layoutEditorRewardSection.hidden = !showRewards;
  nodes.layoutEditorEventSection.hidden = true;
  nodes.layoutEditorCardSection.hidden = !showCards;
  nodes.layoutEditorCodexSection.hidden = !showCodex;
  nodes.runtimeShell.dataset.layoutEditorPane = pane;
  if (showDice) {
    renderDicePackEditor();
    nodes.dicePackEditorFamily.focus({ preventScroll: true });
  } else if (showRewards) {
    nodeRewardEditor.worldRef = layoutEditor.worldRef;
    if (!NODE_REWARD_CATALOG[nodeRewardEditor.worldRef].nodeById[nodeRewardEditor.selectedNodeId]) {
      nodeRewardEditor.selectedNodeId = layoutEditor.selectedNodeId
        || NODE_REWARD_CATALOG[nodeRewardEditor.worldRef].nodes[0]?.nodeId
        || null;
    }
    renderNodeRewardEditor();
    nodes.nodeRewardEditorNode.focus({ preventScroll: true });
  } else if (showCards) {
    renderCardCatalogEditor();
    nodes.cardCatalogSearch.focus({ preventScroll: true });
  } else if (showCodex) {
    syncNodeAuthoringExchangeEditor();
    const focusTarget = nodes.nodeAuthoringExchangeInput.value.trim()
      ? nodes.nodeAuthoringExchangePreview
      : nodes.nodeAuthoringExchangeGenerate;
    focusTarget.focus({ preventScroll: true });
  } else {
    nodes.layoutEditorNode.focus({ preventScroll: true });
  }
}
const ROUTE_CHOICE_META = Object.freeze({
  n04: Object.freeze({
    title: "启航海湾岔路",
    copy: "先看下方标出的本次真实落点。上路可能抵达信号炮，下路可能抵达港口雾笛；只有最终停在设施格时才会触发。",
    options: Object.freeze({
      e04a: Object.freeze({
        direction: "↗",
        directionLabel: "向上走",
        label: "云霄炮台线",
        tone: "positive",
        description: "沿炮台线前进；只有本次最终停在信号炮格，才会发射到前方落点。",
      }),
      e04b: Object.freeze({
        direction: "↘",
        directionLabel: "向下走",
        label: "雾笛侦察线",
        tone: "mixed",
        description: "沿雾笛线前进；只有本次最终停在雾笛格，才会驱散云雾并标亮前方设施。",
      }),
    }),
  }),
  n10: Object.freeze({
    title: "云瀑岔路",
    copy: "先看下方标出的本次真实落点。经过特殊格不会自动触发；最终停在哪里，才结算哪里的落点效果。",
    options: Object.freeze({
      e10a: Object.freeze({
        direction: "↗",
        directionLabel: "向上走",
        label: "星光云梯",
        tone: "positive",
        description: "沿星光线前进；只领取本次最终停格的家园积分。",
      }),
      e10b: Object.freeze({
        direction: "↘",
        directionLabel: "向下走",
        label: "云瀑工务线",
        tone: "mixed",
        description: "沿港口工务线前进；只有本次最终停在云瀑水门，才会为全班永久开路。",
      }),
    }),
  }),
  n14: Object.freeze({
    title: "云阶航道",
    copy: "水门已经打开。选择主路稳稳前进，或踏上云阶一步抵达灯塔前方。",
    options: Object.freeze({
      e14: Object.freeze({
        direction: "↗",
        directionLabel: "走常规航道",
        label: "灯塔主路",
        tone: "positive",
        description: "沿 n15、n16 前进；经过不发奖励，只结算本次最终落点。",
      }),
      e14c: Object.freeze({
        direction: "⇧",
        directionLabel: "走云阶捷径",
        label: "云阶捷径",
        tone: "mixed",
        description: "只消耗 1 步直达 n17，会跳过 n15 和 n16。",
      }),
    }),
  }),
  n21: Object.freeze({
    title: "彩虹峡谷岔路",
    copy: "两条路会经过不同设施；经过不等于获得，以下方标出的本次真实落点结果为准。",
    options: Object.freeze({
      e21a: Object.freeze({
        direction: "↗",
        directionLabel: "向上走",
        label: "彩虹发现线",
        tone: "mixed",
        description: "沿彩虹高线前进；只结算下方标出的真实最终落点结果。",
      }),
      e21b: Object.freeze({
        direction: "↘",
        directionLabel: "向下走",
        label: "稳稳练习路",
        tone: "positive",
        description: "沿稳定外线前进；本轮只结算下方标出的最终落点。",
      }),
    }),
  }),
  n29: Object.freeze({
    title: "星门前哨岔路",
    copy: "左、右路线会经过不同类型的格子；经过不自动结算，以下方标出的本次真实落点为准。",
    options: Object.freeze({
      e29a: Object.freeze({
        direction: "↙",
        directionLabel: "向左下走",
        label: "星光探索路",
        tone: "mixed",
        description: "沿星光路线前进；停稳后只领取最终格积分，地图机关保持各自效果。",
      }),
      e29b: Object.freeze({
        direction: "↘",
        directionLabel: "向右下走",
        label: "航标外环",
        tone: "positive",
        description: "沿航标外环前进；完成全部移动后只领取最终格积分。",
      }),
    }),
  }),
});

const nodes = {
  runtimeShell: document.querySelector(".runtime-shell"),
  board: document.querySelector("#board-svg"),
  boardViewport: document.querySelector(".board-viewport"),
  mapNavigator: document.querySelector(".map-navigator"),
  boardLegend: document.querySelector(".board-legend"),
  miniMap: document.querySelector("#mini-map"),
  mapZoneButtons: document.querySelector("#map-zone-buttons"),
  focusActivePawn: document.querySelector("#focus-active-pawn"),
  panStatus: document.querySelector("#board-pan-status"),
  fxLayer: document.querySelector("#board-fx-layer"),
  leftTeams: document.querySelector("#team-hud-left"),
  rightTeams: document.querySelector("#team-hud-right"),
  round: document.querySelector("[data-testid='session-round']"),
  proof: document.querySelector("[data-testid='content-proof']"),
  sessionGoal: document.querySelector("#session-goal"),
  speakerAvatar: document.querySelector("#speaker-avatar"),
  speakerName: document.querySelector("#speaker-name"),
  speakerTeam: document.querySelector("#speaker-team"),
  missionDock: document.querySelector(".mission-dock"),
  cue: document.querySelector("#mission-cue"),
  packName: document.querySelector("#learning-pack-name"),
  prompt: document.querySelector("#mission-prompt"),
  frame: document.querySelector("#mission-frame"),
  model: document.querySelector("#mission-model"),
  missionScore: document.querySelector("#mission-score-result"),
  answerRewardSource: document.querySelector("[data-reward-source='answer']"),
  voiceState: document.querySelector("#voice-state-text"),
  die: document.querySelector("#die-status"),
  dieKind: document.querySelector("#die-kind"),
  themeSelect: document.querySelector("#theme-select"),
  learningSelect: document.querySelector("#learning-select"),
  playerCount: document.querySelector("#player-count"),
  asrConsole: document.querySelector("#asr-console"),
  asrStatusLine: document.querySelector("#asr-status-line"),
  asrAvailability: document.querySelector("#asr-availability"),
  asrTranscript: document.querySelector("#asr-transcript"),
  asrToggle: document.querySelector("#asr-toggle"),
  teacherAccept: document.querySelector("#teacher-accept"),
  asrHelp: document.querySelector("#asr-help"),
  soundToggle: document.querySelector("#board-sound-toggle"),
  routeChoiceStage: document.querySelector("#route-choice-stage"),
  routeChoiceTitle: document.querySelector("#route-choice-title"),
  routeChoiceCopy: document.querySelector("#route-choice-copy"),
  routeChoiceSteps: document.querySelector("#route-choice-steps"),
  routeOptions: document.querySelector("#route-options"),
  coinExchangeStage: document.querySelector("#coin-exchange-stage"),
  coinExchangeCard: document.querySelector(".coin-exchange-card"),
  coinExchangeCopy: document.querySelector("#coin-exchange-copy"),
  coinExchangeBalance: document.querySelector("#coin-exchange-balance"),
  coinExchangeKeep: document.querySelector("#coin-exchange-keep"),
  coinExchangeConfirm: document.querySelector("#coin-exchange-confirm"),
  coinExchangeNote: document.querySelector("#coin-exchange-note"),
  activityStage: document.querySelector("#activity-stage"),
  activityCard: document.querySelector("#activity-card"),
  activityKicker: document.querySelector("#activity-kicker"),
  activityLandedLabel: document.querySelector("#activity-landed-label"),
  activityTitle: document.querySelector("#activity-title"),
  activityStory: document.querySelector("#activity-story"),
  activityActorAvatar: document.querySelector("#activity-actor-avatar"),
  activityActorName: document.querySelector("#activity-actor-name"),
  activityFirstAction: document.querySelector("#activity-first-action"),
  activitySteps: document.querySelector("#activity-steps"),
  activityChallengeWrap: document.querySelector("#activity-challenge-wrap"),
  activityChallenge: document.querySelector("#activity-challenge"),
  activityTarget: document.querySelector("#activity-target"),
  materialTags: document.querySelector("#material-tags"),
  activityOutcome: document.querySelector("#activity-outcome"),
  activityResult: document.querySelector("#activity-result"),
  activityResultCopy: document.querySelector("#activity-result-copy"),
  skipActivity: document.querySelector("#skip-activity"),
  completeActivity: document.querySelector("#complete-activity"),
  returnToSetup: document.querySelector("#return-to-setup"),
  endGame: document.querySelector("#end-game"),
  restartGame: document.querySelector("#restart-game"),
  setupStage: document.querySelector("#setup-stage"),
  setupForm: document.querySelector("#setup-form"),
  studentProfileList: document.querySelector("#student-profile-list"),
  studentRosterProgress: document.querySelector("#student-roster-progress"),
  studentRosterStatus: document.querySelector("#student-roster-status"),
  studentCreateForm: document.querySelector("#student-create-form"),
  studentCreateName: document.querySelector("#student-create-name"),
  studentCreateSubmit: document.querySelector("#student-create-submit"),
  studentManagerOpen: document.querySelector("#student-manager-open"),
  studentManagerDialog: document.querySelector("#student-manager-dialog"),
  studentManagerClose: document.querySelector("#student-manager-close"),
  studentManagerSearch: document.querySelector("#student-manager-search"),
  studentManagerList: document.querySelector("#student-manager-list"),
  studentManagerForm: document.querySelector("#student-manager-form"),
  studentManagerEmpty: document.querySelector("#student-manager-empty"),
  studentManagerFields: document.querySelector("#student-manager-fields"),
  studentManagerAvatar: document.querySelector("#student-manager-avatar"),
  studentManagerCurrentName: document.querySelector("#student-manager-current-name"),
  studentManagerDisplayName: document.querySelector("#student-manager-display-name"),
  studentManagerNickname: document.querySelector("#student-manager-nickname"),
  studentManagerCourseStage: document.querySelector("#student-manager-course-stage"),
  studentManagerNote: document.querySelector("#student-manager-note"),
  studentManagerAssetSummary: document.querySelector("#student-manager-asset-summary"),
  studentManagerStatus: document.querySelector("#student-manager-status"),
  studentManagerSave: document.querySelector("#student-manager-save"),
  setupTheme: document.querySelector("#setup-theme"),
  setupLearning: document.querySelector("#setup-learning"),
  setupMode: document.querySelector("#setup-mode"),
  teacherPanel: document.querySelector("#teacher-play-panel"),
  teacherPlayers: document.querySelector("#teacher-player-options"),
  teacherStatus: document.querySelector("#teacher-play-status"),
  teacherGrant: document.querySelector("#teacher-grant"),
  teacherRoll: document.querySelector("#teacher-roll"),
  setupPlayerCount: document.querySelector("#setup-player-count"),
  setupOpportunities: document.querySelector("#setup-opportunities"),
  setupPreview: document.querySelector("#setup-preview"),
  startSession: document.querySelector("#start-session"),
  layoutEditorOpen: document.querySelector("#layout-editor-open"),
  layoutRegistryError: document.querySelector("#layout-registry-error"),
  gameAuthoringOpen: document.querySelector("#game-authoring-open"),
  layoutEditorPanel: document.querySelector("#layout-editor-panel"),
  layoutEditorTitle: document.querySelector("#layout-editor-title"),
  layoutEditorClose: document.querySelector("#layout-editor-close"),
  layoutEditorNodeTab: document.querySelector("#layout-editor-node-tab"),
  layoutEditorDiceTab: document.querySelector("#layout-editor-dice-tab"),
  layoutEditorRewardTab: document.querySelector("#layout-editor-reward-tab"),
  layoutEditorEventTab: document.querySelector("#layout-editor-event-tab"),
  layoutEditorCardTab: document.querySelector("#layout-editor-card-tab"),
  layoutEditorCodexTab: document.querySelector("#layout-editor-codex-tab"),
  layoutEditorNodeSection: document.querySelector("#layout-editor-node-section"),
  layoutEditorDiceSection: document.querySelector("#layout-editor-dice-section"),
  layoutEditorRewardSection: document.querySelector("#layout-editor-reward-section"),
  layoutEditorEventSection: document.querySelector("#layout-editor-event-section"),
  layoutEditorCardSection: document.querySelector("#layout-editor-card-section"),
  layoutEditorCodexSection: document.querySelector("#layout-editor-codex-section"),
  layoutEditorSaveBar: document.querySelector("#layout-editor-save-bar"),
  layoutEditorSave: document.querySelector("#layout-editor-save"),
  layoutEditorSaveState: document.querySelector("#layout-editor-save-state"),
  layoutEditorNodeMode: document.querySelector("#layout-editor-node-mode"),
  layoutEditorPanMode: document.querySelector("#layout-editor-pan-mode"),
  layoutEditorWorld: document.querySelector("#layout-editor-world"),
  layoutEditorNode: document.querySelector("#layout-editor-node"),
  layoutEditorNodeName: document.querySelector("#layout-editor-node-name"),
  layoutEditorNodeMeta: document.querySelector("#layout-editor-node-meta"),
  layoutEditorX: document.querySelector("#layout-editor-x"),
  layoutEditorY: document.querySelector("#layout-editor-y"),
  layoutEditorOriginal: document.querySelector("#layout-editor-original"),
  layoutEditorDelta: document.querySelector("#layout-editor-delta"),
  layoutEditorGrid: document.querySelector("#layout-editor-grid"),
  layoutEditorUndo: document.querySelector("#layout-editor-undo"),
  layoutEditorRedo: document.querySelector("#layout-editor-redo"),
  layoutEditorResetNode: document.querySelector("#layout-editor-reset-node"),
  layoutEditorResetWorld: document.querySelector("#layout-editor-reset-world"),
  layoutEditorWarning: document.querySelector("#layout-editor-warning"),
  layoutEditorCopy: document.querySelector("#layout-editor-copy"),
  layoutEditorDownload: document.querySelector("#layout-editor-download"),
  layoutEditorExportText: document.querySelector("#layout-editor-export-text"),
  layoutEditorChangedCount: document.querySelector("#layout-editor-changed-count"),
  layoutEditorStatus: document.querySelector("#layout-editor-status"),
  dicePackEditorSaveBar: document.querySelector("#dice-pack-editor-save-bar"),
  dicePackEditorSave: document.querySelector("#dice-pack-editor-save"),
  dicePackEditorSaveState: document.querySelector("#dice-pack-editor-save-state"),
  dicePackEditorFamily: document.querySelector("#dice-pack-editor-family"),
  dicePackEditorPreviewDie: document.querySelector("#dice-pack-editor-preview-die"),
  dicePackEditorFamilyName: document.querySelector("#dice-pack-editor-family-name"),
  dicePackEditorFamilySummary: document.querySelector("#dice-pack-editor-family-summary"),
  dicePackEditorFaces: document.querySelector("#dice-pack-editor-faces"),
  dicePackEditorResetFamily: document.querySelector("#dice-pack-editor-reset-family"),
  dicePackEditorResetAll: document.querySelector("#dice-pack-editor-reset-all"),
  dicePackEditorChangedCount: document.querySelector("#dice-pack-editor-changed-count"),
  dicePackEditorStatus: document.querySelector("#dice-pack-editor-status"),
  nodeRewardEditorSaveBar: document.querySelector("#node-reward-editor-save-bar"),
  nodeRewardEditorSave: document.querySelector("#node-reward-editor-save"),
  nodeRewardEditorSaveState: document.querySelector("#node-reward-editor-save-state"),
  nodeRewardEditorWorld: document.querySelector("#node-reward-editor-world"),
  nodeRewardEditorNode: document.querySelector("#node-reward-editor-node"),
  nodeRewardEditorNodeName: document.querySelector("#node-reward-editor-node-name"),
  nodeRewardEditorNodeMeta: document.querySelector("#node-reward-editor-node-meta"),
  nodeRewardEditorFixedEffect: document.querySelector("#node-reward-editor-fixed-effect"),
  nodeRewardEditorFixedDetail: document.querySelector("#node-reward-editor-fixed-detail"),
  nodeRewardEditorBaseReward: document.querySelector("#node-reward-editor-base-reward"),
  nodeRewardEditorReward: document.querySelector("#node-reward-editor-reward"),
  nodeRewardEditorAmount: document.querySelector("#node-reward-editor-amount"),
  nodeRewardEditorEffective: document.querySelector("#node-reward-editor-effective"),
  nodeRewardEditorResetNode: document.querySelector("#node-reward-editor-reset-node"),
  nodeRewardEditorResetWorld: document.querySelector("#node-reward-editor-reset-world"),
  nodeRewardEditorResetAll: document.querySelector("#node-reward-editor-reset-all"),
  nodeRewardEditorChangedCount: document.querySelector("#node-reward-editor-changed-count"),
  nodeRewardEditorStatus: document.querySelector("#node-reward-editor-status"),
  classroomEventEditorSaveBar: document.querySelector("#classroom-event-editor-save-bar"),
  classroomEventEditorSave: document.querySelector("#classroom-event-editor-save"),
  classroomEventEditorSaveState: document.querySelector("#classroom-event-editor-save-state"),
  classroomEventEditorLearning: document.querySelector("#classroom-event-editor-learning"),
  classroomEventEditorWorld: document.querySelector("#classroom-event-editor-world"),
  classroomEventEditorNode: document.querySelector("#classroom-event-editor-node"),
  classroomEventEditorTriggerWhen: document.querySelector("#classroom-event-editor-trigger-when"),
  classroomEventEditorTriggerEffect: document.querySelector("#classroom-event-editor-trigger-effect"),
  classroomEventEditorTriggerSource: document.querySelector("#classroom-event-editor-trigger-source"),
  classroomEventEditorEvent: document.querySelector("#classroom-event-editor-event"),
  classroomEventEditorSourceQuestion: document.querySelector("#classroom-event-editor-source-question"),
  classroomEventEditorTitle: document.querySelector("#classroom-event-editor-title"),
  classroomEventEditorInstruction: document.querySelector("#classroom-event-editor-instruction"),
  classroomEventEditorChallenge: document.querySelector("#classroom-event-editor-challenge"),
  classroomEventEditorTarget: document.querySelector("#classroom-event-editor-target"),
  classroomEventEditorResetNode: document.querySelector("#classroom-event-editor-reset-node"),
  classroomEventEditorResetWorld: document.querySelector("#classroom-event-editor-reset-world"),
  classroomEventEditorResetAll: document.querySelector("#classroom-event-editor-reset-all"),
  classroomEventEditorChangedCount: document.querySelector("#classroom-event-editor-changed-count"),
  classroomEventEditorStatus: document.querySelector("#classroom-event-editor-status"),
  cardCatalogCount: document.querySelector("#card-catalog-count"),
  cardCatalogRevision: document.querySelector("#card-catalog-revision"),
  cardCatalogAddForm: document.querySelector("#card-catalog-add-form"),
  cardCatalogNewName: document.querySelector("#card-catalog-new-name"),
  cardCatalogNewStory: document.querySelector("#card-catalog-new-story"),
  cardCatalogAdd: document.querySelector("#card-catalog-add"),
  cardCatalogSearch: document.querySelector("#card-catalog-search"),
  cardCatalogList: document.querySelector("#card-catalog-list"),
  cardCatalogStatus: document.querySelector("#card-catalog-status"),
  nodeAuthoringExchangeScope: document.querySelector("#codex-node-exchange-scope"),
  nodeAuthoringExchangeGenerate: document.querySelector("#codex-node-exchange-generate"),
  nodeAuthoringExchangeCopy: document.querySelector("#codex-node-exchange-copy"),
  nodeAuthoringExchangeOutput: document.querySelector("#codex-node-exchange-output"),
  nodeAuthoringExchangeInput: document.querySelector("#codex-node-exchange-input"),
  nodeAuthoringExchangePreview: document.querySelector("#codex-node-exchange-preview"),
  nodeAuthoringExchangeDiff: document.querySelector("#codex-node-exchange-diff"),
  nodeAuthoringExchangeDiffSummary: document.querySelector("#codex-node-exchange-diff-summary"),
  nodeAuthoringExchangeDiffList: document.querySelector("#codex-node-exchange-diff-list"),
  nodeAuthoringExchangeApply: document.querySelector("#codex-node-exchange-apply"),
  nodeAuthoringExchangeStatus: document.querySelector("#codex-node-exchange-status"),
  playerCharacterTabs: document.querySelector("#player-character-tabs"),
  characterOptions: document.querySelector("#character-options"),
  characterSelectionProgress: document.querySelector("#character-selection-progress"),
  characterSelectionGuide: document.querySelector("#character-selection-guide"),
  resumeSession: document.querySelector("#resume-session"),
  turnShowtime: document.querySelector("#turn-showtime"),
  showtimeAvatar: document.querySelector("#showtime-avatar"),
  showtimeName: document.querySelector("#showtime-name"),
  showtimeRole: document.querySelector("#showtime-role"),
  showtimeTeam: document.querySelector("#showtime-team"),
  turnFeedback: document.querySelector("#turn-feedback"),
  feedbackKicker: document.querySelector("#feedback-kicker"),
  feedbackTitle: document.querySelector("#feedback-title"),
  feedbackTranscript: document.querySelector("#feedback-transcript"),
  feedbackGuidance: document.querySelector("#feedback-guidance"),
  feedbackScore: document.querySelector("#feedback-score"),
  feedbackDice: document.querySelector("#feedback-dice"),
  feedbackMove: document.querySelector("#feedback-move"),
  diceDock: document.querySelector("#dice-dock"),
  diceDockList: document.querySelector("#dice-dock-list"),
  diceChoiceStage: document.querySelector("#dice-choice-stage"),
  diceChoiceCard: document.querySelector(".dice-choice-card"),
  diceChoiceTitle: document.querySelector("#dice-choice-title"),
  diceChoiceCopy: document.querySelector("#dice-choice-copy"),
  diceOptions: document.querySelector("#dice-options"),
  diceScoreRetry: document.querySelector("#dice-score-retry"),
  diceScoreRetryNote: document.querySelector("#dice-score-retry-note"),
  diceRollStage: document.querySelector("#dice-roll-stage"),
  diceRollCard: document.querySelector("#dice-roll-card"),
  diceRollName: document.querySelector("#dice-roll-name"),
  diceRollStatus: document.querySelector("#dice-roll-status"),
  diceRollCubeSlot: document.querySelector("#dice-roll-cube-slot"),
  diceRollFaces: document.querySelector("#dice-roll-faces"),
  diceRollResult: document.querySelector("#dice-roll-result"),
  diceBoardResult: document.querySelector("#dice-board-result"),
  diceBoardResultNumber: document.querySelector("#dice-board-result-number"),
  diceBoardResultTitle: document.querySelector("#dice-board-result-title"),
  diceBoardResultBonus: document.querySelector("#dice-board-result-bonus"),
  collectionFxLayer: document.querySelector("#collection-fx-layer"),
  collectionStatus: document.querySelector("#collection-status"),
  cardRevealStage: document.querySelector("#card-reveal-stage"),
  cardRevealOwner: document.querySelector("#card-reveal-owner"),
  revealedCardAvatar: document.querySelector("#revealed-card-avatar"),
  revealedCardName: document.querySelector("#revealed-card-name"),
  revealedCardStory: document.querySelector("#revealed-card-story"),
  teacherTools: document.querySelector("#teacher-tools"),
  bossStage: document.querySelector("#boss-stage"),
  bossCopy: document.querySelector("#boss-copy"),
  bossTaskFrame: document.querySelector("#boss-task-frame"),
  bossProgress: document.querySelector("#boss-progress"),
  completeBoss: document.querySelector("#complete-boss"),
  resultsStage: document.querySelector("#results-stage"),
  resultsTeamList: document.querySelector("#results-team-list"),
  resultsSeatList: document.querySelector("#results-seat-list"),
  replaySession: document.querySelector("#replay-session"),
  newSession: document.querySelector("#new-session"),
};

const LAYOUT_EDITOR_WORLD_REFS = Object.freeze([
  CLOUD_HARBOR_WORLD_REF,
  BEYOND_CLOUD_WORLD_REF,
]);

function cloneLayoutEditorDraft(draft) {
  return draft ? structuredClone(draft) : null;
}

function layoutEditorDraftStorageKey(worldRef) {
  const stableWorldId = isGameOwnedLayoutWorldRef(worldRef)
    ? worldRef
    : String(worldRef || "").split("@")[0];
  return `${LOCAL_LAYOUT_DRAFT_PREFIX}${stableWorldId}`;
}

function layoutEditorAppliedStorageKey(worldRef) {
  const stableWorldId = isGameOwnedLayoutWorldRef(worldRef)
    ? worldRef
    : String(worldRef || "").split("@")[0];
  return `${LOCAL_LAYOUT_APPLIED_PREFIX}${stableWorldId}`;
}

function readNormalizedLocalLayoutDraft(board, worldRef, storageKey) {
  try {
    const raw = localStorage.getItem(storageKey) || "";
    if (!raw) return { draft: null, raw: "", storageAvailable: true };
    const draft = normalizeBoardLayoutDraft(
      board,
      JSON.parse(raw),
      { worldRef },
    );
    return { draft, raw, storageAvailable: true };
  } catch {
    return { draft: null, raw: "", storageAvailable: false };
  }
}

function localAppliedLayoutAllowed() {
  return Boolean(
    (qaControlsEnabled && QA_PAGE_REQUESTED)
    || (layoutEditorOwnerUserId && boardLayoutRegistryLoaded),
  );
}

function confirmedVisualLayout(worldRef, board = activeBoardTemplate) {
  const published = publishedBoardLayouts.get(worldRef) || null;
  if (published?.status === "active" && published.draft) {
    const draft = normalizeBoardLayoutDraft(board, published.draft, { worldRef });
    if (draft) {
      return {
        draft,
        revision: published.revision || null,
        source: "server",
      };
    }
  }
  if (
    localAppliedLayoutAllowed()
    && (!published || published.status === "empty")
  ) {
    const local = readNormalizedLocalLayoutDraft(
      board,
      worldRef,
      layoutEditorAppliedStorageKey(worldRef),
    );
    if (local.draft) {
      return {
        draft: local.draft,
        revision: null,
        source: qaControlsEnabled && QA_PAGE_REQUESTED ? "qa-local" : "legacy-local",
      };
    }
  }
  return {
    draft: createBoardLayoutDraft(board, { worldRef }),
    revision: published?.revision || null,
    source: published?.status === "stale" ? "stale" : "base",
  };
}

function applyConfirmedVisualBoard(worldRef = activeWorldComposition.worldRef) {
  const confirmed = confirmedVisualLayout(worldRef, activeBoardTemplate);
  visualBoardTemplate = applyBoardLayoutDraft(
    activeBoardTemplate,
    confirmed.draft,
    { worldRef },
  );
  nodeById = new Map(visualBoardTemplate.nodes.map((node) => [node.id, node]));
  regionArtSceneCache = null;
  return confirmed;
}

function normalizeBoardLayoutRegistryEntry(input) {
  if (!input || !WORLD_REGISTRIES.worldPacks[input.worldRef]) return null;
  const composition = resolveWorldComposition(input.worldRef, WORLD_REGISTRIES);
  const status = ["empty", "active", "stale"].includes(input.status)
    ? input.status
    : "stale";
  const draft = status === "active"
    ? normalizeBoardLayoutDraft(
        composition.board,
        input.draft,
        { worldRef: input.worldRef },
      )
    : null;
  return {
    ...input,
    status: status === "active" && !draft ? "stale" : status,
    revision: typeof input.revision === "string" ? input.revision : null,
    draft,
  };
}

function applyBoardLayoutRegistryPayload(payload) {
  if (
    payload?.schemaVersion !== BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION
    || !Array.isArray(payload.layouts)
  ) {
    return false;
  }
  const next = new Map();
  payload.layouts.forEach((input) => {
    const entry = normalizeBoardLayoutRegistryEntry(input);
    if (entry) next.set(entry.worldRef, entry);
  });
  LAYOUT_EDITOR_WORLD_REFS.forEach((worldRef) => {
    if (!next.has(worldRef)) {
      const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
      next.set(worldRef, {
        worldRef,
        boardRef: `${composition.board.id}@${composition.board.version}`,
        status: "stale",
        revision: null,
        draft: null,
      });
    }
  });
  publishedBoardLayouts.clear();
  next.forEach((entry, worldRef) => publishedBoardLayouts.set(worldRef, entry));
  boardLayoutRegistryLoaded = true;
  return true;
}

function layoutEditingAvailable() {
  return !boardLayoutRegistryError && (
    boardLayoutRegistryLoaded
    || (qaControlsEnabled && QA_PAGE_REQUESTED && !authenticatedUserId)
  );
}

function renderLayoutRegistryStatus() {
  if (nodes.layoutRegistryError) {
    nodes.layoutRegistryError.textContent = boardLayoutRegistryError;
    nodes.layoutRegistryError.hidden = !boardLayoutRegistryError;
  }
  if (nodes.layoutEditorOpen) nodes.layoutEditorOpen.disabled = !layoutEditingAvailable();
}

function boardLayoutEndpointForWorld(worldRef, { admin = false } = {}) {
  const prefix = isGameOwnedLayoutWorldRef(worldRef) ? "/games/monopoly" : "";
  return `${prefix}/api/${admin ? "admin/" : ""}board-layouts/v1`;
}

async function loadPublishedBoardLayouts() {
  try {
    const responses = await Promise.all([
      fetch("/api/board-layouts/v1", { cache: "no-store" }),
      fetch(boardLayoutEndpointForWorld(CLOUD_HARBOR_WORLD_REF), { cache: "no-store" }),
    ]);
    if (responses.some((response) => !response.ok)) throw new Error("layout request failed");
    const [platform, game] = await Promise.all(responses.map((response) => response.json()));
    if ([platform, game].some((payload) => (
      payload?.schemaVersion !== BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION
      || !Array.isArray(payload.layouts)
    ))) throw new Error("layout registry incompatible");
    const applied = applyBoardLayoutRegistryPayload({
      schemaVersion: BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION,
      layouts: [
        ...platform.layouts.filter(({ worldRef }) => !isGameOwnedLayoutWorldRef(worldRef)),
        ...game.layouts.filter(({ worldRef }) => isGameOwnedLayoutWorldRef(worldRef)),
      ],
    });
    if (!applied) throw new Error("layout registry could not be applied");
    boardLayoutRegistryError = "";
    return true;
  } catch {
    // Keep any previously confirmed registry and untouched local drafts.
    boardLayoutRegistryError = "地图布局配置未加载，原草稿已保留。请刷新后再编辑或发布地图。";
    return false;
  } finally {
    renderLayoutRegistryStatus();
  }
}

function normalizeDicePackPublication(input) {
  if (!input || !["default", "active"].includes(input.status)) return null;
  try {
    const pack = normalizeDicePack(input.pack);
    const revision = typeof input.revision === "string" ? input.revision : null;
    if (input.status === "active" && !revision) return null;
    return {
      status: input.status,
      revision,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
      pack,
    };
  } catch {
    return null;
  }
}

function applyDicePackRegistryPayload(payload) {
  if (payload?.schemaVersion !== DICE_PACK_REGISTRY_SCHEMA_VERSION) return false;
  const publication = normalizeDicePackPublication(payload.dicePack);
  if (!publication) return false;
  publishedDicePackPublication = publication;
  dicePackRegistryLoaded = true;
  return true;
}

async function loadPublishedDicePack() {
  try {
    const response = await fetch("/api/dice-packs/v1", { cache: "no-store" });
    if (!response.ok) return false;
    return applyDicePackRegistryPayload(await response.json());
  } catch {
    return false;
  }
}

function localDicePack(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey) || "";
    return raw ? normalizeDicePack(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function effectivePublishedDicePackPublication() {
  if (qaControlsEnabled && QA_PAGE_REQUESTED && !layoutEditorOwnerUserId) {
    const applied = localDicePack(LOCAL_DICE_PACK_APPLIED_KEY);
    if (applied) {
      return {
        status: "qa-local",
        revision: null,
        updatedAt: null,
        pack: applied,
      };
    }
  }
  return publishedDicePackPublication;
}

function currentDicePack() {
  return sessionDicePackSnapshot?.pack
    || effectivePublishedDicePackPublication().pack
    || DEFAULT_DICE_PACK;
}

function createSessionDicePackSnapshot(publication = effectivePublishedDicePackPublication()) {
  return {
    schemaVersion: "dice-pack-session-snapshot.v1",
    revision: publication?.revision || null,
    pack: cloneDicePack(publication?.pack || DEFAULT_DICE_PACK),
  };
}

function normalizeSessionDicePackSnapshot(input) {
  if (
    !input
    || input.schemaVersion !== "dice-pack-session-snapshot.v1"
    || !(input.revision === null || typeof input.revision === "string")
  ) {
    return null;
  }
  try {
    return {
      schemaVersion: "dice-pack-session-snapshot.v1",
      revision: input.revision,
      pack: normalizeDicePack(input.pack),
    };
  } catch {
    return null;
  }
}

function normalizeNodeRewardPackPublication(input) {
  if (!input || !["default", "active"].includes(input.status)) return null;
  try {
    const sourcePack = normalizeNodeRewardPack(input.pack);
    const sourceWorldRef = Object.keys(sourcePack.worlds).find(isCloudHarborWorldRef);
    const pack = retargetNodeRewardPack(sourcePack);
    const revision = typeof input.revision === "string" ? input.revision : null;
    if (input.status === "active" && !revision) return null;
    return {
      status: input.status,
      sourceWorldRef,
      revision,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
      pack,
    };
  } catch {
    return null;
  }
}

function applyNodeRewardPackRegistryPayload(payload) {
  if (payload?.schemaVersion !== NODE_REWARD_PACK_REGISTRY_SCHEMA_VERSION) return false;
  const publication = normalizeNodeRewardPackPublication(payload.nodeRewardPack);
  if (!publication) return false;
  publishedNodeRewardPackPublication = publication;
  nodeRewardPackRegistryLoaded = true;
  return true;
}

async function loadPublishedNodeRewardPack() {
  try {
    const response = await fetch("/api/node-reward-packs/v1", { cache: "no-store" });
    if (!response.ok) return false;
    return applyNodeRewardPackRegistryPayload(await response.json());
  } catch {
    return false;
  }
}

function localNodeRewardPack(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey) || "";
    return raw ? retargetNodeRewardPack(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function effectivePublishedNodeRewardPackPublication() {
  if (qaControlsEnabled && QA_PAGE_REQUESTED && !layoutEditorOwnerUserId) {
    const applied = localNodeRewardPack(LOCAL_NODE_REWARD_PACK_APPLIED_KEY);
    if (applied) {
      return {
        status: "qa-local",
        revision: null,
        updatedAt: null,
        pack: applied,
      };
    }
  }
  return publishedNodeRewardPackPublication;
}

function currentNodeRewardPack() {
  return sessionNodeRewardPackSnapshot?.pack
    || effectivePublishedNodeRewardPackPublication().pack
    || DEFAULT_NODE_REWARD_PACK;
}

function createSessionNodeRewardPackSnapshot(
  publication = effectivePublishedNodeRewardPackPublication(),
) {
  return {
    schemaVersion: "node-reward-pack-session-snapshot.v1",
    revision: publication?.revision || null,
    pack: cloneNodeRewardPack(publication?.pack || DEFAULT_NODE_REWARD_PACK),
  };
}

function normalizeSessionNodeRewardPackSnapshot(input) {
  if (
    !input
    || input.schemaVersion !== "node-reward-pack-session-snapshot.v1"
    || !(input.revision === null || typeof input.revision === "string")
  ) {
    return null;
  }
  try {
    return {
      schemaVersion: "node-reward-pack-session-snapshot.v1",
      revision: input.revision,
      pack: normalizeNodeRewardPack(input.pack),
    };
  } catch {
    return null;
  }
}

function normalizeClassroomEventProgramPublication(input) {
  if (!input || !["default", "active"].includes(input.status)) return null;
  try {
    const program = normalizeClassroomEventProgram(input.pack);
    const revision = typeof input.revision === "string" ? input.revision : null;
    if (input.status === "active" && !revision) return null;
    return {
      status: input.status,
      revision,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
      program,
    };
  } catch {
    return null;
  }
}

function applyClassroomEventProgramRegistryPayload(payload) {
  if (payload?.schemaVersion !== CLASSROOM_EVENT_PROGRAM_REGISTRY_SCHEMA_VERSION) {
    return false;
  }
  const publication = normalizeClassroomEventProgramPublication(
    payload.classroomEventProgram,
  );
  if (!publication) return false;
  publishedClassroomEventProgramPublication = publication;
  classroomEventProgramRegistryLoaded = true;
  return true;
}

async function loadPublishedClassroomEventProgram() {
  try {
    const response = await fetch("/api/classroom-event-programs/v1", {
      cache: "no-store",
    });
    if (!response.ok) return false;
    return applyClassroomEventProgramRegistryPayload(await response.json());
  } catch {
    return false;
  }
}

function localClassroomEventProgram(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey) || "";
    return raw ? normalizeClassroomEventProgram(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function effectivePublishedClassroomEventProgramPublication() {
  if (qaControlsEnabled && QA_PAGE_REQUESTED && !layoutEditorOwnerUserId) {
    const applied = localClassroomEventProgram(
      LOCAL_CLASSROOM_EVENT_PROGRAM_APPLIED_KEY,
    );
    if (applied) {
      return {
        status: "qa-local",
        revision: null,
        updatedAt: null,
        program: applied,
      };
    }
  }
  return publishedClassroomEventProgramPublication;
}

function currentClassroomEventProgram() {
  return sessionClassroomEventProgramSnapshot?.program
    || effectivePublishedClassroomEventProgramPublication().program
    || DEFAULT_CLASSROOM_EVENT_PROGRAM;
}

function createSessionClassroomEventProgramSnapshot(
  publication = effectivePublishedClassroomEventProgramPublication(),
) {
  return {
    schemaVersion: "classroom-event-program-session-snapshot.v1",
    revision: publication?.revision || null,
    program: cloneClassroomEventProgram(
      publication?.program || DEFAULT_CLASSROOM_EVENT_PROGRAM,
    ),
  };
}

function normalizeSessionClassroomEventProgramSnapshot(input) {
  if (
    !input
    || input.schemaVersion !== "classroom-event-program-session-snapshot.v1"
    || !(input.revision === null || typeof input.revision === "string")
  ) {
    return null;
  }
  try {
    return {
      schemaVersion: "classroom-event-program-session-snapshot.v1",
      revision: input.revision,
      program: normalizeClassroomEventProgram(input.program),
    };
  } catch {
    return null;
  }
}

function normalizeCardCatalogCard(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const id = String(input.id || "");
  const name = String(input.name || "").trim();
  const story = String(input.story || "").trim();
  const characterId = String(input.characterId || "").trim();
  const emoji = String(input.emoji || "").trim();
  const origin = String(input.origin || "");
  if (
    !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(id)
    || !name
    || name.length > 60
    || story.length > 180
    || characterId.length > 96
    || emoji.length > 16
    || origin !== "owner"
  ) return null;
  let image = null;
  if (input.image !== null && input.image !== undefined) {
    const expectedAssetRef = `/api/card-catalog/v1/cards/${encodeURIComponent(id)}/image`;
    const contentType = String(input.image?.contentType || "").toLowerCase();
    const byteLength = Number(input.image?.byteLength);
    const updatedAt = String(input.image?.updatedAt || "");
    if (
      input.image?.assetRef !== expectedAssetRef
      || !["image/png", "image/jpeg", "image/webp"].includes(contentType)
      || !Number.isInteger(byteLength)
      || byteLength < 1
      || byteLength > CARD_CATALOG_IMAGE_MAX_BYTES
      || !Number.isFinite(Date.parse(updatedAt))
    ) return null;
    image = { assetRef: expectedAssetRef, contentType, byteLength, updatedAt };
  }
  return { id, name, story, characterId, emoji, origin, image };
}

function normalizeCardCatalogPublication(input) {
  if (
    !input
    || !["default", "active"].includes(input.status)
    || input.schemaVersion !== CARD_CATALOG_SCHEMA_VERSION
    || !Array.isArray(input.cards)
  ) return null;
  const revision = typeof input.revision === "string" ? input.revision : null;
  if (input.status === "active" && !revision) return null;
  const cards = input.cards.map(normalizeCardCatalogCard);
  if (cards.some((card) => !card)) return null;
  if (new Set(cards.map(({ id }) => id)).size !== cards.length) return null;
  return {
    status: input.status,
    revision,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    updatedBy: typeof input.updatedBy === "string" ? input.updatedBy : null,
    schemaVersion: CARD_CATALOG_SCHEMA_VERSION,
    cards,
  };
}

function applyCardCatalogRegistryPayload(payload) {
  if (payload?.schemaVersion !== CARD_CATALOG_REGISTRY_SCHEMA_VERSION) return false;
  const publication = normalizeCardCatalogPublication(payload.cardCatalog);
  if (!publication) return false;
  publishedCardCatalogPublication = publication;
  cardCatalogRegistryLoaded = true;
  return true;
}

async function loadPublishedCardCatalog() {
  try {
    const response = await fetch("/api/card-catalog/v1", { cache: "no-store" });
    if (!response.ok) return false;
    return applyCardCatalogRegistryPayload(await response.json());
  } catch {
    return false;
  }
}

function publishedCardCatalogIds() {
  return publishedCardCatalogPublication.cards.map(({ id }) => id);
}

function createSessionCardCatalogSnapshot(
  publication = publishedCardCatalogPublication,
) {
  return {
    schemaVersion: "card-catalog-session-snapshot.v1",
    revision: publication?.revision || null,
    cardIds: (publication?.cards || []).map(({ id }) => id),
  };
}

function normalizeSessionCardCatalogSnapshot(input) {
  if (
    !input
    || input.schemaVersion !== "card-catalog-session-snapshot.v1"
    || !(input.revision === null || typeof input.revision === "string")
    || !Array.isArray(input.cardIds)
  ) return null;
  const cardIds = input.cardIds.map((cardId) => String(cardId || ""));
  if (
    cardIds.some((cardId) => !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(cardId))
    || new Set(cardIds).size !== cardIds.length
  ) return null;
  return {
    schemaVersion: "card-catalog-session-snapshot.v1",
    revision: input.revision,
    cardIds,
  };
}

function currentCardCatalogIds() {
  return sessionCardCatalogSnapshot?.cardIds || publishedCardCatalogIds();
}

function currentCardCatalogCard(cardId) {
  return publishedCardCatalogPublication.cards.find(({ id }) => id === cardId) || null;
}

function cardCatalogNotReadyError() {
  return Object.assign(
    new Error("卡片库未配置：请先由项目所有者添加至少一张正式卡片，再开启含卡片奖励的回合。"),
    { code: "card_catalog_not_ready" },
  );
}

function setCardCatalogStatus(message, state = "") {
  if (!nodes.cardCatalogStatus) return;
  nodes.cardCatalogStatus.textContent = message;
  if (state) nodes.cardCatalogStatus.dataset.state = state;
  else delete nodes.cardCatalogStatus.dataset.state;
}

function cardCatalogBusy() {
  return Boolean(cardCatalogEditor.adding || cardCatalogEditor.uploadingCardId);
}

function cardCatalogImageUrl(card) {
  if (!card?.image?.assetRef) return "";
  const url = new URL(card.image.assetRef, window.location.origin);
  url.searchParams.set("v", card.image.updatedAt);
  return `${url.pathname}${url.search}`;
}

function renderCardCatalogEditor() {
  if (!nodes.cardCatalogList) return;
  const cards = publishedCardCatalogPublication.cards || [];
  const query = cardCatalogEditor.query.trim().toLocaleLowerCase("zh-CN");
  const visibleCards = query
    ? cards.filter((card) => (
      [card.id, card.name, card.story]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(query)
    ))
    : cards;
  const uploadedCount = cards.filter(({ image }) => Boolean(image)).length;
  const ownerReady = Boolean(layoutEditorOwnerUserId && cardCatalogRegistryLoaded);
  const busy = cardCatalogBusy();
  nodes.layoutEditorClose.disabled = Boolean(
    layoutEditor.saving
    || dicePackEditor.saving
    || nodeRewardEditor.saving
    || classroomEventEditor.saving
    || busy
  );
  nodes.cardCatalogCount.textContent = (
    `${cards.length} 张卡片 · ${uploadedCount} 张已有图片 · `
    + `${cards.length - uploadedCount} 张尚未上传`
  );
  nodes.cardCatalogRevision.textContent = publishedCardCatalogPublication.revision
    ? `服务端版本 ${publishedCardCatalogPublication.revision.slice(0, 8)} · 刷新和重新登录后仍会保留`
    : "尚未建立正式卡片目录；只有你新增的卡片才会进入游戏。";
  nodes.cardCatalogAdd.disabled = !ownerReady || busy;
  nodes.cardCatalogNewName.disabled = !ownerReady || busy;
  nodes.cardCatalogNewStory.disabled = !ownerReady || busy;
  nodes.cardCatalogList.setAttribute("aria-busy", String(busy));

  const items = visibleCards.map((card) => {
    const item = document.createElement("article");
    item.className = "card-catalog-item";
    item.setAttribute("role", "listitem");
    item.dataset.cardId = card.id;
    item.dataset.uploading = String(cardCatalogEditor.uploadingCardId === card.id);

    const frame = document.createElement("div");
    frame.className = "card-catalog-image-frame";
    if (card.image) {
      const image = document.createElement("img");
      image.src = cardCatalogImageUrl(card);
      image.alt = `${card.name}卡片图片`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        frame.replaceChildren(textElement("span", "", "图片暂时无法加载"));
      }, { once: true });
      frame.append(image);
    } else {
      frame.append(textElement("span", "", "尚未上传"));
    }

    const body = document.createElement("div");
    body.className = "card-catalog-item-body";
    body.append(
      textElement("strong", "", card.name),
      textElement("p", "", card.story || "尚未填写卡片说明"),
      textElement(
        "span",
        "card-catalog-item-meta",
        `${card.id} · 用户新增`,
      ),
    );
    const uploadLabel = document.createElement("label");
    uploadLabel.className = "card-catalog-upload";
    uploadLabel.dataset.disabled = String(!ownerReady || busy);
    uploadLabel.append(textElement(
      "span",
      "",
      cardCatalogEditor.uploadingCardId === card.id
        ? "正在安全上传…"
        : card.image ? "替换图片" : "上传卡片图片",
    ));
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp";
    fileInput.dataset.cardUploadId = card.id;
    fileInput.setAttribute("aria-label", `${card.name}：${card.image ? "替换" : "上传"}卡片图片`);
    fileInput.disabled = !ownerReady || busy;
    uploadLabel.append(fileInput);
    body.append(uploadLabel);
    item.append(frame, body);
    return item;
  });
  if (items.length) {
    nodes.cardCatalogList.replaceChildren(...items);
  } else {
    nodes.cardCatalogList.replaceChildren(textElement(
      "p",
      "card-catalog-empty",
      cards.length ? "没有找到匹配的卡片。" : "尚未添加卡片。请先新增卡片，再上传正式图片。",
    ));
  }
  if (cardCatalogEditor.error) {
    setCardCatalogStatus(cardCatalogEditor.error, "error");
  } else if (cardCatalogEditor.notice) {
    setCardCatalogStatus(cardCatalogEditor.notice, "success");
  } else if (!layoutEditorOwnerUserId) {
    setCardCatalogStatus("当前是未登录预览；请以项目所有者账号登录后新增卡片或上传图片。", "error");
  } else if (!cardCatalogRegistryLoaded) {
    setCardCatalogStatus("服务端卡片目录尚未载入，请刷新后重试。", "error");
  } else {
    setCardCatalogStatus("选择任意卡片即可上传或替换 PNG、JPEG、WebP 图片；单张不超过 6 MB。", "");
  }
}

function cardCatalogResponseError(payload, fallback) {
  if (payload?.error === "oss_not_configured") {
    return new Error("图片存储尚未配置，卡片目录没有发生变化。");
  }
  if (payload?.error === "card_catalog_revision_conflict") {
    return new Error("卡片目录已在其他页面更新，请刷新后再试。");
  }
  return new Error(payload?.message || fallback);
}

async function createCardCatalogCard(event) {
  event.preventDefault();
  if (!layoutEditorOwnerUserId || cardCatalogBusy()) return;
  const name = nodes.cardCatalogNewName.value.trim();
  const story = nodes.cardCatalogNewStory.value.trim();
  if (!name) {
    nodes.cardCatalogNewName.focus({ preventScroll: true });
    return;
  }
  cardCatalogEditor.adding = true;
  cardCatalogEditor.error = "";
  cardCatalogEditor.notice = "";
  renderCardCatalogEditor();
  try {
    const response = await fetch("/api/admin/card-catalog/v1/cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedUserId: layoutEditorOwnerUserId,
        expectedRevision: publishedCardCatalogPublication.revision,
        card: { name, story },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw cardCatalogResponseError(payload, "新增卡片失败，请重试。");
    if (!applyCardCatalogRegistryPayload(payload)) {
      throw new Error("服务端返回了不兼容的卡片目录。");
    }
    nodes.cardCatalogNewName.value = "";
    nodes.cardCatalogNewStory.value = "";
    cardCatalogEditor.query = "";
    nodes.cardCatalogSearch.value = "";
    const created = publishedCardCatalogPublication.cards.find(({ id }) => id === payload.cardId);
    cardCatalogEditor.notice = `${created?.name || name}已新增；现在可以上传正式卡片图片。`;
  } catch (error) {
    cardCatalogEditor.error = error?.message || "新增卡片失败，请重试。";
  } finally {
    cardCatalogEditor.adding = false;
    renderCardCatalogEditor();
  }
}

function fileAsDataUrl(file) {
  return new Promise((resolveRead, rejectRead) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolveRead(String(reader.result || "")), {
      once: true,
    });
    reader.addEventListener("error", () => rejectRead(new Error("无法读取这张图片。")), {
      once: true,
    });
    reader.readAsDataURL(file);
  });
}

async function uploadCardCatalogImage(cardId, file) {
  if (!layoutEditorOwnerUserId || cardCatalogBusy() || !file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    cardCatalogEditor.error = "只支持 PNG、JPEG 或 WebP 卡片图片，不接受 SVG。";
    renderCardCatalogEditor();
    return;
  }
  if (!file.size || file.size > CARD_CATALOG_IMAGE_MAX_BYTES) {
    cardCatalogEditor.error = "卡片图片不能为空，且单张不能超过 6 MB。";
    renderCardCatalogEditor();
    return;
  }
  cardCatalogEditor.uploadingCardId = cardId;
  cardCatalogEditor.error = "";
  cardCatalogEditor.notice = "";
  renderCardCatalogEditor();
  try {
    const dataUrl = await fileAsDataUrl(file);
    const response = await fetch(
      `/api/admin/card-catalog/v1/cards/${encodeURIComponent(cardId)}/image`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedUserId: layoutEditorOwnerUserId,
          expectedRevision: publishedCardCatalogPublication.revision,
          contentType: file.type,
          dataUrl,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw cardCatalogResponseError(payload, "卡片图片上传失败，请重试。");
    if (!applyCardCatalogRegistryPayload(payload)) {
      throw new Error("服务端返回了不兼容的卡片目录。");
    }
    const card = publishedCardCatalogPublication.cards.find(({ id }) => id === cardId);
    cardCatalogEditor.notice = `${card?.name || "卡片"}的图片已安全保存。`;
  } catch (error) {
    cardCatalogEditor.error = error?.message || "卡片图片上传失败，请重试。";
  } finally {
    cardCatalogEditor.uploadingCardId = null;
    renderCardCatalogEditor();
  }
}

function promoteLegacyWorkingLayouts() {
  if (!layoutEditorOwnerUserId || !boardLayoutRegistryLoaded) return;
  LAYOUT_EDITOR_WORLD_REFS.forEach((worldRef) => {
    if (publishedBoardLayouts.get(worldRef)?.status !== "empty") return;
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    const appliedKey = layoutEditorAppliedStorageKey(worldRef);
    const applied = readNormalizedLocalLayoutDraft(
      composition.board,
      worldRef,
      appliedKey,
    );
    if (applied.draft || !applied.storageAvailable) return;
    const confirmed = confirmedVisualLayout(worldRef, composition.board);
    const legacy = loadLocalAuthoringDraft({
      storageKey: layoutEditorDraftStorageKey(worldRef),
      normalizeDraft: (input) => normalizeBoardLayoutDraft(
        composition.board,
        input,
        { worldRef },
      ),
      sourceRevision: confirmed.revision,
      sourceValue: confirmed.draft,
      cloneDraft: cloneLayoutEditorDraft,
      label: `${worldRef} 布局`,
    });
    if (
      !legacy.draft
      || legacy.staleDraft
      || !legacy.storageAvailable
      || Object.keys(legacy.draft.nodePositions || {}).length === 0
    ) return;
    try {
      localStorage.setItem(appliedKey, JSON.stringify(legacy.draft));
    } catch {
      // The working backup remains intact and can still be exported from the editor.
    }
  });
}

function layoutDraftPositionsEqual(left, right) {
  return JSON.stringify(left?.nodePositions || {})
    === JSON.stringify(right?.nodePositions || {});
}

function layoutDraftRawHash(raw) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function orderedLayoutEditorDraft(draft) {
  if (!draft || !layoutEditor.baseBoard) return draft;
  const nodePositions = {};
  layoutEditor.baseBoard.nodes.forEach((node) => {
    const position = draft.nodePositions?.[node.id];
    if (position) nodePositions[node.id] = { x: position.x, y: position.y };
  });
  return { ...draft, nodePositions };
}

function loadLayoutEditorDraft() {
  if (!layoutEditingAvailable()) return cloneLayoutEditorDraft(layoutEditor.draft);
  const blank = cloneLayoutEditorDraft(layoutEditor.publishedDraft)
    || createBoardLayoutDraft(layoutEditor.baseBoard, {
      worldRef: layoutEditor.worldRef,
    });
  const loaded = loadLocalAuthoringDraft({
    storageKey: layoutEditorDraftStorageKey(layoutEditor.worldRef),
    normalizeDraft: (input) => normalizeBoardLayoutDraft(
      layoutEditor.baseBoard,
      input,
      { worldRef: layoutEditor.worldRef },
    ),
    sourceRevision: layoutEditor.publishedRevision,
    sourceValue: blank,
    cloneDraft: cloneLayoutEditorDraft,
    label: `${layoutEditor.worldRef} 布局`,
  });
  applyLoadedAuthoringDraft(layoutEditor, loaded);
  return orderedLayoutEditorDraft(loaded.draft);
}

function persistLayoutEditorDraft() {
  if (!layoutEditingAvailable() || !layoutEditor.active || !layoutEditor.draft) return false;
  return persistLocalAuthoringDraft({
    editor: layoutEditor,
    storageKey: layoutEditorDraftStorageKey(layoutEditor.worldRef),
    normalizeDraft: (input) => normalizeBoardLayoutDraft(
      layoutEditor.baseBoard,
      input,
      { worldRef: layoutEditor.worldRef },
    ),
    sourceRevision: layoutEditor.publishedRevision,
    sourceValue: layoutEditor.publishedDraft,
  });
}

function persistQaAppliedLayoutEditorDraft() {
  if (!layoutEditor.active || !layoutEditor.draft) return false;
  try {
    localStorage.setItem(
      layoutEditorAppliedStorageKey(layoutEditor.worldRef),
      JSON.stringify(orderedLayoutEditorDraft(layoutEditor.draft)),
    );
    return true;
  } catch {
    layoutEditor.storageAvailable = false;
    return false;
  }
}

async function publishLayoutEditorDraft() {
  if (!layoutEditingAvailable()) throw new Error(boardLayoutRegistryError || "布局配置尚未载入，请刷新重试。");
  const response = await fetch(boardLayoutEndpointForWorld(layoutEditor.worldRef, { admin: true }), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expectedUserId: layoutEditorOwnerUserId,
      expectedRevision: layoutEditor.publishedRevision,
      draft: orderedLayoutEditorDraft(layoutEditor.draft),
    }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.message || "board layout publish failed");
    error.code = payload?.error || payload?.code || `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  if (payload?.schemaVersion !== BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION) {
    throw new Error("board layout publish returned an incompatible schema");
  }
  const publication = normalizeBoardLayoutRegistryEntry(payload.layout);
  if (!publication || publication.status !== "active" || !publication.draft) {
    throw new Error("board layout publish did not return an active layout");
  }
  publishedBoardLayouts.set(publication.worldRef, publication);
  try {
    localStorage.removeItem(layoutEditorAppliedStorageKey(publication.worldRef));
  } catch {
    // A stale local compatibility copy is harmless because server state wins.
  }
  return publication;
}

function layoutEditorBaseNode(nodeId = layoutEditor.selectedNodeId) {
  return layoutEditor.baseBoard?.nodes.find((node) => node.id === nodeId) || null;
}

function layoutEditorVisualNode(nodeId = layoutEditor.selectedNodeId) {
  return nodeById.get(nodeId) || null;
}

function layoutEditorConnectedNodeIds(nodeId = layoutEditor.selectedNodeId) {
  const connected = new Set();
  (layoutEditor.baseBoard?.edges || []).forEach((edge) => {
    if (edge.from === nodeId) connected.add(edge.to);
    if (edge.to === nodeId) connected.add(edge.from);
  });
  return connected;
}

function layoutEditorNodeLabel(node) {
  if (!node) return "未知节点";
  try {
    return activeNodePresentation(
      node.id,
      activeNodeKind(node.id, node.spaceRole),
    ).label;
  } catch {
    return node.label || node.id;
  }
}

function applyLayoutEditorPreview({ fullRender = false } = {}) {
  if (!layoutEditor.active || !layoutEditor.baseBoard || !layoutEditor.draft) return;
  layoutEditor.draft = orderedLayoutEditorDraft(layoutEditor.draft);
  visualBoardTemplate = applyBoardLayoutDraft(
    layoutEditor.baseBoard,
    layoutEditor.draft,
    { worldRef: layoutEditor.worldRef },
  );
  nodeById = new Map(visualBoardTemplate.nodes.map((node) => [node.id, node]));
  layoutEditor.revision += 1;
  if (fullRender) {
    regionArtSceneCache = null;
    renderBoard();
  }
}

function syncLayoutEditorNodeDomState() {
  if (!layoutEditor.active) return;
  const connected = layoutEditorConnectedNodeIds();
  nodes.board.querySelectorAll(".board-space[data-node-id]").forEach((element) => {
    const nodeId = element.dataset.nodeId;
    const selected = nodeId === layoutEditor.selectedNodeId;
    const visual = layoutEditorVisualNode(nodeId);
    const base = layoutEditorBaseNode(nodeId);
    const moved = Boolean(layoutEditor.draft?.nodePositions?.[nodeId]);
    element.classList.toggle("is-layout-editor-selected", selected);
    element.classList.toggle("is-layout-editor-connected", connected.has(nodeId));
    element.classList.toggle("is-layout-editor-moved", moved);
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", selected ? "0" : "-1");
    element.setAttribute("aria-pressed", String(selected));
    element.setAttribute(
      "aria-label",
      `${layoutEditorNodeLabel(base)}，${nodeId}，X ${visual?.x ?? "—"}，`
      + `Y ${visual?.y ?? "—"}${moved ? "，已调整" : "，原位置"}`,
    );
  });
  nodes.board.querySelectorAll("[data-edge-id]").forEach((element) => {
    const edge = visualBoardTemplate.edges.find(({ id }) => id === element.dataset.edgeId);
    element.classList.toggle(
      "is-layout-editor-connected",
      Boolean(edge && (
        edge.from === layoutEditor.selectedNodeId
        || edge.to === layoutEditor.selectedNodeId
      )),
    );
  });
}

function syncLayoutEditorControls({ announce = "" } = {}) {
  if (!layoutEditor.active) return;
  const base = layoutEditorBaseNode();
  const visual = layoutEditorVisualNode();
  const changedCount = Object.keys(layoutEditor.draft?.nodePositions || {}).length;
  const zone = (layoutEditor.baseBoard?.zones || []).find((candidate) => (
    base
    && base.x >= candidate.bounds.x
    && base.x < candidate.bounds.x + candidate.bounds.width
    && base.y >= candidate.bounds.y
    && base.y < candidate.bounds.y + candidate.bounds.height
  ));
  const deltaX = base && visual ? visual.x - base.x : 0;
  const deltaY = base && visual ? visual.y - base.y : 0;
  const distance = Math.hypot(deltaX, deltaY);

  nodes.layoutEditorWorld.value = layoutEditor.worldRef;
  nodes.layoutEditorNode.value = base?.id || "";
  nodes.layoutEditorNodeName.textContent = base
    ? `${base.id} · ${layoutEditorNodeLabel(base)}`
    : "请选择节点";
  nodes.layoutEditorNodeMeta.textContent = base
    ? `${theme.zoneNames?.[zone?.id] || zone?.label || zone?.id || "地图区域"}`
      + ` · ${activeNodeKind(base.id, base.spaceRole)}`
    : "—";
  nodes.layoutEditorX.value = visual?.x ?? "";
  nodes.layoutEditorY.value = visual?.y ?? "";
  nodes.layoutEditorOriginal.textContent = base
    ? `原位置 X ${base.x} / Y ${base.y}`
    : "原位置 X — / Y —";
  nodes.layoutEditorDelta.textContent = `相对原位 ${deltaX >= 0 ? "+" : ""}${deltaX}`
    + ` / ${deltaY >= 0 ? "+" : ""}${deltaY}`;
  nodes.layoutEditorGrid.value = String(layoutEditor.grid);
  nodes.layoutEditorUndo.disabled = layoutEditor.undo.length === 0;
  nodes.layoutEditorRedo.disabled = layoutEditor.redo.length === 0;
  nodes.layoutEditorX.disabled = !layoutEditor.storageAvailable;
  nodes.layoutEditorY.disabled = !layoutEditor.storageAvailable;
  nodes.layoutEditorResetNode.disabled = (
    !layoutEditor.storageAvailable
    || !layoutEditor.draft?.nodePositions?.[base?.id]
  );
  nodes.layoutEditorResetWorld.disabled = (
    !layoutEditor.storageAvailable || changedCount === 0
  );
  nodes.layoutEditorCopy.disabled = (
    !layoutEditor.storageAvailable || changedCount === 0
  );
  nodes.layoutEditorDownload.disabled = (
    !layoutEditor.storageAvailable || changedCount === 0
  );
  const publishRequired = Boolean(
    layoutEditorOwnerUserId
    && layoutEditor.publicationSource !== "server"
    && Object.keys(layoutEditor.draft?.nodePositions || {}).length > 0,
  );
  const draftMatchesPublished = layoutDraftPositionsEqual(
    layoutEditor.draft,
    layoutEditor.publishedDraft,
  );
  const saveState = layoutEditor.saving
    ? "saving"
    : !layoutEditor.storageAvailable || layoutEditor.publishError
    ? "error"
    : !draftMatchesPublished || publishRequired
      ? "dirty"
      : "saved";
  nodes.layoutEditorSaveBar.dataset.saveState = saveState;
  nodes.layoutEditorSaveBar.setAttribute("aria-busy", String(layoutEditor.saving));
  nodes.layoutEditorSave.disabled = (
    layoutEditor.saving || !layoutEditor.storageAvailable || !layoutEditingAvailable()
  );
  nodes.layoutEditorClose.disabled = (
    layoutEditor.saving
    || dicePackEditor.saving
    || nodeRewardEditor.saving
    || classroomEventEditor.saving
  );
  if (saveState === "saving") {
    nodes.layoutEditorSaveState.textContent = "正在保存并应用到棋盘…";
  } else if (saveState === "error") {
    nodes.layoutEditorSaveState.textContent = layoutEditor.publishError
      || "保存失败，当前调整尚未应用，请重试。";
  } else if (saveState === "dirty") {
    nodes.layoutEditorSaveState.textContent = layoutEditor.publicationSource === "legacy-local"
      ? "已恢复旧版保存布局；请再次保存，将它应用到正式棋盘。"
      : "有未应用的调整；工作备份已开启，请点击保存并应用。";
  } else if (layoutEditor.lastSavedAt) {
    nodes.layoutEditorSaveState.textContent = (
      layoutEditor.publicationSource === "server"
        ? `已于 ${layoutEditor.lastSavedAt} 保存，已应用到正式棋盘；退出或刷新仍会保留。`
        : `已于 ${layoutEditor.lastSavedAt} 保存并应用到当前测试浏览器。`
    );
  } else if (changedCount > 0) {
    nodes.layoutEditorSaveState.textContent = layoutEditor.publicationSource === "server"
      ? "已载入正式棋盘当前使用的节点布局。"
      : "已载入当前浏览器的测试布局。";
  } else {
    nodes.layoutEditorSaveState.textContent = "当前世界使用布局契约中的原始节点位置。";
  }
  nodes.layoutEditorChangedCount.textContent = changedCount
    ? `布局草稿 · 已调整 ${changedCount} 个节点`
    : "布局草稿 · 尚未调整节点";
  nodes.layoutEditorWarning.hidden = false;
  if (!layoutEditor.storageAvailable) {
    nodes.layoutEditorWarning.textContent = layoutEditor.draftNotice
      || "浏览器自动保存不可用；已阻止编辑、导出与发布。";
  } else if (layoutEditor.staleDraft) {
    nodes.layoutEditorWarning.textContent = layoutEditor.draftNotice
      || "检测到不匹配的旧版草稿，已备份且未自动合并。";
  } else if (distance > 28) {
    nodes.layoutEditorWarning.textContent = (
      `已偏移 ${Math.round(distance)} px，请重新检查道路与背景贴合。`
    );
  } else {
    nodes.layoutEditorWarning.hidden = true;
    nodes.layoutEditorWarning.textContent = "";
  }
  if (announce) nodes.layoutEditorStatus.textContent = announce;
  syncLayoutEditorNodeDomState();
}

function populateLayoutEditorWorldOptions() {
  const options = LAYOUT_EDITOR_WORLD_REFS.map((worldRef) => {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    return new Option(composition.worldPack.title, worldRef);
  });
  nodes.layoutEditorWorld.replaceChildren(...options);
}

function populateLayoutEditorNodeOptions() {
  const options = (layoutEditor.baseBoard?.nodes || []).map((node) => (
    new Option(`${node.id} · ${layoutEditorNodeLabel(node)}`, node.id)
  ));
  nodes.layoutEditorNode.replaceChildren(...options);
}

function selectLayoutEditorNode(nodeId, { focus = false, renderScene = true } = {}) {
  if (!layoutEditor.active || !layoutEditorBaseNode(nodeId)) return;
  layoutEditor.selectedNodeId = nodeId;
  if (renderScene) {
    regionArtSceneCache = null;
    renderBoard();
  }
  syncLayoutEditorControls();
  if (layoutEditor.activePane === "events") {
    classroomEventEditor.selectedNodeId = nodeId;
    syncClassroomEventEditorControls();
  }
  if (focus) {
    nodes.board.querySelector(`.board-space[data-node-id="${CSS.escape(nodeId)}"]`)
      ?.focus({ preventScroll: true });
  }
}

function switchLayoutEditorWorld(worldRef) {
  if (!layoutEditor.active || !LAYOUT_EDITOR_WORLD_REFS.includes(worldRef)) return;
  if (!layoutEditingAvailable()) { renderLayoutRegistryStatus(); return; }
  if (layoutEditor.gesture) cancelLayoutNodeGesture({ restore: true });
  cancelBoardPan();
  const composition = activateWorldComposition(worldRef, { resetCamera: true });
  layoutEditor.worldRef = composition.worldRef;
  layoutEditor.baseBoard = activeBoardTemplate;
  const confirmed = confirmedVisualLayout(
    layoutEditor.worldRef,
    layoutEditor.baseBoard,
  );
  layoutEditor.publishedDraft = cloneLayoutEditorDraft(confirmed.draft);
  layoutEditor.publishedRevision = confirmed.revision;
  layoutEditor.publicationSource = confirmed.source;
  layoutEditor.draft = loadLayoutEditorDraft();
  layoutEditor.undo = [];
  layoutEditor.redo = [];
  layoutEditor.lastSavedAt = "";
  layoutEditor.exportedRevision = 0;
  layoutEditor.publishError = "";
  layoutEditor.saving = false;
  runtime = createPrototypeRuntime();
  movingTeamId = null;
  visualNodeId = null;
  fairyState = createFairyState();
  visitedNodeIds = new Set([activeBoardTemplate.startNodeId]);
  applyLayoutEditorPreview();
  layoutEditor.savedRevision = layoutDraftPositionsEqual(
    layoutEditor.draft,
    layoutEditor.publishedDraft,
  ) ? layoutEditor.revision : Math.max(0, layoutEditor.revision - 1);
  camera = initialBoardCamera();
  layoutEditor.selectedNodeId = visualBoardTemplate.nodes[0]?.id || null;
  populateLayoutEditorNodeOptions();
  applyTheme();
  regionArtSceneCache = null;
  renderBoard();
  syncLayoutEditorControls({
    announce: `${composition.worldPack.title}布局草稿已打开`,
  });
}

function openLayoutEditor() {
  if (!layoutEditingAvailable()) { renderLayoutRegistryStatus(); return; }
  if (
    !layoutEditorAuthorized
    || layoutEditor.active
    || gameSession
    || busy
    || sentenceListener
    || pendingSpeechDecision
    || pendingDiceChoice
    || pendingRouteChoice
  ) {
    return;
  }
  layoutEditor.restore = {
    activeWorldComposition,
    activeBoardTemplate,
    activeLevelPack,
    theme,
    runtime,
    visitedNodeIds: new Set(visitedNodeIds),
    fairyState,
    camera: { ...camera },
  };
  layoutEditor.active = true;
  layoutEditor.tool = "node";
  nodes.runtimeShell.dataset.layoutEditorActive = "true";
  nodes.runtimeShell.dataset.layoutEditorTool = "node";
  nodes.layoutEditorPanel.hidden = false;
  nodes.layoutEditorNodeMode.setAttribute("aria-pressed", "true");
  nodes.layoutEditorPanMode.setAttribute("aria-pressed", "false");
  nodes.dicePackEditorFamily.replaceChildren(...DICE_PACK_FAMILY_IDS.map((familyId) => (
    new Option(DICE_FAMILY_META[familyId]?.label || familyId, familyId)
  )));
  loadDicePackEditorDraft();
  loadNodeRewardEditorDraft();
  loadClassroomEventEditorDraft();
  populateLayoutEditorWorldOptions();
  switchLayoutEditorWorld(CLOUD_HARBOR_WORLD_REF);
  resetNodeAuthoringExchangeEditor();
  setLayoutEditorTab("nodes");
  nodes.layoutEditorTitle.focus({ preventScroll: true });
}

function cancelLayoutNodeGesture({ restore = true } = {}) {
  const gesture = layoutEditor.gesture;
  if (!gesture) return;
  if (gesture.frameRequest) cancelAnimationFrame(gesture.frameRequest);
  layoutEditor.gesture = null;
  nodes.boardViewport.classList.remove("is-node-dragging");
  if (nodes.boardViewport.hasPointerCapture(gesture.pointerId)) {
    nodes.boardViewport.releasePointerCapture(gesture.pointerId);
  }
  if (restore) {
    layoutEditor.draft = cloneLayoutEditorDraft(gesture.startDraft);
    applyLayoutEditorPreview({ fullRender: true });
    syncLayoutEditorControls({ announce: "已取消本次拖动" });
  }
}

function closeLayoutEditor() {
  if (
    !layoutEditor.active
    || layoutEditor.saving
    || dicePackEditor.saving
    || nodeRewardEditor.saving
    || classroomEventEditor.saving
    || cardCatalogBusy()
  ) return;
  cancelLayoutNodeGesture({ restore: true });
  cancelBoardPan();
  persistLayoutEditorDraft();
  persistDicePackEditorDraft();
  persistNodeRewardEditorDraft();
  persistClassroomEventEditorDraft();
  const restore = layoutEditor.restore;
  layoutEditor.active = false;
  layoutEditor.baseBoard = null;
  layoutEditor.draft = null;
  layoutEditor.selectedNodeId = null;
  layoutEditor.undo = [];
  layoutEditor.redo = [];
  layoutEditor.restore = null;
  layoutEditor.publishedDraft = null;
  layoutEditor.publishedRevision = null;
  layoutEditor.publicationSource = "base";
  layoutEditor.saving = false;
  layoutEditor.publishError = "";
  dicePackEditor.draft = null;
  dicePackEditor.publishedPack = null;
  dicePackEditor.publishedRevision = null;
  dicePackEditor.saving = false;
  dicePackEditor.publishError = "";
  nodeRewardEditor.draft = null;
  nodeRewardEditor.publishedPack = null;
  nodeRewardEditor.publishedRevision = null;
  nodeRewardEditor.saving = false;
  nodeRewardEditor.publishError = "";
  classroomEventEditor.draft = null;
  classroomEventEditor.publishedProgram = null;
  classroomEventEditor.publishedRevision = null;
  classroomEventEditor.saving = false;
  classroomEventEditor.publishError = "";
  cardCatalogEditor.adding = false;
  cardCatalogEditor.uploadingCardId = null;
  cardCatalogEditor.query = "";
  cardCatalogEditor.error = "";
  cardCatalogEditor.notice = "";
  nodeAuthoringExchangeEditor.baseline = null;
  nodeAuthoringExchangeEditor.candidate = null;
  nodeAuthoringExchangeEditor.diff = null;
  nodeAuthoringExchangeEditor.projected = null;
  nodeAuthoringExchangeEditor.generatedText = "";
  nodeAuthoringExchangeEditor.inputFingerprint = "";
  nodeAuthoringExchangeEditor.scopeSnapshot = null;
  delete nodes.runtimeShell.dataset.layoutEditorActive;
  delete nodes.runtimeShell.dataset.layoutEditorTool;
  delete nodes.runtimeShell.dataset.layoutEditorPane;
  nodes.layoutEditorPanel.hidden = true;
  nodes.layoutEditorExportText.hidden = true;
  nodes.nodeAuthoringExchangeOutput.value = "";
  nodes.nodeAuthoringExchangeInput.value = "";
  nodes.nodeAuthoringExchangeDiff.hidden = true;
  nodes.cardCatalogSearch.value = "";
  if (restore) {
    activeWorldComposition = restore.activeWorldComposition;
    activeBoardTemplate = restore.activeBoardTemplate;
    activeLevelPack = restore.activeLevelPack;
    applyConfirmedVisualBoard(activeWorldComposition.worldRef);
    theme = restore.theme;
    runtime = restore.runtime;
    visitedNodeIds = restore.visitedNodeIds;
    fairyState = restore.fairyState;
    camera = restore.camera;
  }
  regionArtSceneCache = null;
  render();
  const nextUrl = new URL(window.location.href);
  if (nextUrl.searchParams.has("layoutEditor")) {
    nextUrl.searchParams.delete("layoutEditor");
    window.history.replaceState(null, "", nextUrl);
  }
  const returnTarget = nodes.layoutEditorOpen.hidden
    ? nodes.gameAuthoringOpen
    : nodes.layoutEditorOpen;
  returnTarget?.focus({ preventScroll: true });
}

function setLayoutEditorTool(tool) {
  if (!layoutEditor.active || !["node", "pan"].includes(tool)) return;
  if (layoutEditor.gesture) cancelLayoutNodeGesture({ restore: true });
  layoutEditor.tool = tool;
  nodes.runtimeShell.dataset.layoutEditorTool = tool;
  nodes.layoutEditorNodeMode.setAttribute("aria-pressed", String(tool === "node"));
  nodes.layoutEditorPanMode.setAttribute("aria-pressed", String(tool === "pan"));
  nodes.layoutEditorStatus.textContent = tool === "node"
    ? "移动节点模式"
    : "移动地图模式";
}

async function saveLayoutEditorDraft() {
  if (!layoutEditor.active || !layoutEditor.draft || layoutEditor.saving) return;
  if (!layoutEditingAvailable()) {
    layoutEditor.publishError = boardLayoutRegistryError || "布局配置尚未载入，请刷新重试。";
    syncLayoutEditorControls({ announce: layoutEditor.publishError });
    return;
  }
  if (!persistLayoutEditorDraft()) {
    syncLayoutEditorControls({
      announce: "布局草稿保存失败，请复制或下载后重试",
    });
    return;
  }
  layoutEditor.saving = true;
  layoutEditor.publishError = "";
  syncLayoutEditorControls();
  try {
    if (layoutEditorOwnerUserId) {
      const publication = await publishLayoutEditorDraft();
      layoutEditor.publishedRevision = publication.revision;
      layoutEditor.publicationSource = "server";
      layoutEditor.publishedDraft = cloneLayoutEditorDraft(publication.draft);
    } else if (qaControlsEnabled && QA_PAGE_REQUESTED) {
      if (!persistQaAppliedLayoutEditorDraft()) {
        throw new Error("测试布局无法保存到当前浏览器");
      }
      layoutEditor.publishedRevision = null;
      layoutEditor.publicationSource = "qa-local";
      layoutEditor.publishedDraft = cloneLayoutEditorDraft(layoutEditor.draft);
    } else {
      throw new Error("只有项目所有者可以将布局应用到正式棋盘");
    }
    bindEditorDraftSource(
      layoutEditor,
      layoutEditor.publishedRevision,
      layoutEditor.publishedDraft,
    );
    layoutEditor.draftNotice = "";
    persistLayoutEditorDraft();
    layoutEditor.savedRevision = layoutEditor.revision;
    layoutEditor.lastSavedAt = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    syncLayoutEditorControls({
      announce: layoutEditor.publicationSource === "server"
        ? "当前世界布局已保存并应用到正式棋盘"
        : "当前世界测试布局已保存并应用",
    });
  } catch (error) {
    layoutEditor.publishError = error?.status === 409
      ? "布局已在其他页面更新，请刷新后重试；当前调整仍在工作备份中。"
      : "保存失败，当前调整尚未应用，请重试。";
    syncLayoutEditorControls({ announce: layoutEditor.publishError });
  } finally {
    layoutEditor.saving = false;
    syncLayoutEditorControls();
  }
}

function recordLayoutEditorChange(before, after, announcement) {
  if (!layoutEditor.storageAvailable) return false;
  const normalizedAfter = orderedLayoutEditorDraft(after);
  if (!before || !normalizedAfter || layoutDraftPositionsEqual(before, normalizedAfter)) {
    syncLayoutEditorControls();
    return false;
  }
  layoutEditor.draft = cloneLayoutEditorDraft(normalizedAfter);
  layoutEditor.publishError = "";
  layoutEditor.undo.push({
    before: cloneLayoutEditorDraft(before),
    after: cloneLayoutEditorDraft(normalizedAfter),
  });
  layoutEditor.redo = [];
  applyLayoutEditorPreview({ fullRender: true });
  persistLayoutEditorDraft();
  syncLayoutEditorControls({ announce: announcement });
  return true;
}

function setLayoutEditorNodePosition(nodeId, position, {
  grid = 1,
  announce = true,
} = {}) {
  if (
    !layoutEditor.active
    || !layoutEditor.storageAvailable
    || !layoutEditorBaseNode(nodeId)
  ) return false;
  const before = cloneLayoutEditorDraft(layoutEditor.draft);
  const after = updateBoardLayoutDraft(
    layoutEditor.baseBoard,
    before,
    nodeId,
    position,
    { worldRef: layoutEditor.worldRef, grid },
  );
  const target = after.nodePositions[nodeId] || layoutEditorBaseNode(nodeId);
  return recordLayoutEditorChange(
    before,
    after,
    announce
      ? `${layoutEditorNodeLabel(layoutEditorBaseNode(nodeId))} ${nodeId} 已移动到 X ${target.x}，Y ${target.y}`
      : "",
  );
}

function nudgeLayoutEditorNode(deltaX, deltaY, { step = layoutEditor.grid } = {}) {
  const current = layoutEditorVisualNode();
  if (!current) return;
  setLayoutEditorNodePosition(
    current.id,
    { x: current.x + (deltaX * step), y: current.y + (deltaY * step) },
  );
}

function undoLayoutEditorChange() {
  const entry = layoutEditor.undo.pop();
  if (!entry) return;
  layoutEditor.redo.push(entry);
  layoutEditor.draft = cloneLayoutEditorDraft(entry.before);
  layoutEditor.publishError = "";
  applyLayoutEditorPreview({ fullRender: true });
  persistLayoutEditorDraft();
  syncLayoutEditorControls({ announce: "已撤销上一次节点调整" });
}

function redoLayoutEditorChange() {
  const entry = layoutEditor.redo.pop();
  if (!entry) return;
  layoutEditor.undo.push(entry);
  layoutEditor.draft = cloneLayoutEditorDraft(entry.after);
  layoutEditor.publishError = "";
  applyLayoutEditorPreview({ fullRender: true });
  persistLayoutEditorDraft();
  syncLayoutEditorControls({ announce: "已重做节点调整" });
}

function resetSelectedLayoutEditorNode() {
  const base = layoutEditorBaseNode();
  if (!base) return;
  setLayoutEditorNodePosition(base.id, { x: base.x, y: base.y });
}

function resetLayoutEditorWorld() {
  if (!layoutEditor.active) return;
  const before = cloneLayoutEditorDraft(layoutEditor.draft);
  const after = createBoardLayoutDraft(layoutEditor.baseBoard, {
    worldRef: layoutEditor.worldRef,
  });
  recordLayoutEditorChange(before, after, "已重置本世界的全部节点调整");
}

function layoutEditorExportText() {
  const payload = boardLayoutExport(
    layoutEditor.baseBoard,
    layoutEditor.draft,
    { worldRef: layoutEditor.worldRef },
  );
  return payload ? `${JSON.stringify(payload, null, 2)}\n` : "";
}

function showLayoutEditorExportFallback(text) {
  nodes.layoutEditorExportText.value = text;
  nodes.layoutEditorExportText.hidden = false;
  nodes.layoutEditorExportText.focus({ preventScroll: true });
  nodes.layoutEditorExportText.select();
}

async function copyLayoutEditorExport() {
  const text = layoutEditorExportText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    layoutEditor.exportedRevision = layoutEditor.revision;
    nodes.layoutEditorStatus.textContent = "布局调整 JSON 已复制";
  } catch {
    showLayoutEditorExportFallback(text);
    nodes.layoutEditorStatus.textContent = "请从文本框手动复制布局调整 JSON";
  }
}

function downloadLayoutEditorExport() {
  const text = layoutEditorExportText();
  if (!text) return;
  const anchor = document.createElement("a");
  const blobUrl = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const safeBoardRef = `${layoutEditor.baseBoard.id}-${layoutEditor.baseBoard.version}`
    .replace(/[^a-zA-Z0-9_.-]/g, "-");
  anchor.href = blobUrl;
  anchor.download = `${safeBoardRef}-layout-draft.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  layoutEditor.exportedRevision = layoutEditor.revision;
  nodes.layoutEditorStatus.textContent = "布局草稿已下载";
}

function nodeAuthoringExchangeRegistriesReady() {
  const registriesReady = Boolean(
    (
      boardLayoutRegistryLoaded
      && nodeRewardPackRegistryLoaded
    )
    || (qaControlsEnabled && QA_PAGE_REQUESTED)
  );
  if (!registriesReady || !layoutEditor.active) return registriesReady;
  return Boolean(
    layoutEditor.storageAvailable
    && nodeRewardEditor.storageAvailable
    && editorDraftSourceMatches(
      layoutEditor,
      layoutEditor.publishedRevision,
      layoutEditor.publishedDraft,
    )
    && editorDraftSourceMatches(
      nodeRewardEditor,
      nodeRewardEditor.publishedRevision,
      nodeRewardEditor.publishedPack,
    )
  );
}

function workingNodeAuthoringLayoutDraft(worldRef) {
  const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  if (
    layoutEditor.active
    && layoutEditor.worldRef === worldRef
    && layoutEditor.draft
  ) {
    if (!editorDraftSourceMatches(
      layoutEditor,
      layoutEditor.publishedRevision,
      layoutEditor.publishedDraft,
    )) {
      throw new Error(`${worldRef} 的布局草稿来源已过期，已阻止交换`);
    }
    const activeDraft = normalizeBoardLayoutDraft(
      composition.board,
      layoutEditor.draft,
      { worldRef },
    );
    if (activeDraft) return activeDraft;
  }
  const confirmed = confirmedVisualLayout(worldRef, composition.board);
  const local = loadLocalAuthoringDraft({
    storageKey: layoutEditorDraftStorageKey(worldRef),
    normalizeDraft: (input) => normalizeBoardLayoutDraft(
      composition.board,
      input,
      { worldRef },
    ),
    sourceRevision: confirmed.revision,
    sourceValue: confirmed.draft,
    cloneDraft: cloneLayoutEditorDraft,
    label: `${worldRef} 布局`,
  });
  if (!local.storageAvailable) {
    throw new Error(`${worldRef} 的本地布局草稿无法读取，已阻止交换`);
  }
  if (local.staleDraft) {
    throw new Error(
      `${worldRef} 的过期布局草稿已备份且未合并；`
      + "当前已换成最新发布版，请再次生成交换 JSON。",
    );
  }
  return local.draft;
}

function nodeAuthoringExchangeSourceOptions() {
  if (
    !layoutEditor.active
    || !nodeRewardEditor.draft
  ) {
    throw new Error("节点编辑草稿尚未准备好，请退出后重新进入编辑器");
  }
  if (!nodeAuthoringExchangeRegistriesReady()) {
    throw new Error("正式配置尚未完整载入，已阻止生成可能过期的交换 JSON");
  }
  if (
    !editorDraftSourceMatches(
      nodeRewardEditor,
      nodeRewardEditor.publishedRevision,
      nodeRewardEditor.publishedPack,
    )
  ) {
    throw new Error("节点奖励草稿的来源发布版已过期，已阻止交换");
  }
  return {
    boardLayoutDrafts: Object.fromEntries(
      NODE_AUTHORING_WORLD_REFS.map((worldRef) => [
        worldRef,
        workingNodeAuthoringLayoutDraft(worldRef),
      ]),
    ),
    nodeRewardPack: nodeRewardEditor.draft,
    revisions: {
      boardLayouts: Object.fromEntries(
        NODE_AUTHORING_WORLD_REFS.map((worldRef) => [
          worldRef,
          publishedBoardLayouts.get(worldRef)?.revision || null,
        ]),
      ),
      nodeRewardPack: nodeRewardEditor.publishedRevision,
    },
  };
}

function currentNodeAuthoringExchange() {
  return createNodeAuthoringExchange(nodeAuthoringExchangeSourceOptions());
}

function setNodeAuthoringExchangeStatus(message, state = "") {
  nodes.nodeAuthoringExchangeStatus.textContent = message;
  if (state) nodes.nodeAuthoringExchangeStatus.dataset.state = state;
  else delete nodes.nodeAuthoringExchangeStatus.dataset.state;
}

function resetNodeAuthoringExchangePreview() {
  nodeAuthoringExchangeEditor.candidate = null;
  nodeAuthoringExchangeEditor.diff = null;
  nodeAuthoringExchangeEditor.projected = null;
  nodeAuthoringExchangeEditor.inputFingerprint = "";
  nodes.nodeAuthoringExchangeDiff.hidden = true;
  nodes.nodeAuthoringExchangeDiffSummary.textContent = "尚未解析";
  nodes.nodeAuthoringExchangeDiffList.replaceChildren();
  nodes.nodeAuthoringExchangeApply.textContent = "应用到编辑草稿";
  nodes.nodeAuthoringExchangeApply.disabled = true;
}

function resetNodeAuthoringExchangeEditor() {
  nodeAuthoringExchangeEditor.baseline = null;
  nodeAuthoringExchangeEditor.generatedText = "";
  nodeAuthoringExchangeEditor.scopeSnapshot = null;
  nodes.nodeAuthoringExchangeOutput.value = "";
  nodes.nodeAuthoringExchangeInput.value = "";
  resetNodeAuthoringExchangePreview();
  setNodeAuthoringExchangeStatus("先生成当前配置，或粘贴 Codex 返回的 JSON。");
  syncNodeAuthoringExchangeEditor();
}

function nodeAuthoringExchangeBusy() {
  return Boolean(
    layoutEditor.saving
    || dicePackEditor.saving
    || nodeRewardEditor.saving
  );
}

function syncNodeAuthoringExchangeEditor() {
  const ready = nodeAuthoringExchangeRegistriesReady();
  const locked = nodeAuthoringExchangeBusy();
  const hasInput = nodes.nodeAuthoringExchangeInput.value.trim().length > 0;
  const hasPreview = Boolean(
    nodeAuthoringExchangeEditor.diff
    && nodeAuthoringExchangeEditor.projected
  );
  nodes.nodeAuthoringExchangeGenerate.disabled = !ready || locked;
  nodes.nodeAuthoringExchangeCopy.disabled = (
    !nodeAuthoringExchangeEditor.generatedText
    || locked
  );
  nodes.nodeAuthoringExchangePreview.disabled = !ready || locked || !hasInput;
  nodes.nodeAuthoringExchangeApply.disabled = !(
    ready
    && !locked
    && hasPreview
    && nodeAuthoringExchangeEditor.diff.changes.length > 0
  );
  if (!ready) {
    setNodeAuthoringExchangeStatus(
      "正式布局或节点奖励没有完整载入；为了避免覆盖新版本，当前禁止交换 JSON。",
      "error",
    );
  }
}

function generateNodeAuthoringExchange() {
  nodeAuthoringExchangeEditor.baseline = null;
  nodeAuthoringExchangeEditor.generatedText = "";
  nodeAuthoringExchangeEditor.scopeSnapshot = null;
  nodes.nodeAuthoringExchangeOutput.value = "";
  resetNodeAuthoringExchangePreview();
  try {
    const baseline = currentNodeAuthoringExchange();
    const scopeSnapshot = captureNodeAuthoringExchangeScope();
    const text = `${JSON.stringify(baseline, null, 2)}\n`;
    nodeAuthoringExchangeEditor.baseline = baseline;
    nodeAuthoringExchangeEditor.scopeSnapshot = scopeSnapshot;
    nodeAuthoringExchangeEditor.generatedText = text;
    nodes.nodeAuthoringExchangeOutput.value = text;
    setNodeAuthoringExchangeStatus(
      "完整地图配置已生成。复制给 Codex 后，只让它修改你指定的节点字段。",
      "success",
    );
  } catch (error) {
    setNodeAuthoringExchangeStatus(
      error?.message || "交换 JSON 生成失败，请重新进入编辑器",
      "error",
    );
  }
  syncNodeAuthoringExchangeEditor();
}

function captureNodeAuthoringExchangeScope() {
  const scope = ["current-node", "current-world", "all-worlds"].includes(
    nodes.nodeAuthoringExchangeScope.value,
  ) ? nodes.nodeAuthoringExchangeScope.value : "current-world";
  return Object.freeze({
    scope,
    worldRef: layoutEditor.worldRef,
    nodeId: layoutEditor.selectedNodeId,
  });
}

function nodeAuthoringExchangeScopeInstruction(
  snapshot = nodeAuthoringExchangeEditor.scopeSnapshot,
) {
  const scope = snapshot?.scope || "current-world";
  const nodeRef = `${snapshot?.worldRef}#${snapshot?.nodeId}`;
  if (scope === "current-node") {
    return `只修改节点 ${nodeRef}；交换文件仍须完整保留其他世界与节点。`;
  }
  if (scope === "current-world") {
    return `只修改世界 ${snapshot?.worldRef} 中我点名的节点；交换文件仍须完整保留另一个世界。`;
  }
  return "可以修改我在后续自然语言中点名的任意世界节点。";
}

function assertNodeAuthoringExchangeScope(diff, snapshot) {
  if (!snapshot) throw new Error("修改范围尚未锁定，请重新生成或预览");
  if (diff.changes.some((change) => change.group === "reward")) {
    throw new Error("历史 reward 字段只读，已阻止修改旧奖励。这里只能修改 placement；家园积分使用独立规则。");
  }
  if (diff.changes.some((change) => change.group !== "placement")) {
    throw new Error("交换 JSON 只允许修改 placement 坐标。");
  }
  const outside = diff.changes.find((change) => {
    if (snapshot.scope === "all-worlds") return false;
    if (change.worldRef !== snapshot.worldRef) return true;
    return snapshot.scope === "current-node" && change.nodeId !== snapshot.nodeId;
  });
  if (!outside) return;
  const allowed = snapshot.scope === "current-node"
    ? `${snapshot.worldRef}#${snapshot.nodeId}`
    : snapshot.worldRef;
  const focusLabel = snapshot.scope === "current-node"
    ? "超出当前节点修改焦点"
    : "超出当前世界修改焦点";
  throw new Error(
    `${focusLabel}：Codex 返回了范围外修改 ${outside.worldRef}#${outside.nodeId}；`
    + `当前生成时锁定范围为 ${allowed}，已阻止应用。`,
  );
}

function nodeAuthoringExchangeCodexPrompt() {
  return [
    "请根据我接下来给出的自然语言要求，编辑这份棋盘节点 authoring JSON。",
    `修改焦点：${nodeAuthoringExchangeScopeInstruction()}`,
    "严格规则：",
    "1. 最终只返回一份完整、可解析的 JSON，不要返回 patch，不要省略未修改节点。",
    "2. 只能修改 schema 标记为可编辑的 placement。reward 是历史只读字段，必须保留原值；家园积分不通过此 JSON 配置。",
    "3. 不得修改 base、只读节点语义、资源池、路线、固定 Trigger、评分、骰池、步数或移动规则。",
    "4. 不确定时保留原值；不要发明 worldRef 或 nodeId。",
    "",
    nodeAuthoringExchangeEditor.generatedText.trim(),
    "",
  ].join("\n");
}

async function copyNodeAuthoringExchangeForCodex() {
  if (!nodeAuthoringExchangeEditor.generatedText) return;
  const prompt = nodeAuthoringExchangeCodexPrompt();
  try {
    await navigator.clipboard.writeText(prompt);
    setNodeAuthoringExchangeStatus(
      "已复制完整 JSON 与保护规则；现在可以在 Codex 里补充你的节点修改要求。",
      "success",
    );
  } catch {
    nodes.nodeAuthoringExchangeOutput.value = prompt;
    nodes.nodeAuthoringExchangeOutput.focus({ preventScroll: true });
    nodes.nodeAuthoringExchangeOutput.select();
    setNodeAuthoringExchangeStatus(
      "浏览器没有允许自动复制；请从上方文本框手动复制完整内容。",
      "error",
    );
  }
}

function parseNodeAuthoringExchangeText(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) throw new Error("请先粘贴 Codex 返回的完整 JSON");
  if (new TextEncoder().encode(trimmed).byteLength > NODE_AUTHORING_EXCHANGE_MAX_BYTES) {
    throw new Error("交换 JSON 超过 512 KB，已阻止解析");
  }
  let source = trimmed;
  if (source.startsWith("```")) {
    const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(source);
    if (!fenced) throw new Error("JSON 代码围栏没有完整闭合");
    source = fenced[1].trim();
  }
  try {
    return { source, value: JSON.parse(source) };
  } catch {
    throw new Error("JSON 格式无法解析，请让 Codex 返回完整 JSON 而不是说明文字");
  }
}

function nodeAuthoringExchangeValueLabel(value) {
  if (value === "") return "空";
  if (value === null) return "null";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function renderNodeAuthoringExchangeDiff(diff) {
  const groups = new Map();
  diff.changes.forEach((change) => {
    const key = [
      change.worldRef,
      change.nodeId,
      change.group,
      change.learningRef || "",
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(change);
  });
  const changedNodes = new Set(
    diff.changes.map(({ worldRef, nodeId }) => `${worldRef}#${nodeId}`),
  );
  const groupLabels = {
    placement: "节点坐标",
    reward: "节点奖励",
  };
  const rows = [...groups.values()].map((changes) => {
    const first = changes[0];
    const composition = resolveWorldComposition(first.worldRef, WORLD_REGISTRIES);
    const item = document.createElement("li");
    const heading = document.createElement("strong");
    heading.textContent = (
      `${composition.worldPack.title} · ${first.nodeId} · `
      + `${groupLabels[first.group] || first.group}`
      + `${first.learningRef ? ` · ${first.learningRef}` : ""}`
    );
    const details = document.createElement("span");
    details.textContent = changes.map((change) => (
      `${change.field}: ${nodeAuthoringExchangeValueLabel(change.before)}`
      + ` → ${nodeAuthoringExchangeValueLabel(change.after)}`
    )).join("；");
    item.append(heading, details);
    return item;
  });
  nodes.nodeAuthoringExchangeDiffList.replaceChildren(...rows);
  nodes.nodeAuthoringExchangeDiffSummary.textContent = diff.changes.length
    ? `${changedNodes.size} 个节点 · ${diff.changes.length} 个字段`
    : "与当前草稿完全一致";
  nodes.nodeAuthoringExchangeApply.textContent = diff.changes.length
    ? `应用 ${diff.changes.length} 项到编辑草稿`
    : "没有需要应用的修改";
  nodes.nodeAuthoringExchangeDiff.hidden = false;
}

function previewNodeAuthoringExchange() {
  resetNodeAuthoringExchangePreview();
  const scopeSnapshot = nodeAuthoringExchangeEditor.scopeSnapshot
    || captureNodeAuthoringExchangeScope();
  nodeAuthoringExchangeEditor.scopeSnapshot = scopeSnapshot;
  try {
    const parsed = parseNodeAuthoringExchangeText(
      nodes.nodeAuthoringExchangeInput.value,
    );
    const baseline = currentNodeAuthoringExchange();
    const candidate = normalizeNodeAuthoringExchange(parsed.value, {
      expectedBase: baseline.base,
    });
    const diff = diffNodeAuthoringExchanges(baseline, candidate, {
      expectedBase: baseline.base,
    });
    assertNodeAuthoringExchangeScope(diff, scopeSnapshot);
    const projected = projectNodeAuthoringExchange(candidate, {
      expectedBase: baseline.base,
    });
    nodeAuthoringExchangeEditor.baseline = baseline;
    nodeAuthoringExchangeEditor.candidate = candidate;
    nodeAuthoringExchangeEditor.diff = diff;
    nodeAuthoringExchangeEditor.projected = projected;
    nodeAuthoringExchangeEditor.inputFingerprint = parsed.source;
    renderNodeAuthoringExchangeDiff(diff);
    nodes.nodeAuthoringExchangeDiff.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    setNodeAuthoringExchangeStatus(
      diff.changes.length
        ? "校验通过。请先核对上方差异，再应用到本地编辑草稿。"
        : "校验通过，但 Codex 返回的内容与当前草稿完全一致。",
      "success",
    );
  } catch (error) {
    const stale = error?.code === "node_authoring_exchange_base_conflict";
    setNodeAuthoringExchangeStatus(
      stale
        ? "这份 JSON 基于旧草稿或旧发布版本。请重新生成并交给 Codex，当前内容没有被应用。"
        : error?.message || "交换 JSON 校验失败，当前内容没有被应用",
      "error",
    );
  }
  syncNodeAuthoringExchangeEditor();
}

function nodeAuthoringDraftStorageRecords(projected) {
  return [
    ...NODE_AUTHORING_WORLD_REFS.map((worldRef) => {
      const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
      const confirmed = confirmedVisualLayout(worldRef, composition.board);
      return {
        key: layoutEditorDraftStorageKey(worldRef),
        value: JSON.stringify(createAuthoringDraftEnvelope(
          projected.boardLayoutDrafts[worldRef],
          {
            sourceRevision: confirmed.revision,
            sourceValue: confirmed.draft,
          },
        )),
      };
    }),
    {
      key: LOCAL_NODE_REWARD_PACK_DRAFT_KEY,
      value: JSON.stringify(createAuthoringDraftEnvelope(
        projected.nodeRewardPack,
        {
          sourceRevision: nodeRewardEditor.publishedRevision,
          sourceValue: nodeRewardEditor.publishedPack,
        },
      )),
    },
  ];
}

function persistNodeAuthoringDraftBundle(projected) {
  const records = nodeAuthoringDraftStorageRecords(projected);
  const previous = records.map(({ key }) => ({
    key,
    value: localStorage.getItem(key),
  }));
  const restore = () => {
    let restored = true;
    previous.forEach(({ key, value }) => {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        restored = false;
      }
    });
    return restored;
  };
  try {
    records.forEach(({ key, value }) => localStorage.setItem(key, value));
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}

function applyNodeAuthoringExchangeToDrafts() {
  if (
    !nodeAuthoringExchangeEditor.candidate
    || !nodeAuthoringExchangeEditor.diff?.changes.length
    || !nodeAuthoringExchangeEditor.projected
    || nodeAuthoringExchangeBusy()
  ) return;
  const beforeLayout = cloneLayoutEditorDraft(layoutEditor.draft);
  const beforeRewardPack = cloneNodeRewardPack(nodeRewardEditor.draft);
  const beforeUndo = layoutEditor.undo.map((entry) => structuredClone(entry));
  const beforeRedo = layoutEditor.redo.map((entry) => structuredClone(entry));
  let rollbackDraftStorage = null;
  try {
    const parsed = parseNodeAuthoringExchangeText(
      nodes.nodeAuthoringExchangeInput.value,
    );
    if (parsed.source !== nodeAuthoringExchangeEditor.inputFingerprint) {
      throw new Error("粘贴内容在预览后发生了变化，请重新解析并预览");
    }
    const baseline = currentNodeAuthoringExchange();
    const candidate = normalizeNodeAuthoringExchange(
      nodeAuthoringExchangeEditor.candidate,
      { expectedBase: baseline.base },
    );
    const diff = diffNodeAuthoringExchanges(baseline, candidate, {
      expectedBase: baseline.base,
    });
    assertNodeAuthoringExchangeScope(
      diff,
      nodeAuthoringExchangeEditor.scopeSnapshot,
    );
    if (diff.candidateFingerprint !== nodeAuthoringExchangeEditor.diff.candidateFingerprint) {
      throw new Error("当前草稿已变化，请重新解析并预览");
    }
    const projected = projectNodeAuthoringExchange(candidate, {
      expectedBase: baseline.base,
    });
    rollbackDraftStorage = persistNodeAuthoringDraftBundle(projected);

    const afterLayout = cloneLayoutEditorDraft(
      projected.boardLayoutDrafts[layoutEditor.worldRef],
    );
    const currentLayoutChanged = !layoutDraftPositionsEqual(beforeLayout, afterLayout);
    if (currentLayoutChanged) {
      layoutEditor.undo.push({
        before: beforeLayout,
        after: cloneLayoutEditorDraft(afterLayout),
      });
      layoutEditor.redo = [];
    }
    layoutEditor.draft = afterLayout;
    layoutEditor.publishError = "";
    layoutEditor.storageAvailable = true;
    nodeRewardEditor.draft = cloneNodeRewardPack(projected.nodeRewardPack);
    nodeRewardEditor.publishError = "";
    nodeRewardEditor.storageAvailable = true;

    if (currentLayoutChanged) applyLayoutEditorPreview({ fullRender: true });
    else renderBoard();
    syncLayoutEditorControls({ announce: "Codex JSON 已应用到编辑草稿" });
    renderNodeRewardEditor();

    const appliedCount = diff.changes.length;
    nodeAuthoringExchangeEditor.baseline = currentNodeAuthoringExchange();
    nodeAuthoringExchangeEditor.generatedText = (
      `${JSON.stringify(nodeAuthoringExchangeEditor.baseline, null, 2)}\n`
    );
    nodes.nodeAuthoringExchangeOutput.value = nodeAuthoringExchangeEditor.generatedText;
    nodes.nodeAuthoringExchangeInput.value = "";
    nodeAuthoringExchangeEditor.candidate = null;
    nodeAuthoringExchangeEditor.diff = null;
    nodeAuthoringExchangeEditor.projected = null;
    nodeAuthoringExchangeEditor.inputFingerprint = "";
    nodes.nodeAuthoringExchangeApply.disabled = true;
    nodes.nodeAuthoringExchangeDiffSummary.textContent = (
      `已应用 ${appliedCount} 个字段 · 尚未发布`
    );
    setNodeAuthoringExchangeStatus(
      "修改已写入本地编辑草稿，尚未进入正式游戏。请检查有修改的标签页，并点击各页顶部发布按钮。",
      "success",
    );
  } catch (error) {
    if (rollbackDraftStorage) rollbackDraftStorage();
    layoutEditor.draft = beforeLayout;
    layoutEditor.undo = beforeUndo;
    layoutEditor.redo = beforeRedo;
    nodeRewardEditor.draft = beforeRewardPack;
    try {
      applyLayoutEditorPreview({ fullRender: true });
      renderNodeRewardEditor();
    } catch {
      // The next regular render will recover the editor view from restored drafts.
    }
    setNodeAuthoringExchangeStatus(
      error?.code === "node_authoring_exchange_base_conflict"
        ? "当前草稿或正式版本已变化，请重新生成、修改并预览 JSON。"
        : error?.message || "应用失败；原有草稿保持不变",
      "error",
    );
  }
  syncNodeAuthoringExchangeEditor();
}

function handleNodeAuthoringExchangeInput() {
  resetNodeAuthoringExchangePreview();
  setNodeAuthoringExchangeStatus("粘贴内容已变化，请点击“解析并预览”。");
  syncNodeAuthoringExchangeEditor();
}

function handleNodeAuthoringExchangeScopeChange() {
  nodeAuthoringExchangeEditor.baseline = null;
  nodeAuthoringExchangeEditor.generatedText = "";
  nodeAuthoringExchangeEditor.scopeSnapshot = null;
  nodes.nodeAuthoringExchangeOutput.value = "";
  resetNodeAuthoringExchangePreview();
  setNodeAuthoringExchangeStatus(
    "修改焦点已变更；此前生成内容已失效，请重新生成交换 JSON。直接粘贴的 JSON 将在下次预览时锁定此焦点。",
  );
  syncNodeAuthoringExchangeEditor();
}

function sessionPlayers(count) {
  const roster = selectedStudentProfiles();
  const normalizedCount = Math.max(1, Math.min(8, Number(count) || 1));
  if (roster.length === normalizedCount) {
    return roster.map((student, index) => ({
      id: student.id,
      displayName: studentGameName(student),
      teamId: `player-${student.id}`,
      characterId: characterAssignments[index] || null,
    }));
  }
  return DEMO_PLAYERS.slice(0, normalizedCount)
    .map((displayName, index) => ({
      id: `seat-${index + 1}`,
      displayName,
      characterId: characterAssignments[index] || null,
    }));
}

function selectedStudentProfiles() {
  const byId = new Map(studentProfiles.map((student) => [student.id, student]));
  return selectedStudentIds.map((studentId) => byId.get(studentId)).filter(Boolean);
}

function studentProfileById(studentId) {
  return studentProfiles.find(({ id }) => id === studentId) || null;
}

function studentGameName(student) {
  return String(student?.nickname || student?.displayName || "学生").trim();
}

function normalizeSelectedStudentIds(studentIds = selectedStudentIds) {
  const available = new Set(studentProfiles.map(({ id }) => id));
  return [...new Set(studentIds)]
    .filter((studentId) => !studentProfilesLoaded || available.has(studentId))
    .slice(0, 8);
}

function updateSetupRoster(studentIds, { focusStudentId = null } = {}) {
  const focusedStudentId = selectedStudentIds[selectedCharacterSeatIndex];
  const previousCharacters = new Map(selectedStudentIds.map((id, index) => [id, characterAssignments[index]]));
  selectedStudentIds = normalizeSelectedStudentIds(studentIds);
  // A roster refresh must never replace the characters locked into a saved game.
  if (gameSession) return;
  playerCount = Math.max(1, selectedStudentIds.length);
  nodes.setupPlayerCount.value = String(playerCount);
  characterAssignments = normalizeCharacterAssignments(
    selectedStudentIds.map((id) => previousCharacters.get(id) || null), playerCount,
  );
  const focusId = selectedStudentIds.includes(focusStudentId) ? focusStudentId : focusedStudentId;
  const focusIndex = selectedStudentIds.indexOf(focusId);
  const unassignedIndex = characterAssignments.findIndex((characterId) => !characterId);
  selectedCharacterSeatIndex = focusIndex >= 0 ? focusIndex
    : unassignedIndex >= 0 ? unassignedIndex : Math.min(selectedCharacterSeatIndex, playerCount - 1);
}

function studentAssetSummary(student) {
  const wallet = landingPoints.wallet(student?.id);
  return Number.isSafeInteger(wallet?.balance)
    ? `家园可用积分 ${wallet.balance}` : "家园积分 · 随学生账户保留";
}

function renderStudentRoster() {
  renderPlatformPoints();
  if (!nodes.studentProfileList) return;
  const normalizedIds = normalizeSelectedStudentIds();
  if (normalizedIds.length !== selectedStudentIds.length
    || normalizedIds.some((id, index) => id !== selectedStudentIds[index])) updateSetupRoster(normalizedIds);
  nodes.studentCreateSubmit.disabled = studentCreateBusy || !authenticatedUserId;
  nodes.studentCreateName.disabled = studentCreateBusy || !authenticatedUserId;
  nodes.studentManagerOpen.disabled = studentProfilesLoading || !authenticatedUserId;
  if (studentProfilesLoading) {
    nodes.studentRosterProgress.textContent = "正在加载资料库…";
    nodes.studentRosterStatus.textContent = "";
    nodes.studentProfileList.replaceChildren(
      textElement("p", "student-profile-empty", "正在读取学生资料…"),
    );
    return;
  }
  if (studentProfilesError) {
    nodes.studentRosterProgress.textContent = "资料库暂时不可用";
    nodes.studentRosterStatus.textContent = studentProfilesError;
    nodes.studentProfileList.replaceChildren(
      textElement("p", "student-profile-empty", "请稍后刷新页面重新加载。"),
    );
    return;
  }
  nodes.studentRosterProgress.textContent = studentProfiles.length
    ? `${selectedStudentIds.length}/8 已选择 · 资料库 ${studentProfiles.length} 人`
    : "资料库还是空的";
  nodes.studentRosterStatus.textContent = studentProfiles.length
    ? "点击学生加入本局。家园积分跟随学生账户保留；继续未结束的棋局请选择“继续本局”。"
    : "先在上方填写姓名，建立第一份学生资料。";
  const cards = studentProfiles.map((student) => {
    const selectedIndex = selectedStudentIds.indexOf(student.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "student-profile-card";
    button.dataset.studentId = student.id;
    button.setAttribute("aria-pressed", String(selectedIndex >= 0));
    button.setAttribute(
      "aria-label",
      `${studentGameName(student)}，${student.displayName}，${studentAssetSummary(student)}，${selectedIndex >= 0 ? "已加入本节课" : "未加入本节课"}`,
    );
    button.append(
      textElement("span", "student-profile-order", selectedIndex >= 0 ? String(selectedIndex + 1) : "+"),
      textElement("strong", "student-profile-name", studentGameName(student)),
      textElement("span", "student-profile-assets", studentAssetSummary(student)),
      textElement(
        "small",
        "student-profile-note",
        student.nickname ? `姓名 · ${student.displayName}` : (student.courseStage || "未设置游戏昵称"),
      ),
    );
    button.disabled = selectedIndex < 0 && selectedStudentIds.length >= 8;
    button.addEventListener("click", () => {
      const currentIndex = selectedStudentIds.indexOf(student.id);
      updateSetupRoster(currentIndex >= 0
        ? selectedStudentIds.filter((id) => id !== student.id)
        : [...selectedStudentIds, student.id], { focusStudentId: currentIndex < 0 ? student.id : null });
      renderStudentRoster();
      renderCharacterSelection();
      updateSetupPreview();
    });
    return button;
  });
  nodes.studentProfileList.replaceChildren(
    ...(cards.length ? cards : [
      textElement("p", "student-profile-empty", "还没有学生资料。"),
    ]),
  );
}

async function loadStudentProfiles() {
  if (!authenticatedUserId || studentProfilesLoading) return false;
  studentProfilesLoading = true;
  studentProfilesError = "";
  renderStudentRoster();
  try {
    const response = await fetch("/api/student-profiles/v1", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.schemaVersion !== STUDENT_PROFILE_STORE_SCHEMA_VERSION) {
      throw new Error(payload?.message || "学生资料库加载失败");
    }
    studentProfiles = Array.isArray(payload.students) ? payload.students : [];
    studentProfilesLoaded = true;
    return true;
  } catch (error) {
    studentProfilesError = error?.message || "学生资料库加载失败";
    return false;
  } finally {
    studentProfilesLoading = false;
    renderStudentRoster();
    renderCharacterSelection();
    updateSetupPreview();
  }
}

async function createStudentProfile() {
  if (studentCreateBusy || !authenticatedUserId) return;
  const displayName = nodes.studentCreateName.value.trim();
  if (!displayName) {
    nodes.studentRosterStatus.textContent = "请先填写学生姓名。";
    nodes.studentCreateName.focus();
    return;
  }
  studentCreateBusy = true;
  studentProfilesError = "";
  renderStudentRoster();
  try {
    const response = await fetch("/api/student-profiles/v1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedUserId: authenticatedUserId,
        displayName,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.student?.id) {
      throw new Error(payload?.message || "学生资料保存失败");
    }
    studentProfiles = [...studentProfiles, payload.student]
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"));
    updateSetupRoster([
      ...selectedStudentIds,
      payload.student.id,
    ], { focusStudentId: payload.student.id });
    nodes.studentCreateName.value = "";
    nodes.studentRosterStatus.textContent = selectedStudentIds.includes(payload.student.id)
      ? `${payload.student.displayName} 已加入资料库和本节课。`
      : `${payload.student.displayName} 已加入资料库，本节课已满 8 人。`;
  } catch (error) {
    studentProfilesError = error?.message || "学生资料保存失败";
  } finally {
    studentCreateBusy = false;
    renderStudentRoster();
    renderCharacterSelection();
    updateSetupPreview();
  }
}

function managerSelectedStudent() {
  return studentProfileById(studentManagerSelectedId);
}

function profileAssetDefinition(label, value) {
  const term = document.createElement("div");
  term.append(
    textElement("dt", "", label),
    textElement("dd", "", String(value ?? "待查询")),
  );
  return term;
}

function renderStudentManager({ resetFields = false } = {}) {
  if (!nodes.studentManagerList) return;
  const query = nodes.studentManagerSearch.value.trim().toLocaleLowerCase("zh-CN");
  const visibleStudents = studentProfiles.filter((student) => (
    !query
    || student.displayName.toLocaleLowerCase("zh-CN").includes(query)
    || String(student.nickname || "").toLocaleLowerCase("zh-CN").includes(query)
  ));
  nodes.studentManagerList.replaceChildren(...visibleStudents.map((student) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "student-manager-list-item";
    button.dataset.studentId = student.id;
    button.setAttribute("aria-pressed", String(student.id === studentManagerSelectedId));
    button.append(
      textElement("span", "", studentGameName(student).slice(0, 1)),
      textElement("strong", "", studentGameName(student)),
      textElement("small", "", student.nickname ? student.displayName : (student.courseStage || "待完善资料")),
    );
    button.addEventListener("click", () => {
      studentManagerSelectedId = student.id;
      nodes.studentManagerStatus.textContent = "";
      renderStudentManager({ resetFields: true });
    });
    return button;
  }));
  if (!visibleStudents.length) {
    nodes.studentManagerList.replaceChildren(
      textElement("p", "student-manager-list-empty", query ? "没有匹配的学生。" : "还没有学生资料。"),
    );
  }
  const selected = managerSelectedStudent();
  nodes.studentManagerEmpty.hidden = Boolean(selected);
  nodes.studentManagerFields.hidden = !selected;
  if (!selected) return;
  if (resetFields) {
    nodes.studentManagerDisplayName.value = selected.displayName;
    nodes.studentManagerNickname.value = selected.nickname || "";
    nodes.studentManagerCourseStage.value = selected.courseStage || "";
    nodes.studentManagerNote.value = selected.note || "";
  }
  const wallet = landingPoints.wallet(selected.id);
  nodes.studentManagerCurrentName.textContent = studentGameName(selected);
  nodes.studentManagerAvatar.textContent = studentGameName(selected).slice(0, 1);
  nodes.studentManagerAssetSummary.replaceChildren(
    profileAssetDefinition("家园可用积分", Number.isSafeInteger(wallet?.balance) ? wallet.balance : "待查询"),
  );
  for (const control of [
    nodes.studentManagerDisplayName,
    nodes.studentManagerNickname,
    nodes.studentManagerCourseStage,
    nodes.studentManagerNote,
    nodes.studentManagerSave,
  ]) control.disabled = studentManagerBusy;
}

function openStudentManager() {
  if (!studentProfiles.length) {
    nodes.studentRosterStatus.textContent = "请先快速加入一名学生，再进入详细资料管理。";
    nodes.studentCreateName.focus();
    return;
  }
  studentManagerSelectedId = studentManagerSelectedId || studentProfiles[0].id;
  nodes.studentManagerSearch.value = "";
  nodes.studentManagerStatus.textContent = "";
  renderStudentManager({ resetFields: true });
  nodes.studentManagerDialog.showModal();
}

async function saveStudentProfile() {
  const student = managerSelectedStudent();
  if (!student || studentManagerBusy || !authenticatedUserId) return;
  const displayName = nodes.studentManagerDisplayName.value.trim();
  if (!displayName) {
    nodes.studentManagerStatus.textContent = "学生姓名不能为空。";
    nodes.studentManagerDisplayName.focus();
    return;
  }
  studentManagerBusy = true;
  nodes.studentManagerStatus.textContent = "正在保存…";
  renderStudentManager();
  try {
    const response = await fetch(`/api/student-profiles/v1/${encodeURIComponent(student.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedUserId: authenticatedUserId,
        expectedRevision: student.revision,
        displayName,
        nickname: nodes.studentManagerNickname.value.trim(),
        courseStage: nodes.studentManagerCourseStage.value.trim(),
        note: nodes.studentManagerNote.value.trim(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.student?.id) {
      throw new Error(payload?.message || "学生资料保存失败");
    }
    studentProfiles = studentProfiles
      .map((profile) => profile.id === payload.student.id ? payload.student : profile)
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"));
    nodes.studentManagerStatus.textContent = `${studentGameName(payload.student)} 的资料已保存。`;
    renderStudentRoster();
    renderCharacterSelection();
    updateSetupPreview();
  } catch (error) {
    nodes.studentManagerStatus.textContent = error?.message || "学生资料保存失败";
  } finally {
    studentManagerBusy = false;
    renderStudentManager({ resetFields: true });
  }
}

function characterProfileById(characterId) {
  return CHARACTER_PROFILES.find((profile) => profile.id === characterId) || null;
}

function characterProfileForSeatIndex(seatIndex) {
  return characterProfileById(characterAssignments[seatIndex])
    || CHARACTER_PROFILES[seatIndex % CHARACTER_PROFILES.length];
}

function activeCharacterProfile() {
  return characterProfileForSeatIndex(gameSession?.activeSeatIndex || 0);
}

function configureCharacterArtImage(image, host, fallback) {
  host.dataset.artState = "loading";
  const showArt = () => {
    host.dataset.artState = "ready";
    fallback?.setAttribute("aria-hidden", "true");
  };
  const showFallback = () => {
    host.dataset.artState = "fallback";
    image.removeAttribute("href");
    image.removeAttribute("src");
    fallback?.setAttribute("aria-hidden", "true");
  };
  image.addEventListener("load", showArt, { once: true });
  image.addEventListener("error", showFallback, { once: true });
}

function appendSvgCharacterPawnArt(parent, profile, {
  variant = "board",
  x = -29,
  y = -54,
  width = 58,
  height = 78,
} = {}) {
  const visual = svgElement("g", {
    class: `pawn-character-visual is-${variant}`,
    "data-character-id": profile.id,
  });
  const fallback = svgElement("g", {
    class: "pawn-art-fallback",
    "aria-hidden": "true",
  });
  fallback.append(
    svgElement("circle", {
      cx: 0,
      cy: -3,
      r: variant === "mini" ? 17 : 20,
      class: "pawn-fallback-medallion",
    }),
  );
  const fallbackGlyph = svgElement("text", {
    x: 0,
    y: variant === "mini" ? 3 : 4,
    "text-anchor": "middle",
    class: "pawn-fallback-glyph",
  });
  fallbackGlyph.textContent = profile.emoji;
  fallback.append(fallbackGlyph);
  const image = svgElement("image", {
    href: profile.pawnAssetRef,
    x,
    y,
    width,
    height,
    preserveAspectRatio: "xMidYMax meet",
    class: "pawn-character-art",
    "aria-hidden": "true",
    draggable: "false",
  });
  configureCharacterArtImage(image, visual, fallback);
  visual.append(fallback, image);
  parent.append(visual);
  return visual;
}

function appendHtmlCharacterPawnArt(parent, profile, className) {
  parent.dataset.characterId = profile.id;
  const fallback = textElement("span", "pawn-art-fallback", profile.emoji);
  fallback.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.className = className;
  image.src = profile.pawnAssetRef;
  image.alt = "";
  image.draggable = false;
  configureCharacterArtImage(image, parent, fallback);
  parent.append(fallback, image);
  return image;
}

function characterAssetRefForVariant(profile, variant) {
  if (variant === "selection") return profile.selectionAssetRef;
  if (variant === "pawn") return profile.pawnAssetRef;
  return profile.hudAssetRef;
}

function renderHtmlCharacterAvatar(host, profile, {
  variant = "hud",
  imageClassName = "character-avatar-art",
} = {}) {
  host.replaceChildren();
  host.dataset.characterId = profile.id;
  host.dataset.characterVariant = variant;
  host.style.setProperty("--character-accent", profile.accent);

  const fallback = textElement(
    "span",
    "character-avatar-fallback",
    profile.emoji,
  );
  fallback.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.className = imageClassName;
  image.alt = "";
  image.draggable = false;
  configureCharacterArtImage(image, host, fallback);
  image.src = characterAssetRefForVariant(profile, variant);
  host.append(fallback, image);
  return host;
}

function resetSpeechAttemptTracking() {
  speechAttemptTurnKey = null;
  speechAttemptOrdinal = 0;
  scoreRetryUsedTurnKey = null;
}

function createCharacterAvatar(profile, {
  className = "character-avatar",
  variant = "hud",
} = {}) {
  const avatar = document.createElement("span");
  avatar.className = className;
  avatar.setAttribute("aria-hidden", "true");
  return renderHtmlCharacterAvatar(avatar, profile, { variant });
}

function renderCharacterSelection() {
  if (!nodes.playerCharacterTabs || !nodes.characterOptions) return;
  const focusedCharacterId = nodes.characterOptions.contains(document.activeElement)
    ? document.activeElement.dataset.characterId : null;
  const focusedSeatIndex = nodes.playerCharacterTabs.contains(document.activeElement)
    ? document.activeElement.dataset.seatIndex : null;
  const previousScrollTop = nodes.characterOptions.scrollTop;
  const count = Math.max(1, Math.min(8, Number(nodes.setupPlayerCount.value) || playerCount));
  characterAssignments = normalizeCharacterAssignments(characterAssignments, count);
  selectedCharacterSeatIndex = Math.max(
    0,
    Math.min(count - 1, Number(selectedCharacterSeatIndex) || 0),
  );
  const selectedProfiles = selectedStudentProfiles();
  const players = selectedProfiles.length === count
    ? selectedProfiles.map((student) => studentGameName(student))
    : DEMO_PLAYERS.slice(0, count);
  const chosenCount = characterAssignments.filter(Boolean).length;

  const tabs = players.map((displayName, index) => {
    const assignedProfile = characterProfileById(characterAssignments[index]);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "player-character-tab";
    button.dataset.seatIndex = String(index);
    button.setAttribute(
      "aria-pressed",
      String(index === selectedCharacterSeatIndex),
    );
    if (assignedProfile) {
      button.append(
        createCharacterAvatar(assignedProfile, {
          className: "player-tab-avatar",
          variant: "hud",
        }),
        textElement("span", "", displayName),
        textElement(
          "small",
          "",
          `${assignedProfile.label} · ${assignedProfile.roleLabel}`,
        ),
      );
    } else {
      button.append(
        textElement("span", "player-tab-placeholder", String(index + 1)),
        textElement("span", "", displayName),
        textElement("small", "", "待选角色"),
      );
    }
    button.addEventListener("click", () => {
      selectedCharacterSeatIndex = index;
      renderCharacterSelection();
    });
    return button;
  });
  nodes.playerCharacterTabs.replaceChildren(...tabs);

  const usedByOtherSeat = new Set(
    characterAssignments.filter((characterId, index) => (
      index !== selectedCharacterSeatIndex && characterId
    )),
  );
  const options = CHARACTER_PROFILES.map((profile) => {
    const ownerIndex = characterAssignments.indexOf(profile.id);
    const isSelected = characterAssignments[selectedCharacterSeatIndex] === profile.id;
    const isOccupied = usedByOtherSeat.has(profile.id);
    const selectionLabel = isSelected
      ? `${players[selectedCharacterSeatIndex]} 的伙伴`
      : isOccupied ? `${players[ownerIndex]} 已选择` : "选我作伙伴";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character-option";
    button.dataset.characterId = profile.id;
    button.dataset.castRole = profile.castRole;
    button.setAttribute(
      "aria-label",
      `${profile.label}，${profile.roleLabel}，${profile.catchphrase}。${selectionLabel}`,
    );
    button.disabled = isOccupied;
    button.dataset.selectionState = isSelected ? "selected" : isOccupied ? "occupied" : "available";
    button.setAttribute(
      "aria-pressed",
      String(isSelected),
    );
    button.style.setProperty("--character-accent", profile.accent);
    button.append(
      createCharacterAvatar(profile, {
        className: "character-option-avatar",
        variant: "selection",
      }),
      textElement("strong", "character-option-name", profile.label),
      textElement("span", "character-option-role", profile.roleLabel),
      textElement("small", "character-option-status", selectionLabel),
    );
    button.title = `${profile.catchphrase} · ${selectionLabel}`;
    button.addEventListener("click", () => {
      characterAssignments = assignCharacter(characterAssignments, {
        seatIndex: selectedCharacterSeatIndex,
        characterId: profile.id,
        playerCount: count,
      });
      const nextUnassigned = characterAssignments.findIndex((characterId) => !characterId);
      if (nextUnassigned >= 0) selectedCharacterSeatIndex = nextUnassigned;
      renderCharacterSelection();
      updateSetupPreview();
    });
    return button;
  });
  nodes.characterOptions.replaceChildren(...options);
  nodes.characterOptions.scrollTop = previousScrollTop;

  if (focusedCharacterId) {
    const replacement = options.find((option) => option.dataset.characterId === focusedCharacterId);
    const focusTarget = replacement && !replacement.disabled
      ? replacement : tabs[selectedCharacterSeatIndex];
    focusTarget?.focus({ preventScroll: true });
  } else if (focusedSeatIndex !== null) {
    tabs[Number(focusedSeatIndex)]?.focus({ preventScroll: true });
  }

  const rosterComplete = (
    (selectedProfiles.length === count && count >= 1)
    || (qaHarnessEnabled && selectedProfiles.length === 0)
  );
  const complete = rosterComplete && characterSelectionComplete(characterAssignments, count);
  nodes.characterSelectionProgress.textContent = `${chosenCount}/${count} 位伙伴已就位`;
  if (nodes.characterSelectionGuide) {
    nodes.characterSelectionGuide.textContent = complete
      ? `${CHARACTER_PROFILES.length} 位冒险伙伴 · 点击孩子的名字，还可以换一位伙伴`
      : `${players[selectedCharacterSeatIndex]}，从 ${CHARACTER_PROFILES.length} 位伙伴中选一位陪你出发吧`;
  }
  nodes.startSession.disabled = !complete || sessionConfigurationLoading;
  nodes.startSession.textContent = complete
      ? sessionConfigurationLoading ? "正在准备棋盘…" : "出发寻宝"
      : rosterComplete
        ? "选完角色，出发寻宝"
        : "先从资料库选择学生";
}

function syncRuntimeToSession(runtimeValue, sessionValue) {
  const seat = currentSessionSeat(sessionValue);
  if (!seat || sessionValue?.screen !== "PLAYING") return runtimeValue;
  const activeTeamIndex = runtimeValue.teams.findIndex((team) => team.id === seat.teamId);
  if (activeTeamIndex < 0) throw new Error(`unknown session team: ${seat.teamId}`);
  const teams = runtimeValue.teams.map((team, index) => {
    if (index !== activeTeamIndex) return team;
    const speakerIndex = team.members.findIndex((member) => member === seat.displayName);
    if (speakerIndex < 0) throw new Error(`seat ${seat.id} is missing from ${team.id}`);
    return { ...team, speakerIndex };
  });
  return {
    ...runtimeValue,
    activeTeamIndex,
    round: sessionRound(sessionValue),
    teams,
  };
}

function stablePlayerIds(sessionValue = gameSession) {
  return (sessionValue?.seats || []).map((seat) => seat.id);
}

function createLedgerForSession(sessionValue = gameSession) {
  const playerIds = stablePlayerIds(sessionValue);
  return createPlayerAssetsLedger({
    playerIds,
    guaranteeCursor: stableGuaranteeCursor(sessionValue.sessionId, playerIds),
  });
}

function syncVisiblePlayerAssets(ledgerValue = playerAssetsLedger) {
  visiblePlayerAssetsById = playerAssetsView(ledgerValue);
}

function savedSessionPayload(
  runtimeValue = runtime,
  sessionValue = gameSession,
  assetsValue = playerAssetsLedger,
  fairyValue = fairyState,
) {
  if (!sessionValue) return null;
  return {
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    ownerUserId: sessionValue.landingPoints?.ownerId || authenticatedUserId,
    autoResumeOnReload: true,
    teacherSelectedSeatId,
    themeId: runtimeValue?.themeId || theme.id,
    learningPackId: isTeacherSession(sessionValue) ? null : learningPack.id,
    playerCount,
    characterAssignments: [...characterAssignments],
    attemptSequence,
    speechAttemptState: {
      turnKey: speechAttemptTurnKey,
      ordinal: speechAttemptOrdinal,
      scoreRetryUsedTurnKey,
    },
    camera,
    runtime: runtimeValue,
    gameSession: sessionValue,
    playerAssetsLedger: assetsValue,
    fairyState: fairyValue,
    pendingStudentAssetSettlements: structuredClone(pendingStudentAssetSettlements),
    dicePackSnapshot: sessionDicePackSnapshot
      ? structuredClone(sessionDicePackSnapshot)
      : createSessionDicePackSnapshot(),
    nodeRewardPackSnapshot: sessionNodeRewardPackSnapshot
      ? structuredClone(sessionNodeRewardPackSnapshot)
      : createSessionNodeRewardPackSnapshot(),
    cardCatalogSnapshot: sessionCardCatalogSnapshot
      ? structuredClone(sessionCardCatalogSnapshot)
      : createSessionCardCatalogSnapshot(),
    ...(sessionClassroomEventProgramSnapshot
      ? {
          classroomEventProgramSnapshot: structuredClone(
            sessionClassroomEventProgramSnapshot,
          ),
        }
      : {}),
    lastDicePresentation,
  };
}

function usesLandingPoints(session = gameSession) {
  return session?.landingPoints?.kind === LANDING_POINTS_KIND;
}

function landingGameId(session = gameSession) {
  return session?.assetGameId || session?.sessionId;
}

function syncCircuitLapProgress(serverSession = landingPoints.get(landingGameId())?.session) {
  if (runtime.world?.routeRef !== CIRCUIT_WORLD_ROUTE_REF
    || serverSession?.world?.routeRef !== CIRCUIT_WORLD_ROUTE_REF) return;
  runtime = {
    ...runtime,
    circuitLapRound: Number.isSafeInteger(serverSession.lapRound) ? serverSession.lapRound : 1,
    teams: runtime.teams.map((team) => {
      const saved = serverSession.teams.find((entry) => `player-${entry.id}` === team.id);
      return saved && Number.isSafeInteger(saved.completedLaps)
        ? { ...team, completedLaps: saved.completedLaps } : team;
    }),
  };
}

function showLandingError(error) {
  landingPointsMessage = error?.message || "积分暂未确认到账，联网后可重试原回合。";
  renderPlatformPoints();
  renderTeacherPanel();
  nodes.teacherStatus.textContent = landingPointsMessage;
  nodes.teacherStatus.hidden = false;
}

async function ensureLandingRegistration({ retryUnstarted = false } = {}) {
  const local = gameSession;
  if (!usesLandingPoints(local)) return null;
  if (local.landingPoints.ownerId !== authenticatedUserId) {
    throw new Error("请登录本局原老师账号后继续积分棋局。");
  }
  const externalSessionId = landingGameId(local);
  let record = landingPoints.get(externalSessionId);
  if (!record?.session) {
    const request = { externalSessionId, studentIds: local.seats.map((seat) => seat.id), mode: TEACHER_MODE };
    if (retryUnstarted && !local.processedAttemptIds?.length && !Number.isInteger(local.teacherOpportunity?.faceIndex)) {
      await landingPoints.registerNewGame({ ...request, retryUnstarted: true });
    } else await landingPoints.refresh(externalSessionId);
    record = landingPoints.get(externalSessionId);
  }
  if (!record?.session) throw new Error("本局积分登记尚未完成，请联网后重试；尚未开始移动。");
  const server = record.session;
  const legacyValues = ["monopoly-final-landing-v1", "monopoly-final-landing-v2"].includes(server.rule?.revision);
  const pendingBonus = Object.values(server.specialCells?.bonusAwards || {}).some((award) => award.status !== "awarded");
  const pendingGroup = Object.values(server.specialCells?.groupMoves || {}).some((move) =>
    move.status === "pending" || move.awards?.some((award) => award.status !== "awarded")
    || groupLandingEffectsPending(move, server.specialCells));
  // Upgrade only future prices, after the original saved turn and all rewards settle.
  if (legacyValues && server.status === "open" && !server.activeTurnId && !pendingBonus && !pendingGroup) {
    await landingPoints.upgradeRule(externalSessionId);
    record = landingPoints.get(externalSessionId);
  }
  if (gameSession !== local) throw new Error("棋局已切换，请在当前棋局重试。");
  // Only the start gate adopts server geometry. A resumed played game must agree
  // with its original authoritative turn rather than silently teleporting.
  if (!local.landingPoints.rule) {
    if (local.processedAttemptIds?.length || record.session.completedTurns) {
      throw new Error("棋局恢复信息不完整，已暂停新的积分回合。");
    }
    // Registration may have reached the bridge before a lost first local save.
    // Recover its exact immutable world, including its matching resource snapshot.
    const registeredWorld = record.session.world;
    const registeredComposition = resolveWorldComposition(
      registeredWorld.active.worldPackRef, WORLD_REGISTRIES,
    );
    const previousRewards = sessionNodeRewardPackSnapshot || createSessionNodeRewardPackSnapshot();
    const registeredRewards = createSessionNodeRewardPackSnapshot({
      revision: previousRewards.revision,
      pack: retargetNodeRewardPack(previousRewards.pack, registeredComposition.worldRef),
    });
    if (activeWorldComposition.worldRef !== registeredComposition.worldRef) {
      activateWorldComposition(registeredComposition.worldRef, { resetCamera: true });
      applyTheme();
    }
    sessionNodeRewardPackSnapshot = registeredRewards;
    gameSession = { ...local, landingPoints: { ...local.landingPoints,
      rule: structuredClone(record.session.rule) } };
    runtime = { ...runtime, boardId: registeredComposition.board.id, themeId: theme.id,
      world: structuredClone(registeredWorld),
      mapState: structuredClone(registeredWorld.active.mapState) };
    persistStableSession(runtime, gameSession, playerAssetsLedger, fairyState, { required: true });
  }
  let upgraded = false;
  if (local.landingPoints.rule && local.landingPoints.rule.revision !== record.session.rule.revision) {
    if (!isFivefoldRuleUpgrade(local.landingPoints.rule, record.session.rule)) {
      throw new Error("格价升级与原棋盘快照不一致，请保留本局并重试。");
    }
    const next = { ...gameSession, landingPoints: { ...gameSession.landingPoints, rule: structuredClone(record.session.rule) } };
    persistStableSession(runtime, next, playerAssetsLedger, fairyState, { required: true });
    gameSession = next;
    upgraded = true;
  }
  landingPointsMessage = "";
  syncCircuitLapProgress(record.session);
  if (!local.landingPoints.rule || upgraded) render();
  return record.session;
}

function savedLandingGame(id) {
  if (landingGameId() === id && usesLandingPoints()) return gameSession;
  for (const key of [`${LOCAL_SESSION_KEY}:game:${id}`, LOCAL_SESSION_KEY]) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) || "null")?.gameSession;
      if (landingGameId(saved) === id && usesLandingPoints(saved)) return saved;
    } catch { /* Missing or damaged local proof cannot authorize recovery. */ }
  }
  return null;
}

function groupLandingMoves(session) {
  return Object.values(session?.specialCells?.groupMoves || {}).filter((move) =>
    move.status === "confirmed" && move.rewardPolicy === "group-final-landing-v1" && Array.isArray(move.awards));
}

function pendingGroupLandingAwards(session) {
  return groupLandingMoves(session).flatMap((move) => move.awards.filter((award) => award.status !== "awarded"
    || move.landingEffectsPolicy === GROUP_LANDING_EFFECTS_POLICY && (!award.landingEffectsApplied
      || Object.values(session.specialCells?.bonusAwards || {}).some((bonus) => bonus.turnId === award.attemptId && bonus.status !== "awarded"))));
}

function persistCompletedGroupSnapshot(next) {
  persistStableSession(runtime, next, playerAssetsLedger, fairyState, { required: true });
  const saved = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  if (landingGameId(saved?.gameSession) !== landingGameId(next)
    || saved?.gameSession?.landingPoints?.ownerId !== authenticatedUserId
    || JSON.stringify(saved.gameSession.completedGroupMoveIds) !== JSON.stringify(next.completedGroupMoveIds)
    || runtime.teams.some((team) => !saved.runtime?.teams?.some((entry) => entry.id === team.id && entry.nodeId === team.nodeId))) {
    throw new Error("全班新位置未能保存，尚未申请新落格积分，请重试。");
  }
}

function saveCompletedGroupMove(move) {
  const next = { ...gameSession, completedGroupMoveIds: [...new Set([
    ...(gameSession.completedGroupMoveIds || []), move.instanceId,
  ])] };
  // Assign the proof only after the required snapshot succeeds. An in-memory
  // animation or a server confirmation alone can never authorize setup claims.
  persistCompletedGroupSnapshot(next);
  gameSession = next;
}


function groupSourceLocallyCommitted(sourceId, server, visited = new Set()) {
  if (gameSession.processedAttemptIds?.includes(sourceId)) return true;
  if (visited.has(sourceId)) return false;
  visited.add(sourceId);
  const parent = groupLandingMoves(server).find((move) => move.awards.some((award) => award.attemptId === sourceId && award.status === "awarded"));
  return Boolean(parent && groupSourceLocallyCommitted(parent.sourceTurnId, server, visited));
}

function restoreConfirmedGroupPositions(id, server) {
  if (landingGameId() !== id || !usesLandingPoints() || gameSession.assetGameEnded
    || gameSession.screen !== "PLAYING") return;
  const unshown = groupLandingMoves(server).filter((move) => (move.awards.some((award) => award.status !== "awarded")
    || groupLandingEffectsPending(move, server.specialCells))
    && !(gameSession.completedGroupMoveIds || []).includes(move.instanceId)
    && groupSourceLocallyCommitted(move.sourceTurnId, server));
  if (!unshown.length) return;
  if (runtime.world?.active?.instanceId !== server.world?.active?.instanceId
    || runtime.teams.some((team) => !server.teams.some((saved) => `player-${saved.id}` === team.id))) {
    throw new Error("全班前进与原棋局位置不一致，请保留存档后重试。");
  }
  // Resolve can be committed before its reply/animation reaches this browser.
  // Restore the authoritative terminal positions, never replay a stale path.
  runtime = { ...runtime, teams: runtime.teams.map((team) => {
    const saved = server.teams.find((entry) => `player-${entry.id}` === team.id);
    return { ...team, nodeId: saved.nodeId };
  }) };
  syncCircuitLapProgress(server);
  const next = { ...gameSession, completedGroupMoveIds: [...new Set([
    ...(gameSession.completedGroupMoveIds || []), ...unshown.map((move) => move.instanceId),
  ])] };
  persistCompletedGroupSnapshot(next);
  gameSession = next;
  render();
}

async function recoverLandingPoints(id = landingGameId(), { wallets = false } = {}) {
  const local = savedLandingGame(id);
  if (!usesLandingPoints(local)) throw new Error("未找到本局已完成移动的本地记录，未申请补发积分。");
  const key = `${authenticatedUserId}:${id}`;
  if (landingRecoveryFlights.has(key)) return landingRecoveryFlights.get(key);
  const flight = (async () => {
    if (local.landingPoints.ownerId !== authenticatedUserId) throw new Error("请登录本局原老师账号后查询积分。");
    try {
      prepareTrackedGroupCoinHolds(id);
      for (const move of groupLandingMoves(landingPoints.get(id)?.session)) {
        if (move.awards.some((award) => award.status !== "awarded") || groupLandingEffectsPending(move, landingPoints.get(id)?.session?.specialCells)) {
          trackGroupCoinGain(id, move); holdCoinFxDisplays();
        }
      }
      await landingPoints.refresh(id, { wallets });
      // A plan is not proof that its animation finished. Saved committed turns
      // restore directly to the final tile; only those original events may retry.
      for (const turn of recoverableLandingTurns(landingPoints.get(id)?.session, local.processedAttemptIds)) {
        await landingPoints.claim(id, turn.attemptId);
      }
      restoreConfirmedGroupPositions(id, landingPoints.get(id)?.session);
      const proof = savedLandingGame(id);
      for (const move of groupLandingMoves(landingPoints.get(id)?.session)) {
        if (proof?.completedGroupMoveIds?.includes(move.instanceId) && (move.awards.some((award) => award.status !== "awarded") || groupLandingEffectsPending(move, landingPoints.get(id)?.session?.specialCells))) {
          await claimGroupLandingRewards(id, move);
        }
      }
      await presentTrackedGroupRewards(id);
      if (landingGameId() === id && !local.assetGameEnded
        && ["monopoly-final-landing-v1", "monopoly-final-landing-v2"].includes(landingPoints.get(id)?.session?.rule?.revision)) {
        await ensureLandingRegistration();
      }
      landingPointsMessage = pendingGroupLandingAwards(landingPoints.get(id)?.session).length
        ? "全班新落格积分待到账 · 请查询重试，成功的学生不会重复领取" : "";
    } finally {
      // Ending is independent of a delayed reward. A planned turn can still be
      // claimed after close, but an abandoned unused die can never be rerolled.
      if (local.assetGameEnded && landingPoints.get(id)?.session) await landingPoints.close(id);
      if (landingGameId() === id) {
        syncCircuitLapProgress();
        renderHud();
      }
      renderPlatformPoints();
    }
  })();
  landingRecoveryFlights.set(key, flight);
  try { await flight; } finally { landingRecoveryFlights.delete(key); }
}

function appendLandingHistory(panel) {
  const records = landingPoints.records().filter((record, index) => index < 3
    || Object.values(record.session?.turns || {}).some((turn) => turn.status === "planned")
    || pendingGroupLandingAwards(record.session).length);
  if (!records.length) return;
  panel.hidden = false;
  panel.append(textElement("h3", "", "停格积分记录"));
  for (const record of records) {
    const turns = Object.values(record.session?.turns || {});
    const groups = groupLandingMoves(record.session);
    const earned = turns.filter((turn) => turn.status === "awarded").reduce((sum, turn) => sum + turn.points, 0)
      + groups.flatMap((move) => move.awards).filter((award) => award.status === "awarded").reduce((sum, award) => sum + award.points, 0);
    const saved = savedLandingGame(record.externalSessionId);
    const committed = new Set(saved?.processedAttemptIds || []);
    const groupSaved = new Set(saved?.completedGroupMoveIds || []);
    const pending = turns.filter((turn) => turn.status === "planned" && committed.has(turn.attemptId)).reduce((sum, turn) => sum + turn.points, 0)
      + groups.filter((move) => groupSaved.has(move.instanceId)).flatMap((move) => move.awards)
        .filter((award) => award.status !== "awarded").reduce((sum, award) => sum + award.points, 0);
    const unfinished = turns.some((turn) => turn.status === "planned" && !committed.has(turn.attemptId))
      || groups.some((move) => !groupSaved.has(move.instanceId) && move.awards.some((award) => award.status !== "awarded"));
    const row = textElement("div", "platform-points-record", "");
    row.append(textElement("p", "", `开局 ${new Date(record.createdAt).toLocaleString("zh-CN")} · 已到账 ${earned}${pending ? ` · 待确认 ${pending}` : ""}`));
    if (unfinished) row.append(textElement("small", "", "有移动尚未完成，须先继续原棋局，当前未发积分。"));
    if (record.error?.message) row.append(textElement("small", "", record.error.message));
    const retry = textElement("button", "secondary", "查询本局并重试待到账积分");
    retry.type = "button"; retry.disabled = busy || landingPoints.isBusy(record.externalSessionId);
    retry.addEventListener("click", () => { void recoverLandingPoints(record.externalSessionId, { wallets: true }).catch(showLandingError); });
    row.append(retry); panel.append(row);
  }
}

function renderLandingPoints() {
  const id = landingGameId();
  const current = landingPoints.get(id);
  const note = document.querySelector("#platform-points-note");
  note.hidden = false;
  const groupPending = pendingGroupLandingAwards(current?.session);
  const pending = Object.values(current?.session?.turns || {}).some((turn) => turn.status === "planned" && !turn.receipt);
  note.textContent = landingPointsMessage || current?.error?.message || (!current?.session
    ? "正在登记积分棋局，登记成功后开始掷骰。"
    : groupPending.length ? "全班新落格积分待到账 · 查询重试不会重复发放"
    : pending ? "本轮积分待确认到账 · 重试不会重复发放"
    : "只领最终停格积分 · 停稳即到账 · 可在我的家园使用");
  nodes.endGame.textContent = "结束本局";
  nodes.endGame.title = "已到账的积分保留在学生家园钱包";
  if (!gameSession?.assetGameEnded) nodes.newSession.textContent = "结束本局，返回设置";
  for (const selector of ["#platform-points-results", "#platform-points-setup"]) {
    const panel = document.querySelector(selector);
    panel.hidden = selector.endsWith("setup");
    if (panel.hidden) continue;
    panel.replaceChildren(textElement("h3", "", "家园积分"));
    panel.append(textElement("p", "", note.textContent));
    const students = document.createElement("ul");
    for (const seat of gameSession?.seats || []) {
      const turns = Object.values(current?.session?.turns || {}).filter((turn) => turn.studentId === seat.id);
      // Same confirmed total as the HUD chip: base receipts plus awarded bonuses.
      const earned = homePointsSummary(gameSession, current?.session, seat.id).earned ?? 0;
      const waiting = turns.filter((turn) => turn.status === "planned" && !turn.receipt)
        .reduce((total, turn) => total + turn.points, 0)
        + groupPending.filter((award) => award.studentId === seat.id).reduce((total, award) => total + award.points, 0);
      const wallet = landingPoints.wallet(seat.id);
      const balance = Number.isSafeInteger(wallet?.balance) ? `可用 ${wallet.balance}` : "余额待查询";
      students.append(textElement("li", "", `${seat.displayName} · 本局已到账 ${earned}${waiting ? ` · 待确认 ${waiting}` : ""} · ${balance}`));
    }
    panel.append(students);
    const retry = textElement("button", "secondary", current?.session ? "查询积分与重试待到账回合" : "重试新局登记");
    retry.type = "button";
    retry.disabled = busy || landingPoints.isBusy(id);
    retry.addEventListener("click", () => {
      void (current?.session ? recoverLandingPoints(id, { wallets: true }) : ensureLandingRegistration({ retryUnstarted: true }))
        .then(() => ensureSpecialCellsOpening()).catch(showLandingError);
    });
    panel.append(retry);
    const home = textElement("a", "secondary", "打开我的家园");
    home.href = "/games/pocket-hop/student-homes.html";
    home.target = "_blank"; home.rel = "noopener";
    panel.append(home, textElement("small", "", "格子积分 100 / 200 / 300 / 500 / 1000；只领取最终停下的一格。"));
  }
}

function renderPlatformPoints() {
  if (usesLandingPoints()) { renderLandingPoints(); return; }
  const note = document.querySelector("#platform-points-note");
  const copy = gameSession
    ? "本局未接入停格积分。新开老师主持自由记分局即可获得家园积分。"
    : "随机掷骰，只领取最终停格的家园积分。";
  note.hidden = !gameSession;
  note.textContent = copy;
  nodes.endGame.textContent = "结束本局";
  if (gameSession && !gameSession.assetGameEnded) nodes.newSession.textContent = "结束本局，返回设置";
  for (const selector of ["#platform-points-results", "#platform-points-setup"]) {
    const panel = document.querySelector(selector);
    panel.hidden = selector.endsWith("setup");
    if (panel.hidden) continue;
    panel.replaceChildren(textElement("h3", "", "家园积分"), textElement("p", "", copy));
  }
}

function persistStableSession(
  runtimeValue = runtime,
  sessionValue = gameSession,
  assetsValue = playerAssetsLedger,
  fairyValue = fairyState,
  { required = false, autoResumeOnReload = true } = {},
) {
  const payload = savedSessionPayload(
    runtimeValue,
    sessionValue,
    assetsValue,
    fairyValue,
  );
  if (!payload) return false;
  payload.autoResumeOnReload = autoResumeOnReload;
  try {
    window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("local voice-board snapshot could not be saved", error);
    if (required) throw error;
    return false;
  }
  updateResumeAvailability();
  return true;
}

function clearSavedSession() {
  try {
    window.localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch (error) {
    console.warn("local voice-board snapshot could not be cleared", error);
  }
  updateResumeAvailability();
}

function updateResumeAvailability() {
  if (!nodes.resumeSession) return;
  try {
    const saved = window.localStorage.getItem(LOCAL_SESSION_KEY);
    nodes.resumeSession.hidden = !saved;
    nodes.resumeSession.textContent = saved && JSON.parse(saved)?.gameSession?.assetGameEnded
      ? "查看上一局成绩" : "继续本局";
  } catch {
    nodes.resumeSession.hidden = true;
  }
}

// Opening a game page resumes its original local transaction only after the
// current identity and published configuration have finished loading. Authoring
// pages and explicitly paused/finished games keep their existing entry screens.
function restoreLocalSessionOnStartup() {
  if (gameSession || sessionConfigurationLoading || LAYOUT_EDITOR_REQUESTED
    || !(authenticatedUserId || qaHarnessEnabled)) return false;
  let payload;
  try {
    payload = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  } catch { return false; }
  const saved = payload?.gameSession;
  const ownerId = payload?.ownerUserId || saved?.landingPoints?.ownerId;
  if (!saved || saved.screen !== "PLAYING" || saved.assetGameEnded
    || payload.autoResumeOnReload === false
    || (ownerId && ownerId !== authenticatedUserId)) return false;
  restoreLocalSession();
  return Boolean(gameSession);
}

function updateSetupPreview() {
  if (!nodes.setupPreview) return;
  const teacherMode = nodes.setupMode.value === TEACHER_MODE;
  nodes.setupLearning.closest("label").hidden = teacherMode;
  nodes.setupOpportunities.closest("label").hidden = teacherMode;
  nodes.setupLearning.disabled = teacherMode;
  nodes.setupOpportunities.disabled = teacherMode;
  document.querySelector("#setup-mode-intro").textContent = teacherMode
    ? "题目和活动由老师掌握。选择学生和角色，奖励一次掷骰机会；最终停格的积分进入学生家园账户。"
    : "每位孩子选择西米兔或一位好朋友。读出题卡、查看真实评分，再掷骰前进。家园积分请新开自由记分局。";
  const selectedNames = selectedStudentProfiles().map((student) => studentGameName(student));
  if (teacherMode) {
    nodes.setupPreview.textContent = `${selectedNames.length ? selectedNames.join("、") : "先选择今天参与的学生"} · 老师自由点人奖励一次掷骰机会 · 1–6 课堂骰，六面等概率 · 只领取最终停格家园积分`;
    return;
  }
  const count = Number(nodes.setupPlayerCount.value) || playerCount;
  const pack = Object.values(LEARNING_PACKS)
    .find((candidate) => candidate.id === nodes.setupLearning.value) || learningPack;
  const opportunities = Math.max(2, Number(nodes.setupOpportunities.value) || 2);
  const minimumTurns = minimumTurnsForSession({
    playerCount: count,
    teamCount: count,
    minOpportunitiesPerSeat: opportunities,
  });
  const chosenCount = normalizeCharacterAssignments(characterAssignments, count)
    .filter(Boolean).length;
  nodes.setupPreview.textContent = (
    `${selectedNames.length ? selectedNames.join("、") : "尚未选择学生"}`
    + ` · ${count} 位孩子 · 每人一个角色和棋子 · 每位至少 ${opportunities} 次朗读`
    + ` · 共 ${minimumTurns} 个寻宝回合`
    + ` · 角色 ${chosenCount}/${count} 已选择 · 题卡：${pack.title}`
  );
}

function startLocalSession({
  mode = TEACHER_MODE,
  themeId = "cloud-harbor",
  learningPackId = nodes.setupLearning.value,
  count = Number(nodes.setupPlayerCount.value),
  minOpportunities = Number(nodes.setupOpportunities.value),
} = {}) {
  if (sessionConfigurationLoading) return;
  // Preserve previous results and retired outboxes without blocking a new points game.
  const previous = window.localStorage.getItem(LOCAL_SESSION_KEY);
  if (previous) {
    let saved;
    try { saved = JSON.parse(previous); } catch { saved = {}; }
    const archiveId = saved.gameSession?.assetGameId || saved.gameSession?.sessionId;
    if (archiveId) window.localStorage.setItem(`${LOCAL_SESSION_KEY}:game:${archiveId}`, previous);
  }
  rewardPresentationEpoch += 1;
  rewardPresentationQueues.clear();
  currentDiceRewardOriginPoint = null;
  cancelPendingDiceChoice();
  cancelPendingRouteChoice();
  movePlanPresentation = null;
  cancelPendingCoinExchangeChoice();
  nodes.cardRevealStage.hidden = true;
  const normalizedCount = Math.max(1, Math.min(8, Number(count) || 4));
  if (
    selectedStudentProfiles().length !== normalizedCount
    && !(qaHarnessEnabled && selectedStudentProfiles().length === 0)
  ) {
    renderStudentRoster();
    nodes.studentRosterProgress?.focus?.();
    return;
  }
  characterAssignments = normalizeCharacterAssignments(
    characterAssignments,
    normalizedCount,
  );
  if (!characterSelectionComplete(characterAssignments, normalizedCount)) {
    renderCharacterSelection();
    nodes.characterSelectionProgress?.focus?.();
    return;
  }
  destroySentenceListener({ nextStatus: "idle", clearFeedback: true });
  hideTurnFeedback();
  hideTurnShowtime();
  const selectedTheme = THEME_PACKS[themeId] || THEME_PACKS["cloud-harbor"];
  activateWorldComposition(CLOUD_HARBOR_WORLD_REF, {
    preferredTheme: selectedTheme,
    resetCamera: true,
  });
  learningPack = Object.values(LEARNING_PACKS)
    .find((candidate) => candidate.id === learningPackId) || LEARNING_PACKS.family;
  playerCount = normalizedCount;
  const sessionConfig = SESSION_CONFIGS.standard;
  const minimum = Math.max(
    2,
    Math.min(6, Number(minOpportunities) || sessionConfig.minOpportunitiesPerSeat),
  );
  runtime = createPrototypeRuntime(mode);
  const minimumTurns = minimumTurnsForSession({
    playerCount,
    teamCount: runtime.teams.length,
    minOpportunitiesPerSeat: minimum,
  });
  gameSession = createBoardSession({
    sessionId: `local-session-${crypto.randomUUID()}`,
    players: sessionPlayers(playerCount),
    teams: runtime.teams,
    minOpportunitiesPerSeat: minimum,
    minTotalTurns: minimumTurns,
  });
  if (mode === TEACHER_MODE) gameSession = initializeTeacherSession(gameSession);
  teacherSelectedSeatId = null;
  gameSession.assetGameId = gameSession.sessionId;
  gameSession.economyVersion = STAR_ECONOMY_VERSION;
  gameSession.rewardPolicy = "home-points-only.v1";
  gameSession.legacyStarMigration = false;
  // Demo seats have no platform identity and never enter the real wallet flow.
  if (mode === TEACHER_MODE && authenticatedUserId && selectedStudentProfiles().length === normalizedCount) {
    gameSession.landingPoints = { kind: LANDING_POINTS_KIND, ownerId: authenticatedUserId, rule: null };
  }
  landingPointsMessage = "";
  pendingStudentAssetSettlements = [];
  sessionDicePackSnapshot = createSessionDicePackSnapshot();
  sessionNodeRewardPackSnapshot = createSessionNodeRewardPackSnapshot();
  sessionClassroomEventProgramSnapshot = null;
  sessionCardCatalogSnapshot = createSessionCardCatalogSnapshot();
  runtime = {
    ...runtime,
    teams: runtime.teams.map((team) => ({ ...team, completedLaps: 0 })),
    world: worldRuntimeState({
      sessionId: gameSession.sessionId,
      worldRef: CLOUD_HARBOR_WORLD_REF,
      mapState: runtime.mapState,
      levelState: activeLevelPack.initialLevelState || {},
    }),
  };
  runtime = syncRuntimeToSession(runtime, gameSession);
  playerAssetsLedger = createLedgerForSession(gameSession);
  syncVisiblePlayerAssets();
  fairyState = createInitialFairy(runtime);
  lastDicePresentation = null;
  pendingDiceChoice = null;
  routeChoicePresentation = null;
  activityResolutionPending = false;
  lastSessionSummary = null;
  movingTeamId = null;
  visualNodeId = null;
  visitedNodeIds = new Set([activeBoardTemplate.startNodeId]);
  busy = false;
  attemptSequence = 0;
  resetSpeechAttemptTracking();
  camera = initialBoardCamera();
  regionArtSceneCache = null;
  nodes.themeSelect.value = theme.id;
  nodes.learningSelect.value = learningPack.id;
  nodes.playerCount.value = String(playerCount);
  persistStableSession();
  render();
  if (usesLandingPoints()) {
    void ensureLandingRegistration({ retryUnstarted: true })
      .then(() => ensureSpecialCellsOpening()).catch(showLandingError);
  }
  if (!isTeacherSession(gameSession)) void playTurnShowtime();
}

function continueExpeditionSession() {
  if (
    busy
    || gameSession?.screen !== "RESULTS"
    || gameSession?.phase !== "COMPLETED"
    || gameSession?.assetGameEnded
  ) {
    return;
  }

  rewardPresentationEpoch += 1;
  rewardPresentationQueues.clear();
  currentDiceRewardOriginPoint = null;
  cancelPendingDiceChoice();
  cancelPendingRouteChoice();
  movePlanPresentation = null;
  cancelPendingCoinExchangeChoice();
  nodes.cardRevealStage.hidden = true;
  destroySentenceListener({ nextStatus: "idle", clearFeedback: true });
  hideTurnFeedback();
  hideTurnShowtime();

  const previousSession = gameSession;
  const previousRound = runtime.round;
  const minimum = previousSession.minOpportunitiesPerSeat
    || SESSION_CONFIGS.standard.minOpportunitiesPerSeat;
  const minimumTurns = minimumTurnsForSession({
    playerCount,
    teamCount: runtime.teams.length,
    minOpportunitiesPerSeat: minimum,
  });
  const players = previousSession.seats.map((seat) => ({
    id: seat.id,
    displayName: seat.displayName,
    teamId: seat.teamId,
    status: seat.status,
  }));

  gameSession = createBoardSession({
    sessionId: `local-expedition-${crypto.randomUUID()}`,
    players,
    teams: runtime.teams,
    minOpportunitiesPerSeat: minimum,
    minTotalTurns: minimumTurns,
  });
  gameSession.assetGameId = previousSession.assetGameId || previousSession.sessionId;
  gameSession.economyVersion = STAR_ECONOMY_VERSION;
  gameSession.rewardPolicy = "home-points-only.v1";
  gameSession.legacyStarMigration = Boolean(previousSession.legacyStarMigration);
  if (previousSession.landingPoints) gameSession.landingPoints = structuredClone(previousSession.landingPoints);
  sessionDicePackSnapshot = sessionDicePackSnapshot
    || createSessionDicePackSnapshot();
  sessionNodeRewardPackSnapshot = sessionNodeRewardPackSnapshot
    || createSessionNodeRewardPackSnapshot();
  sessionCardCatalogSnapshot = sessionCardCatalogSnapshot
    || createSessionCardCatalogSnapshot();
  runtime = syncRuntimeToSession({
    ...runtime,
    phase: "MISSION_PRESENT",
    currentActivity: null,
    mapState: structuredClone(runtime.world?.active?.mapState || runtime.mapState || {}),
  }, gameSession);
  runtime = {
    ...runtime,
    round: Math.max(previousRound + 1, runtime.round),
  };

  lastSessionSummary = null;
  lastDicePresentation = null;
  pendingDiceChoice = null;
  routeChoicePresentation = null;
  activityResolutionPending = false;
  movingTeamId = null;
  visualNodeId = null;
  busy = false;
  resetSpeechAttemptTracking();
  visitedNodeIds = new Set([
    ...visitedNodeIds,
    ...runtime.teams.map((team) => team.nodeId),
  ]);
  const activeNode = nodeById.get(runtime.teams[runtime.activeTeamIndex]?.nodeId);
  if (activeNode) {
    camera = centerCameraOnPoint(activeNode, cameraBoardTemplate());
  }
  persistStableSession();
  render();
  boardSounds.play("world-arrival", { intensity: 0.52 });
  void playTurnShowtime();
}

function restartGameBlocked() {
  return busy || specialCellsFollowUpActive || !gameSession
    || Boolean(gameSession.teacherOpportunity)
    || gameSession.inputGate === "settlement_pending"
    || (usesLandingPoints() && (needsLandingRecovery()
      || Object.values(currentSpecialCells()?.groupMoves || {}).some((move) =>
        groupLandingEffectsPending(move, currentSpecialCells()))));
}

function renderRestartGameControl() {
  nodes.restartGame.hidden = !gameSession;
  nodes.restartGame.disabled = restartGameBlocked();
  nodes.restartGame.title = nodes.restartGame.disabled
    ? "请先完成当前掷骰及待到账奖励，再重开一局"
    : "封存本局并重新选择学生，已到账的家园积分保留";
}

async function restartCurrentGame() {
  if (restartGameBlocked()) return;
  if (!window.confirm("重开一局？本局进度将封存，已到账的家园积分保留。确认后可重新选择学生和角色。")) return;
  // Recheck after confirmation, then use the existing archive/close path.
  if (restartGameBlocked()) return;
  try {
    await finishCurrentGame({ returnToSetupAfter: true });
    document.querySelector(".board-utility-menu").open = false;
  } catch (error) {
    showLandingError(error);
  }
}

async function finishCurrentGame({ returnToSetupAfter = false } = {}) {
  if (busy || specialCellsFollowUpActive || !gameSession) return;
  if (gameSession.assetGameEnded) {
    if (returnToSetupAfter) await returnToSetup({ clearSnapshot: false });
    return;
  }
  destroySentenceListener({ nextStatus: "idle", clearFeedback: true });
  hideTurnFeedback();
  hideTurnShowtime();
  gameSession = endBoardGame(gameSession);
  persistStableSession(runtime, gameSession, playerAssetsLedger, fairyState, { required: true });
  window.localStorage.setItem(`${LOCAL_SESSION_KEY}:game:${gameSession.assetGameId}`,
    JSON.stringify(savedSessionPayload()));
  // Only original final-landing receipts may retry; ending grants no additional reward.
  if (usesLandingPoints()) {
    const closingId = gameSession.assetGameId;
    void recoverLandingPoints(closingId).catch(showLandingError);
  }
  lastSessionSummary = null;
  render();
  if (returnToSetupAfter) await returnToSetup({ clearSnapshot: false });
}

async function returnToSetup({ clearSnapshot = true } = {}) {
  if (busy || specialCellsFollowUpActive) return;
  rewardPresentationEpoch += 1;
  rewardPresentationQueues.clear();
  currentDiceRewardOriginPoint = null;
  cancelPendingDiceChoice();
  cancelPendingRouteChoice();
  movePlanPresentation = null;
  cancelPendingCoinExchangeChoice();
  nodes.cardRevealStage.hidden = true;
  destroySentenceListener({ nextStatus: "idle", clearFeedback: true });
  hideTurnFeedback();
  hideTurnShowtime();
  // An explicit pause stays on setup after reload; clicking Continue makes the
  // same save active again. This flag changes no turn, position or reward data.
  if (!clearSnapshot && gameSession) {
    persistStableSession(runtime, gameSession, playerAssetsLedger, fairyState,
      { autoResumeOnReload: false });
  }
  // Restored characters follow the saved seat order, not a previous setup roster.
  if (gameSession) selectedStudentIds = gameSession.seats.map(({ id }) => id);
  gameSession = null;
  updateSetupRoster(selectedStudentIds);
  renderStudentRoster();
  pendingStudentAssetSettlements = [];
  sessionDicePackSnapshot = null;
  sessionNodeRewardPackSnapshot = null;
  sessionClassroomEventProgramSnapshot = null;
  sessionCardCatalogSnapshot = null;
  lastSessionSummary = null;
  activateWorldComposition(CLOUD_HARBOR_WORLD_REF, {
    preferredTheme: THEME_PACKS["cloud-harbor"],
    resetCamera: true,
    visitedNodeIds: new Set(),
  });
  runtime = createPrototypeRuntime();
  playerAssetsLedger = createPlayerAssetsLedger({
    playerIds: runtime.teams.map((team, index) => `seat-${index + 1}`),
  });
  syncVisiblePlayerAssets();
  fairyState = createFairyState();
  lastDicePresentation = null;
  pendingDiceChoice = null;
  routeChoicePresentation = null;
  activityResolutionPending = false;
  visitedNodeIds = new Set();
  resetSpeechAttemptTracking();
  camera = initialBoardCamera();
  if (clearSnapshot) clearSavedSession();
  render();
}

function snapshotWorldComposition(payload) {
  const worldRef = payload?.runtime?.world?.active?.worldPackRef
    || CLOUD_HARBOR_WORLD_REF;
  try {
    return resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  } catch {
    return null;
  }
}

function validLocalSnapshot(payload, learningTaskCount, schemaVersion = LOCAL_SESSION_SCHEMA_VERSION) {
  const composition = snapshotWorldComposition(payload);
  if (!composition) return false;
  const savedWorld = payload?.runtime?.world;
  if (savedWorld) {
    const route = WORLD_ROUTES[savedWorld.routeRef];
    if (!route) return false;
    const routeWorldRefs = new Set([
      route.entryWorldRef,
      ...route.transitions.flatMap(({ fromWorldRef, toWorldRef }) => [fromWorldRef, toWorldRef]),
    ]);
    if ([savedWorld.active, ...(savedWorld.completed || [])]
      .some((entry) => !routeWorldRefs.has(entry?.worldPackRef))) return false;
  }
  const snapshotNodeById = new Map(
    composition.board.nodes.map((node) => [node.id, node]),
  );
  return (
    payload?.schemaVersion === schemaVersion
    && (
      schemaVersion < LOCAL_SESSION_SCHEMA_VERSION
      || (
        Boolean(normalizeSessionDicePackSnapshot(payload.dicePackSnapshot))
        && Boolean(normalizeSessionNodeRewardPackSnapshot(payload.nodeRewardPackSnapshot))
      )
    )
    && characterSelectionComplete(payload.characterAssignments, payload.playerCount)
    && isRestorableBoardSessionSnapshot({
      session: payload.gameSession,
      runtime: payload.runtime,
      playerCount: payload.playerCount,
      boardNodeIds: snapshotNodeById,
      expectedBoardId: composition.board.id,
      expectedThemeId: payload.themeId,
      expectedLearningPackId: payload.learningPackId,
      learningTaskCount,
    })
  );
}

function migratedV4Snapshot(payload) {
  const playerIds = stablePlayerIds(payload.gameSession);
  const playerIdByTeamId = Object.fromEntries(
    payload.gameSession.seats.map((seat) => [seat.teamId, seat.id]),
  );
  const migratedLedger = migrateV4PlayerAssets({
    playerIds,
    treasureState: payload.treasureState,
    runtimeTeams: payload.runtime.teams,
    sessionSeats: payload.gameSession.seats,
    playerIdByTeamId,
    guaranteeCursor: stableGuaranteeCursor(payload.gameSession.sessionId, playerIds),
  });
  const {
    treasureState: legacyTreasureState,
    ...rest
  } = payload;
  const mapState = createHarborMapState(rest.runtime?.mapState);
  return {
    ...rest,
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    runtime: {
      ...rest.runtime,
      mapState,
      world: worldRuntimeState({
        sessionId: rest.gameSession.sessionId,
        worldRef: PREVIOUS_CLOUD_HARBOR_WORLD_REF,
        routeRef: PREVIOUS_XIMITU_WORLD_ROUTE_REF,
        mapState,
        levelState: LEVEL_ONE.initialLevelState,
      }),
    },
    playerAssetsLedger: migratedLedger,
    migration: {
      sourceSchemaVersion: 4,
      legacyTreasureStatePreserved: Boolean(legacyTreasureState),
    },
  };
}

function persistMigratedV4Snapshot(rawV4, payloadV5) {
  const existingBackup = window.localStorage.getItem(LOCAL_SESSION_V4_BACKUP_KEY);
  if (existingBackup === null) {
    window.localStorage.setItem(LOCAL_SESSION_V4_BACKUP_KEY, rawV4);
  } else if (existingBackup !== rawV4) {
    const sessionSuffix = String(payloadV5?.gameSession?.sessionId || "unknown")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 72);
    window.localStorage.setItem(
      `${LOCAL_SESSION_V4_BACKUP_KEY}.${sessionSuffix}`,
      rawV4,
    );
  }
  const serialized = JSON.stringify(payloadV5);
  window.localStorage.setItem(LOCAL_SESSION_KEY, serialized);
  const verified = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  if (
    verified?.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION
    || JSON.stringify(verified.playerAssetsLedger) !== JSON.stringify(
      payloadV5.playerAssetsLedger,
    )
  ) {
    window.localStorage.setItem(LOCAL_SESSION_KEY, rawV4);
    throw new Error("v4 migration could not be verified after local persistence");
  }
}

function migratedV5Snapshot(payload) {
  const mapState = createHarborMapState(payload.runtime?.mapState);
  return {
    ...payload,
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    runtime: {
      ...payload.runtime,
      mapState,
      world: worldRuntimeState({
        sessionId: payload.gameSession.sessionId,
        worldRef: PREVIOUS_CLOUD_HARBOR_WORLD_REF,
        routeRef: PREVIOUS_XIMITU_WORLD_ROUTE_REF,
        mapState,
        levelState: LEVEL_ONE.initialLevelState,
      }),
    },
    migration: {
      ...(payload.migration || {}),
      sourceSchemaVersion: 5,
      harborMapStateAdded: true,
    },
  };
}

function persistMigratedV5Snapshot(rawV5, payloadV6) {
  if (window.localStorage.getItem(LOCAL_SESSION_V5_BACKUP_KEY) === null) {
    window.localStorage.setItem(LOCAL_SESSION_V5_BACKUP_KEY, rawV5);
  }
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payloadV6));
  const verified = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  if (
    verified?.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION
    || verified?.runtime?.mapState?.schemaVersion !== "harbor-map-state.v1"
  ) {
    window.localStorage.setItem(LOCAL_SESSION_KEY, rawV5);
    throw new Error("v5 migration could not be verified after local persistence");
  }
}

function migratedV6Snapshot(payload) {
  const mapState = createHarborMapState(payload.runtime?.mapState);
  return {
    ...payload,
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    runtime: {
      ...payload.runtime,
      mapState,
      world: worldRuntimeState({
        sessionId: payload.gameSession.sessionId,
        worldRef: PREVIOUS_CLOUD_HARBOR_WORLD_REF,
        routeRef: PREVIOUS_XIMITU_WORLD_ROUTE_REF,
        mapState,
        levelState: LEVEL_ONE.initialLevelState,
      }),
    },
    migration: {
      ...(payload.migration || {}),
      sourceSchemaVersion: 6,
      forwardWorldRuntimeAdded: true,
    },
  };
}

function persistMigratedV6Snapshot(rawV6, payloadV7) {
  if (window.localStorage.getItem(LOCAL_SESSION_V6_BACKUP_KEY) === null) {
    window.localStorage.setItem(LOCAL_SESSION_V6_BACKUP_KEY, rawV6);
  }
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payloadV7));
  const verified = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  if (
    verified?.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION
    || verified?.runtime?.world?.schemaVersion !== "world-runtime.v1"
    || verified?.runtime?.world?.active?.worldPackRef !== PREVIOUS_CLOUD_HARBOR_WORLD_REF
  ) {
    window.localStorage.setItem(LOCAL_SESSION_KEY, rawV6);
    throw new Error("v6 migration could not be verified after local persistence");
  }
}

function migratedV7Snapshot(payload) {
  const legacyWorld = payload?.runtime?.world;
  if (
    !legacyWorld?.active
    || legacyWorld.routeRef !== LEGACY_XIMITU_WORLD_ROUTE_REF
  ) {
    throw new Error("v7 snapshot does not use the registered legacy world route");
  }
  const migrateWorldEntry = (entry) => ({
    ...entry,
    worldPackRef: entry?.worldPackRef === LEGACY_CLOUD_HARBOR_WORLD_REF
      ? PREVIOUS_CLOUD_HARBOR_WORLD_REF
      : entry?.worldPackRef,
  });
  return {
    ...payload,
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    runtime: {
      ...payload.runtime,
      world: {
        ...legacyWorld,
        routeRef: PREVIOUS_XIMITU_WORLD_ROUTE_REF,
        active: migrateWorldEntry(legacyWorld.active),
        completed: (legacyWorld.completed || []).map(migrateWorldEntry),
      },
    },
    migration: {
      ...(payload.migration || {}),
      sourceSchemaVersion: 7,
      worldCompositionVersionUpdated: true,
    },
  };
}

function persistMigratedV7Snapshot(rawV7, payloadV8) {
  if (window.localStorage.getItem(LOCAL_SESSION_V7_BACKUP_KEY) === null) {
    window.localStorage.setItem(LOCAL_SESSION_V7_BACKUP_KEY, rawV7);
  }
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payloadV8));
  const verified = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  const worldEntries = [
    verified?.runtime?.world?.active,
    ...(verified?.runtime?.world?.completed || []),
  ];
  if (
    verified?.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION
    || verified?.runtime?.world?.routeRef !== PREVIOUS_XIMITU_WORLD_ROUTE_REF
    || worldEntries.some(({ worldPackRef } = {}) => (
      worldPackRef === LEGACY_CLOUD_HARBOR_WORLD_REF
    ))
  ) {
    window.localStorage.setItem(LOCAL_SESSION_KEY, rawV7);
    throw new Error("v7 migration could not be verified after local persistence");
  }
}

function migratedV8Snapshot(payload) {
  return {
    ...payload,
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    dicePackSnapshot: createSessionDicePackSnapshot({
      status: "legacy-default",
      revision: null,
      pack: DEFAULT_DICE_PACK,
    }),
    migration: {
      ...(payload.migration || {}),
      sourceSchemaVersion: 8,
      dicePackSnapshotAdded: true,
    },
  };
}

function persistMigratedV8Snapshot(rawV8, payloadV9) {
  if (window.localStorage.getItem(LOCAL_SESSION_V8_BACKUP_KEY) === null) {
    window.localStorage.setItem(LOCAL_SESSION_V8_BACKUP_KEY, rawV8);
  }
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payloadV9));
  const verified = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  if (
    verified?.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION
    || !normalizeSessionDicePackSnapshot(verified?.dicePackSnapshot)
  ) {
    window.localStorage.setItem(LOCAL_SESSION_KEY, rawV8);
    throw new Error("v8 migration could not be verified after local persistence");
  }
}

function migratedV9Snapshot(payload) {
  return {
    ...payload,
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    nodeRewardPackSnapshot: createSessionNodeRewardPackSnapshot({
      status: "legacy-default",
      revision: null,
      pack: retargetNodeRewardPack(
        DEFAULT_NODE_REWARD_PACK,
        isCloudHarborWorldRef(payload.runtime?.world?.active?.worldPackRef)
          ? payload.runtime.world.active.worldPackRef
          : PREVIOUS_CLOUD_HARBOR_WORLD_REF,
      ),
    }),
    classroomEventProgramSnapshot: createSessionClassroomEventProgramSnapshot({
      status: "legacy-default",
      revision: null,
      program: DEFAULT_CLASSROOM_EVENT_PROGRAM,
    }),
    migration: {
      ...(payload.migration || {}),
      sourceSchemaVersion: 9,
      nodeRewardPackSnapshotAdded: true,
      classroomEventProgramSnapshotAdded: true,
    },
  };
}

function persistMigratedV9Snapshot(rawV9, payloadV10) {
  if (window.localStorage.getItem(LOCAL_SESSION_V9_BACKUP_KEY) === null) {
    window.localStorage.setItem(LOCAL_SESSION_V9_BACKUP_KEY, rawV9);
  }
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payloadV10));
  const verified = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  if (
    verified?.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION
    || !normalizeSessionDicePackSnapshot(verified?.dicePackSnapshot)
    || !normalizeSessionNodeRewardPackSnapshot(verified?.nodeRewardPackSnapshot)
    || !normalizeSessionClassroomEventProgramSnapshot(
      verified?.classroomEventProgramSnapshot,
    )
  ) {
    window.localStorage.setItem(LOCAL_SESSION_KEY, rawV9);
    throw new Error("v9 migration could not be verified after local persistence");
  }
}

function migratedV10Snapshot(payload) {
  return {
    ...payload,
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    classroomEventProgramSnapshot: createSessionClassroomEventProgramSnapshot({
      status: "legacy-default",
      revision: null,
      program: DEFAULT_CLASSROOM_EVENT_PROGRAM,
    }),
    migration: {
      ...(payload.migration || {}),
      sourceSchemaVersion: 10,
      classroomEventProgramSnapshotAdded: true,
    },
  };
}

function migratedV11Snapshot(payload) {
  return {
    ...payload,
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    cardCatalogSnapshot: createSessionCardCatalogSnapshot(),
    migration: {
      ...(payload.migration || {}),
      sourceSchemaVersion: 11,
      cardCatalogSnapshotAdded: true,
      classroomEventProgramMadeReadOnly: true,
    },
  };
}

function persistMigratedV11Snapshot(rawV11, payloadV12) {
  if (window.localStorage.getItem(LOCAL_SESSION_V11_BACKUP_KEY) === null) {
    window.localStorage.setItem(LOCAL_SESSION_V11_BACKUP_KEY, rawV11);
  }
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payloadV12));
  const verified = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  if (
    verified?.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION
    || !normalizeSessionDicePackSnapshot(verified?.dicePackSnapshot)
    || !normalizeSessionNodeRewardPackSnapshot(verified?.nodeRewardPackSnapshot)
    || !normalizeSessionCardCatalogSnapshot(verified?.cardCatalogSnapshot)
  ) {
    window.localStorage.setItem(LOCAL_SESSION_KEY, rawV11);
    throw new Error("v11 migration could not be verified after local persistence");
  }
}

function persistMigratedV10Snapshot(rawV10, payloadV11) {
  if (window.localStorage.getItem(LOCAL_SESSION_V10_BACKUP_KEY) === null) {
    window.localStorage.setItem(LOCAL_SESSION_V10_BACKUP_KEY, rawV10);
  }
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payloadV11));
  const verified = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) || "null");
  if (
    verified?.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION
    || !normalizeSessionDicePackSnapshot(verified?.dicePackSnapshot)
    || !normalizeSessionNodeRewardPackSnapshot(verified?.nodeRewardPackSnapshot)
    || !normalizeSessionClassroomEventProgramSnapshot(
      verified?.classroomEventProgramSnapshot,
    )
  ) {
    window.localStorage.setItem(LOCAL_SESSION_KEY, rawV10);
    throw new Error("v10 migration could not be verified after local persistence");
  }
}

function restoreLocalSession() {
  rewardPresentationEpoch += 1;
  rewardPresentationQueues.clear();
  currentDiceRewardOriginPoint = null;
  cancelPendingDiceChoice();
  cancelPendingRouteChoice();
  movePlanPresentation = null;
  cancelPendingCoinExchangeChoice();
  destroySentenceListener({ nextStatus: "idle", clearFeedback: true });
  let payload;
  let rawSnapshot;
  try {
    rawSnapshot = window.localStorage.getItem(LOCAL_SESSION_KEY) || "null";
    payload = JSON.parse(rawSnapshot);
  } catch (error) {
    console.warn("local voice-board snapshot could not be parsed and was preserved", error);
    nodes.resumeSession.hidden = true;
    return;
  }
  const initialSnapshotComposition = snapshotWorldComposition(payload);
  const restoredTheme = THEME_PACKS[payload?.themeId]
    || initialSnapshotComposition?.theme;
  const restoredLearningPack = Object.values(LEARNING_PACKS)
    .find((candidate) => candidate.id === payload?.learningPackId);
  const sourceSchemaVersion = payload?.schemaVersion;
  if (
    ![4, 5, 6, 7, 8, 9, 10, 11, LOCAL_SESSION_SCHEMA_VERSION].includes(sourceSchemaVersion)
    || !validLocalSnapshot(
      payload,
      restoredLearningPack?.tasks?.length,
      sourceSchemaVersion,
    )
    || !restoredTheme
    || (!isTeacherSession(payload?.gameSession) && !restoredLearningPack)
  ) {
    console.warn("incompatible local voice-board snapshot was preserved");
    nodes.resumeSession.hidden = true;
    return;
  }
  if (sourceSchemaVersion === 4) {
    try {
      const migrated = migratedV4Snapshot(payload);
      persistMigratedV4Snapshot(rawSnapshot, migrated);
      payload = migrated;
    } catch (error) {
      console.warn("v4 local voice-board snapshot migration was not completed", error);
      nodes.resumeSession.hidden = true;
      return;
    }
  }
  if (sourceSchemaVersion === 5) {
    try {
      const migrated = migratedV5Snapshot(payload);
      persistMigratedV5Snapshot(rawSnapshot, migrated);
      payload = migrated;
    } catch (error) {
      console.warn("v5 local voice-board snapshot migration was not completed", error);
      nodes.resumeSession.hidden = true;
      return;
    }
  }
  if (sourceSchemaVersion === 6) {
    try {
      const migrated = migratedV6Snapshot(payload);
      persistMigratedV6Snapshot(rawSnapshot, migrated);
      payload = migrated;
    } catch (error) {
      console.warn("v6 local voice-board snapshot migration was not completed", error);
      nodes.resumeSession.hidden = true;
      return;
    }
  }
  if (sourceSchemaVersion === 7) {
    try {
      const migrated = migratedV7Snapshot(payload);
      persistMigratedV7Snapshot(rawSnapshot, migrated);
      payload = migrated;
    } catch (error) {
      console.warn("v7 local voice-board snapshot migration was not completed", error);
      nodes.resumeSession.hidden = true;
      return;
    }
  }
  if (sourceSchemaVersion === 8) {
    try {
      const migrated = migratedV8Snapshot(payload);
      persistMigratedV8Snapshot(rawSnapshot, migrated);
      payload = migrated;
    } catch (error) {
      console.warn("v8 local voice-board snapshot migration was not completed", error);
      nodes.resumeSession.hidden = true;
      return;
    }
  }
  if (sourceSchemaVersion === 9) {
    try {
      const migrated = migratedV9Snapshot(payload);
      persistMigratedV9Snapshot(rawSnapshot, migrated);
      payload = migrated;
    } catch (error) {
      console.warn("v9 local voice-board snapshot migration was not completed", error);
      nodes.resumeSession.hidden = true;
      return;
    }
  }
  if (sourceSchemaVersion === 10) {
    try {
      const migrated = migratedV10Snapshot(payload);
      persistMigratedV10Snapshot(rawSnapshot, migrated);
      payload = migrated;
    } catch (error) {
      console.warn("v10 local voice-board snapshot migration was not completed", error);
      nodes.resumeSession.hidden = true;
      return;
    }
  }
  if (sourceSchemaVersion === 11) {
    try {
      const migrated = migratedV11Snapshot(payload);
      persistMigratedV11Snapshot(rawSnapshot, migrated);
      payload = migrated;
    } catch (error) {
      console.warn("v11 local voice-board snapshot migration was not completed", error);
      nodes.resumeSession.hidden = true;
      return;
    }
  }
  let restoredRuntime = payload.runtime;
  let restoredSession = payload.gameSession;
  let restoredPlayerAssetsLedger;
  let restoredFairyState;
  let restoredSummary = null;
  try {
    const isLegacyEconomy = restoredSession.economyVersion !== STAR_ECONOMY_VERSION;
    if (isLegacyEconomy) {
      const backupKey = `${LOCAL_SESSION_KEY}:before-stars:${restoredSession.sessionId}`;
      if (!window.localStorage.getItem(backupKey)) window.localStorage.setItem(backupKey, rawSnapshot);
    }
    restoredPlayerAssetsLedger = createPlayerAssetsLedger({
      playerIds: stablePlayerIds(restoredSession),
      playerAssetsById: payload.playerAssetsLedger?.playerAssetsById,
      guaranteeCursor: payload.playerAssetsLedger?.guaranteeCursor,
      processedSettlementIds: payload.playerAssetsLedger?.processedSettlementIds,
      legacyUnassigned: payload.playerAssetsLedger?.legacyUnassigned,
    });
    const legacyFairyState = createFairyState(payload.fairyState);
    // The original snapshot above retains retired fairy/case data for audit.
    void legacyFairyState;
    if (restoredSession.rewardPolicy !== "home-points-only.v1") {
      const backupKey = `${LOCAL_SESSION_KEY}:before-points-only:${restoredSession.sessionId}`;
      if (!window.localStorage.getItem(backupKey)) window.localStorage.setItem(backupKey, rawSnapshot);
    }
    restoredSession = { ...restoredSession,
      rewardPolicy: "home-points-only.v1",
      economyVersion: STAR_ECONOMY_VERSION,
      assetGameId: restoredSession.assetGameId || restoredSession.sessionId,
      legacyStarMigration: isLegacyEconomy || Boolean(restoredSession.legacyStarMigration),
    };
    restoredFairyState = createFairyState();
    const restoredWorldRef = restoredRuntime.world?.active?.worldPackRef
      || CLOUD_HARBOR_WORLD_REF;
    restoredRuntime = {
      ...restoredRuntime,
      mapState: isCloudHarborWorldRef(restoredWorldRef)
        ? createHarborMapState(restoredRuntime.mapState)
        : structuredClone(restoredRuntime.world?.active?.mapState || restoredRuntime.mapState || {}),
    };
    if (restoredSession.phase === "ACTIVITY_ACTIVE" && restoredSession.currentActivity) {
      restoredRuntime = closeActivity(restoredRuntime);
      restoredSession = resolveSessionActivity(restoredSession, { outcome: "skipped" });
    } else if (restoredRuntime.currentActivity || restoredRuntime.phase === "EVENT_ACTIVE") {
      restoredRuntime = closeActivity(restoredRuntime);
    }
    if (restoredSession.inputGate === "settlement_pending") {
      restoredSession = acknowledgePresentation(restoredSession, {
        eventId: restoredSession.pendingPresentation.eventId,
        activityPending: false,
      });
    }
    restoredRuntime = syncRuntimeToSession(restoredRuntime, restoredSession);
    restoredSummary = restoredSession.phase === "COMPLETED"
      ? buildSessionSummary(restoredSession, restoredRuntime.teams)
      : null;
  } catch (error) {
    console.warn("incompatible local voice-board snapshot was preserved", error);
    nodes.resumeSession.hidden = true;
    return;
  }
  const restoredComposition = snapshotWorldComposition(payload);
  if (!restoredComposition) {
    nodes.resumeSession.hidden = true;
    return;
  }
  activateWorldComposition(restoredComposition.worldRef, {
    preferredTheme: restoredTheme,
    resetCamera: true,
    visitedNodeIds: new Set(restoredRuntime.teams.map((team) => team.nodeId)),
  });
  learningPack = restoredLearningPack || LEARNING_PACKS.family;
  nodes.setupMode.value = isTeacherSession(restoredSession) ? TEACHER_MODE : "voice";
  teacherSelectedSeatId = restoredSession.teacherOpportunity?.seatId
    || (restoredSession.seats.some((seat) => seat.id === payload.teacherSelectedSeatId)
      ? payload.teacherSelectedSeatId : null);
  selectedStudentIds = restoredSession.seats.map(({ id }) => id);
  playerCount = payload.playerCount;
  characterAssignments = normalizeCharacterAssignments(
    payload.characterAssignments,
    playerCount,
  );
  attemptSequence = Math.max(0, Number(payload.attemptSequence) || 0);
  const restoredSpeechAttemptState = payload.speechAttemptState || {};
  speechAttemptTurnKey = typeof restoredSpeechAttemptState.turnKey === "string"
    ? restoredSpeechAttemptState.turnKey
    : null;
  speechAttemptOrdinal = Math.max(
    0,
    Math.min(1, Number(restoredSpeechAttemptState.ordinal) || 0),
  );
  scoreRetryUsedTurnKey = (
    typeof restoredSpeechAttemptState.scoreRetryUsedTurnKey === "string"
  )
    ? restoredSpeechAttemptState.scoreRetryUsedTurnKey
    : null;
  runtime = restoredRuntime;
  gameSession = restoredSession;
  pendingStudentAssetSettlements = Array.isArray(payload.pendingStudentAssetSettlements)
    ? payload.pendingStudentAssetSettlements
        .filter((settlement) => settlement && typeof settlement === "object")
        .slice(0, 64)
        .map((settlement) => structuredClone(settlement))
    : [];
  playerAssetsLedger = restoredPlayerAssetsLedger;
  syncVisiblePlayerAssets();
  fairyState = restoredFairyState;
  sessionDicePackSnapshot = normalizeSessionDicePackSnapshot(payload.dicePackSnapshot)
    || createSessionDicePackSnapshot({
      status: "legacy-default",
      revision: null,
      pack: DEFAULT_DICE_PACK,
    });
  sessionNodeRewardPackSnapshot = normalizeSessionNodeRewardPackSnapshot(
    payload.nodeRewardPackSnapshot,
  ) || createSessionNodeRewardPackSnapshot({
    status: "legacy-default",
    revision: null,
    pack: retargetNodeRewardPack(
      DEFAULT_NODE_REWARD_PACK,
      WORLD_ROUTES[restoredRuntime.world?.routeRef]?.entryWorldRef
        || PREVIOUS_CLOUD_HARBOR_WORLD_REF,
    ),
  });
  sessionClassroomEventProgramSnapshot = normalizeSessionClassroomEventProgramSnapshot(
    payload.classroomEventProgramSnapshot,
  );
  sessionCardCatalogSnapshot = normalizeSessionCardCatalogSnapshot(
    payload.cardCatalogSnapshot,
  ) || createSessionCardCatalogSnapshot();
  // Display-only legacy metadata cannot block restoration of the saved move/die.
  try {
    lastDicePresentation = payload.lastDicePresentation ? pointsOnlyDicePresentation(payload.lastDicePresentation) : null;
  } catch { lastDicePresentation = null; }
  routeChoicePresentation = null;
  activityResolutionPending = false;
  visitedNodeIds = new Set(runtime.teams.map((team) => team.nodeId));
  camera = clampCamera(payload.camera || initialBoardCamera(), cameraBounds(cameraBoardTemplate()));
  const restoredPawn = nodeById.get(activePawnNodeId());
  if (restoredPawn && !isPointVisible(restoredPawn, camera, cameraBoardTemplate(), 80)) {
    camera = centerCameraOnPoint(restoredPawn, cameraBoardTemplate());
  }
  lastSessionSummary = restoredSummary;
  nodes.setupTheme.value = THEME_PACKS[theme.id] ? theme.id : "cloud-harbor";
  nodes.setupLearning.value = learningPack.id;
  nodes.setupPlayerCount.value = String(playerCount);
  nodes.setupOpportunities.value = String(gameSession.minOpportunitiesPerSeat || 2);
  nodes.themeSelect.value = THEME_PACKS[theme.id] ? theme.id : "cloud-harbor";
  nodes.learningSelect.value = learningPack.id;
  nodes.playerCount.value = String(playerCount);
  persistStableSession();
  render();
  // Recovery only reads the original server registration. It cannot register an old save.
  if (usesLandingPoints()) {
    void (gameSession.landingPoints.rule ? recoverLandingPoints()
      : ensureLandingRegistration({ retryUnstarted: true }))
      .then(() => ensureSpecialCellsOpening()).catch(showLandingError);
  }
  if (gameSession.phase === "ANSWER_LISTENING") {
    nodes.voiceState.textContent = "已恢复上次棋局 · 可以继续发言";
    void playTurnShowtime();
  }
}

function canOpenSpeechWindow() {
  return (
    !busy
    && !showtimeActive
    && !runtime.currentActivity
    && gameSession?.screen === "PLAYING"
    && gameSession.phase === "ANSWER_LISTENING"
    && gameSession.inputGate === "open"
    && runtime.phase !== "EVENT_ACTIVE"
  );
}

function stableSpeechAttemptId(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `voice-board-${gameSession?.turnSequence || 0}-${(hash >>> 0).toString(16)}`;
}

function currentSpeechTurnContext() {
  if (!gameSession || isTeacherSession(gameSession)) return null;
  const task = currentTask(runtime, learningPack);
  if (!task) return null;
  const turnId = `turn-${gameSession.turnSequence}`;
  const key = [
    gameSession.sessionId,
    turnId,
    learningPack.id,
    learningPack.version,
    task.id,
  ].join(":");
  if (speechAttemptTurnKey !== key) {
    speechAttemptTurnKey = key;
    speechAttemptOrdinal = 0;
  }
  return {
    key,
    gameSessionId: gameSession.sessionId,
    turnId,
    attemptId: stableSpeechAttemptId(`${key}:attempt-${speechAttemptOrdinal}`),
    learningPackId: learningPack.id,
    learningPackVersion: learningPack.version,
    taskId: task.id,
  };
}

function scoreRetryAvailable() {
  const context = currentSpeechTurnContext();
  return Boolean(context && scoreRetryUsedTurnKey !== context.key);
}

function consumeScoreRetry() {
  const context = currentSpeechTurnContext();
  if (!context || scoreRetryUsedTurnKey === context.key) return false;
  scoreRetryUsedTurnKey = context.key;
  speechAttemptOrdinal = Math.min(1, speechAttemptOrdinal + 1);
  persistStableSession();
  return true;
}

function currentTaskCanonicalTranscript(fallback = "本题完整回答") {
  const modelContent = currentTask(runtime, learningPack)?.feedback?.modelContent;
  return typeof modelContent === "string" && modelContent.trim()
    ? modelContent.trim()
    : fallback;
}

function speechDecisionCopy(decision) {
  if (decision?.result === "accepted" && Number.isFinite(Number(decision.score))) {
    if (decision?.knowledgeStatus === "wrong") {
      const policyDisplayName = (
        typeof decision?.assessmentPolicy?.displayName === "string"
        && decision.assessmentPolicy.displayName.trim()
      )
        ? decision.assessmentPolicy.displayName.trim()
        : "主知识点";
      return `${policyDisplayName}：这次用错了 · 本轮 ${Math.round(decision.score)} 分`;
    }
    const tier = diceTierForScore(decision.score);
    return `${Math.round(decision.score)} 分 · ${tier?.diceLabel || "准备骰子"}`;
  }
  if (decision?.result === "teacher_review") {
    return decision?.knowledgeStatus === "uncertain"
      ? "考点证据不够明确 · 请老师确认"
      : "已经很接近 · 请老师确认";
  }
  if (decision?.result === "retry") {
    if (decision?.knowledgeStatus === "wrong") {
      const policyDisplayName = (
        typeof decision?.assessmentPolicy?.displayName === "string"
        && decision.assessmentPolicy.displayName.trim()
      )
        ? decision.assessmentPolicy.displayName.trim()
        : "主知识点";
      return `${policyDisplayName}：用错了 · 再试一次`;
    }
    return "这次没有听清 · 请再读一次";
  }
  return "";
}

const FEEDBACK_PHASES = ["judgement", "reward", "dice", "move", "effect"];

function clearTurnFeedbackTimers() {
  if (turnFeedbackDismissTimer !== null) {
    window.clearTimeout(turnFeedbackDismissTimer);
    turnFeedbackDismissTimer = null;
  }
  if (turnFeedbackExitTimer !== null) {
    window.clearTimeout(turnFeedbackExitTimer);
    turnFeedbackExitTimer = null;
  }
}

function completeTurnFeedbackDismiss() {
  if (!nodes.turnFeedback) return;
  turnFeedbackExitTimer = null;
  nodes.turnFeedback.hidden = true;
  nodes.turnFeedback.classList.remove("is-closing");
  nodes.turnFeedback.dataset.visibility = "closed";
}

function hideTurnFeedback({ immediate = false } = {}) {
  if (!nodes.turnFeedback) return;
  clearTurnFeedbackTimers();
  if (nodes.turnFeedback.hidden || immediate) {
    completeTurnFeedbackDismiss();
    return;
  }
  nodes.turnFeedback.classList.add("is-closing");
  nodes.turnFeedback.dataset.visibility = "closing";
  const exitDuration = qaControlsEnabled && QA_FAST_MODE_REQUESTED
    ? 30
    : reducedMotionRequested()
      ? 160
      : TURN_FEEDBACK_EXIT_MS;
  turnFeedbackExitTimer = window.setTimeout(
    completeTurnFeedbackDismiss,
    exitDuration,
  );
}

function scheduleTurnFeedbackDismiss() {
  if (!nodes.turnFeedback) return;
  if (turnFeedbackDismissTimer !== null) {
    window.clearTimeout(turnFeedbackDismissTimer);
  }
  const duration = qaControlsEnabled && QA_FAST_MODE_REQUESTED
    ? 260
    : TURN_FEEDBACK_AUTO_DISMISS_MS;
  turnFeedbackDismissTimer = window.setTimeout(() => {
    turnFeedbackDismissTimer = null;
    hideTurnFeedback();
  }, duration);
}

function renderTurnFeedback({
  profile,
  title = profile.outcomeLabel,
  kicker = "本轮判定",
  transcript = "",
  guidance = "",
  phase = "judgement",
  moveText = "等待投骰",
} = {}) {
  if (!nodes.turnFeedback || !profile) return;
  // Teacher play already shows the die, movement and credited points in place.
  // Keep the scored voice-mode feedback required by the assessment contract.
  if (isTeacherSession(gameSession)) {
    hideTurnFeedback({ immediate: true });
    return;
  }
  clearTurnFeedbackTimers();
  nodes.turnFeedback.hidden = false;
  nodes.turnFeedback.classList.remove("is-closing");
  nodes.turnFeedback.dataset.visibility = "open";
  nodes.turnFeedback.dataset.state = profile.tone;
  nodes.turnFeedback.dataset.phase = phase;
  nodes.feedbackKicker.textContent = kicker;
  nodes.feedbackTitle.textContent = title;
  nodes.feedbackTranscript.textContent = isTeacherSession(gameSession) ? "老师奖励 · 一次掷骰机会" : transcript
    ? `你说：${transcript}`
    : "正在确认这次回答";
  nodes.feedbackGuidance.textContent = guidance;
  nodes.feedbackGuidance.hidden = !guidance;
  nodes.feedbackScore.textContent = Number.isFinite(profile.score)
    ? String(Math.round(profile.score))
    : "—";
  nodes.feedbackDice.textContent = profile.diceLabel;
  nodes.feedbackScore.closest("span").hidden = isTeacherSession(gameSession);
  nodes.feedbackDice.previousElementSibling.textContent = isTeacherSession(gameSession) ? "固定骰子" : "解锁骰子";
  nodes.feedbackMove.textContent = moveText;
  const phaseIndex = phase === "summary"
    ? FEEDBACK_PHASES.length - 1
    : Math.max(0, FEEDBACK_PHASES.indexOf(phase));
  nodes.turnFeedback.querySelectorAll("[data-feedback-step]").forEach((item, index) => {
    item.hidden = isTeacherSession(gameSession) && ["judgement", "reward"].includes(item.dataset.feedbackStep);
    if (item.dataset.feedbackStep === "dice") item.textContent = isTeacherSession(gameSession) ? "掷骰子" : "选骰子";
    item.classList.toggle("is-complete", index < phaseIndex);
    item.classList.toggle("is-current", index === phaseIndex);
  });
  scheduleTurnFeedbackDismiss();
}

function speechDecisionGuidance(decision, profile) {
  if (
    decision?.result === "accepted"
    && decision?.knowledgeStatus === "wrong"
  ) {
    return decision?.expectedForm
      ? `这题要用 ${decision.expectedForm}。本轮按低分完成，继续下一次挑战。`
      : "主知识点这次用错了。本轮按低分完成，继续下一次挑战。";
  }
  if (decision?.result === "retry") {
    if (decision?.knowledgeStatus === "wrong" && decision?.expectedForm) {
      return `这题要用 ${decision.expectedForm}。跟着题卡再读一次完整句子。`;
    }
    return `跟着题卡再试一次：${
      currentTask(runtime, learningPack)?.feedback?.modelContent || "慢一点读完整句"
    }`;
  }
  if (decision?.result === "teacher_review") {
    return "老师可以给一次课堂助力，也可以让孩子再试一次。";
  }
  if (Number.isFinite(profile.score)) {
    return profile.score >= 80
      ? "高分会经常进入传奇骰区，但骰池和点数仍然充满随机惊喜。"
      : "分数只决定本轮骰子档位，不会给孩子排名。";
  }
  return "";
}

function showSpeechDecisionFeedback(decision) {
  const profile = turnRewardProfile({
    result: decision?.result,
    missing: decision?.missing,
    aiScore: decision?.score,
  });
  renderTurnFeedback({
    profile,
    transcript: decision?.transcript || "（未识别到完整内容）",
    guidance: speechDecisionGuidance(decision, profile),
    phase: "judgement",
    moveText: profile.diceTier ? "准备选择骰子" : "暂不移动",
  });
}

function hideTurnShowtime() {
  showtimeSequence += 1;
  showtimeActive = false;
  if (nodes.turnShowtime) nodes.turnShowtime.hidden = true;
}

async function playTurnShowtime() {
  if (
    !nodes.turnShowtime
    || busy
    || gameSession?.screen !== "PLAYING"
    || gameSession.phase !== "ANSWER_LISTENING"
    || gameSession.inputGate !== "open"
  ) {
    return;
  }
  hideTurnFeedback();
  const sequence = ++showtimeSequence;
  const seat = currentSessionSeat(gameSession);
  const character = activeCharacterProfile();
  showtimeActive = true;
  renderHtmlCharacterAvatar(nodes.showtimeAvatar, character, {
    variant: "hud",
  });
  nodes.showtimeName.textContent = seat?.displayName || "下一位冒险家";
  nodes.showtimeRole.textContent = character.label;
  nodes.showtimeTeam.textContent = "个人回合 · 轮到我啦";
  nodes.turnShowtime.style.setProperty("--character-accent", character.accent);
  nodes.turnShowtime.hidden = false;
  renderSpeechControls();
  await sleep(reducedMotionRequested() ? 1200 : 2200);
  if (sequence !== showtimeSequence) return;
  showtimeActive = false;
  nodes.turnShowtime.hidden = true;
  renderSpeechControls();
  const turnFocusTarget = nodes.asrToggle.disabled
    ? nodes.boardViewport
    : nodes.asrToggle;
  turnFocusTarget.focus({ preventScroll: true });
}

function renderSpeechControls() {
  if (isTeacherSession(gameSession)) { nodes.asrToggle.disabled = true; return; }
  if (!nodes.asrConsole) return;
  const canListen = canOpenSpeechWindow();
  const cloudAssessmentReady = (
    voiceBoardAssessmentConfigured
    && voiceBoardKnowledgeAsrConfigured
    && voiceBoardAsrAuthenticated
  );
  const browserFallbackReady = (
    !cloudAssessmentReady
    && voiceBoardBrowserFallbackAvailable
  );
  const unavailable = (
    speechStatus !== "checking"
    && !cloudAssessmentReady
    && !browserFallbackReady
  );
  const preparing = ["checking", "requesting_permission", "connecting"]
    .includes(speechStatus);
  const speechUiState = unavailable
    ? "unavailable"
    : preparing
      ? "preparing"
      : speechStatus;
  const speechBusy = preparing || speechStatus === "scoring";
  const previousSpeechUiState = nodes.missionDock.dataset.speechState;
  nodes.asrStatusLine.setAttribute(
    "role",
    speechStatus === "error" ? "alert" : "status",
  );
  nodes.asrStatusLine.setAttribute(
    "aria-live",
    speechStatus === "error" ? "assertive" : "polite",
  );

  if (speechStatus === "checking") {
    nodes.asrAvailability.textContent = "正在检查语音服务，请稍候…";
  } else if (unavailable && !voiceBoardAssessmentConfigured) {
    nodes.asrAvailability.textContent = "声音魔法还没准备好，请老师帮忙";
  } else if (unavailable && !voiceBoardKnowledgeAsrConfigured) {
    nodes.asrAvailability.textContent = "知识点判断服务还没准备好，请稍后再试";
  } else if (unavailable && !voiceBoardAsrAuthenticated) {
    nodes.asrAvailability.textContent = "请老师先进入课堂";
  } else if (speechStatus === "requesting_permission") {
    nodes.asrAvailability.textContent = "正在准备麦克风，请允许使用后再开始说…";
  } else if (speechStatus === "connecting") {
    nodes.asrAvailability.textContent = "正在连接语音引擎，还没有开始录音…";
  } else if (speechStatus === "listening") {
    nodes.asrAvailability.textContent = browserFallbackReady
      ? "正在录音 · 说完后会自动结束"
      : "正在录音 · AI 会在你说完整句后自动结束";
  } else if (speechStatus === "scoring") {
    nodes.asrAvailability.textContent = browserFallbackReady
      ? "回答已提交 · 正在整理识别结果…"
      : "回答已提交 · AI 正在生成本轮表现分…";
  } else if (speechStatus === "review") {
    nodes.asrAvailability.textContent = "已经很接近，请老师确认";
  } else if (speechStatus === "retry") {
    nodes.asrAvailability.textContent = "再试一次，把整句慢慢读完";
  } else if (speechStatus === "error") {
    nodes.asrAvailability.textContent = "声音精灵打了个盹，请稍后再试";
  } else if (speechStatus === "accepted") {
    nodes.asrAvailability.textContent = pendingSpeechDecision?.result === "teacher_review"
      ? "老师已确认 · 正在准备课堂助力骰"
      : "本轮评分已完成 · 正在准备骰子";
  } else if (browserFallbackReady) {
    nodes.asrAvailability.textContent = "本地声音模式已就绪 · 读完请老师确认";
  } else {
    nodes.asrAvailability.textContent = "准备好了，轮到你来读";
  }

  nodes.asrTranscript.textContent = speechTranscript || (
    browserFallbackReady
      ? "说完后，这里会显示识别文字；本地模式不生成 AI 分数"
      : "说完后，这里会出现本轮表现分"
  );
  nodes.asrConsole.dataset.state = speechUiState;
  nodes.missionDock.dataset.speechState = speechUiState;
  nodes.missionDock.dataset.speechBusy = String(speechBusy);
  nodes.asrToggle.setAttribute("aria-busy", String(speechBusy));
  nodes.asrToggle.textContent = speechStatus === "listening"
    ? browserFallbackReady
      ? "提前结束录音"
      : "提前结束并评分"
    : speechStatus === "scoring"
      ? browserFallbackReady
        ? "正在整理…"
        : "正在评分…"
      : preparing
        ? "准备麦克风…"
        : speechStatus === "retry"
          ? "再试一次"
          : "开始回答";
  nodes.asrToggle.disabled = (
    unavailable
    || speechBusy
    || (speechStatus !== "listening" && !canListen)
  );
  nodes.teacherAccept.hidden = !(
    canListen
    && pendingSpeechDecision?.result === "teacher_review"
  );
  nodes.teacherAccept.disabled = busy;
  const qaVisible = qaControlsEnabled && QA_PAGE_REQUESTED;
  nodes.teacherTools.hidden = !qaVisible;
  if (nodes.layoutEditorOpen) {
    nodes.layoutEditorOpen.hidden = !(
      layoutEditorAuthorized
      && !gameSession
      && !layoutEditor.active
    );
  }
  if (nodes.gameAuthoringOpen) {
    const authoringUrl = new URL(window.location.href);
    authoringUrl.search = "";
    authoringUrl.searchParams.set("layoutEditor", "1");
    if (qaControlsEnabled && QA_PAGE_REQUESTED) {
      authoringUrl.searchParams.set("qa", "1");
    }
    nodes.gameAuthoringOpen.href = authoringUrl.toString();
    nodes.gameAuthoringOpen.hidden = !(
      layoutEditorAuthorized
      && layoutEditingAvailable()
      && Boolean(gameSession)
      && !layoutEditor.active
    );
  }

  if (speechStatus === "listening") {
    nodes.asrHelp.textContent = browserFallbackReady
      ? "说完后稍等一下会自动停录；也可以点击上面的按钮提前结束。"
      : "说完后稍等一下，AI 会自动停录；也可以点击上面的按钮提前结束。";
    nodes.voiceState.textContent = "正在听你说…";
  } else if (preparing) {
    nodes.asrHelp.textContent = "请稍候；答题卡变成绿色并显示“正在录音”后，再开始回答。";
    nodes.voiceState.textContent = "正在准备麦克风…";
  } else if (speechStatus === "scoring") {
    nodes.asrHelp.textContent = browserFallbackReady
      ? "请稍候，老师确认前不会推进回合或出现骰子。"
      : "请稍候，评分完成前不会推进回合或出现骰子。";
    nodes.voiceState.textContent = browserFallbackReady
      ? "正在整理识别结果…"
      : "正在计算表现分…";
  } else if (speechStatus === "retry") {
    nodes.asrHelp.textContent = browserFallbackReady
      ? "这次没有形成可确认的识别结果；准备好后可以重新回答。"
      : "这次没有提交评分；准备好后可以重新回答。";
    nodes.voiceState.textContent = "请再说一次";
  } else if (speechStatus === "review") {
    nodes.asrHelp.textContent = "本地识别不生成 AI 分数，请老师确认本次回答。";
    nodes.voiceState.textContent = "等待教师确认";
  } else if (speechStatus === "accepted") {
    const teacherSupported = pendingSpeechDecision?.result === "teacher_review";
    nodes.asrHelp.textContent = teacherSupported
      ? "老师已确认本次回答，课堂助力骰已经准备好。"
      : "回答已完成，本轮表现分与骰子已经准备好。";
    nodes.voiceState.textContent = teacherSupported
      ? "老师确认完成 · 选择课堂助力骰"
      : "表现分出炉 · 选择骰子";
  } else if (speechStatus === "error") {
    nodes.asrHelp.textContent = browserFallbackReady
      ? "没有形成本次识别结果；请检查麦克风后重新尝试。"
      : "没有提交本次评分；请检查麦克风后重新尝试。";
    nodes.voiceState.textContent = "声音精灵正在休息";
  } else if (canListen) {
    nodes.asrHelp.textContent = browserFallbackReady
      ? "点击后先等待麦克风准备完成；本地模式识别后由老师确认，不生成 AI 分数。"
      : "点击后先等待麦克风准备完成；说完整句后会自动停止并评分。";
    nodes.voiceState.textContent = "点击“开始回答”";
  }

  if (previousSpeechUiState !== speechUiState) {
    window.queueMicrotask(() => {
      if (nodes.missionDock.dataset.speechState !== speechUiState) return;
      const focusTarget = speechUiState === "listening"
        ? nodes.asrToggle
        : speechUiState === "review"
          ? nodes.teacherAccept
          : ["retry", "error"].includes(speechUiState)
            ? nodes.asrToggle
            : ["preparing", "scoring"].includes(speechUiState)
              ? nodes.asrConsole
              : null;
      if (!focusTarget || focusTarget.hidden || focusTarget.disabled) return;
      focusTarget.focus({ preventScroll: true });
    });
  }
}

function destroySentenceListener({
  nextStatus = "idle",
  clearFeedback = false,
} = {}) {
  sentenceListener?.destroy();
  sentenceListener = null;
  sentenceListenerTurnKey = null;
  speechStatus = nextStatus;
  speechScoringStartedAt = 0;
  if (clearFeedback) {
    speechTranscript = "";
    pendingSpeechDecision = null;
    pendingTurnCommand = null;
  }
  renderSpeechControls();
}

function pauseSentenceListener(nextStatus = "idle") {
  sentenceListener?.destroy();
  sentenceListener = null;
  sentenceListenerTurnKey = null;
  speechStatus = nextStatus;
  speechScoringStartedAt = 0;
  renderSpeechControls();
}

function handleSentenceDecision(decision) {
  const context = currentSpeechTurnContext();
  const contextFields = [
    "gameSessionId",
    "turnId",
    "learningPackId",
    "learningPackVersion",
    "taskId",
  ];
  const sourceAllowed = (
    [SENTENCE_ASSESSMENT_SOURCE, BROWSER_SENTENCE_SOURCE].includes(
      decision?.source,
    )
    || (qaHarnessEnabled && decision?.source === "qa-harness")
  );
  if (
    !context
    || !canOpenSpeechWindow()
    || !["accepted", "retry", "teacher_review"].includes(decision?.result)
    || !sourceAllowed
    || (
      decision?.source === SENTENCE_ASSESSMENT_SOURCE
        ? typeof decision.attemptId !== "string" || !decision.attemptId.trim()
        : decision?.attemptId !== context.attemptId
    )
    || contextFields.some((field) => decision?.[field] !== context[field])
  ) {
    console.error("voice board rejected an unbound speech decision");
    return;
  }

  let turnCommand = null;
  try {
    if (decision.result === "accepted") {
      turnCommand = turnFlowGuard.issueScoredTurnCommand({
        context,
        decision,
        allowQa: qaHarnessEnabled,
      });
    } else if (decision.result === "teacher_review") {
      turnCommand = turnFlowGuard.issueTeacherTurnCommand({
        context,
        decision,
        allowQa: qaHarnessEnabled,
      });
    }
  } catch (error) {
    console.error("voice board rejected an unauthorized speech decision", error);
    speechStatus = "error";
    speechTranscript = "这次评测结果没有通过校验，请重新回答";
    pendingSpeechDecision = null;
    pendingTurnCommand = null;
    renderSpeechControls();
    return;
  }

  pendingSpeechDecision = decision;
  pendingTurnCommand = turnCommand;
  speechTranscript = decision.result === "accepted"
    ? `本轮表现：${speechDecisionCopy(decision)}`
    : speechDecisionCopy(decision);
  showSpeechDecisionFeedback(decision);
  if (decision.result === "accepted") {
    speechStatus = "accepted";
    renderSpeechControls();
    renderMission();
    pendingTurnCommand = null;
    void runAcceptedTurn(turnCommand);
    return;
  }

  try {
    gameSession = recordSpeechOutcome(gameSession, {
      recognitionResultId: decision.recognitionResultId,
      result: decision.result,
      taskId: decision.taskId,
      reason: decision.reason || null,
    });
    persistStableSession();
  } catch (error) {
    console.error("voice board speech outcome could not be recorded", error);
    speechStatus = "error";
    speechTranscript = "这次朗读没有记录成功，请重新开始";
    pendingTurnCommand = null;
    renderSpeechControls();
    return;
  }
  if (decision.result !== "teacher_review") pendingTurnCommand = null;
  speechStatus = decision.result === "teacher_review" ? "review" : "retry";
  render();
}

function ensureSentenceListener() {
  const context = currentSpeechTurnContext();
  if (!context) throw new Error("voice board turn is unavailable");
  const cloudAssessmentReady = (
    voiceBoardAssessmentConfigured
    && voiceBoardKnowledgeAsrConfigured
    && voiceBoardAsrAuthenticated
  );
  const listenerMode = cloudAssessmentReady ? "aliyun" : "browser";
  const listenerKey = `${context.key}:${listenerMode}`;
  if (sentenceListener && sentenceListenerTurnKey === listenerKey) return sentenceListener;
  sentenceListener?.destroy();
  sentenceListener = null;
  sentenceListenerTurnKey = null;
  sentenceListenerTurnKey = listenerKey;
  const Listener = cloudAssessmentReady
    ? SentenceAssessmentClient
    : BrowserSentenceCapture;
  sentenceListener = new Listener({
    createKnowledgeListener: cloudAssessmentReady
      ? (options) => new BailianSentenceListener(options)
      : null,
    onState: (state) => {
      if (state === "scoring" && !speechScoringStartedAt) {
        speechScoringStartedAt = Date.now();
      }
      speechStatus = state;
      renderSpeechControls();
    },
    onPreview: (transcript) => {
      speechTranscript = transcript || "正在听你说完整句…";
      renderSpeechControls();
    },
  });
  return sentenceListener;
}

async function toggleSentenceListening() {
  if (speechStatus === "listening") {
    sentenceListener?.stop();
    return;
  }
  if (["requesting_permission", "connecting"].includes(speechStatus)) {
    return;
  }
  if (
    !canOpenSpeechWindow()
    || !(
      (
        voiceBoardAssessmentConfigured
        && voiceBoardKnowledgeAsrConfigured
        && voiceBoardAsrAuthenticated
      )
      || voiceBoardBrowserFallbackAvailable
    )
  ) {
    return;
  }
  hideTurnFeedback();
  pendingSpeechDecision = null;
  pendingTurnCommand = null;
  speechTranscript = "";
  speechScoringStartedAt = 0;
  speechStatus = "requesting_permission";
  renderSpeechControls();
  try {
    const context = currentSpeechTurnContext();
    const result = await ensureSentenceListener().assess(context);
    if (speechScoringStartedAt) {
      const scoringPresentationRemaining = Math.max(
        0,
        450 - (Date.now() - speechScoringStartedAt),
      );
      if (scoringPresentationRemaining) {
        await sleep(scoringPresentationRemaining);
      }
    }
    if (result.source === BROWSER_SENTENCE_SOURCE) {
      handleSentenceDecision({
        ...context,
        ...result,
        attemptId: context.attemptId,
        recognitionResultId: crypto.randomUUID(),
      });
      return;
    }
    if (["accepted", "retry", "teacher_review"].includes(result.result)) {
      handleSentenceDecision({
        ...context,
        ...result,
        attemptId: result.attemptId || context.attemptId,
        recognitionResultId: crypto.randomUUID(),
        primaryAccepted: result.primaryAccepted,
        score: result.result === "accepted" ? result.score : null,
      });
      return;
    }
    if (!result.valid || !Number.isFinite(result.score)) {
      handleSentenceDecision({
        ...context,
        attemptId: result.attemptId || context.attemptId,
        recognitionResultId: crypto.randomUUID(),
        result: "retry",
        score: null,
        source: result.source,
        reason: result.reason || "score_unavailable",
      });
      return;
    }
    handleSentenceDecision({
      ...context,
      ...result,
      attemptId: result.attemptId || context.attemptId,
      recognitionResultId: crypto.randomUUID(),
      result: "accepted",
      primaryAccepted: true,
      knowledgeStatus: "correct",
      score: result.score,
    });
  } catch (error) {
    if (error?.name === "AbortError") return;
    const failedSpeechStatus = speechStatus;
    console.warn("voice board assessment ended without a usable score", {
      code: error?.code || "assessment_failed",
      stage: failedSpeechStatus,
    });
    const retryableRecordingEnd = [
      "sentence_recording_timeout",
      "sentence_recording_interrupted",
      "sentence_scoring_timeout",
      "sentence_knowledge_decision_timeout",
      "sentence_knowledge_listener_failed",
      "sentence_knowledge_listener_unavailable",
      "browser_recording_timeout",
      "browser_recording_interrupted",
    ].includes(error?.code);
    const browserCaptureRetry = String(error?.code || "").startsWith(
      "browser_recording_",
    );
    speechStatus = retryableRecordingEnd ? "retry" : "error";
    speechTranscript = (
      error?.code === "sentence_recording_interrupted"
      && ["requesting_permission", "connecting"].includes(failedSpeechStatus)
    )
      ? "评分麦克风还没准备好；请等答题卡变绿、显示“正在录音”后再回答"
      : error?.code === "sentence_scoring_timeout"
      ? "录音已经提交，但评分等待超时；本轮没有推进，请重新回答"
      : browserCaptureRetry
        ? "这次没有形成可确认的识别结果，请准备好后重新回答"
      : retryableRecordingEnd
        ? "录音没有提交评分，请准备好后重新回答"
        : error?.message || "声音精灵暂时没准备好";
    renderSpeechControls();
  }
}

async function initializeSpeechAvailability() {
  let layoutsLoaded = false;
  let dicePackLoaded = false;
  let nodeRewardPackLoaded = false;
  let cardCatalogLoaded = false;
  try {
    const [configurationResponse, authResponse] = await Promise.all([
      fetch("/api/config", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ]);
    const configuration = configurationResponse.ok
      ? await configurationResponse.json()
      : {};
    const auth = authResponse.ok ? await authResponse.json() : {};
    voiceBoardAssessmentConfigured = configuration.voiceBoardAssessmentConfigured === true;
    voiceBoardKnowledgeAsrConfigured = configuration.voiceBoardAsrConfigured === true;
    voiceBoardAsrAuthenticated = auth.authenticated === true;
    qaControlsEnabled = configuration.qaEnabled === true;
    qaHarnessEnabled = qaControlsEnabled && QA_HARNESS_REQUESTED;
    layoutEditorAuthorized = (
      (qaControlsEnabled && QA_PAGE_REQUESTED)
      || (
        auth.authenticated === true
        && auth.user?.role === "owner"
      )
    );
    layoutEditorOwnerUserId = (
      auth.authenticated === true
      && auth.user?.role === "owner"
      && typeof auth.user?.id === "string"
    ) ? auth.user.id : null;
    authenticatedUserId = (
      auth.authenticated === true && typeof auth.user?.id === "string"
    ) ? auth.user.id : null;
    // Choosing students does not depend on map, dice or reward publications.
    // Only creating a new session must wait for those snapshots to finish loading.
    if (auth.authenticated === true) void loadStudentProfiles();
    if (auth.authenticated === true) {
      [
        layoutsLoaded,
        dicePackLoaded,
        nodeRewardPackLoaded,
        cardCatalogLoaded,
      ] = await Promise.all([
        loadPublishedBoardLayouts(),
        loadPublishedDicePack(),
        loadPublishedNodeRewardPack(),
        Promise.resolve(false),
      ]);
      void loadPublishedClassroomEventProgram();
    }
    if (layoutsLoaded) promoteLegacyWorkingLayouts();
    root.dataset.qaHarnessReady = String(qaHarnessEnabled);
    voiceBoardBrowserFallbackAvailable = (
      configuration.voiceBoardBrowserFallbackEnabled === true
      && browserSentenceCaptureSupported()
    );
    speechStatus = "idle";
    nodes.asrHelp.textContent = (
      voiceBoardAssessmentConfigured
      && voiceBoardKnowledgeAsrConfigured
      && voiceBoardAsrAuthenticated
    )
      ? "完整读出句子，AI 会自动停录并给出表现分和本轮骰子。"
      : voiceBoardBrowserFallbackAvailable
        ? "本地课堂模式会识别句子并交给老师确认，不生成或伪造 AI 分数。"
        : voiceBoardAssessmentConfigured
          ? "请老师进入课堂后，再开始本轮朗读。"
          : "声音魔法还没准备好，请老师稍后再试。";
  } catch {
    voiceBoardAssessmentConfigured = false;
    voiceBoardKnowledgeAsrConfigured = false;
    voiceBoardAsrAuthenticated = false;
    voiceBoardBrowserFallbackAvailable = false;
    qaHarnessEnabled = false;
    layoutEditorAuthorized = false;
    layoutEditorOwnerUserId = null;
    authenticatedUserId = null;
    root.dataset.qaHarnessReady = "false";
    speechStatus = "error";
    speechTranscript = "声音精灵暂时没有醒来";
  }
  if (layoutsLoaded || (qaControlsEnabled && QA_PAGE_REQUESTED)) {
    applyConfirmedVisualBoard(activeWorldComposition.worldRef);
    renderBoard();
  }
  root.dataset.dicePackReady = String(
    dicePackLoaded || (qaControlsEnabled && QA_PAGE_REQUESTED),
  );
  root.dataset.nodeRewardPackReady = String(
    nodeRewardPackLoaded || (qaControlsEnabled && QA_PAGE_REQUESTED),
  );
  delete root.dataset.classroomEventProgramReady;
  root.dataset.cardCatalogReady = String(cardCatalogLoaded);
  sessionConfigurationLoading = false;
  restoreLocalSessionOnStartup();
  renderCharacterSelection();
  renderStudentRoster();
  renderSpeechControls();
  renderLayoutRegistryStatus();
  if (LAYOUT_EDITOR_REQUESTED && layoutEditorAuthorized && !layoutEditor.active) {
    requestAnimationFrame(openLayoutEditor);
  }
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function edgePath(edge) {
  return resolvedEdgePathData(edge, nodeById);
}

function pointsAlongSvgPath(pathElement, edge, fractions) {
  try {
    const totalLength = pathElement.getTotalLength();
    if (Number.isFinite(totalLength) && totalLength > 0) {
      return fractions.map((fraction) => {
        const point = pathElement.getPointAtLength(totalLength * fraction);
        return { x: point.x, y: point.y };
      });
    }
  } catch {
    // Fall through to the endpoint interpolation used by non-layout DOM shims.
  }
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  if (!from || !to) return [];
  return fractions.map((fraction) => ({
    x: from.x + ((to.x - from.x) * fraction),
    y: from.y + ((to.y - from.y) * fraction),
  }));
}

function airCrossingVisualForEdge(edge) {
  const group = svgElement("g", {
    class: "air-crossing-route", "data-air-crossing-edge": edge.id,
    "aria-hidden": "true", "pointer-events": "none",
  });
  const trail = svgElement("path", {
    d: edgePath(edge), class: "air-crossing-trail", "data-edge-id": edge.id,
  });
  const [midpoint] = pointsAlongSvgPath(trail, edge, [.5]);
  group.append(trail);
  if (midpoint && layoutEditor.active) {
    const label = svgElement("text", {
      x: midpoint.x, y: midpoint.y + 24,
      class: "air-crossing-label", "text-anchor": "middle",
    });
    label.textContent = "自动飞跃";
    group.append(label);
  }
  return group;
}

function edgeAvailableForMapState(edge, mapState = runtime?.mapState || {}) {
  if (!edge?.availableWhen) return true;
  const { stateKey, equals = true } = edge.availableWhen;
  return Boolean(stateKey) && mapState?.[stateKey] === equals;
}

function visibleBoardEdges(mapState = runtime?.mapState || {}) {
  return visualBoardTemplate.edges.filter((edge) => edgeAvailableForMapState(edge, mapState));
}

function routePathData(edges = visibleBoardEdges()) {
  return compoundRoutePathData(edges, nodeById);
}

function transportPreviewPath(space) {
  return resolvedTransportPreviewPathData(space, nodeById);
}

function nodeGlyph(role) {
  const glyphs = {
    learning: "步",
    coin: "1",
    gem: "◆",
    event: "!",
    mooring: "⚓",
    anchor: "踪",
    key: "钥",
    home: "屋",
    portal: "∞",
    reward: "1",
    item: "✦",
    junction: "↗",
    activity: "!",
    foghorn: "鸣",
    "cloud-gate": "闸",
    treasure: "◆",
    transport: "",
    goal: "∞",
  };
  return Object.prototype.hasOwnProperty.call(glyphs, role) ? glyphs[role] : "?";
}

const nodeRewardPresentationCache = new WeakMap();
function nodeRewardPackForPresentation(worldRef = activeWorldComposition.worldRef) {
  const pack = layoutEditor.active
    && layoutEditor.activePane === "rewards"
    && nodeRewardEditor.draft
    ? nodeRewardEditor.draft
    : currentNodeRewardPack();
  if (pack.worlds[worldRef] || !isCloudHarborWorldRef(worldRef)) return pack;
  // Authoring can preview the new geometry while an old session is paused.
  // Cache a presentation copy; never replace that session's locked snapshot.
  let versions = nodeRewardPresentationCache.get(pack);
  if (!versions) {
    versions = new Map();
    nodeRewardPresentationCache.set(pack, versions);
  }
  if (!versions.has(worldRef)) versions.set(worldRef, retargetNodeRewardPack(pack, worldRef));
  return versions.get(worldRef);
}

function classroomEventProgramForPresentation() {
  if (
    layoutEditor.active
    && layoutEditor.activePane === "events"
    && classroomEventEditor.draft
  ) {
    return classroomEventEditor.draft;
  }
  return currentClassroomEventProgram();
}

function classroomEventPresentationAssignment(worldRef, nodeId) {
  const learningRef = layoutEditor.active && layoutEditor.activePane === "events"
    ? classroomEventEditor.learningRef
    : learningPackRefFor(learningPack);
  try {
    return classroomEventAssignment(
      classroomEventProgramForPresentation(),
      learningRef,
      worldRef,
      nodeId,
    );
  } catch {
    return { mode: "inherit", eventRef: "" };
  }
}

function configuredNodeRewardOutcome(outcome, worldRef, nodeId) {
  return pointsOnlyNodeOutcome(outcome);
}

function nodeKindForComposition(
  composition,
  nodeId,
  fallback = "learning",
) {
  const facilityNode = composition.board.nodes.find(({ id }) => id === nodeId);
  const rewardEntry = nodeRewardCatalogEntry(composition.worldRef, nodeId);
  if (rewardEntry?.editable) {
    const configured = nodeRewardPolicy(
      nodeRewardPackForPresentation(composition.worldRef),
      composition.worldRef,
      nodeId,
    );
    if (configured.type === "none") return "learning";
    if (configured.type === "coin") return "coin";
    if (configured.type === "star") return "item";
  }
  if (isCloudHarborWorldRef(composition.worldRef)) {
    if (composition.level.nodeBindings?.[nodeId]?.semanticType === "ordinary") {
      return "learning";
    }
    return levelOneNodeKind(nodeId, fallback);
  }
  const compositionNodeById = new Map(
    composition.board.nodes.map((node) => [node.id, node]),
  );
  const node = compositionNodeById.get(nodeId);
  const profile = composition.level.landingProfiles?.[
    composition.level.nodeBindings?.[nodeId]?.rewardRef || node?.landingProfileRef
  ];
  if (profile?.kind === "ordinary") return "learning";
  if (profile?.rewards?.some(({ resource }) => resource === "coin")) return "coin";
  if (profile?.rewards?.some(({ resource }) => resource === "star")) return "gem";
  if (profile?.rewards?.some(({ resource }) => resource === "key")) return "key";
  if (profile?.kind === "transport") return "transport";
  if (profile?.kind === "map-effect") return "event";
  if (profile?.kind === "route-choice" || profile?.kind === "conditional-route-choice") {
    return "junction";
  }
  if (profile?.kind === "discovery" || profile?.kind === "collection-gallery") return "item";
  if (profile?.kind === "world-transition") return "portal";
  return node?.spaceRole || fallback;
}

function activeNodeKind(nodeId, fallback = "learning") {
  const baseKind = nodeKindForComposition(activeWorldComposition, nodeId, fallback);
  return cloudHarborNodeVisualKind(nodeVisualKindForOutcome(activeNodeOutcome(nodeId), baseKind), { theme, worldRef: activeWorldComposition.worldRef });
}

function circuitPresentationActive(composition = activeWorldComposition) {
  const circuit = currentWorldRoute().circuit;
  return circuit?.policy === "individual-laps-v1" && circuit.worldRef === composition.worldRef;
}

function circuitNodeOutcome(composition, nodeId, outcome) {
  if (!circuitPresentationActive(composition) || outcome.category !== "world-transition"
    || !composition.board.exits.some((exit) => exit.nodeId === nodeId)) return outcome;
  return Object.freeze({
    ...outcome, icon: "↻", badgeLabel: "完成本圈", shortLabel: "下一步接起点后格",
    detail: "到达这里即完成一圈，只有自己的棋子继续移动。点数用完就停在终点，下一步直接接起点的下一格；全员完成一圈后刷新 Bonus。",
  });
}

function nodeOutcomeForComposition(
  composition,
  nodeId,
  { fairyHere = false } = {},
) {
  const node = composition.board.nodes.find(({ id }) => id === nodeId);
  const rewardRef = composition.level.nodeBindings?.[nodeId]?.rewardRef
    || node?.landingProfileRef
    || "";
  if (isCloudHarborWorldRef(composition.worldRef)) {
    const outcome = circuitNodeOutcome(composition, nodeId, nodeOutcomePresentation({
      nodeId,
      rewardRef,
      definition: REWARD_DEFINITIONS[rewardRef] || null,
      fairyHere,
    }));
    return cloudHarborNodePresentation({ node, presentation: configuredNodeRewardOutcome(outcome, composition.worldRef, nodeId), theme: composition.theme, worldRef: composition.worldRef });
  }
  const outcome = nodeOutcomePresentation({
    nodeId,
    rewardRef,
    profile: composition.level.landingProfiles?.[rewardRef] || null,
    fairyHere,
  });
  return configuredNodeRewardOutcome(outcome, composition.worldRef, nodeId);
}

function activeNodeOutcome(nodeId) {
  return nodeOutcomeForComposition(activeWorldComposition, nodeId, {
    fairyHere: fairyState.anchorId === nodeId,
  });
}

function nodeVisualKindForOutcome(outcome, fallback = "learning") {
  return pointsOnlyNodeKind(outcome, fallback);
}

function nodeOutcomeBadgeLabel(outcome) {
  if (outcome.category === "ordinary") return "普通";
  if (outcome.category === "route-choice") {
    return outcome.shortLabel.startsWith("桥开启")
      ? "到达·开桥且有步数才选路"
      : "到达·有步数才选路";
  }
  if (outcome.trigger === "next-edge-pass") return "下一步·离港";
  const triggerPrefix = {
    none: "普通",
    "final-landing": "落点",
    "route-pass": "经过",
    "route-arrival": "到达",
    "fairy-route-pass": "踪迹",
    "after-enter": "进入",
  }[outcome.trigger] || outcome.badgeLabel;
  const compactResult = outcome.shortLabel
    .replaceAll(" · ", "·")
    .replaceAll(" / ", "/");
  return `${triggerPrefix}·${compactResult}`;
}

function activeNodePresentation(nodeId, kind = activeNodeKind(nodeId)) {
  const fallback = { label: nodeKindLabel(kind), zoneId: nodeById.get(nodeId)?.zoneId || "", rewardRef: null };
  let raw = isCloudHarborWorldRef(activeWorldComposition.worldRef)
    ? presentationForLevelOneNode(nodeId, fallback)
    : presentationForExpansionNode(nodeId, fallback);
  if (isCurrentCloudHarborWorldRef(activeWorldComposition.worldRef) && nodeId === "n05b") {
    raw = { ...raw, label: "海湾观景台" };
  }
  if (circuitPresentationActive() && activeBoardTemplate.exits.some((exit) => exit.nodeId === nodeId)) {
    raw = { ...raw, label: "圈终点", teaser: "完成本圈，回到起点继续。",
      firstCopy: "完成本圈，回到云港起点继续。", repeatCopy: "完成本圈，回到云港起点继续。" };
  }
  return cloudHarborNodePresentation({ node: nodeById.get(nodeId), presentation: pointsOnlyNodePresentation(raw, activeNodeOutcome(nodeId)), theme, worldRef: activeWorldComposition.worldRef });
}

function nodeKindLabel(kind, composition = activeWorldComposition) {
  if (kind === "portal" && circuitPresentationActive(composition)) return "圈终点";
  return {
    learning: "普通道路",
    coin: "停靠格",
    gem: "停靠格",
    event: "惊喜事件",
    mooring: "港口道路",
    anchor: "航标线索",
    key: "云路观景台",
    home: "云港建筑",
    portal: "前进世界门",
    junction: "路线选择",
    activity: "固定落点效果",
    foghorn: "航道微光",
    "cloud-gate": "云阶入口",
    item: "寻宝线索",
    transport: isCloudHarborWorldRef(composition.worldRef)
      ? "跳跃与滑行"
      : "秘境运输机关",
  }[kind] || "冒险格";
}

function nodeEffectBadge(kind) {
  if (kind === "portal" && circuitPresentationActive()) return { tone: "item", label: "完成本圈" };
  return {
    coin: { tone: "neutral", label: "停靠格" },
    gem: { tone: "neutral", label: "停靠格" },
    key: { tone: "neutral", label: "停靠格" },
    event: { tone: "challenge", label: "挑战" },
    activity: { tone: "map", label: "效果" },
    mooring: { tone: "neutral", label: "普通道路" },
    foghorn: { tone: "map", label: "锁定" },
    "cloud-gate": { tone: "map", label: "开云阶" },
    portal: { tone: "item", label: "下一世界" },
  }[kind] || null;
}

function mapEffectSkin(mapEffectRef) {
  if (isCloudHarborPresentation(theme, activeWorldComposition.worldRef)) {
    if (mapEffectRef === "harbor.cloudfall-gate.v1") return { label: "云阶入口", announcement: "云阶航道亮起来了！", resultCopy: "全班共享的云阶已经开启", deviceVariant: "terrain-glow" };
    if (mapEffectRef === "harbor.foghorn.v1") return { label: "航道微光", announcement: "前方航道已显影！", resultCopy: "前方航道已显影", deviceVariant: "terrain-glow" };
  }
  return theme.mapEffectSkins?.[mapEffectRef] || {
    label: "地图信号器",
    announcement: "航道目标已锁定！",
    resultCopy: "机关结果已经记录",
    deviceVariant: "harbor-foghorn",
  };
}

function mapEffectResultCopy(effect, skin = mapEffectSkin(effect?.mapEffectRef)) {
  if (effect?.mapEffectRef === "harbor.foghorn.v1") {
    return "前方云阶与航道已显影";
  }
  if (effect?.mapEffectRef === "harbor.cloudfall-gate.v1") {
    return "全班永久开启云阶捷径";
  }
  if (effect?.mapEffectRef === "beyond-cloud.prism-tree.v1") {
    return "全班共享的极光桥已经永久开启";
  }
  return `${skin.resultCopy} · 航线保持原样`;
}

function appendWorldTransportDevice(parent, { variant, label }) {
  const device = svgElement("g", {
    class: `world-transport-device world-transport-${variant}`,
    "aria-label": label,
  });
  device.append(
    svgElement("ellipse", {
      cx: 0,
      cy: 18,
      rx: 31,
      ry: 10,
      class: "world-device-shadow",
    }),
    svgElement("ellipse", {
      cx: 0,
      cy: 14,
      rx: 28,
      ry: 10,
      class: "world-device-plinth",
    }),
  );
  if (variant === "bubble-geyser") {
    const bowl = svgElement("path", {
      d: "M -24 7 Q 0 24 24 7 L 20 17 Q 0 31 -20 17 Z",
      class: "world-device-body world-device-tide-bowl",
    });
    const bubbles = svgElement("g", { class: "world-transport-bubbles" });
    [
      { cx: -13, cy: -4, r: 7 },
      { cx: 5, cy: -14, r: 10 },
      { cx: 17, cy: -1, r: 6 },
    ].forEach((bubble, index) => {
      bubbles.append(svgElement("circle", {
        ...bubble,
        class: "world-transport-bubble",
        "data-bubble-index": index,
      }));
    });
    device.append(bowl, bubbles);
  } else {
    device.append(
      svgElement("path", {
        d: "M -20 11 Q 0 -32 20 11",
        class: "world-device-stroke world-comet-rail",
      }),
      svgElement("ellipse", {
        cx: 0,
        cy: -6,
        rx: 12,
        ry: 20,
        class: "world-device-body world-comet-capsule",
      }),
      svgElement("path", {
        d: "M -6 -12 Q 0 -18 6 -12 M -7 0 H 7",
        class: "world-device-stroke world-comet-window",
      }),
      svgElement("path", {
        d: "M -4 14 L 0 24 L 4 14",
        class: "world-comet-flame",
      }),
    );
  }
  parent.append(device);
  return device;
}

function appendWorldMapDevice(parent, { variant, label, discovered = false }) {
  const device = svgElement("g", {
    class: `world-map-device world-map-${variant} ${discovered ? "is-discovered" : ""}`,
    "aria-label": label,
  });
  device.append(
    svgElement("ellipse", {
      cx: 0,
      cy: 19,
      rx: 31,
      ry: 10,
      class: "world-device-shadow",
    }),
    svgElement("ellipse", {
      cx: 0,
      cy: 15,
      rx: 28,
      ry: 10,
      class: "world-device-plinth",
    }),
  );
  if (variant === "world-signal") {
    device.append(
      svgElement("path", {
        d: "M -11 15 L -5 -15 H 5 L 11 15 Z",
        class: "world-device-body",
      }),
      svgElement("path", {
        d: "M -19 -18 Q 0 -34 19 -18 Q 4 -7 -4 -7 Z",
        class: "world-device-body world-signal-dish",
      }),
      svgElement("circle", {
        cx: 0,
        cy: -17,
        r: 4,
        class: "world-device-core",
      }),
      svgElement("path", {
        d: "M 12 -28 Q 24 -18 12 -8 M 18 -34 Q 36 -18 18 -2",
        class: "world-device-stroke world-signal-waves",
      }),
    );
  } else if (variant === "world-prism") {
    device.append(
      svgElement("path", {
        d: "M 0 -28 L 23 12 L -23 12 Z",
        class: "world-device-body world-prism-crystal",
      }),
      svgElement("path", {
        d: "M -17 7 L 0 -28 L 7 12 M -34 -10 H -14 M 16 -12 L 34 -23 M 18 1 L 37 6",
        class: "world-device-stroke world-prism-rays",
      }),
    );
  } else if (variant === "world-beacon") {
    device.append(
      svgElement("path", {
        d: "M -25 -4 Q -11 -24 10 -13 Q 25 -6 20 8 Q 7 22 -13 13 Q -22 8 -25 -4 Z M 18 -8 L 30 -17 L 27 -3 Z",
        class: "world-device-body world-whale-body",
      }),
      svgElement("circle", {
        cx: -10,
        cy: -6,
        r: 2.5,
        class: "world-device-core",
      }),
      svgElement("path", {
        d: "M -4 -22 Q 0 -35 5 -22 M 2 -27 L -6 -33 M 2 -27 L 10 -34",
        class: "world-device-stroke world-whale-spout",
      }),
    );
  } else if (variant === "world-tide") {
    device.append(
      svgElement("path", {
        d: "M -26 0 Q 0 23 26 0 L 21 15 Q 0 30 -21 15 Z",
        class: "world-device-body world-device-tide-bowl",
      }),
      svgElement("path", {
        d: "M -20 -6 Q -10 -14 0 -6 Q 10 2 20 -6 M -16 2 Q -8 -5 0 2 Q 8 9 16 2",
        class: "world-device-stroke world-tide-waves",
      }),
      svgElement("circle", {
        cx: 0,
        cy: -13,
        r: 5,
        class: "world-device-core",
      }),
    );
  } else if (variant === "world-tree") {
    device.append(
      svgElement("path", {
        d: "M -5 17 L -2 -12 L 4 -12 L 7 17 Z",
        class: "world-device-body world-tree-trunk",
      }),
      svgElement("path", {
        d: "M 0 -5 L -19 -20 M -7 -12 L -5 -27 M 1 -9 L 18 -25 M 9 -17 L 22 -10",
        class: "world-device-stroke world-tree-branches",
      }),
      svgElement("path", {
        d: "M -20 -28 L -13 -20 L -20 -12 L -27 -20 Z M -5 -36 L 2 -27 L -5 -18 L -12 -27 Z M 18 -33 L 26 -24 L 18 -15 L 10 -24 Z M 25 -18 L 31 -10 L 25 -2 L 19 -10 Z",
        class: "world-tree-crystals",
      }),
    );
  } else if (variant === "world-aurora") {
    device.append(
      svgElement("rect", {
        x: -20,
        y: -3,
        width: 40,
        height: 23,
        rx: 7,
        class: "world-device-body",
      }),
      svgElement("circle", {
        cx: 0,
        cy: 7,
        r: 8,
        class: "world-device-core",
      }),
      svgElement("path", {
        d: "M -8 -4 L -22 -31 Q 0 -18 0 -39 Q 22 -18 8 -4 Z",
        class: "world-aurora-beam",
      }),
    );
  } else {
    device.append(
      svgElement("circle", {
        cx: 0,
        cy: -8,
        r: 22,
        class: "world-device-body world-moon-dial",
      }),
      svgElement("path", {
        d: "M 5 -25 Q -9 -17 -7 -5 Q -5 8 9 10 Q -1 18 -13 10 Q -25 1 -19 -14 Q -14 -27 5 -25 Z",
        class: "world-moon-crescent",
      }),
      svgElement("path", {
        d: "M 0 -34 V -28 M 25 -8 H 19 M 0 18 V 12 M -25 -8 H -19",
        class: "world-device-stroke world-moon-ticks",
      }),
    );
  }
  parent.append(device);
  return device;
}

function nodeShape(kind, className = "space-shape") {
  const attributes = { class: className };
  if (kind === "coin") {
    return svgElement("circle", { ...attributes, r: 20 });
  }
  if (kind === "gem") {
    return svgElement("path", {
      ...attributes,
      d: "M 0 -23 L 22 -2 L 0 24 L -22 -2 Z",
    });
  }
  if (kind === "event" || kind === "activity") {
    return svgElement("path", {
      ...attributes,
      d: "M 0 -25 L 7 -13 L 20 -19 L 18 -6 L 28 0 L 16 7 L 20 20 L 7 16 L 0 28 L -7 16 L -20 20 L -16 7 L -28 0 L -18 -6 L -20 -19 L -7 -13 Z",
    });
  }
  if (kind === "foghorn") {
    return svgElement("path", {
      ...attributes,
      d: "M -23 -18 Q 0 -29 23 -18 L 27 7 Q 15 25 0 27 Q -15 25 -27 7 Z",
    });
  }
  if (kind === "mooring") {
    return svgElement("path", {
      ...attributes,
      d: "M -22 -15 L 0 -26 L 22 -15 L 25 9 L 0 25 L -25 9 Z",
    });
  }
  if (kind === "cloud-gate") {
    return svgElement("rect", {
      ...attributes,
      x: -24,
      y: -24,
      width: 48,
      height: 48,
      rx: 8,
    });
  }
  if (kind === "anchor") {
    return svgElement("path", {
      ...attributes,
      d: "M -21 -15 L 0 -25 L 21 -15 L 21 12 L 0 24 L -21 12 Z",
    });
  }
  if (kind === "key") {
    return svgElement("path", {
      ...attributes,
      d: "M -22 -17 H 14 Q 23 -17 23 -8 V 10 Q 23 19 14 19 H -22 Z",
    });
  }
  if (kind === "home") {
    return svgElement("path", {
      ...attributes,
      d: "M -25 -6 L 0 -27 L 25 -6 V 23 H -25 Z",
    });
  }
  if (kind === "portal" || kind === "goal") {
    return svgElement("circle", { ...attributes, r: 25 });
  }
  if (kind === "learning") {
    return svgElement("path", {
      ...attributes,
      d: "M -24 -18 Q -24 -24 -18 -24 H 18 Q 24 -24 24 -18 V 10 Q 24 17 17 17 H 8 L 16 27 L -1 17 H -18 Q -24 17 -24 10 Z",
    });
  }
  if (kind === "junction") {
    return svgElement("path", {
      ...attributes,
      d: "M 0 -25 L 25 0 L 0 25 L -25 0 Z",
    });
  }
  if (kind === "item") {
    return svgElement("path", {
      ...attributes,
      d: "M 0 -25 L 7 -8 L 25 0 L 7 8 L 0 25 L -7 8 L -25 0 L -7 -8 Z",
    });
  }
  if (kind === "transport") {
    return svgElement("rect", {
      ...attributes,
      x: -22,
      y: -16,
      width: 44,
      height: 34,
      rx: 8,
    });
  }
  return svgElement("circle", { ...attributes, r: 20 });
}

function pawnOffset(teamIndex, teamCount = runtime.teams.length) {
  const layouts = {
    1: [{ x: 0, y: -42 }],
    2: [{ x: -24, y: -40 }, { x: 24, y: -40 }],
    3: [{ x: -31, y: -38 }, { x: 0, y: -50 }, { x: 31, y: -38 }],
    4: [
      { x: -34, y: -34 },
      { x: -12, y: -51 },
      { x: 12, y: -51 },
      { x: 34, y: -34 },
    ],
    5: [
      { x: -44, y: -31 },
      { x: -24, y: -54 },
      { x: 0, y: -62 },
      { x: 24, y: -54 },
      { x: 44, y: -31 },
    ],
    6: [
      { x: -48, y: -28 },
      { x: -31, y: -52 },
      { x: -11, y: -64 },
      { x: 11, y: -64 },
      { x: 31, y: -52 },
      { x: 48, y: -28 },
    ],
    7: [
      { x: -52, y: -25 },
      { x: -39, y: -50 },
      { x: -19, y: -65 },
      { x: 0, y: -69 },
      { x: 19, y: -65 },
      { x: 39, y: -50 },
      { x: 52, y: -25 },
    ],
    8: [
      { x: -54, y: -24 },
      { x: -43, y: -48 },
      { x: -26, y: -64 },
      { x: -9, y: -72 },
      { x: 9, y: -72 },
      { x: 26, y: -64 },
      { x: 43, y: -48 },
      { x: 54, y: -24 },
    ],
  };
  return layouts[Math.max(1, Math.min(8, teamCount))][teamIndex]
    || { x: 0, y: -42 };
}

function boardWorldSize() {
  const viewport = viewportSize(visualBoardTemplate);
  return {
    width: Math.max(viewport.width, Number(visualBoardTemplate.worldSize?.width) || viewport.width),
    height: Math.max(viewport.height, Number(visualBoardTemplate.worldSize?.height) || viewport.height),
  };
}

function cameraBoardTemplate() {
  if (layoutEditor.active) return visualBoardTemplate;
  const fitted = fitCameraViewport(visualBoardTemplate, cameraCanvasSize.width, cameraCanvasSize.height);
  if (!theme.clayPreview || cameraCanvasSize.width < 700) return fitted;
  // A display crop matching the miniature reference. The exact board, paths,
  // collision targets and saved world coordinates remain the same objects.
  return { ...fitted, viewBox: [0, 0, fitted.viewBox[2] * .94, fitted.viewBox[3] * .94] };
}

function syncCameraViewport() {
  if (!nodes.board || !boardWorld) return;
  const previousBoard = cameraBoardTemplate();
  const previous = viewportSize(previousBoard);
  const pawn = nodeById.get(activePawnNodeId());
  const pawnWasVisible = pawn && isPointVisible(pawn, camera, previousBoard, 60);
  cameraCanvasSize = { width: nodes.boardViewport.clientWidth, height: nodes.boardViewport.clientHeight };
  const viewport = viewportSize(cameraBoardTemplate());
  if (Math.abs(previous.width - viewport.width) < 0.01 && Math.abs(previous.height - viewport.height) < 0.01) return;
  cancelCameraAnimation();
  // Preserve the world point at the center when the window changes shape.
  camera = clampCamera({
    x: camera.x + (previous.width - viewport.width) / 2,
    y: camera.y + (previous.height - viewport.height) / 2,
  }, cameraBounds(cameraBoardTemplate()));
  if (!layoutEditor.active && pawnWasVisible && !isPointVisible(pawn, camera, cameraBoardTemplate(), 60)) {
    camera = centerCameraOnPoint(pawn, cameraBoardTemplate());
  }
  setSpecialCellsOverview(specialCellsOverviewProgress);
  if (miniCameraWindow) {
    miniCameraWindow.setAttribute("width", String(viewport.width));
    miniCameraWindow.setAttribute("height", String(viewport.height));
  }
}

function initialBoardCamera() {
  const start = nodeById.get(activeBoardTemplate.startNodeId);
  const startZone = (activeBoardTemplate.zones || []).find(({ bounds }) => (
    start.x >= bounds.x
    && start.x <= bounds.x + bounds.width
    && start.y >= bounds.y
    && start.y <= bounds.y + bounds.height
  ));
  const focus = startZone
    ? {
        x: startZone.bounds.x + (startZone.bounds.width / 2),
        y: startZone.bounds.y + (startZone.bounds.height / 2),
      }
    : start;
  const board = cameraBoardTemplate();
  if (theme.clayPreview && cameraCanvasSize.width >= 700) {
    return clampCamera({ x: 0, y: start.y - viewportSize(board).height * .585 }, cameraBounds(board));
  }
  const preferred = centerCameraOnPoint(focus, board);
  return isPointVisible(start, preferred, board, 80) ? preferred : centerCameraOnPoint(start, board);
}

function showRegionArtFallback(regionGroup, image) {
  regionGroup.classList.add("is-unavailable");
  regionGroup.classList.toggle("is-ready", false);
  regionGroup.dataset.artState = "error";
  image.removeAttribute("href");
}

function showRouteTextureFallback(pattern, image, assetRef) {
  pattern.classList.add("is-unavailable");
  pattern.dataset.artState = "error";
  unavailableArtwork.add(assetRef);
  image.removeAttribute("href");
}

function buildRegionArtScene(routeEdges = visibleBoardEdges()) {
  const defs = svgElement("defs", { class: "board-defs" });
  const regionArtLayer = svgElement("g", {
    class: "region-art-layer",
    "aria-hidden": "true",
  });

  const routeSkin = theme.routeSkin;
  const textureAssetRef = routeSkin?.textureAssetRef;
  if (textureAssetRef && !unavailableArtwork.has(textureAssetRef)) {
    const worldSize = boardWorldSize();
    const patternSize = Math.max(48, Number(routeSkin.patternSize) || 112);
    const textureWidth = Math.max(16, Number(routeSkin.textureWidth) || 25);
    const routePattern = svgElement("pattern", {
      id: "route-texture-pattern",
      class: "route-texture-pattern",
      patternUnits: "userSpaceOnUse",
      width: patternSize,
      height: patternSize,
      "data-art-state": "loading",
    });
    const routeTextureImage = svgElement("image", {
      x: 0,
      y: 0,
      width: patternSize,
      height: patternSize,
      preserveAspectRatio: "xMidYMid slice",
      "pointer-events": "none",
    });
    routeTextureImage.addEventListener("load", () => {
      routePattern.classList.add("is-ready");
      routePattern.classList.remove("is-unavailable");
      routePattern.dataset.artState = "ready";
    }, { once: true });
    routeTextureImage.addEventListener("error", () => {
      showRouteTextureFallback(routePattern, routeTextureImage, textureAssetRef);
    }, { once: true });
    routePattern.append(routeTextureImage);
    routeTextureImage.setAttribute("href", textureAssetRef);
    defs.append(routePattern);

    const routeMask = svgElement("mask", {
      id: "route-texture-mask",
      maskUnits: "userSpaceOnUse",
      maskContentUnits: "userSpaceOnUse",
      x: 0,
      y: 0,
      width: worldSize.width,
      height: worldSize.height,
    });
    routeMask.append(svgElement("path", {
      d: routePathData(routeEdges),
      class: "route-texture-mask-shape",
      fill: "none",
      stroke: "#ffffff",
      "stroke-width": textureWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
    defs.append(routeMask);
  }

  (visualBoardTemplate.artRegions || []).forEach((region) => {
    const clipId = `region-clip-${region.id}`;
    const clip = svgElement("clipPath", {
      id: clipId,
      clipPathUnits: "userSpaceOnUse",
    });
    clip.append(svgElement("path", { d: region.clipPath }));
    defs.append(clip);

    const art = theme.regionArt?.[region.id];
    if (!art) return;

    const regionGroup = svgElement("g", {
      class: "region-art",
      "data-region-id": region.id,
      "data-zone-id": region.zoneId,
      "data-art-state": art.assetRef ? "loading" : "fallback",
    });
    regionGroup.append(svgElement("path", {
      d: region.clipPath,
      class: "region-art-fallback",
      fill: art.fallbackFill || theme.palette.terrain,
    }));

    if (art.assetRef) {
      const image = svgElement("image", {
        x: region.artBox.x,
        y: region.artBox.y,
        width: region.artBox.width,
        height: region.artBox.height,
        class: "region-art-image",
        "data-region-id": region.id,
        "clip-path": `url(#${clipId})`,
        preserveAspectRatio: "xMidYMid slice",
        "pointer-events": "none",
      });
      if (theme.clayPreview && region.id === "region-zone-04") {
        // The existing western regions overlap by 60 units. Blend the local
        // high-detail sample through that overlap without moving its art box.
        const gradient = svgElement("linearGradient", { id: "clay-west-blend",
          gradientUnits: "userSpaceOnUse", x1: 0, y1: 560, x2: 0, y2: 620 });
        gradient.append(svgElement("stop", { offset: 0, "stop-color": "white", "stop-opacity": 0 }),
          svgElement("stop", { offset: 1, "stop-color": "white", "stop-opacity": 1 }));
        const mask = svgElement("mask", { id: "clay-west-mask", maskUnits: "userSpaceOnUse",
          x: 0, y: 560, width: 1200, height: 560 });
        mask.append(svgElement("rect", { x: 0, y: 560, width: 1200, height: 560, fill: "url(#clay-west-blend)" }));
        defs.append(gradient, mask);
        image.setAttribute("mask", "url(#clay-west-mask)");
      }
      image.addEventListener("load", () => {
        regionGroup.classList.add("is-ready");
        regionGroup.classList.remove("is-unavailable");
        regionGroup.dataset.artState = "ready";
      }, { once: true });
      image.addEventListener("error", () => {
        showRegionArtFallback(regionGroup, image);
      }, { once: true });
      regionGroup.append(image);
      image.setAttribute("href", art.assetRef);
    }

    if (Array.isArray(region.transitionPaths) && region.transitionPaths.length > 0) {
      const transitions = svgElement("g", {
        class: `region-art-transitions transition-${art.transitionStyle || "soft"}`,
      });
      region.transitionPaths.forEach((pathData) => {
        transitions.append(svgElement("path", {
          d: pathData,
          fill: art.transitionFill || art.fallbackFill || theme.palette.terrain,
          class: "region-art-transition",
        }));
      });
      regionGroup.append(transitions);
    }

    regionArtLayer.append(regionGroup);
  });

  return { defs, regionArtLayer };
}

function regionArtScene(routeEdges = visibleBoardEdges()) {
  const routeKey = routeEdges.map(({ id }) => id).join(",");
  const key = (
    `${activeWorldComposition.worldRef}:${theme.id}:`
    + `${runtime?.mapState?.cloudRouteOpen ? "cloud-route-open" : "base"}:`
    + `${layoutEditor.active ? `layout-${layoutEditor.revision}:` : ""}`
    + routeKey
  );
  if (!regionArtSceneCache || regionArtSceneCache.key !== key) {
    regionArtSceneCache = {
      key,
      ...buildRegionArtScene(routeEdges),
    };
  }
  return regionArtSceneCache;
}

function applyCameraTransform() {
  if (boardWorld) {
    boardWorld.setAttribute("transform", `translate(${-camera.x} ${-camera.y})`);
  }
  if (miniCameraWindow) {
    const boundedCamera = clampCamera(camera, cameraBounds(cameraBoardTemplate()));
    miniCameraWindow.setAttribute("x", String(boundedCamera.x));
    miniCameraWindow.setAttribute("y", String(boundedCamera.y));
  }
  if (nodes.panStatus) {
    const viewport = viewportSize(cameraBoardTemplate());
    const center = {
      x: camera.x + (viewport.width / 2),
      y: camera.y + (viewport.height / 2),
    };
    const zone = (activeBoardTemplate.zones || []).find(({ bounds }) => (
      center.x >= bounds.x
      && center.x <= bounds.x + bounds.width
      && center.y >= bounds.y
      && center.y <= bounds.y + bounds.height
    ));
    const zoneName = zone ? (theme.zoneNames?.[zone.id] || zone.label || zone.id) : "地图边缘";
    const nextZoneKey = `${theme.id}:${zone?.id || "edge"}`;
    if (cameraZoneKey !== nextZoneKey) {
      cameraZoneKey = nextZoneKey;
      nodes.panStatus.textContent = `${zoneName} · 拖动浏览 · 方向键移动`;
      nodes.mapZoneButtons
        ?.querySelectorAll("button")
        .forEach((button) => {
          if (button.dataset.zoneId === zone?.id) {
            button.setAttribute("aria-current", "location");
          } else {
            button.removeAttribute("aria-current");
          }
        });
    }
  }
}

function renderMapZoneButtons() {
  const buttons = (activeBoardTemplate.zones || []).map((zone, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.zoneId = zone.id;
    button.textContent = `${index + 1} ${theme.zoneNames?.[zone.id] || zone.label || zone.id}`;
    button.addEventListener("click", (event) => {
      const center = {
        x: zone.bounds.x + (zone.bounds.width / 2),
        y: zone.bounds.y + (zone.bounds.height / 2),
      };
      void animateCameraTo(centerCameraOnPoint(center, cameraBoardTemplate()), {
        animate: event.detail !== 0,
      });
    });
    return button;
  });
  nodes.mapZoneButtons.replaceChildren(...buttons);
  cameraZoneKey = null;
}

function renderMiniMap() {
  const world = boardWorldSize();
  const viewport = viewportSize(cameraBoardTemplate());
  nodes.miniMap.setAttribute("viewBox", `0 0 ${world.width} ${world.height}`);
  nodes.miniMap.replaceChildren();

  nodes.miniMap.append(svgElement("rect", {
    x: 0,
    y: 0,
    width: world.width,
    height: world.height,
    rx: 42,
    class: "mini-terrain",
  }));

  const miniZones = svgElement("g", { class: "mini-zones", "aria-hidden": "true" });
  (visualBoardTemplate.zones || []).forEach((zone) => {
    miniZones.append(svgElement("rect", {
      ...zone.bounds,
      rx: 36,
      "data-zone-id": zone.id,
    }));
  });
  nodes.miniMap.append(miniZones);

  const miniRoutes = svgElement("g", { class: "mini-routes", "aria-hidden": "true" });
  visibleBoardEdges().forEach((edge) => {
    miniRoutes.append(svgElement("path", {
      d: edgePath(edge),
      class: edge.terrainType === "cloud-stair" ? "is-cloud-stair" : "",
      "data-edge-id": edge.id,
    }));
  });
  nodes.miniMap.append(miniRoutes);

  const miniSpaces = svgElement("g", { class: "mini-spaces", "aria-hidden": "true" });
  visualBoardTemplate.nodes.forEach((space) => {
    const kind = activeNodeKind(space.id, space.spaceRole);
    const marker = svgElement("g", {
      class: `mini-space treasure-kind-${kind}`,
      transform: `translate(${space.x} ${space.y}) scale(.48)`,
      "data-node-id": space.id,
    });
    marker.append(nodeShape(kind, "mini-space-shape"));
    miniSpaces.append(marker);
  });
  nodes.miniMap.append(miniSpaces);

  if (
    fairyState.status === FAIRY_STATUS.active
    || fairyState.status === FAIRY_STATUS.sleeping
  ) {
    const fairyPosition = nodeById.get(fairyState.anchorId);
    if (fairyPosition) {
      const fairyMarker = svgElement("g", {
        class: "mini-fairy",
        transform: `translate(${fairyPosition.x} ${fairyPosition.y})`,
      });
      fairyMarker.append(svgElement("rect", {
        x: -19,
        y: -19,
        width: 38,
        height: 38,
        rx: 12,
      }));
      const label = svgElement("text", {
        x: 0,
        y: 6,
        "text-anchor": "middle",
      });
      label.textContent = "卡";
      fairyMarker.append(label);
      nodes.miniMap.append(fairyMarker);
    }
  }

  const miniPawns = svgElement("g", { class: "mini-pawns", "aria-hidden": "true" });
  runtime.teams.forEach((team, index) => {
    const displayedNodeId = team.id === movingTeamId && visualNodeId ? visualNodeId : team.nodeId;
    const position = nodeById.get(displayedNodeId);
    const character = characterProfileForSeatIndex(index);
    const offset = pawnOffset(index, runtime.teams.length);
    const marker = svgElement("g", {
      class: `mini-pawn mini-pawn-${index % PLAYER_PROFILES.length} ${
        index === runtime.activeTeamIndex ? "is-active" : ""
      }`,
      transform: `translate(${position.x + offset.x} ${position.y + offset.y})`,
      "data-team-id": team.id,
      "data-character-id": character.id,
      "data-node-id": displayedNodeId,
      "data-entity-kind": "player-pawn",
      "data-turn-state": index === runtime.activeTeamIndex ? "current" : "waiting",
    });
    marker.style.setProperty("--pawn-active-color", character.accent);
    if (index === runtime.activeTeamIndex) {
      marker.append(
        svgElement("ellipse", {
          cx: 0,
          cy: 24,
          rx: 27,
          ry: 8,
          class: "mini-pawn-turn-pedestal",
        }),
        svgElement("path", {
          d: "M -7 -47 L 0 -57 L 7 -47 Z",
          class: "mini-pawn-turn-chevron",
        }),
      );
    }
    appendSvgCharacterPawnArt(marker, character, {
      variant: "mini",
      x: -25,
      y: -44,
      width: 50,
      height: 68,
    });
    miniPawns.append(marker);
  });
  const activeMiniPawn = miniPawns.querySelector(".mini-pawn.is-active");
  if (activeMiniPawn) miniPawns.append(activeMiniPawn);
  nodes.miniMap.append(miniPawns);

  miniCameraWindow = svgElement("rect", {
    width: viewport.width,
    height: viewport.height,
    rx: 28,
    class: "mini-camera-window",
  });
  nodes.miniMap.append(miniCameraWindow);
  renderMapZoneButtons();
  applyCameraTransform();
}

function groundedSceneSelection() {
  const scene = theme.scenePresentation;
  const compatible = scene?.boardRef === `${activeBoardTemplate.id}@${activeBoardTemplate.version}`;
  const nodeIds = new Set(compatible ? visualBoardTemplate.nodes
    .filter((space) => scene.zoneIds.includes(activeNodePresentation(space.id).zoneId || space.zoneId))
    .map((space) => space.id) : []);
  return { scene: compatible ? scene : null, nodeIds };
}

function renderBoard() {
  const worldSize = boardWorldSize();
  const viewBox = cameraBoardTemplate().viewBox;
  const availableEdges = visibleBoardEdges();
  const surfaceEdges = availableEdges.filter((edge) => edge.terrainType !== "cloud-stair");
  const cloudStairEdges = availableEdges.filter((edge) => edge.terrainType === "cloud-stair");
  const { scene: groundedScene, nodeIds: groundedNodeIds } = groundedSceneSelection();
  const airCrossingEdges = surfaceEdges.filter((edge) => isAirCrossingEdge(groundedScene, edge.id));
  const groundedRoadEdges = surfaceEdges.filter((edge) => groundedNodeIds.has(edge.from) && groundedNodeIds.has(edge.to) && !isAirCrossingEdge(groundedScene, edge.id));
  const groundedRoadIds = new Set(groundedRoadEdges.map((edge) => edge.id));
  const roadEdges = surfaceEdges.filter((edge) => !groundedRoadIds.has(edge.id) && !isAirCrossingEdge(groundedScene, edge.id));
  const { defs, regionArtLayer } = regionArtScene(roadEdges);
  nodes.board.setAttribute("viewBox", viewBox.join(" "));
  const focusedRouteChoiceEdgeId = nodes.board.contains(document.activeElement)
    ? document.activeElement?.getAttribute?.("data-route-choice-edge-id") || null
    : null;
  nodes.board.replaceChildren();
  nodes.board.append(defs);
  const hasRegionArt = (visualBoardTemplate.artRegions || [])
    .some((region) => Boolean(theme.regionArt?.[region.id]?.assetRef));
  boardWorld = svgElement("g", {
    class: "board-world",
    "data-has-region-art": String(hasRegionArt),
    "data-scene-presentation": groundedScene?.id || "classic",
  });
  nodes.board.append(boardWorld);

  const terrain = svgElement("rect", {
    x: 8,
    y: 8,
    width: worldSize.width - 16,
    height: worldSize.height - 16,
    rx: 34,
    class: "terrain",
  });
  boardWorld.append(terrain);
  boardWorld.append(regionArtLayer);

  const zoneLayer = svgElement("g", { class: "zone-layer", "aria-hidden": "true" });
  (visualBoardTemplate.zones || []).forEach((zone) => {
    const group = svgElement("g", {
      class: "world-zone",
      "data-zone-id": zone.id,
      "data-grounded-zone": String(Boolean(groundedScene?.zoneIds.includes(zone.id))),
    });
    group.append(svgElement("rect", {
      ...zone.bounds,
      rx: 44,
      class: "zone-field",
    }));
    const label = svgElement("text", {
      x: zone.bounds.x + 30,
      y: zone.bounds.y + 48,
      class: "zone-label",
    });
    label.textContent = theme.zoneNames?.[zone.id] || zone.label || zone.id;
    if (layoutEditor.active) group.append(label);
    zoneLayer.append(group);
  });
  boardWorld.append(zoneLayer);

  const decor = svgElement("g", { class: "terrain-decor", "aria-hidden": "true" });
  const decorCount = Math.max(18, Math.round((worldSize.width * worldSize.height) / 64000));
  for (let i = 0; i < decorCount; i += 1) {
    decor.append(svgElement("circle", {
      cx: 70 + ((i * 257) % Math.max(1, worldSize.width - 140)),
      cy: 70 + ((i * 149) % Math.max(1, worldSize.height - 140)),
      r: 8 + (i % 3) * 3,
    }));
  }
  boardWorld.append(decor);

  const routePresentation = theme.routeSkin?.presentation || "grounded";
  const routeLayer = svgElement("g", {
    class: "route-layer",
    "data-route-presentation": routePresentation,
  });
  const allRoutes = routePathData(roadEdges);
  const shadowOffsetY = Number(theme.routeSkin?.shadowOffsetY) || 0;
  routeLayer.append(
    svgElement("path", { d: allRoutes, class: "route-grounding" }),
    svgElement("path", {
      d: allRoutes,
      class: "route-shadow",
      transform: `translate(0 ${shadowOffsetY})`,
    }),
    svgElement("path", { d: allRoutes, class: "route-cloud-bank" }),
    svgElement("path", { d: allRoutes, class: "route-outline" }),
    svgElement("path", { d: allRoutes, class: "route-line" }),
  );
  const textureAssetRef = theme.routeSkin?.textureAssetRef;
  if (textureAssetRef && !unavailableArtwork.has(textureAssetRef)) {
    routeLayer.append(svgElement("rect", {
      x: 0,
      y: 0,
      width: worldSize.width,
      height: worldSize.height,
      class: "route-texture",
      fill: "url(#route-texture-pattern)",
      mask: "url(#route-texture-mask)",
      "pointer-events": "none",
    }));
  }
  routeLayer.append(svgElement("path", { d: allRoutes, class: "route-highlight" }));
  if (groundedRoadEdges.length) {
    const timberIds = new Set(groundedScene.timberEdgeIds);
    const groundedRoutes = createGroundedRouteVisuals({
      prefix: "board-grounded-harbor",
      svgElement,
      surfaces: groundedScene.id === "grounded-crystal.v1" ? crystalRouteSurfaces({
        edges: groundedRoadEdges, nodeById, edgePath,
        zoneForNode: (space) => activeNodePresentation(space.id).zoneId || space.zoneId,
        timberEdgeIds: groundedScene.timberEdgeIds,
      }) : undefined,
      paths: {
        stone: groundedRoadEdges.filter((edge) => !timberIds.has(edge.id))
          .map((edge) => ({ id: edge.id, d: edgePath(edge) })),
        timber: groundedRoadEdges.filter((edge) => timberIds.has(edge.id))
          .map((edge) => ({ id: edge.id, d: edgePath(edge) })),
      },
    });
    nodes.board.append(groundedRoutes.defs);
    if (theme.clayPreview && !layoutEditor.active) {
      appendClayRouteMaterial(groundedRoutes.group);
      appendClayRoutePavers(groundedRoutes.group, { svgElement,
        paths: groundedRoadEdges.filter(edge => !timberIds.has(edge.id))
          .map(edge => ({ id: edge.id, d: edgePath(edge) })) });
    }
    routeLayer.append(groundedRoutes.group);
  }
  airCrossingEdges.forEach((edge) => routeLayer.append(airCrossingVisualForEdge(edge)));
  cloudStairEdges.forEach((edge) => {
    const stairGroup = svgElement("g", {
      class: "cloud-stair-route is-open",
      "data-edge-id": edge.id,
      "aria-hidden": "true",
    });
    const stairLine = svgElement("path", {
      d: edgePath(edge),
      class: "cloud-stair-line",
    });
    stairGroup.append(
      svgElement("path", { d: edgePath(edge), class: "cloud-stair-glow" }),
      stairLine,
    );
    pointsAlongSvgPath(stairLine, edge, [0.25, 0.5, 0.75])
      .forEach((point, index) => {
        stairGroup.append(svgElement("ellipse", {
          cx: point.x,
          cy: point.y,
          rx: index === 1 ? 25 : 23,
          ry: index === 1 ? 13 : 12,
          class: "cloud-stair-step",
          "data-cloud-step": index + 1,
        }));
      });
    routeLayer.append(stairGroup);
  });
  const activeNodeId = activePawnNodeId();
  availableEdges
    .filter((edge) => edge.from === activeNodeId)
    .forEach((edge) => {
      routeLayer.append(svgElement("path", {
        d: edgePath(edge),
        class: "route-active-flow",
        "data-air-crossing": String(isAirCrossingEdge(theme.scenePresentation, edge.id)),
        "data-edge-id": edge.id,
      }));
    });
  if (routeChoicePresentation) {
    routeChoicePresentation.options.forEach((option) => {
      option.edgeIds.forEach((edgeId) => {
        const edge = availableEdges.find((candidate) => candidate.id === edgeId);
        if (!edge) return;
        const muted = (
          routeChoicePresentation.selectedEdgeId
          && routeChoicePresentation.selectedEdgeId !== option.edgeId
        );
        routeLayer.append(svgElement("path", {
          d: edgePath(edge),
          class: (
            `route-choice-flow is-${option.tone || "positive"} `
            + `${muted ? "is-muted" : ""}`
          ),
          "data-route-option-edge-id": option.edgeId,
          "data-edge-id": edge.id,
        }));
      });
    });
  }
  if (movePlanPresentation) {
    movePlanPresentation.edgeIds.forEach((edgeId) => {
      const edge = availableEdges.find((candidate) => candidate.id === edgeId);
      if (!edge) return;
      routeLayer.append(svgElement("path", {
        d: edgePath(edge),
        class: "route-committed-plan",
        "data-edge-id": edge.id,
      }));
    });
    if (movePlanPresentation.transport) {
      routeLayer.append(svgElement("path", {
        d: transportPreviewPath(movePlanPresentation.transport),
        class: "transport-plan-preview",
        "data-transport-from-node-id": movePlanPresentation.transport.id,
        "data-transport-to-node-id": movePlanPresentation.transport.transportTargetId,
      }));
    }
  }
  if (layoutEditor.active && layoutEditor.selectedNodeId) {
    const connectedRouteLayer = svgElement("g", {
      class: "layout-editor-connected-route-layer",
      "aria-hidden": "true",
    });
    availableEdges
      .filter((edge) => (
        edge.from === layoutEditor.selectedNodeId
        || edge.to === layoutEditor.selectedNodeId
      ))
      .forEach((edge) => {
        connectedRouteLayer.append(svgElement("path", {
          d: edgePath(edge),
          class: "is-layout-editor-connected",
          "data-edge-id": edge.id,
        }));
      });
    routeLayer.append(connectedRouteLayer);
  }
  boardWorld.append(routeLayer);

  const landmarks = svgElement("g", { class: "landmark-layer" });
  theme.landmarks.forEach((sourceLandmark) => {
    const landmark = cloudHarborLandmark(sourceLandmark, { theme, worldRef: activeWorldComposition.worldRef });
    if (!landmark) return;
    const isGroundedLandmark = groundedScene && visualBoardTemplate.zones.some((zone) => (
      groundedScene.zoneIds.includes(zone.id)
      && landmark.x >= zone.bounds.x && landmark.x <= zone.bounds.x + zone.bounds.width
      && landmark.y >= zone.bounds.y && landmark.y <= zone.bounds.y + zone.bounds.height
    ));
    const group = svgElement("g", {
      transform: `translate(${landmark.x} ${landmark.y})`,
      class: isGroundedLandmark ? "grounded-landmark" : "",
    });
    const plate = svgElement("rect", { x: -45, y: -30, width: 90, height: 55, rx: 18 });
    const icon = svgElement("text", { x: 0, y: -2, "text-anchor": "middle", class: "landmark-icon" });
    icon.textContent = landmark.icon;
    const label = svgElement("text", { x: 0, y: 18, "text-anchor": "middle", class: "landmark-label" });
    label.textContent = landmark.label;
    group.append(plate, icon);
    if (layoutEditor.active) group.append(label);
    landmarks.append(group);
  });
  boardWorld.append(landmarks);

  const harborItemLayer = svgElement("g", {
    class: "harbor-item-layer",
    "aria-hidden": "true",
  });
  const groundedFacilityLayer = svgElement("g", {
    class: "grounded-facility-layer",
    "aria-hidden": "true",
    "pointer-events": "none",
  });
  if (isCloudHarborPresentation(theme, activeWorldComposition.worldRef)) {
    const beaconNode = nodeById.get("n18");
    if (beaconNode) {
      const host = svgElement("g", {
        class: "departure-beacon-device harbor-light-device",
        transform: `translate(${beaconNode.x} ${beaconNode.y})`,
        "data-item-node-id": beaconNode.id,
        "data-region-effect-ref": "harbor.departure-beacon.v1",
        "pointer-events": "none",
      });
      appendHarborLightHost(host, { kind: "departure", label: "离港光点" });
      harborItemLayer.append(host);
    }
  }
  boardWorld.append(harborItemLayer);

  const transportLayer = svgElement("g", { class: "transport-layer" });
  visualBoardTemplate.nodes
    .filter((space) => space.spaceRole === "transport")
    .forEach((space) => {
      const isHarborTransport = (
        isCloudHarborWorldRef(activeWorldComposition.worldRef)
      );
      const skin = theme.transportSkins[space.transportProfileRef] || {
        deviceVariant: "cloud-cannon",
        label: "跳步发射器",
      };
      const unlockAfter = Number(space.transportUnlockAfterCompletedTurns) || 0;
      const launcherLocked = (runtime.completedMoveCount ?? runtime.acceptedCount) < unlockAfter;
      const target = nodeById.get(space.transportTargetId);
      const aimAngle = target
        ? Math.atan2(target.y - space.y, target.x - space.x) * (180 / Math.PI)
        : 0;
      const group = svgElement("g", {
        class: `launcher-device launcher-${skin.deviceVariant} ${
          launcherLocked ? "is-locked" : "is-ready"
        }`,
        transform: `translate(${space.x - 2} ${space.y - (groundedNodeIds.has(space.id) ? 23 : 43)}) scale(.82)`,
        "data-transport-node-id": space.id,
        "data-launcher-state": launcherLocked
          ? "locked"
          : runtime.mapState?.cloudReefCleared
            ? "route-open"
            : "ready",
      });
      const label = svgElement("text", {
        x: 0,
        y: -48,
        "text-anchor": "middle",
        class: "launcher-label",
      });
      label.textContent = !isHarborTransport
        ? `${skin.label} · 星路已锁定`
        : launcherLocked
        ? `${skin.label} · ${unlockAfter - (runtime.completedMoveCount ?? runtime.acceptedCount)} 轮后充能`
        : runtime.mapState?.cloudReefCleared
          ? `${skin.label} · 航线已开启`
          : `${skin.label} · 首次清礁并发射`;
      if (groundedNodeIds.has(space.id)) label.textContent = skin.label;
      if (layoutEditor.active) group.append(label);
      if (isHarborTransport) {
        // Historical cloud-harbor snapshots keep their frozen transport rule,
        // but never draw machinery art.
        label.textContent = "云路捷径";
        appendHarborLightHost(group, { kind: "route", active: true, label: "云路捷径" });
      } else {
        appendWorldTransportDevice(group, {
          variant: skin.deviceVariant,
          label: skin.label,
        });
      }
      (groundedNodeIds.has(space.id) ? groundedFacilityLayer : transportLayer).append(group);
    });
  boardWorld.append(transportLayer);

  const mapEffectLayer = svgElement("g", {
    class: "map-effect-layer",
    "aria-hidden": "true",
  });
  visualBoardTemplate.nodes
    .filter((space) => space.spaceRole === "map-effect")
    .forEach((space) => {
      const skin = mapEffectSkin(space.mapEffectRef);
      const isHarborMapEffect = (
        isCloudHarborWorldRef(activeWorldComposition.worldRef)
      );
      const discovered = (
        runtime.world?.active?.levelState?.discoveredNodeIds || []
      ).includes(space.id);
      const group = svgElement("g", {
        class: `map-effect-device map-effect-device-${skin.deviceVariant}`,
        transform: `translate(${space.x + 4} ${space.y - (groundedNodeIds.has(space.id) ? 23 : 53)}) scale(.78)`,
        "data-map-effect-node-id": space.id,
        "data-map-effect-ref": space.mapEffectRef,
        "data-map-effect-state": (
          space.mapEffectRef === "harbor.cloudfall-gate.v1"
          && runtime.mapState?.cloudRouteOpen
        ) ? "open" : "ready",
      });
      const label = svgElement("text", {
        x: 0,
        y: -50,
        "text-anchor": "middle",
        class: "map-effect-label",
      });
      if (isHarborMapEffect) {
        group.setAttribute("transform", `translate(${space.x} ${space.y})`);
        group.classList.add("harbor-light-device");
        appendHarborLightHost(group, {
          active: space.mapEffectRef === "harbor.cloudfall-gate.v1" && runtime.mapState?.cloudRouteOpen,
          label: skin.label,
        });
      } else {
        label.textContent = discovered
          ? `${skin.label} · 图鉴已记录`
          : `${skin.label} · 等待发现`;
        if (layoutEditor.active) group.append(label);
        appendWorldMapDevice(group, { variant: skin.deviceVariant, label: skin.label, discovered });
      }
      if (groundedNodeIds.has(space.id)) label.textContent = skin.label;
      (groundedNodeIds.has(space.id) ? groundedFacilityLayer : mapEffectLayer).append(group);
    });
  boardWorld.append(mapEffectLayer);

  if (layoutEditor.active && layoutEditor.selectedNodeId) {
    const base = layoutEditorBaseNode();
    const visual = layoutEditorVisualNode();
    if (base && visual && (base.x !== visual.x || base.y !== visual.y)) {
      const originLayer = svgElement("g", {
        class: "layout-editor-origin-layer",
        "data-layout-origin-node-id": base.id,
        "aria-hidden": "true",
      });
      originLayer.append(
        svgElement("path", {
          d: `M ${base.x} ${base.y} L ${visual.x} ${visual.y}`,
          class: "layout-editor-origin-line",
        }),
        svgElement("circle", {
          cx: base.x,
          cy: base.y,
          r: 29,
          class: "layout-editor-origin-marker",
        }),
      );
      const originLabel = svgElement("text", {
        x: base.x,
        y: base.y - 38,
        "text-anchor": "middle",
        class: "layout-editor-origin-label",
      });
      originLabel.textContent = `原位 · ${base.id}`;
      originLayer.append(originLabel);
      boardWorld.append(originLayer);
    }
  }

  const spaceLayer = svgElement("g", { class: "space-layer" });
  const pawnOccupiedNodeIds = new Set(runtime.teams.map((team) => (
    team.id === movingTeamId && visualNodeId ? visualNodeId : team.nodeId
  )));
  const layoutConnectedNodeIds = layoutEditor.active
    ? layoutEditorConnectedNodeIds()
    : new Set();
  visualBoardTemplate.nodes.forEach((space) => {
    const kind = activeNodeKind(space.id, space.spaceRole);
    const presentation = activeNodePresentation(space.id, kind);
    const outcome = activeNodeOutcome(space.id);
    const isOrdinaryNode = outcome.category === "ordinary";
    const isGroundedNode = groundedNodeIds.has(space.id);
    const routePreviewOption = routeChoicePresentation?.options
      .find((option) => option.routeNodeIds.includes(space.id));
    const isRouteJunction = routeChoicePresentation?.junctionNodeId === space.id;
    const isMovePlanNode = (
      movePlanPresentation?.nodeIds?.includes(space.id)
      || movePlanPresentation?.transport?.transportCaptureNodeIds?.includes(space.id)
      || movePlanPresentation?.transport?.transportTargetId === space.id
    );
    const group = svgElement("g", {
      class: (
        `board-space role-${space.spaceRole} treasure-kind-${kind} `
        + `outcome-${outcome.category} `
        + `${isOrdinaryNode ? "is-ordinary" : "is-special"} `
        + `${space.id === activeNodeId ? "is-current" : ""} `
        + `${visitedNodeIds.has(space.id) ? "is-visited" : ""} `
        + `${["mooring", "foghorn", "cloud-gate", "transport"].includes(kind)
          ? "is-effect-ready"
          : ""} `
        + `${isRouteJunction ? "is-route-junction" : ""} `
        + `${isMovePlanNode ? "is-move-plan" : ""} `
        + `${routePreviewOption ? "is-route-preview" : ""} `
        + `${routePreviewOption ? `is-route-preview-${routePreviewOption.tone}` : ""} `
        + `${layoutEditor.active && space.id === layoutEditor.selectedNodeId
          ? "is-layout-editor-selected"
          : ""} `
        + `${layoutConnectedNodeIds.has(space.id) ? "is-layout-editor-connected" : ""} `
        + `${layoutEditor.draft?.nodePositions?.[space.id]
          ? "is-layout-editor-moved"
          : ""}`
      ),
      transform: `translate(${space.x} ${space.y})`,
      "data-node-id": space.id,
      "data-grounded-node": String(isGroundedNode),
      "data-base-x": layoutEditorBaseNode(space.id)?.x ?? space.x,
      "data-base-y": layoutEditorBaseNode(space.id)?.y ?? space.y,
      "data-entity-kind": "map-space",
      "data-treasure-kind": kind,
      "data-reward-ref": presentation.rewardRef || "",
      "data-node-label": presentation.label,
      "data-node-zone": presentation.zoneId || space.zoneId || "",
      "data-node-visual": presentation.visualKind || "",
      "data-node-settlement": isOrdinaryNode ? "ordinary" : "special",
      "data-outcome-kind": outcome.category,
      "data-outcome-trigger": outcome.trigger,
      "data-outcome-label": outcome.shortLabel,
      "data-outcome-badge": nodeOutcomeBadgeLabel(outcome),
      "data-effect-tone": outcome.tone,
      "data-direct-reward": outcome.hasDirectReward,
      role: layoutEditor.active ? "button" : "img",
      "aria-label": (
        `${presentation.label}。${outcome.badgeLabel}：${outcome.shortLabel}。`
        + outcome.detail
      ),
    });
    if (layoutEditor.active) {
      const selected = space.id === layoutEditor.selectedNodeId;
      group.setAttribute("tabindex", selected ? "0" : "-1");
      group.setAttribute("aria-pressed", String(selected));
      group.setAttribute(
        "aria-label",
        `${presentation.label}，${space.id}，X ${space.x}，Y ${space.y}`
        + `${layoutEditor.draft?.nodePositions?.[space.id] ? "，已调整" : "，原位置"}`,
      );
      group.append(svgElement("circle", {
        r: 40,
        class: "layout-editor-node-hit",
        "aria-hidden": "true",
      }));
    }
    const halo = svgElement("g", {
      class: "space-state-halo",
      "aria-hidden": "true",
    });
    halo.append(
      svgElement("circle", { r: 31, class: "space-state-halo-outer" }),
      svgElement("circle", { r: 27, class: "space-state-halo-inner" }),
    );
    group.append(halo);
    const nodeSkin = theme.nodeSkins?.[kind] || null;
    if (nodeSkin?.rimColor) {
      group.style.setProperty("--node-art-rim", nodeSkin.rimColor);
    }
    if (isGroundedNode) {
      appendGroundedNodeVisual(group, {
        kind: groundedScene.id === "grounded-crystal.v1" && outcome.hasDirectReward
          ? ({ "⭐": "star", "★": "star", "🪙": "coin", "🔑": "key" }[outcome.icon] || kind) : kind,
        ordinary: isOrdinaryNode,
        facility: groundedScene.facilityNodeIds.includes(space.id),
        glyph: nodeSkin?.fallbackGlyph || nodeGlyph(kind),
      });
    } else appendNodeVisualLayers(group, {
      kind,
      glyph: nodeSkin?.fallbackGlyph || nodeGlyph(kind),
      label: (
        layoutEditor.active
          ? `${presentation.label}。${outcome.badgeLabel}：${outcome.shortLabel}。` + outcome.detail
          : ""
      ),
      assetRef: nodeSkin?.assetRef || "",
      artMode: nodeSkin?.artMode || "interior",
      clipId: `${theme.id}-${space.id}`,
    });
    const effectBadge = {
      tone: outcome.tone,
      label: nodeOutcomeBadgeLabel(outcome),
    };
    if (layoutEditor.active && effectBadge && !isOrdinaryNode) {
      const isOrdinaryBadge = outcome.category === "ordinary";
      const badgeWidth = isOrdinaryBadge
        ? 40
        : Math.max(54, Math.min(132, effectBadge.label.length * 12 + 18));
      const badge = svgElement("g", {
        class: `node-effect-badge is-${effectBadge.tone}`,
        transform: "translate(0 26)",
        "aria-hidden": "true",
      });
      badge.append(svgElement("rect", {
        x: -badgeWidth / 2,
        y: isOrdinaryBadge ? 1 : 0,
        width: badgeWidth,
        height: isOrdinaryBadge ? 14 : 16,
        rx: isOrdinaryBadge ? 6 : 7,
      }));
      const badgeLabel = svgElement("text", {
        x: 0,
        y: 11,
        "text-anchor": "middle",
      });
      badgeLabel.textContent = effectBadge.label;
      badge.append(badgeLabel);
      group.append(badge);
    }
    if (layoutEditor.active) {
      const nameplate = svgElement("g", {
        class: "space-nameplate",
        "aria-hidden": "true",
      });
      const nameplateLabel = isOrdinaryNode ? "普通道路" : presentation.label;
      const nameplateWidth = Math.max(64, nameplateLabel.length * 9 + 18);
      nameplate.append(svgElement("rect", {
        x: -nameplateWidth / 2,
        y: -14,
        width: nameplateWidth,
        height: 21,
        rx: 10,
      }));
      const nameplateText = svgElement("text", {
        x: 0,
        y: 1,
        "text-anchor": "middle",
      });
      nameplateText.textContent = nameplateLabel;
      nameplate.append(nameplateText);
      group.append(nameplate);
    }
    const pointPresentation = nodeLandingPointsPresentation({
      rule: gameSession?.landingPoints?.rule, worldRef: activeWorldComposition.worldRef,
      node: space, board: visualBoardTemplate, label: presentation.label,
      targetLabel: space.transportTargetId ? activeNodePresentation(space.transportTargetId).label : undefined,
    });
    if (pointPresentation && !layoutEditor.active) {
      group.setAttribute("data-platform-points", String(pointPresentation.amount));
      group.setAttribute("data-platform-points-target-node-id", pointPresentation.destinationId);
      group.setAttribute("aria-label", pointPresentation.ariaLabel + (isOrdinaryNode ? "" : `地图效果：${outcome.shortLabel}。`));
      // Score style A: the number is printed on the (tier-tinted) tile itself.
      appendClayPreviewTile(group, { svgElement, amount: pointPresentation.amount,
        valueScale: pointPresentation.valueScale, enabled: Boolean(theme.clayPreview) });
      appendTilePoints(group, {
        svgElement, amount: pointPresentation.amount, transported: pointPresentation.transported, valueScale: pointPresentation.valueScale,
        token: isGroundedNode ? group.querySelector(".grounded-node") : null,
        occupied: pawnOccupiedNodeIds.has(space.id),
      });
    }
    const specialCell = specialCellForBoardNode(space.id);
    if (specialCell) {
      group.classList.add("has-special-cell");
      const marker = specialCellMarker(specialCell, {
        hidden: specialCellsHiddenIds.has(specialCell.cellId),
        exhausted: SPECIAL_CELL_TYPE_BY_ID[specialCell.type]?.category === "move" && specialCellsMovesExhausted(currentSpecialCells()),
      });
      if (theme.clayPreview && !layoutEditor.active) {
        appendClaySpecialFlag(marker, { svgElement, label: specialCellShortLabel(specialCell.type) });
      }
      group.append(marker);
    }
    spaceLayer.append(group);
  });
  boardWorld.append(spaceLayer);
  boardWorld.append(groundedFacilityLayer);

  if (
    fairyState.status === FAIRY_STATUS.active
    || fairyState.status === FAIRY_STATUS.sleeping
  ) {
    const fairyPosition = nodeById.get(fairyState.anchorId);
    if (fairyPosition) {
      const fairy = svgElement("g", {
        class: `fairy-entity ${fairyState.status === FAIRY_STATUS.sleeping ? "is-sleeping" : ""}`,
        transform: `translate(${fairyPosition.x} ${fairyPosition.y - 68})`,
        "data-entity-kind": "fairy",
        "data-fairy-anchor-id": fairyState.anchorId,
      });
      const title = svgElement("title");
      title.textContent = fairyState.status === FAIRY_STATUS.sleeping
        ? "睡着的卡卡精灵，抱着一颗星星"
        : "卡卡精灵，抱着一颗星星";
      fairy.append(
        title,
        svgElement("ellipse", {
          cx: -25,
          cy: -4,
          rx: 17,
          ry: 24,
          class: "fairy-wing",
          transform: "rotate(-28 -25 -4)",
        }),
        svgElement("ellipse", {
          cx: 25,
          cy: -4,
          rx: 17,
          ry: 24,
          class: "fairy-wing",
          transform: "rotate(28 25 -4)",
        }),
        svgElement("path", {
          d: "M -22 -20 Q 0 -38 22 -20 V 19 Q 0 38 -22 19 Z",
          class: "fairy-body",
        }),
      );
      const face = svgElement("text", {
        x: 0,
        y: 5,
        "text-anchor": "middle",
        class: "fairy-face",
      });
      face.textContent = fairyState.status === FAIRY_STATUS.sleeping ? "Zz" : "卡";
      const caseGlyph = svgElement("text", {
        x: 29,
        y: 30,
        "text-anchor": "middle",
        class: "fairy-case-glyph",
      });
      caseGlyph.textContent = "▣";
      const label = svgElement("text", {
        x: 0,
        y: -42,
        "text-anchor": "middle",
        class: "fairy-label",
      });
      label.textContent = fairyState.status === FAIRY_STATUS.sleeping
        ? "卡卡精灵睡着啦"
        : "追上卡卡精灵";
      fairy.append(face, caseGlyph);
      if (layoutEditor.active) fairy.append(label);
      boardWorld.append(fairy);
    }
  }

  const pawnLayer = svgElement("g", { class: "pawn-layer" });
  runtime.teams.forEach((team, index) => {
    const displayedNodeId = team.id === movingTeamId && visualNodeId ? visualNodeId : team.nodeId;
    const position = nodeById.get(displayedNodeId);
    const character = characterProfileForSeatIndex(index);
    const playerName = team.members[0] || team.label;
    let offset = pawnOffset(index, runtime.teams.length);
    if (theme.clayPreview && !layoutEditor.active) {
      const occupants = runtime.teams.filter(candidate => (
        candidate.id === movingTeamId && visualNodeId ? visualNodeId : candidate.nodeId
      ) === displayedNodeId);
      const localIndex = occupants.findIndex(candidate => candidate.id === team.id);
      const crowdOffset = pawnOffset(localIndex, occupants.length);
      // Stand at the back of this tile, leaving its own front surface readable.
      offset = { x: crowdOffset.x, y: Math.min(crowdOffset.y, -46) };
    }
    const group = svgElement("g", {
      class: `pawn ${index === runtime.activeTeamIndex ? "is-active" : ""}`,
      transform: `translate(${position.x + offset.x} ${position.y + offset.y})`,
      "data-team-id": team.id,
      "data-character-id": character.id,
      "data-node-id": displayedNodeId,
      "data-entity-kind": "player-pawn",
      "data-turn-state": index === runtime.activeTeamIndex ? "current" : "waiting",
      role: "img",
      "aria-label": index === runtime.activeTeamIndex
        ? `当前玩家棋子：${playerName}，${character.label}，轮到 ${playerName}`
        : `玩家棋子：${playerName}，${character.label}，等待轮转`,
    });
    group.style.setProperty("--pawn-active-color", character.accent);
    const accessibleName = svgElement("title");
    accessibleName.textContent = index === runtime.activeTeamIndex
      ? `当前玩家棋子：${playerName}，${character.label}，轮到 ${playerName}`
      : `玩家棋子：${playerName}，${character.label}，等待轮转`;
    group.append(accessibleName);
    const motion = svgElement("g", { class: "pawn-motion" });
    if (index === runtime.activeTeamIndex) {
      const turnIndicator = svgElement("g", {
        class: "pawn-turn-indicator",
        "aria-hidden": "true",
      });
      turnIndicator.append(
        svgElement("ellipse", {
          cx: 0,
          cy: -10,
          rx: 38,
          ry: 45,
          class: "pawn-turn-aura",
        }),
        svgElement("ellipse", {
          cx: 0,
          cy: 27,
          rx: 30,
          ry: 9,
          class: "pawn-turn-pedestal",
        }),
        svgElement("path", {
          d: "M -8 -59 L 0 -70 L 8 -59 Z",
          class: "pawn-turn-chevron",
        }),
      );
      motion.append(turnIndicator);
    }
    motion.append(svgElement("ellipse", {
      cx: 0,
      cy: 27,
      rx: 21,
      ry: 6,
      class: "pawn-shadow",
    }));
    appendSvgCharacterPawnArt(motion, character, theme.clayPreview && !layoutEditor.active
      ? { x: -34, y: -67, width: 68, height: 92 } : {});
    const label = svgElement("text", {
      x: 0,
      y: theme.clayPreview && !layoutEditor.active ? -74 : -59,
      "text-anchor": "middle",
      class: "pawn-label",
    });
    label.textContent = index === runtime.activeTeamIndex
      ? `${playerName} · 轮到`
      : playerName;
    motion.append(label);
    group.append(motion);
    pawnLayer.append(group);
  });
  const activePawn = pawnLayer.querySelector(".pawn.is-active");
  if (activePawn) pawnLayer.append(activePawn);
  boardWorld.append(pawnLayer);
  const routeChoiceLayer = boardRouteChoiceLayer();
  if (routeChoiceLayer) {
    boardWorld.insertBefore(routeChoiceLayer.previews, spaceLayer);
    boardWorld.append(routeChoiceLayer.layer);
    if (focusedRouteChoiceEdgeId) routeChoiceLayer.focus(focusedRouteChoiceEdgeId);
  }

  applyCameraTransform();
  if (specialCellsOverviewProgress > 0) setSpecialCellsOverview(specialCellsOverviewProgress);
  renderMiniMap();
}

function textElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

const PLAYER_ASSET_META = Object.freeze([]);

function normalizedVisibleAssets(ownerId) {
  return homePointsSummary(gameSession, landingPoints.get(landingGameId())?.session, ownerId);
}

function playerAssetsAccessibleName(playerName, assets) {
  return `${playerName}：本局家园积分${assets.registered ? `已到账 ${assets.earned}` : "未接入"}，行动 ${assets.actions} 次`;
}

function createPlayerAssetStrip(ownerId, playerName, { className = "" } = {}) {
  const assets = normalizedVisibleAssets(ownerId);
  const strip = document.createElement("div");
  const clayInline = CLAY_PREVIEW_REQUESTED && !layoutEditor.active;
  strip.className = `player-assets ${className}${clayInline ? " is-clay-inline" : ""}`.trim();
  strip.dataset.ownerId = ownerId;
  strip.setAttribute("role", "img");
  strip.setAttribute("aria-label", playerAssetsAccessibleName(playerName, assets));
  for (const [resource, label, value] of [
    ["points", "本局家园积分", assets.registered ? (coinFx.displayed(ownerId) ?? assets.earned) : "未接入"],
    ["actions", "行动次数", assets.actions],
  ]) {
    const badge = document.createElement("span");
    badge.className = `player-asset-badge is-${resource}`;
    badge.dataset.playerAsset = resource;
    badge.dataset.ownerId = ownerId;
    if (clayInline && resource === "points" && typeof value === "number") {
      badge.dataset.valueDigits = String(value).length;
      badge.style.setProperty("--clay-value-font", `${Math.min(25, 125 / String(value).length)}px`);
    }
    badge.title = `${label} ${value}`;
    badge.setAttribute("aria-hidden", "true");
    const visibleLabel = clayInline ? (resource === "points" ? "积分" : "行动") : label;
    badge.append(textElement("i", "", resource === "points" ? "分" : "步"),
      textElement("strong", "", String(value)), textElement("small", "player-asset-label", visibleLabel));
    if (clayInline && resource === "actions") badge.append(textElement("small", "clay-action-unit", "次"));
    strip.append(badge);
  }
  return strip;
}

function playerRewardDetailId(ownerId) {
  return `player-reward-detail-${String(ownerId).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function createPlayerRewardMetric(label, value, resource) {
  const metric = document.createElement("div");
  metric.className = `player-reward-detail-metric is-${resource}`;
  metric.dataset.detailAsset = resource;
  metric.append(
    textElement("dt", "", label),
    textElement("dd", "", String(value)),
  );
  return metric;
}

function createPlayerRewardDetail(ownerId, playerName, seat, assets) {
  const detail = document.createElement("section");
  detail.id = playerRewardDetailId(ownerId);
  detail.className = "player-reward-detail";
  detail.dataset.playerDetail = ownerId;
  detail.setAttribute("role", "tooltip");
  const heading = document.createElement("header");
  heading.className = "player-reward-detail-heading";
  heading.append(textElement("span", "", "本局行程"), textElement("strong", "", playerName));
  const metrics = document.createElement("dl");
  metrics.className = "player-reward-detail-metrics";
  metrics.append(createPlayerRewardMetric("已到账家园积分", assets.registered ? assets.earned : "未接入", "points"),
    createPlayerRewardMetric("行动次数", assets.actions, "actions"));
  const wallet = landingPoints.wallet(ownerId);
  const balance = Number.isSafeInteger(wallet?.balance) ? `家园可用积分 ${wallet.balance}。` : "";
  const footnote = textElement("small", "player-reward-detail-footnote", assets.registered
    ? `${balance}只领最终停格积分，已到账积分保留在家园账户。`
    : "本局未接入家园积分，请新开自由记分局参与；已有账户余额保留。");
  detail.append(heading, metrics, footnote);
  return detail;
}

function createPlayerHud(
  playerState,
  index,
  active,
  next,
  alignRight,
  sessionValue = gameSession,
) {
  const playerName = playerState.members[0] || playerState.label;
  const character = characterProfileForSeatIndex(index);
  const nodeKind = activeNodeKind(playerState.nodeId, "learning");
  const seat = sessionValue?.seats?.find((candidate) => (
    candidate.teamId === playerState.id
  ));
  const ownerId = seat?.id || `seat-${index + 1}`;
  const assets = normalizedVisibleAssets(ownerId);
  const card = document.createElement("article");
  card.className = `team-hud ${alignRight ? "team-hud-right" : "team-hud-left"}`;
  card.dataset.playerId = ownerId;
  card.dataset.teamId = playerState.id;
  card.dataset.entityKind = "player-summary";
  card.dataset.turnState = active ? "current" : next ? "next" : "waiting";
  card.setAttribute(
    "aria-label",
    playerAssetsAccessibleName(playerName, assets),
  );
  const compact = runtime.teams.length >= 5;
  if (currentSpecialCells()?.heldDoubleDiceByStudent?.[ownerId]) {
    const held = textElement("span", "held-double-chance", "🎲🎲");
    held.setAttribute("aria-label", "持有双骰机会，下次掷两颗骰子");
    held.title = "双骰机会 · 下次掷两颗骰子";
    card.append(held);
  }
  if (compact) {
    const splitIndex = Math.ceil(runtime.teams.length / 2);
    const localIndex = alignRight ? index - splitIndex : index;
    const groupSize = alignRight
      ? runtime.teams.length - splitIndex
      : splitIndex;
    card.classList.add("is-compact");
    card.dataset.hudDensity = "compact";
    card.dataset.detailAlign = localIndex >= Math.ceil(groupSize / 2)
      ? "right"
      : "left";
    card.tabIndex = 0;
    card.setAttribute(
      "aria-label",
      `${playerAssetsAccessibleName(playerName, assets)}`
      + "。聚焦后可查看个人奖励明细",
    );
  } else {
    card.dataset.hudDensity = "full";
  }

  const copy = document.createElement("div");
  copy.className = `team-copy ${active ? "is-active" : ""}`;
  copy.append(
    textElement("span", "", isTeacherSession(gameSession)
      ? (active && gameSession.teacherOpportunity ? "获得机会" : "本堂课成员")
      : active ? "正在发言" : next ? "下一位" : "等待轮转"),
    textElement("strong", "", playerName),
    textElement(
      "small",
      "",
      `${character.label} · ${nodeKindLabel(nodeKind)}`,
    ),
  );
  if (runtime.world?.routeRef === CIRCUIT_WORLD_ROUTE_REF) {
    card.dataset.completedLaps = String(playerState.completedLaps || 0);
    copy.append(textElement("small", "player-lap-progress", `已完成 ${playerState.completedLaps || 0} 圈`));
  }
  const marker = createCharacterAvatar(character, {
    className: `team-token-preview team-token-preview-${index % PLAYER_PROFILES.length}`,
    variant: "hud",
  });
  marker.title = `${playerName}的个人棋子`;

  const markerShell = document.createElement("span");
  markerShell.className = "team-token-shell";
  markerShell.setAttribute("aria-hidden", "true");
  markerShell.append(marker);

  const identity = document.createElement("div");
  identity.className = "team-identity";
  identity.append(markerShell, copy);

  const assetStrip = createPlayerAssetStrip(ownerId, playerName);

  card.style.setProperty("--team-color", `var(--team-${index % PLAYER_PROFILES.length})`);
  card.style.setProperty("--character-accent", character.accent);
  card.append(identity, assetStrip);
  if (compact) {
    const detail = createPlayerRewardDetail(ownerId, playerName, seat, assets);
    card.setAttribute("aria-describedby", detail.id);
    card.append(detail);
  }
  return card;
}

function renderHud(sessionValue = gameSession) {
  const focusedPlayerId = document.activeElement
    ?.closest?.(".team-hud[data-player-id]")
    ?.dataset.playerId || null;
  const runtimeShell = document.querySelector(".runtime-shell");
  runtimeShell.dataset.playerCount = String(runtime.teams.length);
  runtimeShell.dataset.playerHud = runtime.teams.length >= 5 ? "compact" : "full";
  const splitIndex = Math.ceil(runtime.teams.length / 2);
  const nextPlayerIndex = (runtime.activeTeamIndex + 1) % runtime.teams.length;
  const leftCards = runtime.teams.slice(0, splitIndex).map((playerState, index) => (
    createPlayerHud(
      playerState,
      index,
      runtime.activeTeamIndex === index,
      nextPlayerIndex === index,
      false,
      sessionValue,
    )
  ));
  const rightCards = runtime.teams.slice(splitIndex).map((playerState, localIndex) => {
    const index = splitIndex + localIndex;
    return createPlayerHud(
      playerState,
      index,
      runtime.activeTeamIndex === index,
      nextPlayerIndex === index,
      true,
      sessionValue,
    );
  });
  nodes.leftTeams.replaceChildren(...leftCards);
  nodes.rightTeams.replaceChildren(...rightCards);
  nodes.leftTeams.hidden = leftCards.length === 0;
  nodes.rightTeams.hidden = rightCards.length === 0;
  if (focusedPlayerId) {
    [...document.querySelectorAll(".team-hud[data-player-id]")]
      .find((card) => card.dataset.playerId === focusedPlayerId)
      ?.focus({ preventScroll: true });
  }
  const activeTeam = runtime.teams[runtime.activeTeamIndex];
  if (activeTeam?.id && activeTeam.id !== lastAnnouncedActiveTeamId) {
    lastAnnouncedActiveTeamId = activeTeam.id;
    if (sessionValue) {
      boardSounds.play("pawn-ready", {
        pitch: (runtime.activeTeamIndex % 4) - 1,
        intensity: 0.72,
      });
    }
  }
  const sessionSeat = currentSessionSeat(sessionValue);
  if (sessionValue) {
    const phase = levelOnePhase(sessionValue.completedTurns, sessionValue.minTotalTurns);
    const worldOrdinal = runtime.world?.active?.ordinal || 1;
    const worldTitle = activeWorldComposition.worldPack?.title
      || activeLevelPack.title
      || "远征世界";
    const chapterLabel = isCloudHarborWorldRef(activeWorldComposition.worldRef)
      ? phase.label
      : "云外探索章";
    nodes.round.textContent = (
      `${chapterLabel} · ${sessionValue.completedTurns}/${sessionValue.minTotalTurns}`
    );
    nodes.sessionGoal.textContent = (
      `世界 ${worldOrdinal} · ${worldTitle} · 本章 `
      + `${sessionValue.completedTurns}/${sessionValue.minTotalTurns}`
    );
    const completed = sessionSeat?.opportunityCount || 0;
    nodes.proof.textContent = sessionSeat
      ? `${sessionSeat.displayName} · 朗读 ${Math.min(completed + 1, sessionValue.minOpportunitiesPerSeat)}/${sessionValue.minOpportunitiesPerSeat}`
        + ` · ${isCloudHarborWorldRef(activeWorldComposition.worldRef)
          ? "探索航道，向下一片世界前进"
          : "继续追踪前方尚未揭开的秘境线索"}`
      : `${worldTitle} × ${learningPack.title}`;
  } else {
    nodes.round.textContent = "等待开局";
    nodes.sessionGoal.textContent = "世界 1 · 本章进度 0 / 12";
    nodes.proof.textContent = "掷骰探索云港，只领取最终停格家园积分";
  }

  if (isTeacherSession(sessionValue)) {
    nodes.round.textContent = `老师主持 · 已掷骰 ${sessionValue.completedTurns} 次`;
    nodes.sessionGoal.textContent = `世界 ${runtime.world?.active?.ordinal || 1} · 本局持续累计`;
    nodes.proof.textContent = sessionValue.teacherOpportunity
      ? `${sessionSeat.displayName} 获得一次掷骰机会` : "等待老师奖励 · 可自由选择任一学生";
  }
  if (runtime.world?.routeRef === CIRCUIT_WORLD_ROUTE_REF && sessionValue) {
    const lapRound = runtime.circuitLapRound
      || Math.min(...runtime.teams.map((team) => team.completedLaps || 0)) + 1;
    const finished = runtime.teams.filter((team) => (team.completedLaps || 0) >= lapRound).length;
    nodes.sessionGoal.textContent = `云港循环 · 第 ${lapRound} 圈 · 已完成 ${finished}/${runtime.teams.length} 人`;
    nodes.sessionGoal.dataset.lapRound = String(lapRound);
    nodes.sessionGoal.dataset.lapFinished = String(finished);
    if (!sessionValue.teacherOpportunity) nodes.proof.textContent = "各自继续绕圈 · 全员完成一圈后刷新 Bonus";
  }
  nodes.speakerName.textContent = sessionSeat?.displayName
    || activeTeam.members[activeTeam.speakerIndex % activeTeam.members.length];
  const character = activeCharacterProfile();
  renderHtmlCharacterAvatar(nodes.speakerAvatar, character, {
    variant: "hud",
  });
  nodes.speakerAvatar.title = character.label;
  nodes.speakerTeam.textContent = `${character.label} · 个人回合`;
}

function answerRevealDecisionForTask(task) {
  if (
    speechStatus !== "accepted"
    || !pendingSpeechDecision
    || pendingSpeechDecision.taskId !== task.id
  ) {
    return null;
  }
  return pendingSpeechDecision;
}

function renderMissionScore(decision) {
  if (!nodes.missionScore) return;
  const scoreVisible = (
    typeof decision?.score === "number"
    && Number.isFinite(decision.score)
  );
  const score = scoreVisible ? decision.score : null;
  nodes.missionScore.hidden = !scoreVisible;
  nodes.missionScore.dataset.scoreTone = scoreVisible && score >= 80
    ? "celebrate"
    : "steady";
  const value = nodes.missionScore.querySelector("strong");
  if (value) value.textContent = scoreVisible ? String(Math.round(score)) : "—";
}

function renderSentenceFrame(scaffold, modelContent, { reveal = false } = {}) {
  const presentation = sentenceFramePresentation(scaffold, modelContent);
  nodes.frame.replaceChildren();
  nodes.frame.dataset.answerState = reveal ? "revealed" : "blank";
  if (!reveal) {
    nodes.frame.textContent = scaffold;
    return presentation;
  }
  if (!presentation.matched) {
    nodes.frame.textContent = scaffold;
    return presentation;
  }
  let answerSlotIndex = 0;
  presentation.parts.forEach((part) => {
    if (!part.answer) {
      nodes.frame.append(document.createTextNode(part.text));
      return;
    }
    const answer = textElement("mark", "mission-answer-fill", part.text);
    answer.dataset.answerSlot = String(answerSlotIndex);
    answerSlotIndex += 1;
    nodes.frame.append(answer);
  });
  return presentation;
}

function renderVoiceSentenceCard(task) {
  const cueText = task.content?.cueText || "";
  const scaffold = task.content?.responseScaffold || "请用完整内容回答";
  const modelContent = task.feedback?.modelContent || "";
  const revealDecision = answerRevealDecisionForTask(task);
  nodes.prompt.textContent = task.content?.promptText || "请听老师的任务";
  nodes.cue.textContent = cueText;
  nodes.cue.hidden = !cueText;
  const presentation = renderSentenceFrame(scaffold, modelContent, {
    reveal: Boolean(revealDecision),
  });
  renderMissionScore(revealDecision);
  if (!modelContent) {
    nodes.model.textContent = "";
    nodes.model.hidden = true;
  } else if (!revealDecision) {
    nodes.model.textContent = presentation.hasBlank
      ? "答完后，正确答案会自动填回横线。"
      : "答完后，这里会显示正确示范。";
    nodes.model.hidden = false;
  } else if (presentation.matched) {
    nodes.model.textContent = "正确答案已填入横线。";
    nodes.model.hidden = false;
  } else {
    nodes.model.textContent = `正确答案：${modelContent}`;
    nodes.model.hidden = false;
  }
}

function renderTeacherPanel() {
  const teacherMode = isTeacherSession(gameSession);
  document.body.dataset.classroomMode = teacherMode ? TEACHER_MODE : "voice";
  nodes.teacherPanel.hidden = !teacherMode || gameSession.screen !== "PLAYING" || busy;
  if (!teacherMode) return;
  const opportunity = gameSession.teacherOpportunity;
  const ready = gameSession.phase === "TEACHER_ROLL_READY" && Boolean(opportunity);
  const pointsReady = !usesLandingPoints() || (gameSession.landingPoints.rule &&
    gameSession.landingPoints.ownerId === authenticatedUserId);
  const waiting = gameSession.phase === "TEACHER_WAITING" && !busy && Boolean(pointsReady);
  const selectedId = opportunity?.seatId || teacherSelectedSeatId;
  const selected = gameSession.seats.find((seat) => seat.id === selectedId);
  const focused = document.activeElement?.dataset?.teacherSeatId;
  nodes.teacherPlayers.replaceChildren(...gameSession.seats.map((seat) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.teacherSeatId = seat.id;
    button.setAttribute("aria-pressed", String(seat.id === selectedId));
    button.disabled = !waiting || seat.status !== "active";
    button.append(textElement("span", "", seat.displayName));
    button.title = seat.displayName;
    button.addEventListener("click", () => {
      teacherSelectedSeatId = seat.id;
      persistStableSession();
      renderTeacherPanel();
    });
    return button;
  }));
  if (focused) [...nodes.teacherPlayers.children].find((button) => button.dataset.teacherSeatId === focused)?.focus();
  // One tap: #teacher-grant saves the one-time chance AND starts the server roll
  // (giveTeacherOpportunity → runTeacherTurn). #teacher-roll only reappears to
  // resume a saved chance (reload / network retry), never as a second step.
  const specialCellsGate = specialCellsBlockingDice();
  nodes.teacherGrant.hidden = ready;
  nodes.teacherGrant.disabled = !waiting || !selected || Boolean(specialCellsGate)
    || !(voiceBoardAsrAuthenticated || qaHarnessEnabled);
  const selectedDouble = Boolean(currentSpecialCells()?.heldDoubleDiceByStudent?.[selected?.id])
    || doubleDiceSteps(opportunity) !== null;
  nodes.teacherGrant.textContent = selected
    ? selectedDouble ? "🎲🎲 掷双骰" : "🎲 掷骰子"
    : "先选一位学生";
  nodes.teacherGrant.setAttribute("aria-label", selected
    ? `奖励 ${selected.displayName} 一次机会并立即${selectedDouble ? "掷双骰" : "掷骰子"}` : "先选一位学生");
  nodes.teacherRoll.hidden = !ready;
  nodes.teacherRoll.disabled = !ready || busy || !pointsReady || Boolean(specialCellsGate);
  nodes.teacherRoll.textContent = selectedDouble ? "🎲🎲 继续双骰" : "🎲 继续掷骰";
  nodes.teacherRoll.setAttribute("aria-label", `继续 ${selected?.displayName || "学生"} 已保存的${selectedDouble ? "双骰" : "掷骰"}机会`);
  const pointsError = usesLandingPoints() ? landingPoints.get(landingGameId())?.error?.message : "";
  nodes.teacherStatus.textContent = !pointsReady
    ? landingPointsMessage || "正在登记积分棋局，联网后可重试登记。"
    : specialCellsGate || pointsError || "";
  const pendingRewards = usesLandingPoints() && pendingGroupLandingAwards(landingPoints.get(landingGameId())?.session).length;
  if (pendingRewards) {
    const retry = textElement("button", "teacher-status-retry", "重试到账");
    retry.type = "button";
    retry.disabled = busy || specialCellsFollowUpActive;
    retry.addEventListener("click", async () => {
      retry.disabled = true;
      try { await recoverLandingPoints(); await runSpecialCellFollowUp(null); await ensureSpecialCellsOpening(); }
      catch (error) { showLandingError(error); }
      finally { renderTeacherPanel(); }
    });
    nodes.teacherStatus.append(retry);
  }
  nodes.teacherStatus.hidden = !nodes.teacherStatus.textContent;
  scheduleSpecialCellsOpening();
}

// ---- 特效格 (special cells) ------------------------------------------------
// Layout, amounts and consumption all come from the server snapshot
// (session.specialCells). Nothing here invents a layout when the draw fails.
const SPECIAL_CELLS_INTRO_SEEN_KEY = "universal-board.special-cells-intro-seen.v1";
let specialCellsHiddenIds = new Set();
let specialCellsOverviewProgress = 0;
let specialCellsIntro = null;
let specialCellsFollowUpActive = false;
let specialCellsOpeningTask = null;
const specialCellsIntroSeenMemory = new Set();
const specialCellsUi = { density: "normal", multipliersEnabled: true, collapsed: true, busy: false, status: "", hiddenDuringIntro: false };
const scSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Coin-gain FX: fires only for server-confirmed credits (see confirmedCoinGains).
const coinFx = createCoinGainFx({
  doc: document,
  win: window,
  sounds: boardSounds,
  reduced: () => reducedMotionRequested(),
  chipFor: (studentId) => document.querySelector(`.team-hud[data-player-id="${CSS.escape(String(studentId))}"]`),
  valueFor: (studentId) => normalizedVisibleAssets(studentId).earned,
});

function holdCoinFxDisplays() {
  for (const seat of gameSession?.seats || []) {
    const assets = normalizedVisibleAssets(seat.id);
    if (assets.registered) coinFx.hold(seat.id, assets.earned);
  }
}

function landingCellPoint(nodeId) {
  const element = nodeId ? nodes.board.querySelector(`.board-space[data-node-id="${CSS.escape(nodeId)}"]`) : null;
  return coinFx.point(element);
}

function playLandingCoinGain(gain, point) {
  if (!gain) return;
  if (gain.pending) {
    coinFx.pendingLabel(point || { x: window.innerWidth / 2, y: window.innerHeight / 2 }, `+${gain.amount} 积分待确认`);
    return;
  }
  void coinFx.playGain({ studentId: gain.studentId, amount: gain.amount, from: point, big: gain.big });
  if (gain.bonusPending > 0 && point) {
    window.setTimeout(() => coinFx.pendingLabel({ x: point.x, y: point.y + 70 }, `加成 +${gain.bonusPending} 待平台入账`), 500);
  }
}

function playRedPacketCoinGain(redPacket) {
  if (!redPacket) return;
  if (redPacket.studentIds.length) void coinFx.playRedPacket({ studentIds: redPacket.studentIds, each: redPacket.each });
  if (redPacket.pendingCount > 0) {
    coinFx.pendingLabel({ x: window.innerWidth / 2, y: window.innerHeight * 0.62 }, `全班小红包 +${redPacket.each} 待平台入账`);
  }
  coinFx.unholdIdle();
}

const groupCoinLedger = createGroupCoinFxLedger({ storage: () => window.localStorage });
const groupCoinReservations = new Map();
let groupCoinCameraTask = Promise.resolve();

function groupCoinScope(id) { return `${authenticatedUserId}:${id}`; }

function groupCoinCurrent(id, scope) {
  return groupCoinScope(id) === scope && landingGameId() === id && usesLandingPoints()
    && gameSession?.screen === "PLAYING" && !gameSession.assetGameEnded;
}

function trackGroupCoinGain(id, move) {
  const scope = groupCoinScope(id);
  const snapshot = landingPoints.get(id)?.session?.specialCells;
  const known = confirmedGroupCoinGains({ move, snapshot, studentIds: gameSession?.seats?.map((seat) => seat.id) });
  groupCoinLedger.track(scope, move.instanceId, [
    ...known.gains.flatMap((gain) => gain.receiptIds),
    ...move.awards.filter((award) => award.landingEffectsApplied).map((award) => `effect:${award.attemptId}`),
  ]);
}


function prepareTrackedGroupCoinHolds(id) {
  const scope = groupCoinScope(id);
  if (!groupCoinCurrent(id, scope)) return;
  const pending = groupCoinLedger.pending(scope);
  if (!pending.length) return;
  const server = landingPoints.get(id)?.session;
  const totals = new Map();
  for (const instanceId of pending) {
    const move = server?.specialCells?.groupMoves?.[instanceId];
    const { gains } = confirmedGroupCoinGains({ move, snapshot: server?.specialCells,
      studentIds: gameSession.seats.map((seat) => seat.id), seenReceiptIds: groupCoinLedger.seen(scope) });
    gains.forEach((gain) => totals.set(gain.studentId, (totals.get(gain.studentId) || 0) + gain.amount));
  }
  totals.forEach((amount, studentId) => {
    const real = normalizedVisibleAssets(studentId).earned;
    if (Number.isFinite(real)) coinFx.hold(studentId, Math.max(0, real - amount));
  });
  if (totals.size) renderHud();
}

function startGroupCoinGains(id, move, snapshot, gate) {
  const scope = groupCoinScope(id);
  const reservations = groupCoinReservations.get(scope) || new Set();
  groupCoinReservations.set(scope, reservations);
  const { gains } = confirmedGroupCoinGains({ move, snapshot, studentIds: gameSession?.seats?.map((seat) => seat.id),
    seenReceiptIds: [...groupCoinLedger.seen(scope), ...reservations] });
  const totals = new Map();
  gains.forEach((gain) => totals.set(gain.studentId, (totals.get(gain.studentId) || 0) + gain.amount));
  totals.forEach((amount, studentId) => {
    const real = normalizedVisibleAssets(studentId).earned;
    if (Number.isFinite(real)) coinFx.hold(studentId, Math.max(0, real - amount));
  });
  const flights = gains.map((gain) => {
    gain.receiptIds.forEach((receiptId) => reservations.add(receiptId));
    return coinFx.playGain({ ...gain, gainId: `${scope}:${gain.gainId}`, big: gains.length === 1 && gain.big,
      from: () => {
        const task = groupCoinCameraTask.catch(() => {}).then(async () => {
          await gate;
          if (!groupCoinCurrent(id, scope) || runtime.world?.active?.instanceId !== gain.worldInstanceId) return null;
          await ensureNodeVisible(gain.nodeId, { animate: !reducedMotionRequested() });
          if (!groupCoinCurrent(id, scope)) return null;
          const point = landingCellPoint(gain.nodeId);
          if (point) groupCoinLedger.mark(scope, gain.receiptIds);
          return point;
        });
        groupCoinCameraTask = task.then(() => undefined, () => undefined);
        return task;
      },
    }).finally(() => gain.receiptIds.forEach((receiptId) => reservations.delete(receiptId)));
  });
  renderHud();
  return Promise.all(flights);
}

async function presentTrackedGroupRewards(id) {
  const scope = groupCoinScope(id);
  if (!groupCoinCurrent(id, scope)) { coinFx.unholdIdle(); return; }
  for (const instanceId of groupCoinLedger.pending(scope)) {
    const server = landingPoints.get(id)?.session;
    const move = server?.specialCells?.groupMoves?.[instanceId];
    if (!move || !(gameSession.completedGroupMoveIds || []).includes(instanceId)) continue;
    let openGate;
    const gate = new Promise((resolve) => { openGate = resolve; });
    // Reserve every pupil's counter before awaiting banners/camera movement.
    const flights = startGroupCoinGains(id, move, server.specialCells, gate);
    try {
      if (move.landingEffectsPolicy === GROUP_LANDING_EFFECTS_POLICY) {
        for (const award of move.awards) {
          const effectId = `effect:${award.attemptId}`;
          if (!award.landingEffectsApplied || groupCoinLedger.seen(scope).includes(effectId)) continue;
          if (!groupCoinCurrent(id, scope)) break;
          if (award.specialCell && award.specialCell.category !== "move") {
            try { await presentSpecialCellLanding(award.attemptId, { compact: true }); }
            catch (error) { console.warn("group reward presentation fell back to its confirmed receipt", error); }
          }
          groupCoinLedger.mark(scope, [effectId]);
        }
      }
    } finally { openGate(); }
    await flights;
    coinFx.unholdIdle();
    const remaining = confirmedGroupCoinGains({ move, snapshot: server.specialCells,
      studentIds: gameSession.seats.map((seat) => seat.id), seenReceiptIds: groupCoinLedger.seen(scope) });
    if (!move.awards.some((award) => award.status !== "awarded")
      && !groupLandingEffectsPending(move, server.specialCells) && !remaining.gains.length && !remaining.pending.length) {
      groupCoinLedger.complete(scope, instanceId);
    }
  }
  coinFx.unholdIdle();
}

async function claimGroupLandingRewards(id, move) {
  trackGroupCoinGain(id, move);
  holdCoinFxDisplays();
  try { await landingPoints.claimGroupMove(id, move.instanceId); }
  finally { await presentTrackedGroupRewards(id); }
}

function currentSpecialCells() {
  if (!usesLandingPoints()) return null;
  // Perf: renderBoard asks once per board node and every get() deep-clones the
  // whole outbox. Read once per task; any points change or the next task re-reads.
  const id = landingGameId();
  if (specialCellsRead?.id === id) return specialCellsRead.value;
  const session = landingPoints.get(id)?.session;
  const value = session?.rewardPolicy === SPECIAL_CELLS_POLICY ? session.specialCells || null : null;
  specialCellsRead = { id, value };
  queueMicrotask(() => { specialCellsRead = null; });
  return value;
}

function specialCellForBoardNode(nodeId) {
  const snapshot = currentSpecialCells();
  if (!snapshot?.cells?.length || layoutEditor.active) return null;
  const cell = specialCellAt(snapshot, activeWorldComposition.worldRef, nodeId);
  return cell && !(snapshot.consumed || []).includes(cell.cellId) ? cell : null;
}

function specialCellsBlockingDice() {
  const snapshot = currentSpecialCells();
  if (!snapshot) return "";
  if (specialCellsIntro?.playing) return "宝藏正在掉落…（可点「跳过」）";
  if (specialCellsFollowUpActive) return "请先完成老师的小挑战";
  if (Object.values(snapshot.groupMoves || {}).some((move) => move.status === "pending")) return "请先完成老师的小挑战";
  if (pendingGroupLandingAwards({ specialCells: snapshot }).length) return "全班新落格积分待到账，请查询重试";
  if (snapshot.locked && snapshot.drawHistory?.length
    && !specialCellsIntroSeen(landingGameId(), snapshot.drawNumber)) return "新一圈宝藏准备中…";
  if (snapshot.locked) return "";
  if (specialCellsUi.busy) return "宝藏准备中…";
  if (!snapshot.drawNumber) return specialCellsUi.status || "宝藏准备中…";
  return "";
}

function scheduleSpecialCellsOpening() {
  const id = landingGameId(), ownerId = authenticatedUserId;
  const current = () => landingGameId() === id && authenticatedUserId === ownerId
    && usesLandingPoints() && gameSession?.landingPoints?.ownerId === ownerId
    && isTeacherSession(gameSession) && gameSession.screen === "PLAYING" && !gameSession.assetGameEnded;
  const ready = () => {
    if (!current() || busy || specialCellsFollowUpActive || specialCellsUi.busy || specialCellsIntro?.playing) return null;
    const snapshot = currentSpecialCells();
    return snapshot?.locked && snapshot.drawHistory?.length
      && !specialCellsIntroSeen(id, snapshot.drawNumber)
      && !Object.values(snapshot.groupMoves || {}).some((move) => move.status === "pending")
      && !pendingGroupLandingAwards({ specialCells: snapshot }).length ? snapshot : null;
  };
  if (!ready()) return;
  if (specialCellsOpeningTask?.id === id && specialCellsOpeningTask.ownerId === ownerId) return;
  const task = { id, ownerId, drawNumber: null };
  specialCellsOpeningTask = task;
  queueMicrotask(() => {
    if (specialCellsOpeningTask !== task) return;
    const snapshot = ready(); // Draw may have advanced again while this task was queued.
    if (!snapshot) { specialCellsOpeningTask = null; return; }
    task.drawNumber = snapshot.drawNumber;
    void ensureSpecialCellsOpening().catch((error) => {
      if (current()) showLandingError(error);
    }).finally(() => {
      if (specialCellsOpeningTask !== task) return;
      specialCellsOpeningTask = null;
      // A later accepted generation must not be swallowed by this older task.
      if (current() && currentSpecialCells()?.drawNumber !== task.drawNumber) scheduleSpecialCellsOpening();
    });
  });
}

function specialCellsIntroSeen(id, drawNumber) {
  const key = `${id}:${drawNumber}`;
  if (specialCellsIntroSeenMemory.has(key)) return true;
  try { return Boolean(JSON.parse(localStorage.getItem(SPECIAL_CELLS_INTRO_SEEN_KEY) || "{}")[key]); }
  catch { return false; }
}

function markSpecialCellsIntroSeen(id, drawNumber) {
  // This is presentation memory only. Rule/position/roll persistence remains required.
  specialCellsIntroSeenMemory.add(`${id}:${drawNumber}`);
  try {
    const seen = JSON.parse(localStorage.getItem(SPECIAL_CELLS_INTRO_SEEN_KEY) || "{}");
    seen[`${id}:${drawNumber}`] = Date.now();
    const recent = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 40);
    localStorage.setItem(SPECIAL_CELLS_INTRO_SEEN_KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch { /* the intro simply replays once more */ }
}

function renderSpecialCellsHud() {
  const host = document.getElementById("special-cells-legend");
  if (!host) return;
  const snapshot = currentSpecialCells();
  if (!snapshot || !gameSession || gameSession.screen !== "PLAYING") { host.hidden = true; return; }
  if (!specialCellsUi.busy && !specialCellsIntro?.playing) {
    specialCellsUi.density = snapshot.density || specialCellsUi.density;
    specialCellsUi.multipliersEnabled = snapshot.multipliersEnabled !== false;
  }
  renderSpecialCellsLegend(host, {
    snapshot, locked: Boolean(snapshot.locked), busy: specialCellsUi.busy || Boolean(specialCellsIntro?.playing) || busy,
    status: specialCellsUi.status, density: specialCellsUi.density, multipliersEnabled: specialCellsUi.multipliersEnabled,
    collapsed: specialCellsUi.collapsed, hiddenDuringIntro: specialCellsUi.hiddenDuringIntro,
  }, {
    onToggleCollapsed: () => { specialCellsUi.collapsed = !specialCellsUi.collapsed; renderSpecialCellsHud(); },
    onDensity: (density) => { specialCellsUi.density = density; void ensureSpecialCellsOpening({ redraw: true }); },
    onMultipliers: (enabled) => { specialCellsUi.multipliersEnabled = enabled; void ensureSpecialCellsOpening({ redraw: true }); },
    onRedraw: () => { void ensureSpecialCellsOpening({ redraw: true }); },
    onReplay: () => { void playSpecialCellsIntro("full", []); },
  });
  const redraw = host.querySelector(".sc-btn:not(.secondary)");
  if (redraw && !snapshot.drawNumber && !specialCellsUi.busy) redraw.textContent = "再试一次";
}

/** Zoom between the live camera rect (0) and the whole world (1) by moving the SVG viewBox. */
function setSpecialCellsOverview(progress) {
  specialCellsOverviewProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  if (!boardWorld || !nodes.board) return;
  if (specialCellsOverviewProgress === 0) {
    nodes.board.setAttribute("viewBox", cameraBoardTemplate().viewBox.join(" "));
    applyCameraTransform();
    return;
  }
  const world = boardWorldSize();
  const [, , width, height] = cameraBoardTemplate().viewBox;
  const t = specialCellsOverviewProgress;
  boardWorld.setAttribute("transform", "translate(0 0)");
  nodes.board.setAttribute("viewBox", [camera.x * (1 - t), camera.y * (1 - t),
    width + ((world.width - width) * t), height + ((world.height - height) * t)].join(" "));
}

function specialCellClientPoint(cell) {
  if (cell.worldRef !== activeWorldComposition.worldRef || !boardWorld) return null;
  const marker = nodes.board.querySelector(`[data-special-cell-id="${CSS.escape(cell.cellId)}"] .sc-marker-plate`);
  if (!marker) return null;
  const rect = marker.getBoundingClientRect();
  if (!rect.width) return null;
  return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
}

async function ensureSpecialCellsOpening({ redraw = false } = {}) {
  const id = landingGameId();
  let snapshot = currentSpecialCells();
  if (!snapshot || specialCellsIntro?.playing || specialCellsUi.busy) { renderSpecialCellsHud(); return; }
  if (snapshot.locked) {
    renderSpecialCellsHud();
    if (!redraw) await resumePendingSpecialCellMove();
    snapshot = currentSpecialCells();
    if (!busy && !specialCellsFollowUpActive && snapshot?.drawHistory?.length
      && !specialCellsIntroSeen(id, snapshot.drawNumber)) {
      try { await playSpecialCellsIntro("short"); }
      catch (error) {
        // The server already froze the new layout; a presentation failure must
        // still leave those markers readable and permit the next legal turn.
        markSpecialCellsIntroSeen(id, snapshot.drawNumber);
        specialCellsHiddenIds = new Set();
        specialCellsUi.hiddenDuringIntro = false;
        render();
        console.warn("circuit bonus refresh presentation skipped", error);
      }
    }
    return;
  }
  if (!redraw && snapshot.drawNumber && specialCellsIntroSeen(id, snapshot.drawNumber)) {
    renderBoard(); renderSpecialCellsHud(); renderTeacherPanel();
    return;
  }
  let oldPoints = [];
  if (redraw || !snapshot.drawNumber) {
    oldPoints = redraw ? liveSpecialCells(snapshot).map(specialCellClientPoint).filter(Boolean) : [];
    specialCellsUi.busy = true; specialCellsUi.status = "宝藏准备中…";
    renderSpecialCellsHud(); renderTeacherPanel();
    try {
      await landingPoints.drawSpecialCells(id, {
        density: specialCellsUi.density, multipliersEnabled: specialCellsUi.multipliersEnabled,
      });
      specialCellsUi.status = "";
    } catch (error) {
      specialCellsUi.status = error?.code === "special_cells_locked"
        ? "已经开始掷骰子，本节课宝藏不能再换。"
        : "宝藏还没准备好，请点「再试一次」。";
      console.warn("special cells draw failed", error);
      return;
    } finally {
      specialCellsUi.busy = false;
      renderSpecialCellsHud(); renderTeacherPanel();
    }
    snapshot = currentSpecialCells();
    if (!snapshot?.drawNumber) return;
  }
  await playSpecialCellsIntro(redraw ? "short" : "full", oldPoints);
}

async function playSpecialCellsIntro(mode, oldPoints = []) {
  const id = landingGameId();
  const snapshot = currentSpecialCells();
  if (!snapshot?.drawNumber || specialCellsIntro?.playing) return;
  const cells = liveSpecialCells(snapshot);
  if (!cells.length) { markSpecialCellsIntroSeen(id, snapshot.drawNumber); render(); return; }
  const effectiveMode = reducedMotionRequested() ? "reduced" : mode;
  specialCellsHiddenIds = new Set(cells.map((cell) => cell.cellId));
  specialCellsUi.hiddenDuringIntro = true;
  const sequencer = new SpecialCellsIntroSequencer({
    cells,
    getPoint: specialCellClientPoint,
    revealCell: (cellId, animate) => { specialCellsHiddenIds.delete(cellId); revealSpecialCellMarker(nodes.board, cellId, animate); },
    legendRect: () => {
      const host = document.getElementById("special-cells-legend");
      if (host?.hidden === false) return host.getBoundingClientRect();
      const board = nodes.board.getBoundingClientRect();
      return { left: board.right - 260, top: board.top + 16, width: 240, height: 120 };
    },
    onZoom: setSpecialCellsOverview,
    onShake: (dx, dy) => { nodes.board.style.translate = dx || dy ? `${dx}px ${dy}px` : ""; },
    soundEnabled: () => boardSounds.isEnabled(),
    onPhase: (phase) => { document.body.dataset.specialCellsPhase = phase; },
    onLegend: () => { specialCellsUi.hiddenDuringIntro = false; renderSpecialCellsHud(); },
  });
  specialCellsIntro = { sequencer, playing: true };
  renderBoard(); renderSpecialCellsHud(); renderTeacherPanel();
  let result = { skipped: true, elapsed: 0 };
  try {
    result = await sequencer.play({ mode: effectiveMode, oldPoints });
  } finally {
    specialCellsIntro = { sequencer: null, playing: false, last: { ...result, mode: effectiveMode } };
    window.__specialCellsIntroResult = { ...result, mode: effectiveMode, drawNumber: snapshot.drawNumber };
    specialCellsHiddenIds = new Set();
    specialCellsUi.hiddenDuringIntro = false;
    nodes.board.style.translate = "";
    setSpecialCellsOverview(0);
    markSpecialCellsIntroSeen(id, snapshot.drawNumber);
    setTimeout(() => sequencer.destroy(), 700);
    render();
  }
}

async function presentSpecialCellLanding(attemptId, { compact = false } = {}) {
  const turn = landingPoints.getTurn(landingGameId(), attemptId);
  const special = turn?.specialCell;
  if (!special) return;
  renderBoard(); renderSpecialCellsHud();
  const copy = specialCellLandingCopy({ ...special, turnId: attemptId }, currentSpecialCells());
  if (!copy) return;
  if (special.category === "points") {
    landingPointsMessage = `${copy.text} ${copy.sub}`.trim();
  }
  await showSpecialCellBanner({ typeId: special.type, ...copy }, { hold: presentationDuration(compact ? 450 : reducedMotionRequested() ? 1200 : 1800), sleep: scSleep });
  if (special.doubleDiceGranted) await presentDoubleDiceGrant(turn.studentId);
}

async function presentDoubleDiceGrant(studentId) {
  renderHud();
  if (reducedMotionRequested()) return;
  const card = [...document.querySelectorAll(".team-hud")].find((entry) => entry.dataset.playerId === studentId);
  const target = card?.getBoundingClientRect();
  if (!target) return;
  const origin = { x: innerWidth / 2, y: innerHeight / 2 };
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "9999" });
  document.body.append(host);
  try {
    await Promise.all([-1, 1].map(async (side) => {
      const icon = textElement("span", "", "🎲");
      Object.assign(icon.style, { position: "absolute", left: `${origin.x}px`, top: `${origin.y}px`, fontSize: "52px" });
      host.append(icon);
      await animationFinished(icon, [
        { transform: "translate(-50%, -50%) scale(1)" },
        { offset: .3, transform: `translate(calc(-50% + ${side * 60}px), -90px) scale(1.1)` },
        { transform: `translate(${target.x + target.width / 2 - origin.x}px, ${target.y + target.height / 2 - origin.y}px) scale(.25)`, opacity: 0 },
      ], { duration: 850, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
    }));
  } finally { host.remove(); }
}

async function resumePendingSpecialCellMove() {
  const snapshot = currentSpecialCells();
  const pending = Object.entries(snapshot?.groupMoves || {}).find(([, move]) => move.status === "pending"
    || move.awards?.some((award) => award.status !== "awarded") || groupLandingEffectsPending(move, snapshot));
  if (pending) await runSpecialCellFollowUp(pending[1].sourceTurnId, pending[0]);
  else if (groupCoinLedger.pending(groupCoinScope(landingGameId())).length
    || snapshot?.pendingReroll && gameSession.phase === "TEACHER_WAITING") await runSpecialCellFollowUp(null);
}

async function runSpecialCellFollowUp(attemptId, instanceIdOverride = null) {
  if (specialCellsFollowUpActive) return;
  const id = landingGameId();
  const ownerId = authenticatedUserId;
  const current = () => landingGameId() === id && authenticatedUserId === ownerId
    && gameSession?.screen === "PLAYING" && !gameSession.assetGameEnded;
  if (!current()) return;
  specialCellsFollowUpActive = true; render();
  try {
    // One driver drains confirmed rewards, then the next challenge. Recursion
    // would be suppressed by specialCellsFollowUpActive and silently lose a chain.
    for (let pass = 0; pass < 128 && current(); pass += 1) {
      const server = landingPoints.get(id)?.session;
      const unpaid = groupLandingMoves(server).some((move) => move.awards.some((award) => award.status !== "awarded")
        || groupLandingEffectsPending(move, server.specialCells));
      if (unpaid) {
        await recoverLandingPoints(id);
        const latest = landingPoints.get(id)?.session;
        if (pendingGroupLandingAwards(latest).length) {
          throw new Error("新落格奖励仍待到账，请重试原奖励；不会重复移动。");
        }
      }
      await presentTrackedGroupRewards(id);
      if (!current()) return;
      const snapshot = currentSpecialCells();
      const pendingEntry = Object.entries(snapshot?.groupMoves || {}).find(([, move]) => move.status === "pending");
      if (!pendingEntry) break;
      const [instanceId, pending] = pendingEntry;
      const { decision } = await askSpecialCellGroupMove({
        typeId: pending.type,
        onDecision: async (choice) => {
          try { return await landingPoints.resolveGroupMove(id, instanceId, choice); }
          catch (error) {
            try {
              const payload = await landingPoints.refresh(id, { wallets: false });
              const saved = payload.session?.specialCells?.groupMoves?.[instanceId];
              if (choice === "confirm" && ["confirmed", "exhausted"].includes(saved?.status)
                || choice === "cancel" && saved?.status === "cancelled") return payload;
            } catch { /* Preserve the original decision identity. */ }
            throw error;
          }
        },
      });
      if (!current()) return;
      const resolved = currentSpecialCells()?.groupMoves?.[instanceId];
      if (decision === "confirm" && resolved?.status === "confirmed") {
        await showSpecialCellBanner({ typeId: resolved.type, text: `全班前进 ${resolved.steps}！` },
          { hold: presentationDuration(900), sleep: scSleep });
        await animateSpecialCellGroupMove(resolved);
        if (resolved.rewardPolicy === "group-final-landing-v1") {
          await claimGroupLandingRewards(id, resolved);
          const latest = currentSpecialCells()?.groupMoves?.[instanceId];
          landingPointsMessage = groupLandingEffectsPending(latest, currentSpecialCells())
            || latest.awards.some((award) => award.status !== "awarded")
            ? "全班新落格奖励待到账 · 请重试原奖励，不会重复移动"
            : "全班新落格奖励已分别到账";
          renderPlatformPoints();
        }
      } else if (resolved?.status === "exhausted") {
        await showSpecialCellBanner({ typeId: resolved.type, text: "今天走够啦" }, { hold: 900, sleep: scSleep });
      }
    }
    if (!current()) return;
    const pendingAgain = Object.values(currentSpecialCells()?.groupMoves || {}).some((move) => move.status === "pending");
    if (pendingAgain) throw new Error("连锁奖励仍在处理中，请继续原棋局。");
    const reroll = currentSpecialCells()?.pendingReroll;
    const source = attemptId ? landingPoints.getTurn(id, attemptId) : null;
    if (reroll?.studentId) grantSpecialCellReroll(reroll.studentId);
    else if (source?.specialCell?.rerollGranted && !instanceIdOverride) grantSpecialCellReroll(source.studentId);
  } catch (error) {
    if (current()) showLandingError(error);
  } finally {
    coinFx.unholdIdle();
    specialCellsFollowUpActive = false;
    render();
  }
}

async function finishLandingTurnFollowUps(attemptId, id) {
  const ownerId = authenticatedUserId;
  const current = () => landingGameId() === id && authenticatedUserId === ownerId
    && usesLandingPoints() && gameSession?.landingPoints?.ownerId === ownerId
    && gameSession.screen === "PLAYING" && !gameSession.assetGameEnded;
  if (!current()) return;
  try {
    if (!landingPoints.getTurn(id, attemptId)?.receipt) await recoverLandingPoints(id);
    if (!current()) return;
    await runSpecialCellFollowUp(attemptId);
    if (!current()) return;
    syncCircuitLapProgress();
    render();
    await ensureSpecialCellsOpening();
  } catch (error) {
    if (current()) showLandingError(error);
  }
}

async function animateSpecialCellGroupMove(move) {
  const moves = Array.isArray(move?.moves) ? move.moves : [];
  const longest = Math.max(0, ...moves.map((entry) => (entry.path || []).length));
  const stepMs = presentationDuration(reducedMotionRequested() ? 0 : 320);
  const place = (index) => {
    runtime = { ...runtime, teams: runtime.teams.map((team) => {
      const entry = moves.find((candidate) => `player-${candidate.studentId}` === team.id);
      if (!entry) return team;
      const nodeId = index === null ? entry.toNodeId : (entry.path?.[Math.min(index, entry.path.length - 1)] || entry.fromNodeId);
      return nodeId ? { ...team, nodeId } : team;
    }) };
  };
  for (let index = 0; stepMs && index < longest; index += 1) {
    place(index); renderBoard();
    boardSounds.play("pawn-hop", { intensity: 0.6 });
    await scSleep(stepMs);
  }
  place(null);
  syncCircuitLapProgress();
  saveCompletedGroupMove(move);
  render();
}

function grantSpecialCellReroll(studentId) {
  if (!gameSession || gameSession.phase !== "TEACHER_WAITING") return;
  const seat = gameSession.seats.find((entry) => entry.id === studentId && entry.status === "active");
  if (!seat) return;
  const before = gameSession;
  try {
    teacherSelectedSeatId = seat.id;
    const next = grantTeacherOpportunity(gameSession, { seatId: seat.id, opportunityId: `special-reroll-${crypto.randomUUID()}` });
    const nextRuntime = syncRuntimeToSession(runtime, next);
    persistStableSession(nextRuntime, next, playerAssetsLedger, fairyState, { required: true });
    gameSession = next; runtime = nextRuntime;
    render();
    nodes.teacherStatus.textContent = "";
    nodes.teacherStatus.hidden = true;
  } catch (error) {
    gameSession = before;
    console.warn("special cell reroll was not granted", error);
  }
}

function giveTeacherOpportunity() {
  if (busy || !(voiceBoardAsrAuthenticated || qaHarnessEnabled)) return;
  if (gameSession.phase !== "TEACHER_WAITING" || specialCellsBlockingDice()) return;
  const before = gameSession;
  try {
    const next = grantTeacherOpportunity(gameSession, {
      seatId: teacherSelectedSeatId, opportunityId: `teacher-${crypto.randomUUID()}`,
    });
    const nextRuntime = syncRuntimeToSession(runtime, next);
    persistStableSession(nextRuntime, next, playerAssetsLedger, fairyState, { required: true });
    gameSession = next; runtime = nextRuntime;
  } catch (error) {
    gameSession = before;
    nodes.teacherStatus.hidden = false;
    nodes.teacherStatus.textContent = "这次机会未能保存，请检查浏览器存储后重试。";
    console.warn("teacher opportunity was not granted", error);
    return;
  }
  // Same click: the chance is saved first (one-time semantics), then the server
  // locks the die and the spin starts. A failure leaves 「继续…掷骰」 to retry.
  // Perf (points games): send the server roll before the board redraw so the
  // network round trip overlaps it. Legacy local dice keep redraw-then-roll.
  const serverRoll = usesLandingPoints();
  if (!serverRoll) render();
  void runTeacherTurn();
  if (serverRoll) renderHud();
  nodes.teacherRoll.focus({ preventScroll: true });
}

// A waiting die has no result. It uses the approved cube with neutral faces;
// only its outer viewport moves while the original server request is pending.
function beginTeacherDiceWait({ doubleDice = false } = {}) {
  const faces = teacherDiceFaces(gameSession, currentDicePack()).map(pointsOnlyDiceFace);
  const die = createPhysicalDie(TEACHER_DICE, faces);
  die.cube.querySelectorAll(".physical-die-face").forEach((face) => {
    face.setAttribute("aria-label", "点数待揭晓");
    face.querySelector(".dice-face-number").textContent = "?";
  });
  die.rotor.style.transform = "rotateX(-18deg) rotateY(32deg)";
  nodes.diceBoardResult.hidden = true;
  nodes.diceChoiceStage.hidden = true;
  nodes.diceRollStage.dataset.phase = "waiting";
  nodes.diceRollCard.dataset.phase = "waiting";
  nodes.diceRollName.textContent = "准备掷骰";
  nodes.diceRollStatus.textContent = "摇一摇，准备出发";
  nodes.diceRollResult.textContent = "好运即将揭晓";
  nodes.diceRollResult.classList.remove("is-visible");
  nodes.diceRollFaces.replaceChildren();
  const waitingDice = [die];
  if (doubleDice) {
    const second = createPhysicalDie(TEACHER_DICE, faces);
    second.cube.querySelectorAll(".physical-die-face").forEach((face) => {
      face.setAttribute("aria-label", "点数待揭晓");
      face.querySelector(".dice-face-number").textContent = "?";
    });
    second.rotor.style.transform = die.rotor.style.transform;
    waitingDice.push(second);
  }
  const waitingLayout = doubleDice ? teacherDualLayout(waitingDice) : die.viewport;
  nodes.diceRollCubeSlot.replaceChildren(waitingLayout);
  setDiceOverlayActive(true);
  nodes.diceRollStage.hidden = false;
  const waitingAnimations = reducedMotionRequested() ? [] : waitingDice.map((visual, index) => visual.viewport.animate?.([
    { transform: "translate3d(-5px, 2px, 0) rotate(-5deg)" },
    { transform: "translate3d(5px, -3px, 0) rotate(5deg)" },
    { transform: "translate3d(-5px, 2px, 0) rotate(-5deg)" },
  ], { duration: 460 + index * 40, iterations: Infinity, easing: "ease-in-out" }));
  return () => {
    waitingAnimations.forEach((animation) => animation?.cancel?.());
    waitingLayout.remove();
    nodes.diceRollStage.hidden = true;
    setDiceOverlayActive(false);
  };
}

function needsLandingRecovery(record = landingPoints.get(landingGameId())) {
  if (!record?.session || record.error) return true;
  if (Object.values(record.operations || {}).some((op) => !["done", "rejected"].includes(op.status))) return true;
  if (Object.values(record.session.turns || {}).some((turn) => !["awarded", "abandoned"].includes(turn.status))) return true;
  const cells = record.session.specialCells;
  return Object.values(cells?.bonusAwards || {}).some((award) => award.status !== "awarded")
    || Object.values(cells?.groupMoves || {}).some((move) => move.status === "pending")
    || pendingGroupLandingAwards(record.session).length > 0;
}

async function runTeacherTurn() {
  if (busy || !isTeacherSession(gameSession) || gameSession.phase !== "TEACHER_ROLL_READY"
    || gameSession.inputGate !== "open" || !(voiceBoardAsrAuthenticated || qaHarnessEnabled)) return;
  const opportunity = gameSession.teacherOpportunity;
  if (!opportunity || opportunity.seatId !== currentSessionSeat(gameSession)?.id) return;
  try {
    // New points games lock the fair die on the server before any animation.
    let authoritativeRoll = null;
    if (usesLandingPoints()) {
      busy = true;
      const endDiceWait = beginTeacherDiceWait({ doubleDice: doubleDiceSteps(opportunity) !== null
        || Boolean(currentSpecialCells()?.heldDoubleDiceByStudent?.[opportunity.seatId]) });
      renderTeacherPanel();
      try {
        await ensureLandingRegistration();
        if (needsLandingRecovery()) await recoverLandingPoints();
        const payload = await landingPoints.roll(landingGameId(), { studentId: opportunity.seatId, attemptId: opportunity.id });
        authoritativeRoll = assertLandingRoll({ turn: payload.turn, attemptId: opportunity.id, studentId: opportunity.seatId, runtime });
        if (Number.isInteger(opportunity.faceIndex) && (opportunity.faceIndex !== authoritativeRoll.faceIndex
          || (opportunity.dicePolicy || null) !== (authoritativeRoll.dicePolicy || null)
          || JSON.stringify(opportunity.faceIndices || null) !== JSON.stringify(authoritativeRoll.faceIndices || null))) {
          throw new Error("本机骰面与服务器记录不一致，已暂停本轮。");
        }
      } finally { endDiceWait(); busy = false; }
    }
    // Legacy games keep their original local dice snapshot.
    if (!Number.isInteger(opportunity.faceIndex)) {
      const roll = authoritativeRoll || sampleTeacherDice(gameSession, currentDicePack());
      const next = { ...gameSession, teacherOpportunity: { ...opportunity, faceIndex: roll.faceIndex,
        ...(doubleDiceSteps(roll) !== null ? { dicePolicy: roll.dicePolicy, faceIndices: [...roll.faceIndices] } : {}) } };
      persistStableSession(runtime, next, playerAssetsLedger, fairyState, { required: true });
      gameSession = next;
    }
    void boardSounds.unlock();
    await runBoardTurn({ source: "teacher", attemptId: opportunity.id, resolution: "teacher_opportunity" });
  } catch (error) {
    busy = false;
    renderTeacherPanel();
    nodes.teacherStatus.hidden = false;
    nodes.teacherStatus.textContent = error.message || "本轮尚未完成，机会和已锁定骰面仍保留，请联网后重试。";
    if (usesLandingPoints()) showLandingError(error);
    console.warn("teacher roll could not start", error);
  }
}

function teacherDualLayout(dice) {
  const layout = document.createElement("div");
  layout.className = "teacher-dual-layout";
  Object.assign(layout.style, { display: "flex", justifyContent: "space-evenly", alignItems: "center",
    width: "min(640px, calc(100vw - 24px))", transformStyle: "preserve-3d" });
  for (const die of dice) {
    const position = document.createElement("div");
    Object.assign(position.style, { width: "48%", display: "grid", placeItems: "center", transformStyle: "preserve-3d" });
    position.append(die.viewport); layout.append(position);
  }
  return layout;
}

async function rollTeacherDoubleDice() {
  const opportunity = gameSession.teacherOpportunity;
  const steps = doubleDiceSteps(opportunity);
  if (steps === null) throw new Error("missing saved double dice authority");
  const faces = teacherDiceFaces(gameSession, currentDicePack()).map(pointsOnlyDiceFace);
  const roll = { ...pointsOnlyDiceRoll(teacherDiceRoll(gameSession, currentDicePack(), opportunity.faceIndex)),
    poolLabel: "双骰机会", steps, dicePolicy: DOUBLE_DICE_POLICY, faceIndices: [...opportunity.faceIndices] };
  const dice = roll.faceIndices.map(() => createPhysicalDie(TEACHER_DICE, faces));
  const layout = teacherDualLayout(dice);
  const animations = [];
  const reduced = reducedMotionRequested();
  const choice = { locked: true, timers: [], mood: diceSelectionMood({}), resolve: () => {} };
  cancelPendingDiceChoice();
  pendingDiceChoice = choice;
  try {
    nodes.diceBoardResult.hidden = true;
    nodes.diceChoiceStage.hidden = true;
    nodes.diceRollStage.dataset.phase = "enter";
    nodes.diceRollCard.dataset.phase = "sprint";
    nodes.diceRollCard.dataset.diceCount = "2";
    nodes.diceRollName.textContent = "双骰机会";
    nodes.diceRollStatus.textContent = "两份好运，一起出发！";
    nodes.diceRollResult.textContent = "看看这次能走多远";
    nodes.diceRollResult.classList.remove("is-visible");
    nodes.diceRollFaces.replaceChildren(...createDiceFaceTray(faces).children);
    const reference = nodes.diceRollFaces.closest("details");
    if (reference) reference.open = false;
    nodes.diceRollCubeSlot.replaceChildren(layout);
    setDiceOverlayActive(true); nodes.diceRollStage.hidden = false;
    boardSounds.play("dice-spin", { intensity: .8 });
    await Promise.all(dice.map(async (die, index) => {
      die.rotor.style.transform = DICE_RESULT_VIEW;
      if (!reduced && typeof die.cube.animate === "function") {
        die.cube.classList.add("is-rolling");
        const animation = die.cube.animate(diceThrowKeyframes(DICE_FACE_ROTATIONS[roll.faceIndices[index]]), {
          duration: presentationDuration(DICE_ROLL_DURATION + index * 180), easing: "linear", fill: "forwards",
        });
        animations.push(animation);
        await animation.finished.catch(() => undefined);
        die.cube.style.transform = diceFaceTransform(roll.faceIndices[index]);
        animation.cancel(); die.cube.classList.remove("is-rolling");
      } else die.cube.style.transform = diceFaceTransform(roll.faceIndices[index]);
      die.cube.querySelector(`[data-face-index="${roll.faceIndices[index]}"]`)?.classList.add("is-result");
    }));
    if (pendingDiceChoice !== choice) throw new Error("double dice presentation interrupted");
    nodes.diceRollCard.dataset.phase = "settle";
    nodes.diceRollStatus.textContent = "好运揭晓";
    const values = roll.faceIndices.map(index => index + 1);
    if (!reduced) {
      const target = nodes.diceRollResult.getBoundingClientRect();
      const numberHost = document.createElement("div");
      Object.assign(numberHost.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "9999" });
      numberHost.setAttribute("aria-hidden", "true");
      document.body.append(numberHost);
      try {
      await Promise.all(dice.map(async (die, index) => {
        const source = die.viewport.getBoundingClientRect();
        const number = textElement("span", "dual-sum-fly", String(values[index]));
        Object.assign(number.style, { position: "fixed", left: `${target.x + target.width / 2}px`,
          top: `${target.y + target.height / 2}px`, fontSize: "52px", color: "#fff4c7", pointerEvents: "none" });
        numberHost.append(number);
        try { await animationFinished(number, [
          { transform: `translate(calc(-50% + ${source.x + source.width / 2 - target.x - target.width / 2}px), calc(-50% + ${source.y + source.height / 2 - target.y - target.height / 2}px)) scale(1)` },
          { transform: "translate(-50%, -50%) scale(.4)", opacity: 0 },
        ], { duration: 400, easing: "cubic-bezier(.22,1,.36,1)" }).catch(() => undefined); } finally { number.remove(); }
      }));
      } finally { numberHost.remove(); }
    }
    nodes.diceRollResult.textContent = `${values[0]} + ${values[1]} = ${steps}`;
    nodes.diceRollResult.classList.add("is-visible");
    await sleep(reduced ? 450 : DICE_STAGE_RESULT_DURATION);
    if (pendingDiceChoice !== choice) throw new Error("double dice presentation interrupted");
    lastDicePresentation = { label: roll.poolLabel, poolId: TEACHER_DICE, steps,
      faceIndex: roll.faceIndex, faceIndices: [...roll.faceIndices], dicePolicy: DOUBLE_DICE_POLICY, bonus: roll.bonus };
    nodes.die.textContent = String(steps); nodes.dieKind.textContent = `双骰 ${values.join(" + ")}`;
    nodes.diceBoardResultNumber.textContent = String(steps);
    nodes.diceBoardResultTitle.textContent = `${values.join(" + ")} = ${steps} 格`;
    nodes.diceBoardResultBonus.textContent = "冒险继续！";
    nodes.diceRollStage.hidden = true; setDiceOverlayActive(false);
    nodes.diceBoardResult.hidden = false;
    await sleep(reduced ? 150 : DICE_RESULT_HOLD_DURATION - DICE_STAGE_RESULT_DURATION);
    return roll;
  } finally {
    animations.forEach(animation => animation.cancel());
    pendingDiceChoice = null;
    delete nodes.diceRollCard.dataset.diceCount;
    nodes.diceRollStage.hidden = true; nodes.diceBoardResult.hidden = true;
    nodes.diceRollCubeSlot.replaceChildren(); nodes.diceRollFaces.replaceChildren();
    setDiceOverlayActive(false);
  }
}

async function rollTeacherDie() {
  cancelPendingDiceChoice();
  const faces = teacherDiceFaces(gameSession, currentDicePack()).map(pointsOnlyDiceFace);
  const faceIndex = gameSession.teacherOpportunity?.faceIndex;
  if (!Number.isInteger(faceIndex) || !faces[faceIndex]) throw new Error("missing saved teacher die face");
  const face = faces[faceIndex];
  const roll = pointsOnlyDiceRoll(teacherDiceRoll(gameSession, currentDicePack(), faceIndex));
  const choice = { locked: true, timers: [], mood: diceSelectionMood({}), resolve: () => {} };
  pendingDiceChoice = choice;
  try {
    if (!await presentDiceRoll(roll, faces, choice)) throw new Error("teacher dice presentation interrupted");
    lastDicePresentation = { label: roll.poolLabel, poolId: TEACHER_DICE, faceIndex,
      steps: roll.steps, bonus: roll.bonus, faceLabel: face.label, faceLabels: faces.map((item) => item.label) };
    return roll;
  } finally {
    pendingDiceChoice = null;
    nodes.diceRollStage.hidden = true;
    nodes.diceRollCubeSlot.replaceChildren(); nodes.diceRollFaces.replaceChildren();
    setDiceOverlayActive(false);
  }
}

function renderMission() {
  if (isTeacherSession(gameSession)) {
    nodes.themeSelect.disabled = true; nodes.learningSelect.disabled = true;
    nodes.playerCount.disabled = true; nodes.returnToSetup.disabled = busy || specialCellsFollowUpActive;
    nodes.focusActivePawn.disabled = busy;
    return;
  }
  const task = currentTask(runtime, learningPack);
  if (runtime.currentActivity) {
    const activity = runtime.currentActivity;
    nodes.packName.textContent = `${learningPack.title} · 惊喜事件`;
    nodes.cue.textContent = "!";
    nodes.cue.hidden = false;
    nodes.prompt.textContent = `${activity.content.title} · 按右侧任务卡完成`;
    nodes.frame.textContent = activity.content.target || "完成本次课堂挑战";
    nodes.model.textContent = "完成后，角色会回到刚刚落下的挑战格。";
    nodes.model.hidden = false;
    renderMissionScore(null);
  } else {
    const template = INTERACTION_TEMPLATES[task.interactionTemplateRef];
    const renderInteraction = INTERACTION_RENDERERS[template.renderer];
    if (!renderInteraction) {
      throw new Error(`unsupported interaction renderer: ${template.renderer}`);
    }
    nodes.packName.textContent = learningPack.title;
    renderInteraction(task);
  }
  const canListen = (
    gameSession?.screen === "PLAYING"
    && gameSession.phase === "ANSWER_LISTENING"
    && gameSession.inputGate === "open"
  );
  nodes.voiceState.textContent = busy
    ? "正在整理本轮宝藏…"
    : canListen
      ? "正在听…"
      : gameSession?.phase === "BOSS_READY"
        ? "终章已解锁"
        : "麦克风已关闭";
  nodes.die.textContent = runtime.lastDie || "?";
  nodes.dieKind.textContent = lastDicePresentation?.label
    || (runtime.lastDie ? "上一轮骰子" : "等待表现分");
  const settingsLocked = busy || Boolean(gameSession);
  nodes.themeSelect.disabled = settingsLocked;
  nodes.learningSelect.disabled = settingsLocked;
  nodes.playerCount.disabled = settingsLocked;
  nodes.focusActivePawn.disabled = busy;
  nodes.returnToSetup.disabled = busy || specialCellsFollowUpActive;
  nodes.mapZoneButtons.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
}

function applyTheme() {
  Object.entries(theme.palette).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
  const routeSkin = theme.routeSkin || {};
  root.style.setProperty("--route-base", routeSkin.baseColor || theme.palette.route);
  root.style.setProperty(
    "--route-outline-color",
    routeSkin.outlineColor || theme.palette.ink,
  );
  root.style.setProperty(
    "--route-highlight-color",
    routeSkin.highlightColor || theme.palette.terrain,
  );
  root.style.setProperty(
    "--route-shadow-color",
    routeSkin.shadowColor || theme.palette.ink,
  );
  root.style.setProperty(
    "--route-active-color",
    routeSkin.activeColor || theme.palette.accent,
  );
  root.style.setProperty(
    "--route-bank-color",
    routeSkin.bankColor || routeSkin.baseColor || theme.palette.route,
  );
  const setRouteMetric = (property, value, fallback) => {
    const numericValue = Number(value);
    root.style.setProperty(
      property,
      String(Number.isFinite(numericValue) ? numericValue : fallback),
    );
  };
  setRouteMetric("--route-grounding-width", routeSkin.groundingWidth, 48);
  setRouteMetric("--route-shadow-width", routeSkin.shadowWidth, 40);
  setRouteMetric("--route-bank-width", routeSkin.bankWidth, 36);
  setRouteMetric("--route-outline-width", routeSkin.outlineWidth, 34);
  setRouteMetric("--route-base-width", routeSkin.baseWidth, 29);
  setRouteMetric("--route-grounding-opacity", routeSkin.groundingOpacity, 0.34);
  setRouteMetric("--route-shadow-opacity", routeSkin.shadowOpacity, 0.2);
  setRouteMetric("--route-bank-opacity", routeSkin.bankOpacity, 0.68);
  setRouteMetric("--route-outline-opacity", routeSkin.outlineOpacity, 0.58);
  setRouteMetric("--route-base-opacity", routeSkin.baseOpacity, 0.96);
  setRouteMetric("--route-texture-opacity", routeSkin.textureOpacity, 0.82);
  setRouteMetric("--route-highlight-opacity", routeSkin.highlightOpacity, 0.58);
}

function renderSoundToggle() {
  if (!nodes.soundToggle) return;
  const enabled = boardSounds.isEnabled();
  nodes.soundToggle.setAttribute("aria-pressed", String(enabled));
  nodes.soundToggle.querySelector("span").textContent = enabled ? "🔊" : "🔇";
  nodes.soundToggle.querySelector("b").textContent = enabled ? "声效开" : "声效关";
  nodes.soundToggle.title = enabled ? "关闭棋盘提示音" : "打开棋盘提示音";
}

function zoneLabelForNode(nodeId) {
  const position = nodeById.get(nodeId);
  if (!position) return "挑战格";
  const zone = (activeBoardTemplate.zones || []).find(({ bounds }) => (
    position.x >= bounds.x
    && position.x <= bounds.x + bounds.width
    && position.y >= bounds.y
    && position.y <= bounds.y + bounds.height
  ));
  const zoneName = zone ? (theme.zoneNames?.[zone.id] || zone.label) : "";
  const kind = activeNodeKind(position.id, position.spaceRole);
  return [zoneName, nodeKindLabel(kind)].filter(Boolean).join(" · ");
}

function activityActorPresentation() {
  const actorTeamId = gameSession?.currentActivity?.actorTeamId;
  const actorTeamIndex = Math.max(
    0,
    actorTeamId
      ? runtime.teams.findIndex((team) => team.id === actorTeamId)
      : runtime.activeTeamIndex,
  );
  const actorTeam = runtime.teams[actorTeamIndex] || runtime.teams[0];
  const sessionSeat = gameSession?.phase === "ACTIVITY_ACTIVE"
    ? currentSessionSeat(gameSession)
    : null;
  return {
    actorName: sessionSeat?.displayName || actorTeam?.members?.[0] || actorTeam?.label || "当前玩家",
    profile: characterProfileForSeatIndex(actorTeamIndex),
    landedSpaceLabel: zoneLabelForNode(actorTeam?.nodeId),
  };
}

function renderActivity() {
  const activity = runtime.currentActivity;
  const presentationPending = gameSession?.inputGate === "settlement_pending";
  const wasHidden = nodes.activityStage.hidden;
  nodes.activityStage.hidden = !activity || presentationPending;
  if (wasHidden && activity && !presentationPending) hideTurnFeedback();
  if (!activity) {
    delete nodes.activityStage.dataset.eventId;
    delete nodes.activityStage.dataset.sourceTaskRef;
    nodes.activitySteps.replaceChildren();
    nodes.materialTags.replaceChildren();
    return;
  }
  if (presentationPending) return;
  if (activity.eventId) nodes.activityStage.dataset.eventId = activity.eventId;
  else delete nodes.activityStage.dataset.eventId;
  if (activity.sourceTaskRef) {
    nodes.activityStage.dataset.sourceTaskRef = activity.sourceTaskRef;
  } else {
    delete nodes.activityStage.dataset.sourceTaskRef;
  }
  const actor = activityActorPresentation();
  const presentation = buildActivityPresentation(activity, actor);
  nodes.activityStage.dataset.state = activityResolutionPending ? "complete" : "active";
  nodes.activityKicker.textContent = `CLASS CHALLENGE · ${presentation.kicker}`;
  nodes.activityLandedLabel.textContent = (
    `${presentation.actorName || "当前玩家"}落在${presentation.landedSpaceLabel || "挑战格"}`
  );
  nodes.activityTitle.textContent = presentation.title;
  nodes.activityStory.textContent = presentation.story;
  renderHtmlCharacterAvatar(nodes.activityActorAvatar, actor.profile, {
    variant: "hud",
  });
  nodes.activityActorName.textContent = presentation.actorName || "当前玩家";
  nodes.activityFirstAction.textContent = presentation.firstAction;
  const steps = presentation.steps.map((step) => {
    const item = document.createElement("li");
    item.className = "activity-step";
    item.dataset.activityStep = step.id;
    const index = textElement("span", "activity-step-index", step.icon);
    index.setAttribute("aria-hidden", "true");
    item.append(
      index,
      textElement("strong", "activity-step-label", step.label),
      textElement("span", "activity-step-detail", step.detail),
    );
    return item;
  });
  nodes.activitySteps.replaceChildren(...steps);
  nodes.activityChallengeWrap.hidden = !presentation.challenge;
  nodes.activityChallenge.textContent = presentation.challenge || "";
  nodes.activityTarget.parentElement.hidden = !presentation.target;
  nodes.activityTarget.textContent = presentation.target || "";
  const tags = presentation.materials.map((material) => {
    const tag = textElement("span", "", material.label);
    tag.dataset.icon = material.icon;
    return tag;
  });
  nodes.materialTags.replaceChildren(...tags);
  nodes.materialTags.hidden = tags.length === 0;
  nodes.activityOutcome.textContent = presentation.outcome;
  nodes.activityResult.hidden = !activityResolutionPending;
  nodes.activityResultCopy.textContent = (
    activityResolutionPending
      ? `${presentation.actorName || "挑战者"}完成了活动，正在回到落点。`
      : ""
  );
  nodes.skipActivity.disabled = activityResolutionPending;
  nodes.completeActivity.disabled = activityResolutionPending;
  nodes.completeActivity.textContent = activityResolutionPending
    ? "挑战完成 · 正在回到棋盘"
    : "完成挑战，看看棋盘变化";
  if (wasHidden) {
    window.requestAnimationFrame(() => {
      if (!nodes.activityStage.hidden) {
        nodes.activityCard.focus({ preventScroll: true });
      }
    });
  }
}

function renderResultsSummary() {
  if (gameSession?.phase !== "COMPLETED") return;
  lastSessionSummary ||= buildSessionSummary(gameSession, runtime.teams);
  const playerCards = lastSessionSummary.public.teams.map((playerState) => {
    const seat = gameSession.seats.find((candidate) => candidate.teamId === playerState.id);
    const card = document.createElement("article");
    card.className = "result-team";
    card.dataset.playerId = seat?.id;
    card.append(textElement("span", "", "个人行程"), textElement("strong", "", playerState.label),
      textElement("small", "", `停留位置：${nodeKindLabel(activeNodeKind(playerState.nodeId, "learning"))}`),
      createPlayerAssetStrip(seat?.id, playerState.label, { className: "is-result" }));
    return card;
  });
  nodes.resultsTeamList.replaceChildren(...playerCards);
  nodes.resultsSeatList.replaceChildren(...lastSessionSummary.teacher.seats.map((seat) => textElement(
    "div", "result-seat", isTeacherSession(gameSession)
      ? `${seat.displayName} · 行动 ${seat.opportunityCount} 次`
      : `${seat.displayName} · 发言 ${seat.opportunityCount} 次 · 主目标 ${seat.acceptedCount} 次`
        + ` · 关键词触发 ${seat.keywordTriggerCount} 次 · 教师确认 ${seat.teacherPassCount} 次`,
  )));
  nodes.resultsSeatList.closest("details").querySelector("summary").textContent = isTeacherSession(gameSession)
    ? "查看教师私有掷骰记录" : "查看教师私有发言记录";
}

function renderSessionStages() {
  const hasSession = Boolean(gameSession);
  nodes.setupStage.hidden = hasSession;
  nodes.returnToSetup.hidden = !hasSession;
  nodes.returnToSetup.textContent = gameSession?.assetGameEnded ? "返回开局设置" : "暂停并保存";
  nodes.bossStage.hidden = gameSession?.phase !== "BOSS_READY";
  nodes.resultsStage.hidden = gameSession?.screen !== "RESULTS";
  nodes.endGame.hidden = !hasSession || Boolean(gameSession?.assetGameEnded);
  nodes.endGame.disabled = busy || specialCellsFollowUpActive;
  renderRestartGameControl();
  nodes.replaySession.hidden = Boolean(gameSession?.assetGameEnded);
  nodes.newSession.textContent = gameSession?.assetGameEnded ? "返回开局设置" : "结束本局并返回设置";
  document.querySelector("#results-title").textContent = gameSession?.assetGameEnded ? "本局成绩" : "本章完成，冒险继续";
  document.querySelector("#results-copy").textContent = gameSession?.assetGameEnded
    ? "本局已经结束。已到账的家园积分继续保留，下一局可以继续积累。"
    : "继续本局会保留地图进度与行动记录。家园积分以到账回执为准，结束棋局不会清空账户。";
  renderPlatformPoints();
  if (!hasSession) {
    renderCharacterSelection();
    updateSetupPreview();
    updateResumeAvailability();
    return;
  }
  if (gameSession.phase === "BOSS_READY") {
    const finalTask = learningPack.tasks.at(-1);
    const frame = finalTask?.feedback?.modelContent
      || finalTask?.content?.responseScaffold
      || "Use one complete sentence together.";
    nodes.bossCopy.textContent = (
      `每位孩子都完成了至少 ${gameSession.minOpportunitiesPerSeat} 次朗读，`
      + "每个人的行动记录都已保存。"
      + "现在一起完成本章最后一句，点亮继续向前的远征信标。"
    );
    nodes.bossTaskFrame.textContent = frame;
    nodes.bossProgress.textContent = (
      `${gameSession.seats.length} 位孩子 · ${gameSession.completedTurns} 次任务`
      + " · 行动记录已保存"
    );
  }
  if (gameSession.screen === "RESULTS") renderResultsSummary();
}

function render() {
  applyTheme();
  renderBoard();
  renderHud();
  renderMission();
  renderActivity();
  renderSessionStages();
  renderSpeechControls();
  renderTeacherPanel();
  renderSpecialCellsHud();
  renderDiceDock();
  renderSoundToggle();
  if (gameSession) persistStableSession();
}

function presentationDuration(duration) {
  const normalized = Math.max(0, Number(duration) || 0);
  return qaControlsEnabled && QA_FAST_MODE_REQUESTED
    ? Math.min(normalized, 80)
    : normalized;
}

function facilitySoundDurationScale(fullAnimation, repeatScale, compactScale = 0.25) {
  if (reducedMotionRequested()) return compactScale;
  return fullAnimation ? 1 : repeatScale;
}

function setFacilityPresentationPhase(element, phase) {
  const facility = element?.matches?.(".harbor-facility")
    ? element
    : element?.closest?.(".harbor-facility");
  if (!facility) return null;
  facility.setAttribute("data-facility-phase", phase);
  return facility;
}

function sleep(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, presentationDuration(duration)));
}

function animationFinished(element, keyframes, options) {
  if (!element?.animate) return sleep(Number(options.duration) || 0);
  return element.animate(keyframes, {
    ...options,
    duration: presentationDuration(options.duration),
  }).finished.catch(() => undefined);
}

function reducedMotionRequested() {
  return (
    (qaControlsEnabled && QA_FAST_MODE_REQUESTED)
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function cancelCameraAnimation() {
  if (!cameraAnimation) return;
  const activeAnimation = cameraAnimation;
  cameraAnimation = null;
  window.cancelAnimationFrame(activeAnimation.frameId);
  if (activeAnimation.world) activeAnimation.world.style.willChange = "";
  activeAnimation.resolve();
}

function animateCameraTo(destination, { animate = true, duration = 260 } = {}) {
  const target = clampCamera(destination, cameraBounds(cameraBoardTemplate()));
  cancelCameraAnimation();

  if (
    !animate
    || reducedMotionRequested()
    || (Math.abs(target.x - camera.x) < 0.5 && Math.abs(target.y - camera.y) < 0.5)
  ) {
    camera = target;
    applyCameraTransform();
    return Promise.resolve();
  }

  const start = { ...camera };
  const startTime = performance.now();
  const animatedWorld = boardWorld;
  if (animatedWorld) animatedWorld.style.willChange = "transform";

  return new Promise((resolve) => {
    const animation = {
      frameId: 0,
      resolve,
      world: animatedWorld,
    };
    cameraAnimation = animation;

    const step = (timestamp) => {
      if (cameraAnimation !== animation) return;
      const progress = Math.min(1, Math.max(0, (timestamp - startTime) / duration));
      const easedProgress = 1 - ((1 - progress) ** 3);
      camera = {
        x: start.x + ((target.x - start.x) * easedProgress),
        y: start.y + ((target.y - start.y) * easedProgress),
      };
      applyCameraTransform();

      if (progress < 1) {
        animation.frameId = window.requestAnimationFrame(step);
        return;
      }

      camera = target;
      applyCameraTransform();
      cameraAnimation = null;
      if (animation.world) animation.world.style.willChange = "";
      resolve();
    };

    animation.frameId = window.requestAnimationFrame(step);
  });
}

function activePawnNodeId() {
  const activeTeam = runtime.teams[runtime.activeTeamIndex];
  if (!activeTeam) return activeBoardTemplate.startNodeId;
  if (activeTeam.id === movingTeamId && visualNodeId) return visualNodeId;
  return activeTeam.nodeId;
}

function focusActivePawn({ animate = true } = {}) {
  const position = nodeById.get(activePawnNodeId());
  if (!position) return Promise.resolve();
  return animateCameraTo(centerCameraOnPoint(position, cameraBoardTemplate()), { animate });
}

function ensureNodeVisible(nodeId, { animate = true } = {}) {
  const position = nodeById.get(nodeId);
  if (!position || isPointVisible(position, camera, cameraBoardTemplate(), 165)) {
    return Promise.resolve();
  }
  return animateCameraTo(centerCameraOnPoint(position, cameraBoardTemplate()), { animate });
}

function centerTransportPair(fromNodeId, toNodeId) {
  const from = nodeById.get(fromNodeId);
  const to = nodeById.get(toNodeId);
  if (!from || !to) return Promise.resolve();
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  return animateCameraTo(centerCameraOnPoint(midpoint, cameraBoardTemplate()), { animate: true });
}

function boardPointFromClient(clientX, clientY, inverseScreenMatrix = null) {
  let inverse = inverseScreenMatrix;
  if (!inverse) {
    const screenMatrix = nodes.board.getScreenCTM();
    if (!screenMatrix) return null;
    inverse = screenMatrix.inverse();
  }
  const pointer = nodes.board.createSVGPoint();
  pointer.x = clientX;
  pointer.y = clientY;
  return pointer.matrixTransform(inverse);
}

function applyBoardPanSample(gesture) {
  if (!gesture || gesture.pendingClientX === null || gesture.pendingClientY === null) return;
  const clientX = gesture.pendingClientX;
  const clientY = gesture.pendingClientY;
  gesture.pendingClientX = null;
  gesture.pendingClientY = null;
  const currentBoardPoint = boardPointFromClient(
    clientX,
    clientY,
    gesture.inverseScreenMatrix,
  );
  let rawCamera;
  if (gesture.startBoardPoint && currentBoardPoint) {
    rawCamera = {
      x: gesture.startCamera.x - (currentBoardPoint.x - gesture.startBoardPoint.x),
      y: gesture.startCamera.y - (currentBoardPoint.y - gesture.startBoardPoint.y),
    };
  } else {
    rawCamera = screenDragToCamera({
      startCamera: gesture.startCamera,
      deltaX: clientX - gesture.startClientX,
      deltaY: clientY - gesture.startClientY,
      renderedWidth: gesture.renderedWidth,
      renderedHeight: gesture.renderedHeight,
      board: cameraBoardTemplate(),
    });
  }
  camera = dampCamera(rawCamera, cameraBounds(cameraBoardTemplate()), 0.28);
  applyCameraTransform();
}

function flushBoardPanSample(gesture) {
  if (!gesture) return;
  if (gesture.frameRequest) {
    cancelAnimationFrame(gesture.frameRequest);
    gesture.frameRequest = 0;
  }
  applyBoardPanSample(gesture);
}

function layoutEditorWorldPointFromClient(clientX, clientY, inverseScreenMatrix) {
  if (!inverseScreenMatrix || !nodes.board) return null;
  const pointer = nodes.board.createSVGPoint();
  pointer.x = clientX;
  pointer.y = clientY;
  return pointer.matrixTransform(inverseScreenMatrix);
}

function updateLayoutEditorOriginDom() {
  if (!layoutEditor.active || !boardWorld) return;
  const base = layoutEditorBaseNode();
  const visual = layoutEditorVisualNode();
  let layer = boardWorld.querySelector(".layout-editor-origin-layer");
  if (!base || !visual || (base.x === visual.x && base.y === visual.y)) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = svgElement("g", {
      class: "layout-editor-origin-layer",
      "aria-hidden": "true",
    });
    layer.append(
      svgElement("path", { class: "layout-editor-origin-line" }),
      svgElement("circle", { r: 29, class: "layout-editor-origin-marker" }),
      svgElement("text", {
        "text-anchor": "middle",
        class: "layout-editor-origin-label",
      }),
    );
    boardWorld.insertBefore(layer, boardWorld.querySelector(".space-layer"));
  }
  layer.dataset.layoutOriginNodeId = base.id;
  layer.querySelector(".layout-editor-origin-line")
    ?.setAttribute("d", `M ${base.x} ${base.y} L ${visual.x} ${visual.y}`);
  const marker = layer.querySelector(".layout-editor-origin-marker");
  marker?.setAttribute("cx", String(base.x));
  marker?.setAttribute("cy", String(base.y));
  const label = layer.querySelector(".layout-editor-origin-label");
  label?.setAttribute("x", String(base.x));
  label?.setAttribute("y", String(base.y - 38));
  if (label) label.textContent = `原位 · ${base.id}`;
}

function updateLayoutEditorFacilityDom(nodeId) {
  const position = layoutEditorVisualNode(nodeId);
  if (!position) return;
  const grounded = groundedSceneSelection().nodeIds.has(nodeId);
  const directAnchor = `translate(${position.x} ${position.y})`;
  nodes.board.querySelectorAll(`[data-item-node-id="${CSS.escape(nodeId)}"]`)
    .forEach((element) => {
      if (element.classList.contains("departure-beacon-device")) {
        element.setAttribute("transform", directAnchor);
      }
    });
  nodes.board.querySelectorAll(`[data-transport-node-id="${CSS.escape(nodeId)}"]`)
    .forEach((element) => element.setAttribute(
      "transform",
      `translate(${position.x - 2} ${position.y - (grounded ? 23 : 43)}) scale(.82)`,
    ));
  nodes.board.querySelectorAll(`[data-transport-front-node-id="${CSS.escape(nodeId)}"]`)
    .forEach((element) => element.setAttribute("transform", directAnchor));
  nodes.board.querySelectorAll(`[data-map-effect-node-id="${CSS.escape(nodeId)}"]`)
    .forEach((element) => element.setAttribute(
      "transform",
      element.classList.contains("harbor-light-device") ? directAnchor
        : `translate(${position.x + 4} ${position.y - (grounded ? 23 : 53)}) scale(.78)`,
    ));
}

function updateLayoutEditorRouteDom() {
  const roadEdges = visibleBoardEdges()
    .filter((edge) => edge.terrainType !== "cloud-stair");
  const { nodeIds: groundedNodeIds } = groundedSceneSelection();
  const allRoutes = routePathData(roadEdges.filter((edge) => (
    !groundedNodeIds.has(edge.from) || !groundedNodeIds.has(edge.to)
  )));
  nodes.board.querySelectorAll(
    ".route-grounding, .route-shadow, .route-cloud-bank, .route-outline, "
    + ".route-line, .route-highlight, .route-texture-mask-shape",
  ).forEach((path) => path.setAttribute("d", allRoutes));

  const edgeById = new Map(visualBoardTemplate.edges.map((edge) => [edge.id, edge]));
  nodes.board.querySelectorAll("[data-terrain-edge-id]").forEach((gradient) => {
    const edge = edgeById.get(gradient.dataset.terrainEdgeId);
    if (!edge) return;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    Object.entries({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })
      .forEach(([name, value]) => gradient.setAttribute(name, value));
  });
  nodes.board.querySelectorAll(".grounded-route-material").forEach((group) => {
    const materialEdges = group.dataset.edgeIds.split(" ")
      .map((id) => edgeById.get(id)).filter(Boolean);
    const d = routePathData(materialEdges);
    group.querySelectorAll("path").forEach((path) => path.setAttribute("d", d));
  });
  nodes.board.querySelectorAll("[data-air-crossing-edge]").forEach((group) => {
    const edge = edgeById.get(group.dataset.airCrossingEdge);
    if (edge) group.replaceWith(airCrossingVisualForEdge(edge));
  });
  const updateEdgeElement = (element) => {
    const edge = edgeById.get(element.dataset.edgeId);
    if (!edge) return;
    if (element.localName === "path") {
      element.setAttribute("d", edgePath(edge));
      return;
    }
    element.querySelectorAll("path").forEach((path) => {
      path.setAttribute("d", edgePath(edge));
    });
  };
  nodes.board.querySelectorAll("[data-edge-id]").forEach(updateEdgeElement);
  nodes.miniMap.querySelectorAll("[data-edge-id]").forEach(updateEdgeElement);
}

function syncLayoutEditorDragReadout() {
  const base = layoutEditorBaseNode();
  const visual = layoutEditorVisualNode();
  if (!base || !visual) return;
  const deltaX = visual.x - base.x;
  const deltaY = visual.y - base.y;
  const distance = Math.hypot(deltaX, deltaY);
  const changedCount = Object.keys(layoutEditor.draft?.nodePositions || {}).length;
  nodes.layoutEditorX.value = String(visual.x);
  nodes.layoutEditorY.value = String(visual.y);
  nodes.layoutEditorDelta.textContent = `相对原位 ${deltaX >= 0 ? "+" : ""}${deltaX}`
    + ` / ${deltaY >= 0 ? "+" : ""}${deltaY}`;
  nodes.layoutEditorChangedCount.textContent = changedCount
    ? `布局草稿 · 已调整 ${changedCount} 个节点`
    : "布局草稿 · 尚未调整节点";
  if (distance > 28) {
    nodes.layoutEditorWarning.hidden = false;
    nodes.layoutEditorWarning.textContent = (
      `已偏移 ${Math.round(distance)} px，请重新检查道路与背景贴合。`
    );
  } else if (layoutEditor.storageAvailable && !layoutEditor.staleDraft) {
    nodes.layoutEditorWarning.hidden = true;
  }
}

function updateLayoutEditorPreviewDom(nodeId) {
  const position = layoutEditorVisualNode(nodeId);
  if (!position) return;
  nodes.board.querySelector(`.board-space[data-node-id="${CSS.escape(nodeId)}"]`)
    ?.setAttribute("transform", `translate(${position.x} ${position.y})`);
  nodes.miniMap.querySelector(`.mini-space[data-node-id="${CSS.escape(nodeId)}"]`)
    ?.setAttribute("transform", `translate(${position.x} ${position.y}) scale(.48)`);
  updateLayoutEditorFacilityDom(nodeId);
  updateLayoutEditorRouteDom();
  updateLayoutEditorOriginDom();
  syncLayoutEditorDragReadout();
}

function applyLayoutNodeDragSample(gesture) {
  if (
    !gesture
    || gesture.pendingClientX === null
    || gesture.pendingClientY === null
  ) {
    return;
  }
  const point = layoutEditorWorldPointFromClient(
    gesture.pendingClientX,
    gesture.pendingClientY,
    gesture.inverseScreenMatrix,
  );
  gesture.pendingClientX = null;
  gesture.pendingClientY = null;
  if (!point) return;
  layoutEditor.draft = updateBoardLayoutDraft(
    layoutEditor.baseBoard,
    layoutEditor.draft,
    gesture.nodeId,
    {
      x: point.x + gesture.grabOffset.x,
      y: point.y + gesture.grabOffset.y,
    },
    { worldRef: layoutEditor.worldRef, grid: layoutEditor.grid },
  );
  applyLayoutEditorPreview();
  updateLayoutEditorPreviewDom(gesture.nodeId);
}

function flushLayoutNodeDragSample(gesture) {
  if (!gesture) return;
  if (gesture.frameRequest) {
    cancelAnimationFrame(gesture.frameRequest);
    gesture.frameRequest = 0;
  }
  applyLayoutNodeDragSample(gesture);
}

function beginLayoutNodeDrag(event, nodeElement) {
  const nodeId = nodeElement?.dataset.nodeId;
  if (!layoutEditorBaseNode(nodeId) || layoutEditor.gesture || panGesture) return false;
  selectLayoutEditorNode(nodeId, { renderScene: nodeId !== layoutEditor.selectedNodeId });
  let inverseScreenMatrix = null;
  try {
    inverseScreenMatrix = boardWorld?.getScreenCTM()?.inverse() || null;
  } catch {
    inverseScreenMatrix = null;
  }
  const point = layoutEditorWorldPointFromClient(
    event.clientX,
    event.clientY,
    inverseScreenMatrix,
  );
  const position = layoutEditorVisualNode(nodeId);
  if (!point || !position) return false;
  layoutEditor.gesture = {
    pointerId: event.pointerId,
    nodeId,
    startDraft: cloneLayoutEditorDraft(layoutEditor.draft),
    inverseScreenMatrix,
    grabOffset: { x: position.x - point.x, y: position.y - point.y },
    pendingClientX: null,
    pendingClientY: null,
    frameRequest: 0,
  };
  nodes.boardViewport.setPointerCapture(event.pointerId);
  nodes.boardViewport.classList.add("is-node-dragging");
  event.preventDefault();
  return true;
}

function moveLayoutNodeDrag(event) {
  const gesture = layoutEditor.gesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return false;
  gesture.pendingClientX = event.clientX;
  gesture.pendingClientY = event.clientY;
  if (!gesture.frameRequest) {
    gesture.frameRequest = requestAnimationFrame(() => {
      gesture.frameRequest = 0;
      if (layoutEditor.gesture !== gesture) return;
      applyLayoutNodeDragSample(gesture);
    });
  }
  event.preventDefault();
  return true;
}

function endLayoutNodeDrag(event, { cancel = false } = {}) {
  const gesture = layoutEditor.gesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return false;
  if (cancel) {
    cancelLayoutNodeGesture({ restore: true });
    return true;
  }
  flushLayoutNodeDragSample(gesture);
  const after = cloneLayoutEditorDraft(layoutEditor.draft);
  const before = cloneLayoutEditorDraft(gesture.startDraft);
  const position = layoutEditorVisualNode(gesture.nodeId);
  layoutEditor.gesture = null;
  nodes.boardViewport.classList.remove("is-node-dragging");
  if (nodes.boardViewport.hasPointerCapture(gesture.pointerId)) {
    nodes.boardViewport.releasePointerCapture(gesture.pointerId);
  }
  recordLayoutEditorChange(
    before,
    after,
    `${layoutEditorNodeLabel(layoutEditorBaseNode(gesture.nodeId))} ${gesture.nodeId} `
    + `已移动到 X ${position?.x ?? "—"}，Y ${position?.y ?? "—"}`,
  );
  return true;
}

function beginBoardPan(event) {
  if (
    (busy && !layoutEditor.active)
    || event.button !== 0
    || event.isPrimary === false
    || panGesture
    || layoutEditor.gesture
  ) return;
  if (event.target.closest?.(".map-navigator, .board-legend")) return;

  const targetNode = event.target.closest?.(".board-space[data-node-id]");
  if (
    layoutEditor.active
    && layoutEditor.tool === "node"
    && targetNode
    && beginLayoutNodeDrag(event, targetNode)
  ) {
    return;
  }

  cancelCameraAnimation();
  const screenMatrix = nodes.board.getScreenCTM();
  const inverseScreenMatrix = screenMatrix ? screenMatrix.inverse() : null;
  const renderedBounds = nodes.board.getBoundingClientRect();
  panGesture = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startBoardPoint: boardPointFromClient(
      event.clientX,
      event.clientY,
      inverseScreenMatrix,
    ),
    startCamera: { ...camera },
    inverseScreenMatrix,
    renderedWidth: renderedBounds.width,
    renderedHeight: renderedBounds.height,
    pendingClientX: null,
    pendingClientY: null,
    frameRequest: 0,
  };
  nodes.boardViewport.setPointerCapture(event.pointerId);
  nodes.boardViewport.classList.add("is-panning");
  if (boardWorld) boardWorld.style.willChange = "transform";
  event.preventDefault();
}

function cancelBoardPan() {
  if (!panGesture) return;
  flushBoardPanSample(panGesture);
  const pointerId = panGesture.pointerId;
  panGesture = null;
  nodes.boardViewport.classList.remove("is-panning");
  if (boardWorld) boardWorld.style.willChange = "";
  if (nodes.boardViewport.hasPointerCapture(pointerId)) {
    nodes.boardViewport.releasePointerCapture(pointerId);
  }
  camera = clampCamera(camera, cameraBounds(cameraBoardTemplate()));
  applyCameraTransform();
}

function moveBoardPan(event) {
  if (layoutEditor.gesture && moveLayoutNodeDrag(event)) return;
  if ((busy && !layoutEditor.active) || !panGesture || event.pointerId !== panGesture.pointerId) return;
  const gesture = panGesture;
  gesture.pendingClientX = event.clientX;
  gesture.pendingClientY = event.clientY;
  if (!gesture.frameRequest) {
    gesture.frameRequest = requestAnimationFrame(() => {
      gesture.frameRequest = 0;
      if (panGesture !== gesture) return;
      applyBoardPanSample(gesture);
    });
  }
  event.preventDefault();
}

function endBoardPan(event) {
  if (layoutEditor.gesture && endLayoutNodeDrag(event, {
    cancel: event.type !== "pointerup",
  })) return;
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
  flushBoardPanSample(panGesture);
  const pointerId = panGesture.pointerId;
  panGesture = null;
  nodes.boardViewport.classList.remove("is-panning");
  if (boardWorld) boardWorld.style.willChange = "";
  if (nodes.boardViewport.hasPointerCapture(pointerId)) {
    nodes.boardViewport.releasePointerCapture(pointerId);
  }
  void animateCameraTo(clampCamera(camera, cameraBounds(cameraBoardTemplate())), {
    animate: true,
    duration: 190,
  });
}

function moveCameraWithKeyboard(event) {
  if (layoutEditor.active) {
    const focusedNode = event.target.closest?.(".board-space[data-node-id]");
    if (focusedNode) {
      const movement = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      }[event.key];
      if (movement) {
        event.preventDefault();
        if (focusedNode.dataset.nodeId !== layoutEditor.selectedNodeId) {
          selectLayoutEditorNode(focusedNode.dataset.nodeId, { renderScene: true });
        }
        nudgeLayoutEditorNode(movement.x, movement.y, {
          step: event.shiftKey ? 10 : 1,
        });
        nodes.board.querySelector(
          `.board-space[data-node-id="${CSS.escape(focusedNode.dataset.nodeId)}"]`,
        )?.focus({ preventScroll: true });
        return;
      }
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        selectLayoutEditorNode(focusedNode.dataset.nodeId, { renderScene: true });
        return;
      }
    }
  }
  if (event.target !== nodes.boardViewport || (busy && !layoutEditor.active)) return;
  const movements = {
    ArrowLeft: { x: -110, y: 0 },
    ArrowRight: { x: 110, y: 0 },
    ArrowUp: { x: 0, y: -90 },
    ArrowDown: { x: 0, y: 90 },
  };
  if (event.key === "Home") {
    event.preventDefault();
    void focusActivePawn({ animate: false });
    return;
  }
  const movement = movements[event.key];
  if (!movement) return;
  event.preventDefault();
  cancelCameraAnimation();
  camera = clampCamera({
    x: camera.x + movement.x,
    y: camera.y + movement.y,
  }, cameraBounds(cameraBoardTemplate()));
  applyCameraTransform();
}

function navigateFromMiniMap(event) {
  if (busy) return;
  const screenMatrix = nodes.miniMap.getScreenCTM();
  if (!screenMatrix) return;
  const pointer = nodes.miniMap.createSVGPoint();
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  const worldPoint = pointer.matrixTransform(screenMatrix.inverse());
  void animateCameraTo(centerCameraOnPoint(worldPoint, cameraBoardTemplate()), { animate: true });
}

function quadraticPoint(start, control, end, progress) {
  const inverse = 1 - progress;
  return (inverse * inverse * start)
    + (2 * inverse * progress * control)
    + (progress * progress * end);
}

function positionedFx(className, x, y) {
  const element = document.createElement("div");
  element.className = className;
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  return element;
}

const COLLECTION_RESOURCE_META = Object.freeze({
  coin: Object.freeze({ glyph: "●", label: "金币", unit: "枚", pitch: -1 }),
  star: Object.freeze({ glyph: "★", label: "星星", unit: "颗", pitch: 0 }),
  key: Object.freeze({ glyph: "钥", label: "钥匙", unit: "把", pitch: 1 }),
  card: Object.freeze({ glyph: "卡", label: "星星", unit: "张", pitch: 2 }),
});

function elementCenter(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || (!rect.width && !rect.height)) return null;
  return {
    x: rect.left + (rect.width / 2),
    y: rect.top + (rect.height / 2),
  };
}

function playerAssetTarget(ownerId, resource) {
  const playerCard = [...document.querySelectorAll(".team-hud[data-player-id]")]
    .find((element) => element.dataset.playerId === ownerId);
  return [...(playerCard?.querySelectorAll("[data-player-asset]") || [])]
    .find((element) => element.dataset.playerAsset === resource) || null;
}

function teamIdForOwner(ownerId) {
  return gameSession?.seats?.find((seat) => seat.id === ownerId)?.teamId || null;
}

function collectionOrigin(presentation) {
  if (presentation.originPoint) {
    return {
      element: null,
      point: presentation.originPoint,
      originId: "dice-face",
    };
  }
  if (presentation.source === "answer") {
    return {
      element: nodes.answerRewardSource,
      point: elementCenter(nodes.answerRewardSource),
      originId: "answer-score",
    };
  }
  if (presentation.source === "dice") {
    return {
      element: null,
      point: currentDiceRewardOriginPoint,
      originId: "dice-face",
    };
  }
  if (presentation.source === "milestone") {
    return {
      element: nodes.sessionGoal,
      point: elementCenter(nodes.sessionGoal),
      originId: "session-milestone",
    };
  }
  if (presentation.source === "account") {
    const element = playerAssetTarget(
      presentation.ownerId,
      presentation.sourceResource,
    );
    return {
      element,
      point: elementCenter(element),
      originId: `player-${presentation.sourceResource || "asset"}`,
    };
  }
  if (presentation.source === "chest") {
    const element = document.querySelector(".card-reveal-chest");
    return {
      element,
      point: elementCenter(element),
      originId: "opened-chest",
    };
  }
  if (presentation.originNodeId) {
    const element = [...nodes.board.querySelectorAll(".board-space")]
      .find((candidate) => candidate.dataset.nodeId === presentation.originNodeId);
    return {
      element,
      point: elementCenter(element),
      originId: presentation.originNodeId,
    };
  }
  const teamId = teamIdForOwner(presentation.ownerId);
  const element = [...nodes.board.querySelectorAll(".pawn")]
    .find((candidate) => candidate.dataset.teamId === teamId);
  return {
    element,
    point: elementCenter(element),
    originId: teamId || "active-pawn",
  };
}

function appendCollectionSparks(point, resource) {
  if (!nodes.collectionFxLayer || reducedMotionRequested()) return [];
  return Array.from({ length: 6 }, (_, index) => {
    const spark = positionedFx(
      `collection-spark is-${resource}`,
      point.x,
      point.y,
    );
    const angle = (Math.PI * 2 * index) / 6;
    const distance = 24 + ((index % 2) * 10);
    nodes.collectionFxLayer.append(spark);
    const animation = spark.animate([
      { opacity: 0, transform: "translate3d(-50%, -50%, 0) scale(.7)" },
      {
        opacity: 1,
        offset: 0.22,
        transform: `translate3d(calc(-50% + ${Math.cos(angle) * 8}px), calc(-50% + ${Math.sin(angle) * 8}px), 0) scale(1)`,
      },
      {
        opacity: 0,
        transform: `translate3d(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px), 0) scale(.35)`,
      },
    ], {
      duration: presentationDuration(460),
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    animation.finished.catch(() => undefined).finally(() => spark.remove());
    return animation;
  });
}

function commitVisiblePlayerAssetPresentation(presentation) {
  if (["coin", "star", "key", "card", "card_case"].includes(presentation?.resource)) return null;
  if (
    presentation.presentationEpoch !== rewardPresentationEpoch
    || (
      presentation.sessionId
      && presentation.sessionId !== gameSession?.sessionId
    )
  ) return null;
  if (presentation.assetsAfter) {
    visiblePlayerAssetsById = {
      ...visiblePlayerAssetsById,
      [presentation.ownerId]: {
        coins: Math.max(0, Number(presentation.assetsAfter.coins) || 0),
        stars: Math.max(0, Number(presentation.assetsAfter.stars) || 0),
      },
    };
    renderHud(gameSession);
  }
  const destination = playerAssetTarget(
    presentation.ownerId,
    presentation.resource,
  );
  const delta = destination?.querySelector(".player-asset-delta");
  if (delta) {
    delta.textContent = `+${presentation.amount}`;
    delta.hidden = false;
    delta.classList.remove("is-visible");
    window.requestAnimationFrame(() => delta.classList.add("is-visible"));
    window.setTimeout(() => {
      delta.classList.remove("is-visible");
      delta.hidden = true;
    }, presentationDuration(1050));
  }
  const meta = COLLECTION_RESOURCE_META[presentation.resource];
  const playerName = playerNameForOwner(presentation.ownerId);
  if (nodes.collectionStatus && meta) {
    nodes.collectionStatus.textContent = presentation.kind === "conversion"
      ? `${playerName}把个人${COLLECTION_RESOURCE_META[presentation.sourceResource]?.label || "资源"}兑换成${meta.label}`
      : `${playerName}获得 ${presentation.amount} ${meta.unit}${meta.label}`;
  }
  if (destination && meta) presentRewardReceipt(presentation, destination, playerName);
  return destination;
}

function presentRewardReceipt(presentation, destination, playerName) {
  if (["coin", "star", "key", "card", "card_case"].includes(presentation?.resource)) return null;
  const card = destination.closest(".team-hud");
  if (!card || !nodes.collectionFxLayer) return;
  // A later receipt supersedes the same student's earlier displayed total.
  nodes.collectionFxLayer.querySelectorAll(".reward-receipt").forEach((previous) => {
    if (previous.dataset.ownerId === presentation.ownerId) previous.remove();
  });
  const copy = rewardReceiptCopy(presentation, playerName);
  const receipt = document.createElement("div");
  receipt.className = `reward-receipt is-${presentation.resource}`;
  receipt.dataset.ownerId = presentation.ownerId;
  receipt.dataset.collectionEventId = presentation.id;
  receipt.append(textElement("span", "", copy.title), textElement("strong", "", copy.amount), textElement("small", "", copy.total));
  nodes.collectionFxLayer.append(receipt);
  const rect = card.getBoundingClientRect();
  receipt.style.left = `${Math.max(12, Math.min(window.innerWidth - receipt.offsetWidth - 12, rect.left + (rect.width - receipt.offsetWidth) / 2))}px`;
  receipt.style.top = `${Math.max(12, Math.min(window.innerHeight - receipt.offsetHeight - 12, rect.bottom + 10))}px`;
  const reduced = reducedMotionRequested();
  void animationFinished(receipt, [
    { opacity: 0, transform: reduced ? "none" : "translateY(-7px) scale(.96)" },
    { opacity: 1, transform: "none", offset: .15 },
    { opacity: 1, transform: "none", offset: .8 },
    { opacity: 0, transform: reduced ? "none" : "translateY(-3px)" },
  ], { duration: presentation.resource === "star" ? 1500 : 1150, easing: "linear" })
    .finally(() => receipt.remove());
}

function rewardArcFrames(start, end) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const control = {
    x: (start.x + end.x) / 2,
    y: Math.min(start.y, end.y) - Math.min(170, Math.max(72, distance * 0.28)),
  };
  return [0, 0.14, 0.3, 0.48, 0.66, 0.82, 1].map((progress) => {
    const x = quadraticPoint(start.x, control.x, end.x, progress);
    const y = quadraticPoint(start.y, control.y, end.y, progress);
    const opacity = progress === 0 || progress === 1 ? 0 : 1;
    const scale = progress < 0.18
      ? 0.82 + (progress * 1.6)
      : 1 - (progress * 0.3);
    return {
      offset: progress,
      opacity,
      transform: (
        `translate3d(calc(-50% + ${x - start.x}px), `
        + `calc(-50% + ${y - start.y}px), 0) scale(${scale})`
      ),
    };
  });
}

async function playCollectionPresentation(presentation) {
  if (["coin", "star", "key", "card", "card_case"].includes(presentation?.resource)) return;
  if (
    presentation.presentationEpoch !== rewardPresentationEpoch
    || (
      presentation.sessionId
      && presentation.sessionId !== gameSession?.sessionId
    )
  ) return;
  const meta = COLLECTION_RESOURCE_META[presentation.resource];
  const destination = playerAssetTarget(
    presentation.ownerId,
    presentation.resource,
  );
  const origin = collectionOrigin(presentation);
  const start = origin.point || elementCenter(destination);
  const end = elementCenter(destination);
  if (!meta || !destination || !start || !end || !nodes.collectionFxLayer) {
    commitVisiblePlayerAssetPresentation(presentation);
    return;
  }

  const sourceEcho = !origin.element && origin.originId === "dice-face"
    ? positionedFx(
        `reward-source-echo is-${presentation.resource}`,
        start.x,
        start.y,
      )
    : null;
  if (sourceEcho) {
    sourceEcho.dataset.rewardOriginId = origin.originId;
    sourceEcho.dataset.ownerId = presentation.ownerId;
    sourceEcho.textContent = presentation.amount > 1
      ? `${meta.glyph} ×${presentation.amount}`
      : meta.glyph;
    nodes.collectionFxLayer.append(sourceEcho);
  }
  const visualOriginElement = origin.element || sourceEcho;
  visualOriginElement?.classList.add("is-reward-source-active");
  appendCollectionSparks(start, presentation.resource);
  boardSounds.play(
    presentation.kind === "conversion" ? "exchange" : "pickup",
    { pitch: meta.pitch, intensity: presentation.amount > 1 ? 0.9 : 0.72 },
  );

  if (reducedMotionRequested()) {
    try {
      await sleep(80);
      const updatedDestination = commitVisiblePlayerAssetPresentation(presentation);
      updatedDestination?.classList.add("is-collecting");
      await sleep(100);
      updatedDestination?.classList.remove("is-collecting");
    } finally {
      visualOriginElement?.classList.remove("is-reward-source-active");
      sourceEcho?.remove();
    }
    return;
  }

  const tokenCount = presentation.amount <= 3 ? presentation.amount : 1;
  const tokens = Array.from({ length: tokenCount }, (_, index) => {
    const token = positionedFx(
      `collection-token is-${presentation.resource}`,
      start.x,
      start.y,
    );
    token.dataset.collectionEventId = presentation.id;
    token.dataset.ownerId = presentation.ownerId;
    token.dataset.rewardSource = presentation.source;
    token.dataset.originId = origin.originId;
    token.dataset.targetPlayerId = presentation.ownerId;
    token.dataset.collectionResource = presentation.resource;
    token.textContent = presentation.amount > 3
      ? `${meta.glyph} ×${presentation.amount}`
      : meta.glyph;
    nodes.collectionFxLayer.append(token);
    const animation = token.animate(rewardArcFrames(start, end), {
      duration: presentationDuration(740),
      delay: presentationDuration(index * 55),
      easing: "linear",
      fill: "forwards",
    });
    return { token, animation };
  });
  try {
    await Promise.all(tokens.map(({ animation }) => (
      animation.finished.catch(() => undefined)
    )));
    const updatedDestination = commitVisiblePlayerAssetPresentation(presentation);
    updatedDestination?.classList.add("is-collecting");
    if (updatedDestination) {
      appendCollectionSparks(
        elementCenter(updatedDestination) || end,
        presentation.resource,
      );
      await animationFinished(updatedDestination, [
        { transform: "scale(1)" },
        { transform: "scale(1.08)", offset: 0.44 },
        { transform: "scale(1)" },
      ], {
        duration: 130,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    }
  } finally {
    tokens.forEach(({ token }) => token.remove());
    playerAssetTarget(
      presentation.ownerId,
      presentation.resource,
    )?.classList.remove("is-collecting");
    visualOriginElement?.classList.remove("is-reward-source-active");
    sourceEcho?.remove();
  }
}

function scheduleCollectionPresentation(presentation) {
  if (!presentation?.ownerId) return Promise.resolve();
  const queuedPresentation = {
    ...presentation,
    sessionId: gameSession?.sessionId || null,
    presentationEpoch: rewardPresentationEpoch,
    originPoint: presentation.source === "dice" && currentDiceRewardOriginPoint
      ? { ...currentDiceRewardOriginPoint }
      : null,
  };
  const previous = rewardPresentationQueues.get(presentation.ownerId)
    || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => playCollectionPresentation(queuedPresentation))
    .catch((error) => {
      console.warn("player reward presentation skipped", error);
      commitVisiblePlayerAssetPresentation(queuedPresentation);
    })
    .finally(() => {
      if (rewardPresentationQueues.get(presentation.ownerId) === next) {
        rewardPresentationQueues.delete(presentation.ownerId);
      }
    });
  rewardPresentationQueues.set(presentation.ownerId, next);
  return next;
}

function scheduleCollectionSequence(presentations) {
  return Promise.all(
    presentations.map((presentation) => scheduleCollectionPresentation(presentation)),
  );
}

async function playCircuitLapReturn(effect, movingTeam) {
  // A lap is a local presentation: keep the map and every other pawn in place.
  const entryNodeId = effect.toEntryNodeId || effect.toNodeId;
  const duration = presentationDuration(reducedMotionRequested() ? 0 : 110);
  const pawn = nodes.board.querySelector(`.pawn[data-team-id="${movingTeam.id}"] .pawn-motion`);
  if (pawn && duration) await animationFinished(pawn, [{ opacity: 1 }, { opacity: 0 }], { duration });
  visualNodeId = entryNodeId;
  visitedNodeIds.add(entryNodeId);
  renderBoard();
  await ensureNodeVisible(entryNodeId, { animate: !reducedMotionRequested() });
  boardSounds.play("world-arrival", { intensity: 0.75 });
  nodes.voiceState.textContent = `${movingTeam.label}完成一圈 · 回到云港起点继续前进`;
  const returnedPawn = nodes.board.querySelector(`.pawn[data-team-id="${movingTeam.id}"] .pawn-motion`);
  if (returnedPawn && duration) await animationFinished(returnedPawn, [{ opacity: 0 }, { opacity: 1 }], { duration });
}

async function playWorldTransition(effect, movingTeam, nextRuntime) {
  const reducedMotion = reducedMotionRequested();
  const duration = reducedMotion ? 180 : 1180;
  const oldWorld = boardWorld;
  const veil = document.createElement("div");
  veil.className = "world-portal-transition";
  veil.dataset.phase = "departure";
  veil.dataset.fromWorldRef = effect.fromWorldRef;
  veil.dataset.toWorldRef = effect.toWorldRef;
  veil.append(
    textElement("span", "world-portal-kicker", "FORWARD ONLY · 向前穿越"),
    textElement("strong", "world-portal-title", `${movingTeam.label} 打开了下一世界`),
    textElement("small", "world-portal-copy", "传送门不消耗骰点，剩余点数继续逐格前进"),
  );
  nodes.fxLayer.replaceChildren(veil);
  nodes.fxLayer.dataset.effectId = effect.effectId;
  boardSounds.play("world-portal", {
    intensity: 0.94,
    durationScale: reducedMotion ? 0.24 : 1,
  });
  nodes.voiceState.textContent = "前进星门开启 · 正在装载下一世界";

  const departure = oldWorld
    ? animationFinished(oldWorld, reducedMotion
      ? [{ opacity: 1 }, { opacity: 0.25 }]
      : [
          { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
          { opacity: 0.15, transform: "scale(.82)", filter: "blur(12px)" },
        ], {
      duration: Math.round(duration * 0.48),
      easing: "cubic-bezier(.4,0,.7,.2)",
      fill: "forwards",
    })
    : Promise.resolve();
  const veilDeparture = animationFinished(veil, reducedMotion
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [
        { opacity: 0, transform: "translate(-50%, -50%) scale(.72)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.06)", offset: 0.72 },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      ], {
    duration: Math.round(duration * 0.5),
    easing: "cubic-bezier(.2,.8,.2,1)",
    fill: "forwards",
  });
  await Promise.all([departure, veilDeparture]);

  const previousActiveTeamIndex = runtime.activeTeamIndex;
  activateWorldComposition(effect.toWorldRef, {
    resetCamera: true,
    visitedNodeIds: new Set([effect.toEntryNodeId]),
  });
  applyTheme();
  runtime = {
    ...nextRuntime,
    activeTeamIndex: previousActiveTeamIndex,
    mapState: structuredClone(
      nextRuntime.world?.active?.mapState || nextRuntime.mapState || {},
    ),
  };
  visualNodeId = effect.toEntryNodeId;
  renderBoard();
  await ensureNodeVisible(effect.toEntryNodeId, { animate: false });
  veil.dataset.phase = "arrival";
  veil.querySelector(".world-portal-kicker").textContent = "NEW WORLD · 新世界抵达";
  veil.querySelector(".world-portal-title").textContent = activeWorldComposition.worldPack.title;
  veil.querySelector(".world-portal-copy").textContent = (
    "全班已抵达入口，当前棋子继续走完剩余骰点"
  );
  boardSounds.play("world-arrival", {
    intensity: 0.9,
    durationScale: reducedMotion ? 0.24 : 1,
  });
  nodes.voiceState.textContent = `${activeWorldComposition.worldPack.title}已抵达 · 继续前进`;
  const newWorld = boardWorld;
  await Promise.all([
    newWorld
      ? animationFinished(newWorld, reducedMotion
        ? [{ opacity: 0.5 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "scale(1.08)", filter: "blur(10px)" },
            { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
          ], {
        duration: Math.round(duration * 0.5),
        easing: "cubic-bezier(.18,.78,.22,1)",
        fill: "forwards",
      })
      : Promise.resolve(),
    animationFinished(veil, reducedMotion
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
          { opacity: 0, transform: "translate(-50%, -50%) scale(1.18)" },
        ], {
      duration: Math.round(duration * 0.5),
      easing: "ease-out",
      fill: "forwards",
    }),
  ]);
  nodes.fxLayer.replaceChildren();
  delete nodes.fxLayer.dataset.effectId;
}

const WORLD_DEVICE_PRESENTATIONS = Object.freeze({
  "world-signal": Object.freeze({ glyph: "◎", sound: "world-scan" }),
  "world-prism": Object.freeze({ glyph: "◇", sound: "world-prism" }),
  "world-beacon": Object.freeze({ glyph: "◉", sound: "world-whale" }),
  "world-tide": Object.freeze({ glyph: "≋", sound: "world-whale" }),
  "world-tree": Object.freeze({ glyph: "✦", sound: "world-aurora" }),
  "world-aurora": Object.freeze({ glyph: "⌁", sound: "world-aurora" }),
  "world-moon": Object.freeze({ glyph: "☾", sound: "world-moon" }),
});

async function playWorldDeviceEffect(effect, movingTeam) {
  await ensureNodeVisible(effect.nodeId);
  const targetSpace = nodes.board.querySelector(
    `.board-space[data-node-id="${effect.nodeId}"]`,
  );
  if (!targetSpace) return;
  const skin = mapEffectSkin(effect.mapEffectRef);
  const resultCopy = mapEffectResultCopy(effect, skin);
  const changesSharedRoute = effect.mapEffectRef === "beyond-cloud.prism-tree.v1";
  const device = WORLD_DEVICE_PRESENTATIONS[skin.deviceVariant]
    || WORLD_DEVICE_PRESENTATIONS["world-signal"];
  const viewportRect = nodes.boardViewport.getBoundingClientRect();
  const targetRect = targetSpace.getBoundingClientRect();
  const centerX = targetRect.left - viewportRect.left + (targetRect.width / 2);
  const centerY = targetRect.top - viewportRect.top + (targetRect.height / 2);
  const reducedMotion = reducedMotionRequested();
  const duration = reducedMotion ? 280 : 980;
  const centered = "translate(-50%, -50%)";
  const pulse = positionedFx("world-device-pulse", centerX, centerY);
  pulse.dataset.variant = skin.deviceVariant;
  pulse.append(
    textElement("span", "world-device-glyph", device.glyph),
    ...Array.from({ length: 3 }, () => document.createElement("i")),
  );
  const particles = Array.from({ length: reducedMotion ? 4 : 12 }, (_, index) => {
    const particle = positionedFx("world-device-particle", centerX, centerY);
    particle.dataset.variant = skin.deviceVariant;
    particle.style.setProperty("--particle-angle", `${index * (360 / 12)}deg`);
    particle.style.setProperty(
      "--particle-distance",
      `${78 + ((index % 4) * 18)}px`,
    );
    particle.textContent = index % 3 === 0 ? "✦" : "•";
    return particle;
  });
  const banner = document.createElement("div");
  banner.className = "world-device-banner";
  banner.dataset.variant = skin.deviceVariant;
  banner.append(
    textElement("span", "", skin.announcement),
    textElement(
      "strong",
      "",
      `${skin.label} · ${changesSharedRoute ? "共享路线已改变" : "世界线索已记录"}`,
    ),
    textElement("small", "", resultCopy),
  );
  nodes.fxLayer.replaceChildren(pulse, ...particles, banner);
  nodes.fxLayer.dataset.effectId = effect.effectId;
  nodes.fxLayer.dataset.mapEffectId = effect.mapEffectRef;
  nodes.voiceState.textContent = `${movingTeam.label}触发${skin.label} · ${resultCopy}`;
  boardSounds.play(device.sound, {
    intensity: 0.9,
    pitch: [...effect.mapEffectRef].reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    ) % 3 - 1,
  });

  try {
    await Promise.all([
      animationFinished(targetSpace, reducedMotion
        ? [{ opacity: 0.72 }, { opacity: 1 }]
        : [
            { transform: "scale(1)", filter: "brightness(1)" },
            { transform: "scale(1.15)", filter: "brightness(1.55)", offset: 0.46 },
            { transform: "scale(1)", filter: "brightness(1)" },
          ], {
        duration,
        easing: "cubic-bezier(.2,.8,.2,1)",
      }),
      animationFinished(pulse, reducedMotion
        ? [
            { opacity: 0, transform: `${centered} scale(1)` },
            { opacity: 1, transform: `${centered} scale(1)` },
            { opacity: 0, transform: `${centered} scale(1)` },
          ]
        : [
            { opacity: 0, transform: `${centered} scale(.25) rotate(-24deg)` },
            { opacity: 1, transform: `${centered} scale(1.04) rotate(4deg)`, offset: 0.42 },
            { opacity: 0, transform: `${centered} scale(1.7) rotate(20deg)` },
          ], {
        duration,
        easing: "cubic-bezier(.16,.84,.25,1)",
        fill: "forwards",
      }),
      ...particles.map((particle, index) => animationFinished(particle, reducedMotion
        ? [
            { opacity: 0, transform: `${centered} scale(1)` },
            { opacity: 0.8, transform: `${centered} scale(1)` },
            { opacity: 0, transform: `${centered} scale(1)` },
          ]
        : [
            { opacity: 0, transform: `${centered} rotate(var(--particle-angle)) translateX(12px) scale(.5)` },
            { opacity: 1, offset: 0.34 },
            { opacity: 0, transform: `${centered} rotate(var(--particle-angle)) translateX(var(--particle-distance)) scale(1.25)` },
          ], {
        duration: duration - 80 + ((index % 3) * 70),
        delay: index * 18,
        easing: "cubic-bezier(.2,.7,.2,1)",
        fill: "forwards",
      })),
      animationFinished(banner, reducedMotion
        ? [
            { opacity: 0, transform: "translate(-50%, 0)" },
            { opacity: 1, transform: "translate(-50%, 0)", offset: 0.3 },
            { opacity: 0, transform: "translate(-50%, 0)" },
          ]
        : [
            { opacity: 0, transform: "translate(-50%, -20px) scale(.9)" },
            { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.28 },
            { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.76 },
            { opacity: 0, transform: "translate(-50%, -5px) scale(.97)" },
          ], {
        duration: reducedMotion ? 430 : 1220,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "forwards",
      }),
    ]);
  } finally {
    nodes.fxLayer.replaceChildren();
    delete nodes.fxLayer.dataset.effectId;
    delete nodes.fxLayer.dataset.mapEffectId;
  }
}

async function playWorldNodeReveal(
  nodeId,
  landingReward,
  movingTeam,
) {
  if (
    isCloudHarborWorldRef(activeWorldComposition.worldRef)
    || !nodeId
    || !landingReward
    || landingReward.semanticType === "ordinary"
  ) {
    return;
  }
  const presentation = presentationForExpansionNode(nodeId);
  if (!presentation) return;
  await ensureNodeVisible(nodeId);
  const targetSpace = nodes.board.querySelector(
    `.board-space[data-node-id="${nodeId}"]`,
  );
  if (!targetSpace) return;
  const viewportRect = nodes.boardViewport.getBoundingClientRect();
  const targetRect = targetSpace.getBoundingClientRect();
  const centerX = targetRect.left - viewportRect.left + (targetRect.width / 2);
  const centerY = targetRect.top - viewportRect.top + (targetRect.height / 2);
  const reducedMotion = reducedMotionRequested();
  const duration = reducedMotion ? 280 : 760;
  const centered = "translate(-50%, -50%)";
  const ring = positionedFx("world-node-reveal", centerX, centerY);
  ring.dataset.zoneId = presentation.zoneId;
  ring.dataset.semanticType = presentation.semanticType;
  ring.append(
    textElement("span", "world-node-reveal-badge", presentation.badge),
    ...Array.from({ length: 3 }, () => document.createElement("i")),
  );
  const banner = document.createElement("div");
  banner.className = "world-device-banner world-node-reveal-banner";
  banner.dataset.zoneId = presentation.zoneId;
  banner.append(
    textElement("span", "", `${presentation.zoneName} · 节点发现`),
    textElement("strong", "", presentation.label),
    textElement(
      "small",
      "",
      landingReward.firstVisit
        ? presentation.firstCopy
        : presentation.repeatCopy,
    ),
  );
  nodes.fxLayer.replaceChildren(ring, banner);
  nodes.fxLayer.dataset.nodeRevealId = nodeId;
  nodes.voiceState.textContent = (
    `${movingTeam.label}发现${presentation.label} · ${presentation.badge}`
  );
  const sound = {
    resource: "pickup",
    discovery: "world-scan",
    "collection-gallery": "world-prism",
    "route-choice": "route-open",
    "conditional-route-choice": "route-open",
    "world-transition": "world-arrival",
    "world-vista": "world-aurora",
    transport: "world-whale",
    "map-effect": "world-prism",
  }[presentation.semanticType] || "positive";
  boardSounds.play(sound, {
    intensity: landingReward.firstVisit ? 0.72 : 0.48,
    pitch: landingReward.firstVisit ? 1 : 0,
  });

  try {
    await Promise.all([
      animationFinished(targetSpace, reducedMotion
        ? [{ opacity: 0.75 }, { opacity: 1 }]
        : [
            { transform: "scale(1)", filter: "brightness(1)" },
            { transform: "scale(1.12)", filter: "brightness(1.35)", offset: 0.45 },
            { transform: "scale(1)", filter: "brightness(1)" },
          ], {
        duration,
        easing: "cubic-bezier(.2,.8,.2,1)",
      }),
      animationFinished(ring, reducedMotion
        ? [
            { opacity: 0, transform: `${centered} scale(1)` },
            { opacity: 1, transform: `${centered} scale(1)` },
            { opacity: 0, transform: `${centered} scale(1)` },
          ]
        : [
            { opacity: 0, transform: `${centered} scale(.38) rotate(-16deg)` },
            { opacity: 1, transform: `${centered} scale(1.02) rotate(3deg)`, offset: 0.38 },
            { opacity: 0, transform: `${centered} scale(1.42) rotate(18deg)` },
          ], {
        duration,
        easing: "cubic-bezier(.16,.84,.25,1)",
        fill: "forwards",
      }),
      animationFinished(banner, reducedMotion
        ? [
            { opacity: 0 },
            { opacity: 1, offset: 0.25 },
            { opacity: 0 },
          ]
        : [
            { opacity: 0, transform: "translate(-50%, -16px) scale(.92)" },
            { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.24 },
            { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.78 },
            { opacity: 0, transform: "translate(-50%, -4px) scale(.98)" },
          ], {
        duration: reducedMotion ? 420 : 1120,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "forwards",
      }),
    ]);
  } finally {
    nodes.fxLayer.replaceChildren();
    delete nodes.fxLayer.dataset.nodeRevealId;
  }
}

function boardPointToFxPoint(point) {
  const matrix = boardWorld?.getScreenCTM?.();
  const fxRect = nodes.fxLayer?.getBoundingClientRect?.();
  if (
    !matrix
    || !fxRect
    || !Number.isFinite(point?.x)
    || !Number.isFinite(point?.y)
  ) return null;
  const svgPoint = nodes.board.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const clientPoint = svgPoint.matrixTransform(matrix);
  return {
    x: clientPoint.x - fxRect.left,
    y: clientPoint.y - fxRect.top,
  };
}

function clientPointToBoardPoint(point) {
  const matrix = boardWorld?.getScreenCTM?.();
  if (
    !matrix
    || !Number.isFinite(point?.x)
    || !Number.isFinite(point?.y)
  ) return null;
  try {
    const svgPoint = nodes.board.createSVGPoint();
    svgPoint.x = point.x;
    svgPoint.y = point.y;
    const boardPoint = svgPoint.matrixTransform(matrix.inverse());
    return { x: boardPoint.x, y: boardPoint.y };
  } catch {
    return null;
  }
}

function pawnVisualBoardOffset(sourceVisual, fromNodeId, teamIndex) {
  const fromNode = nodeById.get(fromNodeId);
  const sourceCenter = elementCenter(sourceVisual);
  const sourceBoardPoint = clientPointToBoardPoint(sourceCenter);
  if (fromNode && sourceBoardPoint) {
    return {
      x: sourceBoardPoint.x - fromNode.x,
      y: sourceBoardPoint.y - fromNode.y,
    };
  }
  const seatOffset = pawnOffset(teamIndex, runtime.teams.length);
  return {
    x: seatOffset.x,
    y: seatOffset.y - 15,
  };
}

function visualMovementEdge(fromNodeId, toNodeId, preferredEdgeId = null) {
  const directEdges = visualBoardTemplate.edges.filter((edge) => (
    edge.from === fromNodeId
    && edge.to === toNodeId
  ));
  const preferred = preferredEdgeId
    ? directEdges.find((edge) => edge.id === preferredEdgeId)
    : null;
  if (preferred) return preferred;
  return directEdges.find((edge) => edgeAvailableForMapState(edge))
    || directEdges[0]
    || null;
}

function visualPawnMovementGeometry({
  fromNodeId,
  toNodeId,
  edgeId = null,
  sourceVisual,
  teamIndex,
  fractions,
}) {
  const fromNode = nodeById.get(fromNodeId);
  const toNode = nodeById.get(toNodeId);
  if (!fromNode || !toNode || !Array.isArray(fractions) || !fractions.length) {
    return { edgeId: null, points: [] };
  }
  const edge = visualMovementEdge(fromNodeId, toNodeId, edgeId);
  let boardPoints = [];
  if (edge) {
    const measurementPath = svgElement("path", { d: edgePath(edge) });
    boardPoints = pointsAlongSvgPath(measurementPath, edge, fractions);
  }
  if (boardPoints.length !== fractions.length) {
    boardPoints = fractions.map((fraction) => ({
      x: fromNode.x + ((toNode.x - fromNode.x) * fraction),
      y: fromNode.y + ((toNode.y - fromNode.y) * fraction),
    }));
  }
  boardPoints[0] = { x: fromNode.x, y: fromNode.y };
  boardPoints[boardPoints.length - 1] = { x: toNode.x, y: toNode.y };
  const visualOffset = pawnVisualBoardOffset(sourceVisual, fromNodeId, teamIndex);
  const points = boardPoints.map((point) => boardPointToFxPoint({
    x: point.x + visualOffset.x,
    y: point.y + visualOffset.y,
  }));
  return {
    edgeId: edge?.id || null,
    points: points.every(Boolean) ? points : [],
    visualOffset,
  };
}

function settlePawnStepPresentation(movingTeam, nodeId, teamIndex) {
  const position = nodeById.get(nodeId);
  const pawn = nodes.board.querySelector(
    `.pawn[data-team-id="${movingTeam.id}"]`,
  );
  const miniPawn = nodes.miniMap.querySelector(
    `.mini-pawn[data-team-id="${movingTeam.id}"]`,
  );
  const targetSpace = nodes.board.querySelector(
    `.board-space[data-node-id="${nodeId}"]`,
  );
  const routeLayer = nodes.board.querySelector(".route-layer");
  if (!position || !pawn || !miniPawn || !targetSpace || !routeLayer) {
    return false;
  }

  const offset = pawnOffset(teamIndex, runtime.teams.length);
  const transform = `translate(${position.x + offset.x} ${position.y + offset.y})`;
  pawn.style.transition = "none";
  pawn.setAttribute("transform", transform);
  pawn.dataset.nodeId = nodeId;
  const pawnMotion = pawn.querySelector(".pawn-motion");
  if (pawnMotion) pawnMotion.style.opacity = "";
  requestAnimationFrame(() => {
    if (pawn.isConnected) pawn.style.transition = "";
  });

  miniPawn.setAttribute("transform", transform);
  miniPawn.dataset.nodeId = nodeId;

  nodes.board.querySelectorAll(".board-space.is-current")
    .forEach((space) => space.classList.remove("is-current"));
  targetSpace.classList.add("is-current", "is-visited");

  routeLayer.querySelectorAll(".route-active-flow")
    .forEach((path) => path.remove());
  visibleBoardEdges()
    .filter((edge) => edge.from === nodeId)
    .forEach((edge) => {
      routeLayer.append(svgElement("path", {
        d: edgePath(edge),
        class: "route-active-flow",
        "data-air-crossing": String(isAirCrossingEdge(theme.scenePresentation, edge.id)),
        "data-edge-id": edge.id,
      }));
    });
  return true;
}

async function playPawnStep(effect, movingTeam, {
  stepNumber = 1,
  totalSteps = 1,
  recordVisit = true,
} = {}) {
  const sourceNodeId = visualNodeId || movingTeam.nodeId;
  const travelEdge = visualMovementEdge(sourceNodeId, effect.nodeId, effect.edgeId);
  const airCrossing = isAirCrossingEdge(groundedSceneSelection().scene, travelEdge?.id);
  // Follow only when the target leaves the safe view; camera and hop run together.
  const reducedStep = reducedMotionRequested();
  const cameraFlight = airCrossing
    ? centerTransportPair(sourceNodeId, effect.nodeId) : ensureNodeVisible(effect.nodeId);
  if (reducedStep) await cameraFlight;
  const sourcePawn = nodes.board.querySelector(
    `.pawn[data-team-id="${movingTeam.id}"] .pawn-motion`,
  );
  const sourceVisual = sourcePawn?.querySelector(".pawn-character-visual")
    || sourcePawn;
  const teamIndex = Math.max(
    0,
    runtime.teams.findIndex((team) => team.id === movingTeam.id),
  );
  const fractions = reducedMotionRequested()
    ? [0, 1]
    : airCrossing ? [0, .12, .28, .44, .6, .76, .9, 1] : [0, 0.46, 0.82, 1];
  const movement = visualPawnMovementGeometry({
    fromNodeId: sourceNodeId,
    toNodeId: effect.nodeId,
    edgeId: effect.edgeId,
    sourceVisual,
    teamIndex,
    fractions,
  });
  if (!sourcePawn || movement.points.length !== fractions.length) {
    visualNodeId = effect.nodeId;
    if (recordVisit) visitedNodeIds.add(effect.nodeId);
    renderBoard();
    await Promise.all([cameraFlight, sleep(170)]);
    return;
  }

  const character = characterProfileForSeatIndex(teamIndex);
  const from = movement.points[0];
  const to = movement.points.at(-1);
  const reducedMotion = reducedMotionRequested();
  const pawn = positionedFx(
    "step-pawn",
    reducedMotion ? to.x : from.x,
    reducedMotion ? to.y : from.y,
  );
  appendHtmlCharacterPawnArt(pawn, character, "step-pawn-art");
  pawn.dataset.stepLabel = `${airCrossing ? "跃过云瀑 · " : ""}${stepNumber}/${totalSteps} 格`;
  pawn.dataset.travelMode = airCrossing ? "air-crossing" : "walk";
  pawn.style.setProperty("--step-color", character.accent);
  pawn.dataset.teamId = movingTeam.id;
  pawn.dataset.sourceNodeId = sourceNodeId;
  pawn.dataset.targetNodeId = effect.nodeId;
  pawn.dataset.coordinateSource = "published-visual-board";
  pawn.dataset.visualFromX = String(Math.round(from.x * 1000) / 1000);
  pawn.dataset.visualFromY = String(Math.round(from.y * 1000) / 1000);
  pawn.dataset.visualToX = String(Math.round(to.x * 1000) / 1000);
  pawn.dataset.visualToY = String(Math.round(to.y * 1000) / 1000);
  if (movement.edgeId) pawn.dataset.visualEdgeId = movement.edgeId;
  const centered = "translate(-50%, -50%)";
  const duration = reducedMotion ? 190 : airCrossing ? 620 : 320;
  const frames = airCrossing ? airCrossingFrames(movement.points, fractions, { reducedMotion }) : reducedMotion
    ? [
        { opacity: 0.25, transform: `${centered} scale(.98)` },
        { opacity: 1, transform: `${centered} scale(1)` },
      ]
    : movement.points.map((point, index) => {
        const progress = fractions[index];
        const lift = Math.sin(progress * Math.PI) * 28;
        const rotation = Math.sin(progress * Math.PI * 2) * -5;
        const scale = progress === 0 || progress === 1
          ? 1
          : 1 + (Math.sin(progress * Math.PI) * 0.08);
        return {
          offset: progress,
          transform: (
            `${centered} translate3d(${point.x - from.x}px, `
            + `${point.y - from.y - lift}px, 0) `
            + `rotate(${rotation}deg) scale(${scale})`
          ),
        };
      });

  nodes.fxLayer.dataset.effectId = effect.effectId || `pawn-step:${stepNumber}`;
  // The HTML pawn is in screen coordinates. Compensate its parent for the
  // camera translation so it stays attached to the moving board during a hop.
  const cameraAnchor = document.createElement("div");
  Object.assign(cameraAnchor.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  cameraAnchor.append(pawn);
  nodes.fxLayer.append(cameraAnchor);
  const sourcePosition = nodeById.get(sourceNodeId);
  const anchorPoint = sourcePosition && boardPointToFxPoint(sourcePosition);
  let tracking = true;
  let trackingFrame = null;
  const trackCamera = () => {
    if (!tracking) return;
    const currentPoint = sourcePosition && boardPointToFxPoint(sourcePosition);
    if (anchorPoint && currentPoint) cameraAnchor.style.transform =
      `translate3d(${currentPoint.x - anchorPoint.x}px, ${currentPoint.y - anchorPoint.y}px, 0)`;
    trackingFrame = requestAnimationFrame(trackCamera);
  };
  if (!reducedMotion) trackCamera();
  sourcePawn.style.opacity = "0";
  boardSounds.play("pawn-hop", {
    pitch: ((stepNumber - 1) % 4) - 1,
    intensity: stepNumber === totalSteps ? 0.82 : 0.64,
  });
  try {
    await Promise.all([cameraFlight, animationFinished(pawn, frames, {
      duration,
      easing: reducedMotion ? "linear" : "cubic-bezier(.28,.72,.25,1)",
      fill: "forwards",
    })]);
  } finally {
    visualNodeId = effect.nodeId;
    if (recordVisit) visitedNodeIds.add(effect.nodeId);
    tracking = false;
    if (trackingFrame !== null) cancelAnimationFrame(trackingFrame);
    pawn.remove();
    cameraAnchor.remove();
    delete nodes.fxLayer.dataset.effectId;
    if (!settlePawnStepPresentation(movingTeam, effect.nodeId, teamIndex)) {
      renderBoard();
    }
  }
}

async function playHarborFoghorn(effect, movingTeam) {
  const targetMode = effect.targetMode === "fairy_hold" ? "fairy_hold" : "reveal";
  const targetNodeIds = targetMode === "fairy_hold"
    ? [fairyState.anchorId || LEVEL_ONE.anchorNodeIds[0]]
    : [
        LEVEL_ONE.anchorNodeIds[0],
        LEVEL_ONE.cloudfallGateNodeId,
      ];
  const targetNodeId = targetNodeIds[0];
  await centerTransportPair(effect.nodeId, targetNodeId);
  const sourceSpace = nodes.board.querySelector(
    `.board-space[data-node-id="${effect.nodeId}"]`,
  );
  const device = nodes.board.querySelector(
    `.map-effect-device[data-map-effect-node-id="${effect.nodeId}"] .harbor-terrain-glow`,
  );
  const facility = setFacilityPresentationPhase(device, "active");
  const targetFairy = targetMode === "fairy_hold"
    ? nodes.board.querySelector(
        `.fairy-entity[data-fairy-anchor-id="${targetNodeId}"]`,
      )
    : null;
  const targetElements = targetNodeIds
    .map((nodeId, index) => (
      {
        nodeId,
        element: (
          (index === 0 ? targetFairy : null)
          || nodes.board.querySelector(`.board-space[data-node-id="${nodeId}"]`)
        ),
      }
    ))
    .filter(({ element }) => Boolean(element));
  if (!sourceSpace || !targetElements.length) return;

  const viewportRect = nodes.boardViewport.getBoundingClientRect();
  const sourceRect = sourceSpace.getBoundingClientRect();
  const sourceX = sourceRect.left - viewportRect.left + (sourceRect.width / 2);
  const sourceY = sourceRect.top - viewportRect.top + (sourceRect.height / 2) - 22;
  const targetPoints = targetElements.map(({ element, nodeId }) => {
    const rect = element.getBoundingClientRect();
    return {
      element,
      nodeId,
      x: rect.left - viewportRect.left + (rect.width / 2),
      y: rect.top - viewportRect.top + (rect.height / 2),
    };
  });
  const [{ x: targetX, y: targetY }] = targetPoints;
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const skin = mapEffectSkin(effect.mapEffectRef);
  const reducedMotion = reducedMotionRequested();
  const fullAnimation = effect.firstTime !== false;
  const mainDuration = reducedMotion ? 300 : fullAnimation ? 1080 : 720;
  const waveDuration = reducedMotion ? 230 : fullAnimation ? 760 : 480;
  const mistDuration = reducedMotion ? 250 : fullAnimation ? 560 : 340;
  const centered = "translate(-50%, -50%)";

  nodes.fxLayer.replaceChildren();
  nodes.fxLayer.dataset.effectId = effect.effectId;
  nodes.fxLayer.dataset.mapEffectId = effect.mapEffectRef;

  const signalSvg = svgElement("svg", {
    class: "harbor-foghorn-signal",
    viewBox: `0 0 ${viewportRect.width} ${viewportRect.height}`,
    preserveAspectRatio: "none",
  });
  const signalPaths = targetPoints.map((target, index) => svgElement("path", {
    d: (
      `M ${sourceX} ${sourceY} `
      + `Q ${(sourceX + target.x) / 2} ${Math.min(sourceY, target.y) - 34 - (index * 12)} `
      + `${target.x} ${target.y}`
    ),
    "data-signal-target-node-id": target.nodeId,
  }));
  signalSvg.append(...signalPaths);

  const waves = Array.from({ length: 3 }, (_, index) => {
    const wave = positionedFx("harbor-foghorn-wave", sourceX, sourceY);
    wave.dataset.waveIndex = String(index + 1);
    return wave;
  });
  const reticles = targetPoints.map((target, index) => {
    const reticle = positionedFx("harbor-foghorn-reticle", target.x, target.y);
    reticle.dataset.mapEffectId = effect.mapEffectRef;
    reticle.dataset.sourceNodeId = effect.nodeId;
    reticle.dataset.targetNodeId = target.nodeId;
    reticle.append(
      textElement(
        "span",
        "harbor-foghorn-lock-icon",
        targetMode === "fairy_hold" ? "◎" : index === 0 ? "⚓" : "◇",
      ),
      textElement(
        "strong",
        "",
        index === 0 ? "航标设施" : "前方设施",
      ),
    );
    return reticle;
  });

  const mistOffsets = [
    { x: -38, y: 18 },
    { x: 4, y: -27 },
    { x: 42, y: 14 },
  ];
  const mistPuffs = mistOffsets.map((offset, index) => {
    const puff = positionedFx(
      "harbor-foghorn-mist",
      targetX + offset.x,
      targetY + offset.y,
    );
    puff.dataset.mistIndex = String(index + 1);
    puff.append(
      document.createElement("i"),
      document.createElement("i"),
      document.createElement("i"),
    );
    return puff;
  });

  const banner = document.createElement("div");
  banner.className = "harbor-foghorn-banner";
  banner.dataset.mapEffectId = effect.mapEffectRef;
  banner.append(
    textElement(
      "span",
      "",
      "局部云雾正在退开",
    ),
    textElement(
      "strong",
      "",
      `${skin.label} · 前方云阶与航道已显影`,
    ),
  );

  nodes.fxLayer.append(signalSvg, ...waves, ...mistPuffs, ...reticles, banner);
  nodes.voiceState.textContent = `${skin.label}亮起 · 前方云阶与航道已经显影`;
  boardSounds.play("harbor-foghorn", {
    intensity: fullAnimation ? 0.88 : 0.72,
    durationScale: facilitySoundDurationScale(fullAnimation, 0.67, 0.26),
  });

  if (device) device.style.willChange = "transform";
  const animations = [
    ...signalPaths.map((signalPath, index) => animationFinished(signalPath, reducedMotion
      ? [
          { opacity: 0 },
          { opacity: 0.9, offset: 0.35 },
          { opacity: 0 },
        ]
      : [
          { opacity: 0, strokeDashoffset: 190 },
          { opacity: 1, strokeDashoffset: 0, offset: 0.56 },
          { opacity: 0, strokeDashoffset: -55 },
        ], {
      duration: mainDuration,
      delay: presentationDuration(index * 80),
      easing: "cubic-bezier(.2,.78,.2,1)",
      fill: "forwards",
    })),
    animationFinished(device, reducedMotion
      ? [
          { opacity: 0.72 },
          { opacity: 1 },
          { opacity: 0.86 },
        ]
      : [
          { opacity: 0, transform: "scale(.85)" },
          { opacity: .85, transform: "scale(1.16)", offset: .5 },
          { opacity: 0, transform: "scale(1.25)" },
        ], {
      duration: reducedMotion ? 240 : fullAnimation ? 520 : 360,
      easing: "cubic-bezier(.2,.8,.2,1)",
    }),
    ...reticles.map((reticle, index) => animationFinished(reticle, reducedMotion
      ? [
          { opacity: 0, transform: `${centered} scale(1)` },
          { opacity: 1, transform: `${centered} scale(1)`, offset: 0.35 },
          { opacity: 1, transform: `${centered} scale(1)`, offset: 0.78 },
          { opacity: 0, transform: `${centered} scale(1)` },
        ]
      : [
          { opacity: 0, transform: `${centered} rotate(-18deg) scale(.55)` },
          { opacity: 1, transform: `${centered} rotate(7deg) scale(1.12)`, offset: 0.36 },
          { opacity: 1, transform: `${centered} rotate(0deg) scale(1)`, offset: 0.78 },
          { opacity: 0, transform: `${centered} rotate(0deg) scale(1.18)` },
        ], {
      duration: mainDuration,
      delay: presentationDuration(index * 90),
      easing: "cubic-bezier(.2,.78,.2,1)",
      fill: "forwards",
    })),
    animationFinished(banner, reducedMotion
      ? [
          { opacity: 0, transform: "translate(-50%, 0)" },
          { opacity: 1, transform: "translate(-50%, 0)", offset: 0.3 },
          { opacity: 1, transform: "translate(-50%, 0)", offset: 0.78 },
          { opacity: 0, transform: "translate(-50%, 0)" },
        ]
      : [
          { opacity: 0, transform: "translate(-50%, -16px) scale(.92)" },
          { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.28 },
          { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.78 },
          { opacity: 0, transform: "translate(-50%, -4px) scale(.98)" },
        ], {
      duration: mainDuration,
      easing: "cubic-bezier(.2,.78,.2,1)",
      fill: "forwards",
    }),
  ];

  waves.forEach((wave, index) => {
    animations.push(animationFinished(wave, reducedMotion
      ? [
          { opacity: 0, transform: `${centered} scale(1)` },
          { opacity: 0.72, transform: `${centered} scale(1)`, offset: 0.42 },
          { opacity: 0, transform: `${centered} scale(1)` },
        ]
      : [
          { opacity: 0, transform: `${centered} translate3d(0, 0, 0) scale(.35)` },
          {
            opacity: 0.92,
            offset: 0.28,
            transform: `${centered} translate3d(${deltaX * 0.28}px, ${deltaY * 0.28}px, 0) scale(.9)`,
          },
          {
            opacity: 0,
            transform: `${centered} translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.65)`,
          },
        ], {
      duration: waveDuration,
      delay: presentationDuration(index * (fullAnimation ? 90 : 60)),
      easing: "cubic-bezier(.18,.7,.2,1)",
      fill: "forwards",
    }));
  });

  mistPuffs.forEach((puff, index) => {
    animations.push(animationFinished(puff, reducedMotion
      ? [
          { opacity: 0, transform: `${centered} scale(1)` },
          { opacity: 0.65, transform: `${centered} scale(1)`, offset: 0.5 },
          { opacity: 0, transform: `${centered} scale(1)` },
        ]
      : [
          { opacity: 0.88, transform: `${centered} translateY(0) scale(1)` },
          {
            opacity: 0,
            transform: `${centered} translateY(${-22 - (index * 5)}px) scale(${1.28 + (index * 0.08)})`,
          },
        ], {
      duration: mistDuration,
      delay: presentationDuration(
        (fullAnimation ? 320 : 200) + (index * (fullAnimation ? 40 : 30)),
      ),
      easing: "ease-out",
      fill: "forwards",
    }));
  });

  const fairyBody = targetFairy?.querySelector(".fairy-body");
  if (fairyBody) {
    animations.push(animationFinished(fairyBody, reducedMotion
      ? [
          { opacity: 0.78 },
          { opacity: 1 },
          { opacity: 0.88 },
        ]
      : [
          { transform: "rotate(0deg) scale(1)" },
          { transform: "rotate(-7deg) scale(1.08)", offset: 0.32 },
          { transform: "rotate(6deg) scale(.96)", offset: 0.58 },
          { transform: "rotate(0deg) scale(1)" },
        ], {
      duration: reducedMotion ? 260 : fullAnimation ? 500 : 320,
      delay: presentationDuration(fullAnimation ? 420 : 260),
      easing: "cubic-bezier(.2,.8,.2,1)",
    }));
  }

  try {
    await Promise.all(animations);
    boardSounds.play("route-confirm", { intensity: 0.64, pitch: -1 });
    nodes.voiceState.textContent = (
      `${movingTeam.label}启动${skin.label} · 港口航道信息已经显影`
    );
  } finally {
    if (device) device.style.willChange = "";
    setFacilityPresentationPhase(facility, "settled");
    nodes.fxLayer.replaceChildren();
    delete nodes.fxLayer.dataset.effectId;
    delete nodes.fxLayer.dataset.mapEffectId;
  }
}

async function playCommittedRouteEventConfirmation(effect, movingTeam) {
  const meta = {
    kicker: "BON VOYAGE · 经过设施已确认",
    title: `${movingTeam.label} 已离开启航海湾`,
    voice: "离港经过事件已安全记入 · 继续显示当前路线",
    sound: "departure-beacon",
  };
  const banner = document.createElement("div");
  banner.className = "harbor-item-banner committed-route-event-banner";
  banner.dataset.routeEventType = effect.type;
  banner.append(
    textElement("span", "", meta.kicker),
    textElement("strong", "", meta.title),
  );
  nodes.fxLayer.replaceChildren(banner);
  nodes.fxLayer.dataset.effectId = effect.effectId;
  boardSounds.play(meta.sound, {
    intensity: 0.68,
    durationScale: reducedMotionRequested() ? 0.22 : 0.56,
  });
  nodes.voiceState.textContent = meta.voice;
  try {
    await animationFinished(banner, [
      { opacity: 0, transform: "translate(-50%, -8px) scale(.96)" },
      { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.24 },
      { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.76 },
      { opacity: 0, transform: "translate(-50%, -3px) scale(.99)" },
    ], {
      duration: reducedMotionRequested() ? 220 : 620,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "forwards",
    });
  } finally {
    nodes.fxLayer.replaceChildren();
    delete nodes.fxLayer.dataset.effectId;
  }
}

async function playCloudfallGate(effect, movingTeam) {
  await centerTransportPair(effect.nodeId, "n14");
  const glow = nodes.board.querySelector(
    `.map-effect-device[data-map-effect-node-id="${effect.nodeId}"] .harbor-terrain-glow`,
  );
  const facility = setFacilityPresentationPhase(glow, "active");
  const cloudSteps = [...nodes.board.querySelectorAll(
    `.cloud-stair-route[data-edge-id="e14c"] .cloud-stair-step`,
  )];
  const reducedMotion = reducedMotionRequested();
  const fullAnimation = effect.firstTime !== false;
  const duration = reducedMotion ? 260 : fullAnimation ? 1180 : 680;
  const banner = document.createElement("div");
  banner.className = "harbor-item-banner cloudfall-gate-banner";
  banner.dataset.mapEffectId = effect.mapEffectRef;
  banner.append(
    textElement("span", "", fullAnimation ? "CLOUD ROUTE OPEN · 云瀑改道" : "ROUTE READY · 云阶仍然开放"),
    textElement("strong", "", fullAnimation
      ? `${movingTeam.label} 为全班开启了云阶捷径`
      : "云阶捷径持续开放"),
  );
  nodes.fxLayer.replaceChildren(banner);
  nodes.fxLayer.dataset.effectId = effect.effectId;
  boardSounds.play("cloudfall-gate", {
    intensity: fullAnimation ? 0.88 : 0.7,
    durationScale: facilitySoundDurationScale(fullAnimation, 0.58, 0.22),
  });
  nodes.voiceState.textContent = fullAnimation
    ? "云阶入口亮起 · 新的云阶航线形成"
    : "云阶入口点亮 · 云阶捷径仍然开放";
  const animations = [
    animationFinished(glow, reducedMotion
      ? [{ opacity: .72 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: "scale(.9)" },
          { opacity: .8, transform: "scale(1.16)", offset: .6 },
          { opacity: .42, transform: "scale(1)" },
        ], {
      duration,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "forwards",
    }),
    animationFinished(banner, [
      { opacity: 0, transform: "translate(-50%, -12px) scale(.94)" },
      { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.2 },
      { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.8 },
      { opacity: 0, transform: "translate(-50%, -4px) scale(.98)" },
    ], { duration, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }),
  ];
  cloudSteps.forEach((step, index) => {
    animations.push(animationFinished(step, reducedMotion
      ? [{ opacity: .55 }, { opacity: 1 }]
      : [
          { opacity: .12, transform: "scale(.58)" },
          { opacity: 1, transform: "scale(1.14)", offset: 0.6 },
          { opacity: 1, transform: "scale(1)" },
        ], {
      duration: Math.max(220, duration - (index * 90)),
      delay: presentationDuration(index * (fullAnimation ? 90 : 40)),
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "forwards",
    }));
  });
  try {
    await Promise.all(animations);
  } finally {
    setFacilityPresentationPhase(facility, "settled");
    nodes.fxLayer.replaceChildren();
    delete nodes.fxLayer.dataset.effectId;
  }
}

async function playDepartureBeacon(effect, movingTeam) {
  await centerTransportPair(effect.fromNodeId, effect.toNodeId);
  const device = nodes.board.querySelector(".departure-beacon-device");
  const facility = setFacilityPresentationPhase(device?.querySelector(".harbor-facility"), "active");
  const glow = device?.querySelector(".harbor-terrain-glow");
  const lights = device?.querySelector(".harbor-departure-lights");
  const reducedMotion = reducedMotionRequested();
  const fullAnimation = effect.firstTime !== false;
  const duration = reducedMotion ? 260 : fullAnimation ? 1080 : 650;
  const banner = document.createElement("div");
  banner.className = "harbor-item-banner departure-beacon-banner";
  banner.append(
    textElement("span", "", fullAnimation ? "BON VOYAGE · 启航海湾通航" : "航道确认 · 已进入风帆高地"),
    textElement("strong", "", fullAnimation
      ? `${movingTeam.label} 点亮航道，向下一片云岸出发！`
      : `${movingTeam.label} 已离开启航海湾`),
  );
  nodes.fxLayer.replaceChildren(banner);
  nodes.fxLayer.dataset.effectId = effect.effectId;
  boardSounds.play("departure-beacon", {
    intensity: fullAnimation ? 0.9 : 0.7,
    durationScale: facilitySoundDurationScale(fullAnimation, 0.47, 0.2),
  });
  nodes.voiceState.textContent = "离港光点亮起 · 航道通向风帆高地";
  try {
    await Promise.all([
      animationFinished(glow, [{ opacity: 0 }, { opacity: .65, offset: .4 }, { opacity: 0 }], { duration, easing: "ease-in-out" }),
      animationFinished(lights, reducedMotion
        ? [{ opacity: 0 }, { opacity: 1, offset: .5 }, { opacity: 0 }]
        : [{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(-8px)", offset: .55 }, { opacity: 0, transform: "translateY(-16px)" }],
      { duration, easing: "ease-out" }),
      animationFinished(banner, [
        { opacity: 0, transform: "translate(-50%, -8px) scale(.97)" },
        { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: .2 },
        { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: .8 },
        { opacity: 0, transform: "translate(-50%, -4px) scale(.99)" },
      ], { duration, easing: "ease-out", fill: "forwards" }),
    ]);
  } finally {
    setFacilityPresentationPhase(facility, "settled");
    nodes.fxLayer.replaceChildren();
    delete nodes.fxLayer.dataset.effectId;
  }
}

async function playLandingConfirmation(teamId, nodeId) {
  await ensureNodeVisible(nodeId);
  const landingSpace = nodes.board.querySelector(
    `.board-space[data-node-id="${nodeId}"]`,
  );
  const pawn = nodes.board.querySelector(
    `.pawn[data-team-id="${teamId}"] .pawn-motion`,
  );
  if (!pawn) return;
  const viewportRect = nodes.boardViewport.getBoundingClientRect();
  const pawnRect = pawn.getBoundingClientRect();
  const centerX = pawnRect.left - viewportRect.left + (pawnRect.width / 2);
  const centerY = pawnRect.top - viewportRect.top + (pawnRect.height / 2);
  const ring = positionedFx("landing-confirmation", centerX, centerY);
  ring.dataset.teamId = teamId;
  ring.dataset.targetNodeId = nodeId;
  landingSpace?.classList.add("is-landing");
  nodes.fxLayer.append(ring);
  const centered = "translate(-50%, -50%)";
  const reducedMotion = reducedMotionRequested();
  const pawnFrames = reducedMotion
    ? [
        { opacity: 0.65, transform: "translateY(0) scale(1)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ]
    : [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(-16px) scale(1.12)", offset: 0.42 },
        { transform: "translateY(0) scale(1)" },
      ];
  const ringFrames = reducedMotion
    ? [
        { opacity: 0, transform: `${centered} scale(1)` },
        { opacity: 1, transform: `${centered} scale(1)`, offset: 0.45 },
        { opacity: 0, transform: `${centered} scale(1)` },
      ]
    : [
        { opacity: 0, transform: `${centered} scale(.3)` },
        { opacity: 1, transform: `${centered} scale(1)`, offset: 0.35 },
        { opacity: 0, transform: `${centered} scale(2.05)` },
      ];
  boardSounds.play("pawn-land", {
    pitch: Math.max(-2, runtime.teams.findIndex(({ id }) => id === teamId) - 1),
    intensity: 0.74,
  });
  try {
    await Promise.all([
      animationFinished(pawn, pawnFrames, {
        duration: reducedMotion ? 170 : 520,
        easing: "cubic-bezier(.2,.8,.2,1)",
      }),
      animationFinished(ring, ringFrames, {
        duration: reducedMotion ? 180 : 620,
        easing: "ease-out",
        fill: "forwards",
      }),
    ]);
  } finally {
    landingSpace?.classList.remove("is-landing");
    ring.remove();
  }
}

function transportNeedsCameraCut(effect) {
  const from = nodeById.get(effect.fromNodeId);
  const to = nodeById.get(effect.toNodeId);
  if (!from || !to) return false;
  const viewport = viewportSize(cameraBoardTemplate());
  return (
    Math.abs(to.x - from.x) > viewport.width * 0.72
    || Math.abs(to.y - from.y) > viewport.height * 0.62
  );
}

function rayExitPoint(start, direction, viewportRect, margin = 80) {
  const length = Math.hypot(direction.x, direction.y);
  if (length < 0.001) {
    return { x: viewportRect.width + margin, y: start.y };
  }
  const unit = { x: direction.x / length, y: direction.y / length };
  const distances = [];
  if (unit.x > 0) distances.push((viewportRect.width + margin - start.x) / unit.x);
  if (unit.x < 0) distances.push((-margin - start.x) / unit.x);
  if (unit.y > 0) distances.push((viewportRect.height + margin - start.y) / unit.y);
  if (unit.y < 0) distances.push((-margin - start.y) / unit.y);
  const exitDistance = Math.min(...distances.filter((distance) => distance > 0));
  return {
    x: start.x + (unit.x * exitDistance),
    y: start.y + (unit.y * exitDistance),
  };
}

async function playLongTransportMove(effect, movingTeam) {
  const fromNode = nodeById.get(effect.fromNodeId);
  const toNode = nodeById.get(effect.toNodeId);
  if (!fromNode || !toNode) {
    visualNodeId = effect.toNodeId;
    renderBoard();
    return;
  }

  await animateCameraTo(centerCameraOnPoint(fromNode, cameraBoardTemplate()), { animate: true });
  const sourcePawn = nodes.board.querySelector(
    `.pawn[data-team-id="${movingTeam.id}"] .pawn-motion`,
  );
  const launcher = nodes.board.querySelector(
    `.launcher-device[data-transport-node-id="${effect.fromNodeId}"] .launcher-motion`,
  );
  const launcherFacility = setFacilityPresentationPhase(launcher, "active");
  const teamIndex = runtime.teams.findIndex((team) => team.id === movingTeam.id);
  const sourceVisual = sourcePawn?.querySelector(".pawn-character-visual")
    || sourcePawn;
  const movement = visualPawnMovementGeometry({
    fromNodeId: effect.fromNodeId,
    toNodeId: effect.toNodeId,
    sourceVisual,
    teamIndex: Math.max(0, teamIndex),
    fractions: [0, 1],
  });
  if (!sourcePawn || movement.points.length !== 2) {
    visualNodeId = effect.toNodeId;
    await animateCameraTo(centerCameraOnPoint(toNode, cameraBoardTemplate()), { animate: true });
    renderBoard();
    return;
  }

  const viewportRect = nodes.fxLayer.getBoundingClientRect();
  const from = movement.points[0];
  const exit = rayExitPoint(from, {
    x: toNode.x - fromNode.x,
    y: toNode.y - fromNode.y,
  }, viewportRect);
  const character = characterProfileForSeatIndex(Math.max(0, teamIndex));
  const skin = theme.transportSkins[effect.transportProfileRef] || {
    announcement: "发现地图捷径！",
    label: "跳步发射器",
  };
  const reducedMotion = reducedMotionRequested();
  const fullAnimation = effect.firstTime !== false;
  const chargeSoundScale = reducedMotion ? 0.18 : fullAnimation ? 0.88 : 0.5;
  const launchSoundScale = reducedMotion ? 0.15 : fullAnimation ? 0.85 : 0.55;
  const landSoundScale = reducedMotion ? 0.6 : fullAnimation ? 1 : 0.95;
  const loadDuration = reducedMotion ? 60 : fullAnimation ? 240 : 140;
  const exitDuration = reducedMotion ? 110 : fullAnimation ? 540 : 360;
  const landingDuration = reducedMotion ? 120 : fullAnimation ? 330 : 190;

  nodes.fxLayer.replaceChildren();
  nodes.fxLayer.dataset.effectId = effect.effectId;
  const banner = document.createElement("div");
  banner.className = "launcher-banner";
  const bannerKicker = document.createElement("span");
  bannerKicker.textContent = skin.announcement;
  const bannerTitle = document.createElement("strong");
  bannerTitle.textContent = `${skin.label} · 跨区飞行`;
  banner.append(bannerKicker, bannerTitle);
  const flightPawn = positionedFx(
    `flight-pawn team-${Math.max(0, teamIndex) % PLAYER_PROFILES.length}`,
    from.x,
    from.y,
  );
  appendHtmlCharacterPawnArt(flightPawn, character, "flight-pawn-art");
  const flash = positionedFx("launcher-flash", from.x, from.y);
  nodes.fxLayer.append(flash, flightPawn, banner);

  sourcePawn.style.opacity = "0";
  flightPawn.style.willChange = "transform, opacity";
  if (launcher) launcher.style.willChange = "transform";
  nodes.voiceState.textContent = `${skin.label}已锁定远方落点 · 准备跨区`;

  const centered = "translate(-50%, -50%)";
  boardSounds.play("signal-cannon-charge", {
    intensity: fullAnimation ? 0.78 : 0.62,
    durationScale: chargeSoundScale,
  });
  try {
    await Promise.all([
      animationFinished(flightPawn, [
        { transform: `${centered} scale(1)` },
        { transform: `${centered} translateY(8px) scale(.82, 1.08)` },
        { transform: `${centered} scale(.94)` },
      ], { duration: loadDuration, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }),
      animationFinished(launcher, [
        { transform: "translateX(0) rotate(0deg)" },
        { transform: "translateX(-7px) rotate(-4deg)" },
        { transform: "translateX(0) rotate(0deg)" },
      ], { duration: loadDuration, easing: "cubic-bezier(.2,.8,.2,1)" }),
      animationFinished(banner, [
        { opacity: 0, transform: "translate(-50%, -8px) scale(.94)" },
        { opacity: 1, transform: "translate(-50%, 0) scale(1)" },
      ], { duration: loadDuration, easing: "ease-out", fill: "forwards" }),
    ]);

    boardSounds.play("signal-cannon-launch", {
      intensity: fullAnimation ? 0.94 : 0.76,
      durationScale: launchSoundScale,
    });
    const exitDelta = { x: exit.x - from.x, y: exit.y - from.y };
    const exitFrames = reducedMotion
      ? [
        { opacity: 1, transform: `${centered} scale(1)` },
        { opacity: 0, transform: `${centered} scale(.9)` },
      ]
      : [
        { opacity: 1, transform: `${centered} translate3d(0, 0, 0) rotate(0deg)` },
        {
          opacity: 1,
          transform: `${centered} translate3d(${exitDelta.x}px, ${exitDelta.y}px, 0) rotate(16deg) scale(1.08)`,
        },
      ];
    await Promise.all([
      animationFinished(flightPawn, exitFrames, {
        duration: exitDuration,
        easing: reducedMotion ? "ease-out" : "cubic-bezier(.28,.7,.35,1)",
        fill: "forwards",
      }),
      animationFinished(flash, [
        { opacity: 0, transform: `${centered} scale(.2)` },
        { opacity: 1, transform: `${centered} scale(1.3)`, offset: 0.3 },
        { opacity: 0, transform: `${centered} scale(2.2)` },
      ], { duration: reducedMotion ? 90 : 360, easing: "ease-out", fill: "forwards" }),
    ]);

    flightPawn.remove();
    flash.remove();
    bannerTitle.textContent = `${skin.label} · 镜头追踪落点`;
    nodes.voiceState.textContent = `${skin.label}正在穿越地图…`;
    await animateCameraTo(centerCameraOnPoint(toNode, cameraBoardTemplate()), {
      animate: !reducedMotion,
      duration: 430,
    });

    const target = boardPointToFxPoint({
      x: toNode.x + movement.visualOffset.x,
      y: toNode.y + movement.visualOffset.y,
    });
    if (!target) return;
    const landingPawn = positionedFx(
      `flight-pawn team-${Math.max(0, teamIndex) % PLAYER_PROFILES.length}`,
      target.x,
      target.y,
    );
    appendHtmlCharacterPawnArt(landingPawn, character, "flight-pawn-art");
    const burst = positionedFx("landing-burst", target.x, target.y);
    nodes.fxLayer.append(burst, landingPawn);
    boardSounds.play("signal-cannon-land", {
      intensity: fullAnimation ? 0.78 : 0.64,
      durationScale: landSoundScale,
    });
    await Promise.all([
      animationFinished(landingPawn, [
        { opacity: 0, transform: `${centered} scale(.72)` },
        { opacity: 1, transform: `${centered} scale(1.08)`, offset: 0.68 },
        { opacity: 1, transform: `${centered} scale(1)` },
      ], { duration: landingDuration, easing: "ease-out", fill: "forwards" }),
      animationFinished(burst, [
        { opacity: 0, transform: `${centered} scale(.2)` },
        { opacity: 1, transform: `${centered} scale(1.15)`, offset: 0.42 },
        { opacity: 0, transform: `${centered} scale(2)` },
      ], { duration: landingDuration, easing: "ease-out", fill: "forwards" }),
    ]);
  } finally {
    sourcePawn.style.opacity = "";
    flightPawn.style.willChange = "";
    if (launcher) launcher.style.willChange = "";
    setFacilityPresentationPhase(launcherFacility, "settled");
    visualNodeId = effect.toNodeId;
    visitedNodeIds.add(effect.toNodeId);
    nodes.fxLayer.replaceChildren();
    delete nodes.fxLayer.dataset.effectId;
    renderBoard();
  }
}

async function playTransportMove(effect, movingTeam) {
  if (transportNeedsCameraCut(effect)) {
    await playLongTransportMove(effect, movingTeam);
    return;
  }
  await centerTransportPair(effect.fromNodeId, effect.toNodeId);
  const sourceSpace = nodes.board.querySelector(
    `.board-space[data-node-id="${effect.fromNodeId}"]`,
  );
  const targetSpace = nodes.board.querySelector(
    `.board-space[data-node-id="${effect.toNodeId}"]`,
  );
  const sourcePawn = nodes.board.querySelector(
    `.pawn[data-team-id="${movingTeam.id}"] .pawn-motion`,
  );
  const launcher = nodes.board.querySelector(
    `.launcher-device[data-transport-node-id="${effect.fromNodeId}"] .launcher-motion`,
  );
  const launcherFacility = setFacilityPresentationPhase(launcher, "active");

  const teamIndex = runtime.teams.findIndex((team) => team.id === movingTeam.id);
  const sourceVisual = sourcePawn?.querySelector(".pawn-character-visual")
    || sourcePawn;
  const movement = visualPawnMovementGeometry({
    fromNodeId: effect.fromNodeId,
    toNodeId: effect.toNodeId,
    sourceVisual,
    teamIndex: Math.max(0, teamIndex),
    fractions: [0, 1],
  });
  if (
    !sourceSpace
    || !targetSpace
    || !sourcePawn
    || movement.points.length !== 2
  ) {
    visualNodeId = effect.toNodeId;
    renderBoard();
    await ensureNodeVisible(effect.toNodeId);
    return;
  }

  const viewportRect = nodes.fxLayer.getBoundingClientRect();
  const fromX = movement.points[0].x;
  const fromY = movement.points[0].y;
  const character = characterProfileForSeatIndex(Math.max(0, teamIndex));
  const toX = movement.points[1].x;
  const toY = movement.points[1].y;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const skin = theme.transportSkins[effect.transportProfileRef] || {
    announcement: "发现地图捷径！",
    label: "跳步发射器",
  };
  const reducedMotion = reducedMotionRequested();
  const fullAnimation = effect.firstTime !== false;
  const chargeSoundScale = reducedMotion ? 0.18 : fullAnimation ? 0.68 : 0.38;
  const launchSoundScale = reducedMotion ? 0.25 : fullAnimation ? 1 : 0.75;
  const reefSoundScale = reducedMotion ? 0.25 : 1;
  const landSoundScale = reducedMotion ? 0.4 : fullAnimation ? 1 : 0.75;
  const loadDuration = reducedMotion ? 60 : fullAnimation ? 190 : 110;
  const flightDuration = reducedMotion ? 170 : fullAnimation ? 760 : 500;
  const landingDuration = reducedMotion ? 90 : fullAnimation ? 230 : 150;

  nodes.fxLayer.replaceChildren();
  nodes.fxLayer.dataset.effectId = effect.effectId;
  nodes.fxLayer.dataset.fromNodeId = effect.fromNodeId;
  nodes.fxLayer.dataset.toNodeId = effect.toNodeId;

  const banner = document.createElement("div");
  banner.className = "launcher-banner";
  const bannerKicker = document.createElement("span");
  bannerKicker.textContent = skin.announcement;
  const bannerTitle = document.createElement("strong");
  bannerTitle.textContent = `${skin.label} · 跳步发射`;
  banner.append(bannerKicker, bannerTitle);

  const trailSvg = svgElement("svg", {
    class: "launcher-trail-svg",
    viewBox: `0 0 ${viewportRect.width} ${viewportRect.height}`,
    preserveAspectRatio: "none",
  });
  const controlX = (fromX + toX) / 2;
  const controlY = reducedMotion
    ? (fromY + toY) / 2
    : Math.min(fromY, toY) - Math.min(190, viewportRect.height * 0.3);
  const throughNodeId = effect.throughNodeIds?.[0] || effect.captureNodeIds?.[0];
  const throughNode = throughNodeId ? nodeById.get(throughNodeId) : null;
  const throughPoint = throughNode
    ? boardPointToFxPoint({
        x: throughNode.x + movement.visualOffset.x,
        y: throughNode.y + movement.visualOffset.y,
      })
    : null;
  const throughX = throughPoint?.x ?? controlX;
  const throughY = throughPoint?.y ?? controlY;
  const trailPath = svgElement("path", {
    class: "launcher-trail",
    d: (
      `M ${fromX} ${fromY} `
      + `Q ${(fromX + throughX) / 2} ${Math.min(fromY, throughY) - 76} ${throughX} ${throughY} `
      + `Q ${(throughX + toX) / 2} ${Math.min(throughY, toY) - 55} ${toX} ${toY}`
    ),
    "data-through-node-id": throughNodeId || "",
  });
  trailSvg.append(trailPath);

  const flightPawn = positionedFx(
    `flight-pawn cannon-bubble-flight team-${Math.max(0, teamIndex) % PLAYER_PROFILES.length}`,
    fromX,
    fromY,
  );
  appendHtmlCharacterPawnArt(flightPawn, character, "flight-pawn-art");
  flightPawn.dataset.teamId = movingTeam.id;
  flightPawn.dataset.fromNodeId = effect.fromNodeId;
  flightPawn.dataset.toNodeId = effect.toNodeId;
  if (throughNodeId) flightPawn.dataset.throughNodeId = throughNodeId;
  const flash = positionedFx("launcher-flash", fromX, fromY);
  const burst = positionedFx("landing-burst", toX, toY);
  const reefBurst = fullAnimation
    ? positionedFx("cannon-reef-burst", throughX, throughY)
    : null;
  if (reefBurst) {
    reefBurst.dataset.throughNodeId = throughNodeId || "";
    reefBurst.append(
      document.createElement("i"),
      document.createElement("i"),
      document.createElement("i"),
      document.createElement("i"),
    );
  }
  nodes.fxLayer.append(
    trailSvg,
    flash,
    burst,
    ...(reefBurst ? [reefBurst] : []),
    flightPawn,
    banner,
  );

  sourcePawn.style.opacity = "0";
  flightPawn.style.willChange = "transform";
  if (launcher) launcher.style.willChange = "transform";
  nodes.voiceState.textContent = `${skin.label}已锁定落点 · 正在发射`;

  const centered = "translate(-50%, -50%)";
  const loadPawnFrames = reducedMotion
    ? [
        { opacity: 0.7, transform: `${centered} scale(1)` },
        { opacity: 1, transform: `${centered} scale(1)` },
      ]
    : [
        { transform: `${centered} scale(1)` },
        { transform: `${centered} translateY(8px) scale(.82, 1.08)` },
        { transform: `${centered} scale(.94)` },
      ];
  const launcherLoadFrames = reducedMotion
    ? [
        { opacity: 0.7, transform: "translateX(0) rotate(0deg)" },
        { opacity: 1, transform: "translateX(0) rotate(0deg)" },
      ]
    : [
        { transform: "translateX(0) rotate(0deg)" },
        { transform: "translateX(-7px) rotate(-4deg)" },
        { transform: "translateX(0) rotate(0deg)" },
      ];
  const bannerLoadFrames = reducedMotion
    ? [
        { opacity: 0, transform: "translate(-50%, 0) scale(1)" },
        { opacity: 1, transform: "translate(-50%, 0) scale(1)" },
      ]
    : [
        { opacity: 0, transform: "translate(-50%, -8px) scale(.94)" },
        { opacity: 1, transform: "translate(-50%, 0) scale(1)" },
      ];
  try {
    boardSounds.play("signal-cannon-charge", {
      intensity: fullAnimation ? 0.78 : 0.62,
      durationScale: chargeSoundScale,
    });
    await Promise.all([
      animationFinished(flightPawn, loadPawnFrames, {
        duration: loadDuration,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "forwards",
      }),
      animationFinished(launcher, launcherLoadFrames, {
        duration: loadDuration,
        easing: "cubic-bezier(.2,.8,.2,1)",
      }),
      animationFinished(banner, bannerLoadFrames, {
        duration: loadDuration,
        easing: "ease-out",
        fill: "forwards",
      }),
    ]);

    boardSounds.play("signal-cannon-launch", {
      intensity: fullAnimation ? 0.94 : 0.76,
      durationScale: launchSoundScale,
    });
    const flightFrames = reducedMotion
      ? [
        { offset: 0, opacity: 1, transform: `${centered} translate3d(0, 0, 0)` },
        { offset: 0.48, opacity: 0, transform: `${centered} translate3d(0, 0, 0)` },
        {
          offset: 0.52,
          opacity: 0,
          transform: `${centered} translate3d(${deltaX}px, ${deltaY}px, 0)`,
        },
        {
          offset: 1,
          opacity: 1,
          transform: `${centered} translate3d(${deltaX}px, ${deltaY}px, 0)`,
        },
      ]
      : [0, 0.16, 0.36, 0.55, 0.76, 1].map((progress) => {
        const firstLeg = progress <= 0.55;
        const localProgress = firstLeg
          ? progress / 0.55
          : (progress - 0.55) / 0.45;
        const legStartX = firstLeg ? 0 : throughX - fromX;
        const legStartY = firstLeg ? 0 : throughY - fromY;
        const legEndX = firstLeg ? throughX - fromX : deltaX;
        const legEndY = firstLeg ? throughY - fromY : deltaY;
        const legControlX = (legStartX + legEndX) / 2;
        const legControlY = Math.min(legStartY, legEndY) - (firstLeg ? 76 : 55);
        const x = quadraticPoint(legStartX, legControlX, legEndX, localProgress);
        const y = quadraticPoint(legStartY, legControlY, legEndY, localProgress);
        const rotation = Math.sin(progress * Math.PI) * 18;
        const scale = progress === 0 || progress === 1 ? 1 : 1.08;
        return {
          offset: progress,
          transform: `${centered} translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(${scale})`,
        };
      });

    await Promise.all([
      animationFinished(flightPawn, flightFrames, {
        duration: flightDuration,
        easing: "linear",
        fill: "forwards",
      }),
      animationFinished(trailSvg, [
        { opacity: 0 },
        { opacity: reducedMotion ? 0.35 : 0.9, offset: 0.18 },
        { opacity: 0, offset: 1 },
      ], { duration: flightDuration, easing: "linear", fill: "forwards" }),
      animationFinished(flash, [
        {
          opacity: 0,
          transform: `${centered} scale(${reducedMotion ? 1 : 0.2})`,
        },
        {
          opacity: 1,
          transform: `${centered} scale(${reducedMotion ? 1 : 1.3})`,
          offset: 0.28,
        },
        {
          opacity: 0,
          transform: `${centered} scale(${reducedMotion ? 1 : 2.2})`,
        },
      ], { duration: reducedMotion ? 100 : 380, easing: "ease-out", fill: "forwards" }),
      ...(reefBurst ? [animationFinished(reefBurst, [
        { opacity: 0, transform: `${centered} scale(.5)` },
        { opacity: 1, transform: `${centered} scale(1)`, offset: 0.46 },
        { opacity: 0, transform: `${centered} scale(1.85)` },
      ], {
        duration: flightDuration,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "forwards",
      })] : []),
      ...(reefBurst && throughNodeId ? [sleep(flightDuration * 0.42).then(() => {
        boardSounds.play("signal-cannon-reef", {
          intensity: 0.88,
          durationScale: reefSoundScale,
        });
      })] : []),
    ]);

    boardSounds.play("signal-cannon-land", {
      intensity: fullAnimation ? 0.78 : 0.64,
      durationScale: landSoundScale,
    });
    await animationFinished(burst, [
      {
        opacity: 0,
        transform: `${centered} scale(${reducedMotion ? 1 : 0.2})`,
      },
      {
        opacity: 1,
        transform: `${centered} scale(${reducedMotion ? 1 : 1.15})`,
        offset: 0.42,
      },
      {
        opacity: 0,
        transform: `${centered} scale(${reducedMotion ? 1 : 2})`,
      },
    ], { duration: landingDuration, easing: "ease-out", fill: "forwards" });
  } finally {
    flightPawn.style.willChange = "";
    if (launcher) launcher.style.willChange = "";
    setFacilityPresentationPhase(launcherFacility, "settled");
    visualNodeId = effect.toNodeId;
    visitedNodeIds.add(effect.toNodeId);
    nodes.fxLayer.replaceChildren();
    delete nodes.fxLayer.dataset.effectId;
    delete nodes.fxLayer.dataset.fromNodeId;
    delete nodes.fxLayer.dataset.toNodeId;
    renderBoard();
  }
  await ensureNodeVisible(effect.toNodeId);
}

function normalizeDiceFaces(faces, family = "die") {
  const values = Array.isArray(faces) && faces.length ? faces : [1];
  const normalized = values.slice(0, 6).map((source, index) => {
    const face = typeof source === "number"
      ? { steps: source, label: String(source) }
      : source;
    const steps = Math.max(1, Math.min(6, Number(face?.steps) || 1));
    return pointsOnlyDiceFace({ ...face, id: face?.id || `${family}-face-${index + 1}`, steps });
  });
  while (normalized.length < 6) {
    normalized.push({
      ...normalized[normalized.length - 1],
      id: `${family}-face-${normalized.length + 1}`,
    });
  }
  return normalized;
}

function diceBonusPresentation() {
  return null;
}

function appendDiceFaceContent(element, face) {
  const current = pointsOnlyDiceFace(face);
  element.append(textElement("strong", "dice-face-number", String(current.steps)));
}

function createDiceFaceTray(faces, className = "dice-face-tray") {
  const tray = document.createElement("div");
  tray.className = className;
  faces.forEach((face) => {
    const tile = document.createElement("span");
    tile.className = "dice-face-tile";
    tile.title = pointsOnlyDiceFace(face).label;
    appendDiceFaceContent(tile, face, { compact: true });
    tray.append(tile);
  });
  return tray;
}

function createPhysicalDie(family, faces, { mini = false } = {}) {
  const viewport = document.createElement("div");
  viewport.className = `physical-die-viewport ${mini ? "is-mini" : "is-large"}`;
  viewport.dataset.diceFamily = family;
  const rotor = document.createElement("div");
  rotor.className = "physical-die-idle-rotor";
  const cube = document.createElement("div");
  cube.className = "physical-die-cube";
  cube.dataset.diceFamily = family;
  diceBevelPlanes().forEach((plane) => {
    const bevel = document.createElement("div");
    bevel.className = "physical-die-bevel";
    bevel.setAttribute("aria-hidden", "true");
    bevel.style.transform = plane.transform;
    bevel.style.clipPath = plane.clipPath;
    bevel.style.setProperty("--facet-light", plane.shade);
    cube.append(bevel);
  });
  const faceClasses = [
    "is-front",
    "is-back",
    "is-right",
    "is-left",
    "is-top",
    "is-bottom",
  ];
  faces.forEach((face, index) => {
    const faceElement = document.createElement("div");
    faceElement.className = `physical-die-face ${faceClasses[index]}`;
    faceElement.dataset.faceIndex = String(index);
    faceElement.setAttribute("aria-label", pointsOnlyDiceFace(face).label);
    appendDiceFaceContent(faceElement, face);
    cube.append(faceElement);
  });
  if (mini) rotor.style.transform = "rotateX(-18deg) rotateY(32deg)";
  rotor.append(cube);
  viewport.append(rotor);
  return { viewport, rotor, cube };
}

function diceDockProfile(diceId) {
  if (!DICE_PACK_FAMILY_IDS.includes(diceId)) return null;
  if (isTeacherSession(gameSession)) return {
    id: TEACHER_DICE, label: teacherDiceLabel(gameSession),
    faces: teacherDiceFaces(gameSession, currentDicePack()), group: "老师主持",
  };
  const legendaryFamily = ["steady", "sprint", "treasure"].includes(diceId);
  return {
    id: diceId,
    label: DICE_FAMILY_META[diceId]?.label || diceId,
    faces: runtimeDiceFaces(currentDicePack(), diceId),
    group: legendaryFamily ? "传奇" : diceId === "support" ? "助力" : "表现分",
  };
}

function renderDiceDock() {
  if (!nodes.diceDock || !nodes.diceDockList) return;
  // The teacher removed the persistent right-side waiting panel. Keep its
  // compatibility nodes empty so the central die continues through the normal
  // no-dock animation path without changing its geometry or locked result.
  nodes.diceDock.hidden = true;
  nodes.diceDockList.replaceChildren();
}

function diceFaceTransform(faceIndex) {
  const rotation = DICE_FACE_ROTATIONS[
    Math.max(0, Math.min(5, Number(faceIndex) || 0))
  ];
  return `translateY(0) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
}

function sampledDiceFace(faces, random = Math.random) {
  const sample = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  const faceIndex = Math.floor(sample * faces.length);
  return { faceIndex, face: faces[faceIndex] };
}

function dieOptionButton({
  id,
  label,
  description,
  faces,
  onChoose,
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dice-option";
  button.dataset.diceOptionId = id;
  button.dataset.diceState = "entering";
  button.disabled = true;
  const preview = createPhysicalDie(id, faces, { mini: true });
  preview.viewport.dataset.diceInstanceId = `dice-${attemptSequence}-${id}`;
  preview.rotor.classList.add("is-waiting");
  button.append(
    preview.viewport,
    textElement("strong", "dice-option-name", label),
    textElement("small", "dice-option-description", description),
    textElement("span", "dice-option-probability", diceProbabilitySummary(faces)),
    createDiceFaceTray(faces, "dice-option-face-tray"),
  );
  button.addEventListener("click", (event) => {
    void boardSounds.unlock();
    void Promise.resolve(onChoose(event)).catch((error) => {
      console.error("dice choice failed", error);
      cancelPendingDiceChoice();
    });
  }, { once: true });
  return button;
}

function setDiceOverlayActive(active) {
  document.querySelector(".runtime-shell").dataset.diceOverlay = String(Boolean(active));
  if (nodes.diceDock) {
    nodes.diceDock.dataset.selectionActive = String(Boolean(active));
  }
}

async function animateDiceOptionsFromDock(choice) {
  const animations = [...nodes.diceOptions.querySelectorAll(".dice-option")].map(async (button, index) => {
    const source = nodes.diceDockList?.querySelector(
      `[data-dice-dock-id="${button.dataset.diceOptionId}"]`,
    );
    if (!source) {
      button.dataset.diceState = "waiting";
      return;
    }
    button.dataset.promotedFromDock = "true";
    button.dataset.originSide = "right";
    source.dataset.diceState = "promoting";
    source.classList.add("is-promoting");
    if (reducedMotionRequested()) {
      await animationFinished(button, [
        { opacity: 0.45 },
        { opacity: 1 },
      ], {
        duration: 160,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
      source.classList.remove("is-promoting");
      source.classList.add("is-on-stage");
      source.dataset.diceState = "on-stage";
      source.querySelector(".physical-die-idle-rotor")?.classList.remove("is-waiting");
      button.dataset.diceState = "waiting";
      return;
    }
    const sourceRect = source.getBoundingClientRect();
    const targetRect = button.getBoundingClientRect();
    const deltaX = (
      sourceRect.left + (sourceRect.width / 2)
      - targetRect.left - (targetRect.width / 2)
    );
    const deltaY = (
      sourceRect.top + (sourceRect.height / 2)
      - targetRect.top - (targetRect.height / 2)
    );
    button.dataset.entryDeltaX = String(Math.round(deltaX));
    button.dataset.entryDeltaY = String(Math.round(deltaY));
    await animationFinished(button, [
      {
        opacity: 0.76,
        transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(.3) rotate(2deg)`,
      },
      {
        opacity: 1,
        offset: 0.68,
        transform: `translate3d(${deltaX * 0.24}px, ${deltaY * 0.24 - 18}px, 0) scale(.86) rotate(-1deg)`,
      },
      {
        opacity: 1,
        transform: "translate3d(0, 0, 0) scale(1)",
      },
    ], {
      duration: 680 + (index * 55),
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
    source.classList.remove("is-promoting");
    source.classList.add("is-on-stage");
    source.dataset.diceState = "on-stage";
    source.querySelector(".physical-die-idle-rotor")?.classList.remove("is-waiting");
    button.dataset.diceState = "waiting";
  });
  await Promise.all(animations);
  if (pendingDiceChoice !== choice) return false;
  nodes.diceChoiceStage.dataset.phase = "waiting";
  nodes.diceOptions.querySelectorAll(".dice-option").forEach((button) => {
    button.disabled = false;
  });
  if (nodes.diceScoreRetry && !nodes.diceScoreRetry.hidden) {
    nodes.diceScoreRetry.disabled = false;
  }
  return true;
}

async function animateDiceChoiceLock(selectedButton, choice) {
  if (!selectedButton) return null;
  nodes.diceChoiceStage.dataset.phase = "selecting";
  selectedButton.dataset.diceState = "selected";
  selectedButton.classList.add("is-selected");
  const otherButtons = [...nodes.diceOptions.querySelectorAll(".dice-option")]
    .filter((button) => button !== selectedButton);
  otherButtons.forEach((button) => {
    button.dataset.diceState = "dismissed";
    button.classList.add("is-dismissed");
  });
  boardSounds.play(choice.mood.lockCue, {
    intensity: choice.mood.id === "celebrate" ? 1 : 0.72,
  });
  const selectionViewport = selectedButton.querySelector(".physical-die-viewport");
  const selectionRotor = selectionViewport?.querySelector(".physical-die-idle-rotor");
  const selectionCube = selectionViewport?.querySelector(".physical-die-cube");
  if (!selectionViewport || !selectionRotor || !selectionCube) return null;

  const heldTransform = window.getComputedStyle(selectionRotor).transform;
  selectionRotor.classList.remove("is-waiting");
  selectionRotor.getAnimations().forEach((animation) => animation.cancel());
  selectionRotor.style.transform = heldTransform === "none"
    ? "rotateX(-18deg) rotateY(32deg)"
    : heldTransform;
  selectionRotor.dataset.motionState = "held";

  if (!reducedMotionRequested()) {
    await Promise.all([
      animationFinished(selectedButton, [
        { transform: "translate3d(0, 0, 0) scale(1)" },
        { transform: "translate3d(0, -5px, 0) scale(1.035)", offset: 0.54 },
        { transform: "translate3d(0, 0, 0) scale(1)" },
      ], {
        duration: 420,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }),
      ...otherButtons.map((button) => animationFinished(button, [
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        { opacity: 0.16, transform: "translate3d(18px, 8px, 0) scale(.94)" },
      ], {
        duration: 230,
        easing: "cubic-bezier(0.25, 1, 0.5, 1)",
        fill: "forwards",
      })),
    ]);
  }
  nodes.diceChoiceStage.dataset.phase = "handoff";
  return {
    viewport: selectionViewport,
    rotor: selectionRotor,
    cube: selectionCube,
    sourceRect: selectionViewport.getBoundingClientRect(),
  };
}

function clearPendingDiceTimers(choice) {
  (choice?.timers || []).forEach((timerId) => window.clearTimeout(timerId));
  if (choice) choice.timers = [];
}

function resetDiceScoreRetryControl() {
  if (!nodes.diceScoreRetry) return;
  nodes.diceScoreRetry.hidden = true;
  nodes.diceScoreRetry.disabled = true;
  nodes.diceScoreRetry.onclick = null;
  if (nodes.diceScoreRetryNote) nodes.diceScoreRetryNote.hidden = true;
}

function cancelPendingDiceChoice() {
  nodes.diceChoiceStage.hidden = true;
  nodes.diceRollStage.hidden = true;
  nodes.diceBoardResult.hidden = true;
  nodes.diceOptions.replaceChildren();
  nodes.diceRollCubeSlot.replaceChildren();
  nodes.diceRollFaces.replaceChildren();
  resetDiceScoreRetryControl();
  activeDiceDockIds = [];
  activeDiceMood = null;
  nodes.diceChoiceStage.dataset.phase = "idle";
  setDiceOverlayActive(false);
  renderDiceDock();
  if (!pendingDiceChoice) return;
  const choice = pendingDiceChoice;
  pendingDiceChoice = null;
  clearPendingDiceTimers(choice);
  choice.animation?.cancel();
  choice.resolve(null);
}

async function retryScoredAnswer(choice) {
  if (
    pendingDiceChoice !== choice
    || choice.locked
    || !choice.allowScoreRetry
    || !consumeScoreRetry()
  ) {
    return;
  }
  choice.locked = true;
  nodes.diceChoiceStage.dataset.phase = "retrying";
  nodes.diceOptions.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  if (nodes.diceScoreRetry) nodes.diceScoreRetry.disabled = true;
  nodes.diceChoiceCopy.textContent = "好的，这次分数先不结算，回到同一道题再试一次。";
  boardSounds.play("route-confirm", { intensity: 0.58, pitch: 1 });
  await animationFinished(nodes.diceChoiceCard || nodes.diceChoiceStage, [
    { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
    { opacity: 0.72, transform: "translate3d(0, 8px, 0) scale(.985)" },
  ], {
    duration: 180,
    easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    fill: "forwards",
  });
  if (pendingDiceChoice !== choice) return;
  clearPendingDiceTimers(choice);
  choice.animation?.cancel();
  pendingDiceChoice = null;
  activeDiceDockIds = [];
  activeDiceMood = null;
  nodes.diceChoiceStage.hidden = true;
  nodes.diceChoiceStage.dataset.phase = "idle";
  nodes.diceOptions.replaceChildren();
  setDiceOverlayActive(false);
  resetDiceScoreRetryControl();
  renderDiceDock();
  choice.resolve(DICE_CHOICE_RETRY);
}

function scheduleDicePhase(choice, delay, phase, label) {
  const timerId = window.setTimeout(() => {
    if (pendingDiceChoice !== choice) return;
    nodes.diceRollCard.dataset.phase = phase;
    nodes.diceRollStatus.textContent = label;
  }, presentationDuration(delay));
  choice.timers.push(timerId);
}

async function animateReducedDice(cube, faceIndex, choice) {
  if (pendingDiceChoice !== choice) return false;
  // Low motion shows only the saved outcome; no rapid face changes or flashing.
  cube.style.transform = diceFaceTransform(faceIndex);
  nodes.diceRollCard.dataset.phase = "reduced";
  nodes.diceRollStatus.textContent = "好运揭晓";
  return pendingDiceChoice === choice;
}

async function presentDiceRoll(roll, allFaces, choice, selectedVisual = null) {
  const family = roll.poolId || "preview";
  const faces = normalizeDiceFaces(allFaces, family);
  const faceIndex = Math.max(0, Math.min(5, Number(roll.faceIndex) || 0));
  const die = selectedVisual || createPhysicalDie(family, faces);
  nodes.diceBoardResult.hidden = true;
  nodes.diceRollStage.dataset.phase = "enter";
  nodes.diceRollStage.getAnimations().forEach((animation) => animation.cancel());
  nodes.diceRollCard.dataset.diceFamily = family;
  nodes.diceRollCard.dataset.diceOptionId = family;
  nodes.diceRollCard.dataset.reusedCandidate = String(Boolean(selectedVisual));
  nodes.diceRollCard.dataset.scoreTone = choice.mood?.id || "steady";
  nodes.diceRollCard.dataset.phase = "selected";
  nodes.diceRollName.textContent = roll.poolLabel || DICE_FAMILY_META[family]?.label || "本轮骰子";
  nodes.diceRollStatus.textContent = "聚光灯就位";
  nodes.diceRollResult.textContent = "看看这次能走多远";
  nodes.diceRollResult.classList.remove("is-visible");
  nodes.diceRollFaces.replaceChildren(...createDiceFaceTray(faces).children);
  const faceReference = nodes.diceRollFaces.closest("details");
  if (faceReference) faceReference.open = false;
  setDiceOverlayActive(true);
  nodes.diceRollStage.hidden = false;
  if (selectedVisual) {
    nodes.diceChoiceStage.hidden = true;
    die.viewport.classList.remove("is-mini");
    die.viewport.classList.add("is-large", "is-handing-off");
    nodes.diceRollCubeSlot.replaceChildren(die.viewport);
    await sleep(20);
    const targetRect = die.viewport.getBoundingClientRect();
    const sourceRect = selectedVisual.sourceRect;
    const deltaX = (
      sourceRect.left + (sourceRect.width / 2)
      - targetRect.left - (targetRect.width / 2)
    );
    const deltaY = (
      sourceRect.top + (sourceRect.height / 2)
      - targetRect.top - (targetRect.height / 2)
    );
    const scale = Math.max(0.35, Math.min(1, sourceRect.width / targetRect.width));
    nodes.diceRollCard.dataset.handoffDeltaX = String(Math.round(deltaX));
    if (!reducedMotionRequested()) {
      await animationFinished(die.viewport, [
        {
          transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scale})`,
        },
        {
          offset: 0.72,
          transform: "translate3d(0, -8px, 0) scale(1.025)",
        },
        {
          transform: "translate3d(0, 0, 0) scale(1)",
        },
      ], {
        duration: 320,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    } else {
      await animationFinished(die.viewport, [
        { opacity: 0.55 },
        { opacity: 1 },
      ], {
        duration: 170,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    }
    die.viewport.classList.remove("is-handing-off");
  } else {
    nodes.diceChoiceStage.hidden = true;
    nodes.diceRollCubeSlot.replaceChildren(die.viewport);
  }
  if (pendingDiceChoice !== choice) return false;

  const useReducedRoll = (
    reducedMotionRequested()
    || typeof die.cube?.animate !== "function"
  );
  if (useReducedRoll) {
    die.rotor?.classList.remove("is-waiting");
    if (die.rotor) die.rotor.style.transform = DICE_RESULT_VIEW;
    if (!await animateReducedDice(die.cube, faceIndex, choice)) return false;
  } else {
    nodes.diceRollCard.dataset.phase = "sprint";
    nodes.diceRollStatus.textContent = "掷出好运！";
    boardSounds.play("dice-spin", {
      intensity: choice.mood?.id === "celebrate" ? 1 : 0.76,
      pitch: choice.mood?.id === "celebrate" ? 1 : -1,
    });
    if (die.rotor) {
      // CSS idle animation can override the inline pose: freeze what is visible.
      const waitingTransform = window.getComputedStyle(die.rotor).transform;
      die.rotor.classList.remove("is-waiting");
      die.rotor.style.transform = waitingTransform === "none"
        ? "rotateX(-18deg) rotateY(32deg)"
        : waitingTransform;
      die.rotor.dataset.motionState = "fast";
      void die.rotor.offsetWidth;
      // Reframe alongside the launch, not as another wait before it can spin.
      void animationFinished(die.rotor, [
        { transform: die.rotor.style.transform },
        { transform: DICE_RESULT_VIEW },
      ], {
        duration: 160,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      });
      die.rotor.style.transform = DICE_RESULT_VIEW;
      die.rotor.dataset.motionState = "fast";
    }
    if (pendingDiceChoice !== choice) return false;
    scheduleDicePhase(choice, DICE_ROLL_DURATION * .45, "slow", "好运就要揭晓");
    const target = DICE_FACE_ROTATIONS[faceIndex];
    const keyframes = diceThrowKeyframes(target);
    die.cube.classList.add("is-rolling");
    const animation = die.cube.animate(keyframes, {
      duration: presentationDuration(DICE_ROLL_DURATION),
      easing: "linear",
      fill: "forwards",
    });
    choice.animation = animation;
    const stopFrameProbe = startDiceFrameProbe(
      qaControlsEnabled && QA_PAGE_REQUESTED && PAGE_QUERY.get("qaMotion") === "1",
    );
    await animation.finished.catch(() => undefined);
    const frameProbe = stopFrameProbe();
    if (frameProbe) nodes.diceRollCard.dataset.motionProbe = JSON.stringify(frameProbe);
    die.cube.classList.remove("is-rolling");
    if (die.rotor) {
      die.rotor.getAnimations().forEach((animationItem) => animationItem.cancel());
      die.rotor.style.transform = DICE_RESULT_VIEW;
      die.rotor.dataset.motionState = "settled";
    }
    if (pendingDiceChoice !== choice) return false;
    choice.animation = null;
    // Commit the equivalent authoritative pose BEFORE removing WAAPI's fill.
    die.cube.style.transform = diceFaceTransform(faceIndex);
    animation.cancel();
  }

  clearPendingDiceTimers(choice);
  die.cube.style.transform = diceFaceTransform(faceIndex);
  nodes.diceRollCard.dataset.phase = "settle";
  nodes.diceRollStatus.textContent = "好运揭晓";
  const bonus = diceBonusPresentation(faces[faceIndex]);
  nodes.diceRollResult.textContent = (
    `前进 ${roll.steps} 格${bonus ? ` · ${bonus.label}` : ""}`
  );
  nodes.diceRollResult.classList.add("is-visible");
  const settledFace = die.cube.querySelector(
    `.physical-die-face[data-face-index="${faceIndex}"]`,
  );
  settledFace?.classList.add("is-result");
  nodes.diceRollCard.dataset.resultFaceIndex = String(faceIndex);
  nodes.diceRollCard.dataset.resultHoldMs = String(DICE_RESULT_HOLD_DURATION);
  await sleep(DICE_STAGE_RESULT_DURATION);
  if (pendingDiceChoice !== choice) return false;

  // The already sampled result returns to the normal board before any movement.
  // This is presentation only: do not sample, persist or settle inside the stage.
  nodes.die.textContent = String(roll.steps);
  nodes.die.dataset.diceFamily = family;
  nodes.dieKind.textContent = roll.poolLabel;
  nodes.diceBoardResultNumber.textContent = String(roll.steps);
  nodes.diceBoardResultTitle.textContent = `前进 ${roll.steps} 格`;
  nodes.diceBoardResultBonus.textContent = bonus?.label || "冒险继续！";
  nodes.diceBoardResult.dataset.faceIndex = String(faceIndex);
  nodes.diceRollStage.dataset.phase = "exit";
  if (!reducedMotionRequested()) {
    await animationFinished(nodes.diceRollStage, [{ opacity: 1 }, { opacity: 0 }], {
      duration: DICE_STAGE_EXIT_DURATION,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
  }
  if (pendingDiceChoice !== choice) return false;
  nodes.diceRollStage.hidden = true;
  setDiceOverlayActive(false);
  nodes.diceBoardResult.hidden = false;
  currentDiceRewardOriginPoint = bonus && !roll.fairyAction
    ? elementCenter(nodes.diceBoardResultBonus)
    : null;
  await sleep(DICE_RESULT_HOLD_DURATION - DICE_STAGE_RESULT_DURATION);
  if (pendingDiceChoice === choice) nodes.diceBoardResult.hidden = true;
  return pendingDiceChoice === choice;
}

function chooseDieForProfile(profile) {
  if (!profile?.diceTier) throw new Error("a scored dice tier is required");
  currentDiceRewardOriginPoint = null;
  cancelPendingDiceChoice();
  const turnDicePack = cloneDicePack(currentDicePack());
  const legendaryOptions = profile.requiresChoice
    ? generateLegendaryDiceFamilies(turnDicePack).map((familyId) => ({
        id: familyId,
        label: DICE_FAMILY_META[familyId]?.label || familyId,
        description: DICE_FAMILY_META[familyId]?.description || "六面等概率骰子",
        faces: runtimeDiceFaces(turnDicePack, familyId),
      }))
    : null;
  const mood = diceSelectionMood(profile);
  activeDiceDockIds = profile.requiresChoice
    ? legendaryOptions.map((option) => option.id)
    : [profile.diceTier];
  activeDiceMood = mood;
  setDiceOverlayActive(true);
  renderDiceDock();
  nodes.diceChoiceStage.dataset.phase = "candidate-reveal";
  nodes.diceChoiceStage.dataset.scoreTone = mood.id;
  nodes.diceChoiceTitle.textContent = profile.requiresChoice
    ? "高分奖励：选一个传奇骰子"
    : `获得${profile.diceLabel}！`;
  nodes.diceChoiceCopy.textContent = profile.requiresChoice
    ? "先看清每颗骰子的六个面，再选你喜欢的玩法。"
    : "六个骰面都在这里，点一下开始滚动。";
  const allowScoreRetry = Number.isFinite(profile.score) && scoreRetryAvailable();
  if (nodes.diceScoreRetry) {
    nodes.diceScoreRetry.hidden = !allowScoreRetry;
    nodes.diceScoreRetry.disabled = true;
  }
  if (nodes.diceScoreRetryNote) {
    nodes.diceScoreRetryNote.hidden = !allowScoreRetry;
  }
  boardSounds.play(mood.readyCue, {
    intensity: mood.id === "celebrate" ? 0.9 : 0.68,
  });

  return new Promise((resolve) => {
    const choice = {
      resolve,
      locked: false,
      animation: null,
      timers: [],
      mood,
      allowScoreRetry,
    };
    pendingDiceChoice = choice;
    if (allowScoreRetry && nodes.diceScoreRetry) {
      nodes.diceScoreRetry.onclick = () => {
        void retryScoredAnswer(choice).catch((error) => {
          console.error("score retry failed", error);
          cancelPendingDiceChoice();
        });
      };
    }
    const finish = async (roll, faces, event = null) => {
      roll = pointsOnlyDiceRoll(roll);
      faces = faces.map(pointsOnlyDiceFace);
      if (pendingDiceChoice !== choice || choice.locked) return;
      choice.locked = true;
      if (nodes.diceScoreRetry) nodes.diceScoreRetry.disabled = true;
      nodes.diceOptions.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
      const selectedVisual = await animateDiceChoiceLock(
        event?.currentTarget || null,
        choice,
      );
      if (pendingDiceChoice !== choice) return;
      lastDicePresentation = {
        label: roll.poolLabel,
        poolId: roll.poolId,
        faceIndex: roll.faceIndex,
        faceId: roll.face?.id || null,
        steps: roll.steps,
        bonus: { ...roll.bonus },
        fairyAction: roll.fairyAction || null,
        dicePackRevision: sessionDicePackSnapshot?.revision || null,
        faceLabel: roll.face?.label || String(roll.steps),
        faceLabels: faces.map((face) => face.label),
      };
      if (!await presentDiceRoll(roll, faces, choice, selectedVisual)) return;
      if (pendingDiceChoice !== choice) return;
      activeDiceDockIds = [];
      activeDiceMood = null;
      renderDiceDock();
      pendingDiceChoice = null;
      nodes.diceRollStage.hidden = true;
      setDiceOverlayActive(false);
      nodes.diceOptions.replaceChildren();
      nodes.diceRollCubeSlot.replaceChildren();
      nodes.diceRollFaces.replaceChildren();
      resetDiceScoreRetryControl();
      resolve(roll);
    };

    const revealChoices = async () => {
      await sleep(640);
      if (pendingDiceChoice !== choice || choice.locked) return;
      if (window.matchMedia("(max-width: 1199px)").matches) hideTurnFeedback();
      nodes.diceChoiceStage.dataset.phase = "entering";
      nodes.diceChoiceStage.dataset.scoreTone = mood.id;
      nodes.diceChoiceStage.hidden = false;
      if (profile.requiresChoice) {
        nodes.diceOptions.replaceChildren(...legendaryOptions.map((option) => {
          const faces = normalizeDiceFaces(option.faces, option.id);
          return dieOptionButton({
            id: option.id,
            label: option.label,
            description: option.description,
            faces,
            onChoose: (event) => finish({
              ...rollDicePackFamily(turnDicePack, option.id),
              poolLabel: option.label,
            }, faces, event),
          });
        }));
        if (!await animateDiceOptionsFromDock(choice)) return;
        nodes.diceOptions.querySelector("button")?.focus({ preventScroll: true });
        return;
      }

      const faces = runtimeDiceFaces(turnDicePack, profile.diceTier).map(pointsOnlyDiceFace);
      const roll = (event) => {
        const sampled = sampledDiceFace(faces);
        finish({
          poolId: profile.diceTier,
          poolLabel: profile.diceLabel,
          faceIndex: sampled.faceIndex,
          face: sampled.face,
          steps: sampled.face.steps,
          bonus: { ...sampled.face.bonus },
          fairyAction: sampled.face.fairyAction,
        }, faces, event);
      };
      const meta = DICE_FAMILY_META[profile.diceTier] || {};
      nodes.diceOptions.replaceChildren(dieOptionButton({
        id: profile.diceTier,
        label: profile.diceLabel,
        description: meta.description || "点一下这颗骰子，看看本轮结果。",
        faces,
        onChoose: roll,
      }));
      if (!await animateDiceOptionsFromDock(choice)) return;
      nodes.diceOptions.querySelector("button")?.focus({ preventScroll: true });
    };
    void revealChoices().catch((error) => {
      if (pendingDiceChoice !== choice) return;
      console.error("dice choice presentation failed", error);
      cancelPendingDiceChoice();
    });
  });
}

function routePreviewNode(nodeId, composition = activeWorldComposition) {
  const space = composition.board.nodes.find(({ id }) => id === nodeId);
  const baseKind = nodeKindForComposition(
    composition,
    nodeId,
    space?.spaceRole || "learning",
  );
  const outcome = nodeOutcomeForComposition(composition, nodeId, {
    fairyHere: (
      composition.worldRef === activeWorldComposition.worldRef
      && fairyState.anchorId === nodeId
    ),
  });
  const kind = cloudHarborNodeVisualKind(nodeVisualKindForOutcome(outcome, baseKind), { theme: composition.theme, worldRef: composition.worldRef });
  const pointPresentation = nodeLandingPointsPresentation({
    rule: gameSession?.landingPoints?.rule, worldRef: composition.worldRef,
    node: space, board: composition.board,
  });
  const pointsLabel = pointPresentation
    ? pointPresentation.transported ? `${outcome.shortLabel} · ${pointPresentation.badgeText}`
      : outcome.category === "ordinary" ? `家园积分 +${pointPresentation.amount}` : null
    : null;
  return {
    nodeId,
    kind,
    glyph: pointsLabel ? "分" : outcome.icon || nodeGlyph(kind),
    label: pointsLabel || (outcome.trigger === "next-edge-pass"
      ? "航道亮起并离港"
      : outcome.shortLabel),
    badgeLabel: outcome.badgeLabel,
    detail: outcome.detail,
    trigger: outcome.trigger,
    outcomeKind: outcome.category,
  };
}

function fallbackRouteOptionMeta(
  option,
  index,
  junctionNodeId,
  composition = activeWorldComposition,
) {
  const contextNodeById = new Map(
    composition.board.nodes.map((node) => [node.id, node]),
  );
  const firstNode = contextNodeById.get(option.routeNodeIds[0]);
  const junction = contextNodeById.get(junctionNodeId);
  const direction = firstNode && junction && firstNode.y < junction.y ? "↗" : "↘";
  const containsChallenge = option.routeNodeIds.some((nodeId) => (
    nodeKindForComposition(
      composition,
      nodeId,
      contextNodeById.get(nodeId)?.spaceRole,
    ) === "event"
  ));
  return {
    direction,
    directionLabel: index === 0 ? "第一条路" : "第二条路",
    label: containsChallenge ? "挑战探索路" : "寻宝练习路",
    tone: containsChallenge ? "challenge" : "positive",
    description: "看看沿路的格子，再选择这次想走的方向。",
  };
}

/** On-map fork buttons for the pending route choice (null → modal fallback). */
function boardRouteChoiceLayer() {
  const presentation = routeChoicePresentation;
  if (!presentation?.onBoard || presentation.worldRef !== activeWorldComposition.worldRef || layoutEditor.active) return null;
  const junction = nodeById.get(presentation.junctionNodeId);
  const options = presentation.options || [];
  if (!junction || options.length < 2 || options.length > 3) return null;
  if (!options.every((option) => nodeById.get(option.routeNodeIds?.[0]) && nodeById.get(option.destinationNodeId))) return null;
  const layout = routeChoiceLayout({
    junction,
    options: options.map((option) => {
      const heading = option.routeNodeIds.slice(0, 3).map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
      return {
        edgeId: option.edgeId,
        firstNode: nodeById.get(option.routeNodeIds[0]),
        probe: {
          x: heading.reduce((sum, node) => sum + node.x, 0) / heading.length,
          y: heading.reduce((sum, node) => sum + node.y, 0) / heading.length,
        },
        fallbackLabel: option.label,
      };
    }),
    worldSize: boardWorldSize(),
  });
  presentation.boardLayout = layout;
  const edgeById = new Map((visualBoardTemplate.edges || []).map((edge) => [edge.id, edge]));
  const routes = options.map((option) => {
    const button = layout.buttons.find((candidate) => candidate.edgeId === option.edgeId);
    const landingNode = nodeById.get(option.destinationNodeId);
    const points = nodeLandingPointsPresentation({
      rule: gameSession?.landingPoints?.rule, worldRef: activeWorldComposition.worldRef,
      node: landingNode, board: visualBoardTemplate,
    });
    const special = specialCellForBoardNode(option.destinationNodeId);
    const specialType = special ? SPECIAL_CELL_TYPE_BY_ID[special.type] : null;
    const landingText = routeChoiceLandingText(points?.amount);
    let previous = junction;
    const edgePaths = option.edgeIds.map((edgeId, index) => {
      const edge = edgeById.get(edgeId);
      const next = nodeById.get(option.routeNodeIds[index]);
      const d = edge ? edgePath(edge) : `M ${previous.x} ${previous.y} L ${next?.x ?? previous.x} ${next?.y ?? previous.y}`;
      previous = next || previous;
      return d;
    });
    return {
      ...button,
      edgePaths,
      landing: { x: landingNode.x, y: landingNode.y },
      landingText,
      landingIcon: specialType?.icon || "",
      tagOffsetY: routeChoiceTagOffset({ orientation: layout.orientation, rank: button.rank, hasFloatingMarker: Boolean(special) }),
      ariaLabel: `${button.label}，${option.label}。本次${landingText}${points ? " 分" : ""}`
        + `${specialType ? `，还有${specialType.name}（${specialType.effect}）` : ""}。按回车出发。`,
    };
  });
  presentation.boardLandingPoints = routes.map((route) => ({ x: route.landing.x, y: route.landing.y + route.tagOffsetY }));
  const state = presentation.boardState;
  state.selectedEdgeId = presentation.selectedEdgeId || null;
  return createBoardRouteChoiceLayer({
    svgElement,
    junctionNodeId: presentation.junctionNodeId,
    routes,
    state,
    onPreview(edgeId, reason) {
      if (reason !== "arm" || !edgeId) return;
      const route = routes.find((candidate) => candidate.edgeId === edgeId);
      nodes.voiceState.textContent = `${route.label}：${route.landingText}${route.landingText.includes("+") ? " 分" : ""} · 再点一下出发`;
      boardSounds.play("route-open");
    },
    onConfirm(edgeId) {
      const target = Array.from(nodes.routeOptions.querySelectorAll("button.route-option"))
        .find((button) => button.dataset.edgeId === edgeId);
      target?.click();
    },
  });
}

function ensureRouteChoiceVisible() {
  const presentation = routeChoicePresentation;
  const layout = presentation?.boardLayout;
  const junction = nodeById.get(presentation?.junctionNodeId);
  if (!layout || !junction) return Promise.resolve();
  const core = [junction, ...layout.buttons];
  // Prefer a framing that also shows every landing ring and its "停在 +N" tag.
  const landings = (presentation.boardLandingPoints || []);
  const centerOf = (points) => {
    const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };
  const full = [...core, ...landings];
  if (full.every((point) => isPointVisible(point, camera, cameraBoardTemplate(), 90))) return Promise.resolve();
  const fullCamera = centerCameraOnPoint(centerOf(full), cameraBoardTemplate());
  if (full.every((point) => isPointVisible(point, fullCamera, cameraBoardTemplate(), 70))) {
    return animateCameraTo(fullCamera, { animate: true });
  }
  if (core.every((point) => isPointVisible(point, camera, cameraBoardTemplate(), 90))) return Promise.resolve();
  return animateCameraTo(centerCameraOnPoint(centerOf(core), cameraBoardTemplate()), { animate: true });
}

function cancelPendingRouteChoice() {
  nodes.routeChoiceStage.hidden = true;
  nodes.routeOptions.replaceChildren();
  routeChoicePresentation = null;
  if (!pendingRouteChoice) return;
  const choice = pendingRouteChoice;
  pendingRouteChoice = null;
  nodes.routeChoiceStage.removeEventListener("keydown", choice.onKeyDown);
  choice.resolve(null);
  choice.restoreFocus();
}

function cancelPendingCoinExchangeChoice(exchange = false) {
  nodes.coinExchangeStage.hidden = true;
  if (!pendingCoinExchangeChoice) return;
  const choice = pendingCoinExchangeChoice;
  pendingCoinExchangeChoice = null;
  nodes.coinExchangeStage.removeEventListener("keydown", choice.onKeyDown);
  choice.resolve(exchange);
  choice.restoreFocus();
}

function nodeSequenceIsPrefix(prefix, sequence) {
  return (
    Array.isArray(prefix)
    && Array.isArray(sequence)
    && prefix.length <= sequence.length
    && prefix.every((nodeId, index) => nodeId === sequence[index])
  );
}

async function presentPawnRoutePrefix(
  routeNodeIds,
  {
    movingTeam,
    totalSteps,
    alreadyPresentedNodeIds = [],
    presentationId = "route-choice",
    stepNumberOffset = 0,
    statusLabel = "正在前往岔路",
  },
) {
  const routePrefix = [...(routeNodeIds || [])];
  if (!nodeSequenceIsPrefix(alreadyPresentedNodeIds, routePrefix)) {
    throw new Error("presented pawn route diverged from the BoardTemplate plan");
  }

  const unpresentedNodeIds = routePrefix.slice(
    alreadyPresentedNodeIds.length,
  );
  for (let index = 0; index < unpresentedNodeIds.length; index += 1) {
    const nodeId = unpresentedNodeIds[index];
    const routeStepNumber = alreadyPresentedNodeIds.length + index + 1;
    const stepNumber = stepNumberOffset + routeStepNumber;
    nodes.voiceState.textContent = (
      `${movingTeam.label}${statusLabel} · 移动 ${stepNumber}/${totalSteps} 格`
    );
    await playPawnStep({
      type: "pawn_step",
      effectId: `${presentationId}:approach:${stepNumberOffset}:${routeStepNumber}`,
      nodeId,
    }, movingTeam, {
      stepNumber,
      totalSteps,
      recordVisit: false,
    });
  }
  return routePrefix;
}

async function presentRouteChoiceApproach(
  plan,
  options,
) {
  const routeBeforeJunction = [...(plan?.routeBeforeJunction || [])];
  if (routeBeforeJunction.length !== plan?.stepsBeforeJunction) {
    throw new Error("route-choice approach diverged from the BoardTemplate plan");
  }
  const presentedNodeIds = await presentPawnRoutePrefix(
    routeBeforeJunction,
    options,
  );

  if (visualNodeId !== plan.junctionNodeId) {
    throw new Error("route choice cannot open before the pawn reaches its junction");
  }
  return presentedNodeIds;
}

function routeChoiceMetaForComposition(nodeId, composition) {
  const original = cloudHarborRouteChoice(ROUTE_CHOICE_META[nodeId], { theme: composition.theme, worldRef: composition.worldRef });
  if (!isCurrentCloudHarborWorldRef(composition.worldRef) || !original) return original;
  if (nodeId === "n04") return {
    ...original,
    copy: "上路沿云朵小路前进，下路沿海湾观景台前进。完成全部移动后，领取最终停格的家园积分。",
    options: {
      e04a: { ...original.options.e04a, label: "云朵小路线", description: "沿上路前进，完成全部移动后领取最终停格家园积分。" },
      e04b: { ...original.options.e04b, label: "海湾漫步线", description: "沿海湾前进，完成全部移动后领取最终停格家园积分。" },
    },
  };
  if (nodeId === "n10") return {
    ...original, title: "云岸岔路",
    copy: "上路沿星光云梯前进，下路沿低矮云岸前进。完成全部移动后，领取最终停格的家园积分。",
    options: {
      e10a: original.options.e10a,
      e10b: { ...original.options.e10b, label: "云岸漫步线", description: "沿下路前进，完成全部移动后领取最终停格家园积分。" },
    },
  };
  return original;
}

function automaticChoiceForMove(plan, {
  composition = activeWorldComposition,
  routeChoices = {},
  mapState = runtime.mapState,
} = {}) {
  const seat = currentSessionSeat(gameSession);
  if (!seat || !usesLandingPoints()) return null;
  const specialCells = currentSpecialCells();
  return automaticRouteChoice({
    plan, board: composition.board, routeChoices, mapState,
    outcomeForRoute: (route) => routeChoiceOutcome({
      route: { ...route, junctionNodeId: plan.junctionNodeId },
      composition, mapState, rule: gameSession.landingPoints.rule, specialCells,
      seatId: seat.id, activeSeatCount: gameSession.seats.length,
      effectiveTurn: (runtime.completedMoveCount ?? runtime.acceptedCount) + 1,
      fairyActive: fairyState.status === FAIRY_STATUS.active,
    }),
  });
}

function chooseRouteForMove(
  plan,
  {
    movingTeam,
    composition = activeWorldComposition,
    afterWorldTransition = false,
  },
) {
  cancelPendingRouteChoice();
  const meta = routeChoiceMetaForComposition(plan.junctionNodeId, composition) || {
    title: "前面出现两条路",
    copy: "先看看每条路会经过什么，再替自己的角色做决定。",
    options: {},
  };
  const options = plan.options.map((option, index) => ({
    ...option,
    ...(meta.options?.[option.edgeId]
      || fallbackRouteOptionMeta(
        option,
        index,
        plan.junctionNodeId,
        composition,
      )),
    previewNodes: option.routeNodeIds.map((nodeId, routeIndex) => ({
      ...routePreviewNode(nodeId, composition),
      isLanding: routeIndex === option.routeNodeIds.length - 1,
    })),
  }));
  routeChoicePresentation = {
    ...plan,
    options,
    selectedEdgeId: null,
    // Fork buttons are drawn on the map when the fork's world is on screen;
    // otherwise the modal below is the fallback.
    worldRef: composition.worldRef,
    onBoard: composition.worldRef === activeWorldComposition.worldRef,
    boardState: { previewEdgeId: null, armedEdgeId: null, selectedEdgeId: null },
  };
  nodes.routeChoiceTitle.textContent = afterWorldTransition
    ? `${movingTeam.label}，新世界入口出现两条路`
    : `${movingTeam.label}，${meta.title}`;
  nodes.routeChoiceCopy.textContent = afterWorldTransition
    ? "星门穿越不消耗骰点；请先选择新世界的方向，剩余点数会沿这条路继续走。"
    : meta.copy;
  nodes.routeChoiceSteps.textContent = `还剩 ${plan.remainingSteps} 格`;

  return new Promise((resolve) => {
    const choice = {
      resolve,
      locked: false,
      onKeyDown: null,
      restoreFocus() {
        nodes.boardViewport?.focus?.({ preventScroll: true });
      },
    };
    pendingRouteChoice = choice;
    const buttons = options.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "route-option";
      button.dataset.edgeId = option.edgeId;
      button.dataset.tone = option.tone;
      const landingPreview = option.previewNodes.at(-1);
      button.setAttribute(
        "aria-label",
        `${option.directionLabel}，${option.label}。${option.description}`
        + (landingPreview
          ? ` 本次落点：${landingPreview.badgeLabel}，${landingPreview.label}。${landingPreview.detail}`
          : ""),
      );

      const direction = textElement("span", "route-option-direction", option.direction);
      direction.title = option.directionLabel;
      const copy = document.createElement("span");
      copy.className = "route-option-copy";
      copy.append(
        textElement("strong", "", option.label),
        textElement("small", "", option.description),
      );
      const callToAction = textElement("span", "route-option-cta", "选择这条路");
      const preview = document.createElement("span");
      preview.className = "route-preview-icons";
      option.previewNodes.forEach((item, index) => {
        const passTriggers = item.trigger === "route-pass";
        const nextEdgeTriggers = (
          item.trigger === "next-edge-pass"
          && index < option.previewNodes.length - 1
        );
        const enterTriggers = item.trigger === "after-enter";
        const prefix = passTriggers
          ? "经过触发"
          : nextEdgeTriggers
            ? "跨下一步触发"
            : enterTriggers
              ? "进入触发"
              : item.isLanding
                ? item.trigger === "next-edge-pass"
                  ? "停在不触发"
                  : "落点"
                : "路过不触发";
        const triggersOnThisRoute = passTriggers || nextEdgeTriggers || enterTriggers;
        const tile = textElement(
          "span",
          "",
          `${item.glyph} ${prefix} · ${item.isLanding || triggersOnThisRoute ? item.label : item.badgeLabel}`,
        );
        tile.dataset.kind = item.kind;
        tile.dataset.outcomeKind = item.outcomeKind;
        tile.dataset.outcomeTrigger = item.trigger;
        tile.dataset.isLanding = String(item.isLanding);
        tile.title = item.detail;
        preview.append(tile);
        if (index < option.previewNodes.length - 1) {
          preview.append(textElement("b", "", "→"));
        }
      });
      button.append(direction, copy, callToAction, preview);
      button.addEventListener("click", async () => {
        if (pendingRouteChoice !== choice || choice.locked) return;
        choice.locked = true;
        button.classList.add("is-selected");
        nodes.routeOptions.querySelectorAll("button").forEach((candidate) => {
          candidate.disabled = true;
        });
        routeChoicePresentation.selectedEdgeId = option.edgeId;
        renderBoard();
        boardSounds.play("route-confirm", { pitch: option.tone === "challenge" ? -1 : 1 });
        nodes.voiceState.textContent = (
          `${movingTeam.label}选择了${option.label} · 继续逐格前进 ${plan.remainingSteps} 格`
        );
        await sleep(420);
        if (pendingRouteChoice !== choice) return;
        pendingRouteChoice = null;
        nodes.routeChoiceStage.removeEventListener("keydown", choice.onKeyDown);
        nodes.routeChoiceStage.hidden = true;
        nodes.routeOptions.replaceChildren();
        routeChoicePresentation = null;
        renderBoard();
        resolve({ [plan.junctionNodeId]: option.edgeId });
        choice.restoreFocus();
      }, { once: true });
      return button;
    });

    choice.onKeyDown = (event) => {
      if (event.key !== "Tab") return;
      const availableButtons = buttons.filter((button) => !button.disabled);
      if (!availableButtons.length) {
        event.preventDefault();
        return;
      }
      const first = availableButtons[0];
      const last = availableButtons.at(-1);
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !nodes.routeChoiceStage.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !nodes.routeChoiceStage.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    nodes.routeOptions.replaceChildren(...buttons);
    nodes.routeChoiceStage.addEventListener("keydown", choice.onKeyDown);
    hideTurnFeedback();
    renderBoard();
    // The on-map buttons own the choice; the modal (with the same buttons and
    // click handlers) only opens when the board could not draw them.
    const boardChoice = nodes.board.querySelector(".board-route-choice");
    nodes.routeChoiceStage.hidden = Boolean(boardChoice);
    if (composition.worldRef === activeWorldComposition.worldRef) {
      void (boardChoice ? ensureRouteChoiceVisible() : ensureNodeVisible(plan.junctionNodeId));
    }
    boardSounds.play("route-open");
    nodes.voiceState.textContent = (
      `${movingTeam.label}${afterWorldTransition ? "穿过星门后" : "来到岔路"}`
      + " · 请选择向哪边走"
    );
    (boardChoice?.querySelector(".brc-button") || buttons[0])?.focus({ preventScroll: true });
  });
}

function playerNameForOwner(ownerId) {
  return gameSession?.seats?.find((seat) => seat.id === ownerId)?.displayName
    || "获奖孩子";
}

function chooseCoinExchangeAtStation({ ownerId } = {}) {
  cancelPendingCoinExchangeChoice();
  const account = playerAssetsLedger?.playerAssetsById?.[ownerId];
  const assets = playerAssetSnapshot(account);
  const exchangeCost = 5; // Historical presenter only; no active settlement path.
  const canExchange = assets.coins >= exchangeCost;
  const playerName = playerNameForOwner(ownerId);

  nodes.coinExchangeBalance.textContent = `${playerName}当前金币：${assets.coins}`;
  nodes.coinExchangeConfirm.disabled = !canExchange;
  nodes.coinExchangeKeep.textContent = canExchange ? "保留金币" : "知道了";
  if (assets.coins < exchangeCost) {
    nodes.coinExchangeCopy.textContent = (
      `还差 ${exchangeCost - assets.coins} 枚金币；本次不会扣除金币。`
    );
    nodes.coinExchangeNote.textContent = "只有最终落在兑换站且金币足够时，才能选择兑换。";
  } else {
    nodes.coinExchangeCopy.textContent = (
      "确认后扣除 5 枚金币，本局星星立即增加 1 颗。"
    );
    nodes.coinExchangeNote.textContent = "最终落在兑换站才会出现；路过不触发。";
  }

  return new Promise((resolve) => {
    const choice = {
      locked: false,
      onKeyDown: null,
      resolve,
      restoreFocus() {
        nodes.boardViewport?.focus?.({ preventScroll: true });
      },
    };
    pendingCoinExchangeChoice = choice;
    const finish = (exchange) => {
      if (pendingCoinExchangeChoice !== choice || choice.locked) return;
      choice.locked = true;
      pendingCoinExchangeChoice = null;
      nodes.coinExchangeStage.removeEventListener("keydown", choice.onKeyDown);
      nodes.coinExchangeStage.hidden = true;
      resolve(Boolean(exchange));
      choice.restoreFocus();
    };
    nodes.coinExchangeKeep.onclick = () => {
      boardSounds.play("route-confirm", { pitch: -1 });
      finish(false);
    };
    nodes.coinExchangeConfirm.onclick = () => {
      if (!canExchange) return;
      boardSounds.play("exchange", { intensity: 0.72 });
      finish(true);
    };
    const focusableControls = [
      nodes.coinExchangeKeep,
      nodes.coinExchangeConfirm,
    ];
    choice.onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        return;
      }
      if (event.key !== "Tab") return;
      const available = focusableControls.filter((control) => !control.disabled);
      if (!available.length) {
        event.preventDefault();
        return;
      }
      const first = available[0];
      const last = available.at(-1);
      const active = document.activeElement;
      if (
        event.shiftKey
        && (active === first || !nodes.coinExchangeStage.contains(active))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !event.shiftKey
        && (active === last || !nodes.coinExchangeStage.contains(active))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    hideTurnFeedback();
    nodes.coinExchangeStage.addEventListener("keydown", choice.onKeyDown);
    nodes.coinExchangeStage.hidden = false;
    nodes.coinExchangeCard.focus({ preventScroll: true });
    (canExchange ? nodes.coinExchangeConfirm : nodes.coinExchangeKeep)
      .focus({ preventScroll: true });
  });
}

async function showCollectedCard(cardId, ownerId, presentation = null) {
  const card = currentCardCatalogCard(cardId);
  if (!card) {
    nodes.revealedCardAvatar.textContent = "尚未上传";
    nodes.revealedCardName.textContent = "星星内容未配置";
    nodes.revealedCardStory.textContent = cardId;
  } else {
    nodes.revealedCardAvatar.replaceChildren();
    if (card.image) {
      const image = document.createElement("img");
      image.src = cardCatalogImageUrl(card);
      image.alt = `${card.name}星星图片`;
      image.addEventListener("error", () => {
        nodes.revealedCardAvatar.textContent = "图片暂时无法加载";
      }, { once: true });
      nodes.revealedCardAvatar.append(image);
    } else {
      nodes.revealedCardAvatar.textContent = "尚未上传";
    }
    nodes.revealedCardName.textContent = card.name;
    nodes.revealedCardStory.textContent = card.story || "尚未填写星星说明";
  }
  nodes.cardRevealOwner.textContent = (
    `这张卡已放进 ${playerNameForOwner(ownerId)} 的个人星星记录！`
  );
  hideTurnFeedback();
  nodes.cardRevealStage.hidden = false;
  await sleep(reducedMotionRequested() ? 80 : 220);
  if (presentation) {
    await scheduleCollectionPresentation(presentation);
  } else {
    visiblePlayerAssetsById = {
      ...visiblePlayerAssetsById,
      [ownerId]: playerAssetSnapshot(
        playerAssetsLedger.playerAssetsById[ownerId],
      ),
    };
    renderHud(gameSession);
  }
  await sleep(reducedMotionRequested() ? 260 : 720);
  nodes.cardRevealStage.hidden = true;
}

function settlePlayerAssetsForMove({ baselineRuntime, movedRuntime, effects, ownerId, settlementId }) {
  const composition = resolveWorldComposition(movedRuntime.world.active.worldPackRef, WORLD_REGISTRIES);
  return settlePointsOnlyAssetsForMove({
    ledger: playerAssetsLedger, movedRuntime, effects,
    movingTeamId: baselineRuntime.teams[baselineRuntime.activeTeamIndex].id,
    ownerId, settlementId, composition,
  });
}

function landingRoleCopy(role) {
  if (role === "goal" && circuitPresentationActive()) return "圈终点 · 点数用完停在这里，下一步接起点后格";
  return {
    learning: "任务格 · 下一位继续挑战",
    reward: "停靠格 · 查看最终停格积分",
    item: "线索格 · 发现寻宝线索",
    junction: "岔路格 · 路线已经选择",
    activity: "固定落点效果 · 已完成结算",
    "map-effect": "地图机关 · 以本轮实际结果为准",
    treasure: "停靠格 · 查看最终停格积分",
    transport: "跳跃与滑行 · 抵达前方落点",
    goal: "前进星门 · 即将穿越到下一世界",
  }[role] || "完成本轮移动";
}

function mergeHarborEffects(engineEffects, harborEvents) {
  const afterStep = new Map();
  harborEvents
    .filter(({ routeIndex }) => Number.isSafeInteger(routeIndex))
    .filter(({ type }) => type === "departure_beacon")
    .forEach((event) => {
      if (!afterStep.has(event.routeIndex)) afterStep.set(event.routeIndex, []);
      afterStep.get(event.routeIndex).push(event);
    });
  const signalCannon = harborEvents.find(({ type }) => type === "signal_cannon");
  const foghorn = harborEvents.find(({ type }) => type === "harbor_foghorn");
  const cloudfall = harborEvents.find(({ type }) => type === "cloudfall_gate");
  const merged = [];
  for (const effect of engineEffects) {
    merged.push(effect);
    if (effect.type === "pawn_step") {
      const routeIndex = Number.isSafeInteger(effect.index)
        ? effect.index
        : Number(effect.stepNumber) - 1;
      merged.push(...(afterStep.get(routeIndex) || []).map((event) => ({
        ...event,
        effectId: event.eventId,
      })));
    }
    if (effect.type === "transport_move" && signalCannon) {
      const authoredCaptureNodeIds = Array.isArray(effect.captureNodeIds)
        ? [...effect.captureNodeIds]
        : [...(signalCannon.throughNodeIds || [])];
      Object.assign(effect, {
        firstTime: signalCannon.firstTime,
        animationVariant: signalCannon.animationVariant,
        throughNodeIds: authoredCaptureNodeIds,
        coldLanding: true,
      });
    }
    if (effect.type === "map_effect") {
      const harborEvent = effect.mapEffectRef === "harbor.cloudfall-gate.v1"
        ? cloudfall
        : foghorn;
      if (harborEvent) {
        Object.assign(effect, {
          firstTime: harborEvent.firstTime,
          animationVariant: harborEvent.animationVariant,
          targetMode: harborEvent.targetMode,
          holdThroughTurn: harborEvent.holdThroughTurn,
        });
      }
    }
  }
  return merged;
}

async function runAcceptedTurn(turnCommand) {
  if (
    busy
    || runtime.currentActivity
    || gameSession?.screen !== "PLAYING"
    || gameSession.phase !== "ANSWER_LISTENING"
    || gameSession.inputGate !== "open"
  ) return;
  let authorizedTurn;
  try {
    authorizedTurn = turnFlowGuard.consumeTurnCommand(turnCommand, {
      context: currentSpeechTurnContext(),
    });
  } catch (error) {
    console.error("voice board rejected an unauthorized turn", error);
    speechStatus = "error";
    speechTranscript = "这次回答没有通过回合校验，请重新回答";
    pendingSpeechDecision = null;
    pendingTurnCommand = null;
    renderSpeechControls();
    return;
  }
  return runBoardTurn(authorizedTurn);
}

async function runBoardTurn(authorizedTurn) {
  const teacherMove = authorizedTurn.source === "teacher" && isTeacherSession(gameSession);
  const { attemptId, resolution, triggerReason, speechDecision } = authorizedTurn;
  busy = true;
  renderTeacherPanel();
  pauseSentenceListener(speechStatus === "accepted" ? "accepted" : "idle");
  cancelCameraAnimation();
  cancelBoardPan();
  const rewardProfile = teacherMove ? { diceTier: TEACHER_DICE, diceLabel: teacherDiceLabel(gameSession),
    score: null, requiresChoice: false, outcomeLabel: "老师奖励", tone: "success" }
    : turnRewardProfile({ resolution, missing: speechDecision?.missing, aiScore: speechDecision?.score });
  const baselineRuntime = runtime;
  const baselineSession = gameSession;
  const baselinePlayerAssetsLedger = playerAssetsLedger;
  const baselineVisiblePlayerAssets = structuredClone(visiblePlayerAssetsById);
  const baselineFairy = fairyState;
  const baselineDicePresentation = lastDicePresentation;
  const baselineVisitedNodeIds = new Set(visitedNodeIds);
  const baselineCamera = { ...camera };
  let result = null;
  let pendingSession = null;
  let assetSettlement = null;
  let pendingCollectionPresentations = [];
  let dieRoll = null;
  let harborSettlement = null;
  let worldPlan = null;
  let crossedWorld = false;
  let failureMessage = "";
  let scoreRetryRequested = false;
  let transactionPersisted = false;
  try {
    if (!rewardProfile.diceTier) {
      throw new Error("a valid AI score or teacher support decision is required");
    }
    const turnStartRuntime = runtime;
    const movingTeam = runtime.teams[runtime.activeTeamIndex];
    const actorSeat = currentSessionSeat(gameSession);
    if (!actorSeat) throw new Error("the active player asset owner is unavailable");
    const turnStartWorld = runtime.world?.active;
    const circuitTurn = currentWorldRoute().circuit?.policy === "individual-laps-v1";
    const serverTurn = usesLandingPoints() ? landingPoints.getTurn(landingGameId(), attemptId) : null;
    // A saved server plan is immutable. Only unplanned moves adopt the corrected
    // finish boundary; a locked pre-fix route keeps its original landing.
    const frozenWorldPlan = serverTurn?.plan && ["planned", "awarded"].includes(serverTurn.status)
      ? structuredClone(serverTurn.plan) : null;
    const stopAtCircuitFinish = circuitTurn && (!frozenWorldPlan || Array.isArray(frozenWorldPlan.lapCompletions));
    const nextWorldInstanceId = circuitTurn ? turnStartWorld.instanceId : serverTurn?.nextWorldInstanceId || (
      `${gameSession.sessionId}:world:${turnStartWorld.ordinal + 1}`
    );
    const savedRouteChoices = serverTurn
      ? landingPoints.getRouteChoices(landingGameId(), attemptId) || {} : {};
    const isCloudHarborTurn = (
      isCloudHarborWorldRef(turnStartWorld?.worldPackRef)
    );
    const transcript = teacherMove ? "老师奖励一次掷骰机会" : speechDecision?.transcript || "整句朗读已经完成";
    const guidance = speechDecisionGuidance(speechDecision, rewardProfile);

    if (!teacherMove) {
    renderTurnFeedback({
      profile: rewardProfile,
      transcript,
      guidance,
      phase: "judgement",
      moveText: speechDecision?.knowledgeStatus === "wrong"
        ? "规则判定完成"
        : Number.isFinite(rewardProfile.score)
          ? "AI 评分完成"
          : "老师助力完成",
    });
    await sleep(520);
    renderTurnFeedback({
      profile: rewardProfile,
      title: Number.isFinite(rewardProfile.score)
        ? `本轮表现 ${Math.round(rewardProfile.score)} 分`
        : rewardProfile.outcomeLabel,
      kicker: "表现分已经确认",
      transcript,
      guidance,
      phase: "reward",
      moveText: "接下来由分数选择合法骰子档位",
    });
    await sleep(420);

    }
    dieRoll = teacherMove
      ? doubleDiceSteps(gameSession.teacherOpportunity) !== null ? await rollTeacherDoubleDice() : await rollTeacherDie()
      : await chooseDieForProfile(rewardProfile);
    if (dieRoll === DICE_CHOICE_RETRY) {
      scoreRetryRequested = true;
      return;
    }
    if (!dieRoll) throw new DOMException("Dice choice cancelled", "AbortError");
    dieRoll = pointsOnlyDiceRoll(dieRoll);
    const resolvedDieValue = dieRoll.steps;

    const routeChoices = { ...(savedRouteChoices[turnStartWorld.instanceId] || {}) };
    let presentedLocalRouteNodeIds = [];
    let presentedDestinationRouteNodeIds = [];
    let presentedWorldTransition = null;
    const startingExit = (activeBoardTemplate.exits || []).find(
      ({ nodeId }) => nodeId === movingTeam.nodeId,
    );

    movingTeamId = movingTeam.id;
    visualNodeId = movingTeam.nodeId;
    renderBoard();

    nodes.die.textContent = String(resolvedDieValue);
    nodes.die.dataset.diceFamily = dieRoll.poolId;
    nodes.dieKind.textContent = dieRoll.poolLabel;
    nodes.voiceState.textContent = `已选择${dieRoll.poolLabel} · 摇出 ${resolvedDieValue} 格`;
    renderTurnFeedback({
      profile: rewardProfile,
      title: doubleDiceSteps(dieRoll) !== null
        ? `双骰 ${dieRoll.faceIndices.map((index) => index + 1).join(" + ")} = ${resolvedDieValue} 格`
        : `摇出 ${dieRoll.face?.label || `${resolvedDieValue} 点`}`,
      kicker: "骰子 SHOWTIME",
      transcript,
      guidance: doubleDiceSteps(dieRoll) !== null
        ? "两颗骰子的点数相加，停稳后领取最终格家园积分。"
        : dieRoll.face?.label?.includes("+")
        ? `这个骰面还有惊喜：${dieRoll.face.label}`
        : teacherMove ? `${teacherDiceLabel(gameSession)}的六个面等概率，停稳后领取最终格家园积分。` : "同一个表现分，也会摇出不同点数和寻宝故事。",
      phase: "dice",
      moveText: `${movingTeam.label} 前进 ${resolvedDieValue} 格`,
    });
    await sleep(420);

    let pendingPlan = startingExit
      ? null
      : findPendingRouteChoice(
          activeBoardTemplate,
          movingTeam.nodeId,
          resolvedDieValue,
          routeChoices,
          runtime.mapState,
        );
    while (pendingPlan) {
      const automaticChoice = automaticChoiceForMove(pendingPlan, { routeChoices });
      if (automaticChoice) {
        Object.assign(routeChoices, automaticChoice);
        pendingPlan = findPendingRouteChoice(activeBoardTemplate, movingTeam.nodeId,
          resolvedDieValue, routeChoices, runtime.mapState);
        continue;
      }
      presentedLocalRouteNodeIds = await presentRouteChoiceApproach(
        pendingPlan,
        {
          movingTeam,
          totalSteps: resolvedDieValue,
          alreadyPresentedNodeIds: presentedLocalRouteNodeIds,
          presentationId: attemptId,
        },
      );
      const selectedRoute = await chooseRouteForMove(pendingPlan, {
        movingTeam,
      });
      if (!selectedRoute) {
        throw new DOMException("Route choice cancelled", "AbortError");
      }
      Object.assign(routeChoices, selectedRoute);
      pendingPlan = findPendingRouteChoice(
        activeBoardTemplate,
        movingTeam.nodeId,
        resolvedDieValue,
        routeChoices,
        runtime.mapState,
      );
    }

    const plannedMove = startingExit
      ? {
          nodeIds: [],
          edgeIds: [],
          transport: null,
        }
      : walkBoardPlan(
          activeBoardTemplate,
          movingTeam.nodeId,
          resolvedDieValue,
          routeChoices,
          runtime.mapState,
        );
    if (!nodeSequenceIsPrefix(presentedLocalRouteNodeIds, plannedMove.nodeIds)) {
      throw new Error("presented route is not a prefix of the committed move plan");
    }
    const plannedDestinationId = plannedMove.nodeIds.at(-1) || movingTeam.nodeId;
    const plannedDestination = nodeById.get(plannedDestinationId);
    const plannedExit = (activeBoardTemplate.exits || []).find(
      ({ nodeId }) => nodeId === plannedDestinationId,
    );
    const plannedWorldTransition = plannedExit && (!stopAtCircuitFinish || plannedMove.nodeIds.length < resolvedDieValue)
      ? worldRouteTransitionForExit(
          activeWorldComposition.worldRef,
          plannedExit.id,
        )
      : null;
    const plannedNextWorld = plannedWorldTransition
      ? resolveWorldComposition(plannedWorldTransition.toWorldRef, WORLD_REGISTRIES)
      : null;
    plannedMove.transport = plannedDestination?.spaceRole === "transport"
      ? plannedDestination
      : null;
    const plannedTransportSkin = plannedMove.transport
      ? theme.transportSkins[plannedMove.transport.transportProfileRef]
      : null;
    const plannedTransportVia = (
      plannedMove.transport?.transportCaptureNodeIds || []
    ).map((nodeId) => {
      const node = nodeById.get(nodeId);
      return nodeKindLabel(activeNodeKind(nodeId, node?.spaceRole));
    });
    const plannedTransportTarget = nodeById.get(
      plannedMove.transport?.transportTargetId,
    );
    const plannedTransportCopy = plannedWorldTransition?.circuit
      ? `完整 ${resolvedDieValue} 格 · 完成一圈后回到云港起点，剩余点数继续前进`
      : plannedNextWorld
      ? (
          `完整 ${resolvedDieValue} 格 · 到前进星门后穿越至`
          + `${plannedNextWorld.worldPack.title}`
          + `${plannedWorldTransition.repeatableTail
            ? `第 ${Number(runtime.world?.active?.ordinal || 1) + 1} 世界`
            : ""}`
          + "，剩余点数继续前进"
        )
      : plannedMove.transport
      ? (
          `计划 ${plannedMove.nodeIds.length} 格后触发`
          + `${plannedTransportSkin?.label || "地图运输设施"}`
          + (plannedTransportVia.length
            ? ` · 飞越${plannedTransportVia.join("、")}`
            : "")
          + (plannedTransportTarget
            ? ` · 落在${nodeKindLabel(activeNodeKind(
                plannedTransportTarget.id,
                plannedTransportTarget.spaceRole,
              ))}`
            : "")
        )
      : `计划前进 ${plannedMove.nodeIds.length} 格`;
    movePlanPresentation = {
      nodeIds: plannedMove.nodeIds,
      edgeIds: plannedMove.edgeIds,
      transport: plannedMove.transport,
    };
    renderBoard();
    renderTurnFeedback({
      profile: rewardProfile,
      title: plannedWorldTransition?.circuit
        ? `${movingTeam.label} 的云港循环路线已规划`
        : plannedWorldTransition
        ? `${movingTeam.label} 的星门前路线已规划`
        : `${movingTeam.label} 的完整路线已规划`,
      kicker: `骰子 ${resolvedDieValue} 点`,
      transcript,
      guidance: plannedWorldTransition?.circuit
        ? "完成一圈只返回自己的棋子；其他同学留在原位置，各自继续绕圈。"
        : plannedWorldTransition
        ? "棋子会先走到星门；新世界若有岔路，也会抵达路口后再选择。"
        : "棋子会先走到真实岔路口再选择，并只结算最终落点。",
      phase: "move",
      moveText: plannedTransportCopy,
    });
    await sleep(260);

    if (isCloudHarborTurn) {
      harborSettlement = settleHarborTurn({
        mapState: turnStartRuntime.mapState,
        settlementId: attemptId,
        seatId: actorSeat.id,
        activeSeatCount: gameSession.seats.length,
        effectiveTurn: (turnStartRuntime.completedMoveCount ?? turnStartRuntime.acceptedCount) + 1,
        startNodeId: movingTeam.nodeId,
        plannedRouteNodeIds: plannedMove.nodeIds,
        plannedRouteEdgeIds: plannedMove.edgeIds,
        boardNodes: activeBoardTemplate.nodes,
        boardTemplateRef: `${activeBoardTemplate.id}@${activeBoardTemplate.version}`,
        fairyActive: fairyState.status === FAIRY_STATUS.active,
      });
      if (harborSettlement.duplicate) {
        runtime = baselineRuntime;
        lastDicePresentation = baselineDicePresentation;
        failureMessage = "这一轮地图道具已经结算过了，没有重复移动";
        return;
      }
    }

    const committedLocalNodeIds = harborSettlement?.committedRouteNodeIds
      || plannedMove.nodeIds;
    if (!nodeSequenceIsPrefix(presentedLocalRouteNodeIds, committedLocalNodeIds)) {
      throw new Error("committed route diverged from the presented route approach");
    }
    const committedLocalDestinationId = committedLocalNodeIds.at(-1)
      || movingTeam.nodeId;
    const committedExit = (activeBoardTemplate.exits || []).find(
      ({ nodeId }) => nodeId === committedLocalDestinationId,
    );
    const committedWorldTransition = committedExit && (!stopAtCircuitFinish || committedLocalNodeIds.length < resolvedDieValue)
      ? worldRouteTransitionForExit(
          turnStartWorld.worldPackRef,
          committedExit.id,
        )
      : null;
    let destinationComposition = null;
    let destinationEntryNodeId = null;
    let remainingWorldSteps = 0;
    const destinationRouteChoices = { ...(circuitTurn ? routeChoices : savedRouteChoices[nextWorldInstanceId] || {}) };
    if (committedWorldTransition) {
      destinationComposition = resolveWorldComposition(
        committedWorldTransition.toWorldRef,
        WORLD_REGISTRIES,
      );
      remainingWorldSteps = Math.max(
        0,
        resolvedDieValue - committedLocalNodeIds.length,
      );
      destinationEntryNodeId = destinationComposition.board.entryNodeId
        || destinationComposition.board.startNodeId;
      const destinationMapState = structuredClone(
        committedWorldTransition.circuit
          ? (harborSettlement?.mapState || turnStartWorld.mapState || {})
          : destinationComposition.level.initialMapState || {},
      );
      let destinationPendingPlan = remainingWorldSteps > 0
        ? findPendingRouteChoice(
            destinationComposition.board,
            destinationEntryNodeId,
            remainingWorldSteps,
            destinationRouteChoices,
            destinationMapState,
          )
        : null;
      if (destinationPendingPlan) {
        presentedLocalRouteNodeIds = await presentPawnRoutePrefix(
          committedLocalNodeIds,
          {
            movingTeam,
            totalSteps: resolvedDieValue,
            alreadyPresentedNodeIds: presentedLocalRouteNodeIds,
            presentationId: attemptId,
            statusLabel: circuitTurn ? "正在完成本圈" : "正在前往星门",
          },
        );
        const transitionEffect = {
          type: circuitTurn ? "lap_return" : "world_transition",
          effectId: `${attemptId}:world-transition:preview`,
          fromWorldInstanceId: turnStartWorld.instanceId,
          fromWorldOrdinal: turnStartWorld.ordinal,
          fromWorldRef: turnStartWorld.worldPackRef,
          toWorldInstanceId: nextWorldInstanceId,
          toWorldOrdinal: turnStartWorld.ordinal + 1,
          toWorldRef: destinationComposition.worldRef,
          toEntryNodeId: destinationEntryNodeId,
          ...(circuitTurn ? { worldRef: turnStartWorld.worldPackRef, worldInstanceId: turnStartWorld.instanceId,
            fromNodeId: committedExit.nodeId, toNodeId: destinationEntryNodeId, zeroStepCost: true } : {}),
        };
        if (circuitTurn) {
          await playCircuitLapReturn(transitionEffect, movingTeam);
        } else {
          const presentationRuntime = worldTransitionPresentationRuntime({
            baselineRuntime: turnStartRuntime,
            destinationComposition,
            destinationInstanceId: nextWorldInstanceId,
            destinationOrdinal: turnStartWorld.ordinal + 1,
            entryNodeId: destinationEntryNodeId,
          });
          await playWorldTransition(transitionEffect, movingTeam, presentationRuntime);
        }
        presentedWorldTransition = transitionEffect;
      }
      while (destinationPendingPlan) {
        const automaticChoice = automaticChoiceForMove(destinationPendingPlan, {
          composition: destinationComposition,
          routeChoices: destinationRouteChoices,
          mapState: destinationMapState,
        });
        if (automaticChoice) {
          Object.assign(destinationRouteChoices, automaticChoice);
          destinationPendingPlan = findPendingRouteChoice(destinationComposition.board,
            destinationEntryNodeId, remainingWorldSteps, destinationRouteChoices, destinationMapState);
          continue;
        }
        presentedDestinationRouteNodeIds = await presentRouteChoiceApproach(
          destinationPendingPlan,
          {
            movingTeam,
            totalSteps: resolvedDieValue,
            alreadyPresentedNodeIds: presentedDestinationRouteNodeIds,
            presentationId: `${attemptId}:destination`,
            stepNumberOffset: committedLocalNodeIds.length,
          },
        );
        const selectedRoute = await chooseRouteForMove(destinationPendingPlan, {
          movingTeam,
          composition: destinationComposition,
          ...(circuitTurn ? { afterWorldTransition: false } : { afterWorldTransition: true }),
        });
        if (!selectedRoute) {
          throw new DOMException("Route choice cancelled", "AbortError");
        }
        Object.assign(destinationRouteChoices, selectedRoute);
        destinationPendingPlan = findPendingRouteChoice(
          destinationComposition.board,
          destinationEntryNodeId,
          remainingWorldSteps,
          destinationRouteChoices,
          destinationMapState,
        );
      }
      if (remainingWorldSteps > 0) {
        renderTurnFeedback({
          profile: rewardProfile,
          title: `${movingTeam.label} 的${circuitTurn ? "云港循环" : "跨世界"}完整路线已确定`,
          kicker: `${circuitTurn ? "本圈完成" : "星门穿越"} · 还剩 ${remainingWorldSteps} 格`,
          transcript,
          guidance: circuitTurn ? "回到起点不消耗骰点，剩余点数继续逐格移动。" : "星门本身不消耗骰点，进入新世界后仍会逐格移动。",
          phase: "move",
          moveText: circuitTurn ? "在同一张云港地图继续下一圈" : committedWorldTransition.repeatableTail
            ? `进入第 ${turnStartWorld.ordinal + 1} 世界`
            : `进入${destinationComposition.worldPack.title}`,
        });
        await sleep(220);
      }
    }
    const usesWorldEngine = !isCloudHarborTurn || Boolean(committedExit) || (teacherMove && doubleDiceSteps(dieRoll) !== null);

    if (usesWorldEngine) {
      const runtimeMapState = structuredClone(
        harborSettlement?.mapState
        || turnStartWorld?.mapState
        || runtime.mapState
        || {},
      );
      const runtimeForWorldAnswer = {
        ...turnStartRuntime,
        mapState: runtimeMapState,
        world: {
          ...turnStartRuntime.world,
          active: {
            ...turnStartRuntime.world.active,
            mapState: runtimeMapState,
          },
        },
      };
      const routeChoicesByWorldInstance = {
        [turnStartWorld.instanceId]: routeChoices,
      };
      const mapStatesByWorldInstance = {
        [turnStartWorld.instanceId]: runtimeMapState,
      };
      if (committedWorldTransition && destinationComposition) {
        routeChoicesByWorldInstance[nextWorldInstanceId] = destinationRouteChoices;
      }
      worldPlan = frozenWorldPlan || walkWorldPlan({
        moveId: attemptId,
        worldInstanceId: turnStartWorld.instanceId,
        nextWorldInstanceId,
        worldOrdinal: turnStartWorld.ordinal,
        worldRef: turnStartWorld.worldPackRef,
        startNodeId: movingTeam.nodeId,
        steps: resolvedDieValue,
        ...(doubleDiceSteps(dieRoll) !== null ? { dicePolicy: dieRoll.dicePolicy, faceIndices: [...dieRoll.faceIndices] } : {}),
        routeChoicesByWorldInstance,
        mapStatesByWorldInstance,
        worldRoute: currentWorldRoute(),
        registries: WORLD_REGISTRIES,
      });
      crossedWorld = worldPlan.transitions.length > 0;
      const finalComposition = resolveWorldComposition(
        worldPlan.finalLocation.worldRef,
        WORLD_REGISTRIES,
      );
      result = (teacherMove ? rollTeacherWorldMove : acceptWorldAnswer)({
        attemptId,
        runtime: runtimeForWorldAnswer,
        learningPack,
        activityTemplates: ACTIVITY_TEMPLATES,
        worldPlan,
        finalBoard: finalComposition.board,
        finalMapState: worldPlan.arrivalState.mapState,
      });
      const finalTheme = composedThemeForWorld(finalComposition);
      result.runtime = {
        ...result.runtime,
        boardId: finalComposition.board.id,
        themeId: finalTheme.id,
        mapState: structuredClone(result.runtime.world.active.mapState),
      };
    } else {
      result = (teacherMove ? rollTeacherMove : acceptAnswer)({
        attemptId,
        runtime,
        board: activeBoardTemplate,
        learningPack,
        activityTemplates: ACTIVITY_TEMPLATES,
        dieValue: resolvedDieValue,
        routeChoices,
        mapState: runtime.mapState,
      });
    }

    if (result.duplicate) {
      runtime = baselineRuntime;
      lastDicePresentation = baselineDicePresentation;
      failureMessage = "这一轮已经记录过了，没有重复移动";
      return;
    }
    const retiredActivityEffects = result.effects.filter(
      (effect) => effect.type === "activity_open",
    );
    if (result.runtime.currentActivity || retiredActivityEffects.length) {
      console.error(
        "retired final-landing classroom activity was discarded",
        retiredActivityEffects,
      );
      result = {
        ...result,
        runtime: closeActivity(result.runtime),
        effects: result.effects.filter((effect) => effect.type !== "activity_open"),
      };
    }
    const acceptedStartWorldNodeIds = result.effects
      .filter((effect) => effect.type === "pawn_step")
      .filter((effect) => (
        !effect.worldInstanceId
        || effect.worldInstanceId === turnStartWorld.instanceId
      ))
      .map((effect) => effect.nodeId);
    const acceptedRouteNodeIds = circuitTurn && committedExit
      ? acceptedStartWorldNodeIds.slice(0, committedLocalNodeIds.length) : acceptedStartWorldNodeIds;
    if (!nodeSequenceIsPrefix(presentedLocalRouteNodeIds, acceptedRouteNodeIds)) {
      throw new Error("accepted move diverged from the presented local route");
    }
    const acceptedDestinationRouteNodeIds = result.effects
      .filter((effect) => (
        effect.type === "pawn_step"
        && effect.worldInstanceId === nextWorldInstanceId
      ))
      .map((effect) => effect.nodeId)
      .slice(circuitTurn ? committedLocalNodeIds.length : 0);
    if (!nodeSequenceIsPrefix(
      presentedDestinationRouteNodeIds,
      acceptedDestinationRouteNodeIds,
    )) {
      throw new Error("accepted move diverged from the presented destination route");
    }
    if (presentedWorldTransition) {
      const acceptedWorldTransition = result.effects.find(
        (effect) => effect.type === (circuitTurn ? "lap_return" : "world_transition"),
      );
      if (circuitTurn ? (
        !acceptedWorldTransition
        || acceptedWorldTransition.worldInstanceId !== presentedWorldTransition.worldInstanceId
        || acceptedWorldTransition.worldRef !== presentedWorldTransition.worldRef
        || acceptedWorldTransition.fromNodeId !== presentedWorldTransition.fromNodeId
        || acceptedWorldTransition.toEntryNodeId !== presentedWorldTransition.toEntryNodeId
      ) : (
        !acceptedWorldTransition
        || acceptedWorldTransition.fromWorldInstanceId
          !== presentedWorldTransition.fromWorldInstanceId
        || acceptedWorldTransition.fromWorldRef
          !== presentedWorldTransition.fromWorldRef
        || acceptedWorldTransition.toWorldInstanceId
          !== presentedWorldTransition.toWorldInstanceId
        || acceptedWorldTransition.toWorldRef
          !== presentedWorldTransition.toWorldRef
        || acceptedWorldTransition.toEntryNodeId
          !== presentedWorldTransition.toEntryNodeId
      )) {
        throw new Error("accepted move diverged from the presented world transition");
      }
    }
    if (harborSettlement && (
      JSON.stringify(acceptedRouteNodeIds)
      !== JSON.stringify(harborSettlement.committedRouteNodeIds)
    )) {
      throw new Error("accepted route diverged from the committed harbor move plan");
    }
    const acceptedTransport = result.effects.find(
      (effect) => effect.type === "transport_move",
    );
    if (harborSettlement?.transport && (
      acceptedTransport?.fromNodeId !== harborSettlement.transport.fromNodeId
      || acceptedTransport?.toNodeId !== harborSettlement.transport.toNodeId
      || JSON.stringify(acceptedTransport?.captureNodeIds || [])
        !== JSON.stringify(harborSettlement.transport.throughNodeIds || [])
    )) {
      throw new Error("accepted transport diverged from the BoardTemplate harbor route");
    }

    if (harborSettlement && !crossedWorld) {
      result.runtime = {
        ...result.runtime,
        mapState: harborSettlement.mapState,
        world: {
          ...result.runtime.world,
          active: {
            ...result.runtime.world?.active,
            mapState: structuredClone(harborSettlement.mapState),
          },
        },
      };
    }
    if (harborSettlement) {
      result.effects = mergeHarborEffects(
        result.effects,
        harborSettlement.events,
      );
    }
    assetSettlement = settlePlayerAssetsForMove({
      baselineRuntime: turnStartRuntime,
      movedRuntime: result.runtime,
      effects: result.effects,
      diceRoll: dieRoll,
      ownerId: actorSeat.id,
      settlementId: attemptId,
    });
    result.runtime = {
      ...result.runtime,
      mapState: structuredClone(assetSettlement.mapState),
      world: {
        ...result.runtime.world,
        active: {
          ...result.runtime.world.active,
          mapState: structuredClone(assetSettlement.mapState),
          levelState: structuredClone(assetSettlement.levelState),
        },
      },
    };
    pendingSession = (teacherMove ? commitTeacherTurn : commitTriggeredTurn)(gameSession, {
      attemptId,
      eventId: `${attemptId}:presentation`,
      taskId: result.task?.id || null,
      resolution,
      triggerReason,
    });
    if (usesLandingPoints()) {
      const routeChoicesByWorldInstance = { [turnStartWorld.instanceId]: routeChoices };
      if (committedWorldTransition) routeChoicesByWorldInstance[nextWorldInstanceId] = destinationRouteChoices;
      const authoritative = await landingPoints.plan(landingGameId(), { attemptId, routeChoicesByWorldInstance });
      assertLandingPlan({ turn: authoritative.turn, attemptId, studentId: actorSeat.id,
        runtime: result.runtime, effects: result.effects, landingNodeId: assetSettlement.landingNodeId });
    }
    persistStableSession(
      result.runtime,
      pendingSession,
      assetSettlement.ledger,
      assetSettlement.fairy,
      { required: true },
    );
    transactionPersisted = true;
    const revealHarborMapFields = (...fieldNames) => {
      if (!isCloudHarborWorldRef(result.runtime.world?.active?.worldPackRef)) {
        return;
      }
      const revealed = { ...runtime.mapState };
      for (const fieldName of fieldNames) {
        revealed[fieldName] = result.runtime.mapState[fieldName];
      }
      runtime = {
        ...runtime,
        mapState: createHarborMapState(revealed),
      };
      renderBoard();
    };
    playerAssetsLedger = assetSettlement.ledger;
    fairyState = assetSettlement.fairy;
    pendingCollectionPresentations = buildCollectionPresentationEvents({
      events: assetSettlement.events,
      landingNodeId: assetSettlement.landingNodeId,
      fairyCaptureNodeId: assetSettlement.fairyCaptureNodeId,
    });
    renderHud(pendingSession);
    movePlanPresentation = null;
    renderBoard();
    const immediateCollections = pendingCollectionPresentations.filter((presentation) => (
      ["answer", "dice", "milestone"].includes(presentation.source)
    ));
    pendingCollectionPresentations = pendingCollectionPresentations.filter(
      (presentation) => !immediateCollections.includes(presentation),
    );
    void scheduleCollectionSequence(immediateCollections);

    movingTeamId = movingTeam.id;
    visualNodeId ||= movingTeam.nodeId;
    const pawnSteps = result.effects.filter((effect) => effect.type === "pawn_step");
    let completedSteps = 0;
    let consumedPresentedLocalSteps = 0;
    let consumedPresentedDestinationSteps = 0;
    let consumedPresentedWorldTransition = false;
    let passedCircuitReturn = false;
    const routeEventWasAlreadyPresented = (effect) => (
      Number.isSafeInteger(effect.routeIndex)
      && effect.routeIndex < presentedLocalRouteNodeIds.length
    );
    const landingSummaryParts = [];
    for (const effect of result.effects) {
      if (effect.type === "pawn_step") {
        completedSteps += 1;
        const belongsToTurnStartWorld = (
          !effect.worldInstanceId
          || effect.worldInstanceId === turnStartWorld.instanceId
        ) && (!circuitTurn || !passedCircuitReturn);
        const belongsToDestinationWorld = (
          effect.worldInstanceId === nextWorldInstanceId
        ) && (!circuitTurn || passedCircuitReturn);
        const expectedPresentedLocalNodeId = (
          presentedLocalRouteNodeIds[consumedPresentedLocalSteps]
        );
        const expectedPresentedDestinationNodeId = (
          presentedDestinationRouteNodeIds[consumedPresentedDestinationSteps]
        );
        const wasAlreadyPresented = (
          (belongsToTurnStartWorld
            && effect.nodeId === expectedPresentedLocalNodeId)
          || (belongsToDestinationWorld
            && effect.nodeId === expectedPresentedDestinationNodeId)
        );
        if (
          belongsToTurnStartWorld
          && expectedPresentedLocalNodeId
          && !wasAlreadyPresented
        ) {
          throw new Error("accepted move diverged from the presented route approach");
        }
        if (
          belongsToDestinationWorld
          && expectedPresentedDestinationNodeId
          && !wasAlreadyPresented
        ) {
          throw new Error("accepted move diverged from the presented destination approach");
        }
        if (wasAlreadyPresented) {
          if (belongsToTurnStartWorld) consumedPresentedLocalSteps += 1;
          if (belongsToDestinationWorld) consumedPresentedDestinationSteps += 1;
          visitedNodeIds.add(effect.nodeId);
        } else {
          renderTurnFeedback({
            profile: rewardProfile,
            title: `${movingTeam.label} 正在前进`,
            kicker: `骰子 ${resolvedDieValue} 点`,
            transcript,
            guidance,
            phase: "move",
            moveText: `移动 ${completedSteps}/${pawnSteps.length} 格`,
          });
          await playPawnStep(effect, movingTeam, {
            stepNumber: completedSteps,
            totalSteps: pawnSteps.length,
          });
        }
        const stepCollections = pendingCollectionPresentations.filter(
          (presentation) => presentation.originNodeId === effect.nodeId,
        );
        pendingCollectionPresentations = pendingCollectionPresentations.filter(
          (presentation) => !stepCollections.includes(presentation),
        );
        void scheduleCollectionSequence(stepCollections);
      }
      if (effect.type === "lap_return") {
        passedCircuitReturn = true;
        if (presentedWorldTransition?.type === "lap_return") {
          if (consumedPresentedWorldTransition) throw new Error("presented lap return was accepted more than once");
          consumedPresentedWorldTransition = true;
        } else await playCircuitLapReturn(effect, movingTeam);
        landingSummaryParts.push("完成一圈 · 云港继续冒险");
      }
      if (effect.type === "world_transition") {
        const destination = resolveWorldComposition(
          effect.toWorldRef,
          WORLD_REGISTRIES,
        );
        renderTurnFeedback({
          profile: rewardProfile,
          title: "前进星门已经开启",
          kicker: "共享远征 · 穿越新世界",
          transcript,
          guidance: "传送门不消耗骰点，全班棋子抵达新入口，当前棋子继续走完剩余点数。",
          phase: "effect",
          moveText: `进入 ${destination.worldPack.title}`,
        });
        if (presentedWorldTransition) {
          if (consumedPresentedWorldTransition) {
            throw new Error("presented world transition was accepted more than once");
          }
          consumedPresentedWorldTransition = true;
        } else {
          await playWorldTransition(effect, movingTeam, result.runtime);
        }
        landingSummaryParts.push(`穿越至${destination.worldPack.title}`);
      }
      if (effect.type === "departure_beacon") {
        revealHarborMapFields("departureBeaconLit");
        if (routeEventWasAlreadyPresented(effect)) {
          await playCommittedRouteEventConfirmation(effect, movingTeam);
        } else {
          await playDepartureBeacon(effect, movingTeam);
        }
        landingSummaryParts.push(
          effect.firstTime
            ? "离港光点 · 全班航道正式点亮"
            : "离港光点 · 安全进入风帆高地",
        );
      }
      if (effect.type === "transport_move") {
        const skin = theme.transportSkins[effect.transportProfileRef] || {
          label: "跳步发射器",
          announcement: "发现一条空中捷径！",
        };
        const isHarborTransport = (
          isCloudHarborWorldRef(effect.worldRef || result.runtime.world?.active?.worldPackRef)
        );
        renderTurnFeedback({
          profile: rewardProfile,
          title: `触发 ${skin.label}`,
          kicker: isHarborTransport ? "云霄信号炮点火" : skin.announcement,
          transcript,
          guidance: isHarborTransport
            ? "信号炮轰开云礁，角色沿着云光航线额外前进 3 格！"
            : "秘境运输机关锁定终点，角色沿发光航线跳到前方落点。",
          phase: "effect",
          moveText: "机关航线启动",
        });
        await sleep(effect.firstTime === false ? 90 : 160);
        await playTransportMove(effect, movingTeam);
        if (isHarborTransport && !isCurrentCloudHarborWorldRef(effect.worldRef || result.runtime.world?.active?.worldPackRef)) revealHarborMapFields("cloudReefCleared");
        const transportCollections = pendingCollectionPresentations.filter(
          (presentation) => presentation.originNodeId === effect.toNodeId,
        );
        pendingCollectionPresentations = pendingCollectionPresentations.filter(
          (presentation) => !transportCollections.includes(presentation),
        );
        void scheduleCollectionSequence(transportCollections);
        landingSummaryParts.push(`${skin.label} · 抵达前方落点`);
      }
      if (effect.type === "map_effect") {
        const skin = mapEffectSkin(effect.mapEffectRef);
        const resultCopy = mapEffectResultCopy(effect, skin);
        const isHarborMapEffect = (
          isCloudHarborWorldRef(effect.worldRef || result.runtime.world?.active?.worldPackRef)
        );
        const isCloudfallGate = effect.mapEffectRef === "harbor.cloudfall-gate.v1";
        const changesWorldRoute = effect.mapEffectRef === "beyond-cloud.prism-tree.v1";
        renderTurnFeedback({
          profile: rewardProfile,
          title: `触发 ${skin.label}`,
          kicker: isHarborMapEffect ? "港口航道响应" : "共享世界机关响应",
          transcript,
          guidance: !isHarborMapEffect
            ? changesWorldRoute
              ? "棱晶树会为全班永久开启极光桥；不会读取题目、录音、转写或得分。"
              : "这个机关只记录世界线索，不加个人资源，也不改变可走路线。"
            : isCloudfallGate
            ? "云阶入口只改变共享地图航道，本回合不会额外移动棋子。"
            : "航道微光会驱散局部云雾并标亮前方设施。",
          phase: "effect",
          moveText: resultCopy,
        });
        await sleep(100);
        if (isHarborMapEffect) {
          if (isCloudfallGate) {
            revealHarborMapFields("cloudRouteOpen");
          } else {
            revealHarborMapFields("foghornTriggered", "foghornHoldThroughTurn");
          }
          const presenter = MAP_EFFECT_PRESENTERS[effect.mapEffectRef];
          if (presenter) {
            await presenter(effect, movingTeam);
          } else {
            nodes.voiceState.textContent = `${skin.label}已结算 · 动画暂时跳过`;
          }
        } else {
          await playWorldDeviceEffect(effect, movingTeam);
        }
        landingSummaryParts.push(`${skin.label} · ${resultCopy}`);
      }
    }
    if (consumedPresentedLocalSteps !== presentedLocalRouteNodeIds.length) {
      throw new Error("accepted move omitted part of the presented route approach");
    }
    if (
      consumedPresentedDestinationSteps
      !== presentedDestinationRouteNodeIds.length
    ) {
      throw new Error("accepted move omitted part of the destination route approach");
    }
    if (Boolean(presentedWorldTransition) !== consumedPresentedWorldTransition) {
      throw new Error("accepted move omitted the presented world transition");
    }
    runtime = {
      ...runtime,
      mapState: result.runtime.mapState,
    };
    renderBoard();
    const settledTeam = result.runtime.teams.find((team) => team.id === movingTeam.id);
    const landingNode = nodeById.get(settledTeam?.nodeId);
    if (settledTeam?.nodeId) {
      await playLandingConfirmation(movingTeam.id, settledTeam.nodeId);
      if (usesLandingPoints()) {
        holdCoinFxDisplays();
        try {
          await landingPoints.claim(landingGameId(), attemptId);
          {
            const claimed = landingPoints.getTurn(landingGameId(), attemptId);
            const special = claimed?.specialCell;
            const bonusAward = landingPoints.getSpecialCells(landingGameId())?.bonusAwards?.[`${attemptId}:special`];
            const bonusCredited = special?.bonus > 0 && bonusAward?.status === "awarded";
            landingPointsMessage = bonusCredited
              ? `本轮 +${special.amount} 积分已到账（含特效加成 +${special.bonus}），可在家园使用。`
              : `本轮 +${claimed.points} 积分已到账，可在家园使用。`;
          }
        } catch (error) { showLandingError(error); }
        const coinGains = confirmedCoinGains({
          attemptId,
          turn: landingPoints.getTurn(landingGameId(), attemptId),
          snapshot: currentSpecialCells(),
        });
        const coinOrigin = landingCellPoint(settledTeam.nodeId);
        // Plain landings fly at once; ×N / 红包 cells show the formula banner first.
        if (coinGains.landing && !coinGains.landing.afterBanner) playLandingCoinGain(coinGains.landing, coinOrigin);
        renderPlatformPoints();
        await presentSpecialCellLanding(attemptId);
        if (coinGains.landing?.afterBanner) playLandingCoinGain(coinGains.landing, coinOrigin);
        if (coinGains.redPacket) window.setTimeout(() => playRedPacketCoinGain(coinGains.redPacket), 350);
        else coinFx.unholdIdle();
      }
      await playWorldNodeReveal(
        settledTeam.nodeId,
        assetSettlement.landingReward,
        movingTeam,
      );
    }
    const landingSummary = [
      ...landingSummaryParts,
      usesLandingPoints() ? (() => {
        // Same confirmed amount the coins flew: base, plus a ×N/+N bonus only once awarded.
        const credited = confirmedCoinGains({ attemptId, turn: landingPoints.getTurn(landingGameId(), attemptId), snapshot: currentSpecialCells() }).landing;
        return credited?.credited && landingPoints.getTurn(landingGameId(), attemptId)?.receipt
          ? `家园积分 +${credited.amount} 已到账` : "家园积分待确认，联网后可重试";
      })() : null,
      assetSettlement.landingReward?.semanticType === "ordinary"
        ? null
        : landingNode
          ? (() => {
              const outcome = activeNodeOutcome(landingNode.id);
              return `${outcome.badgeLabel} · ${outcome.shortLabel}`;
            })()
          : assetSettlement.landingReward?.activeCopy
            || landingRoleCopy(landingNode?.spaceRole),
      assetSettlement.summary,
    ].filter(Boolean).join(" · ");

    void scheduleCollectionSequence(pendingCollectionPresentations);
    pendingCollectionPresentations = [];
    renderHud(pendingSession);
    renderBoard();
    renderTurnFeedback({
      profile: rewardProfile,
      title: `${movingTeam.label} 本轮完成`,
      kicker: usesLandingPoints() ? "最终停格积分" : "本轮行动已记录",
      transcript,
      guidance: (
        `${Number.isFinite(rewardProfile.score) ? `${Math.round(rewardProfile.score)} 分` : teacherMove ? "老师奖励" : "课堂助力"}`
        + ` → ${dieRoll.poolLabel} ${resolvedDieValue} 格 → 最终落点结算完成`
      ),
      phase: "summary",
      moveText: landingSummary,
    });
    await sleep(2100);
    hideTurnFeedback();

    const settledSession = acknowledgePresentation(pendingSession, {
      eventId: pendingSession.pendingPresentation.eventId,
      activityPending: false,
    });
    const settledRuntime = syncRuntimeToSession(result.runtime, settledSession);
    runtime = settledRuntime;
    gameSession = settledSession;
    if (usesLandingPoints()) syncCircuitLapProgress();
    pendingSession = null;
  } catch (error) {
    let acceptedStateRecovered = false;
    if (transactionPersisted && result && pendingSession?.pendingPresentation) {
      try {
        const settledSession = acknowledgePresentation(pendingSession, {
          eventId: pendingSession.pendingPresentation.eventId,
          activityPending: false,
        });
        const settledRuntime = syncRuntimeToSession(result.runtime, settledSession);
        runtime = settledRuntime;
        gameSession = settledSession;
        if (assetSettlement) {
          playerAssetsLedger = assetSettlement.ledger;
          syncVisiblePlayerAssets();
          fairyState = assetSettlement.fairy;
        }
        pendingSession = null;
        acceptedStateRecovered = true;
      } catch (settlementError) {
        rewardPresentationEpoch += 1;
        rewardPresentationQueues.clear();
        runtime = baselineRuntime;
        gameSession = baselineSession;
        playerAssetsLedger = baselinePlayerAssetsLedger;
        visiblePlayerAssetsById = baselineVisiblePlayerAssets;
        fairyState = baselineFairy;
        lastDicePresentation = baselineDicePresentation;
        clearSavedSession();
        console.error("universal board settlement recovery failed", settlementError);
      }
    } else {
      runtime = baselineRuntime;
      gameSession = baselineSession;
      playerAssetsLedger = baselinePlayerAssetsLedger;
      visiblePlayerAssetsById = baselineVisiblePlayerAssets;
      fairyState = baselineFairy;
      lastDicePresentation = baselineDicePresentation;
    }
    const recoveredWorldRef = runtime.world?.active?.worldPackRef
      || CLOUD_HARBOR_WORLD_REF;
    if (activeWorldComposition.worldRef !== recoveredWorldRef) {
      activateWorldComposition(recoveredWorldRef, {
        resetCamera: true,
        visitedNodeIds: acceptedStateRecovered
          ? new Set(runtime.teams.map((team) => team.nodeId))
          : new Set(baselineVisitedNodeIds),
      });
      applyTheme();
    }
    if (acceptedStateRecovered) {
      runtime.teams.forEach((team) => visitedNodeIds.add(team.nodeId));
    } else {
      visitedNodeIds = new Set(baselineVisitedNodeIds);
      camera = { ...baselineCamera };
    }
    failureMessage = acceptedStateRecovered
      ? "本轮最终位置已保存，积分以到账记录为准"
      : "这次没有完成，请再试一次";
    if (!acceptedStateRecovered) {
      const retryProfile = turnRewardProfile({ result: "retry" });
      renderTurnFeedback({
        profile: retryProfile,
        title: "这次没有完成",
        transcript: speechDecision?.transcript || "",
        guidance: teacherMove ? (usesLandingPoints() ? "本轮沿用原骰和已确认路线，请恢复网络后重试。" : "这次机会仍保留，请重新掷骰。") : "回到题卡，再读一次就可以继续寻宝。",
        phase: "judgement",
        moveText: "没有移动",
      });
    }
    if (usesLandingPoints()) {
      showLandingError(error);
      if (!acceptedStateRecovered) failureMessage = `${error.message} 本轮沿用原骰和已确认路线，请联网后重试。`;
    }
    console.error("universal board turn failed", error);
  } finally {
    cancelPendingDiceChoice();
    cancelPendingRouteChoice();
    cancelPendingCoinExchangeChoice();
    movePlanPresentation = null;
    const turnCommitted = gameSession?.processedAttemptIds?.includes(attemptId);
    if (scoreRetryRequested) {
      pendingSpeechDecision = null;
      speechTranscript = "上一次分数已取消 · 同一道题可以重新回答一次";
      speechStatus = "retry";
      hideTurnFeedback({ immediate: true });
    } else if (turnCommitted) {
      sentenceListener?.destroy();
      sentenceListener = null;
      sentenceListenerTurnKey = null;
      pendingSpeechDecision = null;
      speechTranscript = "";
      speechStatus = "idle";
    }
    movingTeamId = null;
    visualNodeId = null;
    currentDiceRewardOriginPoint = null;
    pendingTurnCommand = null;
    busy = false;
    render();
    if (scoreRetryRequested) {
      nodes.voiceState.textContent = "分数已取消 · 请重新回答本题";
      if (!nodes.asrToggle.disabled) {
        nodes.asrToggle.focus({ preventScroll: true });
      }
    }
    if (failureMessage) nodes.voiceState.textContent = failureMessage;
    if (turnCommitted && !failureMessage) {
      if (gameSession?.phase === "ANSWER_LISTENING") {
        void playTurnShowtime();
      }
    }
    if (turnCommitted && usesLandingPoints()) void finishLandingTurnFollowUps(attemptId, landingGameId());
  }
}

function handleQaAssessmentEvent(event) {
  if (!qaHarnessEnabled) return;
  const context = currentSpeechTurnContext();
  if (!context || !canOpenSpeechWindow()) return;
  const detail = event?.detail || {};
  if (detail.kind === "teacher_review") {
    handleSentenceDecision({
      type: "answer-resolved",
      recognitionResultId: crypto.randomUUID(),
      ...context,
      source: "qa-harness",
      transcript: currentTaskCanonicalTranscript(),
      result: "teacher_review",
      valid: false,
      score: null,
      completeUtterance: true,
      primaryAccepted: false,
      triggerReason: null,
      reason: "qa_complete_unconfigured_clause",
    });
    return;
  }
  if (detail.kind !== "score") return;
  const knowledgeWrong = (
    detail.primaryAccepted === false
    || detail.knowledgeStatus === "wrong"
  );
  const score = knowledgeWrong ? 45 : Number(detail.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return;
  handleSentenceDecision({
    type: "answer-resolved",
    ...context,
    recognitionResultId: crypto.randomUUID(),
    result: "accepted",
    valid: true,
    primaryAccepted: !knowledgeWrong,
    knowledgeStatus: knowledgeWrong ? "wrong" : "correct",
    score,
    source: "qa-harness",
    transcript: currentTask(runtime, learningPack)?.feedback?.modelContent,
  });
}

function teacherAcceptSpeechDecision() {
  if (
    busy
    || pendingSpeechDecision?.result !== "teacher_review"
    || !pendingTurnCommand
    || !canOpenSpeechWindow()
  ) {
    return;
  }
  const turnCommand = pendingTurnCommand;
  pendingTurnCommand = null;
  speechStatus = "accepted";
  speechTranscript = `教师确认：${pendingSpeechDecision.transcript || "本次回答"}`;
  renderSpeechControls();
  renderMission();
  void runAcceptedTurn(turnCommand);
}

async function finishActivity(outcome = "completed") {
  if (activityResolutionPending || !runtime.currentActivity) return;
  const baselineRuntime = runtime;
  const baselineSession = gameSession;
  const actorTeamId = gameSession?.currentActivity?.actorTeamId
    || runtime.teams[runtime.activeTeamIndex]?.id;
  const actorTeam = runtime.teams.find((team) => team.id === actorTeamId);
  const landingNodeId = actorTeam?.nodeId || activePawnNodeId();
  activityResolutionPending = true;
  busy = true;
  renderActivity();
  nodes.activityResultCopy.textContent = outcome === "skipped"
    ? "老师已跳过本次活动，正在回到角色落点。"
    : `${actorTeam?.label || "挑战者"}完成了活动，正在回到角色落点。`;
  boardSounds.play(outcome === "skipped" ? "skip" : "complete");
  await sleep(outcome === "skipped" ? 360 : 680);

  try {
    runtime = closeActivity(runtime);
    if (gameSession?.phase === "ACTIVITY_ACTIVE") {
      gameSession = resolveSessionActivity(gameSession, { outcome });
      runtime = syncRuntimeToSession(runtime, gameSession);
    }
    persistStableSession(runtime, gameSession, playerAssetsLedger, fairyState, {
      required: true,
    });
    activityResolutionPending = false;
    render();
    await playLandingConfirmation(actorTeamId, landingNodeId);
    nodes.boardViewport.focus({ preventScroll: true });
  } catch (error) {
    runtime = baselineRuntime;
    gameSession = baselineSession;
    nodes.activityResultCopy.textContent = "活动结果暂时没有保存，请再确认一次。";
    console.error("classroom activity resolution could not be persisted", error);
  } finally {
    activityResolutionPending = false;
    busy = false;
    render();
  }
  if (gameSession?.phase === "ANSWER_LISTENING") {
    void playTurnShowtime();
  }
}

function populateSelects() {
  const themeOptions = () => Object.values(THEME_PACKS)
    .map((item) => new Option(item.title, item.id));
  const learningOptions = () => Object.values(LEARNING_PACKS)
    .map((item) => new Option(item.title, item.id));
  const playerOptions = () => Array.from({ length: 8 }, (_, index) => {
    const count = index + 1;
    return new Option(`${count} 人 · 独立轮转`, String(count));
  });
  nodes.themeSelect.replaceChildren(...themeOptions());
  nodes.learningSelect.replaceChildren(...learningOptions());
  nodes.playerCount.replaceChildren(...playerOptions());
  nodes.setupTheme.replaceChildren(...themeOptions());
  nodes.setupLearning.replaceChildren(...learningOptions());
  nodes.setupPlayerCount.replaceChildren(...playerOptions());
  nodes.themeSelect.value = theme.id;
  nodes.learningSelect.value = learningPack.id;
  nodes.playerCount.value = String(playerCount);
  nodes.setupMode.value = TEACHER_MODE;
  nodes.setupTheme.value = theme.id;
  nodes.setupLearning.value = learningPack.id;
  nodes.setupPlayerCount.value = String(playerCount);
  nodes.setupOpportunities.value = String(SESSION_CONFIGS.standard.minOpportunitiesPerSeat);
  renderCharacterSelection();
  updateSetupPreview();
  updateResumeAvailability();
}

const compactBoardControlsQuery = window.matchMedia("(max-width: 620px)");

function syncResponsiveBoardControls(event = compactBoardControlsQuery) {
  const compact = event.matches === true;
  nodes.mapNavigator.open = !compact;
  nodes.boardLegend.open = !compact;
}

function keepCompactBoardControlExclusive(opened, sibling) {
  if (
    compactBoardControlsQuery.matches
    && opened.open
    && sibling.open
  ) {
    sibling.open = false;
  }
}

nodes.themeSelect.addEventListener("change", (event) => {
  theme = THEME_PACKS[event.target.value];
  runtime = { ...runtime, themeId: theme.id };
  render();
});

nodes.learningSelect.addEventListener("change", (event) => {
  learningPack = Object.values(LEARNING_PACKS)
    .find((candidate) => candidate.id === event.target.value) || LEARNING_PACKS.family;
  runtime = createPrototypeRuntime();
  camera = initialBoardCamera();
  render();
});

nodes.playerCount.addEventListener("change", (event) => {
  playerCount = Number(event.target.value);
  runtime = createPrototypeRuntime();
  camera = initialBoardCamera();
  render();
});

function commitLayoutEditorCoordinateInputs() {
  if (!layoutEditor.active || !layoutEditor.selectedNodeId) return;
  const x = Number(nodes.layoutEditorX.value);
  const y = Number(nodes.layoutEditorY.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    syncLayoutEditorControls({ announce: "坐标必须是有效数字" });
    return;
  }
  setLayoutEditorNodePosition(
    layoutEditor.selectedNodeId,
    { x, y },
    { grid: 1 },
  );
}

function handleLayoutEditorGlobalKeydown(event) {
  if (!layoutEditor.active) return;
  const editingField = event.target.matches?.("input, textarea, select");
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (layoutEditor.activePane === "codex") {
      setNodeAuthoringExchangeStatus(
        "Codex JSON 不会通过快捷键直接发布；请先预览并应用草稿，再到对应标签页发布。",
      );
    } else if (layoutEditor.activePane === "cards") {
      setCardCatalogStatus("星星新增与图片上传会立即保存，不需要再按一次保存。", "success");
    } else if (layoutEditor.activePane === "dice") saveDicePackEditorDraft();
    else if (layoutEditor.activePane === "rewards") saveNodeRewardEditorDraft();
    else saveLayoutEditorDraft();
    return;
  }
  if (modifier && !editingField && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoLayoutEditorChange();
    else undoLayoutEditorChange();
    return;
  }
  if (
    modifier
    && !editingField
    && event.key.toLowerCase() === "y"
  ) {
    event.preventDefault();
    redoLayoutEditorChange();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (layoutEditor.gesture) cancelLayoutNodeGesture({ restore: true });
    else closeLayoutEditor();
  }
}

nodes.layoutEditorOpen.addEventListener("click", openLayoutEditor);
nodes.layoutEditorClose.addEventListener("click", closeLayoutEditor);
nodes.layoutEditorSave.addEventListener("click", saveLayoutEditorDraft);
nodes.layoutEditorNodeTab.addEventListener("click", () => setLayoutEditorTab("nodes"));
nodes.layoutEditorDiceTab.addEventListener("click", () => setLayoutEditorTab("dice"));
nodes.layoutEditorRewardTab.addEventListener("click", () => setLayoutEditorTab("rewards"));
nodes.layoutEditorCardTab.addEventListener("click", () => setLayoutEditorTab("cards"));
nodes.layoutEditorCodexTab.addEventListener("click", () => setLayoutEditorTab("codex"));
const layoutEditorTabs = [
  ["nodes", nodes.layoutEditorNodeTab],
  ["dice", nodes.layoutEditorDiceTab],
  ["rewards", nodes.layoutEditorRewardTab],
  ["codex", nodes.layoutEditorCodexTab],
];
layoutEditorTabs.forEach(([tabId, tab], tabIndex) => {
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = tabIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = layoutEditorTabs.length - 1;
    else if (event.key === "ArrowRight") nextIndex = (tabIndex + 1) % layoutEditorTabs.length;
    else nextIndex = (tabIndex - 1 + layoutEditorTabs.length) % layoutEditorTabs.length;
    const [nextTabId, nextTab] = layoutEditorTabs[nextIndex];
    setLayoutEditorTab(nextTabId);
    nextTab.focus({ preventScroll: true });
  });
});
nodes.dicePackEditorSave.addEventListener("click", saveDicePackEditorDraft);
nodes.dicePackEditorFamily.addEventListener("change", (event) => {
  if (!DICE_PACK_FAMILY_IDS.includes(event.target.value)) return;
  dicePackEditor.selectedFamilyId = event.target.value;
  renderDicePackEditor();
});
nodes.dicePackEditorFaces.addEventListener("change", (event) => {
  const row = event.target.closest(".dice-pack-face-row");
  const faceIndex = Number(row?.dataset.faceIndex);
  if (!Number.isInteger(faceIndex)) return;
  if (event.target.matches(".dice-pack-face-steps")) {
    updateDicePackEditorFace(faceIndex, { steps: Number(event.target.value) });
    return;
  }
  if (event.target.matches(".dice-pack-face-reward")) {
    const rewardType = event.target.value;
    const limits = DICE_REWARD_LIMITS[rewardType];
    if (!limits) return;
    const currentAmount = Number(
      dicePackEditor.draft.families[dicePackEditor.selectedFamilyId][faceIndex]
        .reward.amount,
    );
    const rewardAmount = Math.max(
      limits.min,
      Math.min(limits.max, Number.isInteger(currentAmount) ? currentAmount : limits.min),
    );
    updateDicePackEditorFace(faceIndex, { rewardType, rewardAmount });
    return;
  }
  if (event.target.matches(".dice-pack-face-amount")) {
    const face = dicePackEditor.draft
      .families[dicePackEditor.selectedFamilyId][faceIndex];
    const limits = DICE_REWARD_LIMITS[face.reward.type];
    const amount = Math.max(
      limits.min,
      Math.min(limits.max, Math.round(Number(event.target.value) || limits.min)),
    );
    updateDicePackEditorFace(faceIndex, { rewardAmount: amount });
  }
});
nodes.dicePackEditorResetFamily.addEventListener("click", resetDicePackEditorFamily);
nodes.dicePackEditorResetAll.addEventListener("click", resetAllDicePackEditorFamilies);
nodes.nodeRewardEditorSave.addEventListener("click", saveNodeRewardEditorDraft);
nodes.nodeRewardEditorWorld.addEventListener("change", (event) => {
  switchNodeRewardEditorWorld(event.target.value);
});
nodes.nodeRewardEditorNode.addEventListener("change", (event) => {
  selectNodeRewardEditorNode(event.target.value, { focusMap: true });
});
nodes.nodeRewardEditorReward.addEventListener("change", (event) => {
  const type = event.target.value;
  const limits = NODE_REWARD_LIMITS[type];
  if (!limits) return;
  const entry = selectedNodeRewardCatalogEntry();
  const current = entry
    ? nodeRewardPolicy(nodeRewardEditor.draft, entry.worldRef, entry.nodeId)
    : { amount: 0 };
  const amount = type === "none"
    ? 0
    : type === "star"
      ? 1
    : Math.max(
        limits.min,
        Math.min(limits.max, Number(current.amount) || limits.min),
      );
  updateNodeRewardEditorPolicy({ type, amount });
});
nodes.nodeRewardEditorAmount.addEventListener("change", (event) => {
  const entry = selectedNodeRewardCatalogEntry();
  if (!entry?.editable) return;
  const current = nodeRewardPolicy(nodeRewardEditor.draft, entry.worldRef, entry.nodeId);
  const limits = NODE_REWARD_LIMITS[current.type];
  const amount = Math.max(
    limits.min,
    Math.min(limits.max, Math.round(Number(event.target.value) || limits.min)),
  );
  updateNodeRewardEditorPolicy({ amount });
});
nodes.nodeRewardEditorResetNode.addEventListener("click", resetSelectedNodeReward);
nodes.nodeRewardEditorResetWorld.addEventListener("click", resetNodeRewardWorld);
nodes.nodeRewardEditorResetAll.addEventListener("click", resetAllNodeRewards);
nodes.classroomEventEditorLearning.addEventListener("change", (event) => {
  switchClassroomEventEditorLearning(event.target.value);
});
nodes.classroomEventEditorWorld.addEventListener("change", (event) => {
  switchClassroomEventEditorWorld(event.target.value);
});
nodes.classroomEventEditorNode.addEventListener("change", (event) => {
  selectClassroomEventEditorNode(event.target.value, { focusMap: true });
});
nodes.classroomEventEditorEvent.addEventListener("change", (event) => {
  const selected = event.target.value;
  if (selected === "inherit" || selected === "none") {
    updateClassroomEventEditorAssignment({ mode: selected, eventRef: "" });
    return;
  }
  updateClassroomEventEditorAssignment({ mode: "event", eventRef: selected });
});
nodes.classroomEventEditorResetNode.addEventListener(
  "click",
  resetSelectedClassroomEvent,
);
nodes.classroomEventEditorResetWorld.addEventListener(
  "click",
  resetClassroomEventWorld,
);
nodes.classroomEventEditorResetAll.addEventListener(
  "click",
  resetAllClassroomEvents,
);
nodes.cardCatalogAddForm.addEventListener("submit", createCardCatalogCard);
nodes.cardCatalogSearch.addEventListener("input", (event) => {
  cardCatalogEditor.query = event.target.value;
  renderCardCatalogEditor();
});
nodes.cardCatalogList.addEventListener("change", (event) => {
  const input = event.target.closest?.("input[data-card-upload-id]");
  if (!input) return;
  const [file] = input.files || [];
  if (file) void uploadCardCatalogImage(input.dataset.cardUploadId, file);
});
nodes.layoutEditorNodeMode.addEventListener("click", () => setLayoutEditorTool("node"));
nodes.layoutEditorPanMode.addEventListener("click", () => setLayoutEditorTool("pan"));
nodes.layoutEditorWorld.addEventListener("change", (event) => {
  switchLayoutEditorWorld(event.target.value);
});
nodes.layoutEditorNode.addEventListener("change", (event) => {
  selectLayoutEditorNode(event.target.value, { focus: true, renderScene: true });
});
nodes.layoutEditorGrid.addEventListener("change", (event) => {
  layoutEditor.grid = Math.max(1, Number(event.target.value) || 1);
  syncLayoutEditorControls({ announce: `拖动吸附已设为 ${layoutEditor.grid} px` });
});
[nodes.layoutEditorX, nodes.layoutEditorY].forEach((input) => {
  input.addEventListener("change", commitLayoutEditorCoordinateInputs);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitLayoutEditorCoordinateInputs();
  });
});
nodes.layoutEditorPanel.querySelectorAll("[data-layout-nudge-x]")
  .forEach((button) => button.addEventListener("click", () => {
    nudgeLayoutEditorNode(
      Number(button.dataset.layoutNudgeX) || 0,
      Number(button.dataset.layoutNudgeY) || 0,
    );
  }));
nodes.layoutEditorUndo.addEventListener("click", undoLayoutEditorChange);
nodes.layoutEditorRedo.addEventListener("click", redoLayoutEditorChange);
nodes.layoutEditorResetNode.addEventListener("click", resetSelectedLayoutEditorNode);
nodes.layoutEditorResetWorld.addEventListener("click", resetLayoutEditorWorld);
nodes.layoutEditorCopy.addEventListener("click", () => {
  void copyLayoutEditorExport();
});
nodes.layoutEditorDownload.addEventListener("click", downloadLayoutEditorExport);
nodes.nodeAuthoringExchangeGenerate.addEventListener(
  "click",
  generateNodeAuthoringExchange,
);
nodes.nodeAuthoringExchangeCopy.addEventListener("click", () => {
  void copyNodeAuthoringExchangeForCodex();
});
nodes.nodeAuthoringExchangeScope.addEventListener(
  "change",
  handleNodeAuthoringExchangeScopeChange,
);
nodes.nodeAuthoringExchangeInput.addEventListener(
  "input",
  handleNodeAuthoringExchangeInput,
);
nodes.nodeAuthoringExchangePreview.addEventListener(
  "click",
  previewNodeAuthoringExchange,
);
nodes.nodeAuthoringExchangeApply.addEventListener(
  "click",
  applyNodeAuthoringExchangeToDrafts,
);
document.addEventListener("keydown", handleLayoutEditorGlobalKeydown);

nodes.boardViewport.addEventListener("pointerdown", beginBoardPan);
nodes.boardViewport.addEventListener("pointermove", moveBoardPan);
nodes.boardViewport.addEventListener("pointerup", endBoardPan);
nodes.boardViewport.addEventListener("pointercancel", endBoardPan);
nodes.boardViewport.addEventListener("lostpointercapture", endBoardPan);
nodes.boardViewport.addEventListener("keydown", moveCameraWithKeyboard);
nodes.miniMap.addEventListener("pointerdown", (event) => event.stopPropagation());
nodes.miniMap.addEventListener("click", navigateFromMiniMap);
nodes.focusActivePawn.addEventListener("click", (event) => {
  void focusActivePawn({ animate: event.detail !== 0 });
});
nodes.mapNavigator.addEventListener("toggle", () => {
  keepCompactBoardControlExclusive(nodes.mapNavigator, nodes.boardLegend);
});
nodes.boardLegend.addEventListener("toggle", () => {
  keepCompactBoardControlExclusive(nodes.boardLegend, nodes.mapNavigator);
});
nodes.soundToggle.addEventListener("click", async () => {
  const enabled = boardSounds.setEnabled(!boardSounds.isEnabled());
  if (enabled) {
    await boardSounds.unlock();
    boardSounds.play("positive", { intensity: 0.72 });
  }
  renderSoundToggle();
});
nodes.asrToggle.addEventListener("click", () => {
  void boardSounds.unlock();
  void toggleSentenceListening();
});
nodes.teacherAccept.addEventListener("click", teacherAcceptSpeechDecision);
window.addEventListener("voice-board:qa-assessment", handleQaAssessmentEvent);
compactBoardControlsQuery.addEventListener(
  "change",
  syncResponsiveBoardControls,
);
nodes.skipActivity.addEventListener("click", () => {
  void boardSounds.unlock();
  void finishActivity("skipped");
});
nodes.completeActivity.addEventListener("click", () => {
  void boardSounds.unlock();
  void finishActivity("completed");
});
nodes.returnToSetup.addEventListener("click", () => {
  void returnToSetup({ clearSnapshot: false });
});
nodes.endGame.addEventListener("click", () => { void finishCurrentGame(); });
nodes.restartGame.addEventListener("click", () => { void restartCurrentGame(); });
document.querySelector(".board-utility-menu").addEventListener("toggle", renderRestartGameControl);
nodes.teacherGrant.addEventListener("click", giveTeacherOpportunity);
nodes.teacherRoll.addEventListener("click", () => { void runTeacherTurn(); });
nodes.setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void boardSounds.unlock();
  startLocalSession();
});
nodes.studentCreateForm.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void createStudentProfile();
});
nodes.studentCreateSubmit.addEventListener("click", () => {
  void createStudentProfile();
});
nodes.studentManagerOpen.addEventListener("click", openStudentManager);
nodes.studentManagerClose.addEventListener("click", () => nodes.studentManagerDialog.close());
nodes.studentManagerSearch.addEventListener("input", () => renderStudentManager());
nodes.studentManagerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveStudentProfile();
});
nodes.studentManagerDialog.addEventListener("click", (event) => {
  if (event.target === nodes.studentManagerDialog) nodes.studentManagerDialog.close();
});
nodes.resumeSession.addEventListener("click", restoreLocalSession);
[nodes.setupMode, nodes.setupTheme, nodes.setupLearning, nodes.setupOpportunities]
  .forEach((select) => select.addEventListener("change", updateSetupPreview));
nodes.setupPlayerCount.addEventListener("change", () => {
  renderCharacterSelection();
  updateSetupPreview();
});
nodes.completeBoss.addEventListener("click", () => {
  gameSession = completeBossSession(gameSession);
  lastSessionSummary = buildSessionSummary(gameSession, runtime.teams);
  render();
});
nodes.replaySession.addEventListener("click", () => {
  void boardSounds.unlock();
  continueExpeditionSession();
});
nodes.newSession.addEventListener("click", () => { void finishCurrentGame({ returnToSetupAfter: true }); });
document.addEventListener("visibilitychange", () => {
  if (
    document.hidden
    && ["requesting_permission", "connecting", "listening"].includes(speechStatus)
  ) {
    pauseSentenceListener("idle");
  }
});
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  if (layoutEditor.active) {
    if (layoutEditor.gesture) {
      if (layoutEditor.gesture.frameRequest) {
        cancelAnimationFrame(layoutEditor.gesture.frameRequest);
      }
      layoutEditor.draft = cloneLayoutEditorDraft(layoutEditor.gesture.startDraft);
      layoutEditor.gesture = null;
    }
    persistLayoutEditorDraft();
    persistDicePackEditorDraft();
    persistNodeRewardEditorDraft();
    persistClassroomEventEditorDraft();
  }
  clearTurnFeedbackTimers();
  sentenceListener?.destroy();
  boardSounds.destroy();
});

new ResizeObserver(syncCameraViewport).observe(nodes.boardViewport);
syncResponsiveBoardControls();
camera = initialBoardCamera();
populateSelects();
render();
void initializeSpeechAvailability();
installClayPreviewDemo({
  location: window.location,
  getState: () => {
    let hasCurrentSave = false;
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || "null");
      hasCurrentSave = Boolean(saved?.gameSession && saved.ownerUserId === authenticatedUserId);
    } catch { hasCurrentSave = true; }
    const preferred = ["小森", "小月"].map((name) => studentProfiles.find((student) => student.displayName === name));
    return {
      ready: qaControlsEnabled && Boolean(authenticatedUserId) && !sessionConfigurationLoading
        && studentProfilesLoaded && !studentProfilesLoading,
      gameSession, hasCurrentSave,
      students: preferred.every(Boolean) ? preferred : studentProfiles,
    };
  },
  start: (students) => {
    updateSetupRoster(students.map((student) => student.id));
    characterAssignments = ["star-captain", "cowboy"];
    startLocalSession({ count: 2 });
    if (gameSession) {
      teacherSelectedSeatId = students[0].id;
      persistStableSession();
      renderTeacherPanel();
    }
  },
});
