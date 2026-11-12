export const DICE_DOCK_STRENGTH_ORDER = Object.freeze([
  "treasure",
  "sprint",
  "steady",
  "support",
  "brave",
  "starter",
]);

export const HIGH_SCORE_DICE_THRESHOLD = 80;

export function diceProbabilitySummary(faces = []) {
  const steps = Array.isArray(faces)
    ? faces.map((face) => Number(face?.steps ?? face)).filter(Number.isFinite)
    : [];
  if (steps.length !== 6) return "请查看六个真实骰面";
  const lowFaces = steps.filter((value) => value <= 2).length;
  const highFaces = steps.filter((value) => value >= 4).length;
  if (lowFaces === 5 && highFaces === 1) {
    return "5 面低点数 · 1 面大惊喜";
  }
  if (highFaces === 5 && lowFaces === 1) {
    return "5 面高点数 · 1 面小意外";
  }
  return `${lowFaces} 面低点数 · ${highFaces} 面高点数`;
}

export function diceSelectionMood(profile = {}) {
  const score = Number(profile.score);
  const celebrate = Number.isFinite(score) && score >= HIGH_SCORE_DICE_THRESHOLD;
  return Object.freeze(celebrate
    ? {
        id: "celebrate",
        readyCue: "dice-ready-bright",
        lockCue: "dice-lock-bright",
        label: "高分闪耀候场",
      }
    : {
        id: "steady",
        readyCue: "dice-ready-steady",
        lockCue: "dice-lock-steady",
        label: "稳稳候场",
      });
}
