import test from "node:test";
import assert from "node:assert/strict";

import {
  FAIRY_STATUS,
  TREASURE_DICE_POOLS,
  advanceFairyRound,
  captureFairy,
  createFairyState,
  createTreasureState,
  generateLegendaryDiceOptions,
  holdFairyForRound,
  rollLegendaryDie,
  selectTreasureCardCase,
  settleTreasureTurn,
  spawnFairy,
  treasureGoalsForTurns,
} from "../public/prototypes/universal-board/treasure-core.js";

const FIRST_CASE = Object.freeze({
  id: "case.cowboy.departure.1",
  cardId: "card.cowboy.departure.1",
});

test("accepted answers record progress but never add coins automatically", () => {
  let state = createTreasureState();
  for (let turn = 1; turn <= 4; turn += 1) {
    state = settleTreasureTurn(state, { acceptedAnswer: true }).state;
  }

  assert.equal(state.scope, "class");
  assert.equal(state.acceptedTurns, 4);
  assert.equal(state.coins, 0);
  assert.equal("gems" in state, false);
  assert.equal("keys" in state, false);
  assert.equal("waitingCase" in state, false);
  assert.equal("teams" in state, false);
});

test("five coins stay coins until an explicit exchange opens one card box", () => {
  const reachedFive = settleTreasureTurn(createTreasureState({ coins: 5 }), {
    acceptedAnswer: true,
  });
  assert.equal(reachedFive.state.coins, 5);
  assert.equal(reachedFive.openedCardId, null);

  const result = settleTreasureTurn(reachedFive.state, {
    exchangeCoinsForCard: true,
    cardCatalogIds: [FIRST_CASE.cardId, "card.friend.2"],
    random: () => 0,
  });
  assert.equal(result.exchangeCompleted, true);
  assert.equal(result.state.coins, 0);
  assert.deepEqual(result.state.collectedCardIds, [FIRST_CASE.cardId]);
  assert.equal(result.openedCardId, FIRST_CASE.cardId);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "resource_exchanged",
      "card_awarded",
      "card_awarded",
    ],
  );
  assert.throws(
    () => settleTreasureTurn(result.state, {
      exchangeCoinsForCard: true,
      cardCatalogIds: [FIRST_CASE.cardId],
    }),
    /five coins are required/,
  );
});

test("every awarded card box opens a card immediately", () => {
  const direct = settleTreasureTurn(createTreasureState(), {
    bonusCardCases: 1,
    foundCase: FIRST_CASE,
    cardCatalogIds: [FIRST_CASE.cardId],
  });
  assert.equal(direct.openedCardId, FIRST_CASE.cardId);
  assert.equal(direct.openedCardDuplicate, false);
  assert.deepEqual(direct.state.cardCountsById, {
    [FIRST_CASE.cardId]: 1,
  });
  assert.deepEqual(direct.events.map(({ type }) => type), [
    "card_awarded",
    "card_awarded",
  ]);

  assert.throws(
    () => settleTreasureTurn(createTreasureState(), { bonusCardCases: 1 }),
    /every card must resolve to one card/,
  );
});

test("duplicates are counted and two consecutive duplicates trigger the next-box guarantee", () => {
  const catalog = [FIRST_CASE.cardId, "card.friend.2", "card.friend.3"];
  let state = createTreasureState();
  const open = (foundCase, random = () => 0) => {
    const result = settleTreasureTurn(state, {
      bonusCardCases: 1,
      foundCase,
      cardCatalogIds: catalog,
      random,
    });
    state = result.state;
    return result;
  };

  assert.equal(open(FIRST_CASE).openedCardDuplicate, false);
  assert.equal(open(FIRST_CASE).openedCardDuplicate, true);
  assert.equal(open(FIRST_CASE).openedCardDuplicate, true);
  assert.equal(state.duplicateOpenStreak, 2);
  assert.equal(state.cardCountsById[FIRST_CASE.cardId], 3);

  const guaranteed = open(FIRST_CASE, () => 0);
  assert.equal(guaranteed.guaranteedNewCard, true);
  assert.equal(guaranteed.openedCardDuplicate, false);
  assert.equal(guaranteed.openedCardId, "card.friend.2");
  assert.equal(state.duplicateOpenStreak, 0);
  assert.deepEqual(state.collectedCardIds, [FIRST_CASE.cardId, "card.friend.2"]);

  const selection = selectTreasureCardCase({
    collectedCardIds: [FIRST_CASE.cardId],
    duplicateOpenStreak: 2,
  }, catalog, () => 0.999);
  assert.equal(selection.guaranteedNew, true);
  assert.equal(selection.cardCase.cardId, "card.friend.3");
});

test("treasure card selection uses the supplied dynamic catalog without rarity tiers", () => {
  const dynamicCatalog = Array.from({ length: 137 }, (_, index) => `card.dynamic.${index + 1}`);
  const selection = selectTreasureCardCase({}, dynamicCatalog, () => 0.999999);

  assert.equal(selection.cardCase.cardId, "card.dynamic.137");
  assert.equal(selection.guaranteedNew, false);
  assert.equal("rarity" in selection.cardCase, false);
});

test("the settlement API rejects penalties and does not reward invalid answers", () => {
  const initial = createTreasureState({ coins: 2 });
  const ignored = settleTreasureTurn(initial, { acceptedAnswer: false });
  assert.deepEqual(ignored.state, initial);
  assert.deepEqual(ignored.events, []);

  assert.throws(
    () => settleTreasureTurn(initial, { bonusCoins: -1 }),
    /bonusCoins must be a non-negative integer/,
  );
  assert.throws(
    () => settleTreasureTurn(initial, { bonusCardCases: 2 }),
    /bonusCardCases must be 0 or 1/,
  );
});

test("highest tier offers two different dice from the three approved pools", () => {
  const samples = [0.8, 0.1];
  const options = generateLegendaryDiceOptions({
    random: () => samples.shift(),
  });

  assert.equal(options.length, 2);
  assert.equal(new Set(options.map((option) => option.id)).size, 2);
  assert.equal(
    options.every((option) => ["steady", "sprint", "treasure"].includes(option.id)),
    true,
  );
  assert.deepEqual(
    TREASURE_DICE_POOLS.steady.faces.map((face) => face.steps),
    [2, 2, 3, 3, 3, 4],
  );
  assert.deepEqual(
    TREASURE_DICE_POOLS.sprint.faces.map((face) => face.steps),
    [3, 3, 3, 4, 4, 5],
  );
  assert.deepEqual(
    TREASURE_DICE_POOLS.treasure.faces.map((face) => face.steps),
    [3, 3, 3, 4, 4, 4],
  );
  assert.equal(
    TREASURE_DICE_POOLS.treasure.faces.every((face) => (
      face.bonus.coins > 0 || face.bonus.cards === 1
    )),
    true,
  );
  assert.equal(Object.isFrozen(TREASURE_DICE_POOLS.treasure.faces[4].bonus), true);
});

test("treasure die moves three or four spaces and always adds an approved reward", () => {
  const coins = rollLegendaryDie("treasure", () => 0.7);
  assert.equal(coins.steps, 4);
  assert.equal(coins.bonus.coins, 2);
  assert.equal(coins.face.label, "4 + 两枚金币");

  const cardCase = rollLegendaryDie("treasure", () => 0.999);
  assert.equal(cardCase.steps, 4);
  assert.equal(cardCase.bonus.cards, 1);
  assert.equal("fairyAction" in cardCase, false);
  assert.equal(cardCase.face.label, "4 + 卡片");
  assert.throws(() => rollLegendaryDie("unknown"), /unknown treasure dice pool/);
});

test("only one fairy may exist and it waits a complete round before moving", () => {
  const spawned = spawnFairy(createFairyState(), {
    round: 1,
    candidates: [
      { anchorId: "n08", distance: 4, targetTeamId: "sun" },
      { anchorId: "n14", distance: 6, targetTeamId: "sun" },
    ],
    cardCase: FIRST_CASE,
    random: () => 0,
  });
  assert.equal(spawned.fairy.status, FAIRY_STATUS.active);
  assert.equal(spawned.fairy.anchorId, "n08");

  const duplicate = spawnFairy(spawned.fairy, {
    round: 1,
    candidates: [{ anchorId: "n20", distance: 3 }],
    cardCase: FIRST_CASE,
  });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.event.reason, "fairy_already_present");

  const sameRound = advanceFairyRound(spawned.fairy, {
    round: 1,
    candidates: [{ anchorId: "n14", distance: 5 }],
  });
  assert.equal(sameRound.changed, false);
  assert.equal(sameRound.fairy.anchorId, "n08");
});

test("fairy moves once, moves closer the second time, then falls asleep", () => {
  const spawned = spawnFairy(createFairyState(), {
    round: 1,
    candidates: [{ anchorId: "n08", distance: 6, targetTeamId: "sun" }],
    cardCase: FIRST_CASE,
    random: () => 0,
  }).fairy;

  const firstMove = advanceFairyRound(spawned, {
    round: 2,
    candidates: [{ anchorId: "n14", distance: 5, targetTeamId: "sun" }],
    random: () => 0,
  });
  assert.equal(firstMove.fairy.moveCount, 1);
  assert.equal(firstMove.fairy.anchorId, "n14");

  const secondMove = advanceFairyRound(firstMove.fairy, {
    round: 3,
    candidates: [
      { anchorId: "n20", distance: 6, targetTeamId: "sun" },
      { anchorId: "n28", distance: 3, targetTeamId: "sun" },
    ],
    random: () => 0,
  });
  assert.equal(secondMove.fairy.moveCount, 2);
  assert.equal(secondMove.fairy.anchorId, "n28");
  assert.equal(secondMove.event.closer, true);
  assert.equal(secondMove.fairy.distance < firstMove.fairy.distance, true);

  const sleeping = advanceFairyRound(secondMove.fairy, {
    round: 4,
    candidates: [{ anchorId: "n35", distance: 2 }],
  });
  assert.equal(sleeping.fairy.status, FAIRY_STATUS.sleeping);
  assert.equal(sleeping.fairy.anchorId, "n28");
});

test("treasure die can hold an active fairy and route capture yields its one case", () => {
  const active = spawnFairy(createFairyState(), {
    round: 2,
    candidates: [{ anchorId: "n20", distance: 4 }],
    cardCase: FIRST_CASE,
  }).fairy;
  const held = holdFairyForRound(active, 3);
  const blockedMove = advanceFairyRound(held, {
    round: 3,
    candidates: [{ anchorId: "n28", distance: 3 }],
  });
  assert.equal(blockedMove.changed, false);
  assert.equal(blockedMove.fairy.anchorId, "n20");

  const captured = captureFairy(held, 3);
  assert.equal(captured.fairy.status, FAIRY_STATUS.captured);
  assert.deepEqual(captured.capturedCase, FIRST_CASE);
  assert.equal(captured.fairy.cardCase, null);

  const repeated = captureFairy(captured.fairy, 3);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.capturedCase, null);
});

test("legacy session goals promise neither milestone cards nor a fixed catalog cap", () => {
  for (const minTotalTurns of [12, 15, 18, 21, 24, 40]) {
    assert.deepEqual(treasureGoalsForTurns(minTotalTurns), {
      minTotalTurns,
      guaranteedCards: 0,
      targetCards: null,
      cardCap: null,
    });
  }
});
