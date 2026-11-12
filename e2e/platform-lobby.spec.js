import { expect, test } from "playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OWNER_USERNAME = "lobby-owner";
const OWNER_PASSWORD = "lobby-owner-password-123";

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function startLobbyFixture() {
  const dataDir = await mkdtemp(resolve(tmpdir(), "voice-word-lobby-e2e-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      DATA_DIR: dataDir,
      AUTH_OWNER_USERNAME: OWNER_USERNAME,
      AUTH_BOOTSTRAP_OWNER_PASSWORD: OWNER_PASSWORD,
      PRONUNCIATION_PROVIDER: "mock",
      ALLOW_QA_CONTROLS: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`lobby fixture exited before ready\n${output}`);
    }
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) {
        return {
          origin,
          async close() {
            child.kill("SIGTERM");
            await Promise.race([
              new Promise((resolveExit) => child.once("exit", resolveExit)),
              new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
            ]);
            await rm(dataDir, { recursive: true, force: true });
          },
        };
      }
    } catch {
      // The test server may still be opening its listener.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }

  child.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
  throw new Error(`lobby fixture did not become ready\n${output}`);
}

async function loginFromPage(page) {
  await page.getByLabel("账号", { exact: true }).fill(OWNER_USERNAME);
  await page.getByLabel("密码", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "登录并进入游戏大厅" }).click();
}

let fixture;

test.beforeAll(async () => {
  fixture = await startLobbyFixture();
});

test.afterAll(async () => {
  await fixture?.close();
});

test("login reveals both games and the cloud-harbor card opens the real setup page", async ({ page }) => {
  await page.goto(`${fixture.origin}/`);
  await expect(page.getByTestId("page-login")).toBeVisible();
  await loginFromPage(page);

  await expect(page).toHaveURL(`${fixture.origin}/`);
  await expect(page.getByRole("heading", { name: "全部游戏（2）" })).toBeVisible();
  await expect(page.getByTestId("game-card-voice-word-defense")).toBeVisible();
  await expect(page.getByTestId("game-card-ximitu-card-hunt")).toBeVisible();

  const wordDefenseStart = page.getByTestId("start-game-voice-word-defense");
  const cardHuntStart = page.getByTestId("start-game-ximitu-card-hunt");
  await expect(wordDefenseStart).toHaveAttribute("data-route", "");
  await expect(cardHuntStart).not.toHaveAttribute("data-route", "");
  await expect(cardHuntStart).toHaveAttribute("data-document-route", "");
  await expect(cardHuntStart).toHaveAttribute("href", "/prototypes/universal-board/");

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId("game-card-ximitu-card-hunt")).toBeVisible();
  const mobileLayout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".platform-game-card")];
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    };
  });
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  expect(mobileLayout.cards).toHaveLength(2);
  for (const card of mobileLayout.cards) {
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
    expect(card.width).toBeGreaterThan(300);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await cardHuntStart.click();
  await expect(page).toHaveURL(`${fixture.origin}/prototypes/universal-board/`);
  await expect(page.getByTestId("universal-board-prototype")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "准备一场云港卡片大搜寻" }),
  ).toBeVisible();
  await expect(page.locator("#start-session")).toBeVisible();

  const authResponse = await page.request.get(`${fixture.origin}/api/auth/me`);
  expect(authResponse.ok()).toBe(true);
  expect((await authResponse.json()).authenticated).toBe(true);
});

test("anonymous direct entry returns to the game after login, while the old lobby route still works", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${fixture.origin}/prototypes/universal-board/`);
  await expect(page.getByTestId("page-login")).toBeVisible();
  await expect(page).toHaveURL(
    `${fixture.origin}/login/?next=%2Fprototypes%2Funiversal-board%2F`,
  );

  await loginFromPage(page);
  await expect(page).toHaveURL(`${fixture.origin}/prototypes/universal-board/`);
  await expect(
    page.getByRole("heading", { name: "准备一场云港卡片大搜寻" }),
  ).toBeVisible();

  await page.goto(
    `${fixture.origin}/login/?next=%2Fprototypes%2Funiversal-board%2F`,
  );
  await expect(page).toHaveURL(`${fixture.origin}/prototypes/universal-board/`);
  await expect(
    page.getByRole("heading", { name: "准备一场云港卡片大搜寻" }),
  ).toBeVisible();

  await page.goto(`${fixture.origin}/`);
  await page.getByTestId("start-game-voice-word-defense").click();
  await expect(page).toHaveURL(`${fixture.origin}/game/`);
  await expect(page.getByTestId("page-game")).toBeVisible();
  await context.close();
});

test("the lower-left control freezes and resumes the complete Word Attack game", async ({ page }) => {
  await page.goto(`${fixture.origin}/`);
  await loginFromPage(page);
  await expect(page.getByTestId("game-card-voice-word-defense")).toBeVisible();
  await page.goto(`${fixture.origin}/game/?qa=1`);
  await expect(page).toHaveURL(`${fixture.origin}/game/?qa=1`);
  await expect(page.getByTestId("page-game")).toBeVisible();

  await page.waitForTimeout(1_100);
  const beforePause = await page.evaluate(() => ({
    timer: document.querySelector("[data-testid='game-timer']")?.textContent,
    creeps: [...document.querySelectorAll(".enemy")].map((enemy) => enemy.dataset.creep),
  }));
  await page.getByTestId("mic-button").click();
  await expect(page.getByTestId("paused-overlay")).toBeVisible();
  await expect(page.getByTestId("mic-button")).toHaveAttribute("aria-label", "继续整个游戏");
  await expect(page.getByTestId("mic-button")).toHaveAttribute("aria-pressed", "true");

  await page.waitForTimeout(1_600);
  const whilePaused = await page.evaluate(() => ({
    timer: document.querySelector("[data-testid='game-timer']")?.textContent,
    creeps: [...document.querySelectorAll(".enemy")].map((enemy) => enemy.dataset.creep),
  }));
  expect(whilePaused).toEqual(beforePause);

  await page.getByTestId("mic-button").click();
  await expect(page.getByTestId("paused-overlay")).toHaveCount(0);
  await expect(page.getByTestId("mic-button")).toHaveAttribute("aria-label", "暂停整个游戏");
  await page.waitForTimeout(1_200);
  const afterResume = await page.evaluate(() => ({
    timer: document.querySelector("[data-testid='game-timer']")?.textContent,
    creeps: [...document.querySelectorAll(".enemy")].map((enemy) => enemy.dataset.creep),
  }));
  expect(afterResume.timer).not.toBe(whilePaused.timer);
  expect(afterResume.creeps).not.toEqual(whilePaused.creeps);

  const shotsBefore = await page.getByTestId("recognized-shot-count").textContent();
  await page.getByTestId("dock-word-banana").click();
  await expect(page.getByTestId("mission-word")).toHaveText("BANANA");
  await expect(page.getByTestId("mission-card")).toHaveAttribute("data-previewing", "true");
  await expect(page.getByTestId("dock-word-banana")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("feedback-card")).toContainText("正在播放 BANANA");
  expect(await page.getByTestId("recognized-shot-count").textContent()).toBe(shotsBefore);

  await page.getByTestId("qa-basic").click();
  await expect(page.getByTestId("hero-launcher")).toBeVisible();
  await expect(page.getByTestId("word-projectile")).toBeVisible({ timeout: 2_000 });
  await expect(page.getByTestId("enemy-shield-apple")).toHaveAttribute("data-shield-stage", "1", { timeout: 3_000 });
  await expect(page.getByTestId("enemy-hp-apple")).toHaveAttribute("aria-label", "生命值 5/6");
  await expect(page.getByTestId("mission-word")).toHaveText("APPLE");
});
