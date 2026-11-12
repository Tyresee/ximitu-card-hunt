const MAX_PLAYERS = 8;
const MAX_PROCESSED_SETTLEMENTS = 128;

export const PLAYER_ASSET_ACCOUNT_SCHEMA_VERSION = "player-assets.account.v2";
export const PLAYER_ASSET_LEDGER_SCHEMA_VERSION = "player-assets.ledger.v2";
export const LEGACY_UNASSIGNED_SCHEMA_VERSION = "player-assets.legacy-unassigned.v1";

export const PLAYER_ASSET_EXCHANGE = Object.freeze({
  coinsPerCard: 5,
  answersPerMilestone: 4,
});

const REWARD_LIMITS = Object.freeze({
  none: Object.freeze({ min: 0, max: 0 }),
  coin: Object.freeze({ min: 1, max: 3 }),
  card: Object.freeze({ min: 1, max: 1 }),
});
const SUPPORTED_REWARD_RESOURCES = new Set(Object.keys(REWARD_LIMITS));

function requireId(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} must be a non-empty string`);
  return normalized;
}

function nonNegativeInteger(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}

function normalizePlayerIds(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length < 1 || playerIds.length > MAX_PLAYERS) {
    throw new Error("playerIds must contain between 1 and 8 stable player ids");
  }
  const seen = new Set();
  return playerIds.map((playerId, index) => {
    const normalized = requireId(playerId, `playerIds[${index}]`);
    if (seen.has(normalized)) throw new Error(`duplicate player id: ${normalized}`);
    seen.add(normalized);
    return normalized;
  });
}

function normalizeCardCase(cardCase, label = "cardCase") {
  if (cardCase === null || cardCase === undefined) return null;
  if (typeof cardCase === "string" && cardCase.trim()) {
    const cardId = cardCase.trim();
    return {
      id: `case.${cardId}`,
      cardId,
      source: null,
      originNodeId: null,
    };
  }
  const id = requireId(cardCase?.id, `${label}.id`);
  const cardId = requireId(cardCase?.cardId, `${label}.cardId`);
  return {
    id,
    cardId,
    source: cardCase?.source ? String(cardCase.source) : null,
    originNodeId: cardCase?.originNodeId ? String(cardCase.originNodeId) : null,
  };
}

function normalizeCardIdList(value, label = "cardIds") {
  if (!Array.isArray(value)) return [];
  return value.map((cardId, index) => (
    requireId(cardId, `${label}[${index}]`)
  ));
}

function normalizeCardCounts(initial = {}) {
  const history = normalizeCardIdList(initial.collectedCardIds, "collectedCardIds");
  const counts = {};
  history.forEach((cardId) => {
    counts[cardId] = (counts[cardId] || 0) + 1;
  });
  if (initial.cardCountsById !== undefined) {
    if (
      !initial.cardCountsById
      || typeof initial.cardCountsById !== "object"
      || Array.isArray(initial.cardCountsById)
    ) {
      throw new Error("cardCountsById must be an object");
    }
    Object.entries(initial.cardCountsById).forEach(([rawCardId, rawCount]) => {
      const cardId = requireId(rawCardId, "cardCountsById key");
      const count = nonNegativeInteger(rawCount, `cardCountsById.${cardId}`);
      if (count > 0) counts[cardId] = count;
      else delete counts[cardId];
    });
  }
  return counts;
}

function uniqueCollectedCardIds(initial, counts) {
  const ordered = normalizeCardIdList(initial.collectedCardIds, "collectedCardIds");
  return [...new Set([...ordered, ...Object.keys(counts)])]
    .filter((cardId) => counts[cardId] > 0);
}

export function createPlayerAssetAccount(initial = {}) {
  const cardCountsById = normalizeCardCounts(initial);
  const collectedCardIds = uniqueCollectedCardIds(initial, cardCountsById);
  const candidateWaitingCase = normalizeCardCase(initial.waitingCase);
  const waitingCase = candidateWaitingCase
    && !collectedCardIds.includes(candidateWaitingCase.cardId)
    ? candidateWaitingCase
    : null;
  return {
    schemaVersion: PLAYER_ASSET_ACCOUNT_SCHEMA_VERSION,
    coins: nonNegativeInteger(initial.coins, "coins"),
    stars: nonNegativeInteger(initial.stars, "stars"),
    keys: nonNegativeInteger(initial.keys, "keys"),
    waitingCase,
    collectedCardIds,
    cardCountsById,
    uncataloguedCards: nonNegativeInteger(
      initial.uncataloguedCards,
      "uncataloguedCards",
    ),
    duplicateOpenStreak: nonNegativeInteger(
      initial.duplicateOpenStreak,
      "duplicateOpenStreak",
    ),
    acceptedTurns: nonNegativeInteger(initial.acceptedTurns, "acceptedTurns"),
    milestoneAwards: nonNegativeInteger(initial.milestoneAwards, "milestoneAwards"),
    guaranteedCards: nonNegativeInteger(initial.guaranteedCards, "guaranteedCards"),
  };
}

function createLegacySharedAssets(initial = {}) {
  const collectedCardIds = [...new Set(
    normalizeCardIdList(initial.collectedCardIds, "legacy collectedCardIds"),
  )];
  const candidateWaitingCase = normalizeCardCase(initial.waitingCase);
  const waitingCase = candidateWaitingCase
    && !collectedCardIds.includes(candidateWaitingCase.cardId)
    ? candidateWaitingCase
    : null;
  const lastCardOpenedTurn = initial.lastCardOpenedTurn === null
    || initial.lastCardOpenedTurn === undefined
    ? null
    : nonNegativeInteger(initial.lastCardOpenedTurn, "legacy lastCardOpenedTurn");
  return {
    coins: nonNegativeInteger(initial.coins, "legacy shared coins"),
    stars: nonNegativeInteger(
      initial.stars ?? initial.gems,
      "legacy shared stars",
    ),
    keys: nonNegativeInteger(initial.keys, "legacy shared keys"),
    waitingCase,
    collectedCardIds,
    acceptedTurns: nonNegativeInteger(initial.acceptedTurns, "legacy shared acceptedTurns"),
    lastCardOpenedTurn,
  };
}

function normalizeRuntimeEngineCoins(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("legacy runtimeEngineCoinsByPlayerId must be an object");
  }
  return Object.fromEntries(
    Object.entries(value).map(([playerId, coins]) => [
      requireId(playerId, "legacy runtime player id"),
      nonNegativeInteger(coins, `legacy runtime coins for ${playerId}`),
    ]),
  );
}

function normalizeRetiredFairyCases(value = []) {
  if (!Array.isArray(value)) {
    throw new Error("legacy retiredFairyCases must be an array");
  }
  const normalized = value.map((entry, index) => ({
    status: String(entry?.status || "retired"),
    anchorId: entry?.anchorId ? String(entry.anchorId) : null,
    targetTeamId: entry?.targetTeamId ? String(entry.targetTeamId) : null,
    cardCase: normalizeCardCase(entry?.cardCase, `retiredFairyCases[${index}].cardCase`),
  }));
  const seen = new Set();
  return normalized.filter((entry) => {
    if (!entry.cardCase) return false;
    const key = [
      entry.cardCase.id,
      entry.cardCase.cardId,
      entry.targetTeamId || "",
      entry.anchorId || "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-32);
}

export function createLegacyUnassigned(initial = null) {
  if (!initial) return null;
  return {
    schemaVersion: LEGACY_UNASSIGNED_SCHEMA_VERSION,
    sourceLocalSchemaVersion: nonNegativeInteger(
      initial.sourceLocalSchemaVersion ?? 4,
      "sourceLocalSchemaVersion",
    ),
    reason: String(
      initial.reason
      || "Legacy shared and engine balances are preserved but are not assigned or spendable.",
    ),
    shared: createLegacySharedAssets(initial.shared || initial),
    runtimeEngineCoinsByPlayerId: normalizeRuntimeEngineCoins(
      initial.runtimeEngineCoinsByPlayerId || {},
    ),
    retiredFairyCases: normalizeRetiredFairyCases(
      initial.retiredFairyCases || [],
    ),
  };
}

export function createPlayerAssetsLedger({
  playerIds,
  playerAssetsById = {},
  guaranteeCursor = 0,
  processedSettlementIds = [],
  legacyUnassigned = null,
} = {}) {
  const normalizedPlayerIds = normalizePlayerIds(playerIds);
  if (
    !playerAssetsById
    || typeof playerAssetsById !== "object"
    || Array.isArray(playerAssetsById)
  ) {
    throw new Error("playerAssetsById must be an object");
  }
  const allowedPlayerIds = new Set(normalizedPlayerIds);
  const unknownPlayerId = Object.keys(playerAssetsById)
    .find((playerId) => !allowedPlayerIds.has(playerId));
  if (unknownPlayerId) {
    throw new Error(`playerAssetsById contains unknown player: ${unknownPlayerId}`);
  }
  const accounts = Object.fromEntries(normalizedPlayerIds.map((playerId) => [
    playerId,
    createPlayerAssetAccount(playerAssetsById[playerId]),
  ]));
  if (
    !Array.isArray(processedSettlementIds)
    || processedSettlementIds.some((settlementId) => (
      typeof settlementId !== "string" || !settlementId.trim()
    ))
  ) {
    throw new Error("processedSettlementIds must contain non-empty strings");
  }
  const rawCursor = nonNegativeInteger(guaranteeCursor, "guaranteeCursor");
  const normalizedLegacy = createLegacyUnassigned(legacyUnassigned);
  return {
    schemaVersion: PLAYER_ASSET_LEDGER_SCHEMA_VERSION,
    playerOrder: normalizedPlayerIds,
    playerAssetsById: accounts,
    guaranteeCursor: rawCursor % normalizedPlayerIds.length,
    processedSettlementIds: [...new Set(processedSettlementIds)]
      .slice(-MAX_PROCESSED_SETTLEMENTS),
    acceptedTurnsTotal: normalizedPlayerIds.reduce(
      (total, playerId) => total + accounts[playerId].acceptedTurns,
      0,
    ),
    guaranteedCardsAwarded: normalizedPlayerIds.reduce(
      (total, playerId) => total + accounts[playerId].guaranteedCards,
      0,
    ),
    milestonesSettled: normalizedPlayerIds.reduce(
      (total, playerId) => total + accounts[playerId].milestoneAwards,
      0,
    ),
    legacyUnassigned: normalizedLegacy,
  };
}

/**
 * Retires an old on-map fairy without guessing which child owned its unopened
 * case. The case remains in the audit-only legacy bucket and is never spendable
 * or drawable by the current reward loop.
 */
export function retireLegacyFairyCase(ledger, fairyState, {
  sourceLocalSchemaVersion = 12,
} = {}) {
  const normalized = createPlayerAssetsLedger({
    playerIds: ledger?.playerOrder,
    playerAssetsById: ledger?.playerAssetsById,
    guaranteeCursor: ledger?.guaranteeCursor,
    processedSettlementIds: ledger?.processedSettlementIds,
    legacyUnassigned: ledger?.legacyUnassigned,
  });
  const cardCase = normalizeCardCase(fairyState?.cardCase, "fairyState.cardCase");
  if (!cardCase) return { ledger: normalized, retired: false };

  const legacy = normalized.legacyUnassigned || createLegacyUnassigned({
    sourceLocalSchemaVersion,
    reason: (
      "Retired legacy fairy cases are preserved for audit without assigning "
      + "unproven ownership or adding them to the current card catalog."
    ),
    shared: {},
    runtimeEngineCoinsByPlayerId: {},
    retiredFairyCases: [],
  });
  const retiredKey = [
    cardCase.id,
    cardCase.cardId,
    fairyState?.targetTeamId || "",
    fairyState?.anchorId || "",
  ].join("|");
  const alreadyRetired = legacy.retiredFairyCases.some((entry) => ([
    entry.cardCase.id,
    entry.cardCase.cardId,
    entry.targetTeamId || "",
    entry.anchorId || "",
  ].join("|") === retiredKey));
  if (alreadyRetired) return { ledger: normalized, retired: false };
  const retiredFairyCases = normalizeRetiredFairyCases([
    ...legacy.retiredFairyCases,
    {
      status: fairyState?.status,
      anchorId: fairyState?.anchorId,
      targetTeamId: fairyState?.targetTeamId,
      cardCase,
    },
  ]);
  return {
    ledger: createPlayerAssetsLedger({
      playerIds: normalized.playerOrder,
      playerAssetsById: normalized.playerAssetsById,
      guaranteeCursor: normalized.guaranteeCursor,
      processedSettlementIds: normalized.processedSettlementIds,
      legacyUnassigned: {
        ...legacy,
        retiredFairyCases,
      },
    }),
    retired: true,
  };
}

export function playerAssetSnapshot(account) {
  const normalized = createPlayerAssetAccount(account);
  const cataloguedCards = Object.values(normalized.cardCountsById)
    .reduce((total, count) => total + count, 0);
  const cards = cataloguedCards + normalized.uncataloguedCards;
  return {
    coins: normalized.coins,
    stars: normalized.stars,
    keys: normalized.keys,
    cards,
    duplicateCards: Math.max(
      0,
      cataloguedCards - normalized.collectedCardIds.length,
    ),
  };
}

export function playerAssetsView(ledger) {
  const normalized = createPlayerAssetsLedger({
    playerIds: ledger?.playerOrder,
    playerAssetsById: ledger?.playerAssetsById,
    guaranteeCursor: ledger?.guaranteeCursor,
    processedSettlementIds: ledger?.processedSettlementIds,
  });
  return Object.fromEntries(normalized.playerOrder.map((playerId) => [
    playerId,
    playerAssetSnapshot(normalized.playerAssetsById[playerId]),
  ]));
}

function attachAssetTransition(event, before, account) {
  return {
    ...event,
    assetsBefore: before,
    assetsAfter: playerAssetSnapshot(account),
  };
}

function normalizedReward(reward, index) {
  const resource = String(reward?.resource || "");
  if (!SUPPORTED_REWARD_RESOURCES.has(resource)) {
    throw new Error(`rewards[${index}].resource is unsupported: ${resource}`);
  }
  const amount = nonNegativeInteger(reward?.amount, `rewards[${index}].amount`);
  const limits = REWARD_LIMITS[resource];
  if (amount < limits.min || amount > limits.max) {
    throw new Error(`rewards[${index}].amount is outside the ${resource} limit`);
  }
  return {
    resource,
    amount,
    source: String(reward?.source || "turn_bonus"),
    originNodeId: reward?.originNodeId ? String(reward.originNodeId) : null,
  };
}

function addResource(account, resource, amount) {
  if (resource === "coin") account.coins += amount;
}

function sampleIndex(length, random = Math.random) {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error("card catalog must contain at least one card");
  }
  if (typeof random !== "function") throw new TypeError("random must be a function");
  const sample = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return Math.floor(sample * length);
}

export function selectCardCaseForAccount(
  accountValue,
  cardCatalogIds,
  random = Math.random,
) {
  const account = createPlayerAssetAccount(accountValue);
  const cardIds = [...new Set(normalizeCardIdList(cardCatalogIds, "cardCatalogIds"))];
  if (!cardIds.length) throw new Error("cardCatalogIds must contain at least one card");
  const uncollected = cardIds.filter((cardId) => !account.collectedCardIds.includes(cardId));
  const guaranteedNew = account.duplicateOpenStreak >= 2 && uncollected.length > 0;
  const candidates = guaranteedNew ? uncollected : cardIds;
  const cardId = candidates[sampleIndex(candidates.length, random)];
  return {
    cardCase: {
      id: `case.${cardId}`,
      cardId,
      source: null,
      originNodeId: null,
    },
    guaranteedNew,
  };
}

function resolvedCardCase(account, candidate, cardCatalogIds, random) {
  const normalizedCandidate = normalizeCardCase(candidate, "foundCase");
  const catalog = [...new Set(normalizeCardIdList(cardCatalogIds, "cardCatalogIds"))];
  if (!catalog.length) {
    throw new Error("cardCatalogIds must contain at least one card");
  }
  if (normalizedCandidate && !catalog.includes(normalizedCandidate.cardId)) {
    throw new Error("foundCase.cardId must belong to cardCatalogIds");
  }
  const uncollected = catalog.filter(
    (cardId) => !account.collectedCardIds.includes(cardId),
  );
  const guaranteedNew = account.duplicateOpenStreak >= 2 && uncollected.length > 0;
  if (
    normalizedCandidate
    && guaranteedNew
    && account.collectedCardIds.includes(normalizedCandidate.cardId)
  ) {
    const selection = selectCardCaseForAccount(account, catalog, random);
    return {
      cardCase: {
        ...selection.cardCase,
        source: normalizedCandidate.source,
        originNodeId: normalizedCandidate.originNodeId,
      },
      guaranteedNew: true,
    };
  }
  if (normalizedCandidate) {
    return { cardCase: normalizedCandidate, guaranteedNew };
  }
  const selection = selectCardCaseForAccount(account, catalog, random);
  return {
    cardCase: selection.cardCase,
    guaranteedNew: selection.guaranteedNew,
  };
}

/**
 * Commits one player's complete asset transaction. Every event carries the same
 * stable owner id used by storage, the HUD target, animation and announcements.
 */
export function settlePlayerAssetTurn(ledger, {
  settlementId,
  ownerId,
  acceptedAnswer = false,
  rewards = [],
  foundCase = null,
  exchangeCoinsForCard = false,
  cardCatalogIds = [],
  random = Math.random,
} = {}) {
  const normalized = createPlayerAssetsLedger({
    playerIds: ledger?.playerOrder,
    playerAssetsById: ledger?.playerAssetsById,
    guaranteeCursor: ledger?.guaranteeCursor,
    processedSettlementIds: ledger?.processedSettlementIds,
    legacyUnassigned: ledger?.legacyUnassigned,
  });
  const normalizedSettlementId = requireId(settlementId, "settlementId");
  const normalizedOwnerId = requireId(ownerId, "ownerId");
  const current = normalized.playerAssetsById[normalizedOwnerId];
  if (!current) throw new Error(`unknown asset owner: ${normalizedOwnerId}`);
  if (!Array.isArray(rewards)) throw new Error("rewards must be an array");
  if (typeof exchangeCoinsForCard !== "boolean") {
    throw new TypeError("exchangeCoinsForCard must be a boolean");
  }
  if (normalized.processedSettlementIds.includes(normalizedSettlementId)) {
    return {
      ledger: normalized,
      events: [],
      openedCards: [],
      openedCardId: null,
      openedCardDuplicate: false,
      guaranteedNewCard: false,
      exchangeCompleted: false,
      ownerId: normalizedOwnerId,
      duplicate: true,
    };
  }

  const account = {
    ...current,
    waitingCase: current.waitingCase ? { ...current.waitingCase } : null,
    collectedCardIds: [...current.collectedCardIds],
    cardCountsById: { ...current.cardCountsById },
  };
  const events = [];
  let eventOrdinal = 0;
  const event = (details, before) => {
    eventOrdinal += 1;
    events.push(attachAssetTransition({
      eventId: `${normalizedSettlementId}:event:${eventOrdinal}`,
      settlementId: normalizedSettlementId,
      ...details,
    }, before, account));
  };
  const award = (reward) => {
    if (!reward.amount) return;
    const before = playerAssetSnapshot(account);
    addResource(account, reward.resource, reward.amount);
    event({
      type: "resource_awarded",
      ownerId: normalizedOwnerId,
      resource: reward.resource,
      amount: reward.amount,
      source: reward.source,
      originNodeId: reward.originNodeId,
    }, before);
  };

  if (acceptedAnswer) {
    account.acceptedTurns += 1;
  }
  const normalizedRewards = rewards.map(normalizedReward);
  normalizedRewards
    .filter(({ resource }) => resource === "coin")
    .forEach(award);

  const cardCaseRewards = normalizedRewards.filter(
    ({ resource }) => resource === "card",
  );
  const naturalCase = normalizeCardCase(foundCase, "foundCase");
  const naturalRewardIndex = naturalCase && cardCaseRewards.length
    ? Math.max(0, cardCaseRewards.findIndex((reward) => (
        (
          naturalCase.originNodeId
          && reward.originNodeId === naturalCase.originNodeId
        )
        || (naturalCase.source && reward.source === naturalCase.source)
      )))
    : -1;
  const pendingCardCases = cardCaseRewards.map((reward, index) => ({
    candidate: index === naturalRewardIndex ? naturalCase : null,
    source: reward.source,
    originNodeId: reward.originNodeId,
  }));
  if (exchangeCoinsForCard) {
    pendingCardCases.push({
      candidate: cardCaseRewards.length ? null : naturalCase,
      source: "exchange_station",
      originNodeId: cardCaseRewards.length ? null : naturalCase?.originNodeId || null,
    });
  } else if (naturalCase && !cardCaseRewards.length) {
    pendingCardCases.push({
      candidate: naturalCase,
      source: naturalCase.source || "card",
      originNodeId: naturalCase.originNodeId,
    });
  }
  if (pendingCardCases.length && !normalizeCardIdList(
    cardCatalogIds,
    "cardCatalogIds",
  ).length) {
    throw new Error("cardCatalogIds must contain at least one card");
  }

  let exchangeCompleted = false;
  if (exchangeCoinsForCard) {
    if (account.coins < PLAYER_ASSET_EXCHANGE.coinsPerCard) {
      throw new Error("five coins are required to exchange for one card");
    }
    const before = playerAssetSnapshot(account);
    account.coins -= PLAYER_ASSET_EXCHANGE.coinsPerCard;
    exchangeCompleted = true;
    event({
      type: "resource_exchanged",
      ownerId: normalizedOwnerId,
      from: "coin",
      fromAmount: PLAYER_ASSET_EXCHANGE.coinsPerCard,
      to: "card",
      toAmount: 1,
      source: "exchange_station",
      originNodeId: cardCaseRewards.length ? null : naturalCase?.originNodeId || null,
    }, before);
  }

  const openedCards = [];
  pendingCardCases.forEach((pendingCase) => {
    const selection = resolvedCardCase(
      account,
      pendingCase.candidate,
      cardCatalogIds,
      random,
    );
    const incomingCase = selection.cardCase;
    const guaranteedNew = selection.guaranteedNew;
    const rewardSource = pendingCase.source
      || incomingCase.source
      || "card";
    const originNodeId = incomingCase.originNodeId
      || pendingCase.originNodeId
      || null;
    const before = playerAssetSnapshot(account);
    const openedCardId = incomingCase.cardId;
    const openedCardDuplicate = account.collectedCardIds.includes(openedCardId);
    account.cardCountsById[openedCardId] = (
      account.cardCountsById[openedCardId] || 0
    ) + 1;
    if (openedCardDuplicate) account.duplicateOpenStreak += 1;
    else {
      account.collectedCardIds.push(openedCardId);
      account.duplicateOpenStreak = 0;
    }
    event({
      type: "card_awarded",
      ownerId: normalizedOwnerId,
      resource: "card",
      amount: 1,
      cardId: openedCardId,
      source: rewardSource,
      originNodeId,
      duplicate: openedCardDuplicate,
      duplicateOpenStreak: account.duplicateOpenStreak,
      guaranteedNew,
    }, before);
    openedCards.push({
      cardId: openedCardId,
      cardCase: { ...incomingCase },
      source: rewardSource,
      originNodeId,
      duplicate: openedCardDuplicate,
      guaranteedNew,
      duplicateOpenStreak: account.duplicateOpenStreak,
    });
  });
  const firstOpenedCard = openedCards[0] || null;

  const playerAssetsById = {
    ...normalized.playerAssetsById,
    [normalizedOwnerId]: createPlayerAssetAccount(account),
  };
  return {
    ledger: createPlayerAssetsLedger({
      playerIds: normalized.playerOrder,
      playerAssetsById,
      guaranteeCursor: normalized.guaranteeCursor,
      processedSettlementIds: [
        ...normalized.processedSettlementIds,
        normalizedSettlementId,
      ],
      legacyUnassigned: normalized.legacyUnassigned,
    }),
    events,
    openedCards,
    openedCardId: firstOpenedCard?.cardId || null,
    openedCardDuplicate: firstOpenedCard?.duplicate || false,
    guaranteedNewCard: firstOpenedCard?.guaranteedNew || false,
    exchangeCompleted,
    ownerId: normalizedOwnerId,
    duplicate: false,
  };
}

function fairMilestoneOwner(ledger) {
  const accounts = ledger.playerAssetsById;
  const minimumCardCount = Math.min(...ledger.playerOrder.map(
    (playerId) => accounts[playerId].collectedCardIds.length,
  ));
  const fewestCards = new Set(ledger.playerOrder.filter(
    (playerId) => accounts[playerId].collectedCardIds.length === minimumCardCount,
  ));
  const minimumGuarantees = Math.min(...ledger.playerOrder
    .filter((playerId) => fewestCards.has(playerId))
    .map((playerId) => accounts[playerId].milestoneAwards));
  for (let offset = 0; offset < ledger.playerOrder.length; offset += 1) {
    const index = (ledger.guaranteeCursor + offset) % ledger.playerOrder.length;
    const playerId = ledger.playerOrder[index];
    if (
      fewestCards.has(playerId)
      && accounts[playerId].milestoneAwards === minimumGuarantees
    ) {
      return { playerId, index };
    }
  }
  throw new Error("a fair milestone owner could not be selected");
}

/**
 * Legacy compatibility API for historical four-answer milestone ledgers.
 * The formal turn flow must not call this automatically: accepted answers only
 * record acceptedTurns, while current rewards come from explicit dice/board
 * entries and the explicit five-coin exchange.
 */
export function settleDueCardMilestone(ledger, {
  settlementId,
  cardCase,
  cardCatalogIds = [],
  random = Math.random,
} = {}) {
  const normalized = createPlayerAssetsLedger({
    playerIds: ledger?.playerOrder,
    playerAssetsById: ledger?.playerAssetsById,
    guaranteeCursor: ledger?.guaranteeCursor,
    processedSettlementIds: ledger?.processedSettlementIds,
    legacyUnassigned: ledger?.legacyUnassigned,
  });
  const normalizedSettlementId = requireId(settlementId, "settlementId");
  if (normalized.processedSettlementIds.includes(normalizedSettlementId)) {
    return {
      ledger: normalized,
      events: [],
      openedCards: [],
      openedCardId: null,
      openedCardDuplicate: false,
      guaranteedNewCard: false,
      ownerId: null,
      changed: false,
      duplicate: true,
    };
  }
  const dueMilestones = Math.floor(
    normalized.acceptedTurnsTotal / PLAYER_ASSET_EXCHANGE.answersPerMilestone,
  );
  if (normalized.milestonesSettled >= dueMilestones) {
    return {
      ledger: normalized,
      events: [],
      openedCards: [],
      openedCardId: null,
      openedCardDuplicate: false,
      guaranteedNewCard: false,
      ownerId: null,
      changed: false,
      duplicate: false,
    };
  }

  const owner = fairMilestoneOwner(normalized);
  const selectedAccount = createPlayerAssetAccount(
    normalized.playerAssetsById[owner.playerId],
  );
  selectedAccount.milestoneAwards += 1;
  const personalCards = normalized.playerOrder.reduce(
    (total, playerId) => (
      total + normalized.playerAssetsById[playerId].collectedCardIds.length
    ),
    0,
  );
  const guaranteeCardDue = personalCards < dueMilestones;
  if (guaranteeCardDue && !cardCase && !cardCatalogIds.length) {
    return {
      ledger: normalized,
      events: [],
      openedCards: [],
      openedCardId: null,
      openedCardDuplicate: false,
      guaranteedNewCard: false,
      ownerId: null,
      changed: false,
      duplicate: false,
    };
  }
  if (guaranteeCardDue) selectedAccount.guaranteedCards += 1;
  const candidateLedger = createPlayerAssetsLedger({
    playerIds: normalized.playerOrder,
    playerAssetsById: {
      ...normalized.playerAssetsById,
      [owner.playerId]: selectedAccount,
    },
    guaranteeCursor: (owner.index + 1) % normalized.playerOrder.length,
    processedSettlementIds: normalized.processedSettlementIds,
    legacyUnassigned: normalized.legacyUnassigned,
  });
  const guaranteed = settlePlayerAssetTurn(candidateLedger, {
    settlementId: normalizedSettlementId,
    ownerId: owner.playerId,
    rewards: guaranteeCardDue ? [{
      resource: "card",
      amount: 1,
      source: "milestone",
      originNodeId: null,
    }] : [],
    foundCase: guaranteeCardDue
      ? cardCase && {
          ...normalizeCardCase(cardCase),
          source: "milestone",
        }
      : null,
    cardCatalogIds,
    random,
  });
  if (guaranteeCardDue && !guaranteed.openedCardId) {
    return {
      ledger: normalized,
      events: [],
      openedCards: [],
      openedCardId: null,
      openedCardDuplicate: false,
      guaranteedNewCard: false,
      ownerId: null,
      changed: false,
      duplicate: false,
    };
  }
  return {
    ...guaranteed,
    events: [{
      eventId: `${normalizedSettlementId}:milestone`,
      settlementId: normalizedSettlementId,
      type: "card_guarantee",
      ownerId: owner.playerId,
      milestone: dueMilestones,
      source: "milestone",
      cardGuaranteed: guaranteeCardDue,
      assetsBefore: playerAssetSnapshot(
        normalized.playerAssetsById[owner.playerId],
      ),
      assetsAfter: playerAssetSnapshot(
        guaranteed.ledger.playerAssetsById[owner.playerId],
      ),
    }, ...guaranteed.events],
    changed: true,
    duplicate: false,
  };
}

export function reservedCardIdsForLedger(ledger) {
  const normalized = createPlayerAssetsLedger({
    playerIds: ledger?.playerOrder,
    playerAssetsById: ledger?.playerAssetsById,
    guaranteeCursor: ledger?.guaranteeCursor,
    processedSettlementIds: ledger?.processedSettlementIds,
  });
  const ids = new Set();
  normalized.playerOrder.forEach((playerId) => {
    const account = normalized.playerAssetsById[playerId];
    account.collectedCardIds.forEach((cardId) => ids.add(cardId));
    if (account.waitingCase?.cardId) ids.add(account.waitingCase.cardId);
  });
  return [...ids];
}

export function stableGuaranteeCursor(sessionId, playerIds) {
  const normalizedPlayerIds = normalizePlayerIds(playerIds);
  let hash = 2166136261;
  for (const character of `${String(sessionId || "")}:${normalizedPlayerIds.join("|")}`) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % normalizedPlayerIds.length;
}

/**
 * Conservatively migrates local schema v4. Shared and engine coins are kept in
 * separate non-spendable buckets because combining them could double-count the
 * same historical reward. No legacy value is copied into a child's account.
 */
export function migrateV4PlayerAssets({
  playerIds,
  treasureState = {},
  runtimeTeams = [],
  sessionSeats = [],
  playerIdByTeamId = {},
  guaranteeCursor = 0,
} = {}) {
  const normalizedPlayerIds = normalizePlayerIds(playerIds);
  if (!Array.isArray(runtimeTeams)) throw new Error("runtimeTeams must be an array");
  if (!Array.isArray(sessionSeats)) throw new Error("sessionSeats must be an array");
  const knownPlayers = new Set(normalizedPlayerIds);
  const runtimeEngineCoinsByPlayerId = {};
  runtimeTeams.forEach((team) => {
    const mappedPlayerId = playerIdByTeamId?.[team?.id];
    if (!knownPlayers.has(mappedPlayerId)) {
      throw new Error(`legacy runtime team ${team?.id || "unknown"} has no stable player id`);
    }
    runtimeEngineCoinsByPlayerId[mappedPlayerId] = nonNegativeInteger(
      team?.coins,
      `legacy runtime coins for ${mappedPlayerId}`,
    );
  });
  const playerAssetsById = {};
  for (const playerId of normalizedPlayerIds) {
    const seat = sessionSeats.find((candidate) => candidate?.id === playerId);
    if (!seat) throw new Error(`legacy session is missing stable player ${playerId}`);
    playerAssetsById[playerId] = {
      acceptedTurns: nonNegativeInteger(
        seat.opportunityCount,
        `legacy accepted turns for ${playerId}`,
      ),
    };
  }
  const attributedAcceptedTurns = Object.values(playerAssetsById).reduce(
    (total, account) => total + account.acceptedTurns,
    0,
  );
  const legacyAcceptedTurns = nonNegativeInteger(
    treasureState?.acceptedTurns,
    "legacy shared acceptedTurns",
  );
  if (attributedAcceptedTurns !== legacyAcceptedTurns) {
    throw new Error(
      "legacy accepted turn attribution does not match the shared treasure counter",
    );
  }
  return createPlayerAssetsLedger({
    playerIds: normalizedPlayerIds,
    playerAssetsById,
    guaranteeCursor,
    legacyUnassigned: {
      sourceLocalSchemaVersion: 4,
      reason: (
        "Migrated from v4. Shared treasury ownership cannot be proven, and "
        + "runtime engine coins may duplicate shared rewards; both are preserved "
        + "separately and excluded from personal balances."
      ),
      shared: treasureState,
      runtimeEngineCoinsByPlayerId,
    },
  });
}
