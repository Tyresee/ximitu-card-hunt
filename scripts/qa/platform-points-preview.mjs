// Test-only loopback proxy. Use ONLY a platform fixture with temporary DATA_DIR.
// This script is not included by build-standalone-game.mjs.
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameServer } from "../../standalone/server.mjs";

const upstream = new URL(process.argv[2] || "http://127.0.0.1:0");
if (process.env.MONOPOLY_ISOLATED_POINTS_QA !== "1" || upstream.hostname !== "127.0.0.1"
  || upstream.protocol !== "http:" || !Number(upstream.port) || upstream.port === "19321") {
  throw new Error("Require MONOPOLY_ISOLATED_POINTS_QA=1 and an explicitly isolated loopback platform fixture (never 19321).");
}
const localOrigin = "http://127.0.0.1:19422";
const dataDir = await mkdtemp(join(tmpdir(), "monopoly-points-browser-"));
const game = createGameServer({
  root: fileURLToPath(new URL("../../dist/public", import.meta.url)),
  version: "isolated-points-browser-qa", platformOrigin: upstream.origin,
  dataDir, publicOrigin: localOrigin,
});
const gameHandler = game.listeners("request")[0];
const server = createServer(async (req, res) => {
  const path = new URL(req.url, localOrigin).pathname;
  if (path.startsWith("/games/monopoly/") || path.startsWith("/games/monopoly-runtime/")) {
    return gameHandler(req, res);
  }
  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers["content-length"];
    delete headers["accept-encoding"];
    if (!["GET", "HEAD"].includes(req.method)) {
      if (headers.origin !== localOrigin) { res.writeHead(403); return res.end("Local origin required"); }
      // The isolated fixture's public origin belongs to its other game proxy.
      headers.origin = upstream.origin;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await fetch(`${upstream.origin}${req.url}`, {
      method: req.method, headers, redirect: "manual",
      ...(!["GET", "HEAD"].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
    });
    const responseHeaders = Object.fromEntries(response.headers);
    delete responseHeaders["content-encoding"];
    delete responseHeaders["content-length"];
    res.writeHead(response.status, responseHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "fixture_unavailable", message: "隔离平台测试服务不可用" }));
  }
});
server.listen(19422, "127.0.0.1", () => console.log(`Isolated points QA: ${localOrigin}/games/monopoly/`));
async function close() {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
