const DICE_OPTION_COUNT = 2;
const MIN_FAIRY_DISTANCE = 2;
const MAX_FAIRY_DISTANCE = 6;

export const TREASURE_EXCHANGE = Object.freeze({
  coinsPerCard: 5,
  answersPerMilestone: 4,
});

function frozenFace(face) {
  const bonus = Object.freeze({
    coins: 0,
    cards: 0,
    ...(face.bonus || {}),
  });
  return Object.freeze({
    ...face,
    bonus,
  });
}

function frozenPool(pool) {
  return Object.freeze({
    ...pool,
    faces: Object.freeze(pool.faces.map(frozenFace)),
  });
}

export const TREASURE_DICE_POOLS = Object.freeze({
  steady: frozenPool({
    id: "steady",
    label: "稳健骰",
    description: "六个实体面稳定分布在 2–4 格",
    probabilitySummary: "2、3、4 格等概率结构",
    faces: [
      { id: "steady-2", steps: 2, label: "2" },
      { id: "steady-2-b", steps: 2, label: "2" },
      { id: "steady-3-a", steps: 3, label: "3" },
      { id: "steady-3-b", steps: 3, label: "3" },
      { id: "steady-3-c", steps: 3, label: "3" },
      { id: "steady-4", steps: 4, label: "4" },
    ],
  }),
  sprint: frozenPool({
    id: "sprint",
    label: "冲刺骰",
    description: "六个实体面集中在 3–5 格",
    probabilitySummary: "3 格三面 · 4 格两面 · 5 格一面",
    faces: [
      { id: "sprint-3-a", steps: 3, label: "3" },
      { id: "sprint-3-b", steps: 3, label: "3" },
      { id: "sprint-3-c", steps: 3, label: "3" },
      { id: "sprint-4-a", steps: 4, label: "4" },
      { id: "sprint-4-b", steps: 4, label: "4" },
      { id: "sprint-5", steps: 5, label: "5" },
    ],
  }),
  treasure: frozenPool({
    id: "treasure",
    label: "寻宝骰",
    description: "每次前进 3–4 格，并必得一项随机奖励",
    probabilitySummary: "3、4 格各三面 · 三种奖励各两面",
    faces: [
      {
        id: "treasure-3-coin-1",
        steps: 3,
        label: "3 + 一枚金币",
        bonus: { coins: 1 },
      },
      {
        id: "treasure-3-coin-2",
        steps: 3,
        label: "3 + 两枚金币",
        bonus: { coins: 2 },
      },
      {
        id: "treasure-3-card-case",
        steps: 3,
        label: "3 + 卡片",
        bonus: { cards: 1 },
      },
      {
        id: "treasure-4-coin-1",
        steps: 4,
        label: "4 + 一枚金币",
        bonus: { coins: 1 },
      },
      {
        id: "treasure-4-coin-2",
        steps: 4,
        label: "4 + 两枚金币",
        bonus: { coins: 2 },
      },
      {
        id: "treasure-4-card-case",
        steps: 4,
        label: "4 + 卡片",
        bonus: { cards: 1 },
      },
    ],
  }),
});

const TREASURE_DICE_POOL_ORDER = Object.freeze([
  TREASURE_DICE_POOLS.steady,
  TREASURE_DICE_POOLS.sprint,
  TREASURE_DICE_POOLS.treasure,
]);

export const FAIRY_STATUS = Object.freeze({
  absent: "absent",
  active: "active",
  sleeping: "sleeping",
  captured: "captured",
});

function sampleIndex(length, random = Math.random) {
  const sample = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return Math.floor(sample * length);
}

function nonNegativeInteger(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}

function positiveRound(value, label = "round") {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

function normalizedCase(cardCase, label = "cardCase") {
  if (cardCase === null || cardCase === undefined) return null;
  if (typeof cardCase === "string" && cardCase.trim()) {
    const cardId = cardCase.trim();
    return { id: `case.${cardId}`, cardId };
  }
  const id = String(cardCase?.id || "").trim();
  const cardId = String(cardCase?.cardId || "").trim();
  if (!id || !cardId) {
    throw new Error(`${label} must contain non-empty id and cardId`);
  }
  return { id, cardId };
}

function resourceBonus(value, label) {
  return nonNegativeInteger(value, label);
}

/**
 * Returns the two unique dice shown for a highest-tier answer.
 * Inject `random` to make a session replayable.
 */
export function generateLegendaryDiceOptions({
  random = Math.random,
  count = DICE_OPTION_COUNT,
} = {}) {
  const optionCount = Math.max(
    1,
    Math.min(
      TREASURE_DICE_POOL_ORDER.length,
      Math.trunc(Number(count) || DICE_OPTION_COUNT),
    ),
  );
  const shuffled = [...TREASURE_DICE_POOL_ORDER];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = sampleIndex(index + 1, random);
    [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
  }
  return shuffled.slice(0, optionCount);
}

export function rollLegendaryDie(poolId, random = Math.random) {
  const pool = TREASURE_DICE_POOLS[poolId];
  if (!pool) throw new Error(`unknown treasure dice pool: ${poolId}`);
  const faceIndex = sampleIndex(pool.faces.length, random);
  const face = pool.faces[faceIndex];
  return {
    poolId: pool.id,
    poolLabel: pool.label,
    faceIndex,
    face,
    steps: face.steps,
    bonus: { ...face.bonus },
  };
}

/**
 * The treasure state intentionally has no team-specific balance. Every accepted
 * answer contributes to this one shared classroom treasury.
 */
function cardIdList(value, label = "cardIds") {
  if (!Array.isArray(value)) return [];
  return value.map((cardId, index) => {
    const normalized = String(cardId || "").trim();
    if (!normalized) throw new Error(`${label}[${index}] must be a non-empty string`);
    return normalized;
  });
}

function normalizedCardCounts(initial = {}) {
  const counts = {};
  cardIdList(initial.collectedCardIds, "collectedCardIds").forEach((cardId) => {
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
      const cardId = String(rawCardId || "").trim();
      if (!cardId) throw new Error("cardCountsById contains an empty card id");
      const count = nonNegativeInteger(rawCount, `cardCountsById.${cardId}`);
      if (count) counts[cardId] = count;
      else delete counts[cardId];
    });
  }
  return counts;
}

export function createTreasureState(initial = {}) {
  const cardCountsById = normalizedCardCounts(initial);
  const collectedCardIds = [...new Set([
    ...cardIdList(initial.collectedCardIds, "collectedCardIds"),
    ...Object.keys(cardCountsById),
  ])].filter((cardId) => cardCountsById[cardId] > 0);
  const lastCardOpenedTurn = initial.lastCardOpenedTurn === null
    || initial.lastCardOpenedTurn === undefined
    ? null
    : nonNegativeInteger(initial.lastCardOpenedTurn, "lastCardOpenedTurn");

  return {
    schemaVersion: "treasure-2",
    scope: "class",
    acceptedTurns: nonNegativeInteger(initial.acceptedTurns, "acceptedTurns"),
    coins: nonNegativeInteger(initial.coins, "coins"),
    collectedCardIds,
    cardCountsById,
    duplicateOpenStreak: nonNegativeInteger(
      initial.duplicateOpenStreak,
      "duplicateOpenStreak",
    ),
    lastCardOpenedTurn,
  };
}

export function selectTreasureCardCase(stateValue, cardCatalogIds, random = Math.random) {
  const state = createTreasureState(stateValue);
  const cardIds = [...new Set(cardIdList(cardCatalogIds, "cardCatalogIds"))];
  if (!cardIds.length) throw new Error("cardCatalogIds must contain at least one card");
  const uncollected = cardIds.filter((cardId) => !state.collectedCardIds.includes(cardId));
  const guaranteedNew = state.duplicateOpenStreak >= 2 && uncollected.length > 0;
  const candidates = guaranteedNew ? uncollected : cardIds;
  const cardId = candidates[sampleIndex(candidates.length, random)];
  return {
    cardCase: { id: `case.${cardId}`, cardId },
    guaranteedNew,
  };
}

function treasureCardCase(state, candidate, cardCatalogIds, random) {
  const incoming = normalizedCase(candidate, "foundCase");
  const catalog = [...new Set(cardIdList(cardCatalogIds, "cardCatalogIds"))];
  if (!catalog.length) {
    if (!incoming) throw new Error("every card must resolve to one card");
    return { cardCase: incoming, guaranteedNew: false };
  }
  if (incoming && !catalog.includes(incoming.cardId)) {
    throw new Error("foundCase.cardId must belong to cardCatalogIds");
  }
  const selection = selectTreasureCardCase(state, catalog, random);
  if (
    selection.guaranteedNew
    && incoming
    && state.collectedCardIds.includes(incoming.cardId)
  ) {
    return selection;
  }
  return {
    cardCase: incoming || selection.cardCase,
    guaranteedNew: selection.guaranteedNew,
  };
}

/**
 * Settles one transaction after movement. Negative rewards are rejected, so
 * callers cannot introduce stealing or resource penalties through this API.
 */
export function settleTreasureTurn(state, {
  acceptedAnswer = false,
  bonusCoins = 0,
  bonusCardCases = 0,
  foundCase = null,
  exchangeCoinsForCard = false,
  cardCatalogIds = [],
  random = Math.random,
} = {}) {
  const next = createTreasureState(state);
  const events = [];
  const coinBonus = resourceBonus(bonusCoins, "bonusCoins");
  const cardCaseBonus = resourceBonus(bonusCardCases, "bonusCardCases");
  if (cardCaseBonus > 1) throw new Error("bonusCardCases must be 0 or 1");
  if (typeof exchangeCoinsForCard !== "boolean") {
    throw new TypeError("exchangeCoinsForCard must be a boolean");
  }

  if (acceptedAnswer) {
    next.acceptedTurns += 1;
  }

  if (coinBonus) {
    next.coins += coinBonus;
    events.push({
      type: "resource_awarded",
      resource: "coin",
      amount: coinBonus,
      source: "turn_bonus",
    });
  }
  const incomingCase = normalizedCase(foundCase, "foundCase");
  const directCaseCount = cardCaseBonus || incomingCase ? 1 : 0;
  const totalCaseCount = directCaseCount + (exchangeCoinsForCard ? 1 : 0);
  if (totalCaseCount > 1) {
    throw new Error("one settlement may open at most one card");
  }

  let exchangeCompleted = false;
  if (exchangeCoinsForCard) {
    if (next.coins < TREASURE_EXCHANGE.coinsPerCard) {
      throw new Error("five coins are required to exchange for one card");
    }
    next.coins -= TREASURE_EXCHANGE.coinsPerCard;
    exchangeCompleted = true;
    events.push({
      type: "resource_exchanged",
      from: "coin",
      fromAmount: TREASURE_EXCHANGE.coinsPerCard,
      to: "card",
      toAmount: 1,
      source: "exchange_station",
    });
  }

  let openedCardId = null;
  let openedCardDuplicate = false;
  let guaranteedNewCard = false;
  if (totalCaseCount === 1) {
    const selection = treasureCardCase(next, incomingCase, cardCatalogIds, random);
    const cardCase = selection.cardCase;
    guaranteedNewCard = selection.guaranteedNew;
    events.push({
      type: "card_awarded",
      resource: "card",
      amount: 1,
      source: exchangeCompleted ? "exchange_station" : "turn_bonus",
      cardCase: { ...cardCase },
    });
    openedCardId = cardCase.cardId;
    openedCardDuplicate = next.collectedCardIds.includes(openedCardId);
    next.cardCountsById[openedCardId] = (next.cardCountsById[openedCardId] || 0) + 1;
    if (openedCardDuplicate) next.duplicateOpenStreak += 1;
    else {
      next.collectedCardIds.push(openedCardId);
      next.duplicateOpenStreak = 0;
    }
    next.lastCardOpenedTurn = next.acceptedTurns;
    events.push({
      type: "card_awarded",
      cardId: openedCardId,
      duplicate: openedCardDuplicate,
      duplicateOpenStreak: next.duplicateOpenStreak,
      guaranteedNew: guaranteedNewCard,
    });
  }

  return {
    state: next,
    events,
    openedCardId,
    openedCardDuplicate,
    guaranteedNewCard,
    exchangeCompleted,
  };
}

export function treasureGoalsForTurns(minTotalTurns = 12) {
  const turns = positiveRound(minTotalTurns, "minTotalTurns");
  return {
    minTotalTurns: turns,
    guaranteedCards: 0,
    targetCards: null,
    cardCap: null,
  };
}

export function createFairyState(initial = {}) {
  const status = initial.status || FAIRY_STATUS.absent;
  if (!Object.values(FAIRY_STATUS).includes(status)) {
    throw new Error(`unknown fairy status: ${status}`);
  }
  const requiresAnchor = status === FAIRY_STATUS.active || status === FAIRY_STATUS.sleeping;
  const anchorId = initial.anchorId === null || initial.anchorId === undefined
    ? null
    : String(initial.anchorId).trim();
  const distance = initial.distance === null || initial.distance === undefined
    ? null
    : nonNegativeInteger(initial.distance, "distance");
  const cardCase = normalizedCase(initial.cardCase);
  if (requiresAnchor && (!anchorId || distance === null || !cardCase)) {
    throw new Error("an active or sleeping fairy requires anchorId, distance, and cardCase");
  }

  return {
    status,
    anchorId,
    distance,
    targetTeamId: initial.targetTeamId
      ? String(initial.targetTeamId)
      : null,
    cardCase,
    moveCount: nonNegativeInteger(initial.moveCount, "moveCount"),
    spawnedRound: initial.spawnedRound === null || initial.spawnedRound === undefined
      ? null
      : positiveRound(initial.spawnedRound, "spawnedRound"),
    lastTransitionRound:
      initial.lastTransitionRound === null || initial.lastTransitionRound === undefined
        ? null
        : positiveRound(initial.lastTransitionRound, "lastTransitionRound"),
    capturedRound: initial.capturedRound === null || initial.capturedRound === undefined
      ? null
      : positiveRound(initial.capturedRound, "capturedRound"),
  };
}

function legalFairyCandidates(candidates, {
  currentAnchorId = null,
  maxDistance = MAX_FAIRY_DISTANCE,
  minDistance = MIN_FAIRY_DISTANCE,
} = {}) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((candidate) => ({
      anchorId: String(candidate?.anchorId || "").trim(),
      distance: Number(candidate?.distance),
      targetTeamId: candidate?.targetTeamId
        ? String(candidate.targetTeamId)
        : null,
    }))
    .filter((candidate) => (
      candidate.anchorId
      && candidate.anchorId !== currentAnchorId
      && Number.isInteger(candidate.distance)
      && candidate.distance >= minDistance
      && candidate.distance <= maxDistance
    ));
}

export function spawnFairy(fairy, {
  round,
  candidates,
  cardCase,
  targetTeamId = null,
  random = Math.random,
} = {}) {
  const current = createFairyState(fairy);
  const currentRound = positiveRound(round);
  if (
    current.status === FAIRY_STATUS.active
    || current.status === FAIRY_STATUS.sleeping
  ) {
    return {
      fairy: current,
      changed: false,
      event: { type: "fairy_spawn_skipped", reason: "fairy_already_present" },
    };
  }

  const legalCandidates = legalFairyCandidates(candidates);
  if (!legalCandidates.length) {
    return {
      fairy: current,
      changed: false,
      event: { type: "fairy_spawn_skipped", reason: "no_legal_anchor" },
    };
  }

  const selected = legalCandidates[sampleIndex(legalCandidates.length, random)];
  const next = createFairyState({
    status: FAIRY_STATUS.active,
    anchorId: selected.anchorId,
    distance: selected.distance,
    targetTeamId: selected.targetTeamId || targetTeamId,
    cardCase: normalizedCase(cardCase),
    moveCount: 0,
    spawnedRound: currentRound,
    lastTransitionRound: currentRound,
  });
  return {
    fairy: next,
    changed: true,
    event: {
      type: "fairy_spawned",
      anchorId: next.anchorId,
      distance: next.distance,
    },
  };
}

/**
 * Call once when a new complete classroom round starts.
 * Move 1 may choose any legal new anchor; move 2 must be closer. On the third
 * eligible round the fairy becomes sleepy and stops moving.
 */
export function advanceFairyRound(fairy, {
  round,
  candidates = [],
  random = Math.random,
} = {}) {
  const current = createFairyState(fairy);
  const currentRound = positiveRound(round);
  if (current.status !== FAIRY_STATUS.active) {
    return {
      fairy: current,
      changed: false,
      event: { type: "fairy_round_skipped", reason: `fairy_${current.status}` },
    };
  }
  if (current.lastTransitionRound !== null && currentRound <= current.lastTransitionRound) {
    return {
      fairy: current,
      changed: false,
      event: { type: "fairy_waiting_full_round", round: currentRound },
    };
  }
  if (current.moveCount >= 2) {
    const sleeping = createFairyState({
      ...current,
      status: FAIRY_STATUS.sleeping,
      lastTransitionRound: currentRound,
    });
    return {
      fairy: sleeping,
      changed: true,
      event: { type: "fairy_fell_asleep", anchorId: sleeping.anchorId },
    };
  }

  const legalCandidates = legalFairyCandidates(candidates, {
    currentAnchorId: current.anchorId,
  });
  const isCloserMove = current.moveCount === 1;
  const eligibleCandidates = isCloserMove
    ? legalCandidates.filter((candidate) => candidate.distance < current.distance)
    : legalCandidates;
  const selected = eligibleCandidates.length
    ? eligibleCandidates[sampleIndex(eligibleCandidates.length, random)]
    : null;

  const next = createFairyState({
    ...current,
    anchorId: selected?.anchorId || current.anchorId,
    distance: selected?.distance ?? current.distance,
    targetTeamId: selected?.targetTeamId || current.targetTeamId,
    moveCount: current.moveCount + 1,
    lastTransitionRound: currentRound,
  });
  return {
    fairy: next,
    changed: Boolean(selected),
    event: selected
      ? {
        type: "fairy_moved",
        anchorId: next.anchorId,
        distance: next.distance,
        closer: isCloserMove,
        moveCount: next.moveCount,
      }
      : {
        type: "fairy_stayed",
        reason: isCloserMove ? "no_closer_anchor" : "no_legal_anchor",
        moveCount: next.moveCount,
      },
  };
}

export function holdFairyForRound(fairy, round) {
  const current = createFairyState(fairy);
  const currentRound = positiveRound(round);
  if (current.status !== FAIRY_STATUS.active) return current;
  return createFairyState({
    ...current,
    lastTransitionRound: Math.max(current.lastTransitionRound || 0, currentRound),
  });
}

export function captureFairy(fairy, round) {
  const current = createFairyState(fairy);
  const currentRound = positiveRound(round);
  if (
    current.status !== FAIRY_STATUS.active
    && current.status !== FAIRY_STATUS.sleeping
  ) {
    return {
      fairy: current,
      changed: false,
      capturedCase: null,
      event: { type: "fairy_capture_skipped", reason: `fairy_${current.status}` },
    };
  }
  const capturedCase = { ...current.cardCase };
  const captured = createFairyState({
    ...current,
    status: FAIRY_STATUS.captured,
    anchorId: null,
    distance: null,
    cardCase: null,
    capturedRound: currentRound,
  });
  return {
    fairy: captured,
    changed: true,
    capturedCase,
    event: { type: "fairy_captured", cardCase: capturedCase },
  };
}
