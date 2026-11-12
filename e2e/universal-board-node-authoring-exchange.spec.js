import { expect, test } from "playwright/test";

import {
  authoringDraftFingerprint,
  createAuthoringDraftEnvelope,
} from "../public/prototypes/universal-board/authoring-draft-envelope-core.js";
import {
  boardLayoutRef,
  boardLayoutSignature,
} from "../public/prototypes/universal-board/board-layout-editor-core.js";
import {
  DEFAULT_CLASSROOM_EVENT_PROGRAM,
} from "../public/prototypes/universal-board/classroom-event-program-core.js";
import {
  DEFAULT_NODE_REWARD_PACK,
  updateNodeRewardPolicy,
} from "../public/prototypes/universal-board/node-reward-pack-core.js";
import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
} from "../public/prototypes/universal-board/expansion-world.js";
import { BOARD_TEMPLATE } from "../public/prototypes/universal-board/packs.js";

const GAME_PATH = "/prototypes/universal-board/?qa=1";
const EDITOR_PATH = "/prototypes/universal-board/?qa=1&layoutEditor=1";
const SESSION_STORAGE_KEY = "tim.voice-board.local-session.v1";
const DICE_PACK_DRAFT_KEY = "tim.voice-board.dice-pack-draft.v1";
const NODE_REWARD_PACK_DRAFT_KEY = "tim.voice-board.node-reward-pack-draft.v1";
const CLASSROOM_EVENT_PROGRAM_DRAFT_KEY = (
  "tim.voice-board.classroom-event-program-draft.v1"
);
const LAYOUT_DRAFT_PREFIX = "tim.voice-board.board-layout-draft.v1:";
const WORLD_ONE_REF = "world.ximitu.cloud-harbor@1.1.0";
const WORLD_TWO_REF = "world.ximitu.beyond-cloud@1.0.0";
const WORLD_ONE_DRAFT_KEY = `${LAYOUT_DRAFT_PREFIX}world.ximitu.cloud-harbor`;
const WORLD_TWO_DRAFT_KEY = `${LAYOUT_DRAFT_PREFIX}world.ximitu.beyond-cloud`;

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

async function mockAuthoringApis(context, {
  nodeRewardPublication = {
    status: "default",
    revision: null,
    updatedAt: null,
    updatedBy: null,
    pack: DEFAULT_NODE_REWARD_PACK,
  },
} = {}) {
  const adminWrites = [];
  const layouts = [
    emptyLayoutPublication(WORLD_ONE_REF, BOARD_TEMPLATE),
    emptyLayoutPublication(WORLD_TWO_REF, EXPANSION_WORLD_BOARD_TEMPLATE),
  ];

  await context.route("**/api/admin/**", async (route) => {
    const request = route.request();
    adminWrites.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      body: request.postData() || "",
    });
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "E2E 不允许发布节点交换草稿",
        code: "e2e_unexpected_authoring_publish",
      }),
    });
  });

  await context.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: "e2e-node-authoring-owner",
          displayName: "Node Authoring Owner",
          role: "owner",
          status: "active",
        },
      }),
    });
  });

  await context.route("**/api/board-layouts/v1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "board-layout-registry.v1",
        layouts,
      }),
    });
  });

  await context.route("**/api/node-reward-packs/v1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "node-reward-pack-registry.v1",
        nodeRewardPack: {
          status: nodeRewardPublication.status,
          revision: nodeRewardPublication.revision,
          updatedAt: nodeRewardPublication.updatedAt,
          updatedBy: nodeRewardPublication.updatedBy,
          pack: structuredClone(nodeRewardPublication.pack),
        },
      }),
    });
  });

  await context.route("**/api/classroom-event-programs/v1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "classroom-event-program-registry.v1",
        classroomEventProgram: {
          status: "default",
          revision: null,
          updatedAt: null,
          updatedBy: null,
          pack: structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM),
        },
      }),
    });
  });

  return adminWrites;
}

async function waitForEditor(page) {
  await expect(page.locator("html"))
    .toHaveAttribute("data-classroom-event-program-ready", "true");
  await expect(page.locator(".runtime-shell"))
    .toHaveAttribute("data-layout-editor-active", "true");
  await expect(page.locator("#layout-editor-panel")).toBeVisible();
  await expect(page.locator("#layout-editor-codex-tab")).toBeVisible();
}

async function chooseOneCharacterAndStart(page) {
  await page.locator("#setup-player-count").selectOption("1");
  const character = page.locator(
    ".character-option:not(:disabled):not([aria-pressed='true'])",
  ).first();
  await expect(character).toBeEnabled();
  await character.click();
  await expect(page.locator("#character-selection-progress"))
    .toContainText("1/1 已选好");
  await expect(page.locator("#start-session")).toBeEnabled();
  await page.locator("#start-session").click();
  await expect(page.locator("#setup-stage")).toBeHidden();
  await expect(page.locator("#asr-toggle")).toBeVisible();
}

async function currentSession(page) {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, SESSION_STORAGE_KEY);
}

function stableSessionState(snapshot) {
  return {
    gameSession: {
      activeSeatIndex: snapshot.gameSession.activeSeatIndex,
      completedTurns: snapshot.gameSession.completedTurns,
      inputGate: snapshot.gameSession.inputGate,
      phase: snapshot.gameSession.phase,
      stateVersion: snapshot.gameSession.stateVersion,
      turnSequence: snapshot.gameSession.turnSequence,
    },
    runtime: {
      acceptedCount: snapshot.runtime.acceptedCount,
      lastDie: snapshot.runtime.lastDie,
      taskIndex: snapshot.runtime.taskIndex,
      teams: snapshot.runtime.teams.map(({ id, nodeId, coins }) => ({
        id,
        nodeId,
        coins,
      })),
    },
  };
}

async function openCodexExchange(page) {
  await page.locator("#layout-editor-codex-tab").click();
  await expect(page.locator("#layout-editor-codex-section")).toBeVisible();
  await page.locator("#codex-node-exchange-generate").click();
  const output = page.locator("#codex-node-exchange-output");
  await expect(output).not.toHaveValue("");
  return JSON.parse(await output.inputValue());
}

async function setExchangeInput(page, value) {
  const input = page.locator("#codex-node-exchange-input");
  await input.evaluate((element, json) => {
    element.value = json;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, `${JSON.stringify(value, null, 2)}\n`);
  await expect(page.locator("#codex-node-exchange-preview")).toBeEnabled();
}

async function authoringStorage(page) {
  return page.evaluate((keys) => Object.fromEntries(keys.map((key) => [
    key,
    window.localStorage.getItem(key),
  ])), [
    WORLD_ONE_DRAFT_KEY,
    WORLD_TWO_DRAFT_KEY,
    DICE_PACK_DRAFT_KEY,
    NODE_REWARD_PACK_DRAFT_KEY,
    CLASSROOM_EVENT_PROGRAM_DRAFT_KEY,
    SESSION_STORAGE_KEY,
  ]);
}

test.afterEach(async ({ context }) => {
  for (const page of context.pages()) {
    if (page.isClosed()) continue;
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", {
        persisted: false,
      }));
    }).catch(() => undefined);
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
  }
});

test("an active one-player game keeps a prominent editor entry that opens a new tab without interrupting the session", async ({
  context,
  page,
}) => {
  const adminWrites = await mockAuthoringApis(context);
  await page.goto(GAME_PATH);
  await chooseOneCharacterAndStart(page);

  const entry = page.locator("#game-authoring-open");
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAttribute("target", "_blank");
  await expect(entry).toHaveAttribute("rel", "noopener");
  await expect(entry).toContainText("编辑地图");

  const before = stableSessionState(await currentSession(page));
  const originalUrl = page.url();
  const editorPagePromise = context.waitForEvent("page");
  await entry.click();
  const editorPage = await editorPagePromise;
  await editorPage.waitForLoadState("domcontentloaded");
  await waitForEditor(editorPage);

  const editorUrl = new URL(editorPage.url());
  expect(editorUrl.searchParams.get("layoutEditor")).toBe("1");
  await expect(editorPage.locator("#layout-editor-panel")).toBeVisible();

  expect(page.url()).toBe(originalUrl);
  await expect(page.locator("#setup-stage")).toBeHidden();
  await expect(page.locator("#asr-toggle")).toBeVisible();
  await expect(entry).toBeVisible();
  expect(stableSessionState(await currentSession(page))).toEqual(before);
  expect(adminWrites).toEqual([]);
});

test("a complete Codex JSON changes placement, reward, and one classroom event only as unpublished drafts", async ({
  context,
  page,
}) => {
  const adminWrites = await mockAuthoringApis(context);
  await page.goto(EDITOR_PATH);
  await waitForEditor(page);
  const candidate = await openCodexExchange(page);
  const target = candidate.nodes[WORLD_ONE_REF].n02;
  const learningRef = Object.keys(target.classroomEvents)[0];
  const eventRef = Object.keys(
    candidate.resourcePools.classroomEvents.learningPacks[learningRef].events,
  )[0];
  const nextX = target.placement.x + 1;

  target.placement.x = nextX;
  target.reward.type = "coin";
  target.reward.amount = 2;
  target.classroomEvents[learningRef].mode = "event";
  target.classroomEvents[learningRef].eventRef = eventRef;

  await setExchangeInput(page, candidate);
  await page.locator("#codex-node-exchange-preview").click();
  await expect(page.locator("#codex-node-exchange-status"))
    .toHaveAttribute("data-state", "success");
  await expect(page.locator("#codex-node-exchange-diff-summary"))
    .toHaveText("1 个节点 · 5 个字段");
  await expect(page.locator("#codex-node-exchange-diff-list li"))
    .toHaveCount(3);
  await expect(page.locator("#codex-node-exchange-apply")).toBeEnabled();
  expect(adminWrites).toEqual([]);

  await page.locator("#codex-node-exchange-apply").click();
  await expect(page.locator("#codex-node-exchange-diff-summary"))
    .toHaveText("已应用 5 个字段 · 尚未发布");
  await expect(page.locator("#codex-node-exchange-status"))
    .toContainText("尚未进入正式游戏");
  await expect(page.locator("#codex-node-exchange-apply")).toBeDisabled();
  expect(adminWrites).toEqual([]);

  const stored = await authoringStorage(page);
  const worldOneEnvelope = JSON.parse(stored[WORLD_ONE_DRAFT_KEY]);
  const worldTwoEnvelope = JSON.parse(stored[WORLD_TWO_DRAFT_KEY]);
  const rewardEnvelope = JSON.parse(stored[NODE_REWARD_PACK_DRAFT_KEY]);
  const eventEnvelope = JSON.parse(stored[CLASSROOM_EVENT_PROGRAM_DRAFT_KEY]);
  const worldOneDraft = worldOneEnvelope.draft;
  const worldTwoDraft = worldTwoEnvelope.draft;
  const rewardDraft = rewardEnvelope.draft;
  const eventDraft = eventEnvelope.draft;
  for (const envelope of [
    worldOneEnvelope,
    worldTwoEnvelope,
    rewardEnvelope,
    eventEnvelope,
  ]) {
    expect(envelope.schemaVersion)
      .toBe("voice-board-authoring-draft-envelope.v1");
  }
  expect(worldOneDraft.nodePositions.n02.x).toBe(nextX);
  expect(worldTwoDraft).toEqual(expect.objectContaining({
    schemaVersion: "board-layout-draft.v1",
    worldRef: WORLD_TWO_REF,
  }));
  expect(rewardDraft.worlds[WORLD_ONE_REF].nodes.n02).toEqual({
    type: "coin",
    amount: 2,
  });
  expect(
    eventDraft.learningPacks[learningRef]
      .worlds[WORLD_ONE_REF].assignments.n02,
  ).toEqual({ mode: "event", eventRef });
  expect(stored[DICE_PACK_DRAFT_KEY]).toBeNull();
  expect(stored[SESSION_STORAGE_KEY]).toBeNull();

  await page.locator("#layout-editor-node-tab").click();
  await expect(page.locator("#layout-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");
  await expect(page.locator("#layout-editor-save-state"))
    .toContainText("请点击保存并应用");

  await page.locator("#layout-editor-reward-tab").click();
  await expect(page.locator("#node-reward-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");
  await expect(page.locator("#node-reward-editor-save-state"))
    .toContainText("未发布");

  await page.locator("#layout-editor-event-tab").click();
  await expect(page.locator("#classroom-event-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");
  await expect(page.locator("#classroom-event-editor-save-state"))
    .toContainText("未发布");
  expect(adminWrites).toEqual([]);
});

test("readonly node context tampering is rejected without changing drafts or enabling apply", async ({
  context,
  page,
}) => {
  const adminWrites = await mockAuthoringApis(context);
  await page.goto(EDITOR_PATH);
  await waitForEditor(page);
  const beforeStorage = await authoringStorage(page);
  const candidate = await openCodexExchange(page);
  candidate.nodes[WORLD_ONE_REF].n02.context.zoneId = "zone-02";

  await setExchangeInput(page, candidate);
  await page.locator("#codex-node-exchange-preview").click();
  await expect(page.locator("#codex-node-exchange-status"))
    .toHaveAttribute("data-state", "error");
  await expect(page.locator("#codex-node-exchange-status"))
    .toContainText("context 属于只读契约");
  await expect(page.locator("#codex-node-exchange-apply")).toBeDisabled();
  await expect(page.locator("#codex-node-exchange-diff")).toBeHidden();
  expect(await authoringStorage(page)).toEqual(beforeStorage);
  expect(adminWrites).toEqual([]);
});

test("a stale NodeRewardPack draft is quarantined instead of being merged into a newer publication", async ({
  context,
  page,
}) => {
  const staleDraft = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    WORLD_ONE_REF,
    "n02",
    { type: "coin", amount: 3 },
  );
  const publishedPack = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    WORLD_ONE_REF,
    "n02",
    { type: "star", amount: 2 },
  );
  const staleRaw = JSON.stringify(createAuthoringDraftEnvelope(staleDraft, {
    sourceRevision: "r1",
    sourceValue: DEFAULT_NODE_REWARD_PACK,
  }));
  await context.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: NODE_REWARD_PACK_DRAFT_KEY, value: staleRaw });
  const adminWrites = await mockAuthoringApis(context, {
    nodeRewardPublication: {
      status: "active",
      revision: "r2",
      updatedAt: "2026-08-05T08:00:00.000Z",
      updatedBy: "e2e-node-authoring-owner",
      pack: publishedPack,
    },
  });

  await page.goto(EDITOR_PATH);
  await waitForEditor(page);
  await page.locator("#layout-editor-reward-tab").click();
  await expect(page.locator("#node-reward-editor-save-state"))
    .toContainText("已备份且未自动合并");
  await expect(page.locator("#node-reward-editor-save-state"))
    .toContainText("当前从最新发布版重新开始");
  await expect(page.locator("#node-reward-editor-save-bar"))
    .toHaveAttribute("data-save-state", "saved");

  const quarantined = await page.evaluate((storageKey) => {
    const currentRaw = window.localStorage.getItem(storageKey);
    const staleKeys = Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`${storageKey}:stale:`));
    return {
      currentRaw,
      staleKeys,
      staleValues: staleKeys.map((key) => window.localStorage.getItem(key)),
    };
  }, NODE_REWARD_PACK_DRAFT_KEY);
  expect(quarantined.staleKeys).toHaveLength(1);
  expect(quarantined.staleValues).toEqual([staleRaw]);
  const safeEnvelope = JSON.parse(quarantined.currentRaw);
  expect(safeEnvelope).toEqual({
    schemaVersion: "voice-board-authoring-draft-envelope.v1",
    sourceRevision: "r2",
    sourceFingerprint: authoringDraftFingerprint(publishedPack),
    draft: publishedPack,
  });

  await page.locator("#node-reward-editor-node").selectOption("n02");
  await expect(page.locator("#node-reward-editor-reward"))
    .toHaveValue("star");
  await expect(page.locator("#node-reward-editor-amount")).toHaveValue("2");
  await expect(page.locator("#node-reward-editor-reward")).toBeEnabled();
  await page.locator("#node-reward-editor-reward").selectOption("coin");
  await expect(page.locator("#node-reward-editor-save-bar"))
    .toHaveAttribute("data-save-state", "dirty");
  const continuedEnvelope = await page.evaluate((storageKey) => (
    JSON.parse(window.localStorage.getItem(storageKey))
  ), NODE_REWARD_PACK_DRAFT_KEY);
  expect(continuedEnvelope.sourceRevision).toBe("r2");
  expect(continuedEnvelope.sourceFingerprint)
    .toBe(authoringDraftFingerprint(publishedPack));
  expect(continuedEnvelope.draft.worlds[WORLD_ONE_REF].nodes.n02.type)
    .toBe("coin");
  expect(adminWrites).toEqual([]);
});

test("current-node and current-world modification focus reject out-of-scope JSON changes", async ({
  context,
  page,
}) => {
  const adminWrites = await mockAuthoringApis(context);
  await page.goto(EDITOR_PATH);
  await waitForEditor(page);

  await page.locator("#layout-editor-node").selectOption("n02");
  await page.locator("#layout-editor-codex-tab").click();
  await page.locator("#codex-node-exchange-scope").selectOption("current-node");
  await page.locator("#codex-node-exchange-generate").click();
  const nodeCandidate = JSON.parse(
    await page.locator("#codex-node-exchange-output").inputValue(),
  );
  nodeCandidate.nodes[WORLD_ONE_REF].n03.placement.x += 1;
  const beforeNodePreview = await authoringStorage(page);
  await setExchangeInput(page, nodeCandidate);
  await page.locator("#codex-node-exchange-preview").click();
  await expect(page.locator("#codex-node-exchange-status"))
    .toHaveAttribute("data-state", "error");
  await expect(page.locator("#codex-node-exchange-status"))
    .toContainText("超出当前节点修改焦点");
  await expect(page.locator("#codex-node-exchange-apply")).toBeDisabled();
  expect(await authoringStorage(page)).toEqual(beforeNodePreview);

  await page.locator("#codex-node-exchange-scope").selectOption("current-world");
  await expect(page.locator("#codex-node-exchange-output")).toHaveValue("");
  await expect(page.locator("#codex-node-exchange-copy")).toBeDisabled();
  await expect(page.locator("#codex-node-exchange-diff")).toBeHidden();
  await expect(page.locator("#codex-node-exchange-status"))
    .toContainText("此前生成内容已失效，请重新生成交换 JSON");
  await page.locator("#codex-node-exchange-generate").click();
  const worldCandidate = JSON.parse(
    await page.locator("#codex-node-exchange-output").inputValue(),
  );
  worldCandidate.nodes[WORLD_TWO_REF].w2n02.placement.x += 1;
  const beforeWorldPreview = await authoringStorage(page);
  await setExchangeInput(page, worldCandidate);
  await page.locator("#codex-node-exchange-preview").click();
  await expect(page.locator("#codex-node-exchange-status"))
    .toHaveAttribute("data-state", "error");
  await expect(page.locator("#codex-node-exchange-status"))
    .toContainText("超出当前世界修改焦点");
  await expect(page.locator("#codex-node-exchange-apply")).toBeDisabled();
  expect(await authoringStorage(page)).toEqual(beforeWorldPreview);
  expect(adminWrites).toEqual([]);
});
