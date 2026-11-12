import test from "node:test";
import assert from "node:assert/strict";

import {
  buildActivityPresentation,
} from "../public/prototypes/universal-board/activity-presentation.js";

function activity(overrides = {}) {
  return {
    templateId: "repair-together.v1",
    phases: [
      "announce",
      "prepare",
      "physical-action",
      "designated-speech",
      "teacher-confirm",
      "celebrate",
    ],
    materialTags: ["cards.flashcards", "board.whiteboard"],
    content: {
      title: "空间信号故障",
      instruction: "用卡片或白板修复位置关系，再说出完整句子。",
      challenge: "The ball is on the chair.",
      target: "The ball is under the chair.",
    },
    ...overrides,
  };
}

test("repair presentation makes the error, repair action, speaker and outcome explicit", () => {
  const presentation = buildActivityPresentation(activity(), {
    actorName: "Mia",
    landedSpaceLabel: "云桥教学格",
  });

  assert.equal(presentation.kicker, "教学事件 · 修复任务 · 云桥教学格");
  assert.equal(presentation.title, "空间信号故障");
  assert.match(presentation.story, /Mia来到云桥教学格/);
  assert.match(presentation.firstAction, /The ball is on the chair/);
  assert.equal(presentation.steps.length, 4);
  assert.deepEqual(
    presentation.steps.map(({ id }) => id),
    ["announce", "physical-action", "designated-speech", "teacher-confirm"],
  );
  assert.match(presentation.steps[1].detail, /闪卡、白板/);
  assert.match(presentation.steps[1].detail, /The ball is on the chair/);
  assert.match(presentation.steps[1].detail, /The ball is under the chair/);
  assert.deepEqual(presentation.materials, [
    { tag: "cards.flashcards", label: "闪卡", icon: "▤" },
    { tag: "board.whiteboard", label: "白板", icon: "▣" },
  ]);
  assert.equal(presentation.target, "The ball is under the chair.");
  assert.equal(presentation.challenge, "The ball is on the chair.");
  assert.match(presentation.outcome, /Mia/);
  assert.match(presentation.outcome, /老师确认后返回棋盘/);
  assert.equal(presentation.actorName, "Mia");
  assert.equal(presentation.landedSpaceLabel, "云桥教学格");
});

test("draw presentation only names materials supplied by the activity", () => {
  const presentation = buildActivityPresentation(activity({
    templateId: "draw-and-explain.v1",
    phases: ["announce", "draw", "individual-speech", "teacher-confirm", "celebrate"],
    materialTags: ["drawing.paper"],
    content: {
      title: "画出新的位置",
      instruction: "画出一个物体的位置，再用完整句子描述。",
      target: "The bag is next to the desk.",
    },
  }), { actorName: "Leo" });

  assert.equal(presentation.kicker, "教学事件 · 绘画任务");
  assert.deepEqual(
    presentation.steps.map(({ id }) => id),
    ["announce", "draw", "individual-speech", "teacher-confirm"],
  );
  assert.match(presentation.steps[1].detail, /画纸/);
  assert.doesNotMatch(presentation.steps[1].detail, /彩笔|白板|闪卡/);
  assert.deepEqual(presentation.materials, [
    { tag: "drawing.paper", label: "画纸", icon: "□" },
  ]);
});

test("draw presentation remains actionable without inventing paper or color tools", () => {
  const presentation = buildActivityPresentation(activity({
    templateId: "draw-and-explain.v1",
    phases: ["announce", "draw", "individual-speech", "teacher-confirm"],
    materialTags: [],
    content: {
      title: "设计植物生存舱",
      instruction: "画出植物需要的条件，再解释自己增加的一项。",
      target: "Plants need light and water.",
    },
  }));

  assert.deepEqual(presentation.materials, []);
  assert.doesNotMatch(
    presentation.steps.map(({ detail }) => detail).join(" "),
    /画纸|彩笔|白板|闪卡|神秘袋/,
  );
  assert.match(presentation.steps[1].detail, /按题目要求/);
});

test("fetch presentation names the provided search sources and the exact speaking target", () => {
  const presentation = buildActivityPresentation(activity({
    templateId: "physical-fetch.v1",
    phases: ["announce", "find", "individual-speech", "teacher-confirm", "celebrate"],
    materialTags: ["cards.flashcards", "bag.mystery"],
    content: {
      title: "动作线索搜寻",
      instruction: "找到正确动作线索，按顺序表演并说完整句子。",
      target: "He walks to school.",
    },
  }), { actorName: "Ava" });

  assert.equal(presentation.kicker, "教学事件 · 寻找任务");
  assert.deepEqual(
    presentation.steps.map(({ id }) => id),
    ["announce", "find", "individual-speech", "teacher-confirm"],
  );
  assert.match(presentation.steps[1].detail, /闪卡、神秘袋/);
  assert.match(presentation.steps[1].detail, /He walks to school/);
  assert.match(presentation.steps[2].detail, /Ava/);
  assert.deepEqual(
    presentation.materials.map(({ tag }) => tag),
    ["cards.flashcards", "bag.mystery"],
  );
});

test("sort presentation describes classification before the child explains it", () => {
  const presentation = buildActivityPresentation(activity({
    templateId: "sort-and-say.v1",
    phases: ["announce", "sort", "individual-speech", "teacher-confirm", "celebrate"],
    materialTags: ["cards.flashcards", "board.whiteboard"],
    content: {
      title: "物质分类站",
      instruction: "把卡片分到 solid、liquid、gas，再解释一张。",
      target: "Water is a liquid.",
    },
  }), { actorName: "Tom" });

  assert.equal(presentation.kicker, "教学事件 · 分类任务");
  assert.equal(presentation.steps[1].label, "逐一分类");
  assert.match(presentation.steps[1].detail, /题目给出的类别/);
  assert.match(presentation.steps[2].detail, /Tom/);
  assert.match(presentation.steps[2].detail, /Water is a liquid/);
  presentation.steps.forEach((step) => {
    assert.equal(typeof step.id, "string");
    assert.equal(typeof step.label, "string");
    assert.equal(typeof step.detail, "string");
    assert.equal(typeof step.icon, "string");
  });
});

test("unknown templates use phases for a safe three-to-four step fallback", () => {
  const presentation = buildActivityPresentation({
    templateId: "future-classroom-event.v9",
    phases: [
      "announce",
      "prepare",
      "physical-action",
      "individual-speech",
      "teacher-confirm",
      "celebrate",
    ],
    materialTags: ["custom.teacher-provided"],
    content: {
      title: "未来课堂事件",
      instruction: "按屏幕给出的顺序完成挑战。",
    },
  });

  assert.equal(presentation.kicker, "教学事件");
  assert.equal(presentation.title, "未来课堂事件");
  assert.equal(presentation.firstAction, "按屏幕给出的顺序完成挑战。");
  assert.equal(presentation.steps.length, 4);
  assert.deepEqual(
    presentation.steps.map(({ id }) => id),
    ["announce", "physical-action", "individual-speech", "teacher-confirm"],
  );
  assert.deepEqual(presentation.materials, [{
    tag: "custom.teacher-provided",
    label: "指定道具（custom.teacher-provided）",
    icon: "◆",
  }]);
  assert.equal("target" in presentation, false);
  assert.equal("challenge" in presentation, false);
});

test("malformed input safely returns renderable defaults", () => {
  const presentation = buildActivityPresentation(null);

  assert.equal(presentation.kicker, "教学事件");
  assert.equal(presentation.title, "课堂挑战");
  assert.equal(presentation.actorName, "");
  assert.equal(presentation.landedSpaceLabel, "");
  assert.ok(presentation.steps.length >= 3);
  assert.ok(presentation.steps.length <= 4);
  assert.deepEqual(presentation.materials, []);
  for (const field of ["story", "firstAction", "outcome"]) {
    assert.equal(typeof presentation[field], "string");
    assert.ok(presentation[field].length > 0);
  }
});

test("builder is deterministic and never mutates the activity", () => {
  const source = activity();
  const original = structuredClone(source);

  const first = buildActivityPresentation(source, { actorName: "Mia" });
  const second = buildActivityPresentation(source, { actorName: "Mia" });

  assert.deepEqual(source, original);
  assert.deepEqual(first, second);
  assert.notEqual(first.steps, second.steps);
  assert.notEqual(first.materials, second.materials);
});
