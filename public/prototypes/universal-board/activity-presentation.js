const MATERIAL_PRESENTATIONS = Object.freeze({
  "cards.flashcards": Object.freeze({ label: "闪卡", icon: "▤" }),
  "board.whiteboard": Object.freeze({ label: "白板", icon: "▣" }),
  "drawing.paper": Object.freeze({ label: "画纸", icon: "□" }),
  "drawing.color-tools": Object.freeze({ label: "彩笔", icon: "✎" }),
  "bag.mystery": Object.freeze({ label: "神秘袋", icon: "◈" }),
  "letters.magnetic": Object.freeze({ label: "磁性字母", icon: "Aa" }),
  "input.bell": Object.freeze({ label: "响铃", icon: "♪" }),
  "input.fly-swatter": Object.freeze({ label: "游戏拍", icon: "✦" }),
});

const FALLBACK_PHASE_PRESENTATIONS = Object.freeze({
  announce: Object.freeze({ label: "听清事件", icon: "!" }),
  prepare: Object.freeze({ label: "准备操作", icon: "○" }),
  "physical-action": Object.freeze({ label: "完成操作", icon: "↗" }),
  draw: Object.freeze({ label: "完成图示", icon: "✎" }),
  find: Object.freeze({ label: "寻找线索", icon: "⌕" }),
  sort: Object.freeze({ label: "整理分类", icon: "≡" }),
  "designated-speech": Object.freeze({ label: "指定发言", icon: "●" }),
  "individual-speech": Object.freeze({ label: "完整表达", icon: "●" }),
  "teacher-confirm": Object.freeze({ label: "教师确认", icon: "✓" }),
  celebrate: Object.freeze({ label: "完成事件", icon: "★" }),
});

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(cleanText)
    .filter((item, index, items) => item && items.indexOf(item) === index);
}

function quote(value) {
  return value ? `“${value}”` : "";
}

function materialPresentation(tag) {
  const known = MATERIAL_PRESENTATIONS[tag];
  return {
    tag,
    label: known?.label || `指定道具（${tag}）`,
    icon: known?.icon || "◆",
  };
}

function materialNames(materials) {
  return materials.map((material) => material.label).join("、");
}

function createStep(id, label, detail, icon) {
  return {
    id,
    label,
    detail,
    icon,
  };
}

function taskContext(actorName, landedSpaceLabel) {
  if (actorName && landedSpaceLabel) {
    return `${actorName}来到${landedSpaceLabel}`;
  }
  if (actorName) return `${actorName}触发了教学事件`;
  if (landedSpaceLabel) return `角色来到${landedSpaceLabel}`;
  return "角色触发了教学事件";
}

function instructionOr(content, fallback) {
  return content.instruction || fallback;
}

function speechDetail(actorName, target) {
  if (target) {
    return `${actorName}看着操作结果，完整说出${quote(target)}。`;
  }
  return `${actorName}看着操作结果，用完整句子说明答案。`;
}

function outcomeText(actorName, target) {
  const standard = target
    ? `${actorName}完成操作并清楚说出${quote(target)}`
    : `${actorName}完成操作并说清自己的答案`;
  return `完成标准：${standard}。老师确认后返回棋盘。`;
}

function repairActionDetail(materials, challenge, target) {
  const usingMaterials = materials.length
    ? `使用${materialNames(materials)}，`
    : "";
  if (challenge && target) {
    return `${usingMaterials}把${quote(challenge)}修复为${quote(target)}。`;
  }
  if (target) {
    return `${usingMaterials}整理出正确表达${quote(target)}。`;
  }
  return `${usingMaterials || "先口头"}指出问题，并整理出修正后的表达。`;
}

function repairSteps({
  actorName,
  content,
  materials,
  target,
  challenge,
}) {
  const inspectDetail = challenge
    ? `读一遍${quote(challenge)}，指出不正确或不完整的地方。`
    : instructionOr(content, "读清题目线索，指出需要修复的地方。");
  return [
    createStep("announce", "发现问题", inspectDetail, "!"),
    createStep(
      "physical-action",
      "完成修复",
      repairActionDetail(materials, challenge, target),
      "✦",
    ),
    createStep(
      "designated-speech",
      "说出答案",
      speechDetail(actorName, target),
      "●",
    ),
    createStep(
      "teacher-confirm",
      "教师确认",
      "老师对照题目确认修复和表达都已完成。",
      "✓",
    ),
  ];
}

function drawActionDetail(materials, target) {
  const materialDetail = materials.length
    ? `使用${materialNames(materials)}`
    : "按题目要求";
  const targetDetail = target
    ? `，画出能说明${quote(target)}的关键信息`
    : "，画出题目要求的关键信息";
  return `${materialDetail}${targetDetail}。`;
}

function drawSteps({ actorName, content, materials, target }) {
  return [
    createStep(
      "announce",
      "确认画面",
      instructionOr(content, "先确认要画出的对象、动作或位置。"),
      "!",
    ),
    createStep(
      "draw",
      "完成图示",
      drawActionDetail(materials, target),
      "✎",
    ),
    createStep(
      "individual-speech",
      "看图说明",
      speechDetail(actorName, target),
      "●",
    ),
    createStep(
      "teacher-confirm",
      "教师确认",
      "老师检查图示与口头表达是否对应。",
      "✓",
    ),
  ];
}

function fetchActionDetail(materials, target) {
  const source = materials.length
    ? `从${materialNames(materials)}中`
    : "";
  const clue = target
    ? `能提示${quote(target)}的线索`
    : "与题目匹配的线索";
  return `${source}找到${clue}，并把它展示出来。`;
}

function fetchSteps({ actorName, content, materials, target }) {
  return [
    createStep(
      "announce",
      "听清线索",
      instructionOr(content, "先听清需要寻找的对象或动作线索。"),
      "!",
    ),
    createStep(
      "find",
      "找到线索",
      fetchActionDetail(materials, target),
      "⌕",
    ),
    createStep(
      "individual-speech",
      "表演并说",
      target
        ? `${actorName}按活动要求展示或表演线索，再完整说出${quote(target)}。`
        : `${actorName}按活动要求展示或表演线索，再用完整句子回答。`,
      "●",
    ),
    createStep(
      "teacher-confirm",
      "教师确认",
      "老师确认找到的线索、动作与表达一致。",
      "✓",
    ),
  ];
}

function sortActionDetail(materials, target) {
  const objects = materials.length
    ? `使用${materialNames(materials)}，`
    : "";
  const evidence = target
    ? `，并找出能支持${quote(target)}的一项`
    : "";
  return `${objects}按题目给出的类别逐一归类${evidence}。`;
}

function sortSteps({ actorName, content, materials, target }) {
  return [
    createStep(
      "announce",
      "确认类别",
      instructionOr(content, "先听清分类名称和判断规则。"),
      "!",
    ),
    createStep(
      "sort",
      "逐一分类",
      sortActionDetail(materials, target),
      "≡",
    ),
    createStep(
      "individual-speech",
      "说明理由",
      target
        ? `${actorName}指向分类结果，完整说出${quote(target)}。`
        : `${actorName}指向分类结果，用完整句子说明分类理由。`,
      "●",
    ),
    createStep(
      "teacher-confirm",
      "教师确认",
      "老师检查分类结果和说明是否一致。",
      "✓",
    ),
  ];
}

function fallbackPhaseDetail(phase, {
  actorName,
  content,
  materials,
  target,
}) {
  if (phase === "announce") {
    return instructionOr(content, "听清本次教学事件的任务。");
  }
  if (phase === "prepare") {
    return materials.length
      ? `确认${materialNames(materials)}已经准备好。`
      : "确认题目和操作要求已经看清。";
  }
  if (phase === "draw") return drawActionDetail(materials, target);
  if (phase === "find") return fetchActionDetail(materials, target);
  if (phase === "sort") return sortActionDetail(materials, target);
  if (phase === "designated-speech" || phase === "individual-speech") {
    return speechDetail(actorName, target);
  }
  if (phase === "teacher-confirm") {
    return "老师检查操作和表达是否完成。";
  }
  if (phase === "celebrate") {
    return "老师确认后，本次教学事件完成。";
  }
  return "按活动说明完成这一环节。";
}

function preferredFallbackPhases(phases) {
  const selected = [];
  const add = (phase) => {
    if (phase && !selected.includes(phase) && selected.length < 4) {
      selected.push(phase);
    }
  };
  add(phases.find((phase) => phase === "announce"));
  add(phases.find((phase) => (
    !["announce", "prepare", "designated-speech", "individual-speech", "teacher-confirm", "celebrate"]
      .includes(phase)
  )));
  add(phases.find((phase) => (
    phase === "designated-speech" || phase === "individual-speech"
  )));
  add(phases.find((phase) => phase === "teacher-confirm"));
  phases.forEach((phase) => {
    if (phase !== "celebrate") add(phase);
  });
  if (selected.length < 3) add("physical-action");
  if (selected.length < 3) add("individual-speech");
  if (selected.length < 3) add("teacher-confirm");
  return selected;
}

function fallbackSteps(context, phases) {
  return preferredFallbackPhases(phases).map((phase) => {
    const presentation = FALLBACK_PHASE_PRESENTATIONS[phase] || {
      label: "完成环节",
      icon: "•",
    };
    return createStep(
      phase,
      presentation.label,
      fallbackPhaseDetail(phase, context),
      presentation.icon,
    );
  });
}

/**
 * Convert an engine activity into display-only data. The returned values are
 * intended for textContent/createElement renderers; this module never creates
 * markup or mutates the supplied activity.
 */
export function buildActivityPresentation(
  activity,
  { actorName, landedSpaceLabel } = {},
) {
  const source = activity && typeof activity === "object" ? activity : {};
  const contentSource = source.content && typeof source.content === "object"
    ? source.content
    : {};
  const content = {
    title: cleanText(contentSource.title),
    instruction: cleanText(contentSource.instruction),
    target: cleanText(contentSource.target),
    challenge: cleanText(contentSource.challenge),
  };
  const templateId = cleanText(source.templateId);
  const phases = cleanList(source.phases);
  const cleanActorName = cleanText(actorName);
  const cleanLandedSpaceLabel = cleanText(landedSpaceLabel);
  const activeActorName = cleanActorName || "当前玩家";
  const materials = cleanList(source.materialTags).map(materialPresentation);
  const context = {
    actorName: activeActorName,
    content,
    materials,
    target: content.target,
    challenge: content.challenge,
  };

  let templateKicker = "教学事件";
  let defaultTitle = "课堂挑战";
  let story = `${taskContext(activeActorName, cleanLandedSpaceLabel)}。按顺序完成任务，老师确认后继续棋盘行程。`;
  let firstAction = instructionOr(content, "先听老师说明活动规则。");
  let steps;

  if (templateId === "repair-together.v1") {
    templateKicker = "教学事件 · 修复任务";
    defaultTitle = "修复学习线索";
    story = `${taskContext(activeActorName, cleanLandedSpaceLabel)}，发现一条需要修复的学习线索。先找出问题，再说出正确表达。`;
    firstAction = content.challenge
      ? `先读一遍${quote(content.challenge)}，指出需要修复的地方。`
      : instructionOr(content, "先查看题目线索，指出需要修复的地方。");
    steps = repairSteps(context);
  } else if (templateId === "draw-and-explain.v1") {
    templateKicker = "教学事件 · 绘画任务";
    defaultTitle = "画出来，再说明";
    story = `${taskContext(activeActorName, cleanLandedSpaceLabel)}。把关键信息画清楚，再用完整句子解释自己的图。`;
    firstAction = instructionOr(content, "先确认要画出的对象、动作或位置。");
    steps = drawSteps(context);
  } else if (templateId === "physical-fetch.v1") {
    templateKicker = "教学事件 · 寻找任务";
    defaultTitle = "找到正确线索";
    story = `${taskContext(activeActorName, cleanLandedSpaceLabel)}。找到与题目匹配的线索，再用动作和完整句子完成挑战。`;
    firstAction = instructionOr(content, "先听清需要寻找的对象或动作线索。");
    steps = fetchSteps(context);
  } else if (templateId === "sort-and-say.v1") {
    templateKicker = "教学事件 · 分类任务";
    defaultTitle = "分一分，说理由";
    story = `${taskContext(activeActorName, cleanLandedSpaceLabel)}。先按题目规则完成分类，再说清分类结果。`;
    firstAction = instructionOr(content, "先确认分类名称和判断规则。");
    steps = sortSteps(context);
  } else {
    steps = fallbackSteps(context, phases);
  }

  return {
    kicker: cleanLandedSpaceLabel
      ? `${templateKicker} · ${cleanLandedSpaceLabel}`
      : templateKicker,
    title: content.title || defaultTitle,
    story,
    firstAction,
    steps,
    materials,
    outcome: outcomeText(activeActorName, content.target),
    actorName: cleanActorName,
    landedSpaceLabel: cleanLandedSpaceLabel,
    ...(content.target ? { target: content.target } : {}),
    ...(content.challenge ? { challenge: content.challenge } : {}),
  };
}
