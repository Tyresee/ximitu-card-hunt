import test from "node:test";
import assert from "node:assert/strict";
import { automaticRouteChoice } from "../public/prototypes/universal-board/route-choice-equivalence.js";

function boardFor(edges, exits = []) {
  return {
    nodes: [...new Set(edges.flatMap(([from, to]) => [from, to]))].map(id => ({ id })),
    edges: edges.map(([from, to, id, extra = {}], index) => ({ from, to, id, order: index, ...extra })),
    exits: exits.map(nodeId => ({ nodeId })),
  };
}
const planFor = (remainingSteps, edgeIds = ["ja", "jb"]) => ({
  junctionNodeId: "j", remainingSteps, options: edgeIds.map(edgeId => ({ edgeId })),
});
const merged = () => boardFor([["j", "a", "ja"], ["j", "b", "jb"], ["a", "m", "am"], ["b", "m", "bm"]]);
const finalNode = route => route.destinationNodeId;

test("equal complete routes choose one stable legal edge without changing inputs", () => {
  const board = merged();
  const plan = planFor(2, ["jb", "ja"]);
  const before = JSON.stringify({ board, plan });
  const visited = [];
  const choice = automaticRouteChoice({ plan, board, outcomeForRoute: route => {
    visited.push(route);
    return { nodeId: route.destinationNodeId, effects: [], transport: null };
  } });
  assert.deepEqual(choice, { j: "ja" });
  assert.equal(JSON.stringify({ board, plan }), before);
  assert.deepEqual(visited.map(route => route.routeNodeIds), [["a", "m"], ["b", "m"]]);
  assert.ok(visited.every(route => route.consumedSteps === 2 && route.remainingSteps === 0 && route.boundary === "landing"));
});

test("caller policy can equate same-value different tiles, with nested null fields remaining valid JSON", () => {
  const board = boardFor([["j", "a", "ja"], ["j", "b", "jb"]]);
  const plan = planFor(1);
  assert.deepEqual(automaticRouteChoice({ plan, board,
    outcomeForRoute: () => ({ points: 1000, specialType: null, transport: null, details: [null, { pending: false }] }),
  }), { j: "ja" });
  assert.equal(automaticRouteChoice({ plan, board, outcomeForRoute: finalNode }), null,
    "requiring exact position remains an available policy");
});

test("different point, active special, transport, pass or lap outcomes retain a choice", () => {
  const board = boardFor([["j", "a", "ja"], ["j", "b", "jb"]]);
  const plan = planFor(1);
  for (const field of ["points", "specialType", "transport", "passState", "completedLaps"]) {
    assert.equal(automaticRouteChoice({ plan, board, outcomeForRoute: route => ({
      points: 1000, specialType: null, transport: null, passState: {}, completedLaps: 0,
      [field]: route.destinationNodeId === "a" ? "first" : "second",
    }) }), null, field);
  }
});

test("equal preview defaults cannot conceal an unequal unresolved downstream route", () => {
  const board = boardFor([
    ["j", "a", "ja"], ["j", "b", "jb"], ["a", "c", "ac"], ["b", "d", "bd"],
    ["c", "u", "cu"], ["c", "v", "cv"], ["d", "u", "du"], ["d", "w", "dw"],
  ]);
  const seen = [];
  const choice = automaticRouteChoice({ plan: planFor(3), board, outcomeForRoute: route => {
    seen.push(route.destinationNodeId);
    return ({ u: 1000, v: 1500, w: 5000 })[route.destinationNodeId];
  } });
  assert.equal(choice, null);
  assert.deepEqual(seen, ["u", "v", "u", "w"]);
});

test("an earlier merged fork is irrelevant even when a later real choice remains", () => {
  const board = boardFor([
    ["j", "a", "ja"], ["j", "b", "jb"], ["a", "m", "am"], ["b", "m", "bm"],
    ["m", "x", "mx"], ["m", "y", "my"],
  ]);
  const seen = [];
  const result = automaticRouteChoice({ plan: planFor(3), board, outcomeForRoute: route => {
    seen.push(route.routeChoices);
    return route.destinationNodeId === "x" ? { points: 500, effect: null } : { points: 1500, effect: "double" };
  } });
  assert.deepEqual(result, { j: "ja" }, "the helper chooses only this fork, never a future one");
  assert.deepEqual(seen.map(choices => choices.m), ["mx", "my", "mx", "my"]);
});

test("already-saved downstream choices are honored instead of exploring a different path", () => {
  const board = boardFor([
    ["j", "a", "ja"], ["j", "b", "jb"], ["a", "m", "am"], ["b", "m", "bm"],
    ["m", "x", "mx"], ["m", "y", "my"],
  ]);
  for (const selected of ["my", 1]) {
    const seen = [];
    const choices = { m: selected };
    assert.deepEqual(automaticRouteChoice({ plan: planFor(3), board, routeChoices: choices,
      outcomeForRoute: route => { seen.push(route.destinationNodeId); return finalNode(route); },
    }), { j: "ja" });
    assert.deepEqual(seen, ["y", "y"]);
    assert.deepEqual(choices, { m: selected });
  }
  assert.equal(automaticRouteChoice({ plan: planFor(3), board, routeChoices: { m: "missing" }, outcomeForRoute: finalNode }), null);
});

test("conditional edges use the same availability as the board planner", () => {
  const board = merged();
  board.nodes.push({ id: "c" });
  board.edges.push({ id: "jc", from: "j", to: "c", order: 2, availableWhen: { stateKey: "gate", equals: true } },
    { id: "cm", from: "c", to: "m" });
  const args = { plan: planFor(2), board, outcomeForRoute: finalNode };
  assert.deepEqual(automaticRouteChoice(args), { j: "ja" });
  assert.equal(automaticRouteChoice({ ...args, mapState: { gate: true } }), null,
    "a missing third legal branch cannot be ignored");
  assert.deepEqual(automaticRouteChoice({ ...args, plan: planFor(2, ["ja", "jb", "jc"]), mapState: { gate: true } }), { j: "ja" });
});

test("a common exit with equal unused steps can auto before the common continuation", () => {
  const board = merged();
  board.exits = [{ nodeId: "m" }];
  const leaves = [];
  assert.deepEqual(automaticRouteChoice({ plan: planFor(4), board, outcomeForRoute: route => {
    leaves.push(route);
    return { world: "same-locked-world", exit: route.destinationNodeId };
  } }), { j: "ja" });
  assert.ok(leaves.every(route => route.boundary === "exit" && route.remainingSteps === 2));
});

test("exit identity and consumed steps cannot be erased by an overly broad semantic callback", () => {
  const unequalLength = boardFor([
    ["j", "m", "ja"], ["j", "b", "jb"], ["b", "m", "bm"],
  ], ["m"]);
  assert.equal(automaticRouteChoice({ plan: planFor(3), board: unequalLength, outcomeForRoute: () => "same" }), null);
  const differentExit = boardFor([["j", "a", "ja"], ["j", "b", "jb"]], ["a", "b"]);
  assert.equal(automaticRouteChoice({ plan: planFor(2), board: differentExit, outcomeForRoute: () => "same" }), null);
  const oneCompletesLap = boardFor([["j", "a", "ja"], ["j", "b", "jb"]], ["a"]);
  assert.equal(automaticRouteChoice({ plan: planFor(1), board: oneCompletesLap, outcomeForRoute: () => "same" }), null);
});

test("exact final landings never inspect or ask about a fork after the last step", () => {
  const board = boardFor([
    ["j", "a", "ja"], ["j", "b", "jb"], ["a", "m", "am"], ["b", "m", "bm"],
    ["m", "x", "mx"], ["m", "y", "my"],
  ]);
  const visited = [];
  assert.deepEqual(automaticRouteChoice({ plan: planFor(2), board, outcomeForRoute: route => {
    visited.push(route.destinationNodeId);
    return route.destinationNodeId;
  } }), { j: "ja" });
  assert.deepEqual(visited, ["m", "m"]);
  let calls = 0;
  assert.equal(automaticRouteChoice({ plan: planFor(0), board, outcomeForRoute: () => { calls++; return "same"; } }), null);
  assert.equal(calls, 0, "zero remaining steps cannot create a route choice");
});

test("unknown outcomes, malformed paths and bounded-search overflow keep interactive selection", () => {
  const board = merged();
  const args = { plan: planFor(2), board, outcomeForRoute: finalNode };
  for (const outcomeForRoute of [() => null, () => undefined, () => NaN, () => ({ points: undefined }),
    () => new Map(), () => { throw new Error("unknown snapshot"); }]) {
    assert.equal(automaticRouteChoice({ ...args, outcomeForRoute }), null);
  }
  assert.equal(automaticRouteChoice({ ...args, maxPaths: 1 }), null);
  assert.equal(automaticRouteChoice({ ...args, board: { ...board, edges: board.edges.filter(edge => edge.id !== "bm") } }), null,
    "an unregistered dead end is not a final landing");
  assert.equal(automaticRouteChoice({ ...args, plan: planFor(2, ["ja", "missing"]) }), null);
  assert.equal(automaticRouteChoice({ ...args, plan: planFor(13) }), null);
  assert.equal(automaticRouteChoice(), null);
});

test("JSON object key order does not invent different outcomes", () => {
  assert.deepEqual(automaticRouteChoice({ plan: planFor(2), board: merged(), outcomeForRoute: route =>
    route.edgeId === "ja" ? { points: 1000, effect: null } : { effect: null, points: 1000 },
  }), { j: "ja" });
});
