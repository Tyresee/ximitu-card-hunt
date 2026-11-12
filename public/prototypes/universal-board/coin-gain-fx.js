import { validLandingPointsValue } from "./landing-points-values.js";

// Coin-gain FX: presentation only. Never credits, computes or retries points.
// Callers pass amounts that the server already confirmed (receipts / awarded
// bonus awards); unconfirmed amounts get an honest pending label, no fly-in.
// Uses the vendored GSAP (window.gsap) on fixed-position DOM coins; when GSAP
// is missing or reduced motion is requested it degrades to a number pop.

export const COIN_FX_TIERS = Object.freeze([
  Object.freeze({ min: 1000, coins: 16 }),
  Object.freeze({ min: 500, coins: 14 }),
  Object.freeze({ min: 300, coins: 12 }),
  Object.freeze({ min: 200, coins: 10 }),
  Object.freeze({ min: 0, coins: 8 }),
]);
export const COIN_FX_BIG_GAIN = 500;
export const COIN_FX_MAX_PITCH = 3;
export const COIN_FX_RED_PACKET_COINS_PER_STUDENT = 4;

export function coinCountForAmount(amount) {
  const value = Math.max(0, Number(amount) || 0);
  return COIN_FX_TIERS.find((tier) => value >= tier.min).coins;
}

export function isBigCoinGain({ amount, multiplied = false } = {}) {
  return Boolean(multiplied) || (Number(amount) || 0) >= COIN_FX_BIG_GAIN;
}

/** Rising pitch per arriving coin, in semitones, capped. */
export function coinDingPitch(index) {
  return Math.min(COIN_FX_MAX_PITCH, -2 + Math.max(0, index) * 0.4);
}

/** Deterministic burst offset for coin i of n: an upward fan with jitter. */
export function coinBurstOffset(index, count, seed = 0) {
  const spread = Math.PI * 1.15;
  const start = -Math.PI / 2 - spread / 2;
  const t = count <= 1 ? 0.5 : index / (count - 1);
  const jitter = (Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1;
  const angle = start + spread * t + jitter * 0.22;
  const distance = 54 + ((index * 37 + seed * 11) % 5) * 13;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance - 18 };
}

export function quadraticPoint(from, control, to, t) {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

/** A control point that bows the path sideways so staggered coins fan out. */
export function coinFlightControl(from, to, index) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const side = index % 2 ? 1 : -1;
  const bow = (0.18 + (index % 4) * 0.06) * length * side;
  return { x: mid.x - (dy / length) * bow, y: mid.y + (dx / length) * bow - length * 0.22 };
}

/**
 * Derive the FX for one claimed turn from server-confirmed state only.
 * landing: the acting student's gain (base, or base+bonus when the bonus award
 * is awarded); redPacket: per-student credited red packet coins.
 */
export function confirmedCoinGains({ attemptId, turn, snapshot } = {}) {
  if (!turn) return { landing: null, redPacket: null };
  const credited = turn.status === "awarded" && Boolean(turn.receipt);
  const special = turn.specialCell || null;
  const awards = snapshot?.bonusAwards || {};
  let amount = Number(turn.points) || 0;
  let formula = null, bonusPending = 0, multiplied = false;
  if (credited && special?.category === "points" && special.bonus > 0) {
    if (awards[`${attemptId}:special`]?.status === "awarded") {
      amount = special.amount; formula = special.formula || null; multiplied = Boolean(special.formula);
    } else {
      bonusPending = special.bonus;
    }
  }
  const landing = {
    studentId: turn.studentId,
    nodeId: turn.receipt?.landing?.nodeId || turn.nodeId || null,
    amount,
    credited,
    pending: !credited,
    bonusPending,
    formula,
    big: credited && isBigCoinGain({ amount, multiplied }),
    afterBanner: special?.category === "points",
  };
  let redPacket = null;
  if (special?.type === "redpack" && special.eachStudent > 0) {
    const related = Object.values(awards).filter((award) => award?.type === "redpack"
      && (award.turnId === attemptId || award.cellId === special.cellId));
    const awarded = related.filter((award) => award.status === "awarded"
      && award.receipt?.bonus?.studentId === award.studentId && award.receipt.bonus.amount === award.amount);
    redPacket = {
      each: special.eachStudent,
      studentIds: awarded.map((award) => award.studentId),
      pendingCount: related.length ? related.length - awarded.length : 1,
    };
  }
  return { landing, redPacket };
}


const POINTS_CURRENCY = "wordattack-points";
const GROUP_GAIN_POLICY = "group-final-landing-v1";
const BONUS_GAIN_POLICY = "points-only-v2-special-cells";
const POINT_BONUS_TYPES = new Set(["star", "bag", "double", "crown"]);
const EVENT_FIELDS = ["turnId", "studentId", "worldRef", "boardRef", "levelRef", "worldInstanceId", "nodeId"];
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const validPointsWallet = (receipt, studentId) => receipt?.wallet?.studentId === studentId
  && receipt.wallet.currency === POINTS_CURRENCY
  && Number.isSafeInteger(receipt.wallet.balance) && receipt.wallet.balance >= 0;

function confirmedGroupBase(award) {
  const landing = award?.receipt?.landing, event = award?.event;
  return award?.status === "awarded" && positiveInteger(award.points)
    && typeof award.attemptId === "string" && award.attemptId.startsWith("group-landing:")
    && typeof award.studentId === "string" && event?.turnId === award.attemptId && event.studentId === award.studentId
    && EVENT_FIELDS.every((field) => typeof event[field] === "string" && event[field] && landing?.[field] === event[field])
    && landing.amount === award.points && landing.status === "awarded" && landing.currency === POINTS_CURRENCY
    && validLandingPointsValue(landing.ruleVersion, award.points)
    && (!award.ruleVersion || landing.ruleVersion === award.ruleVersion)
    && validPointsWallet(award.receipt, award.studentId);
}

function confirmedGroupBonus(award, bonus, bonusId, studentId, amount, type, cellId) {
  const receipt = bonus?.receipt, paid = receipt?.bonus;
  return typeof cellId === "string" && cellId && positiveInteger(amount) && amount <= (award.receipt.landing.ruleVersion === "monopoly-final-landing-v3" ? 10000 : 3000)
    && bonus?.status === "awarded" && bonus.key === bonusId && bonus.turnId === award.attemptId
    && bonus.studentId === studentId && bonus.cellId === cellId && bonus.type === type && bonus.amount === amount
    && paid?.bonusId === bonusId && paid.turnId === award.attemptId && paid.studentId === studentId
    && paid.cellId === cellId && paid.type === type && paid.amount === amount
    && paid.status === "awarded" && paid.currency === POINTS_CURRENCY && paid.policy === BONUS_GAIN_POLICY
    && paid.ruleVersion === award.receipt.landing.ruleVersion && validPointsWallet(receipt, studentId);
}

/**
 * Presentation receipts for one completed group movement. A component is a base
 * landing or a separate bonus receipt; callers persist receiptIds when queuing
 * its FX. Thus a later bonus can fly alone without replaying its earlier base.
 * Historical moves without frozen awards and unconfirmed money never fly.
 */
export function confirmedGroupCoinGains({ move, snapshot, seenReceiptIds = [], studentIds = null } = {}) {
  const gains = [], pending = [];
  if (move?.status !== "confirmed" || move.rewardPolicy !== GROUP_GAIN_POLICY
    || !Array.isArray(move.awards) || !Array.isArray(move.moves)) return { gains, pending };
  const seen = new Set(seenReceiptIds);
  const roster = new Set((studentIds || move.moves.map((entry) => entry?.studentId)).filter((id) => typeof id === "string" && id));
  const pendingIds = new Set();
  const bonuses = snapshot?.bonusAwards || {};
  for (const award of move.awards) {
    const entry = move.moves.find((value) => value?.studentId === award?.studentId
      && Array.isArray(value.path) && value.path.length > 0);
    const event = award?.event;
    if (!entry || !event || typeof event.nodeId !== "string" || !event.nodeId
      || event.nodeId !== entry.toNodeId || event.studentId !== award.studentId
      || (move.worldInstanceId && event.worldInstanceId !== move.worldInstanceId)
      || !positiveInteger(award.points) || typeof award.attemptId !== "string") continue;
    const baseId = `landing:${award.attemptId}`;
    const origin = { nodeId: event.nodeId, worldRef: event.worldRef, worldInstanceId: event.worldInstanceId,
      awardId: award.attemptId, instanceId: move.instanceId };
    const waiting = (id, studentId, amount, kind) => {
      if (!seen.has(id) && !pendingIds.has(id)) {
        pendingIds.add(id);
        pending.push({ ...origin, receiptId: id, studentId, amount, kind, pending: true });
      }
    };
    if (!confirmedGroupBase(award)) {
      waiting(baseId, award.studentId, award.points, "landing");
      continue;
    }
    const parts = [{ receiptId: baseId, studentId: award.studentId, amount: award.points, kind: "landing" }];
    const special = move.landingEffectsPolicy === "group-landing-effects-v1" ? award.specialCell : null;
    if (special?.category === "points" && POINT_BONUS_TYPES.has(special.type) && positiveInteger(special.bonus)
      && special.baseAmount === award.points && special.amount === award.points + special.bonus) {
      const key = `${award.attemptId}:special`, id = `bonus:${key}`;
      if (confirmedGroupBonus(award, bonuses[key], key, award.studentId, special.bonus, special.type, special.cellId)) {
        parts.push({ receiptId: id, studentId: award.studentId, amount: special.bonus, kind: "bonus" });
      } else waiting(id, award.studentId, special.bonus, "bonus");
    }
    if (special?.type === "redpack" && special.category === "points" && special.eachStudent === 50) {
      for (const studentId of roster) {
        const key = `${special.cellId}:${studentId}`, id = `bonus:${key}`, bonus = bonuses[key];
        if (confirmedGroupBonus(award, bonus, key, studentId, special.eachStudent, "redpack", special.cellId)) {
          parts.push({ receiptId: id, studentId, amount: special.eachStudent, kind: "redpack" });
        } else waiting(id, studentId, special.eachStudent, "redpack");
      }
    }
    // Do not merge gains from different physical source cells, even for the same pupil.
    for (const studentId of new Set(parts.map((part) => part.studentId))) {
      const fresh = [...new Map(parts.filter((part) => part.studentId === studentId && !seen.has(part.receiptId))
        .map((part) => [part.receiptId, part])).values()];
      if (!fresh.length) continue;
      const receiptIds = fresh.map((part) => part.receiptId);
      for (const id of receiptIds) seen.add(id);
      const amount = fresh.reduce((total, part) => total + part.amount, 0);
      const baseAmount = fresh.filter((part) => part.kind === "landing").reduce((total, part) => total + part.amount, 0);
      gains.push({ ...origin, gainId: `group:${award.attemptId}:${studentId}:${fresh.map((part) => part.kind).join("-")}`,
        receiptIds, studentId, amount, baseAmount, credited: true, pending: false,
        bonusPending: pending.filter((part) => part.awardId === award.attemptId && part.studentId === studentId && part.kind !== "landing")
          .reduce((total, part) => total + part.amount, 0),
        big: isBigCoinGain({ amount, multiplied: fresh.some((part) => part.kind === "bonus") }) });
    }
  }
  return { gains, pending };
}

const LAYER_ID = "coin-fx-layer";

function rectCenter(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || (!rect.width && !rect.height)) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * DOM controller. `chipFor(studentId)` and `valueFor(studentId)` are looked up
 * live on every frame because the HUD re-renders while coins are in flight.
 */
export function createCoinGainFx({
  doc = globalThis.document,
  win = globalThis.window,
  sounds = null,
  reduced = () => false,
  chipFor = () => null,
  valueFor = () => null,
  onDisplayChange = () => {},
} = {}) {
  const display = new Map(); // studentId -> number currently shown
  const active = new Map(); // studentId -> running FX count
  let seed = 0;
  const playedGains = new Set(); // presentation identity only; never an economic dedupe boundary

  const gsap = () => win?.gsap || null;
  const motion = () => Boolean(gsap()) && !reduced();

  function layer() {
    let host = doc.getElementById(LAYER_ID);
    if (!host) {
      host = doc.createElement("div");
      host.id = LAYER_ID;
      host.className = "coin-fx-layer";
      host.setAttribute("aria-hidden", "true");
      doc.body.append(host);
    }
    return host;
  }

  function el(className, text = "") {
    const node = doc.createElement("div");
    node.className = className;
    if (text) node.textContent = text;
    layer().append(node);
    return node;
  }

  function place(node, point) {
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
  }

  function chipCenter(studentId) {
    const chip = chipFor(studentId);
    return rectCenter(chip?.querySelector?.("[data-player-asset='points']") || chip);
  }

  function writeDisplay(studentId, value) {
    display.set(studentId, value);
    const chip = chipFor(studentId);
    const strong = chip?.querySelector?.("[data-player-asset='points'] strong");
    if (strong) {
      strong.textContent = String(Math.round(value));
      strong.classList.add("is-coin-rolling");
    }
    onDisplayChange(studentId, Math.round(value));
  }

  /** Hold the shown value before a credit lands so the HUD never jumps. */
  function hold(studentId, value) {
    if (!Number.isFinite(value) || display.has(studentId)) return;
    display.set(studentId, value);
  }

  function release(studentId) {
    const left = (active.get(studentId) || 1) - 1;
    if (left > 0) { active.set(studentId, left); return; }
    active.delete(studentId);
    display.delete(studentId);
    const real = valueFor(studentId);
    const strong = chipFor(studentId)?.querySelector?.("[data-player-asset='points'] strong");
    if (strong) {
      if (Number.isFinite(real)) strong.textContent = String(real);
      strong.classList.remove("is-coin-rolling");
    }
    onDisplayChange(studentId, null);
  }

  function claim(studentId) {
    active.set(studentId, (active.get(studentId) || 0) + 1);
    if (!display.has(studentId)) {
      const real = valueFor(studentId);
      display.set(studentId, Number.isFinite(real) ? real : 0);
    }
  }

  /** Drop holds that no FX picked up so the HUD shows the real value again. */
  function unholdIdle() {
    for (const studentId of [...display.keys()]) {
      if (!active.has(studentId)) { active.set(studentId, 1); release(studentId); }
    }
  }

  /** Additive progress so overlapping FX on one chip (base + red packet) add up. */
  function addDisplay(studentId, delta) {
    if (!active.has(studentId)) return; // a late tween after release must not resurrect a stale value
    writeDisplay(studentId, (display.get(studentId) ?? 0) + delta);
  }

  function bounceChip(studentId) {
    const chip = chipFor(studentId);
    const g = gsap();
    if (!chip || !g) return;
    g.fromTo(chip, { scale: 1.09 }, { scale: 1, duration: 0.28, ease: "back.out(3)", overwrite: "auto", clearProps: "transform" });
  }

  function countBy(studentId, delta, duration = 0.2) {
    const g = gsap();
    if (!g || reduced() || !delta) { addDisplay(studentId, delta); return; }
    const proxy = { value: 0 };
    let last = 0;
    g.to(proxy, { value: delta, duration, ease: "power1.out", onUpdate: () => {
      addDisplay(studentId, proxy.value - last); last = proxy.value;
    } });
  }

  /** Let the last count-up tween finish before handing back the real value. */
  function settle(fn) {
    return new Promise((resolve) => win.setTimeout(() => { fn(); resolve(); }, 220));
  }

  /** Split `amount` into `parts` integer steps that sum exactly to amount. */
  function steps(amount, parts) {
    return Array.from({ length: parts }, (_, i) => Math.round((amount * (i + 1)) / parts) - Math.round((amount * i) / parts));
  }

  function numberPop(point, text, { big = false, className = "" } = {}) {
    const label = el(`coin-fx-number ${big ? "is-big" : ""} ${className}`.trim(), text);
    place(label, point);
    const g = gsap();
    if (!g || reduced()) {
      label.classList.add("is-reduced");
      win.setTimeout(() => label.remove(), 1300);
      return label;
    }
    g.timeline({ onComplete: () => label.remove() })
      .fromTo(label, { scale: 0.35, opacity: 0, xPercent: -50, yPercent: -50 },
        { scale: big ? 1.35 : 1.18, opacity: 1, duration: 0.2, ease: "back.out(2.6)" })
      .to(label, { scale: 1, duration: 0.14, ease: "power1.out" })
      .to(label, { y: -70, opacity: 0, duration: 0.8, ease: "power1.in" }, "+=0.35");
    return label;
  }

  function sparkles(point, count = 8) {
    const g = gsap();
    for (let i = 0; i < count; i += 1) {
      const star = el("coin-fx-sparkle");
      place(star, point);
      const angle = (i / count) * Math.PI * 2;
      const distance = 40 + (i % 3) * 22;
      g.fromTo(star, { xPercent: -50, yPercent: -50, scale: 0.2, opacity: 1 },
        { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, scale: 1, opacity: 0, rotation: 90,
          duration: 0.55, delay: 0.04 * (i % 3), ease: "power2.out", onComplete: () => star.remove() });
    }
  }

  function bigFlash(point) {
    const g = gsap();
    const ring = el("coin-fx-ring");
    place(ring, point);
    g.fromTo(ring, { xPercent: -50, yPercent: -50, scale: 0.2, opacity: 0.95 },
      { scale: 3.4, opacity: 0, duration: 0.7, ease: "power2.out", onComplete: () => ring.remove() });
    const edge = el("coin-fx-edge-glow");
    g.timeline({ onComplete: () => edge.remove() })
      .fromTo(edge, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" })
      .to(edge, { opacity: 0, duration: 0.55, ease: "power1.in" });
    sounds?.play?.("coin-jackpot", { intensity: 1 });
  }

  /** Burst coins at `from` and stream them on curved paths to each target. */
  function streamCoins(from, targets, { coinsPerTarget, onArrive }) {
    const g = gsap();
    const myseed = (seed += 1);
    return new Promise((resolve) => {
      const total = targets.length * coinsPerTarget;
      let landed = 0;
      if (!total) { resolve(); return; }
      targets.forEach((target, targetIndex) => {
        for (let i = 0; i < coinsPerTarget; i += 1) {
          const order = targetIndex * coinsPerTarget + i;
          const coin = el("coin-fx-coin");
          place(coin, from);
          const burst = coinBurstOffset(order, total, myseed);
          const state = { t: 0 };
          let start = null, control = null;
          const tl = g.timeline({
            onComplete: () => {
              coin.remove();
              onArrive(target, i, order);
              landed += 1;
              if (landed === total) resolve();
            },
          });
          tl.fromTo(coin, { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0.4, rotationY: 0 },
            { x: burst.x, y: burst.y, scale: 1, rotationY: 540, duration: 0.34, ease: "power2.out" })
            .to(state, {
              t: 1,
              duration: 0.55,
              delay: 0.05 + order * (total > 24 ? 0.022 : 0.045),
              ease: "power1.in",
              onUpdate: () => {
                start ||= { x: from.x + burst.x, y: from.y + burst.y };
                const end = target.point() || start;
                control ||= coinFlightControl(start, end, order);
                const p = quadraticPoint(start, control, end, state.t);
                g.set(coin, { x: p.x - from.x, y: p.y - from.y, scale: 1 - state.t * 0.45, rotationY: 540 + state.t * 720 });
              },
            });
        }
      });
    });
  }

  function pendingLabel(point, text) {
    const label = el("coin-fx-pending", text);
    place(label, point);
    win.setTimeout(() => label.remove(), 2200);
    return label;
  }

  /**
   * One student's confirmed gain from a board point. Resolves when the FX
   * ends; callers should NOT await it (non-blocking by design).
   */
  function playGain({ studentId, amount, from, big = false, label = null, gainId = null }) {
    if (!(amount > 0) || !studentId) return Promise.resolve(false);
    if (gainId && playedGains.has(gainId)) return Promise.resolve(false);
    if (gainId) playedGains.add(gainId);
    // Reserve synchronously before an async camera/origin task, so another
    // student's FX cannot unhold this pupil's already-confirmed balance early.
    claim(studentId);
    const abandon = () => { if (gainId) playedGains.delete(gainId); release(studentId); return false; };
    const start = (origin) => {
      if (!motion()) {
        numberPop(chipCenter(studentId) || origin, label || `+${amount}`, { big });
        addDisplay(studentId, amount);
        return new Promise((resolve) => win.setTimeout(() => { release(studentId); resolve(); }, 1300));
      }
      sounds?.play?.("coin-burst", { intensity: big ? 1.1 : 0.9 });
      sparkles(origin, big ? 12 : 8);
      if (big) bigFlash(origin);
      numberPop(origin, label || `+${amount}`, { big });
      const coins = coinCountForAmount(amount);
      const increments = steps(amount, coins);
      let arrived = 0;
      return streamCoins(origin, [{ studentId, point: () => chipCenter(studentId) }], {
        coinsPerTarget: coins,
        onArrive: () => {
          arrived += 1;
          bounceChip(studentId);
          sounds?.play?.("coin-ding", { pitch: coinDingPitch(arrived - 1), intensity: 0.8 });
          countBy(studentId, increments[arrived - 1], 0.16);
        },
      }).then(() => settle(() => release(studentId)));
    };
    if (typeof from === "function") {
      return Promise.resolve().then(from).then((origin) => {
        if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return abandon();
        return start(origin).then(() => true);
      }, abandon);
    }
    const origin = from || chipCenter(studentId) || { x: win.innerWidth / 2, y: win.innerHeight / 2 };
    return start(origin).then(() => true);
  }

  /** 全班小红包: envelope pops at centre, splits into a stream to every chip. */
  function playRedPacket({ studentIds, each }) {
    const ids = (studentIds || []).filter(Boolean);
    if (!ids.length || !(each > 0)) return Promise.resolve();
    for (const id of ids) claim(id);
    const centre = { x: win.innerWidth / 2, y: win.innerHeight * 0.45 };
    const finish = () => settle(() => { for (const id of ids) release(id); });
    if (!motion()) {
      for (const id of ids) numberPop(chipCenter(id) || centre, `+${each}`);
      for (const id of ids) addDisplay(id, each);
      return new Promise((resolve) => win.setTimeout(() => { for (const id of ids) release(id); resolve(); }, 1300));
    }
    const g = gsap();
    const envelope = el("coin-fx-red-packet");
    envelope.append(Object.assign(doc.createElement("span"), { textContent: "🧧" }),
      Object.assign(doc.createElement("strong"), { textContent: `全班每人 +${each}` }));
    place(envelope, centre);
    sounds?.play?.("coin-jackpot", { intensity: 1 });
    return new Promise((resolve) => {
      g.timeline({ onComplete: () => envelope.remove() })
        .fromTo(envelope, { xPercent: -50, yPercent: -50, scale: 0.2, opacity: 0, rotation: -8 },
          { scale: 1.15, opacity: 1, rotation: 0, duration: 0.3, ease: "back.out(2.4)" })
        .to(envelope, { rotation: 6, duration: 0.07, yoyo: true, repeat: 3, ease: "sine.inOut" })
        .add(() => {
          sparkles(centre, 12);
          sounds?.play?.("coin-burst", { intensity: 1.1 });
          const perTarget = ids.length > 8 ? 2 : ids.length > 4 ? 3 : COIN_FX_RED_PACKET_COINS_PER_STUDENT;
          const increments = steps(each, perTarget);
          const counts = new Map();
          let dings = 0;
          streamCoins(centre, ids.map((id) => ({ studentId: id, point: () => chipCenter(id) })), {
            coinsPerTarget: perTarget,
            onArrive: (target) => {
              const n = (counts.get(target.studentId) || 0) + 1;
              counts.set(target.studentId, n);
              bounceChip(target.studentId);
              sounds?.play?.("coin-ding", { pitch: coinDingPitch(dings++), intensity: 0.7 });
              if (n === 1) numberPop(chipCenter(target.studentId) || centre, `+${each}`);
              countBy(target.studentId, increments[n - 1], 0.14);
            },
          }).then(finish).then(resolve);
        })
        .to(envelope, { scale: 0.6, opacity: 0, duration: 0.25, ease: "power2.in" });
    });
  }

  return {
    playGain,
    playRedPacket,
    pendingLabel,
    hold,
    unholdIdle,
    displayed: (studentId) => (display.has(studentId) ? Math.round(display.get(studentId)) : null),
    point: (element) => rectCenter(element),
  };
}
