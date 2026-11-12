import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCollectionPresentationEvents,
} from "../public/prototypes/universal-board/collection-presentation.js";

test("committed personal ledger events keep owner, source and balance transitions", () => {
  const presentations = buildCollectionPresentationEvents({
    landingNodeId: "n07a",
    fairyCaptureNodeId: "n08",
    events: [
      {
        eventId: "turn-1:event:1",
        settlementId: "turn-1",
        type: "resource_awarded",
        ownerId: "seat-1",
        resource: "coin",
        amount: 1,
        source: "answer",
        assetsBefore: { coins: 0, stars: 0, keys: 0, cards: 0 },
        assetsAfter: { coins: 1, stars: 0, keys: 0, cards: 0 },
      },
      {
        eventId: "turn-1:event:2",
        settlementId: "turn-1",
        type: "resource_awarded",
        ownerId: "seat-1",
        resource: "star",
        amount: 2,
        source: "dice",
        assetsBefore: { coins: 1, stars: 0, keys: 0, cards: 0 },
        assetsAfter: { coins: 1, stars: 2, keys: 0, cards: 0 },
      },
      {
        eventId: "turn-1:event:3",
        settlementId: "turn-1",
        type: "resource_awarded",
        ownerId: "seat-1",
        resource: "key",
        amount: 1,
        source: "board_node",
        assetsBefore: { coins: 1, stars: 2, keys: 0, cards: 0 },
        assetsAfter: { coins: 1, stars: 2, keys: 1, cards: 0 },
      },
      {
        eventId: "turn-1:event:4",
        settlementId: "turn-1",
        type: "resource_converted",
        ownerId: "seat-1",
        from: "coin",
        to: "star",
        amount: 1,
        assetsBefore: { coins: 3, stars: 2, keys: 1, cards: 0 },
        assetsAfter: { coins: 0, stars: 3, keys: 1, cards: 0 },
      },
      {
        eventId: "turn-1:event:5",
        settlementId: "turn-1",
        type: "card_awarded",
        ownerId: "seat-1",
        cardId: "card-1",
        assetsBefore: { coins: 0, stars: 0, keys: 1, cards: 0 },
        assetsAfter: { coins: 0, stars: 0, keys: 0, cards: 1 },
      },
    ],
  });

  assert.deepEqual(
    presentations.map((presentation) => ({
      id: presentation.id,
      ownerId: presentation.ownerId,
      kind: presentation.kind,
      resource: presentation.resource,
      amount: presentation.amount,
      source: presentation.source,
      sourceResource: presentation.sourceResource,
      originNodeId: presentation.originNodeId,
      assetsAfter: presentation.assetsAfter,
    })),
    [
      {
        id: "turn-1:event:1",
        ownerId: "seat-1",
        kind: "resource",
        resource: "coin",
        amount: 1,
        source: "answer",
        sourceResource: null,
        originNodeId: null,
        assetsAfter: { coins: 1, stars: 0, keys: 0, cards: 0 },
      },
      {
        id: "turn-1:event:2",
        ownerId: "seat-1",
        kind: "resource",
        resource: "star",
        amount: 2,
        source: "dice",
        sourceResource: null,
        originNodeId: null,
        assetsAfter: { coins: 1, stars: 2, keys: 0, cards: 0 },
      },
      {
        id: "turn-1:event:3",
        ownerId: "seat-1",
        kind: "resource",
        resource: "key",
        amount: 1,
        source: "landing",
        sourceResource: null,
        originNodeId: "n07a",
        assetsAfter: { coins: 1, stars: 2, keys: 1, cards: 0 },
      },
      {
        id: "turn-1:event:4",
        ownerId: "seat-1",
        kind: "conversion",
        resource: "star",
        amount: 1,
        source: "account",
        sourceResource: "coin",
        originNodeId: null,
        assetsAfter: { coins: 0, stars: 3, keys: 1, cards: 0 },
      },
      {
        id: "turn-1:event:5",
        ownerId: "seat-1",
        kind: "card",
        resource: "card",
        amount: 1,
        source: "landing",
        sourceResource: null,
        originNodeId: "n08",
        assetsAfter: { coins: 0, stars: 0, keys: 0, cards: 1 },
      },
    ],
  );
});

test("presentation mapping ignores uncommitted, unsupported or non-positive rewards", () => {
  assert.deepEqual(buildCollectionPresentationEvents({
    events: [
      { type: "resource_awarded", resource: "coin", amount: 0, source: "answer" },
      {
        type: "resource_awarded",
        ownerId: "seat-1",
        resource: "unknown",
        amount: 2,
        source: "turn_bonus",
      },
      { type: "fairy_spawned", anchorId: "n14" },
      { type: "card_redirected", reason: "one_case_already_waiting" },
      null,
    ],
  }), []);
  assert.deepEqual(buildCollectionPresentationEvents({ events: null }), []);
});
