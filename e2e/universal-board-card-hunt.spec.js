import path from "node:path";
import { writeFile } from "node:fs/promises";

import { expect, test } from "playwright/test";

const SNAPSHOT_KEY = "tim.voice-board.local-session.v1";
const GAME_PATH = "/prototypes/universal-board/?qa=1&qaFast=1&qaHarness=1";
const GAME_FULL_MOTION_PATH = "/prototypes/universal-board/?qa=1&qaHarness=1";
const GAME_NORMAL_PATH = "/prototypes/universal-board/";
const GAME_QA_WITHOUT_HARNESS_PATH = "/prototypes/universal-board/?qa=1";
const PLAYER_NAMES = ["Mia", "Leo", "Ava", "Tom"];
const LOCAL_SESSION_SCHEMA_VERSION = 11;
const EMPTY_HARBOR_MAP_STATE = {
  schemaVersion: "harbor-map-state.v1",
  anchorGrantedBySeat: {},
  anchorHeldBySeat: {},
  cloudReefCleared: false,
  cloudRouteOpen: false,
  departureBeaconLit: false,
  regionExitSeenBySeat: {},
  foghornTriggered: false,
  foghornHoldThroughTurn: 0,
  processedSettlementIds: [],
};

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  // Trigger the application's idempotent teardown before Chromium begins page
  // disposal. This keeps Web Audio from extending headless fixture teardown.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", {
      persisted: false,
    }));
  }).catch(() => undefined);
  await page.close({ runBeforeUnload: false });
});

function parseSnapshot() {
  const stored = window.localStorage.getItem("tim.voice-board.local-session.v1");
  return stored ? JSON.parse(stored) : null;
}

async function savedSession(page) {
  return page.evaluate(parseSnapshot);
}

async function waitForSavedSession(page, predicateSource, argument) {
  await page.waitForFunction(
    ({ storageKey, predicate, value }) => {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return false;
      const snapshot = JSON.parse(stored);
      return Function("snapshot", "value", `return (${predicate})(snapshot, value);`)(
        snapshot,
        value,
      );
    },
    {
      storageKey: SNAPSHOT_KEY,
      predicate: predicateSource,
      value: argument,
    },
  );
}

async function startInsertedElementObservation(page, key, selector) {
  await page.evaluate(({ observationKey, targetSelector }) => {
    window.__universalBoardE2eObservations ||= {};
    window.__universalBoardE2eObservations[observationKey]?.observer?.disconnect();
    const observation = {
      seen: false,
      matches: [],
      observer: null,
    };
    const remember = (element) => {
      if (!(element instanceof Element) || observation.matches.length >= 12) return;
      const dataset = { ...element.dataset };
      const tokenPoint = {
        x: Number.parseFloat(element.style.left),
        y: Number.parseFloat(element.style.top),
      };
      let sourceElement = null;
      if (dataset.originId === "answer-score") {
        sourceElement = document.querySelector(
          "#mission-score-result [data-reward-source='answer']",
        );
      } else if (dataset.originId === "dice-face") {
        sourceElement = document.querySelector(
          ".reward-source-echo[data-reward-origin-id='dice-face']",
        );
      } else if (dataset.originId?.startsWith("n")) {
        sourceElement = [...document.querySelectorAll(".board-space")]
          .find((candidate) => candidate.dataset.nodeId === dataset.originId);
      }
      const targetElement = dataset.targetPlayerId && dataset.collectionResource
        ? [...document.querySelectorAll(".team-hud[data-player-id]")]
          .find((candidate) => candidate.dataset.playerId === dataset.targetPlayerId)
          ?.querySelector(
            `[data-player-asset="${dataset.collectionResource}"]`,
          )
        : null;
      const center = (candidate) => {
        const rect = candidate?.getBoundingClientRect?.();
        return rect
          ? { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) }
          : null;
      };
      observation.seen = true;
      observation.matches.push({
        className: element.getAttribute("class") || "",
        text: element.textContent?.trim() || "",
        dataset,
        tokenPoint,
        sourcePoint: center(sourceElement),
        targetPoint: center(targetElement),
      });
    };
    const inspect = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(targetSelector)) remember(node);
      node.querySelectorAll(targetSelector).forEach(remember);
    };
    document.querySelectorAll(targetSelector).forEach(remember);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach(inspect);
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    observation.observer = observer;
    window.__universalBoardE2eObservations[observationKey] = observation;
  }, {
    observationKey: key,
    targetSelector: selector,
  });
}

async function finishInsertedElementObservation(page, key) {
  await page.waitForFunction((observationKey) => (
    window.__universalBoardE2eObservations?.[observationKey]?.seen === true
  ), key);
  return page.evaluate((observationKey) => {
    const observation = window.__universalBoardE2eObservations?.[observationKey];
    observation?.observer?.disconnect();
    return {
      seen: observation?.seen === true,
      matches: observation?.matches || [],
    };
  }, key);
}

async function stopInsertedElementObservation(page, key) {
  return page.evaluate((observationKey) => {
    const observation = window.__universalBoardE2eObservations?.[observationKey];
    observation?.observer?.disconnect();
    return {
      seen: observation?.seen === true,
      matches: observation?.matches || [],
    };
  }, key);
}

async function startFullMotionObservation(page, key) {
  await page.evaluate((observationKey) => {
    window.__universalBoardMotionObservations ||= {};
    const previous = window.__universalBoardMotionObservations[observationKey];
    previous?.phaseObserver?.disconnect();
    previous?.stepObserver?.disconnect();

    const startedAt = performance.now();
    const timeline = {
      startedAt,
      prefersReducedMotion: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches,
      dicePhases: [],
      steps: [],
      phaseObserver: null,
      stepObserver: null,
    };
    const elapsed = () => Math.round(performance.now() - startedAt);
    const diceCard = document.querySelector("#dice-roll-card");
    const rememberPhase = () => {
      const phase = diceCard?.dataset.phase || "";
      const last = timeline.dicePhases.at(-1);
      if (phase && last?.phase !== phase) {
        timeline.dicePhases.push({ phase, at: elapsed() });
      }
    };
    rememberPhase();
    const phaseObserver = new MutationObserver(rememberPhase);
    phaseObserver.observe(diceCard, {
      attributes: true,
      attributeFilter: ["data-phase"],
    });
    timeline.phaseObserver = phaseObserver;

    const trackedSteps = new WeakSet();
    const trackStep = (element) => {
      if (!(element instanceof Element) || trackedSteps.has(element)) return;
      trackedSteps.add(element);
      const entry = {
        insertedAt: elapsed(),
        removedAt: null,
        dataset: { ...element.dataset },
        duration: null,
        keyframes: [],
        samples: [],
      };
      timeline.steps.push(entry);
      const sample = () => {
        const animation = element.getAnimations().find((candidate) => (
          candidate.effect?.getKeyframes?.().some((frame) => frame.transform)
        ));
        if (animation && entry.duration === null) {
          entry.duration = Number(animation.effect.getTiming().duration);
          entry.keyframes = animation.effect.getKeyframes().map((frame) => ({
            offset: frame.offset,
            transform: frame.transform,
          }));
        }
        if (entry.samples.length < 48) {
          entry.samples.push({
            at: elapsed(),
            currentTime: Number(animation?.currentTime ?? 0),
            transform: getComputedStyle(element).transform,
          });
        }
        if (!element.isConnected) {
          entry.removedAt = elapsed();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    const inspect = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(".step-pawn")) trackStep(node);
      node.querySelectorAll(".step-pawn").forEach(trackStep);
    };
    const stepObserver = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(inspect));
    });
    stepObserver.observe(document.documentElement, { childList: true, subtree: true });
    timeline.stepObserver = stepObserver;
    window.__universalBoardMotionObservations[observationKey] = timeline;
  }, key);
}

async function finishFullMotionObservation(page, key) {
  await page.waitForFunction((observationKey) => {
    const timeline = window.__universalBoardMotionObservations?.[observationKey];
    return (
      timeline?.dicePhases.some(({ phase }) => phase === "settle")
      && timeline?.steps.some(({ removedAt }) => Number.isFinite(removedAt))
    );
  }, key);
  return page.evaluate((observationKey) => {
    const timeline = window.__universalBoardMotionObservations?.[observationKey];
    timeline?.phaseObserver?.disconnect();
    timeline?.stepObserver?.disconnect();
    return {
      prefersReducedMotion: timeline?.prefersReducedMotion,
      dicePhases: timeline?.dicePhases || [],
      steps: timeline?.steps || [],
    };
  }, key);
}

function stableTurnFingerprint(snapshot) {
  return {
    completedTurns: snapshot.gameSession.completedTurns,
    phase: snapshot.gameSession.phase,
    inputGate: snapshot.gameSession.inputGate,
    activeSeatIndex: snapshot.gameSession.activeSeatIndex,
    turnSequence: snapshot.gameSession.turnSequence,
    stateVersion: snapshot.gameSession.stateVersion,
    sessionAttemptIds: snapshot.gameSession.processedAttemptIds,
    taskIndex: snapshot.runtime.taskIndex,
    acceptedCount: snapshot.runtime.acceptedCount,
    lastDie: snapshot.runtime.lastDie,
    runtimeAttemptIds: snapshot.runtime.processedAttemptIds,
    teamNodes: snapshot.runtime.teams.map((team) => team.nodeId),
    teamCoins: snapshot.runtime.teams.map((team) => team.coins),
    playerAssetsLedger: snapshot.playerAssetsLedger,
    fairy: snapshot.fairyState,
    lastDicePresentation: snapshot.lastDicePresentation,
    attemptSequence: snapshot.attemptSequence,
  };
}

async function disableBoardSoundsForHeadlessRun(page) {
  const toggle = page.locator("#board-sound-toggle");
  if (await toggle.getAttribute("aria-pressed") === "true") {
    await toggle.evaluate((element) => element.click());
  }
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
}

async function chooseUniqueCharacters(page, count) {
  for (let index = 0; index < count; index += 1) {
    const option = page.locator(
      ".character-option:not(:disabled):not([aria-pressed='true'])",
    ).first();
    await expect(option).toBeEnabled();
    await option.click();
  }
  await expect(page.locator("#character-selection-progress"))
    .toContainText(`${count}/${count} 已选好`);
  await expect(page.locator("#start-session")).toBeEnabled();
}

async function waitForTurnReady(page, expectedName) {
  await page.waitForFunction(() => (
    document.documentElement.dataset.qaHarnessReady === "true"
  ));
  await expect(page.locator("#speaker-name")).toHaveText(expectedName);
  await expect(page.locator("#showtime-name")).toHaveText(expectedName);
  await expect(page.locator("#asr-toggle")).toBeVisible();
  await expect(page.locator("#asr-toggle")).toBeEnabled();
}

async function submitQaAssessment(
  page,
  {
    score = 92,
    primaryAccepted = true,
    knowledgeStatus = "ok",
  } = {},
) {
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent("voice-board:qa-assessment", {
      detail: {
        kind: "score",
        ...detail,
      },
    }));
  }, {
    score,
    primaryAccepted,
    knowledgeStatus,
  });
}

async function submitQaTeacherReview(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("voice-board:qa-assessment", {
      detail: {
        kind: "teacher_review",
      },
    }));
  });
}

function observeNextFeedback(page, expectedScore = null) {
  return page.evaluate((score) => new Promise((resolve) => {
    const feedback = document.querySelector("#turn-feedback");
    const capture = () => {
      const scoreText = document.querySelector("#feedback-score")?.textContent?.trim() || "";
      if (
        feedback?.hidden === false
        && feedback.dataset.visibility === "open"
        && (score === null || scoreText === score)
      ) {
        observer.disconnect();
        resolve({
          state: feedback.dataset.state,
          phase: feedback.dataset.phase,
          visibility: feedback.dataset.visibility,
          score: scoreText,
          title: document.querySelector("#feedback-title")?.textContent?.trim() || "",
          dice: document.querySelector("#feedback-dice")?.textContent?.trim() || "",
        });
      }
    };
    const observer = new MutationObserver(capture);
    observer.observe(feedback, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    capture();
  }), expectedScore);
}

function observeSelectedDiceHold(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const card = document.querySelector("#dice-roll-card");
    let captureStarted = false;
    const capture = () => {
      if (captureStarted || card?.dataset.phase !== "selected") return;
      const viewport = card.querySelector(".physical-die-viewport");
      const rotor = viewport?.querySelector(".physical-die-idle-rotor");
      const cube = rotor?.querySelector(".physical-die-cube");
      if (!viewport || !rotor || !cube) return;

      captureStarted = true;
      observer.disconnect();
      const readMotion = () => ({
        transform: getComputedStyle(rotor).transform,
        cubeIsRolling: cube.classList.contains("is-rolling"),
        cubeAnimationCount: cube.getAnimations().length,
      });
      const selected = {
        phase: card.dataset.phase,
        reusedCandidate: card.dataset.reusedCandidate,
        diceOptionId: card.dataset.diceOptionId,
        scoreTone: card.dataset.scoreTone,
        instanceId: viewport.dataset.diceInstanceId,
        rotorMotionState: rotor.dataset.motionState,
        start: readMotion(),
      };
      window.setTimeout(() => {
        resolve({
          ...selected,
          end: readMotion(),
          endPhase: card.dataset.phase,
        });
      }, 100);
    };
    const observer = new MutationObserver(capture);
    observer.observe(card, {
      attributes: true,
      attributeFilter: ["data-phase"],
      childList: true,
      subtree: true,
    });
    capture();
  }));
}

async function completeActivityIfPresent(page) {
  const activity = page.locator("#activity-stage");
  if (await activity.isVisible()) {
    await expect(page.locator("#turn-feedback")).toBeHidden();
    await expect(activity).toContainText("CLASS CHALLENGE");
    await expect(page.locator("#activity-first-action")).not.toHaveText("");
    expect(await page.locator("#activity-steps .activity-step").count())
      .toBeGreaterThanOrEqual(3);
    await expect(page.locator("#activity-outcome")).toContainText("返回棋盘");
    await page.locator("#complete-activity").click();
    await expect(activity).toBeHidden();
    return true;
  }
  return false;
}

async function waitForRouteChoiceOrCommittedTurn(page, turnNumber) {
  const gate = await page.waitForFunction(
    ({ storageKey, turn }) => {
      const routeStage = document.querySelector("#route-choice-stage");
      if (routeStage && routeStage.hidden === false) return "route";
      const mooringStage = document.querySelector("#mooring-choice-stage");
      if (mooringStage && mooringStage.hidden === false) return "mooring";
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return false;
      const snapshot = JSON.parse(stored);
      return snapshot.gameSession.completedTurns === turn ? "committed" : false;
    },
    { storageKey: SNAPSHOT_KEY, turn: turnNumber },
  );
  return gate.jsonValue();
}

async function inspectAndChooseRoute(page, preferredEdgeId = null) {
  const routeStage = page.locator("#route-choice-stage");
  const options = page.locator("#route-options .route-option");
  await expect(routeStage).toBeVisible();
  await expect(page.locator("#turn-feedback")).toBeHidden();
  await expect(options).toHaveCount(2);
  const presentations = await options.evaluateAll((routeOptions) => (
    routeOptions.map((option) => ({
      edgeId: option.dataset.edgeId,
      tone: option.dataset.tone,
      previewKinds: [...option.querySelectorAll(".route-preview-icons [data-kind]")]
        .map((preview) => preview.dataset.kind),
    }))
  ));
  expect(new Set(presentations.map(({ edgeId }) => edgeId)).size).toBe(2);
  expect(presentations.every(({ edgeId }) => /^(?:w2)?e\d{2}[ab]$/.test(edgeId)))
    .toBe(true);
  expect(presentations.every(({ previewKinds }) => previewKinds.length >= 1)).toBe(true);

  const selected = preferredEdgeId
    ? page.locator(`.route-option[data-edge-id="${preferredEdgeId}"]`)
    : options.first();
  if (preferredEdgeId && await selected.count() === 0) {
    throw new Error(`expected route edge ${preferredEdgeId} was not offered`);
  }
  const selectedEdgeId = await selected.getAttribute("data-edge-id");
  await selected.click();
  await expect(routeStage).toBeHidden();
  return {
    selectedEdgeId,
    options: presentations,
  };
}

async function playHighScoreTurn(page, turnNumber) {
  const expectedName = PLAYER_NAMES[(turnNumber - 1) % PLAYER_NAMES.length];
  await waitForTurnReady(page, expectedName);

  const feedbackUpdate = observeNextFeedback(page, "92");
  await submitQaAssessment(page);
  const observedFeedback = await feedbackUpdate;
  expect(observedFeedback).toEqual(expect.objectContaining({
    visibility: "open",
    score: "92",
    dice: "传奇骰二选一",
  }));
  const feedback = page.locator("#turn-feedback");
  await expect(page.locator("#feedback-score")).toHaveText("92");
  await expect(page.locator("#feedback-dice")).toHaveText("传奇骰二选一");

  const diceStage = page.locator("#dice-choice-stage");
  await expect(diceStage).toBeVisible();
  await expect(feedback).toBeHidden();
  const stepObservationKey = `turn-${turnNumber}-step-pawn`;
  await startInsertedElementObservation(page, stepObservationKey, ".step-pawn");
  const diceOptions = page.locator("#dice-options .dice-option");
  await expect(diceOptions).toHaveCount(2);
  const optionIds = await diceOptions.evaluateAll((options) => (
    options.map((option) => option.dataset.diceOptionId)
  ));
  expect(new Set(optionIds).size).toBe(2);

  const treasureOption = page.locator(
    "#dice-options .dice-option[data-dice-option-id='treasure']",
  );
  if (turnNumber === 1 && await treasureOption.count()) {
    await treasureOption.click();
  } else {
    await diceOptions.first().click();
  }
  const rollPresentation = await page.waitForFunction(() => {
    const stage = document.querySelector("#dice-roll-stage");
    const cubeFaceCount = document.querySelectorAll(
      "#dice-roll-cube-slot .physical-die-face",
    ).length;
    const referenceFaceCount = document.querySelectorAll(
      "#dice-roll-faces .dice-face-tile",
    ).length;
    if (stage?.hidden || cubeFaceCount !== 6 || referenceFaceCount !== 6) return false;
    return {
      cubeFaceCount,
      referenceFaceCount,
      name: document.querySelector("#dice-roll-name")?.textContent || "",
      copy: stage.textContent || "",
    };
  }).then((handle) => handle.jsonValue());
  expect(rollPresentation.cubeFaceCount).toBe(6);
  expect(rollPresentation.referenceFaceCount).toBe(6);
  if (turnNumber === 1) {
    expect(rollPresentation.name).toBe("寻宝骰");
    expect(rollPresentation.copy).toContain("两枚金币");
    expect(rollPresentation.copy).toContain("卡卡精灵");
  }

  let gate = await waitForRouteChoiceOrCommittedTurn(page, turnNumber);
  const routeChoice = gate === "route"
    ? await inspectAndChooseRoute(page)
    : null;
  if (gate === "route") {
    gate = await waitForRouteChoiceOrCommittedTurn(page, turnNumber);
  }
  const mooringDecision = gate === "mooring" ? "retained" : null;
  if (mooringDecision) {
    await expect(page.locator("#mooring-keep")).toBeFocused();
    await page.locator("#mooring-keep").click();
    await expect(page.locator("#mooring-choice-stage")).toBeHidden();
  }
  await waitForSavedSession(
    page,
    "(snapshot, turn) => snapshot.gameSession.completedTurns === turn"
      + " && ['open', 'closed'].includes(snapshot.gameSession.inputGate)",
    turnNumber,
  );
  await page.waitForFunction(() => (
    document.querySelector("#activity-stage")?.hidden === false
    || document.querySelector("#boss-stage")?.hidden === false
    || (
      document.querySelector("#asr-toggle")?.disabled === false
      && document.querySelector("#turn-showtime")?.hidden === true
    )
  ));
  const activityCompleted = await completeActivityIfPresent(page);
  const stepObservation = await finishInsertedElementObservation(
    page,
    stepObservationKey,
  );
  expect(stepObservation.matches.some(({ dataset }) => (
    dataset.teamId && dataset.targetNodeId && dataset.stepLabel
  ))).toBe(true);

  if (turnNumber < 12) {
    await waitForSavedSession(
      page,
      "(snapshot, turn) => snapshot.gameSession.completedTurns === turn"
        + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
        + " && snapshot.gameSession.inputGate === 'open'",
      turnNumber,
    );
  }
  return {
    state: await savedSession(page),
    optionIds,
    routeChoice,
    mooringDecision,
    activityCompleted,
    stepObservation,
  };
}

test("normal and ordinary QA entries cannot inject an assessment shortcut", async ({
  page,
}) => {
  const shortcutSelector = '[id^="simulate-"], [id^="preview-"]';

  await page.goto(GAME_NORMAL_PATH);
  await expect(page.locator(shortcutSelector)).toHaveCount(0);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("voice-board:qa-assessment", {
      detail: {
        kind: "score",
        score: 92,
      },
    }));
  });
  if (await page.locator("#setup-player-count").count() === 0) {
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
    await expect(page.locator("#dice-choice-stage, #dice-roll-stage")).toHaveCount(0);
  }

  await page.goto(GAME_QA_WITHOUT_HARNESS_PATH);
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, SNAPSHOT_KEY);
  await page.reload();
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await expect(page.locator("#asr-toggle")).toBeVisible();
  await expect(page.locator(shortcutSelector)).toHaveCount(0);
  await expect(page.locator("#dice-choice-stage")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute(
    "data-qa-harness-ready",
    "false",
  );

  const before = stableTurnFingerprint(await savedSession(page));
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("voice-board:qa-assessment", {
      detail: {
        kind: "score",
        score: 92,
      },
    }));
  });
  await page.waitForTimeout(250);

  await expect(page.locator("#dice-choice-stage")).toBeHidden();
  await expect(page.locator("#dice-roll-stage")).toBeHidden();
  expect(stableTurnFingerprint(await savedSession(page))).toEqual(before);
});

test("setup previews fair session lengths for every supported player count", async ({ page }) => {
  const expectations = [
    { players: "1", turns: 12, guaranteedCards: 3 },
    { players: "2", turns: 12, guaranteedCards: 3 },
    { players: "3", turns: 12, guaranteedCards: 3 },
    { players: "4", turns: 12, guaranteedCards: 3 },
    { players: "5", turns: 15, guaranteedCards: 3 },
    { players: "6", turns: 18, guaranteedCards: 4 },
    { players: "7", turns: 21, guaranteedCards: 5 },
    { players: "8", turns: 24, guaranteedCards: 6 },
  ];
  const actualConfigurations = [];

  for (const config of expectations) {
    await page.goto(GAME_PATH);
    const preview = page.locator("#setup-preview");
    const playerSelect = page.locator("#setup-player-count");
    await playerSelect.selectOption(config.players);
    await expect(preview).toContainText(`${config.players} 位孩子`);
    await expect(preview).toContainText(`共 ${config.turns} 个寻宝回合`);
    await expect(preview).toContainText(`保底带回 ${config.guaranteedCards} 张一星卡`);

    const playerCount = Number(config.players);
    await chooseUniqueCharacters(page, playerCount);
    await page.locator("#start-session").click();
    await waitForSavedSession(
      page,
      "(snapshot, count) => snapshot.gameSession.seats.length === count"
        + " && snapshot.runtime.teams.length === count",
      playerCount,
    );
    const snapshot = await savedSession(page);
    expect(snapshot.playerCount).toBe(playerCount);
    expect(snapshot.gameSession.seats).toHaveLength(playerCount);
    expect(snapshot.gameSession.teamOrder).toHaveLength(playerCount);
    expect(snapshot.runtime.teams).toHaveLength(playerCount);
    expect(snapshot.gameSession.minTotalTurns).toBe(config.turns);
    expect(snapshot.gameSession.completedTurns).toBe(0);
    expect(snapshot.gameSession.seats.every((seat) => (
      seat.opportunityCount === 0
      && seat.acceptedCount === 0
      && seat.status === "active"
    ))).toBe(true);
    expect(snapshot.runtime.teams.every((team) => (
      team.members.length === 1
      && team.nodeId === "n01"
      && team.coins === 0
      && team.speakerIndex === 0
    ))).toBe(true);
    const teamIds = snapshot.runtime.teams.map((team) => team.id);
    expect(new Set(teamIds).size).toBe(playerCount);
    expect(snapshot.gameSession.seats.map((seat) => seat.teamId)).toEqual(teamIds);
    expect(snapshot.gameSession.teamOrder.map((team) => team.id)).toEqual(teamIds);
    expect(snapshot.gameSession.seats.map((seat) => seat.displayName)).toEqual(
      snapshot.runtime.teams.map((team) => team.members[0]),
    );
    actualConfigurations.push({
      playerCount,
      seatCount: snapshot.gameSession.seats.length,
      teamCount: snapshot.runtime.teams.length,
      minOpportunitiesPerSeat: snapshot.gameSession.minOpportunitiesPerSeat,
      minTotalTurns: snapshot.gameSession.minTotalTurns,
      teamMemberCounts: snapshot.runtime.teams.map((team) => team.members.length),
      initialNodes: snapshot.runtime.teams.map((team) => team.nodeId),
    });
    await expect(page.locator("[data-entity-kind='player-summary']"))
      .toHaveCount(playerCount);
    await expect(page.locator("[data-entity-kind='team-summary']")).toHaveCount(0);
  }
  await writeFile(
    path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/session-configurations.json",
    ),
    `${JSON.stringify(actualConfigurations, null, 2)}\n`,
  );
});

test("mobile character setup stays inside the viewport with a real two-column cast grid", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(GAME_PATH);
  await expect(page.locator(
    ".character-option-avatar[data-character-variant='selection'][data-art-state='ready']",
  )).toHaveCount(8);

  const geometry = await page.evaluate(() => {
    const setupCard = document.querySelector(".setup-card").getBoundingClientRect();
    const selection = document.querySelector(".character-selection");
    const options = document.querySelector(".character-options");
    const tabs = document.querySelector(".player-character-tabs");
    return {
      documentWidth: document.documentElement.scrollWidth,
      setupLeft: setupCard.left,
      setupRight: setupCard.right,
      selectionClientWidth: selection.clientWidth,
      selectionScrollWidth: selection.scrollWidth,
      gridColumns: getComputedStyle(options).gridTemplateColumns
        .split(" ")
        .filter(Boolean)
        .length,
      optionWidths: [...options.children].map(
        (option) => option.getBoundingClientRect().width,
      ),
      tabsClientWidth: tabs.clientWidth,
      tabsScrollWidth: tabs.scrollWidth,
    };
  });

  expect(geometry.documentWidth).toBeLessThanOrEqual(375);
  expect(geometry.setupLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.setupRight).toBeLessThanOrEqual(375);
  expect(geometry.selectionScrollWidth).toBeLessThanOrEqual(
    geometry.selectionClientWidth,
  );
  expect(geometry.gridColumns).toBe(2);
  expect(geometry.optionWidths.every((width) => width >= 120)).toBe(true);
  expect(geometry.tabsScrollWidth).toBeGreaterThan(geometry.tabsClientWidth);
});

test("ordinary roads stay silent while eight complete character pawns keep one identity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("8");
  await chooseUniqueCharacters(page, 8);
  const selectionAvatars = page.locator(
    ".character-option-avatar[data-character-variant='selection'][data-art-state='ready']",
  );
  await expect(selectionAvatars).toHaveCount(8);
  const selectionIdentity = await selectionAvatars.evaluateAll((avatars) => (
    avatars.map((avatar) => ({
      characterId: avatar.dataset.characterId,
      assetRef: avatar.querySelector(".character-avatar-art")?.getAttribute("src"),
    }))
  ));
  expect(new Set(selectionIdentity.map(({ characterId }) => characterId)).size).toBe(8);
  expect(new Set(selectionIdentity.map(({ assetRef }) => assetRef)).size).toBe(8);
  expect(selectionIdentity.every(({ assetRef }) => (
    /^\/assets\/characters\/ximitu-friends\/v2\/selection\/[a-z0-9-]+-v2\.png$/u
      .test(assetRef)
  ))).toBe(true);
  await page.locator("#start-session").click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.seats.length === 8",
  );

  await expect(page.locator(".board-space.is-ordinary")).toHaveCount(30);
  await expect(page.locator(".board-space.is-special")).toHaveCount(31);
  const ordinarySpaces = page.locator(".board-space.is-ordinary");
  const ordinaryBadges = ordinarySpaces.locator(".node-effect-badge");
  await expect(ordinaryBadges).toHaveCount(30);
  expect(await ordinaryBadges.allTextContents()).toEqual(
    Array.from({ length: 30 }, () => "普通"),
  );
  expect(await ordinarySpaces.evaluateAll((spaces) => (
    spaces.every((space) => (
      space.dataset.outcomeKind === "ordinary"
      && space.dataset.outcomeTrigger === "none"
      && space.dataset.outcomeLabel === "无额外效果"
      && space.dataset.directReward === "false"
      && space.getAttribute("aria-label")?.includes("无额外效果")
    ))
  ))).toBe(true);
  await expect(
    page.locator(".pawn .pawn-character-visual[data-art-state='ready']"),
  ).toHaveCount(8);
  await expect(
    page.locator(".mini-pawn .pawn-character-visual[data-art-state='ready']"),
  ).toHaveCount(8);

  const identity = await page.evaluate(() => {
    const readPawn = (pawn) => ({
      characterId: pawn.dataset.characterId,
      artState: pawn.querySelector(".pawn-character-visual")?.dataset.artState,
      assetRef: pawn.querySelector(".pawn-character-art")?.getAttribute("href"),
      hasLegacyPinShell: [...pawn.querySelectorAll("path")]
        .some((path) => path.getAttribute("d")?.startsWith("M 0 -23 C 15 -23")),
    });
    return {
      board: [...document.querySelectorAll(".pawn")].map(readPawn),
      mini: [...document.querySelectorAll(".mini-pawn")].map(readPawn),
      activeBoardCount: document.querySelectorAll(".pawn.is-active").length,
      activeMiniCount: document.querySelectorAll(".mini-pawn.is-active").length,
    };
  });
  expect(identity.board.map(({ characterId }) => characterId).sort())
    .toEqual(identity.mini.map(({ characterId }) => characterId).sort());
  expect(new Set(identity.board.map(({ characterId }) => characterId)).size).toBe(8);
  expect(new Set(identity.board.map(({ assetRef }) => assetRef)).size).toBe(8);
  expect(identity.board.every(({ assetRef }) => (
    /^\/assets\/characters\/ximitu-friends\/v2\/pawns\/[a-z0-9-]+-v2\.png$/u
      .test(assetRef)
  ))).toBe(true);
  expect(identity.board.every(({ artState }) => artState === "ready")).toBe(true);
  expect(identity.board.every(({ hasLegacyPinShell }) => !hasLegacyPinShell)).toBe(true);
  expect(identity.activeBoardCount).toBe(1);
  expect(identity.activeMiniCount).toBe(1);

  await page.evaluate(({ storageKey, nodeIds }) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.runtime.teams = snapshot.runtime.teams.map((team, index) => ({
      ...team,
      nodeId: nodeIds[index],
    }));
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, {
    storageKey: SNAPSHOT_KEY,
    nodeIds: ["n01", "n02", "n03", "n05a", "n06a", "n05b", "n06b", "n08"],
  });
  await page.reload();
  await page.locator("#resume-session").click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.runtime.teams[7].nodeId === 'n08'",
  );
  await expect(
    page.locator(".pawn .pawn-character-visual[data-art-state='ready']"),
  ).toHaveCount(8);
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/ordinary-roads-eight-character-pawns-desktop.png",
    ),
    fullPage: true,
  });
});

test("board nodes expose truthful trigger and outcome semantics without turning empty fairy traces into rewards", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.fairyState = {
      status: "absent",
      anchorId: null,
      distance: null,
      targetTeamId: null,
      cardCase: null,
      moveCount: 0,
      spawnedRound: null,
      lastTransitionRound: null,
      capturedRound: null,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, SNAPSHOT_KEY);
  await page.reload();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");

  const allSpaceSemantics = await page.locator(".board-space").evaluateAll(
    (spaces) => spaces.map((space) => ({
      nodeId: space.dataset.nodeId,
      kind: space.dataset.outcomeKind,
      visualKind: space.dataset.treasureKind,
      trigger: space.dataset.outcomeTrigger,
      label: space.dataset.outcomeLabel,
      badge: space.dataset.outcomeBadge,
      directReward: space.dataset.directReward,
      ariaLabel: space.getAttribute("aria-label"),
    })),
  );
  expect(allSpaceSemantics).toHaveLength(61);
  expect(allSpaceSemantics.every(({ kind, trigger, label, badge, ariaLabel }) => (
    Boolean(kind && trigger && label && badge && ariaLabel)
  ))).toBe(true);

  const byNodeId = new Map(allSpaceSemantics.map((entry) => [entry.nodeId, entry]));
  expect(byNodeId.get("n03")).toEqual(expect.objectContaining({
    kind: "tool",
    visualKind: "mooring",
    trigger: "route-pass",
    label: "停靠锚×1",
    directReward: "true",
  }));
  expect(byNodeId.get("n03").badge).toContain("经过");
  expect(byNodeId.get("n03").ariaLabel).toContain("下个有效回合开始可用");

  expect(byNodeId.get("n08")).toEqual(expect.objectContaining({
    kind: "clue",
    visualKind: "anchor",
    trigger: "fairy-route-pass",
    label: "空点 · 无资源",
    directReward: "false",
  }));
  expect(byNodeId.get("n08").badge).toContain("空点·无资源");
  expect(byNodeId.get("n08").ariaLabel).toContain("经过或停下都不会获得资源");
  await expect(page.locator(".board-space[data-node-id='n08'] .node-effect-badge"))
    .toContainText("空点·无资源");

  expect(byNodeId.get("n18")).toEqual(expect.objectContaining({
    kind: "region-transition",
    visualKind: "transport",
    trigger: "next-edge-pass",
    label: "停在本格不触发",
    directReward: "false",
  }));
  expect(byNodeId.get("n18").badge).toBe("下一步·离港");
  expect(byNodeId.get("n18").ariaLabel).toContain("从本格继续走到下一格时");

  await page.setViewportSize({ width: 375, height: 812 });
  const mapNavigator = page.locator(".map-navigator");
  const boardLegend = page.locator(".board-legend");
  await expect(mapNavigator).not.toHaveAttribute("open", "");
  await expect(boardLegend).not.toHaveAttribute("open", "");
  const compactControlOverlap = await page.evaluate(() => {
    const rectangle = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    };
    const overlaps = (a, b) => (
      Math.min(a.right, b.right) > Math.max(a.left, b.left)
      && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)
    );
    const map = rectangle(".map-navigator");
    const legend = rectangle(".board-legend");
    const dice = rectangle("#dice-dock");
    return {
      mapLegend: overlaps(map, legend),
      legendDice: overlaps(legend, dice),
    };
  });
  expect(compactControlOverlap).toEqual({
    mapLegend: false,
    legendDice: false,
  });
  await boardLegend.locator("summary").click();
  await expect(boardLegend).toHaveAttribute("open", "");
  await expect(boardLegend).toContainText("当前地图没有扣资源");
  await mapNavigator.locator("summary").click();
  await expect(mapNavigator).toHaveAttribute("open", "");
  await expect(boardLegend).not.toHaveAttribute("open", "");
  await expect(page.locator("#map-zone-buttons button")).toHaveCount(4);
  const expandedMapOverlap = await page.evaluate(() => {
    const map = document.querySelector(".map-navigator").getBoundingClientRect();
    const legend = document.querySelector(".board-legend").getBoundingClientRect();
    return (
      Math.min(map.right, legend.right) > Math.max(map.left, legend.left)
      && Math.min(map.bottom, legend.bottom) > Math.max(map.top, legend.top)
    );
  });
  expect(expandedMapOverlap).toBe(false);
});

test("World 1 renders four aligned Cloud Harbor region backgrounds", async ({
  page,
}) => {
  const consoleProblems = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleProblems.push(`pageerror: ${error.message}`);
  });

  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  const regions = page.locator(".region-art[data-region-id]");
  await expect(regions).toHaveCount(4);
  await expect(page.locator(".region-art[data-art-state='ready']")).toHaveCount(4);
  const regionAssets = await regions.evaluateAll((groups) => (
    groups.map((group) => ({
      regionId: group.dataset.regionId,
      zoneId: group.dataset.zoneId,
      assetRef: group.querySelector(".region-art-image")?.getAttribute("href"),
    })).sort((left, right) => left.regionId.localeCompare(right.regionId))
  ));
  expect(regionAssets).toHaveLength(4);
  expect(regionAssets.map(({ regionId }) => regionId)).toEqual([
    "region-zone-01",
    "region-zone-02",
    "region-zone-03",
    "region-zone-04",
  ]);
  expect(regionAssets).toEqual([
    {
      regionId: "region-zone-01",
      zoneId: "zone-01",
      assetRef: "/assets/board-themes/cloud-harbor/regions/zone-01-v3.jpg",
    },
    {
      regionId: "region-zone-02",
      zoneId: "zone-02",
      assetRef: "/assets/board-themes/cloud-harbor/regions/zone-02-v3.jpg",
    },
    {
      regionId: "region-zone-03",
      zoneId: "zone-03",
      assetRef: "/assets/board-themes/cloud-harbor/regions/zone-03-v3.jpg",
    },
    {
      regionId: "region-zone-04",
      zoneId: "zone-04",
      assetRef: "/assets/board-themes/cloud-harbor/regions/zone-04-v3.jpg",
    },
  ]);
  expect(consoleProblems).toEqual([]);
});

test("one failed World 1 region keeps the other art, topology, route, and camera usable", async ({
  page,
}) => {
  let failedRegionRequests = 0;
  await page.route(
    /\/assets\/board-themes\/cloud-harbor\/regions\/zone-03-v3\.jpg(?:\?.*)?$/,
    async (route) => {
      failedRegionRequests += 1;
      await route.abort("failed");
    },
  );

  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  await expect(page.locator(".region-art[data-region-id]")).toHaveCount(4);
  await expect(page.locator(".region-art[data-art-state='ready']")).toHaveCount(3);
  const failedRegion = page.locator(
    ".region-art[data-region-id='region-zone-03']",
  );
  await expect(failedRegion).toHaveAttribute("data-art-state", "error");
  await expect(failedRegion).toHaveClass(/\bis-unavailable\b/);
  await expect(failedRegion.locator(".region-art-fallback")).toHaveCount(1);
  await expect(failedRegion.locator(".region-art-image")).not.toHaveAttribute(
    "href",
    /.+/,
  );
  expect(failedRegionRequests).toBeGreaterThanOrEqual(1);

  const readyRegionIds = await page.locator(
    ".region-art[data-art-state='ready']",
  ).evaluateAll((groups) => groups.map((group) => group.dataset.regionId).sort());
  expect(readyRegionIds).toEqual([
    "region-zone-01",
    "region-zone-02",
    "region-zone-04",
  ]);

  const spaces = page.locator(".board-space[data-node-id]");
  await expect(spaces).toHaveCount(61);
  const nodeIds = await spaces.evaluateAll((nodes) => (
    nodes.map((node) => node.dataset.nodeId)
  ));
  expect(new Set(nodeIds).size).toBe(61);

  const baseRoute = page.locator(".route-layer .route-line");
  await expect(baseRoute).toHaveCount(1);
  const baseRoutePath = await baseRoute.getAttribute("d");
  expect(baseRoutePath).toBeTruthy();
  expect(baseRoutePath.match(/\bM\s/g)).toHaveLength(64);
  for (const selector of [
    ".route-shadow",
    ".route-outline",
    ".route-highlight",
  ]) {
    await expect(page.locator(`.route-layer ${selector}`)).toHaveCount(1);
  }

  const cameraWindow = page.locator(".mini-camera-window");
  const boardWorld = page.locator(".board-world");
  await page.locator("#map-zone-buttons [data-zone-id='zone-04']").click();
  await expect(cameraWindow).toHaveAttribute("y", "500");
  await expect(boardWorld).toHaveAttribute("transform", "translate(0 -500)");

  const boardViewport = page.locator(".board-viewport");
  await boardViewport.focus();
  await expect(boardViewport).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(cameraWindow).toHaveAttribute("x", "110");
  await expect(boardWorld).toHaveAttribute("transform", "translate(-110 -500)");
  expect(await baseRoute.getAttribute("d")).toBe(baseRoutePath);
});

test("dragging the board pauses active glows and keeps responsive frame pacing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  const glowState = () => page.evaluate(() => {
    const pawnAura = document.querySelector(".pawn.is-active .pawn-turn-aura");
    const hudShell = document.querySelector(
      ".team-hud[data-turn-state='current'] .team-token-shell",
    );
    return {
      pawn: getComputedStyle(pawnAura).animationPlayState,
      hud: getComputedStyle(hudShell, "::before").animationPlayState,
    };
  });
  expect(await glowState()).toEqual({ pawn: "running", hud: "running" });

  const viewport = page.locator(".board-viewport");
  const box = await viewport.boundingBox();
  const startX = box.x + (box.width * 0.54);
  const startY = box.y + (box.height * 0.56);
  const initialTransform = await page.locator(".board-world").getAttribute("transform");
  await page.evaluate(() => {
    window.__universalBoardPanFrames = [];
    window.__universalBoardCollectPanFrames = true;
    const collect = (time) => {
      if (!window.__universalBoardCollectPanFrames) return;
      window.__universalBoardPanFrames.push(time);
      requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
  });
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(viewport).toHaveClass(/\bis-panning\b/);
  expect(await glowState()).toEqual({ pawn: "paused", hud: "paused" });

  for (let index = 1; index <= 42; index += 1) {
    await page.mouse.move(
      startX - (index * 5),
      startY - (Math.sin(index / 4) * 34),
    );
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  await expect(viewport).not.toHaveClass(/\bis-panning\b/);
  expect(await glowState()).toEqual({ pawn: "running", hud: "running" });
  await page.waitForTimeout(40);

  const framePacing = await page.evaluate(() => {
    window.__universalBoardCollectPanFrames = false;
    const frames = window.__universalBoardPanFrames || [];
    const intervals = frames.slice(1).map((time, index) => time - frames[index]);
    const sorted = [...intervals].sort((left, right) => left - right);
    const percentile = (ratio) => sorted[
      Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
    ] || 0;
    return {
      frameCount: frames.length,
      p95: percentile(0.95),
      max: sorted.at(-1) || 0,
    };
  });
  expect(framePacing.frameCount).toBeGreaterThanOrEqual(12);
  expect(framePacing.p95).toBeLessThan(40);
  expect(framePacing.max).toBeLessThan(80);
  await expect(page.locator(".board-world"))
    .not.toHaveAttribute("transform", initialTransform);
  await writeFile(
    path.resolve(
      process.cwd(),
      "output/verification/project12-board-pan-performance.json",
    ),
    `${JSON.stringify({
      viewport: { width: 1440, height: 1000 },
      pointerSamples: 42,
      glowPolicy: "running -> paused -> running",
      framePacing,
    }, null, 2)}\n`,
  );
});

test("the complete World 2 master renders four aligned regions, unique nodes, and distinct devices", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const consoleProblems = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleProblems.push(`pageerror: ${error.message}`);
  });

  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");
  const rawV7 = await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    const previousWorld = structuredClone(snapshot.runtime.world.active);
    previousWorld.worldPackRef = "world.ximitu.cloud-harbor@1.0.0";
    const transitionId = "qa-world-02-visual-transition";
    snapshot.schemaVersion = 7;
    snapshot.themeId = "beyond-cloud";
    snapshot.runtime = {
      ...snapshot.runtime,
      boardId: "ximitu-card-hunt-world-02.v1",
      themeId: "beyond-cloud",
      phase: "MISSION_PRESENT",
      currentActivity: null,
      mapState: { auroraBridgeOpen: false },
      teams: snapshot.runtime.teams.map((team) => ({
        ...team,
        nodeId: "w2n01",
      })),
      world: {
        ...snapshot.runtime.world,
        routeRef: "route.ximitu-main@1.0.0",
        active: {
          instanceId: `${snapshot.gameSession.sessionId}:world:2`,
          ordinal: 2,
          worldPackRef: "world.ximitu.beyond-cloud@1.0.0",
          mapState: { auroraBridgeOpen: false },
          levelState: {
            discoveredNodeIds: [],
            displayedDiscoveryIds: [],
            discoveredNodeIdsByPlayerId: {},
            discoveriesByPlayerId: {},
          },
        },
        completed: [{
          ...previousWorld,
          exitId: "forward",
          transitionId,
          archivedState: {
            mapState: structuredClone(previousWorld.mapState),
            levelState: structuredClone(previousWorld.levelState),
          },
        }],
        processedTransitionIds: [transitionId],
      },
    };
    snapshot.fairyState = {
      ...snapshot.fairyState,
      anchorId: "w2n08",
      distance: 6,
      targetTeamId: "player-1",
    };
    const serialized = JSON.stringify(snapshot);
    window.localStorage.setItem(storageKey, serialized);
    return serialized;
  }, SNAPSHOT_KEY);

  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");
  const migratedV7 = await savedSession(page);
  expect(migratedV7.schemaVersion).toBe(LOCAL_SESSION_SCHEMA_VERSION);
  expect(migratedV7.runtime.world.routeRef).toBe("route.ximitu-main@1.1.0");
  expect(migratedV7.runtime.world.completed[0].worldPackRef)
    .toBe("world.ximitu.cloud-harbor@1.1.0");
  expect(await page.evaluate(() => window.localStorage.getItem(
    "tim.voice-board.local-session.v1.v7-backup",
  ))).toBe(rawV7);
  await expect(page.locator("#turn-showtime")).toBeHidden();
  await expect(page.locator("#session-goal"))
    .toContainText("世界 2 · 云外秘境");

  await expect(page.locator(".region-art[data-art-state='ready']")).toHaveCount(4);
  const regionAssets = await page.locator(".region-art-image").evaluateAll((images) => (
    images.map((image) => image.getAttribute("href")).sort()
  ));
  expect(regionAssets).toEqual([
    "/assets/board-themes/beyond-cloud/regions/zone-05-v2.jpg",
    "/assets/board-themes/beyond-cloud/regions/zone-06-v2.jpg",
    "/assets/board-themes/beyond-cloud/regions/zone-07-v2.jpg",
    "/assets/board-themes/beyond-cloud/regions/zone-08-v2.jpg",
  ]);

  const spaces = page.locator(".board-space[data-node-id]");
  await expect(spaces).toHaveCount(62);
  const nodeLabels = await spaces.evaluateAll((nodes) => (
    nodes.map((node) => node.dataset.nodeLabel)
  ));
  expect(new Set(nodeLabels).size).toBe(62);
  await expect(page.locator(
    ".board-space[data-node-id='w2n52'].treasure-kind-portal",
  )).toHaveCount(1);

  for (const variant of [
    "world-signal",
    "world-prism",
    "world-beacon",
    "world-tide",
    "world-tree",
    "world-aurora",
    "world-moon",
  ]) {
    await expect(page.locator(`.world-map-device.world-map-${variant}`).first())
      .toBeVisible();
  }
  await expect(page.locator(
    ".world-transport-device.world-transport-comet-lift",
  ).first()).toBeVisible();
  await expect(page.locator(
    ".world-transport-device.world-transport-bubble-geyser",
  ).first()).toBeVisible();

  const screenshotPath = path.resolve(
    process.cwd(),
    "output/playwright/universal-board-e2e/world-02-complete-master-desktop.png",
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  expect(consoleProblems).toEqual([]);
});

test("eight-player desktop HUD stays compact and reveals each owner's reward detail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("8");
  await chooseUniqueCharacters(page, 8);
  await page.locator("#start-session").click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.seats.length === 8",
  );

  const seededOwnerId = "seat-8";
  const seededPlayerName = await page.evaluate(({ storageKey, ownerId }) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    const account = snapshot.playerAssetsLedger.playerAssetsById[ownerId];
    Object.assign(account, {
      coins: 2,
      stars: 1,
      keys: 1,
      waitingCase: {
        id: "case.card.rainbow-pilot.flight.1",
        cardId: "card.rainbow-pilot.flight.1",
        source: "fairy",
        originNodeId: "n08",
      },
      collectedCardIds: [
        "card.cowboy.departure.1",
        "card.cloud-wizard.bridge.1",
      ],
      acceptedTurns: 3,
      milestoneAwards: 1,
      guaranteedCards: 1,
    });
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
    return snapshot.gameSession.seats.find(({ id }) => id === ownerId).displayName;
  }, { storageKey: SNAPSHOT_KEY, ownerId: seededOwnerId });

  await page.reload();
  await page.locator("#resume-session").click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.playerAssetsLedger"
      + ".playerAssetsById['seat-8'].collectedCardIds.length === 2",
  );
  await expect(page.locator(".runtime-shell")).toHaveAttribute(
    "data-player-hud",
    "compact",
  );
  const compactCards = page.locator(
    '.team-hud[data-hud-density="compact"]',
  );
  await expect(compactCards).toHaveCount(8);
  const hudAvatars = page.locator(
    ".team-token-preview[data-character-variant='hud'][data-art-state='ready']",
  );
  await expect(hudAvatars).toHaveCount(8);
  const hudIdentity = await hudAvatars.evaluateAll((avatars) => (
    avatars.map((avatar) => ({
      characterId: avatar.dataset.characterId,
      assetRef: avatar.querySelector(".character-avatar-art")?.getAttribute("src"),
    }))
  ));
  expect(new Set(hudIdentity.map(({ characterId }) => characterId)).size).toBe(8);
  expect(new Set(hudIdentity.map(({ assetRef }) => assetRef)).size).toBe(8);
  expect(hudIdentity.every(({ assetRef }) => (
    /^\/assets\/characters\/ximitu-friends\/v2\/hud\/[a-z0-9-]+-v2\.png$/u
      .test(assetRef)
  ))).toBe(true);
  await expect(page.locator(".player-reward-detail")).toHaveCount(8);
  await expect(page.locator(".player-asset-badge")).toHaveCount(32);
  expect(await compactCards.evaluateAll((cards) => (
    cards.every((card) => card.getAttribute("tabindex") === "0")
  ))).toBe(true);

  const summaryGeometry = await compactCards.evaluateAll((cards) => (
    cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        ownerId: card.dataset.playerId,
        width: rect.width,
        height: rect.height,
      };
    })
  ));
  expect(summaryGeometry.every(({ height }) => height < 82)).toBe(true);

  const seededCard = page.locator(
    `.team-hud[data-player-id="${seededOwnerId}"]`,
  );
  await expect(seededCard.locator("[data-player-asset] strong"))
    .toHaveText(["2", "1", "1", "2"]);
  const seededDetail = seededCard.locator(".player-reward-detail");
  await expect(seededDetail).toBeHidden();
  await seededCard.hover();
  await expect(seededDetail).toBeVisible();
  await expect(seededDetail.locator(".player-reward-detail-heading strong"))
    .toHaveText(seededPlayerName);
  await expect(seededDetail.locator(".player-reward-detail-heading small"))
    .toHaveText("已完成回合 3");
  await expect(seededDetail.locator('[data-detail-asset="coin"]'))
    .toContainText("金币2");
  await expect(seededDetail.locator('[data-detail-asset="star"]'))
    .toContainText("星星1");
  await expect(seededDetail.locator('[data-detail-asset="key"]'))
    .toContainText("钥匙1");
  await expect(seededDetail.locator('[data-detail-asset="card"]'))
    .toContainText("西米兔卡2");
  await expect(seededDetail.locator('[data-detail-asset="case"]'))
    .toContainText("待开启卡盒1 个");
  await expect(seededDetail.locator(".player-reward-detail-cards"))
    .toContainText("西米兔");
  await expect(seededDetail.locator(".player-reward-detail-cards"))
    .toContainText("云朵猫");
  await expect(seededDetail.locator(".player-reward-detail-cards"))
    .not.toContainText("泡泡企鹅");

  for (const ownerId of ["seat-4", "seat-5", "seat-8"]) {
    const card = page.locator(`.team-hud[data-player-id="${ownerId}"]`);
    const detail = card.locator(".player-reward-detail");
    await card.hover();
    await expect(detail).toBeVisible();
    const geometry = await detail.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const session = document.querySelector(".session-hud").getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        viewportWidth: window.innerWidth,
        clearsSessionColumn: rect.right <= session.left || rect.left >= session.right,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(8);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth - 8);
    expect(geometry.top).toBeGreaterThan(80);
    expect(geometry.clearsSessionColumn).toBe(true);
  }

  await page.locator(".board-viewport").hover({ position: { x: 400, y: 400 } });
  await seededCard.focus();
  await expect(seededDetail).toBeVisible();
  expect(await seededCard.getAttribute("aria-describedby"))
    .toBe(await seededDetail.getAttribute("id"));
  const focusVisual = await seededCard.evaluate((card) => ({
    activeOwnerId: document.activeElement?.dataset.playerId,
    outlineStyle: getComputedStyle(card).outlineStyle,
    outlineWidth: getComputedStyle(card).outlineWidth,
  }));
  expect(focusVisual.activeOwnerId).toBe(seededOwnerId);
  expect(focusVisual.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusVisual.outlineWidth)).toBeGreaterThanOrEqual(3);

  await page.locator("#theme-select").dispatchEvent("change");
  await expect(seededDetail).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.dataset.playerId))
    .toBe(seededOwnerId);

  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/personal-accounts-eight-player-desktop-compact-hover.png",
    ),
    fullPage: true,
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await seededCard.hover();
  await expect(seededDetail).toBeVisible();
  const compactDesktopGeometry = await page.evaluate(() => {
    const detail = document.querySelector(
      '.team-hud[data-player-id="seat-8"] .player-reward-detail',
    ).getBoundingClientRect();
    return {
      detailLeft: detail.left,
      detailRight: detail.right,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(compactDesktopGeometry.detailLeft).toBeGreaterThanOrEqual(8);
  expect(compactDesktopGeometry.detailRight)
    .toBeLessThanOrEqual(compactDesktopGeometry.viewportWidth - 8);
  expect(compactDesktopGeometry.documentWidth)
    .toBeLessThanOrEqual(compactDesktopGeometry.viewportWidth + 1);
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/personal-accounts-eight-player-compact-1024.png",
    ),
    fullPage: true,
  });
});

test("personal account strips stay readable and contained for 1, 2, 4 and 8 players", async ({
  page,
}) => {
  const viewports = [
    { width: 1440, height: 1000, label: "desktop" },
    { width: 1024, height: 768, label: "compact" },
    { width: 375, height: 812, label: "mobile" },
  ];

  for (const playerTotal of [1, 2, 4, 8]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(GAME_PATH);
    await page.locator("#setup-player-count").selectOption(String(playerTotal));
    await chooseUniqueCharacters(page, playerTotal);
    await page.locator("#start-session").click();
    await waitForSavedSession(
      page,
      "(snapshot, count) => snapshot.gameSession.seats.length === count",
      playerTotal,
    );

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(page.locator(".team-hud[data-player-id]")).toHaveCount(playerTotal);
      await expect(page.locator(".player-assets")).toHaveCount(playerTotal);
      await expect(page.locator(".player-asset-badge")).toHaveCount(playerTotal * 4);
      await expect(page.locator('.team-hud[data-hud-density="compact"]'))
        .toHaveCount(playerTotal >= 5 ? playerTotal : 0);
      await expect(page.locator(".player-reward-detail"))
        .toHaveCount(playerTotal >= 5 ? playerTotal : 0);
      const layout = await page.evaluate(() => {
        const rect = (selector) => {
          const bounds = document.querySelector(selector)?.getBoundingClientRect();
          return bounds ? {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
          } : null;
        };
        const overlaps = (a, b) => (
          a.left < b.right
          && a.right > b.left
          && a.top < b.bottom
          && a.bottom > b.top
        );
        const cards = [...document.querySelectorAll(".team-hud[data-player-id]")]
          .map((card) => {
            const cardRect = card.getBoundingClientRect();
            const strip = card.querySelector(".player-assets");
            const badgeRects = [...card.querySelectorAll(".player-asset-badge")]
              .map((badge) => {
                const rect = badge.getBoundingClientRect();
                return {
                  left: rect.left,
                  right: rect.right,
                  top: rect.top,
                  bottom: rect.bottom,
                  fontSize: Number.parseFloat(
                    getComputedStyle(badge.querySelector("strong")).fontSize,
                  ),
                };
              });
            return {
              ownerId: card.dataset.playerId,
              accessibleName: strip?.getAttribute("aria-label") || "",
              contained: badgeRects.every((badge) => (
                badge.left >= cardRect.left - 1
                && badge.right <= cardRect.right + 1
                && badge.top >= cardRect.top - 1
                && badge.bottom <= cardRect.bottom + 1
              )),
              noBadgeOverlap: badgeRects.every((badge, index) => (
                badgeRects.slice(index + 1).every((other) => !overlaps(badge, other))
              )),
              minimumNumberSize: Math.min(...badgeRects.map((badge) => badge.fontSize)),
            };
          });
        return {
          innerWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          cards,
          readonlyBadgeTabStops: document.querySelectorAll(
            ".player-assets [tabindex]",
          ).length,
          rightStackHidden: document.querySelector("#team-hud-right").hidden,
          diceDock: rect("#dice-dock"),
          missionDock: rect(".mission-dock"),
          hudBottom: Math.max(...[
            ...document.querySelectorAll(".team-hud[data-player-id]"),
          ].map((card) => card.getBoundingClientRect().bottom)),
        };
      });
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
      expect(layout.bodyWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
      expect(layout.cards.every(({ contained }) => contained)).toBe(true);
      expect(layout.cards.every(({ noBadgeOverlap }) => noBadgeOverlap)).toBe(true);
      expect(layout.cards.every(({ minimumNumberSize }) => minimumNumberSize >= 12))
        .toBe(true);
      expect(layout.cards.every(({ accessibleName }) => (
        /金币/.test(accessibleName)
        && /星星/.test(accessibleName)
        && /钥匙/.test(accessibleName)
        && /西米兔卡/.test(accessibleName)
      ))).toBe(true);
      expect(layout.readonlyBadgeTabStops).toBe(0);
      if (playerTotal === 1) expect(layout.rightStackHidden).toBe(true);
      if (playerTotal === 8 && viewport.label === "mobile") {
        expect(layout.diceDock.top).toBeGreaterThanOrEqual(layout.hudBottom + 4);
        expect(layout.diceDock.bottom).toBeLessThanOrEqual(layout.missionDock.top - 4);
      }

      if (playerTotal === 4 && viewport.label === "desktop") {
        await page.screenshot({
          path: path.resolve(
            process.cwd(),
            "output/playwright/universal-board-e2e/personal-accounts-four-player-desktop.png",
          ),
          fullPage: true,
        });
      }
      if (playerTotal === 8 && viewport.label === "mobile") {
        await page.screenshot({
          path: path.resolve(
            process.cwd(),
            "output/playwright/universal-board-e2e/personal-accounts-eight-player-mobile.png",
          ),
          fullPage: true,
        });
      }
    }

    await waitForTurnReady(page, "Mia");
    await page.evaluate(() => {
      Math.random = () => 0;
    });
    await submitQaAssessment(page);
    const sprintOption = page.locator(
      "#dice-options .dice-option[data-dice-option-id='sprint']",
    );
    await expect(sprintOption).toBeVisible();
    await sprintOption.click();
    await waitForSavedSession(
      page,
      "(snapshot) => snapshot.gameSession.completedTurns === 1"
        + " && snapshot.gameSession.inputGate === 'open'",
    );
    const settled = await savedSession(page);
    expect(settled.playerAssetsLedger.acceptedTurnsTotal).toBe(1);
    expect(settled.playerAssetsLedger.playerAssetsById["seat-1"].coins).toBe(2);
    expect(settled.playerAssetsLedger.playerOrder.slice(1).every((ownerId) => (
      settled.playerAssetsLedger.playerAssetsById[ownerId].coins === 0
      && settled.playerAssetsLedger.playerAssetsById[ownerId].stars === 0
      && settled.playerAssetsLedger.playerAssetsById[ownerId].keys === 0
      && settled.playerAssetsLedger.playerAssetsById[ownerId].collectedCardIds.length === 0
    ))).toBe(true);
    expect(settled.runtime.teams.every((team) => team.coins === 0)).toBe(true);

    const settledLedger = settled.playerAssetsLedger;
    await page.reload();
    await page.locator("#resume-session").click();
    await waitForSavedSession(
      page,
      "(snapshot) => snapshot.gameSession.completedTurns === 1"
        + " && snapshot.gameSession.inputGate === 'open'",
    );
    expect((await savedSession(page)).playerAssetsLedger).toEqual(settledLedger);
  }
});

test("right dice rail casts real choices and reduced motion credits only the owner", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(GAME_FULL_MOTION_PATH);
  await page.locator("#setup-player-count").selectOption("2");
  await chooseUniqueCharacters(page, 2);
  await page.locator("#start-session").click();
  await disableBoardSoundsForHeadlessRun(page);
  await waitForTurnReady(page, "Mia");

  const diceDock = page.locator("#dice-dock");
  const dockItems = page.locator("#dice-dock-list .dice-dock-item");
  await expect(diceDock).toBeVisible();
  await expect(diceDock).toHaveAttribute("data-side", "right");
  await expect(diceDock).toHaveAttribute("data-order", "strongest-first");
  await expect(dockItems).toHaveCount(6);
  await expect(dockItems.filter({
    has: page.locator(".physical-die-viewport"),
  })).toHaveCount(6);
  expect(await dockItems.evaluateAll((items) => (
    items.every((item) => item.dataset.diceState === "parked")
  ))).toBe(true);
  expect(await dockItems.evaluateAll((items) => (
    items.map((item) => item.dataset.diceDockId)
  ))).toEqual([
    "treasure",
    "sprint",
    "steady",
    "support",
    "brave",
    "starter",
  ]);
  expect(await dockItems.evaluateAll((items) => (
    items.map((item) => Number(item.dataset.diceRank))
  ))).toEqual([1, 2, 3, 4, 5, 6]);
  const parkedDockLayout = await diceDock.evaluate((dock) => {
    const rect = dock.getBoundingClientRect();
    return {
      side: dock.dataset.side,
      rightGap: window.innerWidth - rect.right,
    };
  });
  expect(parkedDockLayout.rightGap).toBeLessThanOrEqual(12);

  await startInsertedElementObservation(
    page,
    "reduced-motion-token",
    ".collection-token",
  );
  // A stable shuffle yields Sprint + Treasure; the first Sprint face moves one
  // step to n02, which has a real board coin in addition to the answer coin.
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await expect(page.locator("#turn-feedback")).toBeVisible();
  await expect(page.locator("#turn-feedback")).toHaveAttribute(
    "data-visibility",
    "open",
  );

  const diceOptions = page.locator("#dice-options .dice-option");
  await expect(diceOptions).toHaveCount(2);
  await expect(page.locator("#dice-choice-stage")).toHaveAttribute(
    "data-score-tone",
    "celebrate",
  );
  await expect(page.locator("#dice-choice-stage")).toHaveAttribute(
    "data-phase",
    "waiting",
  );
  expect(await diceOptions.evaluateAll((options) => (
    options.every((option) => (
      option.dataset.diceState === "waiting"
      && option.dataset.originSide === "right"
    ))
  ))).toBe(true);
  const optionIds = (await diceOptions.evaluateAll((options) => (
    options.map((option) => option.dataset.diceOptionId)
  ))).sort();
  const promotedIds = (await page.locator(
    "#dice-dock-list .dice-dock-item.is-promoted",
  ).evaluateAll((items) => (
    items.map((item) => item.dataset.diceDockId)
  ))).sort();
  expect(promotedIds).toEqual(optionIds);
  expect(await diceOptions.evaluateAll((options) => (
    options.every((option) => option.dataset.promotedFromDock === "true")
  ))).toBe(true);
  const reducedWaitingStyle = await diceOptions.first().evaluate((option) => {
    const rotor = option.querySelector(".physical-die-idle-rotor");
    const edge = getComputedStyle(option, "::after");
    return {
      animationName: getComputedStyle(rotor).animationName,
      edgeOpacity: Number(edge.opacity),
      edgeColor: edge.borderTopColor,
    };
  });
  expect(reducedWaitingStyle.animationName).toBe("none");
  expect(reducedWaitingStyle.edgeOpacity).toBeGreaterThan(0.6);
  expect(reducedWaitingStyle.edgeColor).not.toBe("rgba(0, 0, 0, 0)");
  const reducedMarquee = await page.locator(
    "#dice-dock-list .dice-dock-item.is-candidate .dice-candidate-marquee rect",
  ).evaluateAll((rects) => (
    rects.map((rect) => ({
      animationName: getComputedStyle(rect).animationName,
      dashOffset: getComputedStyle(rect).strokeDashoffset,
      dashArray: getComputedStyle(rect).strokeDasharray,
    }))
  ));
  expect(reducedMarquee).toHaveLength(2);
  expect(reducedMarquee.every(({ animationName }) => animationName === "none"))
    .toBe(true);
  expect(reducedMarquee.every(({ dashOffset }) => dashOffset === "0px"))
    .toBe(true);
  expect(reducedMarquee.every(({ dashArray }) => dashArray !== "none"))
    .toBe(true);
  await expect(diceOptions.first()).toBeFocused();

  const desktopLayout = await page.evaluate(() => {
    const dock = document.querySelector("#dice-dock").getBoundingClientRect();
    const card = document.querySelector(".dice-choice-card").getBoundingClientRect();
    const feedbackElement = document.querySelector("#turn-feedback");
    const feedback = feedbackElement.getBoundingClientRect();
    const feedbackVisible = !feedbackElement.hidden;
    return {
      dockTop: dock.top,
      dockLeft: dock.left,
      dockRight: dock.right,
      cardRight: card.right,
      feedbackTop: feedback.top,
      feedbackLeft: feedback.left,
      feedbackRight: feedback.right,
      cardToFeedbackGap: feedback.left - card.right,
      feedbackVisible,
      feedbackToDockGap: feedbackVisible ? dock.left - feedback.right : null,
      dockRightGap: window.innerWidth - dock.right,
    };
  });
  expect(desktopLayout.cardToFeedbackGap).toBeGreaterThanOrEqual(8);
  expect(desktopLayout.feedbackVisible).toBe(true);
  expect(desktopLayout.feedbackToDockGap).toBeGreaterThanOrEqual(8);
  expect(desktopLayout.dockRightGap).toBeLessThanOrEqual(12);
  expect(Math.abs(desktopLayout.dockTop - desktopLayout.feedbackTop))
    .toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForFunction(() => {
    const dock = document.querySelector("#dice-dock")?.getBoundingClientRect();
    const card = document.querySelector(".dice-choice-card")?.getBoundingClientRect();
    const feedback = document.querySelector("#turn-feedback")?.getBoundingClientRect();
    return Boolean(
      dock
      && card
      && feedback
      && feedback.left - card.right >= 8
      && dock.left - feedback.right >= 8
    );
  });
  const compactDesktopLayout = await page.evaluate(() => {
    const dock = document.querySelector("#dice-dock").getBoundingClientRect();
    const card = document.querySelector(".dice-choice-card").getBoundingClientRect();
    const feedback = document.querySelector("#turn-feedback").getBoundingClientRect();
    return {
      dockTop: dock.top,
      dockLeft: dock.left,
      dockRightGap: window.innerWidth - dock.right,
      cardToFeedbackGap: feedback.left - card.right,
      feedbackToDockGap: dock.left - feedback.right,
      topDifference: Math.abs(dock.top - feedback.top),
    };
  });
  expect(compactDesktopLayout.cardToFeedbackGap).toBeGreaterThanOrEqual(8);
  expect(compactDesktopLayout.feedbackToDockGap).toBeGreaterThanOrEqual(8);
  expect(compactDesktopLayout.dockRightGap).toBeLessThanOrEqual(12);
  expect(compactDesktopLayout.topDifference).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => (
    window.innerWidth === 1440
    && document.querySelector("#dice-dock")?.getBoundingClientRect().right >= 1428
  ));

  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/right-dice-casting-desktop.png",
    ),
  });

  const sprintOption = page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  );
  await expect(sprintOption).toBeVisible();
  await sprintOption.click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'",
  );
  const collectionObservation = await stopInsertedElementObservation(
    page,
    "reduced-motion-token",
  );

  const miaAssets = page.locator(
    ".team-hud[data-player-id='seat-1'] .player-assets",
  );
  const leoAssets = page.locator(
    ".team-hud[data-player-id='seat-2'] .player-assets",
  );
  await expect(miaAssets).toHaveAttribute(
    "aria-label",
    /Mia：金币 2，星星 0，钥匙 0，西米兔卡 0/,
  );
  await expect(leoAssets).toHaveAttribute(
    "aria-label",
    /Leo：金币 0，星星 0，钥匙 0，西米兔卡 0/,
  );
  await expect(page.locator(".player-contribution, .treasure-ledger")).toHaveCount(0);
  await expect(page.locator("#collection-status")).toContainText("Mia获得 1 枚金币");
  expect(collectionObservation.seen).toBe(false);
  expect(collectionObservation.matches).toEqual([]);

  const settled = await savedSession(page);
  expect(settled.gameSession.seats.map((seat) => seat.opportunityCount))
    .toEqual([1, 0]);
  expect(settled.schemaVersion).toBe(LOCAL_SESSION_SCHEMA_VERSION);
  expect(settled.runtime.mapState.schemaVersion).toBe(
    EMPTY_HARBOR_MAP_STATE.schemaVersion,
  );
  expect(settled.playerAssetsLedger.acceptedTurnsTotal).toBe(1);
  expect(settled.playerAssetsLedger.playerAssetsById["seat-1"].coins).toBe(2);
  expect(settled.playerAssetsLedger.playerAssetsById["seat-2"].coins).toBe(0);
  expect(settled.runtime.teams.map((team) => team.coins)).toEqual([0, 0]);
  expect(settled.treasureState).toBeUndefined();
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/personal-accounts-reduced-motion-desktop.png",
    ),
  });
  await writeFile(
    path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/project7-dock-collection-state.json",
    ),
    `${JSON.stringify({
      scenario: "right-dice-casting-and-personal-account-credit",
      diceDockCount: 6,
      parkedDockLayout,
      promotedIds,
      optionIds,
      desktopLayout,
      reducedMotionCreatedFlightTokens: collectionObservation.seen,
      playerAssetsById: settled.playerAssetsLedger.playerAssetsById,
      runtimeEngineCoins: settled.runtime.teams.map((team) => team.coins),
    }, null, 2)}\n`,
  );
});

test("full-motion rewards fly from the real answer and board sources into Mia's account", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(GAME_FULL_MOTION_PATH);
  await page.locator("#setup-player-count").selectOption("2");
  await chooseUniqueCharacters(page, 2);
  await page.locator("#start-session").click();
  await disableBoardSoundsForHeadlessRun(page);
  await waitForTurnReady(page, "Mia");
  await startInsertedElementObservation(page, "owner-safe-reward-flight", ".collection-token");
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  await submitQaAssessment(page);
  const sprintOption = page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  );
  await expect(sprintOption).toBeVisible();
  await sprintOption.click();

  const answerToken = page.locator(
    ".collection-token[data-reward-source='answer'][data-owner-id='seat-1']",
  );
  await answerToken.waitFor({ state: "attached" });
  await answerToken.evaluate((element) => {
    const animation = element.getAnimations()[0];
    if (!animation) return;
    animation.currentTime = Math.min(360, Number(animation.effect.getTiming().duration) / 2);
    animation.pause();
  });
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/reward-flight-answer-to-mia.png",
    ),
  });
  await answerToken.evaluate((element) => {
    element.getAnimations()[0]?.play();
  }).catch(() => undefined);

  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'",
  );
  const observation = await stopInsertedElementObservation(
    page,
    "owner-safe-reward-flight",
  );
  const coinFlights = observation.matches.filter(({ dataset }) => (
    dataset.collectionResource === "coin"
  ));
  expect(coinFlights).toHaveLength(2);
  expect(coinFlights.map(({ dataset }) => dataset.rewardSource).sort())
    .toEqual(["answer", "landing"]);
  expect(coinFlights.map(({ dataset }) => dataset.originId).sort())
    .toEqual(["answer-score", "n02"]);
  expect(coinFlights.every(({ dataset }) => (
    dataset.ownerId === "seat-1"
    && dataset.targetPlayerId === "seat-1"
  ))).toBe(true);
  expect(new Set(coinFlights.map(({ dataset }) => dataset.collectionEventId)).size)
    .toBe(2);
  coinFlights.forEach(({ tokenPoint, sourcePoint, targetPoint }) => {
    expect(tokenPoint).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(sourcePoint).not.toBeNull();
    expect(targetPoint).not.toBeNull();
    expect(Math.hypot(
      tokenPoint.x - sourcePoint.x,
      tokenPoint.y - sourcePoint.y,
    )).toBeLessThanOrEqual(3);
    expect(Math.hypot(
      tokenPoint.x - targetPoint.x,
      tokenPoint.y - targetPoint.y,
    )).toBeGreaterThan(40);
  });

  const settled = await savedSession(page);
  expect(settled.playerAssetsLedger.playerAssetsById["seat-1"].coins).toBe(2);
  expect(settled.playerAssetsLedger.playerAssetsById["seat-2"].coins).toBe(0);
  expect(settled.runtime.teams.map((team) => team.coins)).toEqual([0, 0]);
});

test("treasure-die coins start at the locked bonus face and settle in the same owner account", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(GAME_FULL_MOTION_PATH);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await disableBoardSoundsForHeadlessRun(page);
  await waitForTurnReady(page, "Mia");
  await startInsertedElementObservation(page, "dice-face-reward-flight", ".collection-token");
  await startInsertedElementObservation(
    page,
    "signal-cannon-flight",
    ".cannon-bubble-flight, .cannon-reef-burst",
  );
  await page.evaluate(() => {
    const samples = [0, 0, 0.7];
    Math.random = () => samples.shift() ?? 0;
  });

  await submitQaAssessment(page);
  const treasureOption = page.locator(
    "#dice-options .dice-option[data-dice-option-id='treasure']",
  );
  await expect(treasureOption).toBeVisible();
  await startInsertedElementObservation(
    page,
    "treasure-locked-bonus-face",
    "#dice-roll-cube-slot "
      + ".physical-die-face[data-face-index='4'] .dice-face-bonus-icon",
  );
  await treasureOption.click();
  const lockedBonusFace = await finishInsertedElementObservation(
    page,
    "treasure-locked-bonus-face",
  );
  expect(lockedBonusFace.matches).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: "●●" }),
  ]));
  const rollResult = page.locator("#dice-roll-result.is-visible");
  await expect(rollResult).toContainText("两枚金币");

  await expect(page.locator("#route-choice-stage")).toBeVisible();
  await inspectAndChooseRoute(page, "e04a");
  await page.waitForFunction(() => (
    (window.__universalBoardE2eObservations?.["dice-face-reward-flight"]?.matches || [])
      .filter(({ dataset }) => dataset.rewardSource === "dice").length >= 2
  ));
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.inputGate === 'open'",
  );
  const observation = await stopInsertedElementObservation(
    page,
    "dice-face-reward-flight",
  );
  const cannonObservation = await stopInsertedElementObservation(
    page,
    "signal-cannon-flight",
  );
  expect(cannonObservation.matches).toEqual(expect.arrayContaining([
    expect.objectContaining({
      className: expect.stringContaining("cannon-bubble-flight"),
      dataset: expect.objectContaining({
        fromNodeId: "n06a",
        throughNodeId: "n08",
        toNodeId: "n09",
      }),
    }),
    expect.objectContaining({
      className: expect.stringContaining("cannon-reef-burst"),
      dataset: expect.objectContaining({
        throughNodeId: "n08",
      }),
    }),
  ]));
  const diceFlights = observation.matches.filter(({ dataset }) => (
    dataset.rewardSource === "dice"
  ));
  const landingFlights = observation.matches.filter(({ dataset }) => (
    dataset.rewardSource === "landing"
  ));
  expect(diceFlights).toHaveLength(2);
  expect(landingFlights).toHaveLength(0);
  expect(diceFlights.every(({ dataset }) => (
    dataset.originId === "dice-face"
    && dataset.ownerId === "seat-1"
    && dataset.targetPlayerId === "seat-1"
    && dataset.collectionResource === "coin"
  ))).toBe(true);
  diceFlights.forEach(({ tokenPoint, sourcePoint, targetPoint }) => {
    expect(sourcePoint).not.toBeNull();
    expect(targetPoint).not.toBeNull();
    expect(Math.hypot(
      tokenPoint.x - sourcePoint.x,
      tokenPoint.y - sourcePoint.y,
    )).toBeLessThanOrEqual(3);
    expect(Math.hypot(
      tokenPoint.x - targetPoint.x,
      tokenPoint.y - targetPoint.y,
    )).toBeGreaterThan(40);
  });

  const settled = await savedSession(page);
  // Answer coin + two die coins convert to one star. The signal cannon lands
  // on ordinary n09, which must not add a landing reward or discovery event.
  expect(settled.playerAssetsLedger.playerAssetsById["seat-1"].coins).toBe(0);
  expect(settled.playerAssetsLedger.playerAssetsById["seat-1"].stars).toBe(1);
  expect(settled.runtime.teams[0].coins).toBe(0);
  expect(settled.runtime.teams[0].nodeId).toBe("n09");
  expect(settled.runtime.mapState.cloudReefCleared).toBe(true);
  await expect(page.locator(".board-space[data-node-id='n09']")).toHaveClass(
    /is-ordinary/,
  );
  await expect(page.locator(".board-space[data-node-id='n09']")).toHaveClass(
    /is-visited/,
  );
  await expect(page.locator(".launcher-device[data-transport-node-id='n06a']"))
    .toHaveAttribute("data-launcher-state", "route-open");
});

test("refreshing during a reward flight restores the committed personal balance once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(GAME_FULL_MOTION_PATH);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await disableBoardSoundsForHeadlessRun(page);
  await waitForTurnReady(page, "Mia");
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  await submitQaAssessment(page);
  const sprintOption = page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  );
  await expect(sprintOption).toBeVisible();
  await sprintOption.click();
  await page.locator(
    ".collection-token[data-owner-id='seat-1'][data-reward-source='answer']",
  ).waitFor({ state: "attached" });

  const pending = await savedSession(page);
  expect(pending.gameSession.inputGate).toBe("settlement_pending");
  expect(pending.gameSession.completedTurns).toBe(1);
  expect(pending.playerAssetsLedger.acceptedTurnsTotal).toBe(1);
  expect(pending.playerAssetsLedger.playerAssetsById["seat-1"].coins).toBe(2);
  expect(pending.playerAssetsLedger.processedSettlementIds).toHaveLength(1);

  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await startInsertedElementObservation(
    page,
    "restored-reward-token",
    ".collection-token",
  );
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");
  await page.waitForTimeout(250);
  const replayedAnimation = await stopInsertedElementObservation(
    page,
    "restored-reward-token",
  );
  expect(replayedAnimation.seen).toBe(false);

  const restored = await savedSession(page);
  expect(restored.gameSession.completedTurns).toBe(1);
  expect(restored.gameSession.inputGate).toBe("open");
  expect(restored.playerAssetsLedger.acceptedTurnsTotal).toBe(1);
  expect(restored.playerAssetsLedger.processedSettlementIds)
    .toEqual(pending.playerAssetsLedger.processedSettlementIds);
  expect(restored.playerAssetsLedger.playerAssetsById["seat-1"].coins).toBe(2);
  expect(restored.runtime.teams[0].coins).toBe(0);
  await expect(page.locator(
    ".team-hud[data-player-id='seat-1'] [data-player-asset='coin'] strong",
  )).toHaveText("2");
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/reward-flight-refresh-recovered.png",
    ),
  });
});

test("v4 migration preserves ambiguous shared and engine balances without crediting children", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("2");
  await chooseUniqueCharacters(page, 2);
  await page.locator("#start-session").click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.seats.length === 2",
  );

  const rawV4 = await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.schemaVersion = 4;
    delete snapshot.playerAssetsLedger;
    delete snapshot.runtime.mapState;
    snapshot.gameSession.seats[0].opportunityCount = 2;
    snapshot.gameSession.seats[1].opportunityCount = 1;
    snapshot.runtime.teams[0].coins = 2;
    snapshot.runtime.teams[1].coins = 5;
    snapshot.fairyState = {
      status: "absent",
      anchorId: null,
      distance: null,
      targetTeamId: null,
      cardCase: null,
      moveCount: 0,
      spawnedRound: null,
      lastTransitionRound: null,
      capturedRound: null,
    };
    snapshot.treasureState = {
      schemaVersion: "treasure.shared.v1",
      scope: "class",
      coins: 5,
      gems: 2,
      keys: 1,
      waitingCase: null,
      collectedCardIds: ["card.star-captain.signal.1"],
      acceptedTurns: 3,
      lastCardOpenedTurn: null,
    };
    const serialized = JSON.stringify(snapshot);
    window.localStorage.setItem(storageKey, serialized);
    return serialized;
  }, SNAPSHOT_KEY);

  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  const migrated = await savedSession(page);
  expect(migrated.schemaVersion).toBe(LOCAL_SESSION_SCHEMA_VERSION);
  expect(migrated.runtime.mapState).toEqual(EMPTY_HARBOR_MAP_STATE);
  expect(migrated.treasureState).toBeUndefined();
  expect(migrated.playerAssetsLedger.playerAssetsById["seat-1"].coins).toBe(0);
  expect(migrated.playerAssetsLedger.playerAssetsById["seat-2"].coins).toBe(0);
  expect(migrated.playerAssetsLedger.playerAssetsById["seat-1"].stars).toBe(0);
  expect(migrated.playerAssetsLedger.playerAssetsById["seat-2"].stars).toBe(0);
  expect(migrated.playerAssetsLedger.legacyUnassigned.shared).toMatchObject({
    coins: 5,
    stars: 2,
    keys: 1,
    collectedCardIds: ["card.star-captain.signal.1"],
    acceptedTurns: 3,
  });
  expect(
    migrated.playerAssetsLedger.legacyUnassigned.runtimeEngineCoinsByPlayerId,
  ).toEqual({
    "seat-1": 2,
    "seat-2": 5,
  });
  expect(migrated.runtime.teams.map((team) => team.coins)).toEqual([2, 5]);
  const backup = await page.evaluate(() => (
    window.localStorage.getItem(
      "tim.voice-board.local-session.v1.v4-backup",
    )
  ));
  expect(backup).toBe(rawV4);

  const firstLedger = migrated.playerAssetsLedger;
  await page.reload();
  await page.locator("#resume-session").click();
  const restoredAgain = await savedSession(page);
  expect(restoredAgain.schemaVersion).toBe(LOCAL_SESSION_SCHEMA_VERSION);
  expect(restoredAgain.runtime.mapState).toEqual(EMPTY_HARBOR_MAP_STATE);
  expect(restoredAgain.playerAssetsLedger).toEqual(firstLedger);
  await expect(page.locator(
    ".team-hud[data-player-id='seat-1'] .player-assets",
  )).toHaveAttribute(
    "aria-label",
    /Mia：金币 0，星星 0，钥匙 0，西米兔卡 0/,
  );

  await disableBoardSoundsForHeadlessRun(page);
  await waitForTurnReady(page, "Mia");
  await submitQaAssessment(page);
  const nonTreasureDie = page.locator(
    "#dice-options .dice-option:not([data-dice-option-id='treasure'])",
  ).first();
  await expect(nonTreasureDie).toBeVisible();
  await nonTreasureDie.click();
  const migrationTurnGate = await waitForRouteChoiceOrCommittedTurn(page, 1);
  if (migrationTurnGate === "route") await inspectAndChooseRoute(page);
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.playerAssetsLedger.acceptedTurnsTotal === 4",
  );

  const isolated = await savedSession(page);
  const personalAccounts = Object.values(
    isolated.playerAssetsLedger.playerAssetsById,
  );
  expect(isolated.playerAssetsLedger.milestonesSettled).toBe(1);
  expect(personalAccounts.reduce(
    (total, account) => total + account.guaranteedCards,
    0,
  )).toBe(1);
  expect(personalAccounts.flatMap(
    (account) => account.collectedCardIds,
  )).toHaveLength(1);
  expect(isolated.playerAssetsLedger.legacyUnassigned)
    .toEqual(firstLedger.legacyUnassigned);
});

test("v5 migration adds canonical harbor map state and preserves the raw snapshot", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("2");
  await chooseUniqueCharacters(page, 2);
  await page.locator("#start-session").click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.seats.length === 2",
  );

  const rawV5 = await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.schemaVersion = 5;
    delete snapshot.runtime.mapState;
    snapshot.migration = {
      sourceSchemaVersion: 4,
      legacyTreasureStatePreserved: true,
    };
    const serialized = JSON.stringify(snapshot);
    window.localStorage.setItem(storageKey, serialized);
    return serialized;
  }, SNAPSHOT_KEY);

  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();

  const migrated = await savedSession(page);
  expect(migrated.schemaVersion).toBe(LOCAL_SESSION_SCHEMA_VERSION);
  expect(migrated.runtime.mapState).toEqual(EMPTY_HARBOR_MAP_STATE);

  const rawBackup = await page.evaluate(() => (
    window.localStorage.getItem(
      "tim.voice-board.local-session.v1.v5-backup",
    )
  ));
  expect(rawBackup).toBe(rawV5);

  await page.reload();
  await page.locator("#resume-session").click();
  const restoredAgain = await savedSession(page);
  expect(restoredAgain.schemaVersion).toBe(LOCAL_SESSION_SCHEMA_VERSION);
  expect(restoredAgain.runtime.mapState).toEqual(EMPTY_HARBOR_MAP_STATE);
  expect(await page.evaluate(() => (
    window.localStorage.getItem(
      "tim.voice-board.local-session.v1.v5-backup",
    )
  ))).toBe(rawV5);
});

test("one score retry reveals the answer but never settles the abandoned score", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await disableBoardSoundsForHeadlessRun(page);
  await waitForTurnReady(page, "Mia");

  const initial = await savedSession(page);
  const initialFingerprint = stableTurnFingerprint(initial);
  await startInsertedElementObservation(
    page,
    "abandoned-score-reward-token",
    ".collection-token",
  );
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await expect(page.locator("#mission-frame"))
    .toHaveAttribute("data-answer-state", "revealed");
  await expect(page.locator("#mission-frame .mission-answer-fill"))
    .toHaveText("has");
  await expect(page.locator("#mission-score-result")).toBeVisible();
  await expect(page.locator("#mission-score-result strong")).toHaveText("92");
  const retry = page.locator("#dice-score-retry");
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  expect(stableTurnFingerprint(await savedSession(page)))
    .toEqual(initialFingerprint);

  await retry.click();
  await expect(page.locator("#dice-choice-stage")).toBeHidden();
  await expect(page.locator("#mission-frame"))
    .toHaveAttribute("data-answer-state", "blank");
  await expect(page.locator("#mission-frame")).toContainText("___");
  await expect(page.locator("#mission-score-result")).toBeHidden();
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await expect(page.locator("#asr-toggle")).toBeFocused();

  const afterRetry = await savedSession(page);
  const afterRetryFingerprint = stableTurnFingerprint(afterRetry);
  expect(afterRetryFingerprint).toEqual(initialFingerprint);
  expect(afterRetry.gameSession.completedTurns).toBe(0);
  expect(afterRetry.runtime.acceptedCount).toBe(0);
  expect(afterRetry.playerAssetsLedger.acceptedTurnsTotal).toBe(0);
  expect(afterRetry.playerAssetsLedger.processedSettlementIds).toEqual([]);
  expect(afterRetry.gameSession.processedAttemptIds).toEqual([]);
  expect(afterRetry.runtime.processedAttemptIds).toEqual([]);
  expect(afterRetry.speechAttemptState.ordinal).toBe(1);
  expect(afterRetry.speechAttemptState.scoreRetryUsedTurnKey).toBe(
    afterRetry.speechAttemptState.turnKey,
  );
  const abandonedAnimation = await stopInsertedElementObservation(
    page,
    "abandoned-score-reward-token",
  );
  expect(abandonedAnimation.seen).toBe(false);

  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await expect(page.locator("#mission-frame .mission-answer-fill"))
    .toHaveText("has");
  await expect(page.locator("#mission-score-result strong")).toHaveText("92");
  await expect(retry).toBeHidden();
  await expect(page.locator("#dice-score-retry-note")).toBeHidden();
  expect(stableTurnFingerprint(await savedSession(page)))
    .toEqual(afterRetryFingerprint);

  await page.locator("#dice-options .dice-option").first().click();
  const gate = await waitForRouteChoiceOrCommittedTurn(page, 1);
  if (gate === "route") await inspectAndChooseRoute(page);
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.playerAssetsLedger.acceptedTurnsTotal === 1",
  );
  const completed = await savedSession(page);
  expect(completed.gameSession.completedTurns).toBe(1);
  expect(completed.runtime.acceptedCount).toBe(1);
  expect(completed.playerAssetsLedger.acceptedTurnsTotal).toBe(1);
  expect(completed.playerAssetsLedger.processedSettlementIds).toHaveLength(1);
  expect(completed.playerAssetsLedger.playerAssetsById["seat-1"].acceptedTurns).toBe(1);
  expect(completed.gameSession.processedAttemptIds).toHaveLength(1);
  expect(completed.runtime.processedAttemptIds).toHaveLength(1);
});

test("compact feedback auto-dismisses and the active pawn follows player rotation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("2");
  await chooseUniqueCharacters(page, 2);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  const activeState = async () => page.evaluate(() => {
    const main = [...document.querySelectorAll(".pawn.is-active")];
    const mini = [...document.querySelectorAll(".mini-pawn.is-active")];
    const activeMain = main[0];
    const activeMini = mini[0];
    const turnIndicator = activeMain?.querySelector(".pawn-turn-indicator");
    const turnAura = activeMain?.querySelector(".pawn-turn-aura");
    const characterVisual = activeMain?.querySelector(".pawn-character-visual");
    const activeHud = document.querySelector(".team-hud[data-turn-state='current']");
    const hudShell = activeHud?.querySelector(".team-token-shell");
    const hudPreview = activeHud?.querySelector(".team-token-preview");
    return {
      mainCount: main.length,
      miniCount: mini.length,
      mainTeamId: activeMain?.dataset.teamId || null,
      miniTeamId: activeMini?.dataset.teamId || null,
      characterId: activeMain?.dataset.characterId || null,
      artState: characterVisual?.dataset.artState || null,
      assetRef: characterVisual
        ?.querySelector(".pawn-character-art")
        ?.getAttribute("href") || null,
      turnState: activeMain?.dataset.turnState || null,
      ariaLabel: activeMain?.getAttribute("aria-label") || "",
      mainDrawnLast: activeMain === activeMain?.parentElement?.lastElementChild,
      miniDrawnLast: activeMini === activeMini?.parentElement?.lastElementChild,
      turnIndicatorAnimation: turnIndicator
        ? getComputedStyle(turnIndicator).animationName
        : "",
      turnIndicatorOpacity: turnIndicator
        ? getComputedStyle(turnIndicator).opacity
        : "",
      auraCount: activeMain?.querySelectorAll(".pawn-turn-aura").length || 0,
      auraAnimation: turnAura ? getComputedStyle(turnAura).animationName : "",
      auraOpacity: turnAura ? getComputedStyle(turnAura).opacity : "",
      activeHudCount: document.querySelectorAll(
        ".team-hud[data-turn-state='current'] .team-token-shell",
      ).length,
      hudAuraAnimation: hudShell
        ? getComputedStyle(hudShell, "::before").animationName
        : "",
      hudAuraOpacity: hudShell
        ? getComputedStyle(hudShell, "::before").opacity
        : "",
      hudPreviewTransitionDuration: hudPreview
        ? getComputedStyle(hudPreview).transitionDuration
        : "",
      pedestalCount: activeMain?.querySelectorAll(".pawn-turn-pedestal").length || 0,
      chevronCount: activeMain?.querySelectorAll(".pawn-turn-chevron").length || 0,
      legacyBeaconCount: activeMain?.querySelectorAll(".pawn-active-beacon").length || 0,
    };
  });

  const initialActive = await activeState();
  expect(initialActive).toEqual(expect.objectContaining({
    mainCount: 1,
    miniCount: 1,
    mainTeamId: "player-1",
    miniTeamId: "player-1",
    turnState: "current",
    mainDrawnLast: true,
    miniDrawnLast: true,
    characterId: "cowboy",
    artState: "ready",
    turnIndicatorAnimation: "none",
    auraCount: 1,
    auraAnimation: "none",
    activeHudCount: 1,
    hudAuraAnimation: "none",
    hudPreviewTransitionDuration: "0s",
    pedestalCount: 1,
    chevronCount: 1,
    legacyBeaconCount: 0,
  }));
  expect(initialActive.ariaLabel).toContain("当前玩家棋子：Mia");
  expect(initialActive.assetRef).toBe(
    "/assets/characters/ximitu-friends/v2/pawns/ximi-rabbit-v2.png",
  );
  expect(Number(initialActive.turnIndicatorOpacity)).toBeGreaterThan(0.9);
  expect(Number(initialActive.auraOpacity)).toBeGreaterThanOrEqual(0.78);
  expect(Number(initialActive.hudAuraOpacity)).toBeGreaterThanOrEqual(0.78);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const animatedGlow = await activeState();
  expect(animatedGlow.auraAnimation).toBe("active-player-aura");
  expect(animatedGlow.hudAuraAnimation).toBe("active-player-aura");
  await page.emulateMedia({ reducedMotion: "reduce" });

  const reviewFeedback = observeNextFeedback(page);
  await submitQaTeacherReview(page);
  expect(await reviewFeedback).toEqual(expect.objectContaining({
    state: "review",
    visibility: "open",
    score: "—",
  }));
  const desktopMetrics = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      } : null;
    };
    const overlap = (left, right) => (
      left && right
        ? Math.max(0, Math.min(left.right, right.right) - Math.max(left.x, right.x))
          * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.y, right.y))
        : 0
    );
    const feedback = box("#turn-feedback");
    const board = box(".board-viewport");
    return {
      feedback,
      board,
      coveredPercent: Math.round(
        1000 * overlap(feedback, board) / (board.width * board.height),
      ) / 10,
      overlaps: {
        navigator: overlap(feedback, box(".map-navigator")),
        legend: overlap(feedback, box(".board-legend")),
        mission: overlap(feedback, box(".mission-dock")),
        dice: overlap(feedback, box(".die-panel")),
      },
      ariaLive: document.querySelector("#turn-feedback")?.getAttribute("aria-live"),
      ariaAtomic: document.querySelector("#turn-feedback")?.getAttribute("aria-atomic"),
      animationName: getComputedStyle(
        document.querySelector(".turn-feedback-card"),
      ).animationName,
    };
  });
  expect(desktopMetrics.feedback.width).toBeLessThanOrEqual(344);
  expect(desktopMetrics.coveredPercent).toBeLessThan(10);
  expect(desktopMetrics.overlaps).toEqual({
    navigator: 0,
    legend: 0,
    mission: 0,
    dice: 0,
  });
  expect(desktopMetrics.ariaLive).toBe("polite");
  expect(desktopMetrics.ariaAtomic).toBe("true");
  expect(desktopMetrics.animationName).toBe("feedback-fade-in");
  await expect(page.locator("#turn-feedback")).toBeHidden();

  await page.locator("#teacher-accept").click();
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await expect(page.locator("#mission-score-result")).toBeHidden();
  await expect(page.locator("#turn-feedback")).toBeHidden();
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await page.locator("#dice-options .dice-option").click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.activeSeatIndex === 1",
  );
  await waitForTurnReady(page, "Leo");

  const rotatedActive = await activeState();
  expect(rotatedActive).toEqual(expect.objectContaining({
    mainCount: 1,
    miniCount: 1,
    mainTeamId: "player-2",
    miniTeamId: "player-2",
    turnState: "current",
    mainDrawnLast: true,
    miniDrawnLast: true,
    characterId: "star-captain",
    artState: "ready",
    turnIndicatorAnimation: "none",
    pedestalCount: 1,
    chevronCount: 1,
    legacyBeaconCount: 0,
  }));
  expect(rotatedActive.ariaLabel).toContain("当前玩家棋子：Leo");
  expect(rotatedActive.assetRef).toBe(
    "/assets/characters/ximitu-friends/v2/pawns/wave-otter-v2.png",
  );
  await expect(page.locator(".pawn[data-team-id='player-1']"))
    .toHaveAttribute("data-turn-state", "waiting");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const mobileFeedbackUpdate = observeNextFeedback(page);
  await submitQaTeacherReview(page);
  await mobileFeedbackUpdate;
  const mobileMetrics = await page.evaluate(() => {
    const feedback = document.querySelector("#turn-feedback").getBoundingClientRect();
    const board = document.querySelector(".board-viewport").getBoundingClientRect();
    const overlapHeight = Math.max(
      0,
      Math.min(feedback.bottom, board.bottom) - Math.max(feedback.top, board.top),
    );
    return {
      width: feedback.width,
      height: feedback.height,
      rightGap: window.innerWidth - feedback.right,
      overlapHeight,
      animationName: getComputedStyle(
        document.querySelector(".turn-feedback-card"),
      ).animationName,
    };
  });
  expect(mobileMetrics.width).toBeLessThanOrEqual(230);
  expect(mobileMetrics.height).toBeLessThanOrEqual(165);
  expect(mobileMetrics.rightGap).toBeGreaterThanOrEqual(8);
  expect(mobileMetrics.overlapHeight).toBeLessThanOrEqual(85);
  expect(mobileMetrics.animationName).toBe("feedback-fade-in");
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/feedback-active-player-mobile-375.png",
    ),
  });
  await expect(page.locator("#turn-feedback")).toBeHidden();

  await writeFile(
    path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/feedback-active-player-state.json",
    ),
    `${JSON.stringify({
      scenario: "compact-feedback-and-active-player-rotation",
      reducedMotion: true,
      initialActive,
      desktopMetrics,
      rotatedActive,
      mobileMetrics,
    }, null, 2)}\n`,
  );
});

test("answer recording prepares visibly and automatically finishes after final speech", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    window.__voiceBoardFakeRecognition = {
      last: null,
      startCalls: 0,
      stopCalls: 0,
    };
    class FakeSpeechRecognition {
      constructor() {
        window.__voiceBoardFakeRecognition.last = this;
      }

      start() {
        window.__voiceBoardFakeRecognition.startCalls += 1;
      }

      stop() {
        window.__voiceBoardFakeRecognition.stopCalls += 1;
      }

      abort() {}
    }

    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: FakeSpeechRecognition,
    });
  });

  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await expect(page.locator("#turn-showtime")).toBeHidden();

  await expect(page.locator("#asr-availability"))
    .toContainText("本地声音模式已就绪");
  await expect(page.locator("#asr-help"))
    .toContainText("不生成 AI 分数");
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await expect(page.locator("#asr-status-line")).toHaveAttribute("role", "status");
  await expect(page.locator("#asr-status-line")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#asr-status-line")).toHaveAttribute("aria-atomic", "true");
  await expect(page.locator("#asr-toggle"))
    .toHaveAttribute("aria-describedby", /asr-availability.*asr-transcript.*asr-help/);
  await page.locator("#asr-toggle").focus();
  await expect(page.locator("#asr-toggle")).toBeFocused();
  const missionDock = page.getByTestId("mission-dock");
  const readyVisual = await missionDock.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
    };
  });
  const readyBackground = readyVisual.backgroundColor;
  await page.locator("#asr-toggle").click();

  await expect(missionDock).toHaveAttribute("data-speech-state", "preparing");
  await expect(missionDock).toHaveAttribute("data-speech-busy", "true");
  await expect(page.locator("#asr-toggle")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#asr-toggle")).toBeDisabled();
  await expect(page.locator("#asr-console")).toBeFocused();
  await expect(page.locator("#asr-toggle")).toContainText("准备麦克风");
  await expect(page.locator("#asr-availability")).toContainText("正在准备麦克风");
  await page.waitForFunction(() => (
    window.__voiceBoardFakeRecognition?.startCalls === 1
  ));
  const preparingMotion = await missionDock.evaluate((element) => ({
    marker: getComputedStyle(
      element.querySelector(".speech-state-marker"),
    ).animationName,
    buttonLoader: getComputedStyle(
      element.querySelector("#asr-toggle"),
      "::before",
    ).animationName,
  }));
  expect(preparingMotion.marker).toContain("speech-loader-spin");
  expect(preparingMotion.buttonLoader).toContain("speech-loader-spin");
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/speech-preparing-desktop.png",
    ),
  });

  await page.evaluate(() => {
    const recognition = window.__voiceBoardFakeRecognition.last;
    recognition.onstart?.();
    const result = [{
      transcript: "She has two apples.",
      confidence: 0.94,
    }];
    result.isFinal = false;
    const results = [result];
    results.item = (index) => results[index];
    recognition.onresult?.({ resultIndex: 0, results });
  });

  await expect(missionDock).toHaveAttribute("data-speech-state", "listening");
  await expect(missionDock).toHaveAttribute("data-speech-busy", "false");
  await expect(page.locator("#asr-toggle")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await expect(page.locator("#asr-toggle")).toBeFocused();
  await expect(page.locator("#asr-toggle"))
    .toHaveText("提前结束录音");
  await expect(page.locator("#asr-availability"))
    .toContainText("说完后会自动结束");
  await expect(page.locator("#asr-transcript")).toContainText("She has");
  await expect(page.locator("#teacher-accept")).toBeHidden();
  await expect(page.locator("#die-status")).toHaveText("?");
  expect((await savedSession(page)).gameSession.completedTurns).toBe(0);
  await expect.poll(() => missionDock.evaluate((element) => (
    getComputedStyle(element).backgroundColor
  ))).not.toBe(readyBackground);
  const listeningVisual = await missionDock.evaluate((element) => {
    const style = getComputedStyle(element);
    const markerStyle = getComputedStyle(
      element.querySelector(".speech-state-marker"),
    );
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      markerAnimation: markerStyle.animationName,
    };
  });
  expect(listeningVisual.backgroundColor).not.toBe(readyBackground);
  expect(listeningVisual.boxShadow).not.toBe("none");
  expect(listeningVisual.markerAnimation).toContain("speech-recording-pulse");
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/speech-recording-desktop.png",
    ),
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const narrowRecording = await missionDock.evaluate((element) => {
    const dock = element.getBoundingClientRect();
    const button = element.querySelector("#asr-toggle").getBoundingClientRect();
    const markerStyle = getComputedStyle(
      element.querySelector(".speech-state-marker"),
    );
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      dockLeft: dock.left,
      dockRight: dock.right,
      dockTop: dock.top,
      dockBottom: dock.bottom,
      buttonLeft: button.left,
      buttonRight: button.right,
      buttonTop: button.top,
      buttonBottom: button.bottom,
      buttonHeight: button.height,
      markerAnimation: markerStyle.animationName,
    };
  });
  expect(narrowRecording.documentWidth).toBeLessThanOrEqual(375);
  expect(narrowRecording.dockLeft).toBeGreaterThanOrEqual(0);
  expect(narrowRecording.dockRight).toBeLessThanOrEqual(375);
  expect(narrowRecording.dockTop).toBeGreaterThanOrEqual(0);
  expect(narrowRecording.dockBottom).toBeLessThanOrEqual(812);
  expect(narrowRecording.buttonLeft).toBeGreaterThanOrEqual(0);
  expect(narrowRecording.buttonRight).toBeLessThanOrEqual(375);
  expect(narrowRecording.buttonTop).toBeGreaterThanOrEqual(0);
  expect(narrowRecording.buttonBottom).toBeLessThanOrEqual(812);
  expect(narrowRecording.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(narrowRecording.markerAnimation).toBe("none");
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/speech-recording-mobile-375-reduced.png",
    ),
  });

  await page.evaluate(() => {
    const recognition = window.__voiceBoardFakeRecognition.last;
    const result = [{
      transcript: "She has two apples.",
      confidence: 0.96,
    }];
    result.isFinal = true;
    const results = [result];
    results.item = (index) => results[index];
    recognition.onresult?.({ resultIndex: 0, results });
  });
  await expect(missionDock).toHaveCSS(
    "background-color",
    readyVisual.backgroundColor,
  );
  await expect(missionDock).toHaveCSS(
    "border-color",
    readyVisual.borderColor,
  );
  const scoringState = await missionDock.evaluate((element) => {
    const style = getComputedStyle(element);
    const button = element.querySelector("#asr-toggle");
    return {
      state: element.dataset.speechState,
      busy: element.dataset.speechBusy,
      buttonBusy: button.getAttribute("aria-busy"),
      buttonDisabled: button.disabled,
      buttonText: button.textContent.trim(),
      availability: element.querySelector("#asr-availability").textContent.trim(),
      focusedId: document.activeElement?.id || "",
      stopCalls: window.__voiceBoardFakeRecognition.stopCalls,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      cardAnimation: style.animationName,
      markerAnimation: getComputedStyle(
        element.querySelector(".speech-state-marker"),
      ).animationName,
      buttonLoaderAnimation: getComputedStyle(
        button,
        "::before",
      ).animationName,
    };
  });
  expect(scoringState).toEqual(expect.objectContaining({
    state: "scoring",
    busy: "true",
    buttonBusy: "true",
    buttonDisabled: true,
    buttonText: "正在整理…",
    focusedId: "asr-console",
    stopCalls: 1,
    backgroundColor: readyVisual.backgroundColor,
    borderColor: readyVisual.borderColor,
    boxShadow: readyVisual.boxShadow,
    cardAnimation: "none",
    markerAnimation: "none",
    buttonLoaderAnimation: "none",
  }));
  expect(scoringState.availability).toContain("回答已提交");
  const lateFinalState = await page.evaluate(() => {
    const recognition = window.__voiceBoardFakeRecognition.last;
    const result = [{
      transcript: "She has two apples.",
      confidence: 0.96,
    }];
    result.isFinal = true;
    const results = [result];
    results.item = (index) => results[index];
    recognition.onresult?.({ resultIndex: 0, results });
    const dock = document.querySelector(".mission-dock");
    const button = document.querySelector("#asr-toggle");
    return {
      state: dock.dataset.speechState,
      disabled: button.disabled,
    };
  });
  expect(lateFinalState).toEqual({ state: "scoring", disabled: true });
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/speech-scoring-mobile-375-reduced.png",
    ),
  });

  await page.evaluate(() => {
    window.__voiceBoardFakeRecognition.last.onend?.();
  });
  await expect(page.locator("#asr-transcript"))
    .toContainText("已经很接近");
  await expect(page.locator("#teacher-accept")).toBeVisible();
  await expect(page.locator("#teacher-accept")).toBeFocused();
  await expect(missionDock).toHaveAttribute("data-speech-busy", "false");
  await expect(page.locator("#asr-toggle")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#feedback-score")).toHaveText("—");
  await expect(page.locator("#feedback-dice")).toHaveText("等待确认");
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/local-speech-teacher-review.png",
    ),
    fullPage: true,
  });
  await page.locator("#teacher-accept").click();
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await expect(page.locator("#dice-options .dice-option")).toHaveCount(1);
  await expect(page.locator("#dice-options .dice-option"))
    .toContainText("课堂助力骰");
  await expect(page.locator("#dice-options .dice-option")).toBeFocused();
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await page.locator("#dice-options .dice-option").click();
  const supportGate = await waitForRouteChoiceOrCommittedTurn(page, 1);
  if (supportGate === "route") await inspectAndChooseRoute(page);

  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.lastDicePresentation?.poolId === 'support'",
  );
  // Production intentionally keeps QA-only teacher tools hidden. Verify the
  // next playable turn through the player-facing controls instead.
  await expect(page.locator("#speaker-name")).toHaveText("Mia");
  await expect(page.locator("#showtime-name")).toHaveText("Mia");
  await expect(page.locator("#asr-toggle")).toBeEnabled();
  await expect(missionDock).toHaveAttribute("data-speech-state", "idle");
  await expect(missionDock).toHaveAttribute("data-speech-busy", "false");
  expect(await missionDock.evaluate((element) => (
    getComputedStyle(element).backgroundColor
  ))).toBe(readyBackground);
  const snapshot = await savedSession(page);
  expect(snapshot.gameSession.completedTurns).toBe(1);
  expect(snapshot.lastDicePresentation.poolId).toBe("support");
  expect(snapshot.gameSession.lastRecognitionOutcome.reason)
    .toBe("browser_transcript_teacher_review");
  await writeFile(
    path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/local-speech-state.json",
    ),
    `${JSON.stringify({
      scenario: "automatic-browser-speech-teacher-review",
      aiScore: null,
      transcript: "She has two apples.",
      recognitionReason: snapshot.gameSession.lastRecognitionOutcome.reason,
      completedTurns: snapshot.gameSession.completedTurns,
      dicePool: snapshot.lastDicePresentation.poolId,
      readyVisual,
      preparingMotion,
      listeningVisual,
      narrowRecording,
      scoringState,
    }, null, 2)}\n`,
  );
});

test("full-motion dice phases and pawn WAAPI movement use the non-reduced path", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(GAME_FULL_MOTION_PATH);
  expect(await page.evaluate(() => (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ))).toBe(false);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  // Keep the full-speed run deterministic: offer Steady Dice, then roll its
  // first 2-step face so movement stays before the first junction.
  await page.evaluate(() => {
    const samples = [0.999, 0.999, 0];
    Math.random = () => samples.shift() ?? 0;
  });
  const feedbackStartedAt = Date.now();
  await submitQaAssessment(page);
  const diceChoiceStage = page.locator("#dice-choice-stage");
  const dockCandidates = page.locator(
    "#dice-dock-list .dice-dock-item.is-candidate",
  );
  await expect(dockCandidates).toHaveCount(2);
  await expect(diceChoiceStage).toBeHidden();
  const rightDockWaiting = await dockCandidates.evaluateAll((items) => (
    items.map((item) => {
      const rotor = item.querySelector(".physical-die-idle-rotor");
      const edge = getComputedStyle(item, "::after");
      const rotorAnimation = rotor.getAnimations().find((animation) => (
        animation.animationName === "dice-waiting-turn"
      ));
      const marquee = item.querySelector(".dice-candidate-marquee rect");
      return {
        id: item.dataset.diceDockId,
        animationName: getComputedStyle(rotor).animationName,
        animationDuration: getComputedStyle(rotor).animationDuration,
        playState: rotorAnimation?.playState || "missing",
        keyframes: rotorAnimation?.effect?.getKeyframes?.().map((frame) => (
          String(frame.transform || "")
        )) || [],
        marqueeAnimationName: getComputedStyle(marquee).animationName,
        marqueeDuration: getComputedStyle(marquee).animationDuration,
        marqueePlayState: marquee.getAnimations()[0]?.playState || "missing",
        edgeOpacity: Number(edge.opacity),
      };
    })
  ));
  expect(rightDockWaiting).toHaveLength(2);
  expect(rightDockWaiting.every(({ animationName }) => (
    animationName === "dice-waiting-turn"
  ))).toBe(true);
  expect(rightDockWaiting.every(({ animationDuration }) => (
    animationDuration === "6.8s"
  ))).toBe(true);
  expect(rightDockWaiting.every(({ playState }) => playState === "running"))
    .toBe(true);
  expect(rightDockWaiting.every(({ keyframes }) => (
    keyframes.length >= 3
    && keyframes.every((transform) => transform.includes("rotateX(-18deg)"))
    && keyframes.some((transform) => transform.includes("rotateY(212deg)"))
  ))).toBe(true);
  expect(rightDockWaiting.every(({ marqueeAnimationName }) => (
    marqueeAnimationName === "dice-candidate-dash-run"
  ))).toBe(true);
  expect(rightDockWaiting.every(({ marqueeDuration }) => (
    marqueeDuration === "1.5s"
  ))).toBe(true);
  expect(rightDockWaiting.every(({ marqueePlayState }) => (
    marqueePlayState === "running"
  ))).toBe(true);
  expect(rightDockWaiting.every(({ edgeOpacity }) => edgeOpacity > 0))
    .toBe(true);

  await expect(diceChoiceStage).toBeVisible();
  const enteringOptions = page.locator("#dice-options .dice-option");
  await expect(enteringOptions).toHaveCount(2);
  await page.waitForFunction(() => (
    [...document.querySelectorAll("#dice-options .dice-option")].every((option) => (
      option.getAnimations().some((animation) => (
        animation.effect?.getKeyframes?.().some(({ transform }) => (
          String(transform || "").includes("translate3d")
        ))
      ))
    ))
  ));
  const entryAnimations = await enteringOptions.evaluateAll((options) => (
    options.map((option) => {
      const animation = option.getAnimations().find((candidate) => (
        candidate.effect?.getKeyframes?.().some(({ transform }) => (
          String(transform || "").includes("translate3d")
        ))
      ));
      const keyframes = animation?.effect?.getKeyframes?.() || [];
      const firstTransform = String(keyframes[0]?.transform || "");
      const lastTransform = String(keyframes.at(-1)?.transform || "");
      return {
        id: option.dataset.diceOptionId,
        firstX: Number(
          /translate3d\(([-\d.]+)px/.exec(firstTransform)?.[1] || Number.NaN,
        ),
        firstTransform,
        lastTransform,
        playState: animation?.playState || "missing",
      };
    })
  ));
  expect(entryAnimations.every(({ firstX }) => firstX > 100)).toBe(true);
  expect(entryAnimations.every(({ lastTransform }) => (
    lastTransform.includes("translate3d(0px, 0px, 0px)")
    || lastTransform.includes("translate3d(0, 0, 0)")
  ))).toBe(true);
  expect(entryAnimations.every(({ playState }) => playState === "running"))
    .toBe(true);
  await expect(page.locator("#turn-feedback")).toBeVisible();
  await expect(page.locator("#turn-feedback")).toHaveAttribute(
    "data-visibility",
    "open",
  );
  const feedbackDiceLayout = await page.evaluate(() => {
    const feedback = document.querySelector("#turn-feedback").getBoundingClientRect();
    const diceCard = document.querySelector(".dice-choice-card").getBoundingClientRect();
    const diceDock = document.querySelector("#dice-dock").getBoundingClientRect();
    return {
      feedbackLeft: feedback.left,
      feedbackRight: feedback.right,
      feedbackTop: feedback.top,
      diceCardRight: diceCard.right,
      diceDockTop: diceDock.top,
      diceDockLeft: diceDock.left,
      diceDockRight: diceDock.right,
      cardToFeedbackGap: feedback.left - diceCard.right,
      feedbackToDockGap: diceDock.left - feedback.right,
      dockRightGap: window.innerWidth - diceDock.right,
    };
  });
  expect(feedbackDiceLayout.cardToFeedbackGap).toBeGreaterThanOrEqual(8);
  expect(feedbackDiceLayout.feedbackToDockGap).toBeGreaterThanOrEqual(8);
  expect(feedbackDiceLayout.dockRightGap).toBeLessThanOrEqual(12);
  expect(Math.abs(
    feedbackDiceLayout.diceDockTop - feedbackDiceLayout.feedbackTop,
  )).toBeLessThanOrEqual(1);
  const feedbackTargetMs = 5_000;
  await page.waitForTimeout(Math.max(
    0,
    feedbackTargetMs - (Date.now() - feedbackStartedAt),
  ));
  await expect(page.locator("#turn-feedback")).toBeVisible();
  const visibleForMs = Date.now() - feedbackStartedAt;
  expect(visibleForMs).toBeGreaterThanOrEqual(feedbackTargetMs);
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/extended-feedback-with-dice-desktop.png",
    ),
  });
  const steadyDie = page.locator(
    "#dice-options .dice-option[data-dice-option-id='steady']",
  );
  await expect(steadyDie).toBeVisible();
  await expect(steadyDie).toHaveAttribute("data-dice-state", "waiting");
  await expect(page.locator("#dice-choice-stage")).toHaveAttribute(
    "data-score-tone",
    "celebrate",
  );
  const waitingDice = await steadyDie.evaluate((option) => {
    const rotor = option.querySelector(".physical-die-idle-rotor");
    const animation = rotor.getAnimations()[0];
    return {
      animationName: getComputedStyle(rotor).animationName,
      animationDuration: getComputedStyle(rotor).animationDuration,
      playState: animation?.playState || "missing",
      entryDeltaX: Number(option.dataset.entryDeltaX),
      instanceId: option.querySelector(".physical-die-viewport")?.dataset.diceInstanceId,
    };
  });
  expect(waitingDice.animationName).toBe("dice-waiting-turn");
  expect(waitingDice.animationDuration).toBe("6.8s");
  expect(waitingDice.playState).toBe("running");
  expect(waitingDice.entryDeltaX).toBeGreaterThan(100);

  const motionObservationKey = "full-motion-dice-and-pawn";
  await startFullMotionObservation(page, motionObservationKey);
  const selectedHold = observeSelectedDiceHold(page);
  await steadyDie.click();
  const selected = await selectedHold;
  const rollStage = page.locator("#dice-roll-stage");
  await expect(rollStage).toBeVisible();
  const rollCard = page.locator("#dice-roll-card");
  expect(selected).toEqual(expect.objectContaining({
    phase: "selected",
    endPhase: "selected",
    reusedCandidate: "true",
    diceOptionId: "steady",
    scoreTone: "celebrate",
    instanceId: waitingDice.instanceId,
    rotorMotionState: "held",
  }));
  const reusedViewport = page.locator(
    "#dice-roll-cube-slot .physical-die-viewport",
  );
  const rollingCube = reusedViewport.locator(".physical-die-cube");
  const heldStart = selected.start;
  const heldEnd = selected.end;
  expect(heldStart.transform).toBe(heldEnd.transform);
  expect(heldStart.cubeIsRolling).toBe(false);
  expect(heldEnd.cubeIsRolling).toBe(false);
  expect(heldStart.cubeAnimationCount).toBe(0);
  expect(heldEnd.cubeAnimationCount).toBe(0);
  await page.waitForFunction(() => (
    document.querySelector("#dice-roll-card")?.dataset.phase === "accelerate"
  ));
  await page.waitForFunction(() => (
    document.querySelector(
      "#dice-roll-cube-slot .physical-die-cube",
    )?.classList.contains("is-rolling")
  ));
  const fastRoll = await rollingCube.evaluate((cube) => {
    const animation = cube.getAnimations().find(({ playState }) => (
      playState === "running"
    ));
    return {
      playState: animation?.playState || "missing",
      keyframes: animation?.effect?.getKeyframes?.().map(({ transform }) => (
        String(transform || "")
      )) || [],
    };
  });
  expect(fastRoll.playState).toBe("running");
  expect(fastRoll.keyframes.some((transform) => (
    transform.includes("rotateX(1800deg)")
    || transform.includes("rotateY(1440deg)")
  ))).toBe(true);
  await page.waitForFunction(() => (
    document.querySelector("#dice-roll-card")?.dataset.phase === "sprint"
  ));
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/selected-dice-fast-roll-desktop.png",
    ),
  });
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'",
  );
  const timeline = await finishFullMotionObservation(page, motionObservationKey);
  expect(timeline.prefersReducedMotion).toBe(false);

  const firstPhaseTimes = new Map();
  timeline.dicePhases.forEach(({ phase, at }) => {
    if (!firstPhaseTimes.has(phase)) firstPhaseTimes.set(phase, at);
  });
  const requiredPhases = ["selected", "accelerate", "sprint", "slow", "settle"];
  expect(requiredPhases.every((phase) => firstPhaseTimes.has(phase))).toBe(true);
  expect(timeline.dicePhases.some(({ phase }) => phase === "reduced")).toBe(false);
  const orderedPhaseIndexes = requiredPhases.map((phase) => (
    timeline.dicePhases.findIndex((entry) => entry.phase === phase)
  ));
  expect(orderedPhaseIndexes).toEqual([...orderedPhaseIndexes].sort((a, b) => a - b));
  expect(firstPhaseTimes.get("accelerate") - firstPhaseTimes.get("selected"))
    .toBeGreaterThanOrEqual(180);
  expect(firstPhaseTimes.get("sprint") - firstPhaseTimes.get("accelerate"))
    .toBeGreaterThanOrEqual(450);
  expect(firstPhaseTimes.get("slow") - firstPhaseTimes.get("sprint"))
    .toBeGreaterThanOrEqual(600);
  expect(firstPhaseTimes.get("settle") - firstPhaseTimes.get("slow"))
    .toBeGreaterThanOrEqual(550);
  expect(firstPhaseTimes.get("settle") - firstPhaseTimes.get("accelerate"))
    .toBeGreaterThanOrEqual(1_800);

  const firstStep = timeline.steps[0];
  expect(firstStep.dataset).toEqual(expect.objectContaining({
    targetNodeId: "n02",
    stepLabel: "1/2 格",
  }));
  expect(firstStep.duration).toBeGreaterThanOrEqual(450);
  expect(firstStep.duration).toBeLessThanOrEqual(520);
  expect(firstStep.removedAt - firstStep.insertedAt).toBeGreaterThanOrEqual(400);
  expect(firstStep.keyframes.length).toBeGreaterThanOrEqual(4);
  expect(firstStep.keyframes.some(({ offset }) => (
    Number(offset) > 0.4 && Number(offset) < 0.5
  ))).toBe(true);
  expect(firstStep.keyframes.some(({ offset, transform }) => (
    Number(offset) > 0
    && Number(offset) < 1
    && /translate3d\((?!0(?:px)?, 0(?:px)?, 0(?:px)?\))/.test(transform)
  ))).toBe(true);
  const sampledTransforms = new Set(
    firstStep.samples.map(({ transform }) => transform).filter(Boolean),
  );
  expect(sampledTransforms.size).toBeGreaterThanOrEqual(4);
  expect(firstStep.samples.some(({ currentTime }) => (
    currentTime > firstStep.duration * 0.25
    && currentTime < firstStep.duration * 0.75
  ))).toBe(true);

  const settled = await savedSession(page);
  expect(settled.lastDicePresentation.poolId).toBe("steady");
  expect(settled.runtime.teams[0].nodeId).toBe("n03");
  await writeFile(
    path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/full-motion-timeline.json",
    ),
    `${JSON.stringify({
      scenario: "non-reduced-dice-and-pawn-motion",
      prefersReducedMotion: timeline.prefersReducedMotion,
      feedback: {
        visibleForMs,
        layout: feedbackDiceLayout,
      },
      rightDockWaiting,
      entryAnimations,
      waitingDice,
      selectedHold: {
        start: heldStart,
        end: heldEnd,
      },
      fastRoll,
      dicePhases: timeline.dicePhases,
      steps: timeline.steps.map((step) => ({
        dataset: step.dataset,
        duration: step.duration,
        elapsed: step.removedAt - step.insertedAt,
        keyframes: step.keyframes,
        sampledTransformCount: new Set(
          step.samples.map(({ transform }) => transform).filter(Boolean),
        ).size,
        intermediateSamples: step.samples.filter(({ currentTime }) => (
          currentTime > step.duration * 0.25
          && currentTime < step.duration * 0.75
        )).slice(0, 5),
      })),
      settledNodeId: settled.runtime.teams[0].nodeId,
      dicePool: settled.lastDicePresentation.poolId,
    }, null, 2)}\n`,
  );
});

test("keyboard dice selection keeps the full motion path and die identity", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(GAME_FULL_MOTION_PATH);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");
  await page.evaluate(() => {
    const samples = [0.999, 0.999, 0];
    Math.random = () => samples.shift() ?? 0;
  });
  await submitQaAssessment(page);

  const steadyDie = page.locator(
    "#dice-options .dice-option[data-dice-option-id='steady']",
  );
  await expect(steadyDie).toBeVisible();
  await expect(steadyDie).toHaveAttribute("data-dice-state", "waiting");
  await steadyDie.focus();
  await expect(steadyDie).toBeFocused();
  const instanceId = await steadyDie.locator(
    ".physical-die-viewport",
  ).getAttribute("data-dice-instance-id");

  const observationKey = "keyboard-full-motion-dice";
  await startFullMotionObservation(page, observationKey);
  await page.keyboard.press("Enter");

  const rollCard = page.locator("#dice-roll-card");
  await expect(rollCard).toBeVisible();
  await expect(rollCard).toHaveAttribute("data-reused-candidate", "true");
  await expect(rollCard).toHaveAttribute("data-dice-option-id", "steady");
  await expect(page.locator(
    "#dice-roll-cube-slot .physical-die-viewport",
  )).toHaveAttribute("data-dice-instance-id", instanceId);
  await expect(page.locator(
    "#dice-roll-cube-slot .physical-die-idle-rotor",
  )).toHaveAttribute("data-motion-state", "held");
  await page.waitForFunction(() => (
    document.querySelector(
      "#dice-roll-cube-slot .physical-die-cube",
    )?.classList.contains("is-rolling")
  ));

  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'",
  );
  const timeline = await finishFullMotionObservation(page, observationKey);
  const phases = timeline.dicePhases.map(({ phase }) => phase);
  const requiredPhases = ["selected", "accelerate", "sprint", "slow", "settle"];
  expect(requiredPhases.every((phase) => phases.includes(phase))).toBe(true);
  expect(phases.includes("reduced")).toBe(false);
  const settled = await savedSession(page);
  expect(settled.lastDicePresentation.poolId).toBe("steady");
  await expect(page.locator("#asr-toggle")).toBeEnabled();
});

test("pawn movement, route choice and harbor map effect stay visible end to end", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-learning").selectOption("positions");
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.runtime.teams[snapshot.runtime.activeTeamIndex].nodeId = "n04";
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, SNAPSHOT_KEY);
  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");

  // Keep the focused path deterministic: show Sprint Dice and land its 1-step
  // face on n05b after choosing the lower branch from n04.
  await page.evaluate(() => {
    const samples = [0, 0, 0];
    Math.random = () => samples.shift() ?? 0;
  });
  const stepObservationKey = "focused-step-pawn";
  await startInsertedElementObservation(page, stepObservationKey, ".step-pawn");
  const foghornObservationKey = "focused-harbor-foghorn";
  await startInsertedElementObservation(
    page,
    foghornObservationKey,
    ".harbor-foghorn-reticle, .harbor-foghorn-banner",
  );

  const beforeAssessment = await savedSession(page);
  expect(beforeAssessment.runtime.teams[0].nodeId).toBe("n04");
  expect(beforeAssessment.gameSession.completedTurns).toBe(0);
  await expect(page.locator(
    ".harbor-foghorn-reticle, .harbor-foghorn-banner",
  )).toHaveCount(0);

  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  const afterAssessment = await savedSession(page);
  expect(afterAssessment.runtime.teams[0].nodeId).toBe("n04");
  expect(afterAssessment.gameSession.completedTurns).toBe(0);
  expect(
    await page.evaluate((observationKey) => (
      window.__universalBoardE2eObservations?.[observationKey]?.seen === true
    ), foghornObservationKey),
  ).toBe(false);
  const sprintDie = page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  );
  await expect(sprintDie).toBeVisible();
  await sprintDie.click();

  await expect(page.locator("#route-choice-stage")).toBeVisible();
  const beforeRouteChoice = await savedSession(page);
  expect(beforeRouteChoice.runtime.teams[0].nodeId).toBe("n04");
  expect(beforeRouteChoice.gameSession.completedTurns).toBe(0);
  expect(
    await page.evaluate((observationKey) => (
      window.__universalBoardE2eObservations?.[observationKey]?.seen === true
    ), foghornObservationKey),
  ).toBe(false);
  await expect(page.locator("#route-choice-title")).toContainText("启航海湾岔路");
  const routeChoice = await inspectAndChooseRoute(page, "e04b");
  expect(routeChoice.options.map(({ edgeId }) => edgeId)).toEqual(["e04a", "e04b"]);
  expect(routeChoice.options.find(({ edgeId }) => edgeId === "e04b")?.tone)
    .toBe("mixed");

  const stepObservation = await finishInsertedElementObservation(
    page,
    stepObservationKey,
  );
  expect(stepObservation.matches).toEqual(expect.arrayContaining([
    expect.objectContaining({
      className: expect.stringContaining("step-pawn"),
      dataset: expect.objectContaining({
        targetNodeId: "n05b",
        stepLabel: "1/1 格",
      }),
    }),
  ]));

  const foghornObservation = await finishInsertedElementObservation(
    page,
    foghornObservationKey,
  );
  expect(foghornObservation.matches).toEqual(expect.arrayContaining([
    expect.objectContaining({
      className: expect.stringContaining("harbor-foghorn-reticle"),
      dataset: expect.objectContaining({
        mapEffectId: "harbor.foghorn.v1",
        sourceNodeId: "n05b",
        targetNodeId: "n08",
      }),
    }),
    expect.objectContaining({
      className: expect.stringContaining("harbor-foghorn-banner"),
      text: expect.stringContaining("精灵停留 1 个有效回合"),
      dataset: expect.objectContaining({
        mapEffectId: "harbor.foghorn.v1",
      }),
    }),
  ]));
  await expect(page.locator("#activity-stage")).toBeHidden();
  await expect(page.locator(".board-viewport")).toBeVisible();

  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.runtime.teams[0].nodeId === 'n05b'",
  );
  const settled = await savedSession(page);
  expect(settled.gameSession.completedTurns).toBe(1);
  expect(settled.runtime.teams[0].nodeId).toBe("n05b");
  expect(settled.runtime.currentActivity).toBeNull();
  expect(settled.runtime.mapState).toEqual(expect.objectContaining({
    foghornTriggered: true,
    foghornHoldThroughTurn: 2,
  }));
  expect(settled.fairyState).toEqual(expect.objectContaining({
    status: "active",
    anchorId: "n08",
    moveCount: 0,
    lastTransitionRound: 1,
  }));
});

test("pawn reaches n04 before the centered route choice and never replays its approach", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.runtime.teams[snapshot.runtime.activeTeamIndex].nodeId = "n02";
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, SNAPSHOT_KEY);
  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");

  const baseline = await savedSession(page);
  const baselineFingerprint = stableTurnFingerprint(baseline);
  expect(baseline.runtime.teams[0].nodeId).toBe("n02");

  const observationKey = "junction-approach-no-replay";
  await startInsertedElementObservation(page, observationKey, ".step-pawn");
  const routeEventObservationKey = "junction-prefix-event-confirmation";
  await startInsertedElementObservation(
    page,
    routeEventObservationKey,
    ".committed-route-event-banner, .mooring-anchor-banner",
  );

  // Sprint Dice faces are [1, 4, 4, 5, 5, 5]. The same sample also keeps
  // Sprint Dice among the two legal high-score choices.
  await page.evaluate(() => {
    Math.random = () => 0.2;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  ).click();

  const routeStage = page.locator("#route-choice-stage");
  await expect(routeStage).toBeVisible();
  await expect(routeStage).toHaveAttribute(
    "aria-describedby",
    "route-choice-copy route-choice-steps route-choice-note",
  );
  await expect(page.locator("#die-status")).toHaveText("4");
  await expect(page.locator("#route-choice-steps")).toHaveText("还剩 2 格");
  await expect(page.locator(".step-pawn")).toHaveCount(0);
  await expect(page.locator(".pawn.is-active"))
    .toHaveAttribute("data-node-id", "n04");

  const approachSteps = await page.evaluate((key) => (
    window.__universalBoardE2eObservations[key].matches.map(({ dataset }) => ({
      targetNodeId: dataset.targetNodeId,
      stepLabel: dataset.stepLabel,
    }))
  ), observationKey);
  expect(approachSteps).toEqual([
    { targetNodeId: "n03", stepLabel: "1/4 格" },
    { targetNodeId: "n04", stepLabel: "2/4 格" },
  ]);

  // The first two hops are presentation-only. The authoritative turn remains
  // at n02 until a branch has been selected and the full route is committed.
  const pendingChoice = await savedSession(page);
  expect(stableTurnFingerprint(pendingChoice)).toEqual(baselineFingerprint);
  expect(pendingChoice.runtime.teams[0].nodeId).toBe("n02");
  expect(pendingChoice.gameSession.completedTurns).toBe(0);
  expect(pendingChoice.gameSession.processedAttemptIds).toEqual([]);
  expect(pendingChoice.runtime.processedAttemptIds).toEqual([]);
  await expect(page.locator(".team-hud[data-mooring-anchor='held']"))
    .toHaveCount(0);

  const dialogGeometry = await routeStage.evaluate((stage) => {
    const card = stage.querySelector(".route-choice-card");
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(stage);
    return {
      cardCenterX: rect.left + (rect.width / 2),
      cardCenterY: rect.top + (rect.height / 2),
      cardLeft: rect.left,
      cardTop: rect.top,
      cardRight: rect.right,
      cardBottom: rect.bottom,
      viewportCenterX: window.innerWidth / 2,
      viewportCenterY: window.innerHeight / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      position: style.position,
      pointerEvents: style.pointerEvents,
    };
  });
  expect(Math.abs(
    dialogGeometry.cardCenterX - dialogGeometry.viewportCenterX,
  )).toBeLessThanOrEqual(2);
  expect(Math.abs(
    dialogGeometry.cardCenterY - dialogGeometry.viewportCenterY,
  )).toBeLessThanOrEqual(2);
  expect(dialogGeometry).toEqual(expect.objectContaining({
    position: "fixed",
    pointerEvents: "auto",
  }));
  expect(dialogGeometry.cardLeft).toBeGreaterThanOrEqual(0);
  expect(dialogGeometry.cardTop).toBeGreaterThanOrEqual(0);
  expect(dialogGeometry.cardRight).toBeLessThanOrEqual(dialogGeometry.viewportWidth);
  expect(dialogGeometry.cardBottom).toBeLessThanOrEqual(dialogGeometry.viewportHeight);

  const routeOptions = page.locator("#route-options .route-option");
  await expect(routeOptions.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(routeOptions.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(routeOptions.first()).toBeFocused();

  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/project12-branch-choice-centered-at-junction-1440.png",
    ),
  });

  await page.setViewportSize({ width: 375, height: 812 });
  const mobileDialogGeometry = await routeStage.evaluate((stage) => {
    const rect = stage.querySelector(".route-choice-card").getBoundingClientRect();
    return {
      centerX: rect.left + (rect.width / 2),
      centerY: rect.top + (rect.height / 2),
      viewportCenterX: window.innerWidth / 2,
      viewportCenterY: window.innerHeight / 2,
      fullyContained: (
        rect.left >= 0
        && rect.top >= 0
        && rect.right <= window.innerWidth
        && rect.bottom <= window.innerHeight
      ),
    };
  });
  expect(Math.abs(
    mobileDialogGeometry.centerX - mobileDialogGeometry.viewportCenterX,
  )).toBeLessThanOrEqual(2);
  expect(Math.abs(
    mobileDialogGeometry.centerY - mobileDialogGeometry.viewportCenterY,
  )).toBeLessThanOrEqual(2);
  expect(mobileDialogGeometry.fullyContained).toBe(true);
  await page.screenshot({
    path: path.resolve(
      process.cwd(),
      "output/playwright/project12-branch-choice-centered-at-junction-375.png",
    ),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const choice = await inspectAndChooseRoute(page, "e04b");
  expect(choice.selectedEdgeId).toBe("e04b");
  await expect(page.locator(".board-viewport")).toBeFocused();

  await page.waitForFunction((key) => {
    const matches = (
      window.__universalBoardE2eObservations?.[key]?.matches || []
    );
    return (
      matches.some(({ dataset }) => dataset.targetNodeId === "n06b")
      && !document.querySelector(".step-pawn")
    );
  }, observationKey);

  const movement = await stopInsertedElementObservation(page, observationKey);
  expect(movement.matches.map(({ dataset }) => ({
    targetNodeId: dataset.targetNodeId,
    stepLabel: dataset.stepLabel,
  }))).toEqual([
    { targetNodeId: "n03", stepLabel: "1/4 格" },
    { targetNodeId: "n04", stepLabel: "2/4 格" },
    { targetNodeId: "n05b", stepLabel: "3/4 格" },
    { targetNodeId: "n06b", stepLabel: "4/4 格" },
  ]);

  const routeEvent = await finishInsertedElementObservation(
    page,
    routeEventObservationKey,
  );
  expect(routeEvent.matches).toEqual([
    expect.objectContaining({
      className: expect.stringContaining("committed-route-event-banner"),
      text: expect.stringMatching(/获得停靠锚 ×1.*下个回合可用/u),
      dataset: expect.objectContaining({
        routeEventType: "mooring_anchor_granted",
      }),
    }),
  ]);

  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'"
      + " && snapshot.runtime.teams[0].nodeId === 'n06b'",
  );
  expect((await savedSession(page)).runtime.mapState.anchorHeldBySeat["seat-1"])
    .toBe(true);
});

test("cross-world movement reaches the new-world junction before route choice", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.runtime.teams[snapshot.runtime.activeTeamIndex].nodeId = "n48";
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, SNAPSHOT_KEY);
  await page.reload();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");

  const baseline = await savedSession(page);
  const baselineFingerprint = stableTurnFingerprint(baseline);
  const baselineWorld = structuredClone(baseline.runtime.world);
  expect(baseline.runtime.teams[0].nodeId).toBe("n48");

  const observationKey = "cross-world-junction-no-replay";
  await startInsertedElementObservation(
    page,
    observationKey,
    ".step-pawn, .world-portal-transition",
  );
  // Sprint Dice index 5 is a legal 5-step face.
  await page.evaluate(() => {
    Math.random = () => 0.9;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  ).click();

  const routeStage = page.locator("#route-choice-stage");
  await expect(routeStage).toBeVisible();
  await expect(page.locator("#route-choice-title"))
    .toContainText("新世界入口出现两条路");
  await expect(page.locator("#route-choice-steps")).toHaveText("还剩 1 格");
  await expect(page.locator(".pawn.is-active"))
    .toHaveAttribute("data-node-id", "w2n04");
  await expect(page.locator(".step-pawn")).toHaveCount(0);

  const pendingMovement = await page.evaluate((key) => (
    window.__universalBoardE2eObservations[key].matches.map((match) => ({
      className: match.className,
      targetNodeId: match.dataset.targetNodeId || null,
      stepLabel: match.dataset.stepLabel || null,
      fromWorldRef: match.dataset.fromWorldRef || null,
      toWorldRef: match.dataset.toWorldRef || null,
    }))
  ), observationKey);
  expect(pendingMovement).toEqual([
    expect.objectContaining({
      className: expect.stringContaining("step-pawn"),
      targetNodeId: "n49",
      stepLabel: "1/5 格",
    }),
    expect.objectContaining({
      className: expect.stringContaining("world-portal-transition"),
      fromWorldRef: expect.stringContaining("cloud-harbor"),
      toWorldRef: expect.stringContaining("beyond-cloud"),
    }),
    expect.objectContaining({
      className: expect.stringContaining("step-pawn"),
      targetNodeId: "w2n02",
      stepLabel: "2/5 格",
    }),
    expect.objectContaining({
      className: expect.stringContaining("step-pawn"),
      targetNodeId: "w2n03",
      stepLabel: "3/5 格",
    }),
    expect.objectContaining({
      className: expect.stringContaining("step-pawn"),
      targetNodeId: "w2n04",
      stepLabel: "4/5 格",
    }),
  ]);

  const pendingChoice = await savedSession(page);
  expect(stableTurnFingerprint(pendingChoice)).toEqual(baselineFingerprint);
  expect(pendingChoice.runtime.world).toEqual(baselineWorld);
  expect(pendingChoice.runtime.teams[0].nodeId).toBe("n48");
  expect(pendingChoice.gameSession.completedTurns).toBe(0);
  expect(pendingChoice.runtime.acceptedCount).toBe(0);
  expect(pendingChoice.runtime.world.processedTransitionIds).toEqual([]);

  const routeChoice = await inspectAndChooseRoute(page, "w2e04b");
  expect(routeChoice.selectedEdgeId).toBe("w2e04b");
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'"
      + " && snapshot.runtime.teams[0].nodeId === 'w2n05b'",
  );

  const movement = await stopInsertedElementObservation(page, observationKey);
  const stepSequence = movement.matches
    .filter(({ className }) => className.includes("step-pawn"))
    .map(({ dataset }) => ({
      targetNodeId: dataset.targetNodeId,
      stepLabel: dataset.stepLabel,
    }));
  expect(stepSequence).toEqual([
    { targetNodeId: "n49", stepLabel: "1/5 格" },
    { targetNodeId: "w2n02", stepLabel: "2/5 格" },
    { targetNodeId: "w2n03", stepLabel: "3/5 格" },
    { targetNodeId: "w2n04", stepLabel: "4/5 格" },
    { targetNodeId: "w2n05b", stepLabel: "5/5 格" },
  ]);
  expect(movement.matches.filter(({ className }) => (
    className.includes("world-portal-transition")
  ))).toHaveLength(1);

  const settled = await savedSession(page);
  expect(settled.runtime.world.active.worldPackRef).toContain("beyond-cloud");
  expect(settled.runtime.world.processedTransitionIds).toHaveLength(1);
  expect(settled.runtime.teams[0].nodeId).toBe("w2n05b");
  expect(settled.gameSession.completedTurns).toBe(1);
});

test("a held mooring anchor waits for the junction and offers an explicit centered retain-or-use decision", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    const team = snapshot.runtime.teams[snapshot.runtime.activeTeamIndex];
    team.nodeId = "n09";
    snapshot.runtime.mapState.anchorGrantedBySeat["seat-1"] = true;
    snapshot.runtime.mapState.anchorHeldBySeat["seat-1"] = true;
    snapshot.runtime.world.active.mapState = structuredClone(
      snapshot.runtime.mapState,
    );
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, SNAPSHOT_KEY);
  await page.reload();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");

  const baseline = await savedSession(page);
  const baselineFingerprint = stableTurnFingerprint(baseline);
  const observationKey = "held-anchor-junction-no-replay";
  await startInsertedElementObservation(page, observationKey, ".step-pawn");
  await page.evaluate(() => {
    Math.random = () => 0.2;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  ).click();

  await expect(page.locator("#route-choice-stage")).toBeVisible();
  await expect(page.locator("#mooring-choice-stage")).toBeHidden();
  await expect(page.locator(".pawn.is-active"))
    .toHaveAttribute("data-node-id", "n10");
  const atJunction = await page.evaluate((key) => (
    window.__universalBoardE2eObservations[key].matches.map(({ dataset }) => ({
      targetNodeId: dataset.targetNodeId,
      stepLabel: dataset.stepLabel,
    }))
  ), observationKey);
  expect(atJunction).toEqual([
    { targetNodeId: "n10", stepLabel: "1/4 格" },
  ]);
  expect(stableTurnFingerprint(await savedSession(page)))
    .toEqual(baselineFingerprint);

  await inspectAndChooseRoute(page, "e10b");
  const mooringStage = page.locator("#mooring-choice-stage");
  const mooringKeep = page.locator("#mooring-keep");
  const mooringOptions = page.locator("#mooring-options .mooring-option");
  await expect(mooringStage).toBeVisible();
  await expect(mooringStage).toHaveAttribute(
    "aria-describedby",
    "mooring-choice-copy mooring-choice-note",
  );
  expect(await mooringStage.getAttribute("aria-live")).toBeNull();
  await expect(page.locator("#mooring-choice-timer")).toHaveText("停靠锚 ×1");
  await expect(page.locator("#mooring-choice-copy"))
    .toContainText("不会重摇或修改骰点");
  await expect(mooringKeep).toBeFocused();

  const modalGeometry = await mooringStage.evaluate((stage) => {
    const card = stage.querySelector(".mooring-choice-card");
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(stage);
    return {
      centerX: rect.left + (rect.width / 2),
      centerY: rect.top + (rect.height / 2),
      viewportCenterX: window.innerWidth / 2,
      viewportCenterY: window.innerHeight / 2,
      position: style.position,
      backdropFilter: style.backdropFilter,
      webkitBackdropFilter: style.webkitBackdropFilter,
      fullyContained: (
        rect.left >= 0
        && rect.top >= 0
        && rect.right <= window.innerWidth
        && rect.bottom <= window.innerHeight
      ),
    };
  });
  expect(Math.abs(modalGeometry.centerX - modalGeometry.viewportCenterX))
    .toBeLessThanOrEqual(2);
  expect(Math.abs(modalGeometry.centerY - modalGeometry.viewportCenterY))
    .toBeLessThanOrEqual(2);
  expect(modalGeometry).toEqual(expect.objectContaining({
    position: "fixed",
    backdropFilter: "none",
    fullyContained: true,
  }));
  expect(["", "none", undefined]).toContain(modalGeometry.webkitBackdropFilter);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(mooringKeep).toBeFocused();
  await expect(mooringKeep).toBeInViewport();
  const compactMooringLayout = await page.evaluate(() => {
    const card = document.querySelector(".mooring-choice-card");
    const scroll = document.querySelector(".mooring-choice-scroll");
    const keep = document.querySelector("#mooring-keep");
    const cardRect = card.getBoundingClientRect();
    const keepRect = keep.getBoundingClientRect();
    return {
      cardContained: (
        cardRect.top >= 0
        && cardRect.bottom <= window.innerHeight
      ),
      keepVisible: (
        keepRect.top >= cardRect.top
        && keepRect.bottom <= cardRect.bottom
        && keepRect.bottom <= window.innerHeight
      ),
      optionsOwnScroll: getComputedStyle(scroll).overflowY === "auto",
      cardDoesNotScroll: getComputedStyle(card).overflowY === "hidden",
    };
  });
  expect(compactMooringLayout).toEqual({
    cardContained: true,
    keepVisible: true,
    optionsOwnScroll: true,
    cardDoesNotScroll: true,
  });

  expect(await mooringOptions.count()).toBeGreaterThan(0);
  const optionSemantics = await mooringOptions.evaluateAll((options) => (
    options.map((option) => {
      const node = document.querySelector(
        `.board-space[data-node-id="${option.dataset.nodeId}"]`,
      );
      return {
        nodeId: option.dataset.nodeId,
        outcomeKind: option.dataset.outcomeKind,
        outcomeTrigger: option.dataset.outcomeTrigger,
        boardOutcomeKind: node?.dataset.outcomeKind,
        boardOutcomeTrigger: node?.dataset.outcomeTrigger,
        boardOutcomeLabel: node?.dataset.outcomeLabel,
        text: option.textContent?.trim() || "",
        ariaLabel: option.getAttribute("aria-label") || "",
      };
    })
  ));
  expect(optionSemantics.every((option) => (
    option.outcomeKind === option.boardOutcomeKind
    && option.outcomeTrigger === option.boardOutcomeTrigger
    && option.text.includes(`终点结果：`)
    && option.text.includes(option.boardOutcomeLabel)
    && option.text.includes("消耗停靠锚 ×1")
    && option.ariaLabel.includes("消耗停靠锚")
    && option.ariaLabel.includes(option.boardOutcomeLabel)
  ))).toBe(true);
  await expect(page.locator(".board-space.is-mooring-candidate"))
    .toHaveCount(optionSemantics.length);
  await expect(page.locator(".mooring-candidate-marker-label"))
    .toHaveText(Array.from({ length: optionSemantics.length }, () => "停"));

  // The old interaction silently chose after three seconds. A real tool
  // decision now remains open and keeps the authoritative turn untouched.
  await page.waitForTimeout(3_200);
  await expect(mooringStage).toBeVisible();
  await expect(page.locator("#mooring-choice-timer")).toHaveText("停靠锚 ×1");
  expect(stableTurnFingerprint(await savedSession(page)))
    .toEqual(baselineFingerprint);

  await page.keyboard.press("Tab");
  await expect(mooringOptions.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(mooringKeep).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mooringStage).toBeHidden();
  await expect(page.locator(".board-viewport")).toBeFocused();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'"
      + " && snapshot.runtime.teams[0].nodeId === 'n13b'",
  );

  const movement = await stopInsertedElementObservation(page, observationKey);
  expect(movement.matches.map(({ dataset }) => ({
    targetNodeId: dataset.targetNodeId,
    stepLabel: dataset.stepLabel,
  }))).toEqual([
    { targetNodeId: "n10", stepLabel: "1/4 格" },
    { targetNodeId: "n11b", stepLabel: "2/4 格" },
    { targetNodeId: "n12b", stepLabel: "3/4 格" },
    { targetNodeId: "n13b", stepLabel: "4/4 格" },
  ]);
  const settled = await savedSession(page);
  expect(settled.runtime.mapState.anchorHeldBySeat["seat-1"]).toBe(true);
});

test("a mooring anchor can safely lock an earlier previewed stop after route choice", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");
  await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.runtime.teams[0].nodeId = "n08";
    snapshot.runtime.mapState.anchorGrantedBySeat["seat-1"] = true;
    snapshot.runtime.mapState.anchorHeldBySeat["seat-1"] = true;
    snapshot.runtime.world.active.mapState = structuredClone(
      snapshot.runtime.mapState,
    );
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, SNAPSHOT_KEY);
  await page.reload();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");

  const stepObservationKey = "anchor-preview-recall-steps";
  await startInsertedElementObservation(page, stepObservationKey, ".step-pawn");
  const anchorObservationKey = "anchor-preview-recall-effect";
  await startInsertedElementObservation(
    page,
    anchorObservationKey,
    ".mooring-anchor-banner",
  );
  await page.evaluate(() => {
    Math.random = () => 0.2;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  ).click();
  await expect(page.locator("#route-choice-stage")).toBeVisible();
  await expect(page.locator(".pawn.is-active"))
    .toHaveAttribute("data-node-id", "n10");
  await inspectAndChooseRoute(page, "e10b");
  await expect(page.locator("#mooring-choice-stage")).toBeVisible();
  const n09Stop = page.locator(".mooring-option[data-node-id='n09']");
  await expect(n09Stop).toHaveAttribute("data-outcome-kind", "ordinary");
  await expect(n09Stop).toHaveAttribute("data-outcome-trigger", "none");
  await expect(n09Stop).toContainText("终点结果：普通格 · 无额外效果");
  await expect(n09Stop).toContainText("消耗停靠锚 ×1");
  await expect(n09Stop).toHaveAttribute(
    "aria-label",
    /消耗停靠锚.*终点结果：普通格，无额外效果/u,
  );
  await n09Stop.click();
  await expect(page.locator("#mooring-choice-stage")).toBeHidden();
  await expect(page.locator(".board-viewport")).toBeFocused();

  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'"
      + " && snapshot.runtime.teams[0].nodeId === 'n09'",
  );
  const steps = await stopInsertedElementObservation(page, stepObservationKey);
  expect(steps.matches.map(({ dataset }) => dataset.targetNodeId))
    .toEqual(["n09", "n10"]);
  const anchorEffect = await finishInsertedElementObservation(
    page,
    anchorObservationKey,
  );
  expect(anchorEffect.matches).toHaveLength(1);
  expect(anchorEffect.matches[0].text).toContain("道具已使用");
  expect(anchorEffect.matches[0].text).toContain("已消耗停靠锚");
  expect(anchorEffect.matches[0].text).toContain("本回合终点已改选");
  expect(anchorEffect.matches[0].text).toContain("骰点没有重摇或修改");
  const settled = await savedSession(page);
  expect(settled.runtime.mapState.anchorHeldBySeat["seat-1"]).toBeUndefined();
  expect(settled.runtime.teams[0].nodeId).toBe("n09");
});

test("n18 stays quiet on landing and only lights the departure beacon on the committed next edge", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.runtime.teams[0].nodeId = "n17";
    snapshot.runtime.mapState.anchorGrantedBySeat["seat-1"] = true;
    snapshot.runtime.mapState.anchorHeldBySeat["seat-1"] = true;
    snapshot.runtime.world.active.mapState = structuredClone(
      snapshot.runtime.mapState,
    );
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, SNAPSHOT_KEY);
  await page.reload();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");

  const n18 = page.locator(".board-space[data-node-id='n18']");
  await expect(n18).toHaveAttribute("data-outcome-trigger", "next-edge-pass");
  await expect(n18).toHaveAttribute("data-outcome-label", "停在本格不触发");
  await expect(n18.locator(".node-effect-badge")).toHaveText("下一步·离港");

  const landingObservationKey = "n18-landing-must-not-depart";
  await startInsertedElementObservation(
    page,
    landingObservationKey,
    ".departure-beacon-banner, .mooring-anchor-banner",
  );
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  ).click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'"
      + " && snapshot.runtime.teams[0].nodeId === 'n18'",
  );
  const landingPresentation = await stopInsertedElementObservation(
    page,
    landingObservationKey,
  );
  expect(landingPresentation.seen).toBe(false);
  const stoppedAtBoundary = await savedSession(page);
  expect(stoppedAtBoundary.runtime.mapState.departureBeaconLit).toBe(false);
  expect(stoppedAtBoundary.runtime.mapState.regionExitSeenBySeat).toEqual({});
  expect(stoppedAtBoundary.runtime.mapState.anchorHeldBySeat["seat-1"])
    .toBe(true);

  await waitForTurnReady(page, "Mia");
  const crossingObservationKey = "n18-next-edge-departure";
  await startInsertedElementObservation(
    page,
    crossingObservationKey,
    ".departure-beacon-banner, .mooring-anchor-banner",
  );
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  ).click();
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 2"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'"
      + " && snapshot.runtime.teams[0].nodeId === 'n19'",
  );

  const crossingPresentation = await stopInsertedElementObservation(
    page,
    crossingObservationKey,
  );
  expect(crossingPresentation.matches).toEqual(expect.arrayContaining([
    expect.objectContaining({
      className: expect.stringContaining("departure-beacon-banner"),
      text: expect.stringContaining("点亮远航灯塔"),
    }),
    expect.objectContaining({
      className: expect.stringContaining("mooring-anchor-banner"),
      text: expect.stringContaining("未使用停靠锚已归还港口"),
    }),
  ]));
  const crossedBoundary = await savedSession(page);
  expect(crossedBoundary.runtime.mapState.departureBeaconLit).toBe(true);
  expect(crossedBoundary.runtime.mapState.regionExitSeenBySeat["seat-1"])
    .toBe(true);
  expect(crossedBoundary.runtime.mapState.anchorHeldBySeat["seat-1"])
    .toBeUndefined();
});

test("refresh during dice choice or route choice restores the stable turn once", async ({
  page,
}) => {
  await page.goto(GAME_PATH);
  await page.locator("#setup-player-count").selectOption("1");
  await chooseUniqueCharacters(page, 1);
  await page.locator("#start-session").click();
  await waitForTurnReady(page, "Mia");

  const initial = await savedSession(page);
  const initialFingerprint = stableTurnFingerprint(initial);
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  expect(stableTurnFingerprint(await savedSession(page))).toEqual(initialFingerprint);

  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");
  const afterDiceRefresh = await savedSession(page);
  expect(stableTurnFingerprint(afterDiceRefresh)).toEqual(initialFingerprint);
  await expect(page.locator("#dice-choice-stage")).toBeHidden();
  await expect(page.locator("#route-choice-stage")).toBeHidden();

  // Put the saved, still-uncommitted turn directly on a junction. This modifies
  // only the test browser's snapshot and lets the next refresh exercise the
  // route-choice boundary without adding a production QA hook.
  await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey));
    snapshot.runtime.teams[snapshot.runtime.activeTeamIndex].nodeId = "n04";
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, SNAPSHOT_KEY);
  await page.reload();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");
  const routeBaseline = await savedSession(page);
  const routeBaselineFingerprint = stableTurnFingerprint(routeBaseline);

  await page.evaluate(() => {
    const samples = [0, 0, 0];
    Math.random = () => samples.shift() ?? 0;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  const sprintDie = page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  );
  await expect(sprintDie).toBeVisible();
  await sprintDie.click();
  await expect(page.locator("#route-choice-stage")).toBeVisible();
  await expect(page.locator("#route-options .route-option")).toHaveCount(2);
  expect(stableTurnFingerprint(await savedSession(page)))
    .toEqual(routeBaselineFingerprint);

  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await waitForTurnReady(page, "Mia");
  const restored = await savedSession(page);
  expect(stableTurnFingerprint(restored)).toEqual(routeBaselineFingerprint);
  expect(restored.gameSession.completedTurns).toBe(0);
  expect(restored.runtime.acceptedCount).toBe(0);
  expect(restored.playerAssetsLedger.acceptedTurnsTotal).toBe(0);
  expect(restored.playerAssetsLedger.processedSettlementIds).toEqual([]);
  expect(restored.gameSession.processedAttemptIds).toEqual([]);
  expect(restored.runtime.processedAttemptIds).toEqual([]);
  await expect(page.locator("#dice-choice-stage")).toBeHidden();
  await expect(page.locator("#route-choice-stage")).toBeHidden();

  // Complete the restored turn once to prove the abandoned presentations did
  // not duplicate the attempt or alter any personal account.
  await page.evaluate(() => {
    const samples = [0, 0, 0];
    Math.random = () => samples.shift() ?? 0;
  });
  await submitQaAssessment(page);
  await expect(page.locator("#dice-choice-stage")).toBeVisible();
  await page.locator(
    "#dice-options .dice-option[data-dice-option-id='sprint']",
  ).click();
  await expect(page.locator("#route-choice-stage")).toBeVisible();
  await inspectAndChooseRoute(page, "e04a");
  await waitForSavedSession(
    page,
    "(snapshot) => snapshot.gameSession.completedTurns === 1"
      + " && snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.inputGate === 'open'",
  );
  const completed = await savedSession(page);
  expect(completed.gameSession.completedTurns).toBe(1);
  expect(completed.runtime.acceptedCount).toBe(1);
  expect(completed.playerAssetsLedger.acceptedTurnsTotal).toBe(1);
  expect(completed.playerAssetsLedger.processedSettlementIds).toHaveLength(1);
  expect(completed.gameSession.processedAttemptIds).toHaveLength(1);
  expect(completed.runtime.processedAttemptIds).toHaveLength(1);
  expect(completed.runtime.teams[0].nodeId).toBe("n05a");
  await writeFile(
    path.resolve(
      process.cwd(),
      "output/playwright/universal-board-e2e/pending-refresh-recovery.json",
    ),
    `${JSON.stringify({
      scenario: "refresh-during-dice-and-route-choice",
      initial: initialFingerprint,
      afterDiceRefresh: stableTurnFingerprint(afterDiceRefresh),
      routeBaseline: routeBaselineFingerprint,
      restoredRoute: stableTurnFingerprint(restored),
      completedOnce: {
        completedTurns: completed.gameSession.completedTurns,
        acceptedCount: completed.runtime.acceptedCount,
        personalLedgerAcceptedTurns: completed.playerAssetsLedger.acceptedTurnsTotal,
        sessionAttemptCount: completed.gameSession.processedAttemptIds.length,
        runtimeAttemptCount: completed.runtime.processedAttemptIds.length,
        nodeId: completed.runtime.teams[0].nodeId,
      },
    }, null, 2)}\n`,
  );
});

test("four players complete all 12 card-hunt turns, restore, boss and results", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const consoleProblems = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleProblems.push(`pageerror: ${error.message}`);
  });
  await page.addInitScript(() => {
    const forcedSamples = [0, 0, 0.999];
    let seed = 0x5eed1234;
    Math.random = () => {
      if (forcedSamples.length) return forcedSamples.shift();
      seed = ((seed * 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
  });
  await page.goto(GAME_PATH);
  await disableBoardSoundsForHeadlessRun(page);
  await page.locator("#setup-player-count").selectOption("4");
  await chooseUniqueCharacters(page, 4);

  const showtimeVisible = page.evaluate(() => new Promise((resolve) => {
    const showtime = document.querySelector("#turn-showtime");
    if (!showtime?.hidden) {
      resolve(true);
      return;
    }
    const observer = new MutationObserver(() => {
      if (showtime.hidden) return;
      observer.disconnect();
      resolve(true);
    });
    observer.observe(showtime, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }));
  await page.locator("#start-session").click();
  expect(await showtimeVisible).toBe(true);
  await expect(page.locator("#showtime-name")).toHaveText("Mia");
  const initial = await savedSession(page);
  expect(initial.gameSession.completedTurns).toBe(0);
  expect(initial.runtime.teams).toHaveLength(4);
  expect(initial.runtime.teams.every((playerState) => playerState.members.length === 1))
    .toBe(true);
  await expect(page.locator("[data-entity-kind='player-summary']")).toHaveCount(4);
  // Each child appears once on the main board and once on the minimap.
  await expect(page.locator("[data-entity-kind='player-pawn']")).toHaveCount(8);
  await expect(page.locator("[data-entity-kind='team-summary']")).toHaveCount(0);
  expect(initial.fairyState.status).toBe("active");
  expect(initial.fairyState.cardCase.cardId).toBeTruthy();
  await expect(page.locator("[data-entity-kind='fairy']")).toHaveCount(1);

  const stateHistory = [];
  for (let turn = 1; turn <= 12; turn += 1) {
    const turnResult = await playHighScoreTurn(page, turn);
    const { state } = turnResult;
    const personalAccounts = Object.values(
      state.playerAssetsLedger.playerAssetsById,
    );
    const collectedCardIds = personalAccounts.flatMap(
      (account) => account.collectedCardIds,
    );
    stateHistory.push({
      turn,
      actor: PLAYER_NAMES[(turn - 1) % PLAYER_NAMES.length],
      score: 92,
      diceOptions: turnResult.optionIds,
      routeChoice: turnResult.routeChoice,
      mooringDecision: turnResult.mooringDecision,
      activityCompleted: turnResult.activityCompleted,
      observedPawnSteps: turnResult.stepObservation.matches.map(({ dataset }) => ({
        teamId: dataset.teamId,
        targetNodeId: dataset.targetNodeId,
        stepLabel: dataset.stepLabel,
      })),
      phase: state.gameSession.phase,
      playerAssetsById: state.playerAssetsLedger.playerAssetsById,
      cards: collectedCardIds.length,
      fairy: state.fairyState.status,
      die: state.lastDicePresentation,
    });

    expect(state.playerAssetsLedger.acceptedTurnsTotal).toBe(turn);
    expect(personalAccounts.reduce(
      (total, account) => total + account.acceptedTurns,
      0,
    )).toBe(turn);
    expect(personalAccounts.every((account) => account.coins < 3)).toBe(true);
    expect(personalAccounts.every((account) => account.stars < 3)).toBe(true);
    expect(state.runtime.teams.every((team) => team.coins === 0)).toBe(true);
    if (turn % 4 === 0) {
      expect(collectedCardIds.length).toBeGreaterThanOrEqual(turn / 4);
    }
    expect(new Set(collectedCardIds).size).toBe(collectedCardIds.length);

    if (turn === 1) {
      expect(state.lastDicePresentation.poolId).toBe("treasure");
      expect(state.lastDicePresentation.faceLabel).toContain("卡卡精灵");
    }

    if (turn === 6) {
      const beforeRefresh = {
        completedTurns: state.gameSession.completedTurns,
        activeSeatIndex: state.gameSession.activeSeatIndex,
        playerAssetsLedger: state.playerAssetsLedger,
        fairy: state.fairyState,
        teamNodes: state.runtime.teams.map((team) => team.nodeId),
        characters: state.characterAssignments,
      };
      await page.reload();
      await expect(page.locator("#setup-stage")).toBeVisible();
      await expect(page.locator("#resume-session")).toBeVisible();
      await page.locator("#resume-session").click();
      const restored = await savedSession(page);
      expect({
        completedTurns: restored.gameSession.completedTurns,
        activeSeatIndex: restored.gameSession.activeSeatIndex,
        playerAssetsLedger: restored.playerAssetsLedger,
        fairy: restored.fairyState,
        teamNodes: restored.runtime.teams.map((team) => team.nodeId),
        characters: restored.characterAssignments,
      }).toEqual(beforeRefresh);
      await waitForTurnReady(page, "Ava");
    }
  }

  const bossSnapshot = await savedSession(page);
  expect(bossSnapshot.gameSession.phase).toBe("BOSS_READY");
  expect(bossSnapshot.gameSession.completedTurns).toBe(12);
  expect(bossSnapshot.gameSession.seats.map((seat) => seat.opportunityCount))
    .toEqual([3, 3, 3, 3]);
  const bossCollectedCardIds = Object.values(
    bossSnapshot.playerAssetsLedger.playerAssetsById,
  ).flatMap((account) => account.collectedCardIds);
  expect(bossCollectedCardIds.length).toBeGreaterThanOrEqual(3);
  expect(new Set(bossCollectedCardIds).size).toBe(bossCollectedCardIds.length);
  expect(new Set(stateHistory.map((state) => state.die.poolId)).size).toBeGreaterThan(1);
  expect(stateHistory.some((state) => state.fairy !== "active")).toBe(true);
  expect(stateHistory.every((state) => state.observedPawnSteps.length >= 1)).toBe(true);
  expect(stateHistory.some((state) => state.routeChoice?.selectedEdgeId)).toBe(true);
  expect(stateHistory.some((state) => state.mooringDecision === "retained"))
    .toBe(true);
  await expect(page.locator("#boss-stage")).toBeVisible();
  await expect(page.locator("#boss-progress")).toContainText("12 次任务");

  await page.locator("#complete-boss").click();
  await expect(page.locator("#results-stage")).toBeVisible();
  await expect(page.locator("#results-title")).toHaveText("本章远征完成！");
  await expect(page.locator("#results-team-list .result-player-card"))
    .toHaveCount(bossCollectedCardIds.length);
  await expect(page.locator("#results-team-list .result-team")).toHaveCount(4);
  await expect(page.locator("#results-card-album, .results-stars")).toHaveCount(0);
  const seatRows = page.locator("#results-seat-list .result-seat");
  await expect(seatRows).toHaveCount(4);
  for (const name of PLAYER_NAMES) {
    await expect(seatRows.filter({ hasText: name })).toContainText("发言 3 次");
  }

  const screenshotPath = path.resolve(
    process.cwd(),
    "output/playwright/universal-board-e2e/full-12-round-results.png",
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await page.reload();
  await expect(page.locator("#resume-session")).toBeVisible();
  await page.locator("#resume-session").click();
  await expect(page.locator("#results-stage")).toBeVisible();
  const restoredResult = await savedSession(page);
  expect(restoredResult.gameSession.phase).toBe("COMPLETED");
  expect(restoredResult.gameSession.completedTurns).toBe(12);
  expect(restoredResult.playerAssetsLedger)
    .toEqual(bossSnapshot.playerAssetsLedger);
  const continuedProgress = {
    sessionId: restoredResult.gameSession.sessionId,
    world: restoredResult.runtime.world,
    teamNodes: restoredResult.runtime.teams.map((team) => team.nodeId),
    playerAssetsLedger: restoredResult.playerAssetsLedger,
    fairyState: restoredResult.fairyState,
  };
  await page.locator("#replay-session").click();
  await waitForSavedSession(
    page,
    "(snapshot, previousSessionId) => snapshot.gameSession.phase === 'ANSWER_LISTENING'"
      + " && snapshot.gameSession.completedTurns === 0"
      + " && snapshot.gameSession.sessionId !== previousSessionId",
    continuedProgress.sessionId,
  );
  const continuedChapter = await savedSession(page);
  expect(continuedChapter.gameSession.screen).toBe("PLAYING");
  expect(continuedChapter.gameSession.completedTurns).toBe(0);
  expect(continuedChapter.gameSession.sessionId).not.toBe(continuedProgress.sessionId);
  expect(continuedChapter.runtime.world).toEqual(continuedProgress.world);
  expect(continuedChapter.runtime.teams.map((team) => team.nodeId))
    .toEqual(continuedProgress.teamNodes);
  expect(continuedChapter.playerAssetsLedger)
    .toEqual(continuedProgress.playerAssetsLedger);
  expect(continuedChapter.fairyState).toEqual(continuedProgress.fairyState);
  await waitForTurnReady(page, "Mia");
  const evidencePath = path.resolve(
    process.cwd(),
    "output/playwright/universal-board-e2e/full-12-round-state.json",
  );
  await writeFile(evidencePath, `${JSON.stringify({
    scenario: "four-player-12-turn-card-hunt",
    configuration: {
      playerCount: 4,
      playerStateCount: 4,
      minTotalTurns: 12,
      minOpportunitiesPerSeat: 2,
    },
    turns: stateHistory,
    boss: {
      phase: bossSnapshot.gameSession.phase,
      completedTurns: bossSnapshot.gameSession.completedTurns,
      seatOpportunities: bossSnapshot.gameSession.seats.map((seat) => ({
        id: seat.id,
        displayName: seat.displayName,
        opportunityCount: seat.opportunityCount,
      })),
      playerAssetsById: bossSnapshot.playerAssetsLedger.playerAssetsById,
      collectedCardIds: bossCollectedCardIds,
    },
    result: {
      phase: restoredResult.gameSession.phase,
      restoredAfterRefresh: true,
      completedTurns: restoredResult.gameSession.completedTurns,
      playerAssetsById: restoredResult.playerAssetsLedger.playerAssetsById,
      collectedCardIds: Object.values(
        restoredResult.playerAssetsLedger.playerAssetsById,
      ).flatMap((account) => account.collectedCardIds),
      consoleProblems,
    },
    continuedChapter: {
      phase: continuedChapter.gameSession.phase,
      completedTurns: continuedChapter.gameSession.completedTurns,
      preservedWorld: continuedChapter.runtime.world,
      preservedTeamNodes: continuedChapter.runtime.teams.map((team) => team.nodeId),
      preservedPlayerAssets: continuedChapter.playerAssetsLedger,
      preservedFairyState: continuedChapter.fairyState,
    },
  }, null, 2)}\n`);
  expect(consoleProblems).toEqual([]);
});
