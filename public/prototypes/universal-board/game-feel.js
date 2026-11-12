// Presentation only: these helpers never sample a die or change game assets.
export const DICE_THROW_DURATION = 2000;
export const DICE_THROW_TURNS = Object.freeze({ x: 2, y: 3 });
export const DICE_RESULT_HOLD_DURATION = 2800;
export const DICE_STAGE_RESULT_DURATION = 550;
export const DICE_STAGE_EXIT_DURATION = 180;
export const DICE_RESULT_VIEW = "rotateX(-42deg) rotateY(22deg)";
// CSS face order: front, back, right, left, top, bottom. The result normal
// must point UP (0,-1,0), not toward the viewer (0,0,1), before view tilt.
export const DICE_FACE_ROTATIONS = Object.freeze([
  Object.freeze({ x: 90, y: 0 }),
  Object.freeze({ x: 90, y: 180 }),
  Object.freeze({ x: 90, y: -90 }),
  Object.freeze({ x: 90, y: 90 }),
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 180, y: 0 }),
]);
export const DICE_BEVEL = 0.08;

// The hand supplies the launch impulse: start FAST, then continuously lose
// angular speed (3(1-t)²). Zero velocity/acceleration at rest, no slow wind-up.
export function diceThrowProgress(time) {
  const t = Math.max(0, Math.min(1, time));
  return 1 - (1 - t) ** 3;
}

export function diceThrowKeyframes(target) {
  // Spin at the centre of the spotlight. No sideways throw, bounce or camera shake.
  // Whole turns preserve the exact authoritative upward face at the endpoint.
  const x = 360 * DICE_THROW_TURNS.x + target.x;
  const y = 360 * DICE_THROW_TURNS.y + target.y;
  // Sample once, then let WAAPI interpolate transforms on the compositor.
  // All segments are linear: the NONLINEAR timing is already in the samples.
  return Array.from({ length: 181 }, (_, i) => {
    const offset = i / 180;
    const progress = diceThrowProgress(offset);
    const rx = round(x * progress);
    const ry = round(y * progress);
    return {
      offset,
      transform: `translate3d(0px, 0px, 0) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(0deg)`,
    };
  });
}

// Opt-in local QA only. Measures main-thread frame callbacks, NOT GPU presents.
// Bounded to one throw; never reads player data, writes assets or drives motion.
export function startDiceFrameProbe(enabled) {
  if (!enabled) return () => null;
  const startedAt = performance.now();
  const intervals = [];
  let previous = null;
  let firstFrameDelay = null;
  let hidden = document.hidden;
  let raf;
  const sample = (time) => {
    hidden ||= document.hidden;
    if (previous !== null) intervals.push(time - previous);
    else firstFrameDelay = Math.max(0, time - startedAt);
    previous = time;
    if (intervals.length < 512 && time - startedAt < 5000) raf = requestAnimationFrame(sample);
  };
  raf = requestAnimationFrame(sample);
  return () => {
    cancelAnimationFrame(raf);
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      source: "main-thread-raf-not-gpu",
      hidden: hidden || document.hidden,
      duration: round(performance.now() - startedAt),
      samples: intervals.length,
      firstFrameDelay: round(firstFrameDelay ?? 0),
      median: round(sorted[Math.floor(sorted.length * .5)] ?? 0),
      p95: round(sorted[Math.floor(sorted.length * .95)] ?? 0),
      max: round(sorted.at(-1) ?? 0),
      over25ms: intervals.filter((ms) => ms > 25).length,
    };
  };
}

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const length = Math.hypot(...v); return v.map((n) => n / length); };
const round = (n) => Number(n.toFixed(6));

function bevelPlane(vertices, normal) {
  const n = unit(normal);
  const u = unit(cross(Math.abs(n[2]) > .9 ? [0, 1, 0] : [0, 0, 1], n));
  const v = cross(n, u);
  const center = [0, 1, 2].map((axis) => vertices.reduce((sum, point) => sum + point[axis], 0) / vertices.length);
  const matrix = [...u, 0, ...v, 0, ...n, 0, 0, 0, 0, 1].map(round).join(",");
  const polygon = vertices.map((point) => {
    const delta = point.map((value, axis) => value - center[axis]);
    return `${round((.5 + dot(delta, u)) * 100)}% ${round((.5 + dot(delta, v)) * 100)}%`;
  }).join(", ");
  return {
    vertices, normal: n,
    transform: `translate3d(${center.map((value) => `calc(var(--die-size) * ${round(value)})`).join(", ")}) matrix3d(${matrix})`,
    clipPath: `polygon(${polygon})`,
    shade: round(.91 + dot(n, unit([-.4, -.7, 1])) * .09),
  };
}

// Twelve bevel strips and eight closed corners join the six real face planes.
// Unlike six rounded rectangles, this is a closed volume from every angle.
export function diceBevelPlanes() {
  const h = .5;
  const r = h - DICE_BEVEL;
  const planes = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const a = (axis + 1) % 3;
    const b = (axis + 2) % 3;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const point = (along, va, vb) => {
        const p = [0, 0, 0]; p[axis] = along; p[a] = va * sa; p[b] = vb * sb; return p;
      };
      const normal = [0, 0, 0]; normal[a] = sa; normal[b] = sb;
      planes.push(bevelPlane([point(-r, h, r), point(r, h, r), point(r, r, h), point(-r, r, h)], normal));
    }
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    planes.push(bevelPlane([[x * h, y * r, z * r], [x * r, y * h, z * r], [x * r, y * r, z * h]], [x, y, z]));
  }
  return planes;
}

export function rewardReceiptCopy(presentation, playerName) {
  const stars = presentation.resource === "star";
  const amount = presentation.amount;
  const total = presentation.assetsAfter?.[stars ? "stars" : "coins"];
  return {
    title: `${playerName} · ${presentation.kind === "conversion" ? "换得" : "获得"}${stars ? "星星" : "金币"}`,
    amount: `+${amount}`,
    total: Number.isFinite(total) ? `本局${stars ? "星星" : "金币"} ${total}` : "已收入个人账户",
  };
}
