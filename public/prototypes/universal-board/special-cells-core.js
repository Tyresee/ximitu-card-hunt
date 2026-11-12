// 特效格 v1（docs/design/monopoly-special-cells-v1.md）。
// Pure, deterministic rules shared by the game server (authoritative draw and
// settlement) and the browser (presentation only). The browser never draws a
// layout or computes a wallet amount from this module; it only renders the
// server snapshot with the same type table.

export const SPECIAL_CELLS_POLICY = "points-only-v2-special-cells";
export const LEGACY_SPECIAL_CELLS_SCHEMA = "special-cells.v1";
export const SPECIAL_CELLS_SCHEMA = "special-cells.v2";
export const SPECIAL_CELL_SINGLE_CLAIM_CAP = 3000;
// Only newly confirmed moves use landed effects; historical group rewards stay read-only.
export const GROUP_LANDING_EFFECTS_POLICY = "group-landing-effects-v1";

export function groupLandingEffectsPending(move, snapshot) {
  if (move?.status !== "confirmed" || move.landingEffectsPolicy !== GROUP_LANDING_EFFECTS_POLICY) return false;
  if (!Array.isArray(move.awards) || move.awards.some(award => award.status !== "awarded" || award.landingEffectsApplied !== true)) return true;
  const ids = new Set(move.awards.map(award => award.attemptId));
  return Object.values(snapshot?.bonusAwards || {}).some(award => ids.has(award.turnId) && award.status !== "awarded");
}

export const SPECIAL_CELL_MIN_SPACING = 4;
export const SPECIAL_CELL_MOVE_TOTAL_CAP = 4;
export const SPECIAL_CELL_GROUP_MOVE_LESSON_CAP = 3;
export const SPECIAL_CELL_RED_PACKET_EACH = 50;
export const SPECIAL_CELL_DENSITIES = Object.freeze(["few", "normal", "many"]);

// rarity: 0 普通 / 1 少见 / 2 稀有. Order = presentation group order.
export const LEGACY_SPECIAL_CELL_TYPES = Object.freeze([
  { id: "star", name: "闪亮星", effect: "积分 ×1.5", icon: "⭐", color: "#FFD23F", glow: "#FFF3B0", rarity: 0, weight: 25, cap: Infinity, category: "points", oneTime: true, multiplier: 1.5 },
  { id: "bag", name: "幸运袋", effect: "积分 +100", icon: "💰", color: "#FF9F43", glow: "#FFD9A8", rarity: 0, weight: 15, cap: Infinity, category: "points", oneTime: true, addend: 100 },
  { id: "move1", name: "全班前进1", effect: "全班 +1 格", icon: "🐾", color: "#4FD6A5", glow: "#C9F7E6", rarity: 0, weight: 18, cap: Infinity, category: "move", oneTime: false, groupSteps: 1 },
  { id: "double", name: "双星", effect: "积分 ×2", icon: "⭐⭐", color: "#FFB21E", glow: "#FFE7A3", rarity: 1, weight: 15, cap: 3, category: "points", oneTime: true, multiplier: 2 },
  { id: "move2", name: "全班前进2", effect: "全班 +2 格", icon: "🐾🐾", color: "#25C2B0", glow: "#B8F1EA", rarity: 1, weight: 8, cap: 2, category: "move", oneTime: false, groupSteps: 2 },
  { id: "redpack", name: "全班小红包", effect: "每人 +50", icon: "🧧", color: "#FF5C6C", glow: "#FFC9CF", rarity: 1, weight: 8, cap: 1, category: "points", oneTime: true, eachStudent: SPECIAL_CELL_RED_PACKET_EACH },
  { id: "reroll", name: "再掷一次", effect: "再掷一次", icon: "🎲", color: "#4CB8F5", glow: "#C6E9FF", rarity: 1, weight: 5, cap: 2, category: "reroll", oneTime: false },
  { id: "crown", name: "金皇冠", effect: "积分 ×3", icon: "👑", color: "#FFC400", glow: "#FFF1A6", rarity: 2, weight: 4, cap: 1, category: "points", oneTime: true, multiplier: 3 },
  { id: "move3", name: "全班前进3", effect: "全班 +3 格", icon: "🚀", color: "#2BD18B", glow: "#C2FAD9", rarity: 2, weight: 2, cap: 1, category: "move", oneTime: true, groupSteps: 3 },
].map((type, order) => Object.freeze({ ...type, order })));
// Freeze the v1 pool and its order so old locked layouts redraw identically.
export const SPECIAL_CELL_TYPES = Object.freeze([...LEGACY_SPECIAL_CELL_TYPES.slice(0, 7),
  { id: "double_dice", name: "双骰机会", effect: "下次掷两颗骰子", icon: "🎲🎲",
    color: "#8E77E8", glow: "#E6DDFF", rarity: 1, weight: 15, cap: 2, category: "double_dice", oneTime: true,
  },
  ...LEGACY_SPECIAL_CELL_TYPES.slice(7),
].map((type, order) => Object.freeze({ ...type, order })));
export const SPECIAL_CELL_TYPE_BY_ID = Object.freeze(Object.fromEntries(SPECIAL_CELL_TYPES.map((type) => [type.id, type])));

// Never-placed node roles: start area, junctions, transports (sources and their
// cold landing targets), the lighthouse, map devices, portals and goals.
const BLOCKED_ROLES = new Set(["junction", "transport", "portal", "goal", "map-effect"]);
const BLOCKED_NODE_IDS = new Set(["n18"]); // 离港光点 (departure on pass-through)
const BLOCKED_PROFILE_KINDS = new Set(["route-choice", "conditional-route-choice", "transport", "map-effect", "world-transition", "collection-gallery"]);

export function specialCellCount(studentCount, density = "normal") {
  const index = SPECIAL_CELL_DENSITIES.indexOf(density);
  if (index < 0) throw new RangeError("density must be few, normal or many");
  const n = Number(studentCount);
  if (!Number.isInteger(n) || n < 1 || n > 8) throw new RangeError("studentCount must be 1–8");
  const table = n <= 2 ? [8, 12, 16] : n <= 5 ? [6, 10, 14] : [5, 8, 12];
  return table[index];
}

// 32-bit cyrb53 variant: stable in every JS runtime, no crypto dependency.
export function specialCellsLayoutSeed(sessionId, drawNumber) {
  const text = `${sessionId}:${drawNumber}`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const edgeAvailable = (edge, mapState) => !edge.availableWhen
  || mapState?.[edge.availableWhen.stateKey] === edge.availableWhen.equals;

function zoneOf(board, node) {
  if (node.zoneId) return node.zoneId;
  return (board.zones || []).find(({ bounds: b }) => b && node.x >= b.x && node.x < b.x + b.width
    && node.y >= b.y && node.y < b.y + b.height)?.id || null;
}

function bfs(startIds, neighbours) {
  const distance = new Map(startIds.map((id) => [id, 0]));
  const queue = [...startIds];
  while (queue.length) {
    const id = queue.shift();
    for (const next of neighbours(id) || []) {
      if (!distance.has(next)) { distance.set(next, distance.get(id) + 1); queue.push(next); }
    }
  }
  return distance;
}

/** Route facts for one board: order from the entry, distance to the end, zones. */
export function specialCellBoardFacts(board) {
  const outgoing = new Map(), incoming = new Map(), undirected = new Map();
  const push = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  for (const edge of board.edges) {
    push(outgoing, edge.from, edge.to); push(incoming, edge.to, edge.from);
    push(undirected, edge.from, edge.to); push(undirected, edge.to, edge.from);
  }
  const entry = board.entryNodeId || board.startNodeId;
  const order = bfs([entry], (id) => outgoing.get(id));
  const ends = board.nodes.filter((node) => !(outgoing.get(node.id) || []).length).map((node) => node.id);
  const toEnd = bfs(ends, (id) => incoming.get(id));
  return { entry, order, toEnd, undirected, outgoing };
}

export function specialCellEligibleNodes({ board, level, points }) {
  const facts = specialCellBoardFacts(board);
  return board.nodes.filter((node) => {
    const profileKind = level?.landingProfiles?.[level?.nodeBindings?.[node.id]?.rewardRef]?.kind;
    const order = facts.order.get(node.id);
    return order !== undefined && order > 3 // 起点及起点后前 3 格
      && !BLOCKED_ROLES.has(node.spaceRole) && !BLOCKED_NODE_IDS.has(node.id)
      && !BLOCKED_PROFILE_KINDS.has(profileKind)
      && !board.nodes.some((other) => other.transportTargetId === node.id)
      && Number.isSafeInteger(points?.get(node.id));
  }).map((node) => ({ nodeId: node.id, order: facts.order.get(node.id), toEnd: facts.toEnd.get(node.id) ?? 0,
    zoneId: zoneOf(board, node), points: points.get(node.id) }));
}

function routeDistance(facts, a, b) {
  return bfs([a], (id) => facts.undirected.get(id)).get(b) ?? Infinity;
}

function placeInWorld({ candidates, facts, quota, random, requiredZones }) {
  const distances = new Map();
  const far = (a, b) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!distances.has(key)) distances.set(key, routeDistance(facts, a, b));
    return distances.get(key) >= SPECIAL_CELL_MIN_SPACING;
  };
  let best = [];
  for (let attempt = 0; attempt < 80 && best.length < quota; attempt += 1) {
    const picked = [];
    const fits = (candidate) => picked.every((other) => far(candidate.nodeId, other.nodeId));
    for (const zoneId of requiredZones) {
      if (picked.length >= quota) break;
      const found = shuffled(candidates.filter((c) => c.zoneId === zoneId), random).find(fits);
      if (found) picked.push(found);
    }
    for (const candidate of shuffled(candidates, random)) {
      if (picked.length >= quota) break;
      if (!picked.includes(candidate) && fits(candidate)) picked.push(candidate);
    }
    const zonesOk = requiredZones.every((zone) => picked.some((c) => c.zoneId === zone));
    const bestZonesOk = requiredZones.every((zone) => best.some((c) => c.zoneId === zone));
    if ((zonesOk && !bestZonesOk) || (zonesOk === bestZonesOk && picked.length > best.length)) best = picked;
  }
  return best;
}

/**
 * worlds: [{ worldRef, board, level, points: Map(nodeId → 100|200|300|500|1000) }]
 * in route order; worlds[0] is the entry world (晶港四区).
 */
export function drawSpecialCells({ sessionId, drawNumber, studentCount, density = "normal", multipliersEnabled = true, worlds, layoutVersion = SPECIAL_CELLS_SCHEMA }) {
  if (typeof sessionId !== "string" || !sessionId) throw new TypeError("sessionId is required");
  if (!Number.isSafeInteger(drawNumber) || drawNumber < 1) throw new RangeError("drawNumber must be ≥ 1");
  if (!Array.isArray(worlds) || !worlds.length) throw new TypeError("worlds are required");
  if (![LEGACY_SPECIAL_CELLS_SCHEMA, SPECIAL_CELLS_SCHEMA].includes(layoutVersion)) throw new RangeError("unknown special cell layout version");
  const typePool = layoutVersion === LEGACY_SPECIAL_CELLS_SCHEMA ? LEGACY_SPECIAL_CELL_TYPES : SPECIAL_CELL_TYPES;
  const target = specialCellCount(studentCount, density);
  const layoutSeed = specialCellsLayoutSeed(sessionId, drawNumber);
  const random = mulberry32(layoutSeed);
  const prepared = worlds.map((world) => ({ ...world, facts: specialCellBoardFacts(world.board),
    candidates: specialCellEligibleNodes(world) }));
  const eligibleTotal = prepared.reduce((sum, world) => sum + world.candidates.length, 0);
  const entryZones = [...new Set(prepared[0].candidates.map((c) => c.zoneId).filter(Boolean))].sort();
  // Spread by eligible-cell ratio; with ≥4 cells every 晶港 zone receives one.
  let remaining = target;
  const quotas = prepared.map((world, index) => {
    if (index === prepared.length - 1) return remaining;
    let quota = Math.round(target * (world.candidates.length / Math.max(1, eligibleTotal)));
    if (index === 0 && target >= 4) quota = Math.max(quota, Math.min(target, entryZones.length));
    quota = Math.min(quota, remaining);
    remaining -= quota;
    return quota;
  });
  const placed = prepared.flatMap((world, index) => placeInWorld({ candidates: world.candidates, facts: world.facts,
    quota: quotas[index], random, requiredZones: index === 0 && target >= 4 ? entryZones : [] })
    .map((candidate) => ({ ...candidate, worldRef: world.worldRef, worldIndex: index, valueScale: world.valueScale === 5 ? 5 : 1 })));

  // Every cell draws its own type; a capped type is removed and the draw repeats
  // among the remaining weights. A cell with no legal type is left ordinary.
  const used = {}; let moveTotal = 0;
  const typed = [];
  for (const cell of shuffled(placed, random)) {
    const allowed = typePool.filter((type) => {
      if (!multipliersEnabled && type.category === "points") return false;
      if ((used[type.id] || 0) >= type.cap) return false;
      if (type.category === "move" && moveTotal >= SPECIAL_CELL_MOVE_TOTAL_CAP) return false;
      if (type.id === "crown" && cell.points > 300 * cell.valueScale) return false;
      if (type.id === "move3" && cell.toEnd < 10) return false;
      return true;
    });
    if (!allowed.length) continue;
    const total = allowed.reduce((sum, type) => sum + type.weight, 0);
    let roll = random() * total, chosen = allowed[allowed.length - 1];
    for (const type of allowed) { roll -= type.weight; if (roll < 0) { chosen = type; break; } }
    used[chosen.id] = (used[chosen.id] || 0) + 1;
    if (chosen.category === "move") moveTotal += 1;
    typed.push({ ...cell, type: chosen.id });
  }
  // Every newly drawn v2 layout contains one or two chances; keep the same
  // total count, placement, spacing and zone spread. v1 never enters this path.
  if (layoutVersion === SPECIAL_CELLS_SCHEMA && typed.length && !used.double_dice) {
    const candidates = typed.filter((cell) => SPECIAL_CELL_TYPE_BY_ID[cell.type].category !== "move");
    (candidates.length ? candidates : typed)[Math.floor(random() * (candidates.length || typed.length))].type = "double_dice";
  }
  typed.sort((a, b) => a.worldIndex - b.worldIndex || a.order - b.order || a.nodeId.localeCompare(b.nodeId));
  return {
    schemaVersion: layoutVersion, policy: SPECIAL_CELLS_POLICY, layoutSeed, drawNumber,
    density, multipliersEnabled: Boolean(multipliersEnabled), studentCount, targetCount: target,
    cells: typed.map((cell, index) => ({ cellId: `sc${drawNumber}-${String(index + 1).padStart(2, "0")}`,
      worldRef: cell.worldRef, nodeId: cell.nodeId, type: cell.type, routeOrder: cell.order, basePoints: cell.points })),
  };
}

export const roundToTen = (value) => Math.round(value / 10) * 10;

/** Amount for the triggering student's own landing. Red packets add separate claims. */
export function specialCellAmount(typeId, baseAmount, valueScale = 1) {
  const type = SPECIAL_CELL_TYPE_BY_ID[typeId];
  if (!type) throw new RangeError(`unknown special cell type ${typeId}`);
  if (!Number.isSafeInteger(baseAmount) || baseAmount < 0) throw new RangeError("baseAmount must be a safe integer");
  const claimCap = SPECIAL_CELL_SINGLE_CLAIM_CAP * (valueScale === 5 ? 5 : 1);
  let amount = baseAmount, formula = null;
  if (type.multiplier) {
    amount = Math.min(claimCap, roundToTen(baseAmount * type.multiplier));
    formula = `${baseAmount} × ${type.multiplier} = ${amount}！`;
  } else if (type.addend) {
    amount = Math.min(claimCap, roundToTen(baseAmount + type.addend));
    formula = `${baseAmount} + ${type.addend} = ${amount}！`;
  } else if (type.eachStudent) formula = `全班每人 +${type.eachStudent}！`;
  return { amount, bonus: amount - baseAmount, formula };
}

/** Group push: default branch, no transports/effects, stops at a world end. */
export function advanceAlongDefaultRoute(board, nodeId, steps, mapState = {}) {
  const path = [];
  let current = nodeId;
  for (let step = 0; step < steps; step += 1) {
    const options = board.edges.filter((edge) => edge.from === current && edgeAvailable(edge, mapState));
    const edge = options.find((candidate) => candidate.availableWhen === undefined) || options[0];
    if (!edge) break;
    current = edge.to;
    path.push(current);
  }
  return { nodeId: current, path };
}

export function specialCellAt(snapshot, worldRef, nodeId) {
  if (!snapshot?.cells) return null;
  const cell = snapshot.cells.find((entry) => entry.worldRef === worldRef && entry.nodeId === nodeId);
  if (!cell || (snapshot.consumed || []).includes(cell.cellId)) return null;
  return cell;
}

/** Presentation order: type groups (普通 → 少见 → 稀有), route order inside each. */
export function groupSpecialCells(cells) {
  const groups = new Map();
  for (const cell of cells || []) {
    if (!groups.has(cell.type)) groups.set(cell.type, []);
    groups.get(cell.type).push(cell);
  }
  return SPECIAL_CELL_TYPES.filter((type) => groups.has(type.id)).map((type) => ({ type, cells: groups.get(type.id) }));
}

/** Banner copy for a final-landing special cell. Pending bonuses stay honest. */
export function specialCellLandingCopy(special, snapshot) {
  const type = SPECIAL_CELL_TYPE_BY_ID[special?.type];
  if (!type) return null;
  if (special.eachStudent) {
    const related = Object.values(snapshot?.bonusAwards || {}).filter((award) => award.cellId === special.cellId
      || (award.type === "redpack" && award.turnId === special.turnId));
    const pending = !related.length || related.some((award) => award.status !== "awarded");
    return { text: `全班每人 +${special.eachStudent}！`,
      sub: pending ? `${type.name} · 待平台入账` : type.name };
  }
  if (special.category === "points") {
    const award = snapshot?.bonusAwards?.[`${special.turnId || ""}:special`];
    const pending = special.bonus > 0 && award?.status !== "awarded";
    return { text: special.formula || `+${special.amount}！`,
      sub: pending ? `${type.name} · 加成 +${special.bonus} 待平台入账` : (special.bonus > 0 ? `${type.name} · 加成已入账` : type.name) };
  }
  if (special.category === "move") {
    return special.groupMoveInstanceId === "exhausted" || special.exhausted
      ? { text: "今天走够啦", sub: "全班前进本节课已用完 3 次" }
      : { text: "老师有一个小挑战！", sub: type.effect };
  }
  if (special.category === "double_dice") {
    return { text: "双骰机会！下次掷两颗骰子", sub: "下一次行动自动使用 · 最多持有 1 次" };
  }
  if (special.category === "reroll") {
    return { text: "再掷一次！", sub: special.rerollGranted ? "同一位同学马上再掷" : "额外机会不再连锁" };
  }
  return null;
}
