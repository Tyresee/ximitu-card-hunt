import test from "node:test";
import assert from "node:assert/strict";

import {
  SENTENCE_AUTO_FINISH_CONTINUE_VOLUME,
  SENTENCE_AUTO_FINISH_MIN_LOUD_SAMPLES,
  SENTENCE_AUTO_FINISH_START_VOLUME,
  SENTENCE_ASSESSMENT_RESULT_CONTRACT,
  SENTENCE_ASSESSMENT_SOURCE,
  SENTENCE_KNOWLEDGE_DECISION_TIMEOUT_CODE,
  SENTENCE_RECORDING_INTERRUPTED_CODE,
  SENTENCE_RECORDING_TIMEOUT_CODE,
  SENTENCE_SCORING_TIMEOUT_CODE,
  SentenceAssessmentClient,
  runSentenceAssessmentSdk,
} from "../public/js/sentence-assessment.js";

const CONTEXT = Object.freeze({
  gameSessionId: "game-001",
  turnId: "turn-001",
  learningPackId: "family-have-has",
  learningPackVersion: "0.1.0",
  taskId: "family-01",
});

function providerStart(overrides = {}) {
  return {
    ...CONTEXT,
    source: SENTENCE_ASSESSMENT_SOURCE,
    mode: "aliyun",
    attemptId: "attempt-001",
    providerSession: {
      engineSrc: "/vendor/engine.js",
      applicationId: "app-001",
      userId: "anonymous-user",
      warrantId: "warrant-001",
    },
    assessment: {
      coreType: "en.sent_kid.score",
      refText: "She has two apples.",
    },
    ...overrides,
  };
}

function policyProviderStart(overrides = {}) {
  return providerStart({
    resultContractVersion: SENTENCE_ASSESSMENT_RESULT_CONTRACT,
    assessmentPolicy: {
      schemaVersion: "assessment-policy.v1",
      policyId: "grammar.have-has",
      displayName: "第三人称单数",
    },
    ...overrides,
  });
}

function policyCompletionResult(overrides = {}) {
  return {
    ...CONTEXT,
    source: SENTENCE_ASSESSMENT_SOURCE,
    attemptId: "attempt-001",
    resultContractVersion: SENTENCE_ASSESSMENT_RESULT_CONTRACT,
    result: "accepted",
    scoringOutcome: "accepted",
    knowledgeStatus: "correct",
    primaryAccepted: true,
    score: 88,
    valid: true,
    reason: null,
    components: {
      knowledgeCorrectness: 100,
      targetPronunciation: 90,
      sentencePronunciation: 84,
      fluency: 80,
    },
    ...overrides,
  };
}

function createPolicyResultClient(result, {
  start = policyProviderStart(),
} = {}) {
  let listenerOptions = null;
  return new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => start,
      completeVoiceBoardAssessment: async () => result,
    },
    createKnowledgeListener: (options) => {
      listenerOptions = options;
      return {
        async start() {},
        destroy() {},
      };
    },
    runAssessment: ({ completeResult, registerControls }) => {
      registerControls({ stop() {}, destroy() {}, fail() {} });
      listenerOptions.onDecision({
        recognitionResultId: "recognition-policy-result",
      });
      return completeResult({ result: { overall: 88 } });
    },
  });
}

test("sentence client sends identifiers only, completes once, and returns the server score", async () => {
  const starts = [];
  const completions = [];
  const states = [];
  const client = new SentenceAssessmentClient({
    onState: (state) => states.push(state),
    apiClient: {
      startVoiceBoardAssessment: async (payload) => {
        starts.push(payload);
        return providerStart();
      },
      completeVoiceBoardAssessment: async (payload) => {
        completions.push(payload);
        return {
          ...CONTEXT,
          source: SENTENCE_ASSESSMENT_SOURCE,
          attemptId: "attempt-001",
          score: 88,
          valid: true,
          reason: null,
        };
      },
    },
    runAssessment: async ({
      start,
      onState,
      completeResult,
      registerControls,
    }) => {
      assert.equal(start.assessment.refText, "She has two apples.");
      registerControls({ stop() {}, destroy() {} });
      onState("listening");
      return completeResult({ result: { overall: 88 } });
    },
  });

  const result = await client.assess({
    ...CONTEXT,
    refText: "A forged browser sentence must be ignored.",
  });

  assert.deepEqual(starts, [CONTEXT]);
  assert.equal(completions.length, 1);
  assert.deepEqual(completions[0], {
    ...CONTEXT,
    attemptId: "attempt-001",
    resultContractVersion: SENTENCE_ASSESSMENT_RESULT_CONTRACT,
    result: { result: { overall: 88 } },
  });
  assert.equal(result.score, 88);
  assert.equal(result.source, SENTENCE_ASSESSMENT_SOURCE);
  assert.deepEqual(states, ["requesting_permission", "listening"]);
});

test("sentence client runs the knowledge listener first and waits for its server decision before completing", async () => {
  const order = [];
  const completions = [];
  const previews = [];
  let listenerOptions = null;
  let listenerDestroyCalls = 0;
  let assessmentStopCalls = 0;
  const rawResult = { result: { overall: 97 } };
  const client = new SentenceAssessmentClient({
    onPreview: (payload) => previews.push(payload),
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
      completeVoiceBoardAssessment: async (payload) => {
        order.push("complete-request");
        completions.push(payload);
        return {
          ...CONTEXT,
          source: SENTENCE_ASSESSMENT_SOURCE,
          attemptId: "attempt-001",
          resultContractVersion: SENTENCE_ASSESSMENT_RESULT_CONTRACT,
          result: "accepted",
          scoringOutcome: "score_low",
          knowledgeStatus: "wrong",
          primaryAccepted: false,
          score: 45,
          valid: true,
          reason: null,
          components: {
            knowledgeCorrectness: 0,
            targetPronunciation: 97,
            sentencePronunciation: 96,
            fluency: 95,
          },
        };
      },
    },
    createKnowledgeListener: (options) => {
      listenerOptions = options;
      return {
        async start() {
          order.push("knowledge-start");
        },
        destroy() {
          listenerDestroyCalls += 1;
        },
      };
    },
    runAssessment: async ({ completeResult, registerControls }) => {
      order.push("assessment-start");
      registerControls({
        stop() {
          assessmentStopCalls += 1;
          order.push("assessment-stop");
        },
        destroy() {},
      });
      listenerOptions.onTranscript({
        transcript: "She have two apples.",
        isFinal: false,
      });
      const completion = completeResult(rawResult);
      order.push("provider-final");
      assert.equal(completions.length, 0);
      listenerOptions.onDecision({
        recognitionResultId: "recognition-001",
        decision: "score_low",
      });
      return completion;
    },
  });

  const result = await client.assess(CONTEXT);

  assert.deepEqual(
    order,
    [
      "knowledge-start",
      "assessment-start",
      "provider-final",
      "assessment-stop",
      "complete-request",
    ],
  );
  assert.equal(assessmentStopCalls, 1);
  assert.equal(listenerDestroyCalls, 1);
  assert.deepEqual(previews, ["She have two apples."]);
  assert.equal(listenerOptions.start.attemptId, "attempt-001");
  assert.deepEqual(listenerOptions.context, {
    attemptId: "attempt-001",
    ...CONTEXT,
  });
  assert.equal(
    listenerOptions.assessmentPolicy.policyId,
    "grammar.have-has",
  );
  assert.deepEqual(completions, [{
    ...CONTEXT,
    attemptId: "attempt-001",
    resultContractVersion: SENTENCE_ASSESSMENT_RESULT_CONTRACT,
    result: rawResult,
  }]);
  assert.equal("transcript" in completions[0], false);
  assert.equal("knowledgeDecision" in completions[0], false);
  assert.equal(result.score, 45);
});

test("sentence client shows scoring only after the knowledge microphone has stopped", async () => {
  const order = [];
  const states = [];
  let listenerOptions = null;
  const client = new SentenceAssessmentClient({
    onState: (state) => {
      states.push(state);
      order.push(`state:${state}`);
    },
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
      completeVoiceBoardAssessment: async () => policyCompletionResult(),
    },
    createKnowledgeListener: (options) => {
      listenerOptions = options;
      return {
        async start() {},
        destroy() {},
      };
    },
    runAssessment: async ({ onState, completeResult, registerControls }) => {
      registerControls({
        stop() {
          order.push("assessment-mic-stop");
        },
        destroy() {},
      });
      onState("listening");
      onState("scoring");
      assert.deepEqual(states, ["requesting_permission", "listening"]);
      const completion = completeResult({ result: { overall: 88 } });
      order.push("knowledge-mic-stop");
      listenerOptions.onDecision({
        recognitionResultId: "recognition-001",
        decision: "score_low",
      });
      return completion;
    },
  });

  await client.assess(CONTEXT);

  assert.deepEqual(states, [
    "requesting_permission",
    "listening",
    "scoring",
  ]);
  assert.ok(
    order.indexOf("knowledge-mic-stop") < order.indexOf("state:scoring"),
  );
  assert.ok(
    order.indexOf("assessment-mic-stop") < order.indexOf("state:scoring"),
  );
  assert.equal(states.filter((state) => state === "scoring").length, 1);
});

test("sentence client does not duplicate scoring when the knowledge decision stops assessment first", async () => {
  const order = [];
  const states = [];
  let listenerOptions = null;
  const client = new SentenceAssessmentClient({
    onState: (state) => {
      states.push(state);
      order.push(`state:${state}`);
    },
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
      completeVoiceBoardAssessment: async () => policyCompletionResult(),
    },
    createKnowledgeListener: (options) => {
      listenerOptions = options;
      return {
        async start() {},
        destroy() {},
      };
    },
    runAssessment: async ({ onState, completeResult, registerControls }) => {
      registerControls({
        stop() {
          order.push("assessment-mic-stop");
          onState("scoring");
        },
        destroy() {},
      });
      onState("listening");
      order.push("knowledge-mic-stop");
      listenerOptions.onDecision({
        recognitionResultId: "recognition-001",
        decision: "score_low",
      });
      return completeResult({ result: { overall: 88 } });
    },
  });

  await client.assess(CONTEXT);

  assert.deepEqual(states, [
    "requesting_permission",
    "listening",
    "scoring",
  ]);
  assert.ok(
    order.indexOf("knowledge-mic-stop") < order.indexOf("state:scoring"),
  );
  assert.ok(
    order.indexOf("assessment-mic-stop") < order.indexOf("state:scoring"),
  );
  assert.equal(states.filter((state) => state === "scoring").length, 1);
});

test("policy attempts require the v3 contract at start and completion", async (t) => {
  for (const resultContractVersion of [undefined, "voice-board-assessment-result.v2"]) {
    await t.test(`start rejects ${resultContractVersion || "a missing contract"}`, async () => {
      let runnerCalls = 0;
      const client = new SentenceAssessmentClient({
        apiClient: {
          startVoiceBoardAssessment: async () => policyProviderStart({
            resultContractVersion,
          }),
        },
        createKnowledgeListener: () => ({
          async start() {},
          destroy() {},
        }),
        runAssessment: async () => {
          runnerCalls += 1;
          return null;
        },
      });

      await assert.rejects(
        client.assess(CONTEXT),
        /协议已经更新/,
      );
      assert.equal(runnerCalls, 0);
    });
  }

  for (const resultContractVersion of [undefined, "voice-board-assessment-result.v2"]) {
    await t.test(`completion rejects ${resultContractVersion || "a missing contract"}`, async () => {
      await assert.rejects(
        createPolicyResultClient(policyCompletionResult({
          resultContractVersion,
        })).assess(CONTEXT),
        /结果协议无效/,
      );
    });
  }
});

test("policy v3 result validation accepts only the defined scoring states", async (t) => {
  const acceptedStates = [
    {
      name: "correct weighted score",
      result: policyCompletionResult(),
    },
    {
      name: "explicit wrong fixed at 45",
      result: policyCompletionResult({
        knowledgeStatus: "wrong",
        primaryAccepted: false,
        scoringOutcome: "score_low",
        score: 45,
        components: {
          knowledgeCorrectness: 0,
          targetPronunciation: null,
          sentencePronunciation: 88,
          fluency: null,
        },
      }),
    },
    {
      name: "ambiguous transcript for teacher review",
      result: policyCompletionResult({
        result: "teacher_review",
        knowledgeStatus: "uncertain",
        primaryAccepted: false,
        scoringOutcome: "teacher_review",
        score: null,
        components: {
          knowledgeCorrectness: null,
          targetPronunciation: 90,
          sentencePronunciation: 84,
          fluency: 80,
        },
      }),
    },
    {
      name: "missing uncertain evidence retries safely",
      result: policyCompletionResult({
        result: "retry",
        knowledgeStatus: "uncertain",
        primaryAccepted: false,
        scoringOutcome: "retry",
        score: null,
        valid: false,
        components: {
          knowledgeCorrectness: null,
          targetPronunciation: null,
          sentencePronunciation: null,
          fluency: null,
        },
      }),
    },
    {
      name: "correct knowledge with missing weighted evidence retries safely",
      result: policyCompletionResult({
        result: "retry",
        knowledgeStatus: "correct",
        primaryAccepted: false,
        scoringOutcome: "retry",
        score: null,
        valid: false,
        components: {
          knowledgeCorrectness: 100,
          targetPronunciation: 90,
          sentencePronunciation: null,
          fluency: 80,
        },
      }),
    },
  ];

  for (const scenario of acceptedStates) {
    await t.test(scenario.name, async () => {
      const result = await createPolicyResultClient(
        scenario.result,
      ).assess(CONTEXT);
      assert.equal(result.result, scenario.result.result);
      assert.equal(result.score, scenario.result.score);
    });
  }
});

test("policy v3 result validation rejects contradictory or incomplete states", async (t) => {
  const rejectedStates = [
    {
      name: "accepted correct without primary acceptance",
      result: policyCompletionResult({ primaryAccepted: false }),
    },
    {
      name: "accepted correct with a missing weighted component",
      result: policyCompletionResult({
        components: {
          knowledgeCorrectness: 100,
          targetPronunciation: null,
          sentencePronunciation: 84,
          fluency: 80,
        },
      }),
    },
    {
      name: "accepted wrong with a high score",
      result: policyCompletionResult({
        knowledgeStatus: "wrong",
        primaryAccepted: false,
        scoringOutcome: "score_low",
        score: 85,
        components: {
          knowledgeCorrectness: 0,
          targetPronunciation: 90,
          sentencePronunciation: 84,
          fluency: 80,
        },
      }),
    },
    {
      name: "accepted wrong marked as provider-invalid",
      result: policyCompletionResult({
        knowledgeStatus: "wrong",
        primaryAccepted: false,
        scoringOutcome: "score_low",
        score: 45,
        valid: false,
        components: {
          knowledgeCorrectness: 0,
          targetPronunciation: null,
          sentencePronunciation: null,
          fluency: null,
        },
      }),
    },
    {
      name: "teacher review pretending knowledge is correct",
      result: policyCompletionResult({
        result: "teacher_review",
        knowledgeStatus: "correct",
        primaryAccepted: false,
        scoringOutcome: "teacher_review",
        score: null,
      }),
    },
    {
      name: "retry marked valid",
      result: policyCompletionResult({
        result: "retry",
        knowledgeStatus: "uncertain",
        primaryAccepted: false,
        scoringOutcome: "retry",
        score: null,
        components: {
          knowledgeCorrectness: null,
          targetPronunciation: null,
          sentencePronunciation: null,
          fluency: null,
        },
      }),
    },
    {
      name: "retry with complete correct scoring evidence",
      result: policyCompletionResult({
        result: "retry",
        primaryAccepted: false,
        scoringOutcome: "retry",
        score: null,
        valid: false,
      }),
    },
    {
      name: "teacher review with a missing components object",
      result: policyCompletionResult({
        result: "teacher_review",
        knowledgeStatus: "uncertain",
        primaryAccepted: false,
        scoringOutcome: "teacher_review",
        score: null,
        components: undefined,
      }),
    },
  ];

  for (const scenario of rejectedStates) {
    await t.test(scenario.name, async () => {
      await assert.rejects(
        createPolicyResultClient(scenario.result).assess(CONTEXT),
        /声音评测结果无效/,
      );
    });
  }
});

test("sentence client safely refuses a policy attempt without a knowledge listener", async () => {
  let runnerCalls = 0;
  let completionCalls = 0;
  const client = new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
      completeVoiceBoardAssessment: async () => {
        completionCalls += 1;
        return null;
      },
    },
    runAssessment: async () => {
      runnerCalls += 1;
      return {
        ...CONTEXT,
        source: SENTENCE_ASSESSMENT_SOURCE,
        attemptId: "attempt-001",
        result: "accepted",
        score: 100,
        valid: true,
      };
    },
  });

  await assert.rejects(
    client.assess(CONTEXT),
    /知识点判断暂时不可用/,
  );
  assert.equal(runnerCalls, 0);
  assert.equal(completionCalls, 0);
});

test("sentence client never completes a policy score when the knowledge decision times out", async () => {
  let completionCalls = 0;
  let listenerDestroyCalls = 0;
  const client = new SentenceAssessmentClient({
    knowledgeDecisionTimeoutMs: 5,
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
      completeVoiceBoardAssessment: async () => {
        completionCalls += 1;
        return {
          ...CONTEXT,
          source: SENTENCE_ASSESSMENT_SOURCE,
          attemptId: "attempt-001",
          result: "accepted",
          score: 100,
          valid: true,
        };
      },
    },
    createKnowledgeListener: () => ({
      async start() {},
      destroy() {
        listenerDestroyCalls += 1;
      },
    }),
    runAssessment: ({ completeResult }) => completeResult({
      result: { overall: 100 },
    }),
  });

  await assert.rejects(
    client.assess(CONTEXT),
    (error) => error?.code === SENTENCE_KNOWLEDGE_DECISION_TIMEOUT_CODE,
  );
  assert.equal(completionCalls, 0);
  assert.equal(listenerDestroyCalls, 1);
});

test("sentence client turns a knowledge listener failure into a no-score failure", async () => {
  let listenerOptions = null;
  let completionCalls = 0;
  let assessmentFailure = null;
  const client = new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
      completeVoiceBoardAssessment: async () => {
        completionCalls += 1;
        return {
          ...CONTEXT,
          source: SENTENCE_ASSESSMENT_SOURCE,
          attemptId: "attempt-001",
          result: "accepted",
          score: 100,
          valid: true,
        };
      },
    },
    createKnowledgeListener: (options) => {
      listenerOptions = options;
      return {
        async start() {},
        destroy() {},
      };
    },
    runAssessment: ({ completeResult, registerControls }) => {
      registerControls({
        stop() {},
        destroy() {},
        fail(error) {
          assessmentFailure = error;
        },
      });
      listenerOptions.onError(new Error("socket disconnected"));
      return completeResult({ result: { overall: 100 } });
    },
  });

  await assert.rejects(
    client.assess(CONTEXT),
    (error) => error?.code === "sentence_knowledge_listener_failed",
  );
  assert.equal(
    assessmentFailure?.code,
    "sentence_knowledge_listener_failed",
  );
  assert.equal(completionCalls, 0);
});

test("sentence client does not start the provider after knowledge listener startup fails", async () => {
  let runnerCalls = 0;
  let listenerDestroyCalls = 0;
  const client = new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
    },
    createKnowledgeListener: () => ({
      async start() {
        throw new Error("microphone unavailable");
      },
      destroy() {
        listenerDestroyCalls += 1;
      },
    }),
    runAssessment: async () => {
      runnerCalls += 1;
      return null;
    },
  });

  await assert.rejects(
    client.assess(CONTEXT),
    (error) => error?.code === "sentence_knowledge_listener_failed",
  );
  assert.equal(runnerCalls, 0);
  assert.equal(listenerDestroyCalls, 1);
});

test("destroying a policy assessment tears down both listeners without completing a score", async () => {
  let listenerDestroyCalls = 0;
  let assessmentDestroyCalls = 0;
  let completionCalls = 0;
  let markRunnerStarted;
  const runnerStarted = new Promise((resolve) => {
    markRunnerStarted = resolve;
  });
  const client = new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
      completeVoiceBoardAssessment: async () => {
        completionCalls += 1;
        return null;
      },
    },
    createKnowledgeListener: () => ({
      async start() {},
      destroy() {
        listenerDestroyCalls += 1;
      },
    }),
    runAssessment: ({ registerControls }) => new Promise((resolve, reject) => {
      registerControls({
        stop() {},
        destroy() {
          assessmentDestroyCalls += 1;
          reject(new DOMException("Cancelled", "AbortError"));
        },
      });
      markRunnerStarted();
    }),
  });

  const assessment = client.assess(CONTEXT);
  await runnerStarted;
  client.destroy();

  await assert.rejects(
    assessment,
    (error) => error?.name === "AbortError",
  );
  assert.equal(listenerDestroyCalls, 1);
  assert.equal(assessmentDestroyCalls, 1);
  assert.equal(completionCalls, 0);
});

test("a knowledge decision before Aliyun recording starts fails the whole policy attempt closed", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let engineConstructors = 0;
  let completionCalls = 0;
  class FakeEngine {
    constructor() {
      engineConstructors += 1;
    }
  }
  const client = new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => policyProviderStart(),
      completeVoiceBoardAssessment: async () => {
        completionCalls += 1;
        return policyCompletionResult();
      },
    },
    createKnowledgeListener: (options) => ({
      async start() {
        options.onDecision({
          recognitionResultId: "knowledge-before-aliyun-ready",
        });
      },
      destroy() {},
    }),
    runAssessment: (options) => runSentenceAssessmentSdk({
      ...options,
      loadSdk: async () => FakeEngine,
    }),
  });

  await assert.rejects(
    client.assess(CONTEXT),
    (error) => error?.code === SENTENCE_RECORDING_INTERRUPTED_CODE,
  );
  assert.equal(engineConstructors, 0);
  assert.equal(completionCalls, 0);
});

test("sentence client accepts only a completion result bound to the active attempt and context", async (t) => {
  const completedResult = {
    ...CONTEXT,
    source: SENTENCE_ASSESSMENT_SOURCE,
    attemptId: "attempt-001",
    result: "accepted",
    score: 87,
    valid: true,
    reason: null,
  };
  const createClient = (result) => new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => providerStart(),
      completeVoiceBoardAssessment: async () => result,
    },
    runAssessment: ({ completeResult }) => completeResult({
      result: { overall: 87 },
    }),
  });

  await t.test("matching attempt and context pass", async () => {
    const result = await createClient(completedResult).assess(CONTEXT);
    assert.equal(result.result, "accepted");
    assert.equal(result.score, 87);
  });

  await t.test("a different attempt is rejected", async () => {
    await assert.rejects(
      createClient({
        ...completedResult,
        attemptId: "attempt-from-another-recording",
      }).assess(CONTEXT),
      /不属于当前回答/,
    );
  });

  for (const field of Object.keys(CONTEXT)) {
    await t.test(`a different ${field} is rejected`, async () => {
      await assert.rejects(
        createClient({
          ...completedResult,
          [field]: `${CONTEXT[field]}-stale`,
        }).assess(CONTEXT),
        /与当前朗读任务不一致/,
      );
    });
  }
});

test("sentence client rejects mock or mismatched providers instead of inventing a score", async () => {
  let runnerCalls = 0;
  const client = new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => providerStart({
        source: "mock",
        mode: "mock",
      }),
    },
    runAssessment: async () => {
      runnerCalls += 1;
      return { source: "mock", score: 100, valid: true };
    },
  });

  await assert.rejects(
    client.assess(CONTEXT),
    /声音评测暂时不可用/,
  );
  assert.equal(runnerCalls, 0);
});

test("sentence client accepts a gentle no-score retry only when the server marks it invalid", async () => {
  const client = new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: async () => providerStart(),
      completeVoiceBoardAssessment: async () => ({
        ...CONTEXT,
        source: SENTENCE_ASSESSMENT_SOURCE,
        attemptId: "attempt-001",
        score: null,
        valid: false,
        reason: "provider_result_empty",
      }),
    },
    runAssessment: ({ completeResult }) => completeResult({
      result: { pron: 99 },
    }),
  });

  const result = await client.assess(CONTEXT);
  assert.equal(result.valid, false);
  assert.equal(result.score, null);
  assert.equal(result.source, SENTENCE_ASSESSMENT_SOURCE);
});

test("destroying while the start request is pending prevents the SDK from starting", async () => {
  let resolveStart;
  let runnerCalls = 0;
  const client = new SentenceAssessmentClient({
    apiClient: {
      startVoiceBoardAssessment: () => new Promise((resolve) => {
        resolveStart = resolve;
      }),
    },
    runAssessment: async () => {
      runnerCalls += 1;
      return null;
    },
  });

  const assessment = client.assess(CONTEXT);
  client.destroy();
  resolveStart(providerStart());

  await assert.rejects(
    assessment,
    (error) => error?.name === "AbortError",
  );
  assert.equal(runnerCalls, 0);
});

test("SDK runner fails closed when a knowledge decision stops it before recording starts", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let engineConstructors = 0;
  let completeCalls = 0;
  let registeredControls = 0;
  class FakeEngine {
    constructor() {
      engineConstructors += 1;
    }
  }

  await assert.rejects(
    runSentenceAssessmentSdk({
      start: policyProviderStart(),
      loadSdk: async () => FakeEngine,
      registerControls: (controls) => {
        if (!controls) return;
        registeredControls += 1;
        controls.stop();
      },
      completeResult: async () => {
        completeCalls += 1;
        return policyCompletionResult();
      },
    }),
    (error) => error?.code === SENTENCE_RECORDING_INTERRUPTED_CODE,
  );

  assert.equal(registeredControls, 1);
  assert.equal(engineConstructors, 0);
  assert.equal(completeCalls, 0);
});

test("SDK runner keeps an idempotent manual-stop fallback and completes once", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const states = [];
  let startRecord = null;
  let completeCalls = 0;
  let previews = 0;
  let destroyed = 0;
  let stopCalls = 0;
  let activeControls = null;
  let engine = null;
  class FakeEngine {
    constructor(options) {
      this.options = options;
      engine = this;
      queueMicrotask(() => {
        options.engineFirstInitDone();
        options.micAllowCallback();
      });
    }

    startRecord(payload) {
      startRecord = payload;
      this.options.micVolumeCallback(6);
      this.options.micVolumeCallback(6);
    }

    stopRecord() {
      stopCalls += 1;
      queueMicrotask(() => {
        this.options.engineBackResultDone({ interim: true }, false);
        this.options.engineBackResultDone({
          result: { overall: 91 },
        }, true);
        this.options.engineBackResultDone({
          result: { overall: 10 },
        }, true);
      });
    }

    destroyEngine() {
      destroyed += 1;
    }
  }

  const resultPromise = runSentenceAssessmentSdk({
    start: providerStart(),
    onState: (state) => states.push(state),
    onPreview: () => { previews += 1; },
    loadSdk: async () => FakeEngine,
    autoFinishSilenceMs: 60_000,
    registerControls: (controls) => {
      activeControls = controls;
    },
    completeResult: async (rawResult) => {
      completeCalls += 1;
      assert.equal(rawResult.result.overall, 91);
      return {
        ...CONTEXT,
        source: SENTENCE_ASSESSMENT_SOURCE,
        score: 91,
        valid: true,
      };
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(engine);
  assert.ok(activeControls);
  assert.equal(completeCalls, 0);
  assert.deepEqual(states, ["listening"]);
  assert.equal(engine.options.intermission, 60_000);

  activeControls.stop();
  activeControls.stop();
  const result = await resultPromise;

  assert.equal(result.score, 91);
  assert.equal(startRecord.coreType, "en.sent_kid.score");
  assert.equal(startRecord.warrantId, "warrant-001");
  assert.equal(completeCalls, 1);
  assert.equal(stopCalls, 1);
  assert.equal(previews, 1);
  assert.deepEqual(states, ["listening", "scoring"]);
  assert.equal(destroyed, 1);
  assert.equal(activeControls, null);
});

test("SDK runner stops and releases the microphone before a provider-final score request completes", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const order = [];
  let controls = null;
  let engine = null;
  let completeRequest = null;
  let resolveCompleteRequest = null;
  class FakeEngine {
    constructor(options) {
      this.options = options;
      engine = this;
      queueMicrotask(() => {
        options.engineFirstInitDone();
        options.micAllowCallback();
      });
    }

    startRecord() {
      this.options.micVolumeCallback(SENTENCE_AUTO_FINISH_START_VOLUME);
      this.options.micVolumeCallback(SENTENCE_AUTO_FINISH_START_VOLUME);
    }

    stopRecord() {
      order.push("stop-record");
    }

    destroyEngine() {
      order.push("destroy-engine");
    }
  }

  const resultPromise = runSentenceAssessmentSdk({
    start: providerStart(),
    loadSdk: async () => FakeEngine,
    autoFinishSilenceMs: 60_000,
    onState: (state) => order.push(`state:${state}`),
    registerControls: (value) => {
      if (value) controls = value;
    },
    completeResult: async () => {
      order.push("complete-request");
      completeRequest = new Promise((resolve) => {
        resolveCompleteRequest = resolve;
      });
      return completeRequest;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  const providerFinal = engine.options.engineBackResultDone({
    result: { overall: 93 },
  }, true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(order.slice(0, 5), [
    "state:listening",
    "stop-record",
    "destroy-engine",
    "state:scoring",
    "complete-request",
  ]);
  assert.ok(order.includes("destroy-engine"));
  assert.equal(controls.stop(), false);
  assert.equal(order.filter((entry) => entry === "stop-record").length, 1);

  resolveCompleteRequest({
    ...CONTEXT,
    source: SENTENCE_ASSESSMENT_SOURCE,
    score: 93,
    valid: true,
  });
  await providerFinal;
  const result = await resultPromise;
  assert.equal(result.score, 93);
  assert.equal(order.filter((entry) => entry === "destroy-engine").length, 1);
});

test("SDK runner survives synchronous final callbacks while stopping exactly once", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const states = [];
  const order = [];
  let controls = null;
  let stopCalls = 0;
  let completeCalls = 0;
  let destroyCalls = 0;
  class FakeEngine {
    constructor(options) {
      this.options = options;
      queueMicrotask(() => {
        options.engineFirstInitDone();
        options.micAllowCallback();
      });
    }

    startRecord() {
      this.options.micVolumeCallback(SENTENCE_AUTO_FINISH_START_VOLUME);
      this.options.micVolumeCallback(SENTENCE_AUTO_FINISH_START_VOLUME);
    }

    stopRecord() {
      stopCalls += 1;
      order.push("stop-enter");
      this.options.engineBackResultDone({ result: { overall: 96 } }, true);
      this.options.engineBackResultDone({ result: { overall: 12 } }, true);
      this.options.engineBackResultFail();
      order.push("stop-exit");
    }

    destroyEngine() {
      destroyCalls += 1;
      order.push("destroy-engine");
    }
  }

  const resultPromise = runSentenceAssessmentSdk({
    start: providerStart(),
    loadSdk: async () => FakeEngine,
    autoFinishSilenceMs: 60_000,
    onState: (state) => {
      states.push(state);
      order.push(`state:${state}`);
    },
    registerControls: (value) => {
      if (value) controls = value;
    },
    completeResult: async (rawResult) => {
      completeCalls += 1;
      order.push("complete-request");
      return {
        ...CONTEXT,
        source: SENTENCE_ASSESSMENT_SOURCE,
        score: rawResult.result.overall,
        valid: true,
      };
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controls.stop(), true);
  assert.equal(controls.stop(), false);
  const result = await resultPromise;

  assert.equal(result.score, 96);
  assert.equal(stopCalls, 1);
  assert.equal(completeCalls, 1);
  assert.equal(destroyCalls, 1);
  assert.deepEqual(states, ["listening", "scoring"]);
  assert.deepEqual(order, [
    "state:listening",
    "stop-enter",
    "stop-exit",
    "destroy-engine",
    "state:scoring",
    "complete-request",
  ]);
});

test("SDK runner automatically stops after real speech followed by silence", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const states = [];
  let completeCalls = 0;
  let stopCalls = 0;
  let previews = 0;
  class FakeEngine {
    constructor(options) {
      this.options = options;
      queueMicrotask(() => {
        options.engineFirstInitDone();
        options.micAllowCallback();
      });
    }

    startRecord() {
      this.options.micVolumeCallback(SENTENCE_AUTO_FINISH_START_VOLUME);
      this.options.micVolumeCallback(SENTENCE_AUTO_FINISH_START_VOLUME);
      this.options.micVolumeCallback(SENTENCE_AUTO_FINISH_CONTINUE_VOLUME);
    }

    stopRecord() {
      stopCalls += 1;
      queueMicrotask(() => {
        this.options.engineBackResultDone({
          result: { overall: 94 },
        }, true);
        this.options.engineBackResultDone({
          result: { overall: 12 },
        }, true);
      });
    }

    destroyEngine() {}
  }

  const result = await runSentenceAssessmentSdk({
    start: providerStart(),
    onState: (state) => states.push(state),
    onPreview: () => { previews += 1; },
    loadSdk: async () => FakeEngine,
    autoFinishSilenceMs: 10,
    completeResult: async (rawResult) => {
      completeCalls += 1;
      return {
        ...CONTEXT,
        source: SENTENCE_ASSESSMENT_SOURCE,
        score: rawResult.result.overall,
        valid: true,
      };
    },
  });

  assert.equal(result.score, 94);
  assert.equal(stopCalls, 1);
  assert.equal(completeCalls, 1);
  assert.equal(previews, 1);
  assert.deepEqual(states, ["listening", "scoring"]);
});

test("SDK runner ignores quiet background noise until speech is confirmed", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let controls = null;
  let stopCalls = 0;
  let previewCalls = 0;
  class FakeEngine {
    constructor(options) {
      this.options = options;
      queueMicrotask(() => {
        options.engineFirstInitDone();
        options.micAllowCallback();
      });
    }

    startRecord() {
      for (let index = 0; index < SENTENCE_AUTO_FINISH_MIN_LOUD_SAMPLES + 2; index += 1) {
        this.options.micVolumeCallback(SENTENCE_AUTO_FINISH_START_VOLUME - 1);
      }
    }

    stopRecord() {
      stopCalls += 1;
    }

    destroyEngine() {}
  }

  const attempt = runSentenceAssessmentSdk({
    start: providerStart(),
    onPreview: () => { previewCalls += 1; },
    loadSdk: async () => FakeEngine,
    autoFinishSilenceMs: 5,
    registerControls: (value) => {
      if (value) controls = value;
    },
    completeResult: async () => null,
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(controls);
  assert.equal(stopCalls, 0);
  assert.equal(previewCalls, 0);
  controls.destroy();
  await assert.rejects(attempt, (error) => error?.name === "AbortError");
});

test("SDK runner turns a provider final before speech detection into a retryable interruption", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let engine = null;
  let completeCalls = 0;
  class FakeEngine {
    constructor(options) {
      this.options = options;
      engine = this;
      queueMicrotask(() => {
        options.engineFirstInitDone();
        options.micAllowCallback();
      });
    }

    startRecord() {}
    destroyEngine() {}
  }

  const attempt = runSentenceAssessmentSdk({
    start: providerStart(),
    loadSdk: async () => FakeEngine,
    completeResult: async () => {
      completeCalls += 1;
      return null;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  engine.options.engineBackResultDone({
    result: { overall: 99 },
  }, true);

  await assert.rejects(
    attempt,
    (error) => error?.code === SENTENCE_RECORDING_INTERRUPTED_CODE,
  );
  assert.equal(completeCalls, 0);
});

test("SDK runner replaces the recording deadline with a bounded scoring deadline", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let controls = null;
  let completeCalls = 0;
  let stopCalls = 0;
  class FakeEngine {
    constructor(options) {
      queueMicrotask(() => {
        options.engineFirstInitDone();
        options.micAllowCallback();
      });
    }

    startRecord() {}
    stopRecord() {
      stopCalls += 1;
    }
    destroyEngine() {}
  }

  const attempt = runSentenceAssessmentSdk({
    start: providerStart(),
    loadSdk: async () => FakeEngine,
    recordingTimeoutMs: 5,
    scoringTimeoutMs: 15,
    registerControls: (value) => {
      if (value) controls = value;
    },
    completeResult: async () => {
      completeCalls += 1;
      return null;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  controls.stop();
  await assert.rejects(
    attempt,
    (error) => error?.code === SENTENCE_SCORING_TIMEOUT_CODE,
  );
  assert.equal(stopCalls, 1);
  assert.equal(completeCalls, 0);
});

test("SDK runner times out a long recording as a retry without submitting a score", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let completeCalls = 0;
  let destroyed = 0;
  class FakeEngine {
    constructor(options) {
      queueMicrotask(() => {
        options.engineFirstInitDone();
        options.micAllowCallback();
      });
    }

    startRecord() {}

    destroyEngine() {
      destroyed += 1;
    }
  }

  await assert.rejects(
    runSentenceAssessmentSdk({
      start: providerStart(),
      loadSdk: async () => FakeEngine,
      recordingTimeoutMs: 10,
      completeResult: async () => {
        completeCalls += 1;
        return null;
      },
    }),
    (error) => (
      error?.code === SENTENCE_RECORDING_TIMEOUT_CODE
      && /重新开始/.test(error.message)
    ),
  );

  assert.equal(completeCalls, 0);
  assert.equal(destroyed, 1);
});
