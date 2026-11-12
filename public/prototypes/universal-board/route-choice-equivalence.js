// Presentation-only route simplification. This never samples dice, changes a
// route snapshot or commits movement. The returned edge is sent through the
// normal explicit-choice/persistence/server-plan flow.

const plainObject = value => value !== null && typeof value === "object"
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function outcomeKey(value) {
  if (value === null) return "null";
  if (value === undefined) throw new TypeError("unknown route outcome");
  if (typeof value === "string") {
    if (!value.length) throw new TypeError("empty route outcome");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(outcomeKey).join(",")}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${outcomeKey(value[key])}`).join(",")}}`;
  throw new TypeError("route outcomes must contain only known JSON values");
}

function chosenEdges(outgoing, nodeId, choices) {
  const edges = outgoing.get(nodeId) || [];
  if (!Object.hasOwn(choices, nodeId)) return edges;
  const choice = choices[nodeId];
  const selected = typeof choice === "string"
    ? edges.find(edge => edge.id === choice)
    : Number.isInteger(choice) ? edges[choice] : null;
  if (!selected) throw new Error("saved route choice is unavailable");
  return [selected];
}

/**
 * Return the first legal branch as an explicit route-choice map only if every
 * branch preserves the same set of complete outcomes. Later unresolved forks
 * are enumerated, never silently previewed using a default edge. A later real
 * choice therefore stays a choice after an irrelevant earlier fork is removed.
 *
 * outcomeForRoute receives:
 * { edgeId, startNodeId, routeNodeIds, edgeIds, destinationNodeId,
 *   remainingSteps, consumedSteps, boundary: "landing" | "exit", routeChoices }
 *
 * It owns the semantic comparison (locked base points, active landing effects,
 * pass effects, transports, laps/world continuation). Return a JSON value, or
 * null/undefined if that route cannot be safely compared. An "exit" has unused
 * steps: its world/node and remainingSteps must be part of the outcome so an
 * unknown continuation cannot be confused with an ordinary final landing.
 *
 * Any malformed/unavailable path, unknown outcome, callback failure or bounded
 * search overflow keeps the original interactive choice. Inputs are untouched.
 */
export function automaticRouteChoice({
  plan,
  board,
  routeChoices = {},
  mapState = {},
  outcomeForRoute,
  maxPaths = 256,
} = {}) {
  try {
    if (!plan || !Array.isArray(plan.options) || plan.options.length < 2
      || !Number.isInteger(plan.remainingSteps) || plan.remainingSteps <= 0
      || plan.remainingSteps > 12 || !plainObject(routeChoices) || !plainObject(mapState)
      || typeof outcomeForRoute !== "function" || !Number.isInteger(maxPaths) || maxPaths < 1
      || !Array.isArray(board?.nodes) || !Array.isArray(board?.edges)) return null;

    const nodeIds = new Set(board.nodes.map(node => node.id));
    if (nodeIds.size !== board.nodes.length || !nodeIds.has(plan.junctionNodeId)) return null;
    const edgeIds = new Set();
    const outgoing = new Map(board.nodes.map(node => [node.id, []]));
    for (const edge of board.edges) {
      if (typeof edge.id !== "string" || !edge.id || edgeIds.has(edge.id)
        || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return null;
      edgeIds.add(edge.id);
      if (edge.availableWhen !== undefined && (!plainObject(edge.availableWhen)
        || typeof edge.availableWhen.stateKey !== "string"
        || !Object.hasOwn(edge.availableWhen, "equals") || edge.availableWhen.equals === undefined)) return null;
      if (edge.availableWhen === undefined || Object.hasOwn(mapState, edge.availableWhen.stateKey)
        && Object.is(mapState[edge.availableWhen.stateKey], edge.availableWhen.equals)) {
        outgoing.get(edge.from).push(edge);
      }
    }
    for (const edges of outgoing.values()) edges.sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const nodeId of Object.keys(routeChoices)) {
      if (!nodeIds.has(nodeId)) return null;
      chosenEdges(outgoing, nodeId, routeChoices);
    }
    if (Object.hasOwn(routeChoices, plan.junctionNodeId)) return null;
    const initialEdges = outgoing.get(plan.junctionNodeId);
    const optionIds = new Set(plan.options.map(option => option.edgeId));
    if (optionIds.size !== plan.options.length || initialEdges.length !== optionIds.size
      || initialEdges.some(edge => !optionIds.has(edge.id))) return null;
    const exits = new Set((board.exits || []).map(exit => exit.nodeId));
    let visitedPaths = 0;

    const outcomes = initialEdges.map(initialEdge => {
      const keys = new Set();
      const visit = (nodeId, remainingSteps, routeNodeIds, walkedEdgeIds, choices) => {
        if (++visitedPaths > maxPaths) throw new Error("route equivalence search limit");
        const options = remainingSteps > 0 ? chosenEdges(outgoing, nodeId, choices) : [];
        if (!remainingSteps || !options.length) {
          if (remainingSteps && !exits.has(nodeId)) throw new Error("route ended before all steps");
          const boundary = remainingSteps ? "exit" : "landing";
          const semantic = outcomeForRoute({
            edgeId: initialEdge.id,
            startNodeId: plan.junctionNodeId,
            routeNodeIds: [...routeNodeIds],
            edgeIds: [...walkedEdgeIds],
            destinationNodeId: nodeId,
            remainingSteps,
            consumedSteps: plan.remainingSteps - remainingSteps,
            boundary,
            routeChoices: { ...choices },
          });
          if (semantic === null || semantic === undefined) throw new Error("unknown route outcome");
          // Boundary accounting is non-negotiable even when the caller chooses
          // to compare different final nodes by equal points/effects.
          keys.add(outcomeKey({ boundary, remainingSteps,
            ...(boundary === "exit" ? { exitNodeId: nodeId } : {}),
            endsAtExit: exits.has(nodeId), semantic }));
          return;
        }
        for (const edge of options) visit(edge.to, remainingSteps - 1,
          [...routeNodeIds, edge.to], [...walkedEdgeIds, edge.id],
          options.length > 1 ? { ...choices, [nodeId]: edge.id } : choices);
      };
      visit(initialEdge.to, plan.remainingSteps - 1, [initialEdge.to], [initialEdge.id],
        { ...routeChoices, [plan.junctionNodeId]: initialEdge.id });
      return [...keys].sort();
    });
    const first = JSON.stringify(outcomes[0]);
    if (!outcomes[0].length || outcomes.some(keys => JSON.stringify(keys) !== first)) return null;
    return { [plan.junctionNodeId]: initialEdges[0].id };
  } catch {
    return null;
  }
}
