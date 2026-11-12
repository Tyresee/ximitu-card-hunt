// Explicit teacher-only authority for two independently locked d6 faces.
// This module never samples a die or grants an opportunity.
export const DOUBLE_DICE_POLICY = "teacher-double-dice.v1";
export const hasDoubleDiceFields = (value) => value != null
  && (Object.hasOwn(value, "dicePolicy") || Object.hasOwn(value, "faceIndices"));

export function doubleDiceSteps(value) {
  if (value?.dicePolicy !== DOUBLE_DICE_POLICY || !Array.isArray(value.faceIndices)
    || value.faceIndices.length !== 2
    || value.faceIndices.some((index) => !Number.isInteger(index) || index < 0 || index > 5)) return null;
  return value.faceIndices[0] + value.faceIndices[1] + 2;
}

export function validTeacherDiceRoll(turn) {
  if (!Number.isInteger(turn?.faceIndex) || turn.faceIndex < 0 || turn.faceIndex > 5) return false;
  if (hasDoubleDiceFields(turn)) return doubleDiceSteps(turn) === turn.steps
    && turn.faceIndex === turn.faceIndices[0];
  return turn.steps === turn.faceIndex + 1;
}
