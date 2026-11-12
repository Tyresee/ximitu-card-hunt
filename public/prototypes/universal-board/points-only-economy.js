import { createFairyState } from "./treasure-core.js";
import { isCloudHarborWorldRef } from "./world-packs.js";
import { hasDoubleDiceFields, validTeacherDiceRoll } from "./double-dice-core.js";

const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const zeroBonus = () => ({ coins: 0, stars: 0 });

function validSteps(steps) {
  if (!Number.isInteger(steps) || steps < 1 || steps > 6) {
    throw new Error("points-only dice must retain a valid 1–6 step result");
  }
}

function withoutOldDiceRewards(value) {
  const next = { ...value };
  for (const key of ["reward", "rewards", "rewardSource", "fairyAction"]) delete next[key];
  next.bonus = zeroBonus();
  return next;
}

// Composite results are a separate, explicit teacher authority. A physical
// face remains one d6 face; the move uses the verified sum of two locked faces.
function pointsOnlyDoubleDice(value) {
  if (!validTeacherDiceRoll(value)
    || (value.poolId !== "treasure" && value.teacherDiceRef !== "teacher-dice.v1")
    || (value.poolId !== undefined && value.poolId !== "treasure")
    || (value.teacherDiceRef !== undefined && value.teacherDiceRef !== "teacher-dice.v1")) {
    throw new Error("double dice must retain two matching locked teacher faces");
  }
  const next = withoutOldDiceRewards(value);
  next.faceIndices = [...value.faceIndices];
  next.faceLabel = `${value.faceIndices[0] + 1} + ${value.faceIndices[1] + 1} = ${value.steps} 步`;
  delete next.faceLabels;
  if (value.face !== undefined) {
    if (value.face?.steps !== value.faceIndex + 1) throw new Error("double dice first face and locked index disagree");
    next.face = pointsOnlyDiceFace(value.face);
  }
  return next;
}

// Adapt an already configured face, never the immutable published dice pack.
// Face order, IDs and probability metadata remain untouched.
export function pointsOnlyDiceFace(face) {
  if (!record(face)) throw new Error("a dice face is required");
  validSteps(face.steps);
  return { ...withoutOldDiceRewards(face), label: `${face.steps} 步` };
}

// Old presentation snapshots may predate faceIndex. They are display records,
// never authority to sample or move; keep their recorded steps without guessing
// a physical face. The old all-face labels are unused and need no reconstruction.
export function pointsOnlyDicePresentation(snapshot) {
  if (!record(snapshot)) throw new Error("a dice presentation is required");
  if (hasDoubleDiceFields(snapshot)) return pointsOnlyDoubleDice(snapshot);
  validSteps(snapshot.steps);
  const next = withoutOldDiceRewards(snapshot);
  next.faceLabel = `${snapshot.steps} 步`;
  delete next.faceLabels;
  return next;
}

// Works for a browser roll or a persisted authoritative server turn. No random
// source is read and an already sampled face can never be replaced here.
export function pointsOnlyDiceRoll(roll) {
  if (!record(roll)) throw new Error("a sampled dice result is required");
  if (hasDoubleDiceFields(roll)) return pointsOnlyDoubleDice(roll);
  validSteps(roll.steps);
  if (!Number.isInteger(roll.faceIndex) || roll.faceIndex < 0 || roll.faceIndex > 5) {
    throw new Error("points-only dice must retain a valid sampled face index");
  }
  const next = withoutOldDiceRewards(roll);
  if (Object.hasOwn(roll, "faceLabel")) next.faceLabel = `${roll.steps} 步`;
  delete next.faceLabels;
  if (roll.face !== undefined) {
    if (roll.face?.steps !== roll.steps) throw new Error("sampled face and movement disagree");
    next.face = pointsOnlyDiceFace(roll.face);
  }
  return next;
}

/**
 * Retire local coins, stars, cards and accepted-answer asset counters without
 * rewriting historical ledgers. The caller has already committed movement and
 * harbor mechanisms. Only non-economic shared world state is settled here;
 * the separate authoritative landing service owns actual home-wallet credit.
 */
export function settlePointsOnlyAssetsForMove({
  ledger,
  movedRuntime,
  effects = [],
  movingTeamId,
  ownerId,
  settlementId,
  composition,
}) {
  if (!record(ledger) || !record(movedRuntime) || !Array.isArray(effects)
    || !Array.isArray(composition?.board?.nodes) || !record(composition?.level)
    || !ownerId || !settlementId) {
    throw new Error("points-only settlement requires a ledger, moved runtime and world composition");
  }
  const activeWorld = movedRuntime.world?.active;
  const worldRef = activeWorld?.worldPackRef || composition.worldRef;
  if (!worldRef || worldRef !== composition.worldRef) {
    throw new Error("points-only settlement composition does not match the moved world");
  }
  const team = movedRuntime.teams?.find(({ id }) => id === movingTeamId);
  if (!team) throw new Error("points-only settlement actor is missing from the moved runtime");
  const transports = effects.filter((effect) => effect.type === "transport_move"
    && (!effect.actorTeamId || effect.actorTeamId === movingTeamId)
    && (!effect.worldRef || effect.worldRef === worldRef)
    && (!effect.worldInstanceId || effect.worldInstanceId === activeWorld?.instanceId));
  const landingNodeId = transports.at(-1)?.toNodeId || team.nodeId;
  if (landingNodeId !== team.nodeId) {
    throw new Error("points-only transport target does not match the committed position");
  }
  const node = composition.board.nodes.find(({ id }) => id === landingNodeId);
  if (!node) throw new Error("points-only final landing is not on the committed board");

  const levelState = structuredClone(activeWorld?.levelState || composition.level.initialLevelState || {});
  const mapState = structuredClone(activeWorld?.mapState || movedRuntime.mapState
    || composition.level.initialMapState || {});
  if (!isCloudHarborWorldRef(worldRef)) {
    const rewardRef = composition.level.nodeBindings?.[landingNodeId]?.rewardRef;
    const profile = composition.level.landingProfiles?.[rewardRef];
    if (!profile) throw new Error("points-only final landing has no registered map profile");
    const discovered = levelState.discoveredNodeIds || [];
    if (!Array.isArray(discovered)) throw new Error("points-only shared discoveries are invalid");
    if (profile.kind !== "ordinary") {
      if (!discovered.includes(landingNodeId) && profile.firstStateChanges) {
        Object.assign(mapState, structuredClone(profile.firstStateChanges));
      }
      levelState.discoveredNodeIds = [...new Set([...discovered, landingNodeId])];
    }
  }

  return {
    ledger,
    fairy: createFairyState(),
    events: [],
    landingNodeId,
    landingBonus: { kind: "ordinary", ...zeroBonus(), event: null },
    landingReward: {
      schemaVersion: "points-only.landing-resolution.v1",
      nodeId: landingNodeId,
      firstVisit: false,
      presentationRef: null,
      semanticType: "ordinary",
      activeCopy: null,
      rewards: [],
      event: null,
      events: [],
      trackDiscovery: false,
      idempotencyKey: `points-only:${settlementId}:${worldRef}:${landingNodeId}`,
    },
    levelState,
    mapState,
    fairyCaptureNodeId: null,
    summary: "",
  };
}
