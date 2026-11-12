import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
  EXPANSION_WORLD_LANDING_PROFILES,
  EXPANSION_WORLD_LEVEL_PACK,
} from "../public/prototypes/universal-board/expansion-world.js";
import {
  EXPANSION_WORLD_NODE_PRESENTATIONS,
  EXPANSION_WORLD_ZONE_NAMES,
  presentationForExpansionNode,
} from "../public/prototypes/universal-board/expansion-world-presentations.js";

const VISIBLE_FIELDS = Object.freeze([
  "label",
  "teaser",
  "firstCopy",
  "repeatCopy",
  "badge",
  "visualKind",
]);

const PRESENTATION_FIELDS = Object.freeze([
  "nodeId",
  "zoneId",
  "zoneName",
  "rewardRef",
  "semanticType",
  ...VISIBLE_FIELDS,
].sort());

test("expansion presentations cover the exact 62-node board and binding set", () => {
  const boardNodeIds = EXPANSION_WORLD_BOARD_TEMPLATE.nodes
    .map(({ id }) => id)
    .sort();
  const bindingNodeIds = Object.keys(EXPANSION_WORLD_LEVEL_PACK.nodeBindings).sort();
  const presentationNodeIds = Object.keys(EXPANSION_WORLD_NODE_PRESENTATIONS).sort();

  assert.equal(presentationNodeIds.length, 62);
  assert.deepEqual(presentationNodeIds, boardNodeIds);
  assert.deepEqual(presentationNodeIds, bindingNodeIds);
});

test("every visible expansion presentation is concrete and unique to its node", () => {
  const presentations = Object.values(EXPANSION_WORLD_NODE_PRESENTATIONS);

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
      `${field} must be unique across all 62 nodes`,
    );
  }

  for (const presentation of presentations) {
    const visibleCopy = VISIBLE_FIELDS
      .map((field) => presentation[field])
      .join(" ");
    assert.doesNotMatch(
      visibleCopy,
      /朗读任务|任务格|学习格|编号|w2n\d+|回到起点|回起点|完成本圈|一圈结束/iu,
      `${presentation.nodeId} must use world-specific forward-only copy`,
    );
    assert.match(
      presentation.visualKind,
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      `${presentation.nodeId}.visualKind must be a stable kebab-case art hook`,
    );
  }
});

test("presentation identity comes from existing landing profiles without copying rules", () => {
  const forbiddenRuleFields = [
    "allowedInputs",
    "rewards",
    "resources",
    "mapEffectRef",
    "firstStateChanges",
    "transportTargetId",
    "trigger",
    "direction",
    "settlementPolicy",
  ];
  const nodeById = new Map(
    EXPANSION_WORLD_BOARD_TEMPLATE.nodes.map((node) => [node.id, node]),
  );

  for (const [nodeId, presentation] of Object.entries(
    EXPANSION_WORLD_NODE_PRESENTATIONS,
  )) {
    const node = nodeById.get(nodeId);
    const binding = EXPANSION_WORLD_LEVEL_PACK.nodeBindings[nodeId];
    const profile = EXPANSION_WORLD_LANDING_PROFILES[binding.rewardRef];

    assert.ok(node);
    assert.equal(presentation.rewardRef, binding.rewardRef);
    assert.equal(presentation.semanticType, profile.kind);
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

test("all four expansion regions keep their intended child-facing identities", () => {
  assert.deepEqual(EXPANSION_WORLD_ZONE_NAMES, {
    "zone-05": "星门浮岛",
    "zone-06": "云鲸航道",
    "zone-07": "极光晶林",
    "zone-08": "月轮遗迹",
  });

  const zoneCounts = Object.values(EXPANSION_WORLD_NODE_PRESENTATIONS).reduce(
    (counts, presentation) => {
      counts[presentation.zoneId] = (counts[presentation.zoneId] || 0) + 1;
      assert.equal(
        presentation.zoneName,
        EXPANSION_WORLD_ZONE_NAMES[presentation.zoneId],
      );
      return counts;
    },
    {},
  );

  assert.deepEqual(zoneCounts, {
    "zone-05": 16,
    "zone-06": 17,
    "zone-07": 16,
    "zone-08": 13,
  });
});

test("arrival, branches, transports, discoveries, and map mechanisms stay semantically exact", () => {
  const arrival = presentationForExpansionNode("w2n01");
  assert.equal(arrival.rewardRef, "world2.ordinary.v1");
  assert.equal(arrival.semanticType, "ordinary");
  assert.match(arrival.firstCopy, /穿过星门/);

  const branchExpectations = {
    w2n04: /彗星快行.*远方回声/,
    w2n18: /泡泡升空.*云鲸信号/,
    w2n32: /向上观星.*寻找光桥树/,
    w2n45: /锻造月钥.*月桂星盏/,
  };
  for (const [nodeId, copyPattern] of Object.entries(branchExpectations)) {
    const presentation = presentationForExpansionNode(nodeId);
    assert.equal(presentation.semanticType, "route-choice");
    assert.match(presentation.firstCopy, copyPattern);
  }

  assert.equal(
    presentationForExpansionNode("w2n36").semanticType,
    "conditional-route-choice",
  );
  assert.match(presentationForExpansionNode("w2n36").teaser, /苏醒后才会凝实/);

  assert.equal(
    presentationForExpansionNode("w2n06a").rewardRef,
    "world2.transport.comet-lift.v1",
  );
  assert.match(presentationForExpansionNode("w2n06a").firstCopy, /越过浮岛裂隙/);
  assert.equal(
    presentationForExpansionNode("w2n20a").rewardRef,
    "world2.transport.bubble-geyser.v1",
  );
  assert.match(presentationForExpansionNode("w2n20a").firstCopy, /越过鲸背航道/);

  const discoveryNodeIds = ["w2n03", "w2n17", "w2n31", "w2n44"];
  discoveryNodeIds.forEach((nodeId) => {
    const presentation = presentationForExpansionNode(nodeId);
    assert.equal(presentation.semanticType, "discovery");
    assert.match(presentation.firstCopy, /世界图鉴/);
    assert.match(presentation.repeatCopy, /已收录/);
  });

  const mapEffectNodeIds = [
    "w2n05b",
    "w2n10",
    "w2n19b",
    "w2n25",
    "w2n33a",
    "w2n35b",
    "w2n39",
    "w2n47b",
  ];
  mapEffectNodeIds.forEach((nodeId) => {
    assert.equal(
      presentationForExpansionNode(nodeId).semanticType,
      "map-effect",
    );
  });
  assert.match(presentationForExpansionNode("w2n35b").firstCopy, /极光桥.*苏醒/);
  assert.match(presentationForExpansionNode("w2n39").firstCopy, /月轮遗迹.*前进航线/);
});

test("w2n51 celebrates the atlas and w2n52 only opens the way forward", () => {
  const gallery = presentationForExpansionNode("w2n51");
  assert.equal(gallery.label, "云外世界展廊");
  assert.equal(gallery.semanticType, "collection-gallery");
  assert.match(gallery.firstCopy, /图鉴发现/);

  const portal = presentationForExpansionNode("w2n52");
  assert.equal(portal.label, "前进月门");
  assert.equal(portal.rewardRef, "world2.forward-portal.v1");
  assert.equal(portal.semanticType, "world-transition");
  assert.match(portal.teaser, /从未到过的天空.*更远处延伸/);
  assert.match(portal.firstCopy, /下一片可扩展世界继续旅程/);
  assert.match(portal.repeatCopy, /继续向前展开/);
  assert.doesNotMatch(
    `${portal.label} ${portal.teaser} ${portal.firstCopy} ${portal.repeatCopy}`,
    /回到起点|回起点|完成本圈|一圈结束/iu,
  );
});

test("expansion presentation lookup is immutable and preserves an explicit fallback", () => {
  assert.equal(Object.isFrozen(EXPANSION_WORLD_ZONE_NAMES), true);
  assert.equal(Object.isFrozen(EXPANSION_WORLD_NODE_PRESENTATIONS), true);
  Object.values(EXPANSION_WORLD_NODE_PRESENTATIONS).forEach((presentation) => {
    assert.equal(Object.isFrozen(presentation), true);
  });

  assert.equal(presentationForExpansionNode("missing"), null);
  const fallback = Object.freeze({ kind: "fallback" });
  assert.equal(presentationForExpansionNode("missing", fallback), fallback);
  assert.equal(
    presentationForExpansionNode("w2n01"),
    EXPANSION_WORLD_NODE_PRESENTATIONS.w2n01,
  );
});
