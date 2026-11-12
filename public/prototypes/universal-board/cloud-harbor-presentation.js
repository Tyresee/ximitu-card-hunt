import { isCloudHarborWorldRef } from "./world-packs.js";

// Display adapters never write back to a Board, Theme, Level or accepted effect.
const TEXT_FIELDS = Object.freeze([
  "label", "title", "copy", "teaser", "firstCopy", "repeatCopy", "badge",
  "badgeLabel", "shortLabel", "detail", "description", "announcement", "directionLabel",
]);

export function isCloudHarborPresentation(theme, worldRef) {
  return theme?.id === "cloud-harbor" || isCloudHarborWorldRef(worldRef);
}

function neutralText(value) {
  return value
    .replace(/云霄信号炮|云霄大炮|云霄炮台|信号炮|炮台|大炮|彩虹滑翔器|滑翔器/g, "云路捷径")
    .replace(/港口雾笛台|港口雾笛|雾笛/g, "航道微光")
    .replace(/云瀑水门|水门|门塔|水塔/g, "云阶入口")
    .replace(/远航灯塔门|远航灯塔|灯塔门|灯塔/g, "离港光点")
    .replace(/港口吊机旁|小吊机|吊机|吊车/g, "码头云景")
    .replace(/风暴塔/g, "风云观景台")
    .replace(/停靠锚/g, "航标")
    .replace(/进入高台/g, "进入低矮云岸")
    .replace(/发射/g, "出发")
    .replace(/轰开/g, "拨开");
}

function displayCopy(value, overrides = {}) {
  const result = { ...value };
  for (const key of TEXT_FIELDS) {
    if (typeof value[key] === "string") {
      result[key] = overrides[key] ?? neutralText(value[key]);
    }
  }
  for (const key of ["icon", "visualKind"]) {
    if (Object.hasOwn(value, key) && overrides[key] !== undefined) result[key] = overrides[key];
  }
  if (typeof result.icon === "string" && /[📯🗼🏗⚓]/u.test(result.icon)) result.icon = "✦";
  return result;
}

function facilityCopy(label, shortLabel, detail, visualKind, icon = "✦") {
  return {
    label, title: label, shortLabel, detail, description: detail, teaser: detail,
    firstCopy: detail, repeatCopy: detail, copy: detail, announcement: shortLabel,
    badge: shortLabel, badgeLabel: shortLabel, visualKind, icon,
  };
}

/** Accepts either node copy or an outcome; category, trigger and rule fields survive. */
export function cloudHarborNodePresentation({ node, presentation, theme, worldRef } = {}) {
  if (!presentation || !isCloudHarborPresentation(theme, worldRef)) return presentation;

  let copy = {};
  const isTransport = Boolean(node?.transportProfileRef && node?.transportTargetId);
  if (isTransport) {
    // Only historical snapshots still carry a transport here (the current
    // board has none); present it as a neutral forward shortcut.
    copy = facilityCopy(
      "云路捷径", "前往前方落点",
      "最终停在这里时，自动前往指定的前方落点；路过不触发，不额外消耗骰点，只领取全部移动完成后真实最终停格的家园积分。",
      "harbor-route-glow",
    );
  } else if (node?.mapEffectRef === "harbor.cloudfall-gate.v1") {
    copy = facilityCopy(
      "云阶入口", "开启共享云阶",
      "首次最终停在这里时，为全班开启原有的云阶捷径；这里只开路，不移动棋子。再次停下时云阶仍保持开放，路过不触发。",
      "harbor-cloud-stair-glow",
    );
  } else if (node?.mapEffectRef === "harbor.foghorn.v1") {
    copy = facilityCopy(
      "航道微光", "照亮前方航道",
      "最终停在这里时，微光吹散局部云雾并标亮前方设施；保留本局原有的目标揭示效果，不移动棋子，不追加题目或评分，路过不触发。",
      "harbor-route-glow",
    );
  } else if (node?.id === "n18") {
    copy = facilityCopy(
      "离港光点", "下一步通过时离港",
      "停在本格不会离港；实际沿原路线从本格走到下一格时，才点亮离港光点并进入风帆高地。",
      "harbor-departure-glow",
    );
  } else if (node?.id === "n05b") {
    // The new Board retired this effect. Old label data cannot reactivate it.
    copy = {
      label: "海湾观景台", title: "海湾观景台", visualKind: "harbor-bay-scenery",
      teaser: "沿着海湾云路前进，眺望前方的云朵。",
      firstCopy: "海湾云景轻轻浮动。", repeatCopy: "海湾云景轻轻浮动。",
    };
  } else if (node?.id === "n03") {
    copy = {
      label: "码头云景", title: "码头云景", visualKind: "harbor-dock-scenery",
      teaser: "柔软的云朵浮在码头边，前方航道通向岔路口。", badge: "码头旁路",
    };
  }
  return displayCopy(presentation, copy);
}

export function cloudHarborNodeVisualKind(kind, { theme, worldRef } = {}) {
  if (!isCloudHarborPresentation(theme, worldRef)) return kind;
  if (["foghorn", "cloud-gate", "map-effect"].includes(kind)) return "event";
  if (["anchor", "mooring"].includes(kind)) return "learning";
  return kind;
}

/** null means omit this decorative landmark, not its node or route. */
export function cloudHarborLandmark(landmark, { theme, worldRef } = {}) {
  if (!landmark || !isCloudHarborPresentation(theme, worldRef)) return landmark;
  if (/[📯🗼🏗⚓]/u.test(landmark.icon || "")
    || /塔|吊机|吊车|雾笛|水门|炮台|信号炮|停靠锚/.test(landmark.label || "")) return null;
  return displayCopy(landmark);
}

/** Supports both edge-keyed option metadata and runtime option arrays. */
export function cloudHarborRouteChoice(choice, { theme, worldRef } = {}) {
  if (!choice || !isCloudHarborPresentation(theme, worldRef)) return choice;
  const result = displayCopy(choice);
  if (Array.isArray(choice.options)) {
    result.options = choice.options.map((option) => cloudHarborRouteChoice(option, { theme, worldRef }));
  } else if (choice.options && typeof choice.options === "object") {
    result.options = Object.fromEntries(Object.entries(choice.options).map(([edgeId, option]) => [
      edgeId, cloudHarborRouteChoice(option, { theme, worldRef }),
    ]));
  }
  return result;
}
