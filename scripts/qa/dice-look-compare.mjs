// Dice look regression check against a reference build (default: an 8cb82a5 lab).
//   node scripts/qa/dice-look-compare.mjs <refPort> <testPort> [outDir]
// Both ports are isolated landing-points labs (scripts/qa/landing-points-lab.mjs).
// The die's WAAPI throw is paused at fixed fractions, so frames are deterministic
// only with the same server face: start both labs with MONOPOLY_LAB_FACE_INDEX=2
// (labs roll randomly by default). Pixel diff per frame must stay under 1 %.
// playwright-core is borrowed: PLAYWRIGHT_FROM=<dir with package.json> (default:
// ~/Documents/排课/voice-word-attack). Set GPU=1 to render with the real GPU.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const [refPort, testPort, outDir = join(homedir(), "kiwi_tmp", "dice-look")] = process.argv.slice(2);
if (!refPort || !testPort) { console.error("usage: dice-look-compare.mjs <refPort> <testPort> [outDir]"); process.exit(2); }
const require = createRequire(join(process.env.PLAYWRIGHT_FROM || join(homedir(), "Documents/排课/voice-word-attack"), "package.json"));
const { chromium } = require("playwright-core");
const FRACTIONS = [0.05, 0.2, 0.4, 0.6, 0.8, 0.97];
const launch = () => chromium.launch({ headless: true, ...(process.env.GPU ? { channel: "chromium", args: ["--enable-gpu", "--use-angle=metal"] } : {}) });

async function capture(browser, port, label) {
  const dir = join(outDir, label); mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/login/?next=%2Fgames%2Fmonopoly%2F`);
  await page.fill("#login-username", "isolated-landing-teacher");
  await page.fill("#login-password", "isolated-landing-password-2026");
  await page.keyboard.press("Enter");
  await page.waitForURL(/games\/monopoly/, { timeout: 20000 });
  await page.waitForSelector("#student-profile-list button");
  for (let i = 0; i < 3; i++) await page.locator("#student-profile-list button").nth(i).click();
  for (let i = 0; i < 3; i++) { await page.locator("#character-options .character-option:not([disabled])").first().click(); await page.waitForTimeout(150); }
  await page.locator("#start-session").click();
  await page.waitForTimeout(2500);
  if (await page.locator(".sc-intro.is-active").count()) await page.locator(".sc-intro .sc-skip").click().catch(() => {});
  await page.waitForSelector("#teacher-player-options button:not([disabled])", { timeout: 30000 });
  await page.locator("#teacher-player-options button:not([disabled])").first().click();
  await page.locator("#teacher-grant").click();
  await page.waitForTimeout(300);
  if (await page.locator("#teacher-roll:not([hidden]):not([disabled])").count()) await page.locator("#teacher-roll").click();
  await page.waitForSelector("#dice-roll-stage .physical-die-cube.is-rolling", { timeout: 15000 });
  await page.waitForTimeout(700);
  const box = await page.evaluate(() => {
    const cube = document.querySelector("#dice-roll-stage .physical-die-cube.is-rolling");
    const animation = cube.getAnimations().find((item) => item.effect?.getTiming?.().duration > 500);
    animation.pause(); window.__qaDiceThrow = animation;
    const r = cube.closest(".physical-die-viewport").getBoundingClientRect();
    return { x: r.x - 60, y: r.y - 60, width: r.width + 120, height: r.height + 120 };
  });
  const files = [];
  for (const f of FRACTIONS) {
    await page.evaluate((f) => { const a = window.__qaDiceThrow; a.currentTime = a.effect.getTiming().duration * f; }, f);
    await page.waitForTimeout(120);
    const file = join(dir, `roll-${String(Math.round(f * 100)).padStart(2, "0")}.png`);
    await page.screenshot({ path: file, clip: box }); files.push(file);
  }
  await page.evaluate(() => window.__qaDiceThrow.play());
  await page.waitForFunction(() => document.querySelector(".dice-roll-card")?.dataset.phase === "settle", null, { timeout: 15000 });
  await page.waitForTimeout(250);
  const result = join(dir, "result.png"); await page.screenshot({ path: result, clip: box }); files.push(result);
  await context.close();
  return files;
}

async function diff(browser, a, b) {
  const page = await browser.newPage();
  const url = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  const ratio = await page.evaluate(async ([ua, ub]) => {
    const load = (src) => new Promise((ok) => { const img = new Image(); img.onload = () => ok(img); img.src = src; });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
    if (ia.width !== ib.width || ia.height !== ib.height) return 1;
    const da = px(ia), db = px(ib); let bad = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) bad++;
    }
    return bad / (da.length / 4);
  }, [url(a), url(b)]);
  await page.close();
  return ratio;
}

const browser = await launch();
const ref = await capture(browser, refPort, "reference");
const got = await capture(browser, testPort, "test");
let failed = false;
for (let i = 0; i < ref.length; i++) {
  const ratio = await diff(browser, ref[i], got[i]);
  const ok = ratio < 0.01; failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${ref[i].split("/").pop().padEnd(12)} ${(ratio * 100).toFixed(2)} % pixels differ`);
}
await browser.close();
process.exit(failed ? 1 : 0);
