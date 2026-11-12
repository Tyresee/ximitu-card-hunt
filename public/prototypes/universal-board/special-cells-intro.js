// SpecialCellsIntroSequencer · 开场「本节课宝藏」掉落演出（设计稿 §5.1）。
// Presentation only: it receives the server snapshot (cells[]) and the real
// board's screen positions, and never decides a cell, type or position.
// Rendering: one fixed 1920×1080 overlay stage (scaled to the viewport) with CSS
// transform/opacity cards and a single Canvas 2D for comets/particles, driven by
// one GSAP timeline (vendor/gsap.min.js) on one rAF ticker.
import { SPECIAL_CELL_TYPE_BY_ID, groupSpecialCells } from "./special-cells-core.js";
import { INTRO_SOUND_GAIN, createSoundOutput } from "./sound-output.js";

const W = 1920, H = 1080, ROW_Y = 480, ROW_Y_UP = 165, CARD_STEP = 198;
const MAX_PARTICLES = 300;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function specialCellIconHtml(icon) {
  const chars = Array.from(icon);
  return chars.length > 1 ? `<span class="sc-dbl"><i>${chars[0]}</i><i>${chars[1]}</i></span>` : icon;
}

/**
 * Full-version timeline (seconds), with the spec's compression: flip =
 * clamp(1.5/groups, .18, .3), stagger = clamp(2.4/cells, .08, .2); if the
 * whole thing would exceed 9s, stagger is squeezed first, then the flips.
 */
export function specialCellsIntroTiming(cells, limit = 9) {
  const groups = groupSpecialCells(cells);
  const G = groups.length, N = cells.length;
  const rareGroups = groups.filter((g) => g.type.rarity === 2).length;
  const normals = cells.filter((c) => SPECIAL_CELL_TYPE_BY_ID[c.type].rarity < 2).length;
  const hasRare = normals < N;
  const compute = (flip, stagger) => {
    let t = 0.8 + 0.6 + 0.38 + (G - rareGroups) * flip;
    if (rareGroups) t += flip + 0.6;
    const beat2 = Math.max(3.8, t + 0.15);
    let end2 = beat2 + 0.28 + (normals ? (normals - 1) * stagger + 0.7 : 0);
    if (hasRare) end2 += 0.2 + 1.0;
    const beat3 = end2 + 0.12;
    return { flip, stagger, beat1: 0.8, beat2, beat3, total: beat3 + 1.1 };
  };
  let flip = clamp(1.5 / Math.max(1, G), 0.18, 0.3), stagger = clamp(2.4 / Math.max(1, N), 0.08, 0.2);
  let plan = compute(flip, stagger);
  if (plan.total > limit && normals > 1) {
    stagger = Math.max(0.08, stagger - (plan.total - limit) / (normals - 1));
    plan = compute(flip, stagger);
  }
  if (plan.total > limit && G > rareGroups) {
    flip = Math.max(0.12, flip - (plan.total - limit) / (G - rareGroups + (rareGroups ? 1 : 0)));
    plan = compute(flip, stagger);
  }
  return { ...plan, short: 3.02, reduced: 1.45 };
}

function createFx(canvas) {
  const ctx = canvas.getContext("2d");
  const parts = [], meteors = [], sprites = {};
  let k = 1, slow = 1, low = false, slowFrames = 0, flashA = 0;
  const add = (p) => { if (parts.length >= MAX_PARTICLES) return; p.age = -(p.delay || 0); parts.push(p); };
  const fx = {
    resize(scale) {
      k = clamp(scale * (window.devicePixelRatio || 1), 0.6, 2);
      canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
    },
    sprite(type) {
      if (sprites[type.id]) return sprites[type.id];
      const s = document.createElement("canvas"); s.width = s.height = 128;
      const c = s.getContext("2d"); c.textAlign = "center"; c.textBaseline = "middle";
      const chars = Array.from(type.icon);
      if (chars.length > 1) { c.font = `78px ${EMOJI_FONT}`; c.fillText(chars[0], 46, 50); c.fillText(chars[1], 82, 80); }
      else { c.font = `96px ${EMOJI_FONT}`; c.fillText(type.icon, 64, 70); }
      sprites[type.id] = s; return s;
    },
    ring(x, y, color, r1, life, w, delay = 0) { add({ kind: "ring", x, y, r0: 6, r1, life, w, rgb: hexToRgb(color), delay }); },
    sparks(x, y, color, n, speed, o = {}) {
      if (low) n = Math.ceil(n / 2);
      const rgb = hexToRgb(color);
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25), v = speed * rand(0.55, 1.05);
        add({ kind: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.lift ?? 60), g: o.g ?? 420, drag: 2.6,
          life: rand(0.45, 0.8) * (o.lifeMul || 1), size: rand(3, 6) * (o.sizeMul || 1), rgb: i % 3 === 0 ? "255,255,255" : rgb });
      }
    },
    stars(x, y, color, n, speed, o = {}) {
      if (low) n = Math.ceil(n / 2);
      const rgb = hexToRgb(color);
      for (let i = 0; i < n; i += 1) {
        const a = rand(0, Math.PI * 2), v = speed * rand(0.3, 1);
        add({ kind: "star", x: x + rand(-8, 8), y: y + rand(-8, 8), vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.lift || 0), g: o.g || 0,
          drag: o.drag || 1.8, life: rand(0.6, 1.2) * (o.lifeMul || 1), size: rand(5, 11) * (o.sizeMul || 1), rot: rand(0, 6), vr: rand(-6, 6),
          rgb: i % 2 ? "255,255,255" : rgb });
      }
    },
    dust(x, y, color, n, spread) {
      const rgb = hexToRgb(color);
      for (let i = 0; i < n; i += 1) add({ kind: "dust", x: x + rand(-spread, spread), y: y + rand(-spread, spread), vx: rand(-40, 40), vy: rand(-90, -20), g: -20, drag: 1.2, life: rand(0.5, 1.0), size: rand(2, 5), rgb });
    },
    impact(x, y, type, big) {
      if (big) {
        fx.ring(x, y, "#FFE45C", 260, 0.9, 16); fx.ring(x, y, "#FFFFFF", 180, 0.7, 8, 0.08); fx.ring(x, y, type.color, 340, 1.1, 6, 0.18);
        fx.sparks(x, y, "#FFD23F", 26, 640, { sizeMul: 1.4, lifeMul: 1.3 }); fx.stars(x, y, "#FFE680", 14, 380, { lifeMul: 1.3, sizeMul: 1.4 });
        flashA = Math.max(flashA, 0.45);
      } else {
        fx.ring(x, y, type.color, 74, 0.55, 8); fx.ring(x, y, "#FFFFFF", 112, 0.7, 4, 0.12);
        fx.sparks(x, y, type.color, 10, 380); fx.stars(x, y, type.color, 3, 160);
      }
    },
    meteor(from, to, type, o = {}) {
      const dx = to.x - from.x, side = dx >= 0 ? 1 : -1, lift = o.big ? 280 : 170 + Math.random() * 60;
      // Arc above both ends, never through the title area (y < 240) unless unavoidable.
      const ctrl = { x: from.x + dx * 0.5 - side * (o.big ? 160 : 80), y: Math.max(250, Math.min(from.y, to.y) - lift) };
      const m = { from, to, ctrl, t: 0, type, big: Boolean(o.big), trail: [], rgb: hexToRgb(type.color), alive: true, x: from.x, y: from.y, spin: 0 };
      meteors.push(m); return m;
    },
    setSlow(value) { slow = value; },
    clear() { parts.length = 0; meteors.forEach((m) => { m.alive = false; }); meteors.length = 0; flashA = 0; slow = 1; },
    get low() { return low; },
    tick(time, deltaMs) {
      const dtReal = Math.min(0.05, deltaMs / 1000);
      // Guard: 10 consecutive frames > 24ms → half particles, no trails.
      if (deltaMs > 24 && (parts.length || meteors.length)) { slowFrames += 1; if (slowFrames >= 10) low = true; } else slowFrames = 0;
      const dt = dtReal * slow;
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, W, H);
      if (!parts.length && !meteors.length && flashA <= 0) return;
      ctx.globalCompositeOperation = "lighter";
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const p = parts[i]; p.age += dt;
        if (p.age < 0) continue;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        const f = p.age / p.life;
        if (p.kind === "ring") {
          const e = 1 - (1 - f) ** 3, r = p.r0 + (p.r1 - p.r0) * e;
          ctx.strokeStyle = `rgba(${p.rgb},${(1 - f) * 0.95})`; ctx.lineWidth = Math.max(0.5, p.w * (1 - f * 0.8));
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
          continue;
        }
        const drag = Math.exp(-p.drag * dt);
        p.vx *= drag; p.vy = p.vy * drag + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const a = 1 - f;
        if (p.kind === "spark") {
          ctx.strokeStyle = `rgba(${p.rgb},${a})`; ctx.lineWidth = p.size * (0.4 + a * 0.6); ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
        } else if (p.kind === "star") {
          p.rot += p.vr * dt; drawStar(p.x, p.y, p.size * (0.5 + a * 0.5), p.rot, `rgba(${p.rgb},${a})`);
        } else {
          ctx.fillStyle = `rgba(${p.rgb},${a * 0.9})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2); ctx.fill();
        }
      }
      for (let j = meteors.length - 1; j >= 0; j -= 1) {
        const m = meteors[j];
        if (!m.alive) { meteors.splice(j, 1); continue; }
        const u = 1 - m.t;
        m.x = u * u * m.from.x + 2 * u * m.t * m.ctrl.x + m.t * m.t * m.to.x;
        m.y = u * u * m.from.y + 2 * u * m.t * m.ctrl.y + m.t * m.t * m.to.y;
        m.trail.push({ x: m.x, y: m.y });
        const maxTrail = low ? 0 : (m.big ? 34 : 22);
        while (m.trail.length > maxTrail) m.trail.shift();
        drawMeteor(m, dtReal);
        if (!low && Math.random() < (m.big ? 0.9 : 0.55)) fx.dust(m.x, m.y, m.type.color, 1, 6);
      }
      if (flashA > 0) {
        ctx.fillStyle = `rgba(255,236,150,${flashA * 0.5})`; ctx.fillRect(0, 0, W, H);
        flashA = Math.max(0, flashA - dtReal * 1.4);
      }
      ctx.globalCompositeOperation = "source-over";
    },
  };
  function drawStar(x, y, r, rot, fill) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = fill; ctx.beginPath();
    for (let i = 0; i < 8; i += 1) { const rr = i % 2 ? r * 0.36 : r, a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawMeteor(m, dt) {
    const tr = m.trail, n = tr.length, headR = m.big ? 30 : 20;
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 1; i < n; i += 1) {
        const f = i / n;
        ctx.strokeStyle = pass === 0 ? `rgba(${m.rgb},${f * 0.55})` : `rgba(255,255,255,${f * f * 0.85})`;
        ctx.lineWidth = (pass === 0 ? headR * 1.5 : headR * 0.45) * f + 1; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
      }
    }
    const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, headR * 2.6);
    g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.25, `rgba(${m.rgb},0.8)`); g.addColorStop(1, `rgba(${m.rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, headR * 2.6, 0, Math.PI * 2); ctx.fill();
    if (m.big) {
      m.spin += dt * 6;
      for (let s = 0; s < 5; s += 1) { const a = m.spin + s * Math.PI * 2 / 5; drawStar(m.x + Math.cos(a) * 52, m.y + Math.sin(a) * 52, 9, a, "rgba(255,240,170,.95)"); }
    }
    ctx.globalCompositeOperation = "source-over";
    const size = m.big ? 76 : 56;
    ctx.drawImage(fx.sprite(m.type), m.x - size / 2, m.y - size / 2, size, size);
    ctx.globalCompositeOperation = "lighter";
  }
  return fx;
}

// WebAudio synth cues; silent when the board's sound switch is off or audio fails.
function createAudio(enabled) {
  let ctx = null, master = null, noiseBuf = null, output = null;
  const ensure = () => {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); output = createSoundOutput(ctx, INTRO_SOUND_GAIN); master = output.input;
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
    return ctx;
  };
  const ok = () => { try { if (!enabled()) return false; } catch { return false; } const c = ensure(); if (c?.state === "suspended") void c.resume().catch(() => {}); return Boolean(c); };
  const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  const tone = (type, f0, f1, dur, vol, delay = 0) => {
    if (!ok()) return; const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.008, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  };
  const noise = (dur, f0, f1, q, vol, delay = 0) => {
    if (!ok()) return; const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = q || 1.2;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  };
  return {
    wind: () => noise(0.9, 300, 1400, 0.7, 0.35),
    chestOpen: () => { tone("sawtooth", 180, 120, 0.25, 0.05); tone("sine", 1320, 0, 0.6, 0.25, 0.18); tone("sine", 1980, 0, 0.5, 0.12, 0.2); },
    tick: (i) => tone("triangle", 520 * 1.122 ** i, 0, 0.09, 0.22),
    rare: () => { [880, 1108, 1318, 1760, 2217].forEach((f, i) => tone(i % 2 ? "square" : "sine", f, 0, 1.1, i % 2 ? 0.03 : 0.12, i * 0.01)); noise(0.5, 6000, 3000, 0.8, 0.12); },
    whoosh: () => noise(0.35, 900, 3800, 1.5, 0.12),
    land: (category) => { const f = category === "points" ? 1175 : 660; tone("sine", f, 0, 0.35, 0.16); tone("sine", f * 2, 0, 0.18, 0.05); },
    thump: () => { tone("sine", 160, 45, 0.5, 0.5); noise(0.3, 400, 120, 0.8, 0.25); tone("sine", 1568, 0, 0.9, 0.1, 0.03); },
    chord: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone("triangle", f, 0, 1.4, 0.12, i * 0.03)),
    close: () => { try { output?.disconnect(); void ctx?.close(); } catch { /* ignore */ } },
  };
}

const CHEST_SVG = `<div class="sc-chest-glow"></div>
<svg class="sc-chest-base" viewBox="0 0 340 200" width="340" height="200" aria-hidden="true">
  <defs><linearGradient id="sc-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E7A46C"/><stop offset="1" stop-color="#B9733F"/></linearGradient>
  <linearGradient id="sc-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0A8"/><stop offset=".5" stop-color="#FFC93C"/><stop offset="1" stop-color="#E59A12"/></linearGradient></defs>
  <path d="M22 18 H318 Q328 18 326 30 L312 172 Q310 188 294 188 H46 Q30 188 28 172 L14 30 Q12 18 22 18Z" fill="url(#sc-wood)" stroke="#8C5530" stroke-width="5"/>
  <g stroke="#F6C597" stroke-width="5" fill="none" opacity=".75" stroke-linecap="round"><path d="M70 30 Q60 110 72 176"/><path d="M120 30 Q114 110 120 178"/><path d="M220 30 Q226 110 220 178"/><path d="M270 30 Q280 110 268 176"/></g>
  <rect x="10" y="14" width="320" height="26" rx="12" fill="url(#sc-gold)" stroke="#C47F10" stroke-width="4"/>
  <rect x="24" y="160" width="292" height="18" rx="9" fill="url(#sc-gold)" stroke="#C47F10" stroke-width="3" opacity=".9"/>
  <g transform="translate(170 98)"><circle r="40" fill="url(#sc-gold)" stroke="#C47F10" stroke-width="5"/><path d="M0 -24 L7 -8 L24 -7 L11 4 L15 21 L0 12 L-15 21 L-11 4 L-24 -7 L-7 -8Z" fill="#fff" opacity=".95"/></g>
</svg>
<svg class="sc-chest-lid" viewBox="0 0 360 130" width="360" height="130" aria-hidden="true">
  <path d="M20 118 Q20 14 180 10 Q340 14 340 118 Z" fill="url(#sc-wood)" stroke="#8C5530" stroke-width="5"/>
  <g stroke="#F6C597" stroke-width="5" fill="none" opacity=".8" stroke-linecap="round"><path d="M180 14 L180 116"/><path d="M180 16 Q110 40 80 114"/><path d="M180 16 Q250 40 280 114"/><path d="M180 16 Q70 40 40 112"/><path d="M180 16 Q290 40 320 112"/></g>
  <rect x="12" y="104" width="336" height="24" rx="11" fill="url(#sc-gold)" stroke="#C47F10" stroke-width="4"/>
  <circle cx="180" cy="20" r="14" fill="url(#sc-gold)" stroke="#C47F10" stroke-width="4"/>
</svg>
<div class="sc-chest-clouds"><i></i><i></i><i></i><i></i><i></i><i></i></div>`;

export class SpecialCellsIntroSequencer {
  /**
   * @param {object} o
   * @param {Array} o.cells server snapshot cells (already in route order)
   * @param {(cell) => ({x:number,y:number}|null)} o.getPoint client coordinates of a cell on the board, null if not on this map
   * @param {(cellId:string, animate:boolean) => void} o.revealCell board marker hand-off
   * @param {() => (DOMRect|null)} o.legendRect where the lineup collapses to
   * @param {(progress:number) => void} o.onZoom 0 = classroom camera, 1 = whole-map overview
   * @param {(dx:number, dy:number) => void} o.onShake
   * @param {() => boolean} o.soundEnabled
   */
  constructor(o) {
    this.o = o;
    this.cells = o.cells;
    this.groups = groupSpecialCells(this.cells);
    this.tweens = [];
    this.playing = false;
    this.gsap = window.gsap;
    if (!this.gsap) throw new Error("GSAP is unavailable");
    this.audio = createAudio(o.soundEnabled || (() => false));
    this.build();
  }

  build() {
    const root = document.createElement("div");
    root.className = "sc-intro"; root.setAttribute("aria-hidden", "true"); root.dataset.phase = "idle";
    root.innerHTML = `<div class="sc-dim"></div><div class="sc-vignette"></div>
      <div class="sc-stage"><div class="sc-rays"></div><div class="sc-beam"></div><div class="sc-chest">${CHEST_SVG}</div>
      <div class="sc-title sc-bigtext"><span class="s">本节课宝藏</span><span class="f">本节课宝藏</span></div>
      <div class="sc-card-row"></div><div class="sc-stamps"></div>
      <div class="sc-far-chip"><span class="emo">☁️</span> 远方世界 <b>×0</b></div>
      <canvas class="sc-canvas" width="${W}" height="${H}"></canvas><div class="sc-flash"></div>
      <div class="sc-ready sc-bigtext"><span class="s">准备开始！</span><span class="f">准备开始！</span></div></div>
      <button type="button" class="sc-skip">跳过 ⏭</button>`;
    document.body.append(root);
    const q = (s) => root.querySelector(s);
    this.e = { root, stage: q(".sc-stage"), dim: q(".sc-dim"), vignette: q(".sc-vignette"), rays: q(".sc-rays"), beam: q(".sc-beam"),
      chest: q(".sc-chest"), lid: q(".sc-chest-lid"), glow: q(".sc-chest-glow"), title: q(".sc-title"), cardRow: q(".sc-card-row"),
      stamps: q(".sc-stamps"), ready: q(".sc-ready"), flash: q(".sc-flash"), canvas: q(".sc-canvas"), skip: q(".sc-skip"), far: q(".sc-far-chip") };
    this.fx = createFx(this.e.canvas);
    this.tick = (time, delta) => this.fx.tick(time, delta);
    this.gsap.ticker.add(this.tick);
    this.fit = () => {
      this.scale = Math.min(window.innerWidth / W, window.innerHeight / H);
      this.offset = { x: (window.innerWidth - W * this.scale) / 2, y: (window.innerHeight - H * this.scale) / 2 };
      this.e.stage.style.transform = `translate(${this.offset.x}px, ${this.offset.y}px) scale(${this.scale})`;
      this.fx.resize(this.scale);
    };
    this.fit(); window.addEventListener("resize", this.fit);
    this.onPointer = (event) => { if (this.playing) { event.preventDefault(); this.skip(); } };
    this.onKey = (event) => { if (this.playing && (event.code === "Space" || event.key === "Escape")) { event.preventDefault(); this.skip(); } };
    root.addEventListener("pointerdown", this.onPointer);
    window.addEventListener("keydown", this.onKey, true);

    const G = this.groups.length;
    this.cards = this.groups.map((group, i) => {
      const t = group.type, el = document.createElement("div");
      const left = W / 2 + (i - (G - 1) / 2) * CARD_STEP;
      el.className = `sc-card${t.rarity === 2 ? " rare" : ""}`;
      el.dataset.type = t.id;
      el.style.left = `${left}px`; el.style.top = `${ROW_Y}px`;
      el.style.setProperty("--c", t.color); el.style.setProperty("--g", t.glow);
      el.innerHTML = `<div class="sc-card-inner"><div class="face back"><div class="q">?</div></div>
        <div class="face front"><div class="top"></div><div class="sc-card-icon emo">${specialCellIconHtml(t.icon)}</div>
        <div class="sc-card-name${t.name.length > 4 ? " long" : ""}">${t.name}</div><div class="sc-card-effect">${t.effect}</div><div class="shine"></div></div></div>
        <div class="sc-badge${t.rarity === 2 ? " gold" : ""}">×${group.cells.length}</div><div class="flashL"></div>`;
      this.e.cardRow.append(el);
      return { el, inner: el.querySelector(".sc-card-inner"), badge: el.querySelector(".sc-badge"), flashL: el.querySelector(".flashL"),
        shine: el.querySelector(".shine"), group, left, remaining: group.cells.length };
    });
    const rare = this.cards.filter((c) => c.group.type.rarity === 2);
    this.stamp = null;
    if (rare.length) {
      const st = document.createElement("div"); st.className = "sc-stamp";
      st.style.left = `${rare.reduce((s, c) => s + c.left, 0) / rare.length}px`; st.style.top = `${ROW_Y - 234}px`;
      st.innerHTML = '<span class="spk">✦</span>稀有！<span class="spk">✦</span>';
      this.e.stamps.append(st); this.stamp = st;
    }
    this.farTotal = 0;
    this.seq = this.cards.flatMap((card) => card.group.cells.map((cell) => ({ cell, card, type: card.group.type })));
    this.cells.forEach((cell) => SPECIAL_CELL_TYPE_BY_ID[cell.type] && this.fx.sprite(SPECIAL_CELL_TYPE_BY_ID[cell.type]));
  }

  toStage(point) { return { x: (point.x - this.offset.x) / this.scale, y: (point.y - this.offset.y) / this.scale }; }
  farPoint() {
    const r = this.e.far.getBoundingClientRect();
    return this.toStage({ x: r.left + r.width * 0.2, y: r.top + r.height / 2 });
  }
  cellPoint(cell) {
    const p = this.o.getPoint(cell);
    return p ? this.toStage(p) : null;
  }
  cardCenter(card) {
    const r = card.el.getBoundingClientRect();
    return this.toStage({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  track(tween) { this.tweens.push(tween); return tween; }
  phase(name) { this.e.root.dataset.phase = name; this.o.onPhase?.(name); }

  reset() {
    const g = this.gsap, e = this.e;
    g.killTweensOf([e.dim, e.vignette, e.rays, e.beam, e.chest, e.lid, e.glow, e.title, e.cardRow, e.stamps, e.ready, e.flash, e.far]);
    g.set([e.dim, e.vignette, e.rays, e.beam, e.chest, e.glow, e.title, e.ready, e.flash, e.far], { opacity: 0 });
    g.set(e.lid, { y: 0, rotation: 0, scaleY: 1 });
    g.set(e.cardRow, { x: 0, y: 0, scale: 1, opacity: 1, rotationX: 0, transformPerspective: 1400, transformOrigin: `${W / 2}px ${ROW_Y}px` });
    g.set(e.stamps, { opacity: 1 });
    this.cards.forEach((c) => {
      g.set(c.el, { opacity: 0, x: 0, y: 0, scale: 1, rotation: 0 }); c.el.classList.remove("spent");
      g.set(c.inner, { rotationY: 0 }); g.set(c.badge, { opacity: 0, scale: 0 }); g.set(c.flashL, { opacity: 0 });
      c.remaining = c.group.cells.length; c.badge.textContent = `×${c.remaining}`;
    });
    if (this.stamp) g.set(this.stamp, { opacity: 0 });
    this.farTotal = 0; e.far.querySelector("b").textContent = "×0";
  }

  zoom(tl, from, to, duration, at) {
    const proxy = { p: from };
    tl.to(proxy, { p: to, duration, ease: "power2.inOut", onUpdate: () => this.o.onZoom?.(proxy.p) }, at);
  }

  reveal(item, animate) {
    if (item.far) {
      this.farTotal += 1; this.e.far.querySelector("b").textContent = `×${this.farTotal}`;
      if (animate) this.track(this.gsap.fromTo(this.e.far, { scale: 1.25 }, { scale: 1, duration: 0.3, ease: "back.out(3)" }));
    }
    this.o.revealCell?.(item.cell.cellId, animate);
  }

  launch(item, { dur, big, mode }) {
    const card = item.card, from = this.cardCenter(card);
    const onMap = this.cellPoint(item.cell);
    item.far = !onMap;
    const to = onMap || this.farPoint();
    card.remaining -= 1; card.badge.textContent = `×${Math.max(0, card.remaining)}`;
    this.track(this.gsap.fromTo(card.el, { scale: 1.12 }, { scale: 1, duration: 0.25, ease: "power2.out" }));
    this.track(this.gsap.fromTo(card.badge, { scale: 1.35 }, { scale: 1, duration: 0.25 }));
    if (card.remaining <= 0) this.track(this.gsap.to(card.el, { opacity: 0.4, duration: 0.3, delay: 0.1, onStart: () => card.el.classList.add("spent") }));
    this.fx.sparks(from.x, from.y, item.type.color, 6, 200, { g: 0, lift: 0 });
    const m = this.fx.meteor(from, to, item.type, { big });
    this.audio.whoosh();
    this.track(this.gsap.to(m, { t: 1, duration: dur, ease: big ? "sine.inOut" : "power1.in",
      onComplete: () => { m.alive = false; this.land(item, to, { big, mode }); } }));
  }

  land(item, at, { big, mode }) {
    this.fx.impact(at.x, at.y, item.type, big);
    this.reveal(item, true);
    if (big && mode === "full") {
      this.fx.setSlow(1); this.audio.thump();
      const shake = { i: 0 };
      // 4px / 150ms camera shake on the board and overlay.
      this.track(this.gsap.to(shake, { i: 4, duration: 0.15, ease: "none", onUpdate: () => {
        const step = Math.floor(shake.i), offsets = [[4, -3], [-4, 3], [3, 2], [0, 0], [0, 0]][step];
        this.o.onShake?.(offsets[0], offsets[1]);
        this.e.stage.style.translate = `${offsets[0]}px ${offsets[1]}px`;
      }, onComplete: () => { this.o.onShake?.(0, 0); this.e.stage.style.translate = ""; } }));
      this.e.flash.style.setProperty("--fx", `${at.x / 19.2}%`); this.e.flash.style.setProperty("--fy", `${at.y / 10.8}%`);
      this.track(this.gsap.fromTo(this.e.flash, { opacity: 0.9 }, { opacity: 0, duration: 0.55, ease: "power2.out" }));
    } else this.audio.land(item.type.category);
  }

  rareFlash(tl, at, rareCards, mode) {
    tl.call(() => {
      this.audio.rare();
      rareCards.forEach((c) => { const p = this.cardCenter(c); this.fx.stars(p.x, p.y, "#FFE45C", 12, 300, { lifeMul: 1.2 }); this.fx.ring(p.x, p.y, "#FFE45C", 170, 0.7, 10); });
    }, null, at);
    rareCards.forEach((c) => {
      tl.fromTo(c.flashL, { opacity: 1 }, { opacity: 0, duration: 0.55, ease: "power2.out", immediateRender: false }, at);
      tl.fromTo(c.shine, { x: 0 }, { x: 360, duration: 0.55, ease: "power2.inOut", immediateRender: false }, at + 0.05);
      tl.fromTo(c.el, { scale: 1.18 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, .5)", immediateRender: false }, at);
    });
    if (mode === "full") {
      tl.to(this.e.cardRow, { rotationX: 12, duration: 0.18, ease: "power2.out" }, at);
      tl.to(this.e.cardRow, { rotationX: 0, duration: 0.4, ease: "back.out(2)" }, at + 0.2);
    }
    if (this.stamp) tl.fromTo(this.stamp, { opacity: 0, scale: 2.2, rotation: -14 }, { opacity: 1, scale: mode === "short" ? 0.8 : 1, rotation: -5, duration: 0.32, ease: "back.out(2.5)" }, at + 0.04);
  }

  play({ mode = "full", oldPoints = [] } = {}) {
    this.mode = mode; this.playing = true; this.killAll();
    this.e.root.classList.add("is-active"); this.e.root.dataset.mode = mode;
    this.startedAt = performance.now();
    return new Promise((resolve) => {
      this.resolve = resolve;
      if (mode === "reduced") this.buildReduced();
      else if (mode === "short") this.buildShort(oldPoints);
      else this.buildFull();
    });
  }

  finish() {
    if (!this.playing) return;
    this.playing = false;
    this.elapsed = (performance.now() - this.startedAt) / 1000;
    this.phase("done");
    const done = this.resolve; this.resolve = null;
    this.track(this.gsap.to(this.e.root, { opacity: 0, duration: 0.25, delay: 0.35, onComplete: () => this.e.root.classList.remove("is-active") }));
    done?.({ elapsed: this.elapsed, skipped: Boolean(this.skipped) });
  }

  buildFull() {
    const g = this.gsap, e = this.e, cards = this.cards, G = cards.length, N = this.seq.length;
    this.reset(); g.set(e.root, { opacity: 1 });
    const tl = this.tl = g.timeline();
    const ph = (name, at) => tl.call(() => this.phase(name), null, at);
    // Beat 0 · 转场 0–0.8：镜头拉远成全图俯瞰，地图压暗约 55%
    ph("beat0", 0);
    tl.call(() => this.audio.wind(), null, 0);
    this.zoom(tl, 0, 1, 0.8, 0);
    tl.to(e.dim, { opacity: 0.45, duration: 0.6, ease: "sine.out" }, 0.2);
    tl.to(e.vignette, { opacity: 1, duration: 0.6 }, 0.2);
    tl.to(e.far, { opacity: 1, duration: 0.3 }, 0.5);
    // Beat 1 · 宝藏亮相 0.8–3.8
    const B1 = 0.8; ph("beat1", B1);
    tl.fromTo(e.title, { opacity: 0, y: -70, scale: 0.55 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(2.2)" }, B1);
    tl.fromTo(e.chest, { opacity: 0, y: 300, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, B1);
    tl.to(e.chest, { rotation: 3, duration: 0.04, yoyo: true, repeat: 3, ease: "sine.inOut" }, B1 + 0.3);
    tl.call(() => {
      this.audio.chestOpen();
      this.fx.stars(W / 2, 720, "#FFF3B0", 22, 520, { lift: 260, drag: 2.2, lifeMul: 1.2 });
      this.fx.sparks(W / 2, 720, "#FFE680", 16, 560, { lift: 300, g: 200 });
      this.fx.ring(W / 2, 725, "#FFF6C8", 220, 0.6, 10);
    }, null, B1 + 0.48);
    tl.to(e.lid, { y: -46, rotation: -5, scaleY: 0.5, duration: 0.3, ease: "back.out(2.4)" }, B1 + 0.45);
    tl.to(e.glow, { opacity: 1, duration: 0.2 }, B1 + 0.48);
    tl.fromTo(e.beam, { opacity: 0, scaleY: 0.15 }, { opacity: 1, scaleY: 1, duration: 0.4, ease: "power2.out" }, B1 + 0.5);
    tl.fromTo(e.rays, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" }, B1 + 0.55);
    tl.fromTo(e.rays, { rotation: 0 }, { rotation: 36, duration: 3.6, ease: "none" }, B1 + 0.55);
    const FLY = B1 + 0.6;
    cards.forEach((c, i) => {
      tl.fromTo(c.el, { opacity: 0, x: W / 2 - c.left, y: 220, scale: 0.15, rotation: (i % 2 ? 1 : -1) * 30 },
        { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, duration: 0.38, ease: "back.out(1.5)" }, FLY + i * 0.03);
    });
    // 翻卡：普通 → 少见 → 稀有（稀有同时翻 + 0.6s 金闪）
    const timing = specialCellsIntroTiming(this.cells);
    const flip = timing.flip;
    let t = FLY + 0.38, tickIndex = 0;
    const flipCard = (c, at) => {
      tl.to(c.inner, { rotationY: 180, duration: Math.max(0.16, flip * 0.95), ease: "power2.out" }, at);
      tl.to(c.el, { y: -14, duration: flip * 0.45, yoyo: true, repeat: 1, ease: "sine.out" }, at);
      tl.to(c.badge, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }, at + flip * 0.55);
      const index = tickIndex++; tl.call(() => this.audio.tick(index), null, at);
    };
    const normal = cards.filter((c) => c.group.type.rarity < 2), rare = cards.filter((c) => c.group.type.rarity === 2);
    normal.forEach((c) => { flipCard(c, t); t += flip; });
    if (rare.length) { rare.forEach((c) => flipCard(c, t)); this.rareFlash(tl, t + flip * 0.7, rare, "full"); t += flip + 0.6; }
    const B2 = Math.max(3.8, t + 0.15);
    // Beat 2 · 流星撒格
    ph("beat2", B2);
    tl.to(e.title, { opacity: 0, y: -60, duration: 0.35, ease: "power2.in" }, B2);
    if (this.stamp) tl.to(this.stamp, { opacity: 0, scale: 0.6, duration: 0.25 }, B2);
    tl.to(e.cardRow, { y: ROW_Y_UP - ROW_Y, scale: 0.6, duration: 0.42, ease: "power3.inOut" }, B2);
    tl.to([e.beam, e.rays, e.glow], { opacity: 0, duration: 0.35 }, B2);
    tl.to(e.lid, { y: 0, rotation: 0, scaleY: 1, duration: 0.2, ease: "power2.in" }, B2);
    tl.to(e.chest, { y: 220, scale: 0.55, opacity: 0, duration: 0.42, ease: "back.in(1.4)" }, B2 + 0.15);
    const normals = this.seq.filter((s) => s.type.rarity < 2), rares = this.seq.filter((s) => s.type.rarity === 2);
    const stagger = timing.stagger, t0 = B2 + 0.28;
    normals.forEach((item, i) => tl.call(() => this.launch(item, { dur: 0.7, big: false, mode: "full" }), null, t0 + i * stagger));
    let end2 = normals.length ? t0 + (normals.length - 1) * stagger + 0.7 : t0;
    if (rares.length) {
      const rt = end2 + 0.2; ph("rare", rt);
      tl.call(() => { this.fx.setSlow(0.45); rares.forEach((item) => this.launch(item, { dur: 1.0, big: true, mode: "full" })); }, null, rt);
      tl.to(e.dim, { opacity: 0.55, duration: 0.3 }, rt);
      end2 = rt + 1.0;
    }
    this.buildSettle(tl, end2 + 0.12, "full");
  }

  buildSettle(tl, B3, mode) {
    const g = this.gsap, e = this.e, short = mode === "short";
    tl.call(() => this.phase("beat3"), null, B3);
    tl.to(e.dim, { opacity: 0, duration: short ? 0.3 : 0.55, ease: "sine.inOut" }, B3);
    tl.to([e.vignette, e.far], { opacity: 0, duration: short ? 0.3 : 0.55 }, B3);
    this.zoom(tl, 1, 0, short ? 0.35 : 0.6, B3 + (short ? 0.05 : 0.45));
    tl.call(() => {
      const rect = this.o.legendRect?.();
      const target = rect ? this.toStage({ x: rect.left + rect.width / 2, y: rect.top + 40 }) : { x: W - 180, y: 80 };
      this.track(g.to(e.cardRow, { x: target.x - W / 2, y: target.y - ROW_Y, scale: 0.14, opacity: 0, duration: short ? 0.3 : 0.5, ease: "power2.in" }));
      this.o.onLegend?.();
    }, null, B3);
    tl.call(() => this.audio.chord(), null, B3 + 0.1);
    if (short) {
      tl.fromTo(e.ready, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 0.8, duration: 0.2, ease: "back.out(2)" }, B3 + 0.05);
      tl.to(e.ready, { opacity: 0, scale: 0.5, y: -30, duration: 0.25 }, B3 + 0.15);
      tl.call(() => this.finish(), null, B3 + 0.4);
    } else {
      tl.fromTo(e.ready, { opacity: 0, scale: 0.3, y: 0 }, { opacity: 1, scale: 1, duration: 0.38, ease: "back.out(2.2)" }, B3 + 0.1);
      tl.call(() => { this.fx.stars(W / 2, 520, "#FFB3D1", 18, 520, { lifeMul: 1.1 }); this.fx.stars(W / 2, 520, "#FFF3B0", 14, 460); }, null, B3 + 0.2);
      tl.to(e.ready, { opacity: 0, scale: 0.55, y: -40, duration: 0.3, ease: "power2.in" }, B3 + 1.28);
      tl.call(() => this.finish(), null, B3 + 1.1);
    }
  }

  // 重新掉落 3 秒短版：旧图标 0.3s 碎成星屑 → 阵容 0.8s 一次弹出 → 撒格 1.5s → 收束 0.4s
  buildShort(oldPoints) {
    const g = this.gsap, e = this.e, cards = this.cards, N = this.seq.length;
    this.reset(); g.set(e.root, { opacity: 1 });
    const tl = this.tl = g.timeline();
    tl.call(() => this.phase("short"), null, 0);
    this.zoom(tl, 0, 1, 0.3, 0);
    tl.call(() => (oldPoints || []).forEach((o) => {
      const p = o.point && this.toStage(o.point);
      if (p) { this.fx.stars(p.x, p.y, o.color, 5, 220, { lift: 80, lifeMul: 0.8 }); this.fx.dust(p.x, p.y, o.color, 6, 20); }
    }), null, 0.3);
    tl.to(e.dim, { opacity: 0.32, duration: 0.3 }, 0);
    tl.to([e.vignette, e.far], { opacity: 0.7, duration: 0.3 }, 0);
    tl.set(e.cardRow, { y: ROW_Y_UP - ROW_Y, scale: 0.6 }, 0);
    cards.forEach((c, i) => {
      tl.set(c.inner, { rotationY: 180 }, 0);
      tl.fromTo(c.el, { opacity: 0, scale: 0.2, y: 60 }, { opacity: 1, scale: 1, y: 0, duration: 0.38, ease: "back.out(2)" }, 0.3 + i * 0.035);
      tl.to(c.badge, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(3)" }, 0.5 + i * 0.035);
    });
    tl.call(() => this.audio.tick(2), null, 0.3);
    const rare = cards.filter((c) => c.group.type.rarity === 2);
    if (rare.length) {
      this.rareFlash(tl, 0.72, rare, "short");
      if (this.stamp) { tl.set(this.stamp, { top: 8, scale: 0.8 }, 0); tl.to(this.stamp, { opacity: 0, duration: 0.2 }, 1.05); }
    }
    const fly = 0.6, stagger = N > 1 ? Math.min(0.2, (1.5 - fly) / (N - 1)) : 0;
    this.seq.forEach((item, i) => tl.call(() => this.launch(item, { dur: fly, big: item.type.rarity === 2, mode: "short" }), null, 1.1 + i * stagger));
    this.buildSettle(tl, 2.62, "short");
  }

  // 低动态：无镜头/流星/粒子/震动；阵容淡入 → 图标同时淡入 → 准备开始，≤ 1.5s
  buildReduced() {
    const g = this.gsap, e = this.e, cards = this.cards;
    this.reset(); g.set(e.root, { opacity: 1 });
    const tl = this.tl = g.timeline();
    tl.call(() => this.phase("reduced"), null, 0);
    tl.to(e.dim, { opacity: 0.35, duration: 0.3 }, 0);
    tl.fromTo(e.title, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0);
    cards.forEach((c) => { tl.set(c.inner, { rotationY: 180 }, 0); tl.set(c.badge, { opacity: 1, scale: 1 }, 0); tl.fromTo(c.el, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0); });
    if (this.stamp) tl.fromTo(this.stamp, { opacity: 0, rotation: -6 }, { opacity: 1, duration: 0.4 }, 0);
    tl.to([e.title, e.cardRow, e.stamps, e.dim], { opacity: 0, duration: 0.3 }, 1.0);
    tl.call(() => { this.seq.forEach((item) => this.o.revealCell?.(item.cell.cellId, false)); this.o.onLegend?.(); }, null, 1.0);
    tl.fromTo(e.ready, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 1.05);
    tl.call(() => this.finish(), null, 1.45);
  }

  killAll() {
    if (this.tl) { this.tl.kill(); this.tl = null; }
    this.tweens.forEach((t) => t.kill()); this.tweens = [];
    this.fx.clear(); this.e.stage.style.translate = ""; this.o.onShake?.(0, 0);
  }

  /** 跳过：1 帧内显示最终布局。 */
  skip() {
    if (!this.playing) return false;
    this.skipped = true;
    this.killAll(); this.reset();
    this.gsap.set(this.e.cardRow, { opacity: 0 });
    this.seq.forEach((item) => this.o.revealCell?.(item.cell.cellId, false));
    this.o.onZoom?.(0); this.o.onLegend?.();
    this.gsap.set(this.e.ready, { opacity: 1, scale: 1, y: 0 });
    this.phase("skipped");
    this.finish();
    return true;
  }

  destroy() {
    this.killAll();
    this.gsap.ticker.remove(this.tick);
    window.removeEventListener("resize", this.fit);
    window.removeEventListener("keydown", this.onKey, true);
    this.audio.close();
    this.e.root.remove();
  }
}
