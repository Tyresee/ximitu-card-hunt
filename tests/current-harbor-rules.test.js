import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BOARD_TEMPLATE, THEME_PACKS } from '../public/prototypes/universal-board/packs.js';
import { CURRENT_LEVEL_ONE, LEVEL_ONE } from '../public/prototypes/universal-board/level-one.js';
import * as published from '../public/prototypes/universal-board/crystal-harbor-v221-snapshots.js';
import { CLOUD_HARBOR_WORLD_REF, CRYSTAL_V121_WORLD_REF, WORLD_REGISTRIES, WORLD_ROUTES, WORLD_REWARD_DEFINITIONS, XIMITU_WORLD_ROUTE, isCurrentCloudHarborWorldRef } from '../public/prototypes/universal-board/world-packs.js';
import { createRuntime, rollTeacherMove, validateBoardTemplate, walkBoardPlan, findPendingRouteChoice } from '../public/prototypes/universal-board/engine-core.js';
import { resolveWorldComposition, validateWorldRoute, walkWorldPlan } from '../public/prototypes/universal-board/world-runtime-core.js';
import { createHarborMapState, settleHarborTurn, CURRENT_HARBOR_BOARD_REF } from '../public/prototypes/universal-board/harbor-items-core.js';
import { createPointsWorld, planPointsMove } from '../standalone/points-movement.mjs';

const oldBoard = published.CRYSTAL_BOARD_TEMPLATE_V221;
const boardRef = CURRENT_HARBOR_BOARD_REF;
function settle({ start = 'n11b', steps = 1, choices = {}, mapState = {}, settlementId = 'move-1', board = BOARD_TEMPLATE, ref = boardRef, ...rest } = {}) {
  const plan = walkBoardPlan(board, start, steps, choices, mapState);
  return settleHarborTurn({ mapState, settlementId, seatId:'student-1', startNodeId:start,
    plannedRouteNodeIds:plan.nodeIds, plannedRouteEdgeIds:plan.edgeIds,
    boardNodes:board.nodes, boardTemplateRef:ref, ...rest });
}
function move(start, steps, choices = {}) {
  const runtime = createRuntime({ mode:'teacher-led',board:BOARD_TEMPLATE,theme:THEME_PACKS['cloud-harbor'],taskRandom:()=>0 });
  runtime.teams[0].nodeId = start;
  return rollTeacherMove({ runtime,board:BOARD_TEMPLATE,attemptId:'move-1',dieValue:steps,routeChoices:choices });
}

test('published crystal release remains byte-equivalent, frozen and registered with its original level', () => {
  const hashes = {
    CRYSTAL_BOARD_TEMPLATE_V221:'b5bac687713ad341a220a5bce40adab4f62530ae74abcc1ff7965a9a3c6dc494',
    CRYSTAL_THEME_V221:'7a38a2cd3baef0615ce93dbc818235dd63443fdb1ce427379c1a622a1a337077',
    CRYSTAL_WORLD_V121:'7b7c404c7f992bdeb492a15ecaff66deffdf3a57aa42bc69cc0f036b6adae098',
    CRYSTAL_WORLD_ROUTE_V121:'ae866cb03045c6c9900ba4b72b9834913fbd0da8370b2b61cbe9bba605eaacef',
    CRYSTAL_GAME_RELEASE_V221:'00ac8db33b915fa7b670f03283dd2a560370716f523bc64000e816727024868b',
  };
  for (const [key, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(JSON.stringify(published[key])).digest('hex'),hash,key);
    assert.equal(Object.isFrozen(published[key]),true);
  }
  const old = resolveWorldComposition(CRYSTAL_V121_WORLD_REF,WORLD_REGISTRIES);
  assert.equal(old.board.version,'2.2.1');
  assert.deepEqual(old.level,LEVEL_ONE);
  assert.equal(old.theme.version,'2.2.1');
  assert.ok(old.board.edges.some(edge=>edge.id==='e14c'));
  assert.equal(isCurrentCloudHarborWorldRef(CRYSTAL_V121_WORLD_REF),false);
  for (const route of Object.values(WORLD_ROUTES)) assert.deepEqual(validateWorldRoute(route,WORLD_REGISTRIES),[]);
});

test('new composition locks the approved versions and only the approved topology changes', () => {
  const current = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF,WORLD_REGISTRIES);
  assert.equal(current.worldPack.version,'1.3.0');
  assert.equal(current.board.version,'2.3.0');
  assert.equal(current.theme.version,'2.3.0');
  assert.deepEqual(current.level,CURRENT_LEVEL_ONE);
  assert.equal(XIMITU_WORLD_ROUTE.version,'1.3.0');
  assert.deepEqual(validateBoardTemplate(current.board),[]);
  assert.equal(current.board.nodes.length,61);
  assert.equal(current.board.edges.length,64);
  assert.deepEqual(current.board.edges,oldBoard.edges.filter(edge=>edge.id!=='e14c'));
  for (const node of current.board.nodes) {
    const previous = oldBoard.nodes.find(old=>old.id===node.id);
    assert.deepEqual([node.x,node.y],[previous.x,previous.y],node.id);
    if (!['n05b','n06a','n12b','n34'].includes(node.id)) assert.deepEqual(node,previous);
    else assert.deepEqual(node,{id:node.id,x:previous.x,y:previous.y,spaceRole:'learning'},`${node.id} is a plain cell`);
    assert.ok(WORLD_REWARD_DEFINITIONS[current.level.nodeBindings[node.id].rewardRef]);
  }
  assert.equal(current.board.artRegions[0].layoutContractRef,'board.ximitu-card-hunt.zone-01-layout.v7');
  assert.deepEqual(current.board.artRegions.slice(1),oldBoard.artRegions.slice(1));
  assert.equal(current.theme.scenePresentation.facilityNodeIds.includes('n05b'),false);
  assert.deepEqual(current.theme.scenePresentation.decorativeFacilities,[{kind:'harbor-foghorn',nodeId:'n05b',offset:{x:-40,y:-38},scale:0.52}]);
});

test('retired slide, trampoline and launcher cells are plain final landings with no effect', () => {
  for (const [start,cell] of [['n05a','n06a'],['n11b','n12b'],['n33','n34']]) {
    const landed = settle({start});
    assert.equal(landed.landingNodeId,cell);
    assert.equal(landed.settledNodeId,cell);
    assert.equal(landed.transport,null);
    assert.deepEqual(landed.events,[]);
    assert.equal(landed.mapState.cloudRouteOpen,false);
    assert.equal(landed.mapState.cloudReefCleared,false);
    const actual = move(start,1);
    assert.equal(actual.runtime.teams[0].nodeId,cell);
    assert.equal(actual.effects.some(item=>['transport_move','map_effect'].includes(item.type)),false);
    assert.equal(CURRENT_LEVEL_ONE.nodeBindings[cell].semanticType,'ordinary');
    assert.equal(CURRENT_LEVEL_ONE.nodeBindings[cell].rewardRef,'reward.ordinary.none.v1');
  }
  assert.equal(BOARD_TEMPLATE.nodes.some(node=>node.spaceRole==='transport'||node.transportProfileRef),false);
  for (const theme of Object.values(THEME_PACKS)) {
    assert.equal(Object.keys(theme.transportSkins||{}).some(ref=>/trampoline|rainbow-slide/.test(ref)),false);
    assert.equal(Object.keys(theme.facilitySkins||{}).some(kind=>/trampoline|slide/.test(kind)),false);
  }
  assert.equal(Object.keys(WORLD_REWARD_DEFINITIONS).some(ref=>/trampoline|rainbow-slide/.test(ref)),false);
});

test('retired foghorn is a strict map no-op; stale open-watergate state cannot restore its removed edge', () => {
  const result = settle({start:'n04',choices:{n04:1},fairyActive:true,activeSeatCount:8,effectiveTurn:99});
  assert.equal(result.settledNodeId,'n05b');
  assert.equal(result.transport,null);
  assert.deepEqual(result.events,[]);
  assert.deepEqual(result.mapState,{...createHarborMapState(),processedSettlementIds:['move-1']});
  assert.equal(CURRENT_LEVEL_ONE.nodeBindings.n05b.semanticType,'ordinary');
  assert.equal(CURRENT_LEVEL_ONE.nodeBindings.n05b.rewardRef,'reward.ordinary.none.v1');
  assert.equal(findPendingRouteChoice(BOARD_TEMPLATE,'n14',3,{}, {cloudRouteOpen:true}),null);
  assert.deepEqual(walkBoardPlan(BOARD_TEMPLATE,'n14',3,{}, {cloudRouteOpen:true}).nodeIds,['n15','n16','n17']);
  const passed=move('n04',1,{n04:1});
  assert.equal(passed.effects.some(item=>['map_effect','activity_open','transport_move'].includes(item.type)),false);
});

test('old watergate and foghorn settle the original behavior while the current board never opens the shortcut', () => {
  const old=settle({board:oldBoard,ref:'ximitu-card-hunt-board.v1@2.2.1'});
  assert.equal(old.settledNodeId,'n12b');
  assert.equal(old.transport,null);
  assert.equal(old.mapState.cloudRouteOpen,true);
  assert.deepEqual(old.events.map(event=>event.type),['cloudfall_gate']);
  const foghorn=settle({board:oldBoard,ref:'ximitu-card-hunt-board.v1@2.2.1',start:'n04',choices:{n04:1}});
  assert.equal(foghorn.mapState.foghornTriggered,true);
  assert.deepEqual(foghorn.events.map(event=>event.type),['harbor_foghorn']);
  assert.throws(()=>settle({ref:'ximitu-card-hunt-board.v1@latest'}),/unsupported harbor/);
  // The current board ref never runs old machinery, even when handed old nodes.
  assert.deepEqual(settle({board:oldBoard}).events,[]);
});

test('actual app harbor caller and server planner agree on versioned facilities and map state', () => {
  const app = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
  const opening = 'harborSettlement = settleHarborTurn({';
  const start = app.indexOf(opening);
  assert.notEqual(start, -1, 'execute the actual production caller rather than a copied argument object');
  assert.equal(app.indexOf(opening, start + opening.length), -1, 'review every caller if another is introduced');
  const end = app.indexOf('\n      });', start);
  assert.notEqual(end, -1);
  const actualCaller = app.slice(start, end + '\n      });'.length);

  for (const [version, routeRef, expectedEvents, expectedTargets] of [
    ['2.3.0', 'route.ximitu-main@1.3.0', [[], [], []], ['n05b', 'n06a', 'n12b']],
    ['2.2.1', 'route.ximitu-main@1.2.1', [['harbor_foghorn'], ['signal_cannon'], ['cloudfall_gate']], ['n05b', 'n09', 'n12b']],
  ]) {
    for (const [index, [from, choices]] of [['n04', { n04: 'e04b' }], ['n05a', {}], ['n11b', {}]].entries()) {
      const studentId = 'student-1';
      const attemptId = `caller-${version}-${from}`;
      const session = { ...createPointsWorld([studentId], () => 'world-1', routeRef), studentIds: [studentId], completedTurns: 0 };
      const composition = resolveWorldComposition(session.world.active.worldPackRef, WORLD_REGISTRIES);
      const board = composition.board;
      assert.equal(board.version, version);
      session.teams[0].nodeId = from;
      session.rule = { worlds: [{ worldRef: composition.worldRef,
        boardRef: `${board.id}@${board.version}`, levelRef: `${composition.level.id}@${composition.level.version}`,
        nodes: board.nodes.map(node => ({ nodeId: node.id, points: 100 })) }] };
      const turn = { attemptId, studentId, steps: 1, nextWorldInstanceId: 'world-next',
        startLocation: { nodeId: from, worldInstanceId: 'world-1' } };
      const server = planPointsMove(session, turn, { 'world-1': choices });
      const context = {
        settleHarborTurn, harborSettlement: null,
        turnStartRuntime: { mapState: structuredClone(session.world.active.mapState), completedMoveCount: 0 },
        attemptId, actorSeat: { id: studentId }, gameSession: { seats: [{ id: studentId }] },
        movingTeam: { nodeId: from },
        plannedMove: walkBoardPlan(board, from, 1, choices, session.world.active.mapState),
        activeBoardTemplate: board, fairyState: { status: 'absent' }, FAIRY_STATUS: { active: 'active' },
      };
      runInNewContext(actualCaller, context, { timeout: 1000 });
      const browser = context.harborSettlement;
      assert.equal(browser.settledNodeId, expectedTargets[index], `${version} from ${from}`);
      assert.equal(browser.settledNodeId, server.finalLocation.nodeId);
      assert.deepEqual(browser.mapState, server.world.active.mapState);
      assert.deepEqual(browser.events.map(event => event.type), expectedEvents[index]);
      assert.deepEqual(browser.committedRouteNodeIds, server.plan.effects.filter(effect => effect.type === 'pawn_step').map(effect => effect.nodeId));
      assert.equal(server.event.nodeId, expectedTargets[index], 'points use the true final cell');
      assert.equal(server.event.boardRef, `${board.id}@${version}`);
    }
  }
});

test('beacon remains a committed e18 boundary celebration, never a stop-at-n18 reward', () => {
  assert.deepEqual(settle({start:'n17'}).events,[]);
  const first=settle({start:'n18'});
  assert.deepEqual(first.events.map(event=>event.type),['departure_beacon']);
  assert.equal(first.events[0].firstTime,true);
  const again=settle({start:'n18',mapState:first.mapState,settlementId:'move-2'});
  assert.deepEqual(again.events,[]);
  const next=settle({start:'n18',mapState:first.mapState,settlementId:'move-3',seatId:'student-2'});
  assert.equal(next.events[0].firstTime,false);
});

test('forward world plans retain all dice steps; the old slide cell is an ordinary stop', () => {
  const plan=walkWorldPlan({moveId:'planned-slide',worldRef:CLOUD_HARBOR_WORLD_REF,worldInstanceId:'world-1',worldOrdinal:1,startNodeId:'n10',steps:2,routeChoicesByWorldInstance:{'world-1':{n10:1}},worldRoute:XIMITU_WORLD_ROUTE,registries:WORLD_REGISTRIES});
  assert.equal(plan.finalLocation.nodeId,'n12b');
  assert.equal(plan.effects.filter(effect=>effect.type==='pawn_step').length,2);
  const result=settle({start:'n10',steps:2,choices:{n10:1}});
  assert.deepEqual(result.committedRouteNodeIds,['n11b','n12b']);
  assert.equal(result.settledNodeId,'n12b');
  assert.equal(result.transport,null);
  for(const steps of [1,2,3,4,5,6]) {
    const crossing=walkWorldPlan({moveId:`cross-${steps}`,worldRef:CLOUD_HARBOR_WORLD_REF,worldInstanceId:'world-1',worldOrdinal:1,startNodeId:'n48',steps,worldRoute:XIMITU_WORLD_ROUTE,registries:WORLD_REGISTRIES});
    assert.equal(crossing.effects.filter(effect=>effect.type==='pawn_step').length,steps);
    assert.equal(crossing.effects.filter(effect=>effect.type==='world_transition').length,1);
  }
});
