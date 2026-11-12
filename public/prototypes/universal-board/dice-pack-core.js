export const DICE_PACK_SCHEMA_VERSION = "voice-board-dice-pack.v3";
export const DICE_PACK_CONTRACT_REF = "voice-score-to-dice-lock.v1";

export const DICE_PACK_FAMILY_IDS = Object.freeze([
  "starter",
  "brave",
  "support",
  "steady",
  "sprint",
  "treasure",
]);

export const LEGENDARY_DICE_FAMILY_IDS = Object.freeze([
  "steady",
  "sprint",
  "treasure",
]);

export const DICE_REWARD_TYPES = Object.freeze([
  "none",
  "coin",
  "star",
]);

export const DICE_REWARD_LIMITS = Object.freeze({
  none: Object.freeze({ min: 0, max: 0 }),
  coin: Object.freeze({ min: 1, max: 3 }),
  star: Object.freeze({ min: 1, max: 1 }),
});

const PACK_KEYS = Object.freeze(["contractRef", "families", "schemaVersion"]);
const FACE_KEYS = Object.freeze(["reward", "steps"]);
const REWARD_KEYS = Object.freeze(["amount", "type"]);

export class DicePackValidationError extends Error {
  constructor(message, {
    code = "dice_pack_invalid",
    statusCode = 422,
  } = {}) {
    super(message);
    this.name = "DicePackValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expectedKeys.length
    && actual.every((key, index) => key === expectedKeys[index]);
}

function invalid(message, options) {
  throw new DicePackValidationError(message, options);
}

function canonicalReward(input, familyId, faceIndex) {
  if (!hasExactKeys(input, REWARD_KEYS)) {
    invalid(`${familyId} 第 ${faceIndex + 1} 面的奖励结构无效`);
  }
  const rawType = String(input.type || "");
  const type = ["card_case", "card"].includes(rawType) ? "star" : rawType;
  const amount = Number(input.amount);
  const limits = DICE_REWARD_LIMITS[type];
  if (!DICE_REWARD_TYPES.includes(type) || !limits) {
    invalid(`${familyId} 第 ${faceIndex + 1} 面使用了不支持的奖励`);
  }
  if (!Number.isInteger(amount) || amount < limits.min || amount > limits.max) {
    invalid(`${familyId} 第 ${faceIndex + 1} 面的奖励数量超出允许范围`);
  }
  return { type, amount };
}

function canonicalFace(input, familyId, faceIndex) {
  if (!hasExactKeys(input, FACE_KEYS)) {
    invalid(`${familyId} 第 ${faceIndex + 1} 面的字段无效`);
  }
  const steps = Number(input.steps);
  if (!Number.isInteger(steps) || steps < 1 || steps > 6) {
    invalid(`${familyId} 第 ${faceIndex + 1} 面的点数必须是 1–6 的整数`);
  }
  return {
    steps,
    reward: canonicalReward(input.reward, familyId, faceIndex),
  };
}

export function normalizeDicePack(input) {
  if (!hasExactKeys(input, PACK_KEYS)) {
    invalid("骰子配置必须只包含规定字段");
  }
  if (
    ![DICE_PACK_SCHEMA_VERSION, "voice-board-dice-pack.v2"].includes(input.schemaVersion)
    || input.contractRef !== DICE_PACK_CONTRACT_REF
    || !isPlainRecord(input.families)
  ) {
    invalid("骰子配置与当前正式回合契约不匹配");
  }
  const familyIds = Object.keys(input.families).sort();
  const expectedFamilyIds = [...DICE_PACK_FAMILY_IDS].sort();
  if (
    familyIds.length !== expectedFamilyIds.length
    || familyIds.some((familyId, index) => familyId !== expectedFamilyIds[index])
  ) {
    invalid("骰子配置必须完整保留六种正式骰子");
  }
  const families = {};
  DICE_PACK_FAMILY_IDS.forEach((familyId) => {
    const faces = input.families[familyId];
    if (!Array.isArray(faces) || faces.length !== 6) {
      invalid(`${familyId} 必须恰好包含六个等概率骰面`);
    }
    families[familyId] = faces.map((face, faceIndex) => (
      canonicalFace(face, familyId, faceIndex)
    ));
  });
  return {
    schemaVersion: DICE_PACK_SCHEMA_VERSION,
    contractRef: DICE_PACK_CONTRACT_REF,
    families,
  };
}

function face(steps, type = "none", amount = type === "none" ? 0 : 1) {
  return { steps, reward: { type, amount } };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const DEFAULT_DICE_PACK = deepFreeze(normalizeDicePack({
  schemaVersion: DICE_PACK_SCHEMA_VERSION,
  contractRef: DICE_PACK_CONTRACT_REF,
  families: {
    starter: [face(1), face(1), face(1), face(2), face(2), face(2)],
    brave: [face(1), face(1), face(1), face(1), face(2), face(3)],
    support: [face(1), face(2), face(3), face(3), face(4), face(4)],
    steady: [face(2), face(2), face(3), face(3), face(3), face(4)],
    sprint: [face(3), face(3), face(3), face(4), face(4), face(5)],
    treasure: [
      face(3, "coin", 1),
      face(3, "coin", 2),
      face(3, "star", 1),
      face(4, "coin", 1),
      face(4, "coin", 2),
      face(4, "star", 1),
    ],
  },
}));

export function cloneDicePack(pack = DEFAULT_DICE_PACK) {
  return normalizeDicePack(structuredClone(pack));
}

export function dicePacksEqual(left, right) {
  try {
    return JSON.stringify(normalizeDicePack(left))
      === JSON.stringify(normalizeDicePack(right));
  } catch {
    return false;
  }
}

export function updateDicePackFace(pack, familyId, faceIndex, update = {}) {
  const normalized = normalizeDicePack(pack);
  if (!DICE_PACK_FAMILY_IDS.includes(familyId)) {
    invalid(`未知骰子：${familyId}`);
  }
  const index = Number(faceIndex);
  if (!Number.isInteger(index) || index < 0 || index >= 6) {
    invalid("骰面序号必须在 1–6 之间");
  }
  const current = normalized.families[familyId][index];
  const rewardType = update.rewardType ?? update.reward?.type ?? current.reward.type;
  const rewardAmount = update.rewardAmount
    ?? update.reward?.amount
    ?? current.reward.amount;
  normalized.families[familyId][index] = canonicalFace({
    steps: update.steps ?? current.steps,
    reward: {
      type: rewardType,
      amount: rewardType === "none"
        ? 0
        : ["star", "card", "card_case"].includes(rewardType)
          ? 1
          : rewardAmount,
    },
  }, familyId, index);
  return normalized;
}

function rewardLabel(reward) {
  if (reward.type === "coin") return `金币 +${reward.amount}`;
  if (reward.type === "star") return "星星 +1";
  return "";
}

export function runtimeDiceFaces(pack, familyId) {
  const normalized = normalizeDicePack(pack);
  if (!DICE_PACK_FAMILY_IDS.includes(familyId)) {
    invalid(`未知骰子：${familyId}`);
  }
  return normalized.families[familyId].map((source, index) => {
    const labelSuffix = rewardLabel(source.reward);
    return {
      id: `${familyId}-face-${index + 1}`,
      steps: source.steps,
      label: labelSuffix ? `${source.steps} + ${labelSuffix}` : String(source.steps),
      bonus: {
        coins: source.reward.type === "coin" ? source.reward.amount : 0,
        stars: source.reward.type === "star" ? source.reward.amount : 0,
      },
    };
  });
}

function sampledFaceIndex(random, faceCount = 6) {
  if (typeof random !== "function") invalid("骰面随机源无效");
  const sample = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return Math.floor(sample * faceCount);
}

export function rollDicePackFamily(pack, familyId, random = Math.random) {
  const faces = runtimeDiceFaces(pack, familyId);
  const faceIndex = sampledFaceIndex(random, faces.length);
  const selected = faces[faceIndex];
  return {
    poolId: familyId,
    faceIndex,
    face: selected,
    steps: selected.steps,
    bonus: { ...selected.bonus },
  };
}

export function generateLegendaryDiceFamilies(pack, {
  random = Math.random,
  count = 2,
} = {}) {
  normalizeDicePack(pack);
  const optionCount = Math.max(
    1,
    Math.min(LEGENDARY_DICE_FAMILY_IDS.length, Math.trunc(Number(count) || 2)),
  );
  const shuffled = [...LEGENDARY_DICE_FAMILY_IDS];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = sampledFaceIndex(random, index + 1);
    [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
  }
  return shuffled.slice(0, optionCount);
}
