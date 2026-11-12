import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { BOARD_TEMPLATE, PREVIOUS_BOARD_TEMPLATE_V21 } from "../public/prototypes/universal-board/packs.js";
import { CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES } from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";
import { settlePointsOnlyAssetsForMove } from "../public/prototypes/universal-board/points-only-economy.js";

const appSource = readFileSync(new URL(
  "../public/prototypes/universal-board/app.js",
  import.meta.url,
), "utf8");
const htmlSource = readFileSync(new URL(
  "../public/prototypes/universal-board/index.html",
  import.meta.url,
), "utf8");
const cssSource = readFileSync(new URL(
  "../public/prototypes/universal-board/points-only.css",
  import.meta.url,
), "utf8");

function namedFunctionSource(functionName) {
  const marker = new RegExp(`^(?:async\\s+)?function\\s+${functionName}\\s*\\(`, "m");
  const match = marker.exec(appSource);
  assert.ok(match, `missing function ${functionName}`);
  const signature = /\)\s*\{/.exec(appSource.slice(match.index));
  assert.ok(signature, `missing body for function ${functionName}`);
  const bodyStart = match.index + signature.index + signature[0].lastIndexOf("{");
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") {
      depth -= 1;
      if (depth === 0) return appSource.slice(match.index, index + 1);
    }
  }
  assert.fail(`unterminated function ${functionName}`);
}

test("the retired exchange is hidden and inert while current and saved board topology remains intact", () => {
  const stage = /<section\b[^>]*id="coin-exchange-stage"[^>]*>/.exec(htmlSource)?.[0];
  assert.ok(stage, "historical initialization hooks retain their inert container");
  assert.match(stage, /\bhidden\b/);
  assert.match(stage, /\binert\b/);
  assert.match(stage, /data-retired-economy="true"/);
  assert.match(htmlSource, /href="\/prototypes\/universal-board\/points-only\.css(?:\?[^\"]*)?"/);
  assert.match(cssSource, /\[data-retired-economy="true"\]\s*\{\s*display:\s*none\s*!important/);

  for (const board of [BOARD_TEMPLATE, PREVIOUS_BOARD_TEMPLATE_V21]) {
    assert.equal(board.nodes.find(({ id }) => id === "n37").spaceRole, "activity");
  }
  assert.doesNotMatch(appSource, /playEventArrival/);
});

test("the actual landing adapter never spends old coins or awards stars even at the former exchange", () => {
  const composition = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
  for (const coins of [0, 4, 5, 17]) {
    const ledger = { playerAssetsById: { "student-uuid": { coins, stars: 2 } }, processedSettlementIds: ["historic-turn"] };
    const before = JSON.stringify(ledger);
    const ctx = createContext({ playerAssetsLedger: ledger, WORLD_REGISTRIES,
      resolveWorldComposition, settlePointsOnlyAssetsForMove });
    runInContext(namedFunctionSource("settlePlayerAssetsForMove"), ctx);
    const input = {
      baselineRuntime: { activeTeamIndex: 0, teams: [{ id: "player-student-uuid", nodeId: "n36" }] },
      movedRuntime: { teams: [{ id: "player-student-uuid", nodeId: "n37" }], world: { active: {
        instanceId: "fixture-world-instance", worldPackRef: CLOUD_HARBOR_WORLD_REF,
        mapState: structuredClone(composition.level.initialMapState || {}),
        levelState: structuredClone(composition.level.initialLevelState || {}),
      } } },
      effects: [{ type: "pawn_step", nodeId: "n37" }], ownerId: "student-uuid", settlementId: "original-turn",
      diceRoll: { steps: 1, bonus: { coins: 4, stars: 1 } }, exchangeCoinsForStar: true,
    };
    const settled = ctx.settlePlayerAssetsForMove(input);
    assert.strictEqual(settled.ledger, ledger);
    assert.equal(JSON.stringify(ledger), before);
    assert.equal(settled.landingNodeId, "n37");
    assert.deepEqual(settled.events, []);
    assert.deepEqual(settled.landingReward.rewards, []);
    assert.equal(settled.landingReward.event, null);
    assert.deepEqual(ctx.settlePlayerAssetsForMove(input), settled, "same final turn is inert on replay");
    assert.equal(JSON.stringify(ledger), before);
  }
});

test("the final landing is persisted and identity checked before its one points claim, without exchange", () => {
  const turn = namedFunctionSource("runBoardTurn");
  const planIndex = turn.indexOf("assertLandingPlan(");
  const persistIndex = turn.indexOf("persistStableSession(", planIndex);
  const committedIndex = turn.indexOf("transactionPersisted = true", persistIndex);
  const landingIndex = turn.indexOf("await playLandingConfirmation");
  const claimIndex = turn.indexOf("await landingPoints.claim(landingGameId(), attemptId)");
  const revealIndex = turn.indexOf("await playWorldNodeReveal");
  assert.ok(planIndex >= 0);
  assert.ok(persistIndex > planIndex);
  assert.ok(committedIndex > persistIndex);
  assert.ok(landingIndex > committedIndex);
  assert.ok(claimIndex > landingIndex);
  assert.ok(revealIndex > claimIndex);
  assert.match(turn, /assertLandingPlan\(\{ turn: authoritative\.turn, attemptId, studentId: actorSeat\.id,[\s\S]*?runtime: result\.runtime, effects: result\.effects, landingNodeId: assetSettlement\.landingNodeId/);
  assert.match(turn, /settledTeam = result\.runtime\.teams\.find\(\(team\) => team\.id === movingTeam\.id\)/);
  assert.match(turn, /playLandingConfirmation\(movingTeam\.id, settledTeam\.nodeId\)/);
  assert.match(turn, /persistStableSession\([\s\S]*?assetSettlement\.ledger/);
  assert.doesNotMatch(turn, /chooseCoinExchangeAtStation|exchangeCoinsForStar|coin_card_exchange|await showCollectedCard/);
  const withoutHistoricalPresenter = appSource.replace(namedFunctionSource("chooseCoinExchangeAtStation"), "");
  assert.doesNotMatch(withoutHistoricalPresenter, /\bchooseCoinExchangeAtStation\s*\(/);
});

test("final landing discards every retired classroom activity path", () => {
  const turn = namedFunctionSource("runBoardTurn");
  assert.doesNotMatch(turn, /landingActivityPolicy\s*:/);
  assert.match(turn, /effect\.type !== "activity_open"/);
  assert.match(turn, /activityPending:\s*false/);
  assert.doesNotMatch(turn, /playEventArrival/);
});
