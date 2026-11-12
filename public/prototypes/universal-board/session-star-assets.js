import {
  createPlayerAssetAccount as legacyAccount,
  createPlayerAssetsLedger as legacyLedger,
} from "./player-assets-core.js";

export const STAR_ECONOMY_VERSION = "session-stars.v1";
export const PLAYER_ASSET_EXCHANGE = Object.freeze({ coinsPerStar: 5 });

function count(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0 || number > 1_000_000) {
    throw new Error(`${label} must be a bounded non-negative integer`);
  }
  return number;
}

export function createStarAccount(initial = {}) {
  if (initial.economyVersion === STAR_ECONOMY_VERSION) {
    return {
      economyVersion: STAR_ECONOMY_VERSION,
      coins: count(initial.coins, "coins"),
      stars: count(initial.stars, "stars"),
      acceptedTurns: count(initial.acceptedTurns, "acceptedTurns"),
      migratedCards: count(initial.migratedCards, "migratedCards"),
    };
  }
  const old = legacyAccount(initial);
  const migratedCards = count(Object.values(old.cardCountsById)
    .reduce((total, amount) => total + amount, old.uncataloguedCards), "legacy cards");
  return {
    economyVersion: STAR_ECONOMY_VERSION,
    coins: count(old.coins, "coins"),
    stars: migratedCards,
    acceptedTurns: count(old.acceptedTurns, "acceptedTurns"),
    migratedCards,
  };
}

export function createPlayerAssetsLedger(options = {}) {
  const base = legacyLedger({ ...options, playerAssetsById: {} });
  const allowed = new Set(base.playerOrder);
  if (Object.keys(options.playerAssetsById || {}).some((id) => !allowed.has(id))) {
    throw new Error("unknown player in star ledger");
  }
  const accounts = Object.fromEntries(base.playerOrder.map((id) => [
    id, createStarAccount(options.playerAssetsById?.[id]),
  ]));
  return {
    ...base,
    schemaVersion: "player-assets.ledger.v3",
    economyVersion: STAR_ECONOMY_VERSION,
    playerAssetsById: accounts,
    acceptedTurnsTotal: Object.values(accounts).reduce((total, account) => total + account.acceptedTurns, 0),
  };
}

export function playerAssetSnapshot(account) {
  const normalized = createStarAccount(account);
  return { coins: normalized.coins, stars: normalized.stars };
}

export function playerAssetsView(ledger) {
  return Object.fromEntries(ledger.playerOrder.map((id) => [id,
    playerAssetSnapshot(ledger.playerAssetsById[id]),
  ]));
}

// Shared by browser settlement and server replay. No card catalog or random draw.
export function starAccountAfterEvents(initial, events, { acceptedAnswer = false } = {}) {
  const account = createStarAccount(initial);
  if (typeof acceptedAnswer !== "boolean") throw new Error("acceptedAnswer must be boolean");
  if (!Array.isArray(events) || events.length > 64) throw new Error("invalid star events");
  if (acceptedAnswer) account.acceptedTurns += 1;
  for (const event of events) {
    if (event.type === "resource_awarded") {
      // Only the versioned teacher die has a four-coin face. Voice dice and
      // landing rewards retain their existing bounds in browser AND server replay.
      const limit = event.resource === "coin" ? (event.source === "teacher_dice" ? 4 : 3)
        : event.resource === "star" ? 1 : 0;
      if (!Number.isInteger(event.amount) || event.amount < 1 || event.amount > limit) {
        throw new Error("invalid star economy reward");
      }
      account[event.resource === "coin" ? "coins" : "stars"] += event.amount;
    } else if (event.type === "resource_exchanged") {
      if (event.from !== "coin" || event.to !== "star" || event.fromAmount !== 5
        || event.toAmount !== 1 || account.coins < 5) throw new Error("invalid coin to star exchange");
      account.coins -= 5;
      account.stars += 1;
    } else if (event.type === "game_ended") {
      // Closing a game changes its lifecycle, never its balances.
    } else if (!["world_discovery_collected", "world_gallery_opened"].includes(event.type)) {
      throw new Error(`unsupported star event: ${event.type}`);
    }
  }
  return createStarAccount(account);
}

export function settlePlayerAssetTurn(ledger, {
  settlementId, ownerId, acceptedAnswer = false, rewards = [], exchangeCoinsForStar = false,
} = {}) {
  const normalized = createPlayerAssetsLedger({ ...ledger, playerIds: ledger.playerOrder });
  if (typeof settlementId !== "string" || !settlementId.trim()) throw new Error("settlementId is required");
  if (!normalized.playerAssetsById[ownerId]) throw new Error("unknown asset owner");
  if (typeof exchangeCoinsForStar !== "boolean") throw new Error("exchangeCoinsForStar must be boolean");
  const duplicate = normalized.processedSettlementIds.includes(settlementId);
  const result = { ledger: normalized, ownerId, duplicate, events: [], openedCards: [], exchangeCompleted: false };
  if (duplicate) return result;
  if (!Array.isArray(rewards)) throw new Error("rewards must be an array");
  let account = starAccountAfterEvents(normalized.playerAssetsById[ownerId], [], { acceptedAnswer });
  const emit = (event) => {
    const before = playerAssetSnapshot(account);
    account = starAccountAfterEvents(account, [event]);
    result.events.push({ ...event, ownerId, settlementId,
      eventId: `${settlementId}:event:${result.events.length + 1}`,
      assetsBefore: before, assetsAfter: playerAssetSnapshot(account) });
  };
  for (const reward of rewards) {
    if (reward.resource === "none" && reward.amount === 0) continue;
    emit({ type: "resource_awarded", resource: reward.resource, amount: reward.amount,
      source: reward.source || "board_node", originNodeId: reward.originNodeId || null });
  }
  if (exchangeCoinsForStar) emit({ type: "resource_exchanged", from: "coin", fromAmount: 5,
    to: "star", toAmount: 1, source: "exchange_station", originNodeId: null });
  result.ledger = createPlayerAssetsLedger({
    ...normalized, playerIds: normalized.playerOrder,
    playerAssetsById: { ...normalized.playerAssetsById, [ownerId]: account },
    processedSettlementIds: [...normalized.processedSettlementIds, settlementId],
  });
  result.exchangeCompleted = exchangeCoinsForStar;
  return result;
}
