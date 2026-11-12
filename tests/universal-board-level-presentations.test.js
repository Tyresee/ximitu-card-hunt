import test from "node:test";
import assert from "node:assert/strict";

import {
  BOARD_TEMPLATE,
} from "../public/prototypes/universal-board/packs.js";
import {
  LEVEL_ONE,
  REWARD_DEFINITIONS,
} from "../public/prototypes/universal-board/level-one.js";
import {
  LEVEL_ONE_NODE_PRESENTATIONS,
  LEVEL_ONE_ZONE_NAMES,
  presentationForLevelOneNode,
} from "../public/prototypes/universal-board/level-one-presentations.js";

const VISIBLE_FIELDS = Object.freeze([
  "label",
  "teaser",
  "firstCopy",
  "repeatCopy",
  "visualKind",
  "badge",
]);

const PRESENTATION_FIELDS = Object.freeze([
  "nodeId",
  "zoneId",
  "zoneName",
  "rewardRef",
  "semanticType",
  ...VISIBLE_FIELDS,
].sort());

test("level-one presentations cover the exact 61-node board and binding set", () => {
  const boardNodeIds = BOARD_TEMPLATE.nodes.map(({ id }) => id).sort();
  const bindingNodeIds = Object.keys(LEVEL_ONE.nodeBindings).sort();
  const presentationNodeIds = Object.keys(LEVEL_ONE_NODE_PRESENTATIONS).sort();

  assert.equal(presentationNodeIds.length, 61);
  assert.deepEqual(presentationNodeIds, boardNodeIds);
  assert.deepEqual(presentationNodeIds, bindingNodeIds);
});

test("every visible presentation field is concrete, node-specific, and unique", () => {
  const presentations = Object.values(LEVEL_ONE_NODE_PRESENTATIONS);

  for (const field of VISIBLE_FIELDS) {
    const values = presentations.map((presentation) => presentation[field]);
    assert.equal(
      values.every((value) => typeof value === "string" && value.trim().length > 0),
      true,
      `${field} must be a non-empty string on every node`,
    );
    assert.equal(
      new Set(values).size,
      presentations.length,
      `${field} must be unique across all 61 nodes`,
    );
  }

  for (const presentation of presentations) {
    const visibleCopy = VISIBLE_FIELDS
      .map((field) => presentation[field])
      .join(" ");
    assert.doesNotMatch(
      visibleCopy,
      /朗读任务|任务格|学习格|编号|(?:^|\s)n\d+[a-z]?(?:\s|$)/iu,
      `${presentation.nodeId} must not expose generic numbered-task copy`,
    );
    assert.match(
      presentation.visualKind,
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      `${presentation.nodeId}.visualKind must be a stable kebab-case art hook`,
    );
  }
});

test("presentations derive reward identity without copying settlement rules", () => {
  const forbiddenRuleFields = [
    "resources",
    "resourcePolicy",
    "event",
    "choiceCount",
    "worldTransition",
  ];

  for (const [nodeId, presentation] of Object.entries(LEVEL_ONE_NODE_PRESENTATIONS)) {
    const binding = LEVEL_ONE.nodeBindings[nodeId];
    const definition = REWARD_DEFINITIONS[binding.rewardRef];

    assert.equal(presentation.rewardRef, binding.rewardRef);
    assert.equal(presentation.semanticType, definition.semanticType);
    assert.deepEqual(Object.keys(presentation).sort(), PRESENTATION_FIELDS);
    forbiddenRuleFields.forEach((field) => {
      assert.equal(
        Object.hasOwn(presentation, field),
        false,
        `${nodeId} presentation must not duplicate ${field}`,
      );
    });
  }
});

test("ordinary nodes never promise resources or choices that runtime will not settle", () => {
  const impossibleSettlementCopy = (
    /(?:当场打开|收入当前玩家|按当前(?:发布)?配置(?:送出|结算)|当前发布奖励|请选(?:择|定)|等待你的选择|选卡机会)/u
  );

  LEVEL_ONE.ordinaryNodeIds.forEach((nodeId) => {
    const presentation = LEVEL_ONE_NODE_PRESENTATIONS[nodeId];
    const visibleCopy = VISIBLE_FIELDS
      .map((field) => presentation[field])
      .join(" ");
    assert.doesNotMatch(
      visibleCopy,
      impossibleSettlementCopy,
      `${nodeId} is an ordinary node and must not promise a resource or choice`,
    );
  });
});

test("the four named zones end at 星门前哨 with the intended node distribution", () => {
  assert.deepEqual(LEVEL_ONE_ZONE_NAMES, {
    "zone-01": "启航海湾",
    "zone-02": "风帆高地",
    "zone-03": "彩虹峡谷",
    "zone-04": "星门前哨",
  });

  const zoneCounts = Object.values(LEVEL_ONE_NODE_PRESENTATIONS).reduce(
    (counts, presentation) => {
      counts[presentation.zoneId] = (counts[presentation.zoneId] || 0) + 1;
      assert.equal(
        presentation.zoneName,
        LEVEL_ONE_ZONE_NAMES[presentation.zoneId],
      );
      return counts;
    },
    {},
  );

  assert.deepEqual(zoneCounts, {
    "zone-01": 24,
    "zone-02": 14,
    "zone-03": 14,
    "zone-04": 9,
  });
});

test("n43 is 世界展览舱 and n49 is the forward-only 前进星门", () => {
  const exhibition = presentationForLevelOneNode("n43");
  assert.equal(exhibition.label, "世界展览舱");
  assert.equal(exhibition.zoneName, "星门前哨");
  assert.equal(exhibition.rewardRef, "reward.display.album-spotlight.v1");

  const portal = presentationForLevelOneNode("n49");
  assert.equal(portal.label, "前进星门");
  assert.equal(portal.zoneName, "星门前哨");
  assert.equal(portal.rewardRef, "world.portal.forward.v1");
  assert.match(portal.teaser, /没有返回起点/);
  assert.match(portal.firstCopy, /下一片可扩展世界/);
});

test("presentation lookup is immutable and preserves an explicit fallback", () => {
  assert.equal(Object.isFrozen(LEVEL_ONE_ZONE_NAMES), true);
  assert.equal(Object.isFrozen(LEVEL_ONE_NODE_PRESENTATIONS), true);
  Object.values(LEVEL_ONE_NODE_PRESENTATIONS).forEach((presentation) => {
    assert.equal(Object.isFrozen(presentation), true);
  });

  assert.equal(presentationForLevelOneNode("missing"), null);
  const fallback = Object.freeze({ kind: "fallback" });
  assert.equal(presentationForLevelOneNode("missing", fallback), fallback);
  assert.equal(
    presentationForLevelOneNode("n01"),
    LEVEL_ONE_NODE_PRESENTATIONS.n01,
  );
});
