import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("game.manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const fail = (message) => {
  throw new Error(`game.manifest.json: ${message}`);
};

if (manifest.schemaVersion !== "tim-game-manifest.v1") fail("schemaVersion 无效");
if (manifest.kind !== "standalone-game") fail("kind 必须是 standalone-game");
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id || "")) fail("id 必须是 kebab-case");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) fail("version 必须是 semver");

const requiredString = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} 必须是非空字符串`);
};

requiredString(manifest.display?.title, "display.title");
requiredString(manifest.display?.description, "display.description");
requiredString(manifest.display?.status, "display.status");
requiredString(manifest.entry?.path, "entry.path");
requiredString(manifest.entry?.navigation, "entry.navigation");
requiredString(manifest.integration?.contract, "integration.contract");

if (!manifest.entry.path.startsWith("/")) fail("entry.path 必须是站内绝对路径");
if (manifest.entry.navigation !== "document") fail("standalone game 必须使用 document 导航");
if (manifest.integration?.auth?.mode !== "same-origin-platform-session") {
  fail("integration.auth.mode 必须使用平台同源会话");
}
if (manifest.integration.auth.cookieName !== "__Host-vwa_session") {
  fail("integration.auth.cookieName 必须使用平台生产会话 Cookie");
}
if (manifest.integration.auth.sessionEndpoint !== "/api/auth/me") {
  fail("integration.auth.sessionEndpoint 必须指向平台会话接口");
}
if (manifest.integration.auth.credentials !== "same-origin") {
  fail("integration.auth.credentials 必须是 same-origin");
}
if (!Array.isArray(manifest.display.tags) || manifest.display.tags.length === 0) {
  fail("display.tags 必须至少包含一个标签");
}
for (const field of ["platformOwns", "gameOwns"]) {
  if (!Array.isArray(manifest.integration[field]) || manifest.integration[field].length === 0) {
    fail(`integration.${field} 必须是非空数组`);
  }
}

console.log(`game manifest ok: ${manifest.id}@${manifest.version}`);
