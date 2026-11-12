import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { settlePointsOnlyAssetsForMove } from "../public/prototypes/universal-board/points-only-economy.js";
import { WORLD_REGISTRIES, BEYOND_CLOUD_WORLD_REF } from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";
import { createPlayerAssetsLedger } from "../public/prototypes/universal-board/session-star-assets.js";

const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);
const htmlSource = readFileSync(
  new URL("../public/prototypes/universal-board/index.html", import.meta.url),
  "utf8",
);
const stylesSource = readFileSync(
  new URL("../public/prototypes/universal-board/styles.css", import.meta.url),
  "utf8",
);

function functionSource(source, functionName) {
  const marker = `function ${functionName}(`;
  const functionStart = source.indexOf(marker);
  assert.notEqual(functionStart, -1, `missing named function ${functionName}`);
  const parametersStart = source.indexOf("(", functionStart);
  let parameterDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        parametersEnd = index;
        break;
      }
    }
  }
  assert.notEqual(parametersEnd, -1, `unterminated parameters for ${functionName}`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(functionStart, index + 1);
    }
  }
  assert.fail(`unterminated body for ${functionName}`);
}

test("chapter continuation preserves the expedition instead of restarting Cloud Harbor", () => {
  const continuation = functionSource(appSource, "continueExpeditionSession");
  assert.match(continuation, /const previousSession = gameSession/);
  assert.match(continuation, /teams:\s*runtime\.teams/);
  assert.match(continuation, /\.\.\.runtime/);
  assert.match(continuation, /\.\.\.visitedNodeIds/);
  assert.match(continuation, /persistStableSession\(\)/);
  assert.doesNotMatch(continuation, /createPrototypeRuntime|createLedgerForSession/);

  const replayHandler = appSource.slice(
    appSource.indexOf('nodes.replaySession.addEventListener("click"'),
    appSource.indexOf('nodes.newSession.addEventListener("click"'),
  );
  assert.match(replayHandler, /continueExpeditionSession\(\)/);
  assert.doesNotMatch(replayHandler, /startLocalSession\(/);
  assert.match(htmlSource, /保留进度 · 继续下一章/);
  assert.match(htmlSource, /继续本局保留地图进度与行动记录/);
  assert.match(htmlSource, /结束棋局不会清空已到账的家园积分/);
  assert.doesNotMatch(htmlSource, /返回云港卡片屋|按相同设置再玩一局/);
});

test("cross-world app wiring asks destination route choices and understands the repeatable tail", () => {
  const routeTransition = functionSource(appSource, "worldRouteTransitionForExit");
  const acceptedTurn = functionSource(appSource, "runBoardTurn");
  assert.match(routeTransition, /const route = currentWorldRoute\(\)/);
  assert.match(routeTransition, /route\.repeatableTail/);
  assert.match(acceptedTurn, /worldRoute: currentWorldRoute\(\)/);
  assert.match(routeTransition, /append-new-instance-v1/);
  assert.match(acceptedTurn, /destinationRouteChoices/);
  assert.match(acceptedTurn, /destinationComposition\.board/);
  assert.match(acceptedTurn, /afterWorldTransition:\s*true/);
  assert.match(
    acceptedTurn,
    /routeChoicesByWorldInstance\[nextWorldInstanceId\]\s*=\s*destinationRouteChoices/,
  );
  assert.match(acceptedTurn, /startingExit/);
});

test("World2 shared map changes survive retirement while per-player rewards remain historical", () => {
  const ledger = createPlayerAssetsLedger({ playerIds: ["student-a"] });
  ledger.playerAssetsById["student-a"].coins = 4;
  ledger.playerAssetsById["student-a"].stars = 2;
  const settlement = runInNewContext(`${functionSource(appSource, "settlePlayerAssetsForMove")}; settlePlayerAssetsForMove`, {
    playerAssetsLedger: ledger, settlePointsOnlyAssetsForMove,
    resolveWorldComposition, WORLD_REGISTRIES,
  });
  const composition = resolveWorldComposition(BEYOND_CLOUD_WORLD_REF, WORLD_REGISTRIES);
  const levelState = { ...structuredClone(composition.level.initialLevelState),
    discoveredNodeIdsByPlayerId: { "student-a": ["w2n03"] },
    discoveriesByPlayerId: { "student-a": ["historical-discovery"] } };
  const movedRuntime = {
    teams: [{ id: "player-a", nodeId: "w2n35b" }],
    world: { active: { instanceId: "world-2", worldPackRef: BEYOND_CLOUD_WORLD_REF,
      mapState: { auroraBridgeOpen: false }, levelState } },
  };
  const result = settlement({ baselineRuntime: { activeTeamIndex: 0, teams: [{ id: "player-a" }] },
    movedRuntime, ownerId: "student-a", settlementId: "first-tree-landing", effects: [] });
  assert.equal(result.mapState.auroraBridgeOpen, true);
  assert.deepEqual(result.levelState.discoveredNodeIds, ["w2n35b"]);
  assert.deepEqual(result.levelState.discoveriesByPlayerId, levelState.discoveriesByPlayerId);
  assert.deepEqual(result.levelState.discoveredNodeIdsByPlayerId, levelState.discoveredNodeIdsByPlayerId);
  assert.strictEqual(result.ledger, ledger);
  assert.deepEqual(result.events, []);
  assert.equal(result.landingReward.semanticType, "ordinary");
  assert.equal(movedRuntime.world.active.mapState.auroraBridgeOpen, false, "upstream runtime is not mutated");

  const acceptedTurn = functionSource(appSource, "runBoardTurn");
  assert.match(acceptedTurn, /mapState: structuredClone\(assetSettlement\.mapState\)/);
  assert.match(acceptedTurn, /levelState: structuredClone\(assetSettlement\.levelState\)/);
  assert.match(acceptedTurn, /await playWorldDeviceEffect\(effect, movingTeam\)/);
  assert.doesNotMatch(acceptedTurn, /settlePlayerAssetTurn|queueStudentAssetSettlement|chooseCoinExchangeAtStation/);
});

test("World2 facilities, transports, and portals use distinct visual semantics", () => {
  const renderer = functionSource(appSource, "renderBoard");
  assert.match(renderer, /appendWorldMapDevice/);
  assert.match(renderer, /appendWorldTransportDevice/);
  assert.match(appSource, /deviceVariant:\s*"comet-lift"/);
  assert.match(appSource, /deviceVariant:\s*"bubble-geyser"/);
  for (const variant of [
    "world-signal",
    "world-prism",
    "world-beacon",
    "world-tide",
    "world-tree",
    "world-aurora",
    "world-moon",
  ]) {
    assert.match(appSource, new RegExp(`deviceVariant:\\s*"${variant}"`));
  }
  for (const visualClass of [
    "world-signal",
    "world-prism",
    "world-whale",
    "world-tide",
    "world-tree",
    "world-aurora",
    "world-moon",
  ]) {
    assert.match(stylesSource, new RegExp(`\\.${visualClass}`));
  }
  assert.match(appSource, /profile\?\.kind === "world-transition"\) return "portal"/);
  assert.match(appSource, /portal:\s*"∞"/);
  assert.match(htmlSource, /CHAPTER CHECKPOINT/);
});

test("stable snapshots store the runtime theme selected by a world transition", () => {
  const snapshot = functionSource(appSource, "savedSessionPayload");
  assert.match(snapshot, /themeId:\s*runtimeValue\?\.themeId \|\| theme\.id/);
});
