const SUPPORTED_RESOURCES = new Set(["coin", "star", "key"]);

function positiveAmount(value) {
  const amount = Number(value);
  return Number.isInteger(amount) && amount > 0 ? amount : 0;
}

/**
 * Turns committed owner-safe ledger events into presentation-only collection cues.
 *
 * The source event remains the authority. DOM positions and animation outcomes
 * never create rewards or alter balances.
 */
export function buildCollectionPresentationEvents({
  events = [],
  landingNodeId = null,
  fairyCaptureNodeId = null,
} = {}) {
  if (!Array.isArray(events)) return [];

  return events.flatMap((event, index) => {
    if (event?.type === "resource_awarded") {
      const resource = String(event.resource || "");
      const amount = positiveAmount(event.amount);
      const ownerId = String(event.ownerId || "");
      if (!SUPPORTED_RESOURCES.has(resource) || !amount || !ownerId) return [];
      const source = event.source === "answer"
        ? "answer"
        : ["dice", "teacher_dice"].includes(event.source)
          ? "dice"
          : event.source === "milestone"
            ? "milestone"
            : "landing";
      return [{
        id: event.eventId || `resource-awarded:${index}:${ownerId}:${resource}`,
        settlementId: event.settlementId || null,
        kind: "resource",
        ownerId,
        resource,
        amount,
        source,
        sourceResource: null,
        originNodeId: event.originNodeId
          || (source === "landing" ? landingNodeId : null),
        assetsBefore: event.assetsBefore || null,
        assetsAfter: event.assetsAfter || null,
      }];
    }

    if (event?.type === "resource_converted" || event?.type === "resource_exchanged") {
      const from = String(event.from || "");
      const to = String(event.to || "");
      const amount = positiveAmount(event.toAmount ?? event.amount);
      const ownerId = String(event.ownerId || "");
      if (
        !SUPPORTED_RESOURCES.has(from)
        || !SUPPORTED_RESOURCES.has(to)
        || !amount
        || !ownerId
      ) return [];
      return [{
        id: event.eventId || `resource-converted:${index}:${ownerId}:${from}:${to}`,
        settlementId: event.settlementId || null,
        kind: "conversion",
        ownerId,
        resource: to,
        amount,
        source: "account",
        sourceResource: from,
        originNodeId: null,
        assetsBefore: event.assetsBefore || null,
        assetsAfter: event.assetsAfter || null,
      }];
    }

    if (["card_awarded", "card_opened"].includes(event?.type)) {
      const ownerId = String(event.ownerId || "");
      if (!ownerId) return [];
      return [{
        id: event.eventId || `card-opened:${index}:${ownerId}`,
        settlementId: event.settlementId || null,
        kind: "card",
        ownerId,
        resource: "card",
        amount: 1,
        source: event.source === "dice" ? "dice" : "landing",
        sourceResource: null,
        originNodeId: event.originNodeId || fairyCaptureNodeId || null,
        assetsBefore: event.assetsBefore || null,
        assetsAfter: event.assetsAfter || null,
      }];
    }

    return [];
  });
}
