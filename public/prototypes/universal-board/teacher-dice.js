import { TEACHER_DICE, TEACHER_DICE_REF, isTeacherSession } from "../../js/lib/teacher-board-session.js";
import { runtimeDiceFaces } from "./dice-pack-core.js";

// Immutable new-game rule. Old sessions retain their published six-face snapshot.
const FACES = Object.freeze(Array.from({ length: 6 }, (_, index) => {
  const steps = index + 1;
  const bonus = Object.freeze({ coins: steps === 1 ? 0 : 6 - steps, stars: steps === 1 ? 1 : 0 });
  const reward = bonus.stars ? "1 颗星星" : bonus.coins ? `${bonus.coins} 枚金币` : "无附加奖励";
  return Object.freeze({ id: `${TEACHER_DICE_REF}:${steps}`, steps, label: `${steps} 步 · ${reward}`, bonus });
}));

export function teacherDiceFaces(session, legacyPack) {
  if (!isTeacherSession(session)) throw new Error("not a teacher session");
  if (session.teacherDiceRef === undefined) return runtimeDiceFaces(legacyPack, TEACHER_DICE);
  if (session.teacherDiceRef !== TEACHER_DICE_REF) throw new Error("unknown teacher dice version");
  return FACES.map((face) => ({ ...face, bonus: { ...face.bonus } }));
}

export function teacherDiceLabel(session) {
  return session?.teacherDiceRef === TEACHER_DICE_REF ? "课堂骰" : "寻宝骰（旧局）";
}

export function teacherDiceRoll(session, pack, faceIndex) {
  const faces = teacherDiceFaces(session, pack);
  if (!Number.isInteger(faceIndex) || !faces[faceIndex]) throw new Error("invalid teacher die face");
  const face = faces[faceIndex];
  return { poolId: TEACHER_DICE, poolLabel: teacherDiceLabel(session), faceIndex, face,
    steps: face.steps, bonus: { ...face.bonus }, fairyAction: face.fairyAction,
    rewardSource: session.teacherDiceRef === TEACHER_DICE_REF ? "teacher_dice" : "dice" };
}

export function sampleTeacherDice(session, pack, random = Math.random) {
  const sample = Number(random());
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error("invalid random sample");
  return teacherDiceRoll(session, pack, Math.floor(sample * 6));
}
