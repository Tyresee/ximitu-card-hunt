import { expect, test } from "playwright/test";

import {
  boardLayoutRef,
  boardLayoutSignature,
  createBoardLayoutDraft,
  updateBoardLayoutDraft,
} from "../public/prototypes/universal-board/board-layout-editor-core.js";
import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
} from "../public/prototypes/universal-board/expansion-world.js";
import { BOARD_TEMPLATE } from "../public/prototypes/universal-board/packs.js";
import {
  DEFAULT_DICE_PACK,
  updateDicePackFace,
} from "../public/prototypes/universal-board/dice-pack-core.js";
import {
  DEFAULT_NODE_REWARD_PACK,
  updateNodeRewardPolicy,
} from "../public/prototypes/universal-board/node-reward-pack-core.js";
import {
  CLASSROOM_EVENT_PROGRAM_CATALOG,
  CLASSROOM_EVENT_PROGRAM_LEARNING_REFS,
  DEFAULT_CLASSROOM_EVENT_PROGRAM,
  updateClassroomEventAssignment,
} from "../public/prototypes/universal-board/classroom-event-program-core.js";
import {
  AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION,
  authoringDraftFingerprint,
} from "../public/prototypes/universal-board/authoring-draft-envelope-core.js";

const EDITOR_PATH = "/prototypes/universal-board/?qa=1&layoutEditor=1";
const ORDINARY_QA_PATH = "/prototypes/universal-board/?qa=1";
const FULL_MOTION_QA_PATH = "/prototypes/universal-board/?qa=1&qaHarness=1";
const LAYOUT_DRAFT_PREFIX = "tim.voice-board.board-layout-draft.v1:";
const LAYOUT_APPLIED_PREFIX = "tim.voice-board.board-layout-applied.v1:";
const SESSION_STORAGE_KEY = "tim.voice-board.local-session.v1";
const WORLD_ONE_DRAFT_KEY = `${LAYOUT_DRAFT_PREFIX}world.ximitu.cloud-harbor`;
const WORLD_ONE_APPLIED_KEY = `${LAYOUT_APPLIED_PREFIX}world.ximitu.cloud-harbor`;
const DICE_PACK_DRAFT_KEY = "tim.voice-board.dice-pack-draft.v1";
const NODE_REWARD_PACK_DRAFT_KEY = "tim.voice-board.node-reward-pack-draft.v1";
const CLASSROOM_EVENT_PROGRAM_DRAFT_KEY = (
  "tim.voice-board.classroom-event-program-draft.v1"
);
const WORLD_ONE_REF = "world.ximitu.cloud-harbor@1.1.0";
const WORLD_TWO_REF = "world.ximitu.beyond-cloud@1.0.0";
const PRIMARY_LEARNING_REF = CLASSROOM_EVENT_PROGRAM_LEARNING_REFS[0];
const PRIMARY_LEARNING_CATALOG = (
  CLASSROOM_EVENT_PROGRAM_CATALOG[PRIMARY_LEARNING_REF]
);
const PRIMARY_EVENT = PRIMARY_LEARNING_CATALOG.events[0];
const TARGET_NODE_ID = "n17";
const TARGET_EDGE_ID = "e17";
const MOVEMENT_NODE_POSITIONS = Object.freeze({
  n02: Object.freeze({ x: 500, y: 300 }),
  n03: Object.freeze({ x: 900, y: 450 }),
});

function emptyLayoutPublication(worldRef, board) {
  return {
    worldRef,
    boardRef: boardLayoutRef(board),
    baseSignature: boardLayoutSignature(board),
    status: "empty",
    revision: null,
    updatedAt: null,
    updatedBy: null,
    draft: null,
  };
}

function programWithPrimaryEventAt(nodeId, worldRef = WORLD_ONE_REF) {
  return updateClassroomEventAssignment(
    DEFAULT_CLASSROOM_EVENT_PROGRAM,
    PRIMARY_LEARNING_REF,
    worldRef,
    nodeId,
    { mode: "event", eventRef: PRIMARY_EVENT.eventRef },
  );
}

async function mockPublishedBoardLayouts(page) {
  const layouts = new Map([
    [WORLD_ONE_REF, emptyLayoutPublication(WORLD_ONE_REF, BOARD_TEMPLATE)],
    [
      WORLD_TWO_REF,
      emptyLayoutPublication(WORLD_TWO_REF, EXPANSION_WORLD_BOARD_TEMPLATE),
    ],
  ]);
  const putBodies = [];
  const dicePutBodies = [];
  const nodeRewardPutBodies = [];
  const classroomEventProgramPutBodies = [];
  let nextRevision = 1;
  let dicePublication = {
    status: "default",
    revision: null,
    updatedAt: null,
    updatedBy: null,
    pack: structuredClone(DEFAULT_DICE_PACK),
  };
  let nodeRewardPublication = {
    status: "default",
    revision: null,
    updatedAt: null,
    updatedBy: null,
    pack: structuredClone(DEFAULT_NODE_REWARD_PACK),
  };
  let classroomEventProgramPublication = {
    status: "default",
    revision: null,
    updatedAt: null,
    updatedBy: null,
    pack: structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM),
  };

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: "e2e-layout-owner",
          displayName: "Layout Owner",
          role: "owner",
          status: "active",
        },
      }),
    });
  });

  await page.route("**/api/board-layouts/v1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "board-layout-registry.v1",
        layouts: [...layouts.values()],
      }),
    });
  });

  await page.route("**/api/admin/board-layouts/v1", async (route) => {
    const body = route.request().postDataJSON();
    putBodies.push(structuredClone(body));
    const draft = body?.draft;
    const current = layouts.get(draft?.worldRef);
    if (!draft || !current) {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "布局草稿无效",
          code: "board_layout_invalid",
        }),
      });
      return;
    }
    const publication = {
      worldRef: draft.worldRef,
      boardRef: draft.boardRef,
      baseSignature: draft.baseSignature,
      status: "active",
      revision: `e2e-layout-revision-${nextRevision}`,
      updatedAt: `2026-08-02T00:00:0${nextRevision}.000Z`,
      updatedBy: "e2e-layout-owner",
      draft: structuredClone(draft),
    };
    nextRevision += 1;
    layouts.set(draft.worldRef, publication);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "board-layout-registry.v1",
        layout: publication,
      }),
    });
  });

  await page.route("**/api/dice-packs/v1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "dice-pack-registry.v1",
        dicePack: dicePublication,
      }),
    });
  });

  await page.route("**/api/admin/dice-packs/v1", async (route) => {
    const body = route.request().postDataJSON();
    dicePutBodies.push(structuredClone(body));
    dicePublication = {
      status: "active",
      revision: `e2e-dice-revision-${dicePutBodies.length}`,
      updatedAt: `2026-08-02T01:00:0${dicePutBodies.length}.000Z`,
      updatedBy: "e2e-layout-owner",
      pack: structuredClone(body.pack),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "dice-pack-registry.v1",
        dicePack: dicePublication,
      }),
    });
  });

  await page.route("**/api/node-reward-packs/v1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "node-reward-pack-registry.v1",
        nodeRewardPack: nodeRewardPublication,
      }),
    });
  });

  await page.route("**/api/admin/node-reward-packs/v1", async (route) => {
    const body = route.request().postDataJSON();
    nodeRewardPutBodies.push(structuredClone(body));
    nodeRewardPublication = {
      status: "active",
      revision: `e2e-node-reward-revision-${nodeRewardPutBodies.length}`,
      updatedAt: `2026-08-02T03:00:0${nodeRewardPutBodies.length}.000Z`,
      updatedBy: "e2e-layout-owner",
      pack: structuredClone(body.pack),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "node-reward-pack-registry.v1",
        nodeRewardPack: nodeRewardPublication,
      }),
    });
  });

  await page.route("**/api/classroom-event-programs/v1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "classroom-event-program-registry.v1",
        classroomEventProgram: classroomEventProgramPublication,
      }),
    });
  });

  await page.route("**/api/admin/classroom-event-programs/v1", async (route) => {
    const body = route.request().postDataJSON();
    classroomEventProgramPutBodies.push(structuredClone(body));
    classroomEventProgramPublication = {
      status: "active",
      revision: (
        `e2e-classroom-event-revision-${classroomEventProgramPutBodies.length}`
      ),
      updatedAt: (
        `2026-08-02T05:00:0${classroomEventProgramPutBodies.length}.000Z`
      ),
      updatedBy: "e2e-layout-owner",
      pack: structuredClone(body.pack),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "classroom-event-program-registry.v1",
        classroomEventProgram: classroomEventProgramPublication,
      }),
    });
  });

  return {
    layouts,
    putBodies,
    dicePutBodies,
    nodeRewardPutBodies,
    classroomEventProgramPutBodies,
    dicePublication: () => structuredClone(dicePublication),
    nodeRewardPublication: () => structuredClone(nodeRewardPublication),
    classroomEventProgramPublication: () => (
      structuredClone(classroomEventProgramPublication)
    ),
    setDicePublication(pack, revision = "e2e-dice-external-revision") {
      dicePublication = {
        status: "active",
        revision,
        updatedAt: "2026-08-02T02:00:00.000Z",
        updatedBy: "e2e-layout-owner",
        pack: structuredClone(pack),
      };
    },
    setNodeRewardPublication(
      pack,
      revision = "e2e-node-reward-external-revision",
    ) {
      nodeRewardPublication = {
        status: "active",
        revision,
        updatedAt: "2026-08-02T04:00:00.000Z",
        updatedBy: "e2e-layout-owner",
        pack: structuredClone(pack),
      };
    },
    setClassroomEventProgramPublication(
      pack,
      revision = "e2e-classroom-event-external-revision",
    ) {
      classroomEventProgramPublication = {
        status: "active",
        revision,
        updatedAt: "2026-08-02T06:00:00.000Z",
        updatedBy: "e2e-layout-owner",
        pack: structuredClone(pack),
      };
    },
  };
}

function parseTranslate(value) {
  const match = String(value || "").match(
    /translate\(\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*\)/,
  );
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

async function waitForLayoutEditor(page) {
  await expect(page.locator("html"))
    .toHaveAttribute("data-classroom-event-program-ready", "true");
  await expect(page.locator(".runtime-shell"))
    .toHaveAttribute("data-layout-editor-active", "true");
  await expect(page.locator("#layout-editor-panel")).toBeVisible();
  await expect(page.locator("#layout-editor-title"))
    .toHaveText("地图、骰子、奖励与事件编辑");
  await expect(page.locator("#layout-editor-save")).toBeVisible();
  await expect(page.locator("#layout-editor-save-state")).toBeVisible();
  await expect(page.locator("#board-svg .board-space[data-node-id]"))
    .toHaveCount(61);
}

async function selectEditorNode(page, nodeId) {
  await page.locator("#layout-editor-node").selectOption(nodeId);
  const node = page.locator(
    `#board-svg .board-space[data-node-id="${nodeId}"]`,
  );
  await expect(node).toHaveAttribute("aria-pressed", "true");
  await expect(node).toHaveAttribute("tabindex", "0");
  return node;
}

async function layoutScene(page, nodeId, edgeId) {
  return page.evaluate(({ selectedNodeId, selectedEdgeId }) => {
    const attribute = (selector, name) => (
      document.querySelector(selector)?.getAttribute(name) || null
    );
    return {
      nodeTransform: attribute(
        `#board-svg .board-space[data-node-id="${selectedNodeId}"]`,
        "transform",
      ),
      mainRouteD: attribute("#board-svg .route-line", "d"),
      routeMaskD: attribute("#board-svg .route-texture-mask-shape", "d"),
      connectedEdgeD: attribute(
        "#board-svg .layout-editor-connected-route-layer "
          + `path[data-edge-id="${selectedEdgeId}"]`,
        "d",
      ),
      miniEdgeD: attribute(
        `#mini-map .mini-routes path[data-edge-id="${selectedEdgeId}"]`,
        "d",
      ),
      miniNodeTransform: attribute(
        `#mini-map .mini-space[data-node-id="${selectedNodeId}"]`,
        "transform",
      ),
    };
  }, {
    selectedNodeId: nodeId,
    selectedEdgeId: edgeId,
  });
}

function ordinaryLayoutScene(scene) {
  return {
    nodeTransform: scene.nodeTransform,
    mainRouteD: scene.mainRouteD,
    routeMaskD: scene.routeMaskD,
    miniEdgeD: scene.miniEdgeD,
    miniNodeTransform: scene.miniNodeTransform,
  };
}

async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .sort()
      .map((key) => [key, window.localStorage.getItem(key)]),
  ));
}

function parseStoredAuthoringEnvelope(raw) {
  const parsed = JSON.parse(raw || "null");
  expect(Object.keys(parsed || {}).sort()).toEqual([
    "draft",
    "schemaVersion",
    "sourceFingerprint",
    "sourceRevision",
  ]);
  expect(parsed.schemaVersion).toBe(AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION);
  expect(parsed.sourceRevision === null || typeof parsed.sourceRevision === "string")
    .toBe(true);
  expect(parsed.sourceFingerprint).toMatch(/^fnv1a64:[a-f0-9]{16}$/);
  return parsed;
}

function parseStoredAuthoringDraft(raw) {
  return parseStoredAuthoringEnvelope(raw).draft;
}

async function waitForLegacyDraftQuarantine(page, draftKey, expectedLegacyDraft) {
  await expect.poll(async () => {
    const storage = await storageSnapshot(page);
    let active;
    try {
      active = JSON.parse(storage[draftKey] || "null");
    } catch {
      active = null;
    }
    const staleBackupFound = Object.keys(storage).some((key) => (
      key.startsWith(`${draftKey}:stale:`)
      && JSON.stringify(JSON.parse(storage[key])) === JSON.stringify(expectedLegacyDraft)
    ));
    return {
      activeEnvelopeReady: (
        active?.schemaVersion === AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION
      ),
      staleBackupFound,
    };
  }).toEqual({
    activeEnvelopeReady: true,
    staleBackupFound: true,
  });
}

async function clearLayoutEditorStorage(page) {
  await page.evaluate((prefixes) => {
    Object.keys(window.localStorage)
      .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => window.localStorage.removeItem(key));
  }, [
    LAYOUT_DRAFT_PREFIX,
    LAYOUT_APPLIED_PREFIX,
    "tim.voice-board.dice-pack-",
    "tim.voice-board.node-reward-pack-",
    "tim.voice-board.classroom-event-program-",
  ]);
}

async function clearWorkingLayoutStorage(page) {
  await page.evaluate((prefix) => {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => window.localStorage.removeItem(key));
  }, LAYOUT_DRAFT_PREFIX);
}

async function expectBoardNodePosition(page, nodeId, expectedPosition) {
  const node = page.locator(
    `#board-svg .board-space[data-node-id="${nodeId}"]`,
  );
  await expect(node).toBeAttached();
  await expect.poll(async () => parseTranslate(await node.getAttribute("transform")))
    .toEqual(expectedPosition);
}

async function startPawnStepGeometryObservation(page) {
  await page.evaluate(() => {
    window.__layoutPawnStepGeometry?.observer?.disconnect();
    const observation = {
      steps: [],
      observer: null,
    };
    const viewportPoint = (element, viewport) => {
      const matrix = element?.getScreenCTM?.();
      if (!matrix) return null;
      const point = new DOMPoint(0, 0).matrixTransform(matrix);
      return {
        x: point.x - viewport.left,
        y: point.y - viewport.top,
      };
    };
    const viewportCenter = (element, viewport) => {
      const rect = element?.getBoundingClientRect?.();
      if (!rect) return null;
      return {
        x: rect.left - viewport.left + (rect.width / 2),
        y: rect.top - viewport.top + (rect.height / 2),
      };
    };
    const tracked = new WeakSet();
    const track = (element) => {
      if (!(element instanceof Element) || tracked.has(element)) return;
      tracked.add(element);
      const viewport = document.querySelector(".board-viewport")
        ?.getBoundingClientRect();
      const teamId = element.dataset.teamId || "";
      const targetNodeId = element.dataset.targetNodeId || "";
      const sourcePawnMotion = [...document.querySelectorAll(".pawn[data-team-id]")]
        .find((candidate) => candidate.dataset.teamId === teamId)
        ?.querySelector(".pawn-motion");
      const sourcePawn = sourcePawnMotion?.closest(".pawn");
      const sourceNodeId = sourcePawn?.dataset.nodeId || "";
      const sourceSpace = [...document.querySelectorAll(".board-space[data-node-id]")]
        .find((candidate) => candidate.dataset.nodeId === sourceNodeId);
      const targetSpace = [...document.querySelectorAll(".board-space[data-node-id]")]
        .find((candidate) => candidate.dataset.nodeId === targetNodeId);
      const sourceCenter = viewport
        ? viewportCenter(sourcePawnMotion, viewport)
        : null;
      const sourceOrigin = viewport ? viewportPoint(sourceSpace, viewport) : null;
      const targetOrigin = viewport ? viewportPoint(targetSpace, viewport) : null;
      const expectedFinalCenter = sourceCenter && sourceOrigin && targetOrigin
        ? {
            x: sourceCenter.x + targetOrigin.x - sourceOrigin.x,
            y: sourceCenter.y + targetOrigin.y - sourceOrigin.y,
          }
        : null;
      const entry = {
        dataset: { ...element.dataset },
        sourceNodeId,
        sourceCenter,
        sourceOrigin,
        targetOrigin,
        expectedFinalCenter,
        duration: null,
        removed: false,
        samples: [],
      };
      observation.steps.push(entry);
      const sample = () => {
        if (!element.isConnected) {
          entry.removed = true;
          return;
        }
        const animation = element.getAnimations().find((candidate) => (
          candidate.effect?.getKeyframes?.().some((frame) => frame.transform)
        ));
        if (animation && entry.duration === null) {
          entry.duration = Number(animation.effect.getTiming().duration);
        }
        const currentViewport = document.querySelector(".board-viewport")
          ?.getBoundingClientRect();
        entry.samples.push({
          currentTime: Number(animation?.currentTime ?? 0),
          center: currentViewport
            ? viewportCenter(element, currentViewport)
            : null,
        });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    const inspect = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(".step-pawn")) track(node);
      node.querySelectorAll(".step-pawn").forEach(track);
    };
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(inspect));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    observation.observer = observer;
    window.__layoutPawnStepGeometry = observation;
  });
}

async function finishPawnStepGeometryObservation(page, expectedStepCount) {
  await page.waitForFunction((count) => {
    const observation = window.__layoutPawnStepGeometry;
    return (
      observation?.steps.length === count
      && observation.steps.every(({ removed }) => removed === true)
    );
  }, expectedStepCount);
  return page.evaluate(() => {
    const observation = window.__layoutPawnStepGeometry;
    observation?.observer?.disconnect();
    return observation?.steps || [];
  });
}

function pointDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

async function closeEditorAndClearDrafts(page) {
  const close = page.locator("#layout-editor-close");
  if (await close.isVisible().catch(() => false)) {
    await close.click().catch(() => undefined);
  }
  await clearLayoutEditorStorage(page);
}

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  await closeEditorAndClearDrafts(page).catch(() => undefined);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", {
      persisted: false,
    }));
  }).catch(() => undefined);
  await page.close({ runBeforeUnload: false });
});

test("save applies the visual layout after exit and reload while an unsaved edit cannot replace it", async ({
  page,
}) => {
  const publishedLayouts = await mockPublishedBoardLayouts(page);
  await page.goto(EDITOR_PATH);
  await waitForLayoutEditor(page);

  const beforeStorage = await storageSnapshot(page);
  const targetNode = await selectEditorNode(page, TARGET_NODE_ID);
  const before = await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID);
  const beforeNodePosition = parseTranslate(before.nodeTransform);
  const beforeMiniPosition = parseTranslate(before.miniNodeTransform);

  expect(beforeNodePosition).not.toBeNull();
  expect(beforeMiniPosition).toEqual(beforeNodePosition);
  expect(before.mainRouteD).toBeTruthy();
  expect(before.routeMaskD).toBe(before.mainRouteD);
  expect(before.connectedEdgeD).toBe(before.miniEdgeD);

  const screenPoint = await targetNode.evaluate((element) => {
    const matrix = element.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
  expect(screenPoint).not.toBeNull();

  await page.mouse.move(screenPoint.x, screenPoint.y);
  await page.mouse.down();
  await page.mouse.move(screenPoint.x + 24, screenPoint.y + 18, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator("#layout-editor-changed-count"))
    .toHaveText("布局草稿 · 已调整 1 个节点");
  await expect(page.locator("#layout-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");
  await expect(page.locator("#layout-editor-save-state"))
    .toContainText("请点击保存并应用");
  await expect(page.locator("#layout-editor-undo")).toBeEnabled();
  await expect(page.locator("#layout-editor-redo")).toBeDisabled();

  const dragged = await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID);
  const draggedNodePosition = parseTranslate(dragged.nodeTransform);
  const draggedMiniPosition = parseTranslate(dragged.miniNodeTransform);

  expect(draggedNodePosition).not.toEqual(beforeNodePosition);
  expect(draggedMiniPosition).toEqual(draggedNodePosition);
  expect(dragged.mainRouteD).not.toBe(before.mainRouteD);
  expect(dragged.routeMaskD).toBe(dragged.mainRouteD);
  expect(dragged.miniEdgeD).not.toBe(before.miniEdgeD);
  expect(dragged.connectedEdgeD).toBe(dragged.miniEdgeD);
  expect(dragged.connectedEdgeD).toContain(
    `${draggedNodePosition.x} ${draggedNodePosition.y}`,
  );

  const afterStorage = await storageSnapshot(page);
  const addedStorageKeys = Object.keys(afterStorage)
    .filter((key) => !(key in beforeStorage));
  expect(addedStorageKeys).toEqual([WORLD_ONE_DRAFT_KEY]);
  expect(afterStorage[SESSION_STORAGE_KEY]).toBeUndefined();

  const storedDraft = parseStoredAuthoringDraft(
    afterStorage[WORLD_ONE_DRAFT_KEY],
  );
  expect(storedDraft).toEqual(expect.objectContaining({
    schemaVersion: "board-layout-draft.v1",
    nodePositions: {
      [TARGET_NODE_ID]: draggedNodePosition,
    },
  }));

  await page.locator("#layout-editor-undo").click();
  await expect(page.locator("#layout-editor-undo")).toBeDisabled();
  await expect(page.locator("#layout-editor-redo")).toBeEnabled();
  expect(await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID)).toEqual(before);

  await page.locator("#layout-editor-redo").click();
  await expect(page.locator("#layout-editor-undo")).toBeEnabled();
  await expect(page.locator("#layout-editor-redo")).toBeDisabled();
  expect(await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID)).toEqual(dragged);

  const publishRequest = page.waitForRequest((request) => (
    request.method() === "PUT"
    && new URL(request.url()).pathname === "/api/admin/board-layouts/v1"
  ));
  await page.locator("#layout-editor-save").click();
  await publishRequest;
  await expect(page.locator("#layout-editor-save-bar"))
    .toHaveAttribute("data-save-state", "saved");
  await expect(page.locator("#layout-editor-save-state"))
    .toContainText("已应用到正式棋盘");
  const publishedEnvelope = parseStoredAuthoringEnvelope(
    (await storageSnapshot(page))[WORLD_ONE_DRAFT_KEY],
  );
  expect(publishedEnvelope.draft).toEqual(storedDraft);
  expect(publishedEnvelope.sourceRevision).toBe("e2e-layout-revision-1");
  expect(publishedEnvelope.sourceFingerprint)
    .toBe(authoringDraftFingerprint(storedDraft));
  expect(publishedLayouts.putBodies).toHaveLength(1);
  expect(publishedLayouts.putBodies[0]).toEqual(expect.objectContaining({
    expectedUserId: "e2e-layout-owner",
    expectedRevision: null,
    draft: expect.objectContaining({
      worldRef: WORLD_ONE_REF,
      nodePositions: {
        [TARGET_NODE_ID]: draggedNodePosition,
      },
    }),
  }));

  await page.locator("#layout-editor-close").click();
  await expect(page.locator("#layout-editor-panel")).toBeHidden();
  await expect(page.locator(".runtime-shell"))
    .not.toHaveAttribute("data-layout-editor-active", "true");
  expect(new URL(page.url()).searchParams.has("layoutEditor")).toBe(false);
  await expect(page.locator(
    `#board-svg .board-space[data-node-id="${TARGET_NODE_ID}"]`,
  )).toBeAttached();
  expect(ordinaryLayoutScene(
    await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID),
  )).toEqual(ordinaryLayoutScene(dragged));

  // The ordinary map must restore from the published server layout, not from
  // the editor's same-browser recovery draft.
  await clearLayoutEditorStorage(page);
  await page.reload();
  await expect(page.locator("#layout-editor-panel")).toBeHidden();
  await expect(page.locator(".runtime-shell"))
    .not.toHaveAttribute("data-layout-editor-active", "true");
  expect(ordinaryLayoutScene(
    await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID),
  )).toEqual(ordinaryLayoutScene(dragged));

  // A later working edit is auto-backed-up locally, but closing without the
  // explicit apply action must restore the last published visual revision.
  await page.locator("#layout-editor-open").click();
  await waitForLayoutEditor(page);
  const reopenedNode = await selectEditorNode(page, TARGET_NODE_ID);
  const reopened = parseTranslate(await reopenedNode.getAttribute("transform"));
  expect(reopened).toEqual(draggedNodePosition);
  await reopenedNode.focus();
  await page.keyboard.press("Shift+ArrowRight");
  const unsaved = await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID);
  expect(ordinaryLayoutScene(unsaved)).not.toEqual(ordinaryLayoutScene(dragged));
  await expect(page.locator("#layout-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");

  await page.locator("#layout-editor-close").click();
  await expect(page.locator("#layout-editor-panel")).toBeHidden();
  expect(publishedLayouts.putBodies).toHaveLength(1);
  expect(ordinaryLayoutScene(
    await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID),
  )).toEqual(ordinaryLayoutScene(dragged));

  await clearLayoutEditorStorage(page);
  await page.reload();
  expect(publishedLayouts.putBodies).toHaveLength(1);
  expect(ordinaryLayoutScene(
    await layoutScene(page, TARGET_NODE_ID, TARGET_EDGE_ID),
  )).toEqual(ordinaryLayoutScene(dragged));
});

test("dice faces and rewards publish separately and reload from the shared active DicePack", async ({
  page,
}) => {
  const publications = await mockPublishedBoardLayouts(page);
  await page.goto(EDITOR_PATH);
  await waitForLayoutEditor(page);

  await page.locator("#layout-editor-dice-tab").click();
  await expect(page.locator("#layout-editor-dice-section")).toBeVisible();
  await expect(page.locator("#layout-editor-node-section")).toBeHidden();
  await page.locator("#dice-pack-editor-family").selectOption("starter");
  await expect(page.locator("#dice-pack-editor-faces .dice-pack-face-row"))
    .toHaveCount(6);

  const firstRow = page.locator("#dice-pack-editor-faces .dice-pack-face-row").first();
  await firstRow.locator(".dice-pack-face-steps").selectOption("6");
  await page.locator("#dice-pack-editor-faces .dice-pack-face-row").first()
    .locator(".dice-pack-face-reward").selectOption("key");
  const updatedFirstRow = page.locator(
    "#dice-pack-editor-faces .dice-pack-face-row",
  ).first();
  await expect(updatedFirstRow.locator(".dice-pack-face-steps")).toHaveValue("6");
  await expect(updatedFirstRow.locator(".dice-pack-face-reward")).toHaveValue("key");
  await expect(updatedFirstRow.locator(".dice-pack-face-amount")).toHaveValue("1");
  await expect(page.locator("#dice-pack-editor-changed-count"))
    .toHaveText("骰子草稿 · 已修改 1 个骰面");
  await expect(page.locator("#dice-pack-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");

  const storedDraft = parseStoredAuthoringDraft(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      DICE_PACK_DRAFT_KEY,
    ),
  );
  expect(storedDraft.families.starter[0]).toEqual({
    steps: 6,
    reward: { type: "key", amount: 1 },
  });

  const publishRequest = page.waitForRequest((request) => (
    request.method() === "PUT"
    && new URL(request.url()).pathname === "/api/admin/dice-packs/v1"
  ));
  await page.locator("#dice-pack-editor-save").click();
  await publishRequest;
  await expect(page.locator("#dice-pack-editor-save-bar"))
    .toHaveAttribute("data-save-state", "saved");
  await expect(page.locator("#dice-pack-editor-save-state"))
    .toContainText("新开的棋局");
  expect(publications.putBodies).toHaveLength(0);
  expect(publications.dicePutBodies).toHaveLength(1);
  expect(publications.dicePutBodies[0]).toEqual(expect.objectContaining({
    expectedUserId: "e2e-layout-owner",
    expectedRevision: null,
    pack: expect.objectContaining({
      families: expect.objectContaining({
        starter: expect.arrayContaining([{
          steps: 6,
          reward: { type: "key", amount: 1 },
        }]),
      }),
    }),
  }));

  await page.locator("#layout-editor-close").click();
  await page.evaluate((key) => window.localStorage.removeItem(key), DICE_PACK_DRAFT_KEY);
  await page.reload();
  await page.locator("#layout-editor-open").click();
  await waitForLayoutEditor(page);
  await page.locator("#layout-editor-dice-tab").click();
  await page.locator("#dice-pack-editor-family").selectOption("starter");
  const restoredFirstRow = page.locator(
    "#dice-pack-editor-faces .dice-pack-face-row",
  ).first();
  await expect(restoredFirstRow.locator(".dice-pack-face-steps")).toHaveValue("6");
  await expect(restoredFirstRow.locator(".dice-pack-face-reward")).toHaveValue("key");
  await expect(page.locator("#dice-pack-editor-save-state"))
    .toContainText("正式使用的骰子配置");
});

test("mobile dice authoring keeps the publish action visible and all six faces reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockPublishedBoardLayouts(page);
  await page.goto(EDITOR_PATH);
  await waitForLayoutEditor(page);
  await page.locator("#layout-editor-dice-tab").click();
  await expect(page.locator("#dice-pack-editor-save")).toBeVisible();
  await expect(page.locator("#dice-pack-editor-faces .dice-pack-face-row"))
    .toHaveCount(6);

  const geometry = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const panel = document.querySelector("#layout-editor-panel").getBoundingClientRect();
    const save = document.querySelector("#dice-pack-editor-save").getBoundingClientRect();
    return {
      viewport,
      panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
      save: { left: save.left, right: save.right, top: save.top, bottom: save.bottom },
    };
  });
  expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
  expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewport.width);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewport.height);
  expect(geometry.save.left).toBeGreaterThanOrEqual(geometry.panel.left);
  expect(geometry.save.right).toBeLessThanOrEqual(geometry.panel.right);
  expect(geometry.save.top).toBeGreaterThanOrEqual(geometry.panel.top);
  expect(geometry.save.bottom).toBeLessThanOrEqual(geometry.panel.bottom);

  const lastRow = page.locator("#dice-pack-editor-faces .dice-pack-face-row").last();
  await lastRow.scrollIntoViewIfNeeded();
  await expect(lastRow.locator(".dice-pack-face-steps")).toBeVisible();
  await lastRow.locator(".dice-pack-face-steps").selectOption("6");
  await expect(page.locator("#dice-pack-editor-changed-count"))
    .toHaveText("骰子草稿 · 已修改 1 个骰面");
});

test("node rewards publish editable resources, lock special nodes, and restore from GET after reload", async ({
  page,
}) => {
  const publications = await mockPublishedBoardLayouts(page);
  await page.goto(EDITOR_PATH);
  await waitForLayoutEditor(page);
  await expect(page.locator("html"))
    .toHaveAttribute("data-node-reward-pack-ready", "true");

  await page.locator("#layout-editor-reward-tab").click();
  await expect(page.locator("#layout-editor-reward-tab"))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#layout-editor-reward-section")).toBeVisible();
  await expect(page.locator("#layout-editor-node-section")).toBeHidden();
  await expect(page.locator("#layout-editor-dice-section")).toBeHidden();

  await page.locator("#node-reward-editor-node").selectOption("n02");
  await expect(page.locator("#node-reward-editor-node-meta"))
    .toContainText("资源奖励可编辑");
  await expect(page.locator("#node-reward-editor-reward")).toBeEnabled();
  await page.locator("#node-reward-editor-reward").selectOption("star");
  await expect(page.locator("#node-reward-editor-amount")).toBeEnabled();
  await page.locator("#node-reward-editor-amount").fill("2");
  await page.locator("#node-reward-editor-amount").press("Tab");
  await expect(page.locator("#node-reward-editor-effective"))
    .toHaveText("当前结算：星星×2");
  await expect(page.locator("#node-reward-editor-changed-count"))
    .toHaveText("节点奖励草稿 · 已修改 1 个节点");
  await expect(page.locator("#node-reward-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");

  await page.locator("#node-reward-editor-node").selectOption("n04");
  await expect(page.locator("#node-reward-editor-node-meta"))
    .toContainText("规则节点只读");
  await expect(page.locator("#node-reward-editor-fixed-effect"))
    .toContainText("固定效果");
  await expect(page.locator("#node-reward-editor-fixed-detail"))
    .toContainText("岔路方向和弹窗时机");
  await expect(page.locator("#node-reward-editor-reward")).toBeDisabled();
  await expect(page.locator("#node-reward-editor-amount")).toBeDisabled();

  await page.locator("#node-reward-editor-node").selectOption("n02");
  await expect(page.locator("#node-reward-editor-reward")).toHaveValue("star");
  await expect(page.locator("#node-reward-editor-amount")).toHaveValue("2");
  const expectedPack = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    WORLD_ONE_REF,
    "n02",
    { type: "star", amount: 2 },
  );
  const storedDraft = parseStoredAuthoringDraft(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      NODE_REWARD_PACK_DRAFT_KEY,
    ),
  );
  expect(storedDraft).toEqual(expectedPack);

  const publishRequest = page.waitForRequest((request) => (
    request.method() === "PUT"
    && new URL(request.url()).pathname === "/api/admin/node-reward-packs/v1"
  ));
  await page.locator("#node-reward-editor-save").click();
  const request = await publishRequest;
  expect(request.postDataJSON()).toEqual({
    expectedUserId: "e2e-layout-owner",
    expectedRevision: null,
    pack: expectedPack,
  });
  await expect(page.locator("#node-reward-editor-save-bar"))
    .toHaveAttribute("data-save-state", "saved");
  await expect(page.locator("#node-reward-editor-save-state"))
    .toContainText("新开的棋局");
  expect(publications.nodeRewardPutBodies).toEqual([{
    expectedUserId: "e2e-layout-owner",
    expectedRevision: null,
    pack: expectedPack,
  }]);
  expect(publications.nodeRewardPublication()).toEqual(expect.objectContaining({
    status: "active",
    revision: "e2e-node-reward-revision-1",
    pack: expectedPack,
  }));
  expect(publications.putBodies).toHaveLength(0);
  expect(publications.dicePutBodies).toHaveLength(0);

  await page.locator("#layout-editor-close").click();
  await page.evaluate(
    (key) => window.localStorage.removeItem(key),
    NODE_REWARD_PACK_DRAFT_KEY,
  );
  await page.reload();
  await expect(page.locator("html"))
    .toHaveAttribute("data-node-reward-pack-ready", "true");
  await page.locator("#layout-editor-open").click();
  await waitForLayoutEditor(page);
  await page.locator("#layout-editor-reward-tab").click();
  await page.locator("#node-reward-editor-node").selectOption("n02");
  await expect(page.locator("#node-reward-editor-reward")).toHaveValue("star");
  await expect(page.locator("#node-reward-editor-amount")).toHaveValue("2");
  await expect(page.locator("#node-reward-editor-save-state"))
    .toContainText("正式使用的节点奖励配置");
});

test("375px node reward authoring keeps the publish button reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const publications = await mockPublishedBoardLayouts(page);
  await page.goto(EDITOR_PATH);
  await waitForLayoutEditor(page);
  await page.locator("#layout-editor-reward-tab").click();
  await page.locator("#node-reward-editor-node").selectOption("n02");
  await page.locator("#node-reward-editor-reward").selectOption("coin");

  const save = page.locator("#node-reward-editor-save");
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeVisible();
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector("#layout-editor-panel").getBoundingClientRect();
    const button = document.querySelector("#node-reward-editor-save").getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      panel: {
        left: panel.left,
        right: panel.right,
        top: panel.top,
        bottom: panel.bottom,
      },
      button: {
        left: button.left,
        right: button.right,
        top: button.top,
        bottom: button.bottom,
      },
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
  expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.panel.left);
  expect(geometry.button.right).toBeLessThanOrEqual(geometry.panel.right);
  expect(geometry.button.top).toBeGreaterThanOrEqual(geometry.panel.top);
  expect(geometry.button.bottom).toBeLessThanOrEqual(geometry.panel.bottom);

  const publishRequest = page.waitForRequest((request) => (
    request.method() === "PUT"
    && new URL(request.url()).pathname === "/api/admin/node-reward-packs/v1"
  ));
  await save.click();
  await publishRequest;
  await expect(page.locator("#node-reward-editor-save-bar"))
    .toHaveAttribute("data-save-state", "saved");
  expect(publications.nodeRewardPutBodies).toHaveLength(1);
});

test("classroom events expose fixed triggers, publish one frozen task event, lock transfer nodes, and restore from GET", async ({
  page,
}) => {
  const publications = await mockPublishedBoardLayouts(page);
  const expectedProgram = programWithPrimaryEventAt("n02");
  const worldOneCatalog = PRIMARY_LEARNING_CATALOG.worlds[WORLD_ONE_REF];
  const worldTwoCatalog = PRIMARY_LEARNING_CATALOG.worlds[WORLD_TWO_REF];

  await page.goto(EDITOR_PATH);
  await waitForLayoutEditor(page);
  await page.locator("#layout-editor-event-tab").click();
  await expect(page.locator("#layout-editor-event-tab"))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#layout-editor-event-section")).toBeVisible();
  await expect(page.locator("#layout-editor-node-section")).toBeHidden();
  await expect(page.locator("#layout-editor-dice-section")).toBeHidden();
  await expect(page.locator("#layout-editor-reward-section")).toBeHidden();
  await expect(page.locator("#classroom-event-editor-trigger-heading"))
    .toHaveText("固定 Trigger");

  await page.locator("#classroom-event-editor-learning")
    .selectOption(PRIMARY_LEARNING_REF);
  await page.locator("#classroom-event-editor-world").selectOption(WORLD_ONE_REF);
  await page.locator("#classroom-event-editor-node").selectOption("n02");
  await expect(page.locator("#classroom-event-editor-trigger-when"))
    .toContainText("最终停在本格");
  await expect(page.locator("#classroom-event-editor-trigger-effect"))
    .not.toHaveText("选择节点后显示地图效果与奖励顺序");
  await expect(page.locator("#classroom-event-editor-trigger-source"))
    .toContainText(worldOneCatalog.boardRef);
  await expect(page.locator("#classroom-event-editor-trigger-source"))
    .toContainText(worldOneCatalog.levelRef);
  await expect(page.locator("#classroom-event-editor-trigger-source"))
    .toContainText("题目事件只会在其后追加");
  await expect(page.locator("#classroom-event-editor-event")).toBeEnabled();

  await page.locator("#classroom-event-editor-event")
    .selectOption(PRIMARY_EVENT.eventRef);
  await expect(page.locator("#classroom-event-editor-title"))
    .toHaveText(PRIMARY_EVENT.content.title);
  await expect(page.locator("#classroom-event-editor-source-question"))
    .toContainText(PRIMARY_EVENT.sourceTaskRef);
  await expect(page.locator("#classroom-event-editor-changed-count"))
    .toHaveText("节点事件草稿 · 已修改 1 项绑定");
  await expect(page.locator("#classroom-event-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");
  const storedDraft = parseStoredAuthoringDraft(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      CLASSROOM_EVENT_PROGRAM_DRAFT_KEY,
    ),
  );
  expect(storedDraft).toEqual(expectedProgram);

  for (const nodeId of ["n06a", "n49"]) {
    const catalogNode = worldOneCatalog.nodeById[nodeId];
    await page.locator("#classroom-event-editor-node").selectOption(nodeId);
    await expect(page.locator("#classroom-event-editor-event")).toBeDisabled();
    await expect(page.locator("#classroom-event-editor-event"))
      .toHaveValue("inherit");
    await expect(page.locator("#classroom-event-editor-trigger-source"))
      .toContainText(catalogNode.lockReason);
  }

  await page.locator("#classroom-event-editor-world").selectOption(WORLD_TWO_REF);
  await page.locator("#classroom-event-editor-node").selectOption("w2n52");
  await expect(page.locator("#classroom-event-editor-event")).toBeDisabled();
  await expect(page.locator("#classroom-event-editor-event"))
    .toHaveValue("inherit");
  await expect(page.locator("#classroom-event-editor-trigger-source"))
    .toContainText(worldTwoCatalog.nodeById.w2n52.lockReason);

  await page.locator("#classroom-event-editor-world").selectOption(WORLD_ONE_REF);
  await page.locator("#classroom-event-editor-node").selectOption("n02");
  await expect(page.locator("#classroom-event-editor-event"))
    .toHaveValue(PRIMARY_EVENT.eventRef);

  const publishRequest = page.waitForRequest((request) => (
    request.method() === "PUT"
    && new URL(request.url()).pathname
      === "/api/admin/classroom-event-programs/v1"
  ));
  await page.locator("#classroom-event-editor-save").click();
  const request = await publishRequest;
  expect(request.postDataJSON()).toEqual({
    expectedUserId: "e2e-layout-owner",
    expectedRevision: null,
    pack: expectedProgram,
  });
  await expect(page.locator("#classroom-event-editor-save-bar"))
    .toHaveAttribute("data-save-state", "saved");
  await expect(page.locator("#classroom-event-editor-save-state"))
    .toContainText("只影响之后新开的棋局");
  expect(publications.classroomEventProgramPutBodies).toEqual([{
    expectedUserId: "e2e-layout-owner",
    expectedRevision: null,
    pack: expectedProgram,
  }]);
  expect(publications.classroomEventProgramPublication()).toEqual(
    expect.objectContaining({
      status: "active",
      revision: "e2e-classroom-event-revision-1",
      pack: expectedProgram,
    }),
  );
  expect(publications.putBodies).toHaveLength(0);
  expect(publications.dicePutBodies).toHaveLength(0);
  expect(publications.nodeRewardPutBodies).toHaveLength(0);

  await page.locator("#layout-editor-close").click();
  await page.evaluate(
    (key) => window.localStorage.removeItem(key),
    CLASSROOM_EVENT_PROGRAM_DRAFT_KEY,
  );
  await page.reload();
  await expect(page.locator("html"))
    .toHaveAttribute("data-classroom-event-program-ready", "true");
  await expect(page.locator(
    "#board-svg .board-space[data-node-id='n02']",
  )).toHaveAttribute("data-classroom-event-mode", "event");
  await expect(page.locator(
    "#board-svg .board-space[data-node-id='n02']",
  )).toHaveAttribute("data-classroom-event-ref", PRIMARY_EVENT.eventRef);

  await page.locator("#layout-editor-open").click();
  await waitForLayoutEditor(page);
  await page.locator("#layout-editor-event-tab").click();
  await page.locator("#classroom-event-editor-learning")
    .selectOption(PRIMARY_LEARNING_REF);
  await page.locator("#classroom-event-editor-world").selectOption(WORLD_ONE_REF);
  await page.locator("#classroom-event-editor-node").selectOption("n02");
  await expect(page.locator("#classroom-event-editor-event"))
    .toHaveValue(PRIMARY_EVENT.eventRef);
  await expect(page.locator("#classroom-event-editor-save-state"))
    .toContainText("已载入当前正式节点事件配置");
});

test("375px classroom event authoring keeps the fourth tab and publish action reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const publications = await mockPublishedBoardLayouts(page);
  await page.goto(EDITOR_PATH);
  await waitForLayoutEditor(page);

  const eventTab = page.locator("#layout-editor-event-tab");
  await eventTab.scrollIntoViewIfNeeded();
  await expect(eventTab).toBeVisible();
  await eventTab.click();
  await page.locator("#classroom-event-editor-node").selectOption("n02");
  await page.locator("#classroom-event-editor-event")
    .selectOption(PRIMARY_EVENT.eventRef);

  const save = page.locator("#classroom-event-editor-save");
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeVisible();
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector("#layout-editor-panel").getBoundingClientRect();
    const tab = document.querySelector("#layout-editor-event-tab").getBoundingClientRect();
    const button = document.querySelector("#classroom-event-editor-save")
      .getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      panel: {
        left: panel.left,
        right: panel.right,
        top: panel.top,
        bottom: panel.bottom,
      },
      tab: {
        left: tab.left,
        right: tab.right,
        top: tab.top,
        bottom: tab.bottom,
      },
      button: {
        left: button.left,
        right: button.right,
        top: button.top,
        bottom: button.bottom,
      },
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
  expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.tab.left).toBeGreaterThanOrEqual(geometry.panel.left);
  expect(geometry.tab.right).toBeLessThanOrEqual(geometry.panel.right);
  expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.panel.left);
  expect(geometry.button.right).toBeLessThanOrEqual(geometry.panel.right);
  expect(geometry.button.top).toBeGreaterThanOrEqual(geometry.panel.top);
  expect(geometry.button.bottom).toBeLessThanOrEqual(geometry.panel.bottom);

  const publishRequest = page.waitForRequest((request) => (
    request.method() === "PUT"
    && new URL(request.url()).pathname
      === "/api/admin/classroom-event-programs/v1"
  ));
  await save.click();
  await publishRequest;
  await expect(page.locator("#classroom-event-editor-save-bar"))
    .toHaveAttribute("data-save-state", "saved");
  expect(publications.classroomEventProgramPutBodies).toHaveLength(1);
});

test("a configured classroom event opens only after its final landing and stays completed after refresh", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const publications = await mockPublishedBoardLayouts(page);
  publications.setClassroomEventProgramPublication(
    programWithPrimaryEventAt("n02"),
    "e2e-session-classroom-event-v1",
  );

  await page.goto(FULL_MOTION_QA_PATH);
  await expect(page.locator("html"))
    .toHaveAttribute("data-qa-harness-ready", "true");
  await expect(page.locator("html"))
    .toHaveAttribute("data-classroom-event-program-ready", "true");
  await page.locator("#setup-learning")
    .selectOption(PRIMARY_LEARNING_CATALOG.learningPackId);
  await page.locator("#setup-player-count").selectOption("1");
  await page.locator(
    ".character-option:not(:disabled):not([aria-pressed='true'])",
  ).first().click();
  await page.locator("#start-session").click();
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await page.waitForFunction((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    return snapshot?.classroomEventProgramSnapshot?.revision
      === "e2e-session-classroom-event-v1";
  }, SESSION_STORAGE_KEY);
  await expect(page.locator("#activity-stage")).toBeHidden();

  await page.evaluate(() => {
    const observation = {
      stepAddedAt: null,
      stepRemovedAt: null,
      activityOpenedAt: null,
      activityOpenedWithStepPawn: null,
      sawStep: false,
      observer: null,
    };
    const inspect = () => {
      const hasStepPawn = Boolean(document.querySelector(".step-pawn"));
      const activityOpen = document.querySelector("#activity-stage")?.hidden === false;
      const now = performance.now();
      if (hasStepPawn && !observation.sawStep) {
        observation.sawStep = true;
        observation.stepAddedAt = now;
      }
      if (
        observation.sawStep
        && !hasStepPawn
        && observation.stepRemovedAt === null
      ) {
        observation.stepRemovedAt = now;
      }
      if (activityOpen && observation.activityOpenedAt === null) {
        observation.activityOpenedAt = now;
        observation.activityOpenedWithStepPawn = hasStepPawn;
      }
    };
    observation.observer = new MutationObserver(inspect);
    observation.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["hidden"],
      childList: true,
      subtree: true,
    });
    window.__classroomEventOrder = observation;
    inspect();
  });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("voice-board:qa-assessment", {
      detail: {
        kind: "score",
        score: 45,
        primaryAccepted: false,
        knowledgeStatus: "wrong",
      },
    }));
  });
  const starter = page.locator(
    "#dice-options .dice-option[data-dice-option-id='starter']",
  );
  await expect(starter).toBeVisible();
  await page.evaluate(() => { Math.random = () => 0; });
  await starter.click();

  const activity = page.locator("#activity-stage");
  await expect(activity).toBeVisible();
  await expect(activity).toHaveAttribute("data-event-id", PRIMARY_EVENT.eventRef);
  await expect(activity)
    .toHaveAttribute("data-event-program-revision", "e2e-session-classroom-event-v1");
  await expect(page.locator("#activity-title")).toHaveText(PRIMARY_EVENT.content.title);
  await expect(page.locator(".pawn[data-team-id='player-1']"))
    .toHaveAttribute("data-node-id", "n02");
  const order = await page.evaluate(() => {
    const observation = window.__classroomEventOrder;
    observation?.observer?.disconnect();
    return observation ? {
      stepAddedAt: observation.stepAddedAt,
      stepRemovedAt: observation.stepRemovedAt,
      activityOpenedAt: observation.activityOpenedAt,
      activityOpenedWithStepPawn: observation.activityOpenedWithStepPawn,
    } : null;
  });
  expect(order).not.toBeNull();
  expect(order.stepAddedAt).not.toBeNull();
  expect(order.stepRemovedAt).not.toBeNull();
  expect(order.activityOpenedAt).toBeGreaterThanOrEqual(order.stepRemovedAt);
  expect(order.activityOpenedWithStepPawn).toBe(false);

  let snapshot = await page.evaluate((storageKey) => (
    JSON.parse(window.localStorage.getItem(storageKey) || "null")
  ), SESSION_STORAGE_KEY);
  expect(snapshot.runtime.teams[0].nodeId).toBe("n02");
  expect(snapshot.runtime.currentActivity.eventId).toBe(PRIMARY_EVENT.eventRef);

  await page.locator("#complete-activity").click();
  await page.waitForFunction((storageKey) => {
    const current = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    return (
      current?.runtime?.currentActivity === null
      && current?.gameSession?.phase === "ANSWER_LISTENING"
      && current?.gameSession?.inputGate === "open"
    );
  }, SESSION_STORAGE_KEY);
  await expect(activity).toBeHidden();

  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await expect(page.locator("#activity-stage")).toBeHidden();
  snapshot = await page.evaluate((storageKey) => (
    JSON.parse(window.localStorage.getItem(storageKey) || "null")
  ), SESSION_STORAGE_KEY);
  expect(snapshot.runtime.currentActivity).toBeNull();
  expect(snapshot.classroomEventProgramSnapshot.revision)
    .toBe("e2e-session-classroom-event-v1");
});

test("a hot NodeRewardPack publication cannot replace the reward pinned by an active session", async ({
  page,
}) => {
  const publications = await mockPublishedBoardLayouts(page);
  const sessionPack = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    WORLD_ONE_REF,
    "n02",
    { type: "star", amount: 2 },
  );
  publications.setNodeRewardPublication(
    sessionPack,
    "e2e-session-node-reward-v1",
  );

  await page.goto(FULL_MOTION_QA_PATH);
  await expect(page.locator("html"))
    .toHaveAttribute("data-qa-harness-ready", "true");
  await page.locator("#setup-player-count").selectOption("1");
  await page.locator(
    ".character-option:not(:disabled):not([aria-pressed='true'])",
  ).first().click();
  await page.locator("#start-session").click();
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await page.waitForFunction((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    return snapshot?.nodeRewardPackSnapshot?.revision
      === "e2e-session-node-reward-v1";
  }, SESSION_STORAGE_KEY);

  const hotPack = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    WORLD_ONE_REF,
    "n02",
    { type: "none", amount: 0 },
  );
  publications.setNodeRewardPublication(hotPack, "e2e-hot-node-reward-v2");
  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await expect(page.locator("#asr-toggle")).toBeEnabled();

  let restoredSnapshot = await page.evaluate((storageKey) => (
    JSON.parse(window.localStorage.getItem(storageKey) || "null")
  ), SESSION_STORAGE_KEY);
  expect(restoredSnapshot.nodeRewardPackSnapshot.revision)
    .toBe("e2e-session-node-reward-v1");
  expect(
    restoredSnapshot.nodeRewardPackSnapshot.pack
      .worlds[WORLD_ONE_REF].nodes.n02,
  ).toEqual({ type: "star", amount: 2 });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("voice-board:qa-assessment", {
      detail: {
        kind: "score",
        score: 45,
        primaryAccepted: false,
        knowledgeStatus: "wrong",
      },
    }));
  });
  const starter = page.locator(
    "#dice-options .dice-option[data-dice-option-id='starter']",
  );
  await expect(starter).toBeVisible();
  await page.evaluate(() => { Math.random = () => 0; });
  await starter.click();
  await page.waitForFunction((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    return (
      snapshot?.gameSession?.completedTurns === 1
      && snapshot?.runtime?.teams?.[0]?.nodeId === "n02"
      && snapshot?.playerAssetsLedger?.playerAssetsById?.["seat-1"]?.stars === 2
    );
  }, SESSION_STORAGE_KEY);

  restoredSnapshot = await page.evaluate((storageKey) => (
    JSON.parse(window.localStorage.getItem(storageKey) || "null")
  ), SESSION_STORAGE_KEY);
  expect(restoredSnapshot.nodeRewardPackSnapshot.revision)
    .toBe("e2e-session-node-reward-v1");
  expect(restoredSnapshot.playerAssetsLedger.playerAssetsById["seat-1"].stars)
    .toBe(2);
});

test("a hot DicePack publication cannot replace the full pack pinned by an active session", async ({
  page,
}) => {
  const publications = await mockPublishedBoardLayouts(page);
  const sessionPack = updateDicePackFace(DEFAULT_DICE_PACK, "starter", 0, {
    steps: 6,
    rewardType: "key",
    rewardAmount: 1,
  });
  publications.setDicePublication(sessionPack, "e2e-session-dice-v1");
  await page.goto(FULL_MOTION_QA_PATH);
  await expect(page.locator("html"))
    .toHaveAttribute("data-qa-harness-ready", "true");
  await page.locator("#setup-player-count").selectOption("1");
  await page.locator(
    ".character-option:not(:disabled):not([aria-pressed='true'])",
  ).first().click();
  await page.locator("#start-session").click();
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await page.waitForFunction((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    return snapshot?.dicePackSnapshot?.revision === "e2e-session-dice-v1";
  }, SESSION_STORAGE_KEY);

  const hotPack = updateDicePackFace(DEFAULT_DICE_PACK, "starter", 0, {
    steps: 2,
    rewardType: "none",
    rewardAmount: 0,
  });
  publications.setDicePublication(hotPack, "e2e-hot-dice-v2");
  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await expect(page.locator("#asr-toggle")).toBeEnabled();

  const restoredSnapshot = await page.evaluate((storageKey) => (
    JSON.parse(window.localStorage.getItem(storageKey) || "null")
  ), SESSION_STORAGE_KEY);
  expect(restoredSnapshot.dicePackSnapshot.revision).toBe("e2e-session-dice-v1");
  expect(restoredSnapshot.dicePackSnapshot.pack.families.starter[0]).toEqual({
    steps: 6,
    reward: { type: "key", amount: 1 },
  });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("voice-board:qa-assessment", {
      detail: {
        kind: "score",
        score: 45,
        primaryAccepted: false,
        knowledgeStatus: "wrong",
      },
    }));
  });
  const starter = page.locator(
    "#dice-options .dice-option[data-dice-option-id='starter']",
  );
  await expect(starter).toBeVisible();
  await expect(starter.locator(".dice-option-face-tray .dice-face-number").first())
    .toHaveText("6");
  await expect(starter.locator(".dice-option-face-tray .dice-face-bonus-label").first())
    .toContainText("钥匙");
});

test("an unattributed legacy working layout is quarantined without becoming an applied visual", async ({
  page,
}) => {
  const publishedLayouts = await mockPublishedBoardLayouts(page);
  const baseNode = BOARD_TEMPLATE.nodes.find(({ id }) => id === TARGET_NODE_ID);
  const legacyPosition = { x: baseNode.x + 13, y: baseNode.y + 7 };
  const laterWorkingPosition = { x: baseNode.x + 24, y: baseNode.y + 12 };
  const blank = createBoardLayoutDraft(BOARD_TEMPLATE, { worldRef: WORLD_ONE_REF });
  const legacyDraft = updateBoardLayoutDraft(
    BOARD_TEMPLATE,
    blank,
    TARGET_NODE_ID,
    legacyPosition,
    { worldRef: WORLD_ONE_REF },
  );
  const laterWorkingDraft = updateBoardLayoutDraft(
    BOARD_TEMPLATE,
    blank,
    TARGET_NODE_ID,
    laterWorkingPosition,
    { worldRef: WORLD_ONE_REF },
  );

  await page.addInitScript(({ workingKey, appliedKey, value }) => {
    try {
      const marker = "e2e.legacy-layout-preloaded";
      if (window.sessionStorage.getItem(marker)) return;
      window.localStorage.setItem(workingKey, value);
      window.localStorage.removeItem(appliedKey);
      window.sessionStorage.setItem(marker, "1");
    } catch {
      // about:blank has an opaque origin; the script runs again on navigation.
    }
  }, {
    workingKey: WORLD_ONE_DRAFT_KEY,
    appliedKey: WORLD_ONE_APPLIED_KEY,
    value: JSON.stringify(legacyDraft),
  });

  await page.goto(ORDINARY_QA_PATH);
  await waitForLegacyDraftQuarantine(page, WORLD_ONE_DRAFT_KEY, legacyDraft);
  await expectBoardNodePosition(page, TARGET_NODE_ID, {
    x: baseNode.x,
    y: baseNode.y,
  });
  let storage = await storageSnapshot(page);
  expect(parseStoredAuthoringDraft(storage[WORLD_ONE_DRAFT_KEY]))
    .toEqual(blank);
  expect(storage[WORLD_ONE_APPLIED_KEY]).toBeUndefined();
  const firstLegacyBackupKey = Object.keys(storage).find((key) => (
    key.startsWith(`${WORLD_ONE_DRAFT_KEY}:stale:`)
  ));
  expect(firstLegacyBackupKey).toBeTruthy();
  expect(JSON.parse(storage[firstLegacyBackupKey])).toEqual(legacyDraft);
  expect(publishedLayouts.putBodies).toHaveLength(0);

  await page.locator("#layout-editor-open").click();
  await waitForLayoutEditor(page);
  const restoredNode = await selectEditorNode(page, TARGET_NODE_ID);
  expect(parseTranslate(await restoredNode.getAttribute("transform")))
    .toEqual({ x: baseNode.x, y: baseNode.y });
  await page.locator("#layout-editor-x").fill(String(laterWorkingPosition.x));
  await page.locator("#layout-editor-y").fill(String(laterWorkingPosition.y));
  await page.locator("#layout-editor-y").press("Enter");
  await expectBoardNodePosition(page, TARGET_NODE_ID, laterWorkingPosition);
  await expect(page.locator("#layout-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");

  await page.locator("#layout-editor-close").click();
  await expect(page.locator("#layout-editor-panel")).toBeHidden();
  await expectBoardNodePosition(page, TARGET_NODE_ID, {
    x: baseNode.x,
    y: baseNode.y,
  });
  expect(publishedLayouts.putBodies).toHaveLength(0);

  await clearWorkingLayoutStorage(page);
  await page.reload();
  await expectBoardNodePosition(page, TARGET_NODE_ID, {
    x: baseNode.x,
    y: baseNode.y,
  });
  storage = await storageSnapshot(page);
  expect(storage[WORLD_ONE_DRAFT_KEY]).toBeUndefined();
  expect(storage[WORLD_ONE_APPLIED_KEY]).toBeUndefined();

  // A second unattributed working draft is also backed up instead of silently
  // becoming an applied layout or inheriting the current publication revision.
  await page.evaluate(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, {
    key: WORLD_ONE_DRAFT_KEY,
    value: JSON.stringify(laterWorkingDraft),
  });
  await page.reload();
  await waitForLegacyDraftQuarantine(
    page,
    WORLD_ONE_DRAFT_KEY,
    laterWorkingDraft,
  );
  await expectBoardNodePosition(page, TARGET_NODE_ID, {
    x: baseNode.x,
    y: baseNode.y,
  });
  expect(publishedLayouts.putBodies).toHaveLength(0);
  storage = await storageSnapshot(page);
  expect(storage[WORLD_ONE_APPLIED_KEY]).toBeUndefined();
  expect(parseStoredAuthoringDraft(storage[WORLD_ONE_DRAFT_KEY]))
    .toEqual(blank);
  expect(Object.keys(storage).some((key) => (
    key.startsWith(`${WORLD_ONE_DRAFT_KEY}:stale:`)
    && JSON.stringify(JSON.parse(storage[key])) === JSON.stringify(laterWorkingDraft)
  ))).toBe(true);
});

test("published visual nodes are the pixel endpoints of every full-motion pawn step", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const publishedLayouts = await mockPublishedBoardLayouts(page);
  let publishedDraft = createBoardLayoutDraft(
    BOARD_TEMPLATE,
    { worldRef: WORLD_ONE_REF },
  );
  for (const [nodeId, position] of Object.entries(MOVEMENT_NODE_POSITIONS)) {
    publishedDraft = updateBoardLayoutDraft(
      BOARD_TEMPLATE,
      publishedDraft,
      nodeId,
      position,
      { worldRef: WORLD_ONE_REF },
    );
  }
  publishedLayouts.layouts.set(WORLD_ONE_REF, {
    worldRef: WORLD_ONE_REF,
    boardRef: boardLayoutRef(BOARD_TEMPLATE),
    baseSignature: boardLayoutSignature(BOARD_TEMPLATE),
    status: "active",
    revision: "e2e-movement-layout-revision",
    updatedAt: "2026-08-02T00:00:00.000Z",
    updatedBy: "e2e-layout-owner",
    draft: publishedDraft,
  });

  await page.goto(FULL_MOTION_QA_PATH);
  await expect(page.locator("html"))
    .toHaveAttribute("data-qa-harness-ready", "true");
  await expectBoardNodePosition(page, "n02", MOVEMENT_NODE_POSITIONS.n02);
  await expectBoardNodePosition(page, "n03", MOVEMENT_NODE_POSITIONS.n03);

  await page.locator("#setup-player-count").selectOption("1");
  const character = page.locator(
    ".character-option:not(:disabled):not([aria-pressed='true'])",
  ).first();
  await expect(character).toBeEnabled();
  await character.click();
  await expect(page.locator("#start-session")).toBeEnabled();
  await page.locator("#start-session").click();
  await expect(page.locator("#speaker-name")).toHaveText("Mia");
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await expectBoardNodePosition(page, "n02", MOVEMENT_NODE_POSITIONS.n02);
  await expectBoardNodePosition(page, "n03", MOVEMENT_NODE_POSITIONS.n03);

  // This shortcut exists only behind qaHarness=1. Production and ordinary QA
  // entry points remain covered by the formal recording-flow isolation test.
  await page.evaluate(() => {
    const samples = [0.999, 0.999, 0];
    Math.random = () => samples.shift() ?? 0;
  });
  await startPawnStepGeometryObservation(page);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("voice-board:qa-assessment", {
      detail: {
        kind: "score",
        score: 92,
        primaryAccepted: true,
        knowledgeStatus: "ok",
      },
    }));
  });

  const steadyDie = page.locator(
    "#dice-options .dice-option[data-dice-option-id='steady']",
  );
  await expect(steadyDie).toBeVisible();
  await steadyDie.click();
  const steps = await finishPawnStepGeometryObservation(page, 2);
  await page.waitForFunction((storageKey) => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return false;
    const snapshot = JSON.parse(stored);
    return (
      snapshot.gameSession?.completedTurns === 1
      && snapshot.gameSession?.phase === "ANSWER_LISTENING"
      && snapshot.gameSession?.inputGate === "open"
      && snapshot.runtime?.teams?.[0]?.nodeId === "n03"
      && document.querySelector("#asr-toggle")?.disabled === false
      && !document.querySelector(".step-pawn")
    );
  }, SESSION_STORAGE_KEY);

  expect(steps.map(({ dataset }) => ({
    targetNodeId: dataset.targetNodeId,
    stepLabel: dataset.stepLabel,
  }))).toEqual([
    { targetNodeId: "n02", stepLabel: "1/2 格" },
    { targetNodeId: "n03", stepLabel: "2/2 格" },
  ]);
  expect(steps.map(({ sourceNodeId }) => sourceNodeId)).toEqual(["n01", "n02"]);
  for (const step of steps) {
    expect(step.expectedFinalCenter).not.toBeNull();
    expect(step.duration).toBeGreaterThanOrEqual(450);
    expect(step.duration).toBeLessThanOrEqual(520);
    expect(step.samples.length).toBeGreaterThanOrEqual(12);
    const finalSample = step.samples.at(-1);
    expect(finalSample.center).not.toBeNull();
    expect(finalSample.currentTime).toBeGreaterThanOrEqual(step.duration * 0.9);
    expect(pointDistance(finalSample.center, step.expectedFinalCenter))
      .toBeLessThanOrEqual(10);
  }
  await expect(page.locator(".pawn[data-team-id='player-1']"))
    .toHaveAttribute("data-node-id", "n03");
});

test("375px layout editor contains its board and panel while focused nodes nudge by keyboard", async ({
  page,
}) => {
  await mockPublishedBoardLayouts(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(EDITOR_PATH);
  await waitForLayoutEditor(page);

  const geometry = await page.evaluate(() => {
    const board = document.querySelector(".board-viewport").getBoundingClientRect();
    const panel = document.querySelector("#layout-editor-panel").getBoundingClientRect();
    const save = document.querySelector("#layout-editor-save").getBoundingClientRect();
    const panelElement = document.querySelector("#layout-editor-panel");
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      board: {
        left: board.left,
        top: board.top,
        right: board.right,
        bottom: board.bottom,
        width: board.width,
        height: board.height,
      },
      panel: {
        left: panel.left,
        top: panel.top,
        right: panel.right,
        bottom: panel.bottom,
        width: panel.width,
        height: panel.height,
        scrollWidth: panelElement.scrollWidth,
        clientWidth: panelElement.clientWidth,
      },
      save: {
        left: save.left,
        top: save.top,
        right: save.right,
        bottom: save.bottom,
      },
    };
  });

  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.innerWidth + 1);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.innerWidth + 1);
  expect(geometry.board.left).toBeGreaterThanOrEqual(0);
  expect(geometry.board.top).toBeGreaterThanOrEqual(0);
  expect(geometry.board.right).toBeLessThanOrEqual(geometry.innerWidth + 1);
  expect(geometry.board.bottom).toBeLessThanOrEqual(geometry.innerHeight + 1);
  expect(geometry.board.height).toBeGreaterThanOrEqual(260);
  expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
  expect(geometry.panel.top).toBeGreaterThanOrEqual(0);
  expect(geometry.panel.right).toBeLessThanOrEqual(geometry.innerWidth + 1);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.innerHeight + 1);
  expect(geometry.panel.scrollWidth).toBeLessThanOrEqual(geometry.panel.clientWidth + 1);
  expect(geometry.board.bottom).toBeLessThanOrEqual(geometry.panel.top + 1);
  expect(geometry.save.left).toBeGreaterThanOrEqual(geometry.panel.left);
  expect(geometry.save.top).toBeGreaterThanOrEqual(geometry.panel.top);
  expect(geometry.save.right).toBeLessThanOrEqual(geometry.panel.right);
  expect(geometry.save.bottom).toBeLessThanOrEqual(geometry.panel.bottom);

  const selectedNode = page.locator(
    "#board-svg .board-space[data-node-id='n01']",
  );
  const initial = parseTranslate(await selectedNode.getAttribute("transform"));
  expect(initial).not.toBeNull();

  await selectedNode.focus();
  await expect(selectedNode).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#layout-editor-x"))
    .toHaveValue(String(initial.x + 1));

  const afterOnePixel = parseTranslate(await selectedNode.getAttribute("transform"));
  expect(afterOnePixel).toEqual({ x: initial.x + 1, y: initial.y });

  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator("#layout-editor-y"))
    .toHaveValue(String(initial.y + 10));
  const afterTenPixels = parseTranslate(await selectedNode.getAttribute("transform"));
  expect(afterTenPixels).toEqual({ x: initial.x + 1, y: initial.y + 10 });

  await expect(page.locator("#layout-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");
  await page.locator("#layout-editor-save").click();
  await expect(page.locator("#layout-editor-save-state"))
    .toContainText("已应用到正式棋盘");
  await page.locator("#layout-editor-panel").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const scrolledSaveGeometry = await page.locator("#layout-editor-save")
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
      };
    });
  expect(scrolledSaveGeometry.top).toBeGreaterThanOrEqual(0);
  expect(scrolledSaveGeometry.bottom)
    .toBeLessThanOrEqual(scrolledSaveGeometry.viewportHeight);

  const mobileStorage = await storageSnapshot(page);
  expect(Object.keys(mobileStorage)).toEqual([WORLD_ONE_DRAFT_KEY]);
  expect(mobileStorage[SESSION_STORAGE_KEY]).toBeUndefined();

  await closeEditorAndClearDrafts(page);
  expect(
    Object.keys(await storageSnapshot(page))
      .filter((key) => key.startsWith(LAYOUT_DRAFT_PREFIX)),
  ).toEqual([]);
});
