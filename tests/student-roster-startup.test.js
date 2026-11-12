import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const source = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");

function functionSource(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(source);
  assert.ok(match, `missing application function ${name}`);
  const tail = source.slice(match.index);
  const next = tail.slice(1).search(/\n(?:async )?function /);
  assert.ok(next >= 0, `missing boundary after ${name}`);
  return tail.slice(0, next + 1);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const flushMicrotasks = () => new Promise(resolve => setImmediate(resolve));

function startupFixture({ authenticated = true, authOk = true, authError = null } = {}) {
  const declarations = /let sessionConfigurationLoading = (true|false);/.exec(source);
  assert.ok(declarations, "the application declares its initial configuration-loading state");
  const registries = [deferred(), deferred(), deferred()];
  const calls = { requests: [], students: [], registries: [], renders: [], restores: [] };
  const context = createContext({
    sessionConfigurationLoading: declarations[1] === "true",
    voiceBoardAssessmentConfigured: false,
    voiceBoardKnowledgeAsrConfigured: false,
    voiceBoardAsrAuthenticated: false,
    voiceBoardBrowserFallbackAvailable: false,
    qaControlsEnabled: false,
    qaHarnessEnabled: false,
    layoutEditorAuthorized: false,
    layoutEditorOwnerUserId: null,
    authenticatedUserId: null,
    speechStatus: "idle",
    speechTranscript: "",
    QA_HARNESS_REQUESTED: false,
    QA_PAGE_REQUESTED: false,
    LAYOUT_EDITOR_REQUESTED: false,
    layoutEditor: { active: false },
    root: { dataset: {} },
    nodes: { asrHelp: { textContent: "" } },
    activeWorldComposition: { worldRef: "fixture-world" },
    fetch: async (url, options) => {
      calls.requests.push(url);
      assert.equal(options.cache, "no-store");
      if (url === "/api/config") return { ok: true, json: async () => ({ qaEnabled: false }) };
      assert.equal(url, "/api/auth/me");
      if (authError) throw authError;
      return { ok: authOk, json: async () => ({ authenticated, user: { id: "fixture-owner", role: "owner" } }) };
    },
    loadStudentProfiles: async () => {
      calls.students.push(context.authenticatedUserId);
      return true;
    },
    ...Object.fromEntries([
      "loadPublishedBoardLayouts", "loadPublishedDicePack", "loadPublishedNodeRewardPack",
    ].map((name, index) => [name, () => {
      calls.registries.push(name);
      return registries[index].promise;
    }])),
    loadPublishedClassroomEventProgram: async () => false,
    promoteLegacyWorkingLayouts: () => {},
    browserSentenceCaptureSupported: () => false,
    applyConfirmedVisualBoard: () => {},
    renderBoard: () => {},
    renderCharacterSelection: () => calls.renders.push(context.sessionConfigurationLoading),
    renderStudentRoster: () => {},
    renderSpeechControls: () => {},
    renderLayoutRegistryStatus: () => {},
    restoreLocalSessionOnStartup: () => calls.restores.push({
      loading: context.sessionConfigurationLoading, ownerId: context.authenticatedUserId,
    }),
  });
  runInContext(functionSource("initializeSpeechAvailability"), context);
  return { context, calls, registries };
}

test("authenticated students load while every map, dice and reward publication is still pending", async () => {
  const { context, calls, registries } = startupFixture();
  const initialization = context.initializeSpeechAvailability();
  try {
    await flushMicrotasks();
    assert.deepEqual(calls.requests, ["/api/config", "/api/auth/me"]);
    assert.deepEqual(calls.students, ["fixture-owner"], "the roster starts with a verified identity before publications finish");
    assert.equal(calls.registries.length, 3);
    assert.equal(context.sessionConfigurationLoading, true);
    assert.deepEqual(calls.renders, []);
    assert.deepEqual(calls.restores, [], "no save restores before the configuration and identity gate");

    for (const registry of registries.slice(0, 2)) {
      registry.resolve(true);
      await flushMicrotasks();
      assert.equal(context.sessionConfigurationLoading, true, "new sessions still wait for the remaining publication");
    }
    registries[2].resolve(true);
    await initialization;
    assert.equal(context.sessionConfigurationLoading, false);
    assert.deepEqual(calls.restores, [{ loading: false, ownerId: "fixture-owner" }]);
    assert.deepEqual(calls.renders, [false], "the opening controls see the completed configuration state");
    assert.deepEqual(calls.students, ["fixture-owner"], "initialization does not request the roster twice");
    assert.equal(context.root.dataset.dicePackReady, "true");
    assert.equal(context.root.dataset.nodeRewardPackReady, "true");
  } finally {
    registries.forEach(registry => registry.resolve(false));
    await initialization;
  }
});

test("anonymous and rejected authentication never fetch students or private publications", async () => {
  for (const options of [{ authenticated: false }, { authOk: false }]) {
    const { context, calls } = startupFixture(options);
    await context.initializeSpeechAvailability();
    assert.equal(context.authenticatedUserId, null);
    assert.deepEqual(calls.students, []);
    assert.deepEqual(calls.registries, []);
    assert.equal(context.sessionConfigurationLoading, false);
    assert.deepEqual(calls.renders, [false]);
  }
});

test("authentication request errors clear configuration-pending state without exposing the roster", async () => {
  const { context, calls } = startupFixture({ authError: new Error("fixture auth offline") });
  await context.initializeSpeechAvailability();
  assert.equal(context.sessionConfigurationLoading, false);
  assert.equal(context.authenticatedUserId, null);
  assert.equal(context.layoutEditorAuthorized, false);
  assert.equal(context.speechStatus, "error");
  assert.deepEqual(calls.students, []);
  assert.deepEqual(calls.renders, [false]);
});

test("publication rejection clears pending state after the independently started roster request", async () => {
  const { context, calls, registries } = startupFixture();
  const initialization = context.initializeSpeechAvailability();
  try {
    await flushMicrotasks();
    assert.deepEqual(calls.students, ["fixture-owner"]);
    assert.equal(context.sessionConfigurationLoading, true);
    registries[0].reject(new Error("fixture publication failed"));
    await initialization;
    assert.equal(context.sessionConfigurationLoading, false);
    assert.equal(context.speechStatus, "error");
    assert.deepEqual(calls.renders, [false]);
  } finally {
    registries.forEach(registry => registry.resolve(false));
    await initialization;
  }
});

test("a pending configuration blocks the actual new-session entry before archive reads or game mutations", () => {
  const session = Object.freeze({ sessionId: "saved-game", marker: "preserve" });
  const runtime = Object.freeze({ marker: "saved-runtime" });
  const storageCalls = [];
  const context = createContext({
    sessionConfigurationLoading: true,
    TEACHER_MODE: "teacher-led",
    gameSession: session,
    runtime,
    LOCAL_SESSION_KEY: "fixture-session",
    rewardPresentationEpoch: 7,
    nodes: Object.fromEntries([
      ["setupMode", "teacher-led"], ["setupTheme", "cloud-harbor"],
      ["setupLearning", "family"], ["setupPlayerCount", "2"], ["setupOpportunities", "2"],
    ].map(([name, value]) => [name, { value }])),
    window: { localStorage: {
      getItem: key => { storageCalls.push(["read", key]); assert.fail("must not read or archive an existing game while configuration is pending"); },
      setItem: key => { storageCalls.push(["write", key]); assert.fail("must not replace an existing game while configuration is pending"); },
    } },
  });
  runInContext(functionSource("startLocalSession"), context);
  assert.equal(context.startLocalSession(), undefined);
  assert.deepEqual(storageCalls, []);
  assert.strictEqual(context.gameSession, session);
  assert.strictEqual(context.runtime, runtime);
  assert.equal(context.rewardPresentationEpoch, 7);
});
