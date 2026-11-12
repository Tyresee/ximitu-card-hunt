import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAYER_ASSET_ACCOUNT_SCHEMA_VERSION,
  createPlayerAssetAccount,
  createPlayerAssetsLedger,
  migrateV4PlayerAssets,
  playerAssetSnapshot,
  reservedCardIdsForLedger,
  retireLegacyFairyCase,
  selectCardCaseForAccount,
  settleDueCardMilestone,
  settlePlayerAssetTurn,
} from "../public/prototypes/universal-board/player-assets-core.js";

const CARD_A = Object.freeze({
  id: "case.card.a",
  cardId: "card.a",
});
const CARD_CATALOG = Object.freeze(["card.a", "card.b", "card.c"]);

test("legacy fairy cases retire into an audit-only bucket without assigning a child", () => {
  const initial = createPlayerAssetsLedger({
    playerIds: ["seat-1", "seat-2"],
    playerAssetsById: {
      "seat-1": { coins: 2 },
      "seat-2": { coins: 4 },
    },
  });
  const fairy = {
    status: "active",
    anchorId: "n35",
    targetTeamId: "team-2",
    cardCase: {
      id: "case.legacy.fairy",
      cardId: "legacy.card.fairy",
    },
  };

  const retired = retireLegacyFairyCase(initial, fairy, {
    sourceLocalSchemaVersion: 11,
  });
  assert.equal(retired.retired, true);
  assert.equal(retired.ledger.playerAssetsById["seat-1"].coins, 2);
  assert.equal(retired.ledger.playerAssetsById["seat-2"].coins, 4);
  assert.deepEqual(retired.ledger.playerAssetsById["seat-2"].collectedCardIds, []);
  assert.deepEqual(retired.ledger.legacyUnassigned.retiredFairyCases, [{
    status: "active",
    anchorId: "n35",
    targetTeamId: "team-2",
    cardCase: {
      id: "case.legacy.fairy",
      cardId: "legacy.card.fairy",
      source: null,
      originNodeId: null,
    },
  }]);

  const replay = retireLegacyFairyCase(retired.ledger, fairy, {
    sourceLocalSchemaVersion: 11,
  });
  assert.equal(replay.retired, false);
  assert.deepEqual(replay.ledger, retired.ledger);
});

test("settlement ids are idempotent and five coins never exchange automatically", () => {
  const initial = createPlayerAssetsLedger({ playerIds: ["seat-1"] });
  const first = settlePlayerAssetTurn(initial, {
    settlementId: "turn-1",
    ownerId: "seat-1",
    acceptedAnswer: true,
    rewards: [{
      resource: "coin",
      amount: 2,
      source: "dice",
      originNodeId: "die-face-5",
    }],
  });
  const replay = settlePlayerAssetTurn(first.ledger, {
    settlementId: "turn-1",
    ownerId: "seat-1",
    acceptedAnswer: true,
    rewards: [{ resource: "coin", amount: 2, source: "dice" }],
  });

  assert.equal(first.duplicate, false);
  assert.equal(first.exchangeCompleted, false);
  assert.equal(first.ledger.playerAssetsById["seat-1"].coins, 2);
  assert.equal(first.ledger.playerAssetsById["seat-1"].acceptedTurns, 1);
  assert.equal(first.ledger.playerAssetsById["seat-1"].stars, 0);
  assert.equal(first.ledger.playerAssetsById["seat-1"].keys, 0);
  assert.equal(replay.duplicate, true);
  assert.deepEqual(replay.events, []);
  assert.deepEqual(replay.openedCards, []);
  assert.deepEqual(replay.ledger, first.ledger);
  assert.deepEqual(replay.ledger.processedSettlementIds, ["turn-1"]);
});

test("teacher-confirmed historical cards count without fabricating catalog ids", () => {
  const account = createPlayerAssetAccount({
    collectedCardIds: ["card.a"],
    cardCountsById: { "card.a": 2 },
    uncataloguedCards: 16,
  });
  assert.deepEqual(playerAssetSnapshot(account), {
    coins: 0,
    stars: 0,
    keys: 0,
    cards: 18,
    duplicateCards: 1,
  });
  assert.deepEqual(account.collectedCardIds, ["card.a"]);
  assert.equal(account.uncataloguedCards, 16);
});

test("accepted answers record progress but only explicit dice or board rewards award coins", () => {
  const accepted = settlePlayerAssetTurn(createPlayerAssetsLedger({
    playerIds: ["seat-1"],
  }), {
    settlementId: "accepted-without-reward",
    ownerId: "seat-1",
    acceptedAnswer: true,
  });

  assert.equal(accepted.ledger.playerAssetsById["seat-1"].acceptedTurns, 1);
  assert.equal(accepted.ledger.playerAssetsById["seat-1"].coins, 0);
  assert.deepEqual(accepted.events, []);

  const rewarded = settlePlayerAssetTurn(accepted.ledger, {
    settlementId: "explicit-board-coin",
    ownerId: "seat-1",
    rewards: [{
      resource: "coin",
      amount: 1,
      source: "board_node",
      originNodeId: "n02",
    }],
  });
  assert.equal(rewarded.ledger.playerAssetsById["seat-1"].acceptedTurns, 1);
  assert.equal(rewarded.ledger.playerAssetsById["seat-1"].coins, 1);
  assert.deepEqual(
    rewarded.events.map(({ type, resource, amount, source }) => ({
      type,
      resource,
      amount,
      source,
    })),
    [{
      type: "resource_awarded",
      resource: "coin",
      amount: 1,
      source: "board_node",
    }],
  );
});

test("only none, one-to-three coins, or one card are valid rewards", () => {
  const initial = createPlayerAssetsLedger({ playerIds: ["seat-1"] });
  const before = structuredClone(initial);

  assert.throws(
    () => settlePlayerAssetTurn(initial, {
      settlementId: "unknown-owner",
      ownerId: "seat-9",
      acceptedAnswer: true,
    }),
    /unknown asset owner: seat-9/,
  );

  for (const resource of ["gem", "star", "key"]) {
    assert.throws(
      () => settlePlayerAssetTurn(initial, {
        settlementId: `unsupported-${resource}`,
        ownerId: "seat-1",
        rewards: [{ resource, amount: 1, source: "dice" }],
      }),
      new RegExp(`resource is unsupported: ${resource}`),
    );
  }

  for (const reward of [
    { resource: "coin", amount: -1 },
    { resource: "coin", amount: 4 },
    { resource: "card", amount: 2 },
    { resource: "none", amount: 1 },
  ]) {
    assert.throws(
      () => settlePlayerAssetTurn(initial, {
        settlementId: `invalid-${reward.resource}-${reward.amount}`,
        ownerId: "seat-1",
        rewards: [reward],
      }),
    );
  }
  assert.deepEqual(initial, before);
});

test("five-coin exchange is explicit and affects only the chosen player's account", () => {
  let ledger = createPlayerAssetsLedger({
    playerIds: ["seat-1", "seat-2"],
    playerAssetsById: {
      "seat-1": { coins: 4 },
      "seat-2": { coins: 5 },
    },
  });

  ledger = settlePlayerAssetTurn(ledger, {
    settlementId: "reach-five",
    ownerId: "seat-1",
    acceptedAnswer: true,
    rewards: [{
      resource: "coin",
      amount: 1,
      source: "board_node",
      originNodeId: "n02",
    }],
  }).ledger;
  assert.equal(ledger.playerAssetsById["seat-1"].coins, 5);
  assert.deepEqual(ledger.playerAssetsById["seat-1"].collectedCardIds, []);

  const exchanged = settlePlayerAssetTurn(ledger, {
    settlementId: "explicit-exchange",
    ownerId: "seat-1",
    exchangeCoinsForCard: true,
    cardCatalogIds: CARD_CATALOG,
    random: () => 0,
  });
  assert.equal(exchanged.exchangeCompleted, true);
  assert.equal(exchanged.openedCardId, "card.a");
  assert.deepEqual(exchanged.openedCards.map(({ cardId }) => cardId), ["card.a"]);
  assert.equal(exchanged.ledger.playerAssetsById["seat-1"].coins, 0);
  assert.deepEqual(
    exchanged.ledger.playerAssetsById["seat-1"].collectedCardIds,
    ["card.a"],
  );
  assert.equal(exchanged.ledger.playerAssetsById["seat-2"].coins, 5);
  assert.deepEqual(exchanged.events.map(({ type }) => type), [
    "resource_exchanged",
    "card_awarded",
  ]);

  assert.throws(
    () => settlePlayerAssetTurn(exchanged.ledger, {
      settlementId: "insufficient-exchange",
      ownerId: "seat-1",
      exchangeCoinsForCard: true,
      cardCatalogIds: CARD_CATALOG,
    }),
    /five coins are required/,
  );
});

test("accepted progress, dice reward, landing card, and opened card stay distinct", () => {
  const result = settlePlayerAssetTurn(createPlayerAssetsLedger({
    playerIds: ["seat-1"],
  }), {
    settlementId: "turn-with-three-sources",
    ownerId: "seat-1",
    acceptedAnswer: true,
    rewards: [
      {
        resource: "coin",
        amount: 2,
        source: "dice",
        originNodeId: "die-face-5",
      },
      {
        resource: "card",
        amount: 1,
        source: "landing",
        originNodeId: "n17",
      },
    ],
    foundCase: {
      ...CARD_A,
      source: "landing",
      originNodeId: "n17",
    },
    cardCatalogIds: CARD_CATALOG,
  });

  assert.deepEqual(result.events.map(({ type }) => type), [
    "resource_awarded",
    "card_awarded",
  ]);
  assert.deepEqual(
    result.events.filter(({ type }) => type === "resource_awarded")
      .map(({ resource, amount, source, originNodeId }) => ({
        resource,
        amount,
        source,
        originNodeId,
    })),
    [
      { resource: "coin", amount: 2, source: "dice", originNodeId: "die-face-5" },
    ],
  );
  assert.equal(result.ledger.playerAssetsById["seat-1"].acceptedTurns, 1);
  assert.equal(result.ledger.playerAssetsById["seat-1"].coins, 2);
  assert.equal(result.openedCardId, "card.a");
  assert.deepEqual(result.openedCards.map(({ cardId }) => cardId), ["card.a"]);
  assert.equal(result.events.at(-1).originNodeId, "n17");
  assert.equal(new Set(result.events.map(({ eventId }) => eventId)).size, result.events.length);
  assert.deepEqual(
    result.ledger.playerAssetsById["seat-1"].cardCountsById,
    { "card.a": 1 },
  );
});

test("dice, landing, and one explicit exchange each open their own card", () => {
  const result = settlePlayerAssetTurn(createPlayerAssetsLedger({
    playerIds: ["seat-1"],
    playerAssetsById: {
      "seat-1": {
        coins: 5,
        collectedCardIds: ["card.a"],
      },
    },
  }), {
    settlementId: "three-card-cases-one-turn",
    ownerId: "seat-1",
    rewards: [
      {
        resource: "card",
        amount: 1,
        source: "dice",
        originNodeId: null,
      },
      {
        resource: "card",
        amount: 1,
        source: "board_node",
        originNodeId: "n17",
      },
    ],
    foundCase: {
      ...CARD_A,
      source: "board_node",
      originNodeId: "n17",
    },
    exchangeCoinsForCard: true,
    cardCatalogIds: CARD_CATALOG,
    random: () => 0,
  });

  assert.equal(result.exchangeCompleted, true);
  assert.equal(result.openedCardId, "card.a");
  assert.equal(result.openedCardDuplicate, true);
  assert.equal(result.guaranteedNewCard, false);
  assert.deepEqual(
    result.openedCards.map((opened) => ({
      cardId: opened.cardId,
      source: opened.source,
      originNodeId: opened.originNodeId,
      duplicate: opened.duplicate,
      guaranteedNew: opened.guaranteedNew,
      duplicateOpenStreak: opened.duplicateOpenStreak,
    })),
    [
      {
        cardId: "card.a",
        source: "dice",
        originNodeId: null,
        duplicate: true,
        guaranteedNew: false,
        duplicateOpenStreak: 1,
      },
      {
        cardId: "card.a",
        source: "board_node",
        originNodeId: "n17",
        duplicate: true,
        guaranteedNew: false,
        duplicateOpenStreak: 2,
      },
      {
        cardId: "card.b",
        source: "exchange_station",
        originNodeId: null,
        duplicate: false,
        guaranteedNew: true,
        duplicateOpenStreak: 0,
      },
    ],
  );
  assert.deepEqual(
    result.events.map(({ type }) => type),
    [
      "resource_exchanged",
      "card_awarded",
      "card_awarded",
      "card_awarded",
    ],
  );
  assert.equal(result.ledger.playerAssetsById["seat-1"].coins, 0);
  assert.deepEqual(result.ledger.playerAssetsById["seat-1"].cardCountsById, {
    "card.a": 3,
    "card.b": 1,
  });
  assert.deepEqual(
    result.ledger.playerAssetsById["seat-1"].collectedCardIds,
    ["card.a", "card.b"],
  );
  assert.equal(result.ledger.playerAssetsById["seat-1"].duplicateOpenStreak, 0);
  assert.equal(
    playerAssetSnapshot(result.ledger.playerAssetsById["seat-1"]).cards,
    4,
  );
});

test("a card rejects an empty dynamic catalog instead of fabricating a card", () => {
  const initial = createPlayerAssetsLedger({ playerIds: ["seat-1"] });

  assert.throws(
    () => settlePlayerAssetTurn(initial, {
      settlementId: "empty-card-catalog",
      ownerId: "seat-1",
      rewards: [{ resource: "card", amount: 1, source: "dice" }],
      foundCase: CARD_A,
      cardCatalogIds: [],
    }),
    /cardCatalogIds must contain at least one card/,
  );
  assert.deepEqual(initial.processedSettlementIds, []);
  assert.deepEqual(initial.playerAssetsById["seat-1"].collectedCardIds, []);
});

test("duplicates are allowed, but two consecutive duplicates guarantee an uncollected next card", () => {
  let ledger = createPlayerAssetsLedger({ playerIds: ["seat-1"] });
  const open = (settlementId, foundCase, random = () => 0) => {
    const result = settlePlayerAssetTurn(ledger, {
      settlementId,
      ownerId: "seat-1",
      rewards: [{ resource: "card", amount: 1, source: "test" }],
      foundCase,
      cardCatalogIds: CARD_CATALOG,
      random,
    });
    ledger = result.ledger;
    return result;
  };

  assert.equal(open("open-a-1", CARD_A).openedCardDuplicate, false);
  assert.equal(open("open-a-2", CARD_A).openedCardDuplicate, true);
  const secondDuplicate = open("open-a-3", CARD_A);
  assert.equal(secondDuplicate.openedCardDuplicate, true);
  assert.equal(ledger.playerAssetsById["seat-1"].duplicateOpenStreak, 2);

  const guaranteed = open("guaranteed-new", CARD_A, () => 0);
  assert.equal(guaranteed.guaranteedNewCard, true);
  assert.equal(guaranteed.openedCardDuplicate, false);
  assert.equal(guaranteed.openedCardId, "card.b");
  assert.equal(ledger.playerAssetsById["seat-1"].duplicateOpenStreak, 0);
  assert.deepEqual(ledger.playerAssetsById["seat-1"].cardCountsById, {
    "card.a": 3,
    "card.b": 1,
  });
  assert.deepEqual(ledger.playerAssetsById["seat-1"].collectedCardIds, [
    "card.a",
    "card.b",
  ]);

  const selection = selectCardCaseForAccount({
    collectedCardIds: ["card.a"],
    duplicateOpenStreak: 2,
  }, CARD_CATALOG, () => 0.999);
  assert.equal(selection.guaranteedNew, true);
  assert.equal(selection.cardCase.cardId, "card.c");
});

test("card selection accepts a dynamically sized catalog without rarity or a fixed card count", () => {
  const dynamicCatalog = Array.from({ length: 137 }, (_, index) => `card.dynamic.${index + 1}`);
  const selection = selectCardCaseForAccount({}, dynamicCatalog, () => 0.999999);

  assert.equal(selection.cardCase.cardId, "card.dynamic.137");
  assert.equal(selection.guaranteedNew, false);
  assert.equal("rarity" in selection.cardCase, false);
});

test("an already collected natural card offsets the four-answer card guarantee", () => {
  const naturalCardId = "card.natural.find.1";
  const result = settleDueCardMilestone(createPlayerAssetsLedger({
    playerIds: ["seat-1"],
    playerAssetsById: {
      "seat-1": {
        acceptedTurns: 4,
        collectedCardIds: [naturalCardId],
      },
    },
  }), {
    settlementId: "milestone-1",
  });
  const account = result.ledger.playerAssetsById["seat-1"];
  const milestoneEvent = result.events.find(({ type }) => type === "card_guarantee");

  assert.equal(result.changed, true);
  assert.equal(result.openedCardId, null);
  assert.equal(result.ownerId, "seat-1");
  assert.equal(milestoneEvent.cardGuaranteed, false);
  assert.deepEqual(account.collectedCardIds, [naturalCardId]);
  assert.equal(account.guaranteedCards, 0);
  assert.equal(account.milestoneAwards, 1);
  assert.equal(account.coins, 0);
  assert.equal(account.stars, 0);
  assert.equal(account.keys, 0);
});

for (const playerCount of [1, 2, 4, 8]) {
  test(`${playerCount}-player guarantees rotate fairly across stable player ids`, () => {
    const playerIds = Array.from({ length: playerCount }, (_, index) => `seat-${index + 1}`);
    const startingCursor = playerCount - 1;
    let ledger = createPlayerAssetsLedger({
      playerIds,
      guaranteeCursor: startingCursor,
      playerAssetsById: {
        [playerIds[0]]: { acceptedTurns: playerCount * 8 },
      },
    });
    const owners = [];

    for (let index = 0; index < playerCount * 2; index += 1) {
      const cardId = `card.guarantee.${playerCount}.${index + 1}`;
      const result = settleDueCardMilestone(ledger, {
        settlementId: `milestone-${playerCount}-${index + 1}`,
        cardCase: { id: `case.${cardId}`, cardId },
        cardCatalogIds: [cardId],
      });
      assert.equal(result.changed, true);
      assert.equal(result.duplicate, false);
      assert.equal(result.openedCardId, cardId);
      owners.push(result.ownerId);
      ledger = result.ledger;
    }

    const expectedCycle = [playerIds.at(-1), ...playerIds.slice(0, -1)];
    assert.deepEqual(owners, [...expectedCycle, ...expectedCycle]);
    playerIds.forEach((playerId) => {
      const account = ledger.playerAssetsById[playerId];
      assert.equal(account.collectedCardIds.length, 2);
      assert.equal(account.guaranteedCards, 2);
      assert.equal(account.milestoneAwards, 2);
    });
  });
}

test("v4 migration preserves ambiguous legacy balances without making them spendable", () => {
  const migrationInput = {
    playerIds: ["seat-1", "seat-2"],
    treasureState: {
      coins: 7,
      gems: 5,
      keys: 1,
      waitingCase: {
        id: "case.legacy.waiting",
        cardId: "card.legacy.waiting",
      },
      collectedCardIds: [CARD_A.cardId],
      acceptedTurns: 4,
      lastCardOpenedTurn: 2,
    },
    runtimeTeams: [
      { id: "player-1", coins: 4 },
      { id: "player-2", coins: 9 },
    ],
    sessionSeats: [
      { id: "seat-1", opportunityCount: 1 },
      { id: "seat-2", opportunityCount: 3 },
    ],
    playerIdByTeamId: {
      "player-1": "seat-1",
      "player-2": "seat-2",
    },
    guaranteeCursor: 1,
  };
  const migrated = migrateV4PlayerAssets(migrationInput);
  assert.deepEqual(migrateV4PlayerAssets(structuredClone(migrationInput)), migrated);
  assert.equal(migrated.guaranteeCursor, 1);
  assert.equal(migrated.acceptedTurnsTotal, 4);
  assert.equal(migrated.milestonesSettled, 0);
  assert.deepEqual(migrated.playerAssetsById["seat-1"], {
    schemaVersion: PLAYER_ASSET_ACCOUNT_SCHEMA_VERSION,
    coins: 0,
    stars: 0,
    keys: 0,
    waitingCase: null,
    collectedCardIds: [],
    cardCountsById: {},
    uncataloguedCards: 0,
    duplicateOpenStreak: 0,
    acceptedTurns: 1,
    milestoneAwards: 0,
    guaranteedCards: 0,
  });
  assert.equal(migrated.playerAssetsById["seat-2"].coins, 0);
  assert.deepEqual(migrated.playerAssetsById["seat-2"].collectedCardIds, []);
  assert.equal(migrated.legacyUnassigned.shared.coins, 7);
  assert.equal(migrated.legacyUnassigned.shared.stars, 5);
  assert.equal(migrated.legacyUnassigned.shared.keys, 1);
  assert.deepEqual(migrated.legacyUnassigned.runtimeEngineCoinsByPlayerId, {
    "seat-1": 4,
    "seat-2": 9,
  });
  assert.deepEqual(migrated.legacyUnassigned.shared.collectedCardIds, [CARD_A.cardId]);
  assert.equal(
    migrated.legacyUnassigned.shared.waitingCase.cardId,
    "card.legacy.waiting",
  );
  assert.deepEqual(reservedCardIdsForLedger(migrated), []);

  const milestone = settleDueCardMilestone(migrated, {
    settlementId: "post-migration-milestone-1",
    cardCase: CARD_A,
    cardCatalogIds: [CARD_A.cardId],
  });
  assert.equal(milestone.changed, true);
  assert.equal(milestone.openedCardId, CARD_A.cardId);
  assert.equal(milestone.ledger.milestonesSettled, 1);
  assert.equal(milestone.ledger.playerAssetsById["seat-2"].guaranteedCards, 1);
  assert.deepEqual(
    milestone.ledger.playerAssetsById["seat-2"].collectedCardIds,
    [CARD_A.cardId],
  );
  assert.deepEqual(milestone.ledger.legacyUnassigned, migrated.legacyUnassigned);

  const personalCard = settlePlayerAssetTurn(milestone.ledger, {
    settlementId: "post-migration-personal-card",
    ownerId: "seat-1",
    foundCase: {
      id: "case.personal",
      cardId: "card.personal",
    },
    cardCatalogIds: ["card.personal"],
  }).ledger;
  assert.deepEqual(
    reservedCardIdsForLedger(personalCard).sort(),
    [CARD_A.cardId, "card.personal"].sort(),
  );
  assert.deepEqual(personalCard.legacyUnassigned, migrated.legacyUnassigned);
});
