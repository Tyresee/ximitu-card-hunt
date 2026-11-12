import { api } from "./api.js";
import {
  createAliyunEngineSettings,
  createAssessmentTimeouts,
  createAttemptCompletion,
  createFinalResultGate,
  createRecordingReadinessGate,
  loadAliyunSdk,
} from "./pronunciation.js";

export const SENTENCE_ASSESSMENT_SOURCE = "aliyun-ssecp";
export const SENTENCE_ASSESSMENT_RESULT_CONTRACT =
  "voice-board-assessment-result.v3";
export const SENTENCE_RECORDING_INTERRUPTED_CODE = "sentence_recording_interrupted";
export const SENTENCE_RECORDING_TIMEOUT_CODE = "sentence_recording_timeout";
export const SENTENCE_SCORING_TIMEOUT_CODE = "sentence_scoring_timeout";
export const SENTENCE_KNOWLEDGE_DECISION_TIMEOUT_CODE =
  "sentence_knowledge_decision_timeout";
export const SENTENCE_RECORDING_TIMEOUT_MS = 60_000;
export const SENTENCE_SCORING_TIMEOUT_MS = 20_000;
export const SENTENCE_KNOWLEDGE_DECISION_TIMEOUT_MS = 6_000;
export const SENTENCE_AUTO_FINISH_SILENCE_MS = 1_800;
export const SENTENCE_AUTO_FINISH_START_VOLUME = 3;
export const SENTENCE_AUTO_FINISH_CONTINUE_VOLUME = 2;
export const SENTENCE_AUTO_FINISH_MIN_LOUD_SAMPLES = 2;

const CONTEXT_FIELDS = Object.freeze([
  "gameSessionId",
  "turnId",
  "learningPackId",
  "learningPackVersion",
  "taskId",
]);
const POLICY_COMPONENT_FIELDS = Object.freeze([
  "knowledgeCorrectness",
  "targetPronunciation",
  "sentencePronunciation",
  "fluency",
]);
const POLICY_PRONUNCIATION_COMPONENT_FIELDS = Object.freeze(
  POLICY_COMPONENT_FIELDS.slice(1),
);

function abortError() {
  return new DOMException("Cancelled", "AbortError");
}

function recordingTimeoutError() {
  return Object.assign(new Error("这次倾听时间到了，请重新开始并读完整句"), {
    code: SENTENCE_RECORDING_TIMEOUT_CODE,
  });
}

function recordingInterruptedError() {
  return Object.assign(new Error("录音意外中断，本次没有提交评分，请重新回答"), {
    code: SENTENCE_RECORDING_INTERRUPTED_CODE,
  });
}

function scoringTimeoutError() {
  return Object.assign(new Error("评分等待超时，本轮没有推进，请重新回答"), {
    code: SENTENCE_SCORING_TIMEOUT_CODE,
  });
}

function knowledgeListenerUnavailableError() {
  return Object.assign(
    new Error("知识点判断暂时不可用，本轮不会评分，请重新回答"),
    { code: "sentence_knowledge_listener_unavailable" },
  );
}

function knowledgeDecisionTimeoutError() {
  return Object.assign(
    new Error("知识点判断等待超时，本轮不会评分，请重新回答"),
    { code: SENTENCE_KNOWLEDGE_DECISION_TIMEOUT_CODE },
  );
}

function knowledgeListenerError(error) {
  if (error?.name === "AbortError") return error;
  return Object.assign(
    new Error("知识点判断意外中断，本轮不会评分，请重新回答"),
    {
      code: "sentence_knowledge_listener_failed",
      cause: error,
    },
  );
}

function createKnowledgeDecisionGate(timeoutMs) {
  let state = "pending";
  let value;
  let failure;
  const waiters = new Set();

  const settle = (nextState, nextValue) => {
    if (state !== "pending") return false;
    state = nextState;
    if (nextState === "resolved") value = nextValue;
    else failure = nextValue;
    for (const waiter of waiters) {
      globalThis.clearTimeout(waiter.timer);
      if (nextState === "resolved") waiter.resolve(nextValue);
      else waiter.reject(nextValue);
    }
    waiters.clear();
    return true;
  };

  return {
    resolve: (decision) => settle("resolved", decision),
    reject: (error) => settle("rejected", error),
    get resolved() {
      return state === "resolved";
    },
    get rejected() {
      return state === "rejected";
    },
    get failure() {
      return failure;
    },
    wait() {
      if (state === "resolved") return Promise.resolve(value);
      if (state === "rejected") return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          timer: globalThis.setTimeout(() => {
            waiters.delete(waiter);
            reject(knowledgeDecisionTimeoutError());
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
  };
}

function assessmentContext(value) {
  const normalized = {};
  for (const field of CONTEXT_FIELDS) {
    const item = String(value?.[field] || "").normalize("NFKC").trim();
    if (!item || item.length > 128) {
      throw new Error("当前朗读任务信息不完整");
    }
    normalized[field] = item;
  }
  return normalized;
}

function numericVolume(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    return Number(value.volume ?? value.value ?? value.data);
  }
  return Number(value);
}

function assertProviderStart(start, expectedContext) {
  if (
    start?.mode !== "aliyun"
    || start?.source !== SENTENCE_ASSESSMENT_SOURCE
    || !start?.attemptId
    || !start?.providerSession
    || !start?.assessment
  ) {
    throw new Error("声音评测暂时不可用");
  }
  for (const field of CONTEXT_FIELDS) {
    if (start[field] !== expectedContext[field]) {
      throw new Error("朗读任务已经更新，请重新开始这一轮");
    }
  }
  if (
    start.assessmentPolicy
    && start.resultContractVersion !== SENTENCE_ASSESSMENT_RESULT_CONTRACT
  ) {
    throw new Error("声音评测协议已经更新，请重新打开页面");
  }
}

function policyComponentScore(value) {
  return (
    typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 100
  );
}

function hasPolicyComponents(components, knowledgeCorrectness, {
  requireAllPronunciation = false,
  requireMissingPronunciation = false,
} = {}) {
  if (
    !components
    || typeof components !== "object"
    || Array.isArray(components)
  ) {
    return false;
  }
  for (const field of POLICY_COMPONENT_FIELDS) {
    if (!Object.hasOwn(components, field)) return false;
  }
  if (components.knowledgeCorrectness !== knowledgeCorrectness) return false;
  const pronunciation = POLICY_PRONUNCIATION_COMPONENT_FIELDS.map(
    (field) => components[field],
  );
  if (!pronunciation.every(
    (value) => value === null || policyComponentScore(value),
  )) {
    return false;
  }
  if (
    requireAllPronunciation
    && !pronunciation.every(policyComponentScore)
  ) {
    return false;
  }
  if (
    requireMissingPronunciation
    && !pronunciation.some((value) => value === null)
  ) {
    return false;
  }
  return true;
}

function assertPolicyAssessmentResult(result) {
  const invalid = () => {
    throw new Error("声音评测结果无效");
  };
  if (
    result?.resultContractVersion
      !== SENTENCE_ASSESSMENT_RESULT_CONTRACT
  ) {
    throw new Error("声音评测结果协议无效");
  }

  if (result.result === "accepted" && result.knowledgeStatus === "correct") {
    if (
      result.valid !== true
      || result.primaryAccepted !== true
      || result.scoringOutcome !== "accepted"
      || !policyComponentScore(result.score)
      || !hasPolicyComponents(result.components, 100, {
        requireAllPronunciation: true,
      })
    ) invalid();
    return result;
  }

  if (result.result === "accepted" && result.knowledgeStatus === "wrong") {
    if (
      result.valid !== true
      || result.primaryAccepted !== false
      || result.scoringOutcome !== "score_low"
      || result.score !== 45
      || !hasPolicyComponents(result.components, 0)
    ) invalid();
    return result;
  }

  if (result.result === "teacher_review") {
    if (
      result.valid !== true
      || result.knowledgeStatus !== "uncertain"
      || result.primaryAccepted !== false
      || result.scoringOutcome !== "teacher_review"
      || result.score !== null
      || !hasPolicyComponents(result.components, null)
    ) invalid();
    return result;
  }

  if (
    result.result === "retry"
    && ["uncertain", "correct"].includes(result.knowledgeStatus)
  ) {
    const knowledgeCorrectness = result.knowledgeStatus === "correct"
      ? 100
      : null;
    if (
      result.valid !== false
      || result.primaryAccepted !== false
      || result.scoringOutcome !== "retry"
      || result.score !== null
      || !hasPolicyComponents(
        result.components,
        knowledgeCorrectness,
        {
          requireMissingPronunciation:
            result.knowledgeStatus === "correct",
        },
      )
    ) invalid();
    return result;
  }

  return invalid();
}

function assertAssessmentResult(result, start, expectedContext) {
  if (result?.attemptId !== start.attemptId) {
    throw new Error("声音评测结果不属于当前回答");
  }
  for (const field of CONTEXT_FIELDS) {
    if (
      result[field] !== start[field]
      || result[field] !== expectedContext[field]
    ) {
      throw new Error("声音评测结果与当前朗读任务不一致");
    }
  }
  if (result?.source !== SENTENCE_ASSESSMENT_SOURCE) {
    throw new Error("声音评测结果来源无效");
  }
  if (start.assessmentPolicy) {
    return assertPolicyAssessmentResult(result);
  }
  if (["accepted", "retry", "teacher_review"].includes(result.result)) {
    if (result.result === "accepted") {
      if (
        result.valid !== true
        || typeof result.score !== "number"
        || !Number.isFinite(result.score)
        || result.score < 0
        || result.score > 100
      ) {
        throw new Error("声音评测结果无效");
      }
      return result;
    }
    if (result.score !== null) {
      throw new Error("声音评测结果无效");
    }
    return result;
  }
  if (result.valid === false && result.score === null) return result;
  if (
    result.valid !== true
    || typeof result.score !== "number"
    || !Number.isFinite(result.score)
    || result.score < 0
    || result.score > 100
  ) {
    throw new Error("声音评测结果无效");
  }
  return result;
}

export async function runSentenceAssessmentSdk({
  start,
  onState = () => {},
  onPreview = () => {},
  completeResult,
  registerControls = () => {},
  isCancelled = () => false,
  loadSdk = loadAliyunSdk,
  recordingTimeoutMs = SENTENCE_RECORDING_TIMEOUT_MS,
  scoringTimeoutMs = SENTENCE_SCORING_TIMEOUT_MS,
  autoFinishSilenceMs = SENTENCE_AUTO_FINISH_SILENCE_MS,
  autoFinishStartVolume = SENTENCE_AUTO_FINISH_START_VOLUME,
  autoFinishContinueVolume = SENTENCE_AUTO_FINISH_CONTINUE_VOLUME,
  autoFinishMinLoudSamples = SENTENCE_AUTO_FINISH_MIN_LOUD_SAMPLES,
} = {}) {
  const provider = start?.providerSession;
  if (
    !provider?.engineSrc
    || !provider.applicationId
    || !provider.userId
    || !provider.warrantId
    || typeof completeResult !== "function"
  ) {
    throw new Error("声音评测会话不完整");
  }

  const EngineEvaluat = await loadSdk(provider.engineSrc);
  if (isCancelled()) throw abortError();

  return new Promise((resolve, reject) => {
    let recordingStarted = false;
    let finishRequested = false;
    let scoringStarted = false;
    let recordingStopIssued = false;
    let providerFinalAccepted = false;
    let engineInstance = null;
    let timeouts = null;
    let scoringTimer = null;
    let autoFinishTimer = null;
    let loudSamples = 0;
    let previewShown = false;
    let speechDetected = false;
    const finalResult = createFinalResultGate();

    const clearAutoFinishTimer = () => {
      if (autoFinishTimer === null) return;
      window.clearTimeout(autoFinishTimer);
      autoFinishTimer = null;
    };
    const showPreview = () => {
      if (previewShown) return;
      previewShown = true;
      onPreview();
    };
    const completion = createAttemptCompletion((error, result) => {
      timeouts?.clear();
      if (scoringTimer !== null) {
        window.clearTimeout(scoringTimer);
        scoringTimer = null;
      }
      clearAutoFinishTimer();
      try {
        engineInstance?.destroyEngine?.();
      } catch {
        // The SDK may already have closed itself after its final callback.
      }
      engineInstance = null;
      registerControls(null);
      if (error) reject(error);
      else resolve(result);
    });
    const finish = completion.finish;
    const prepareScoring = () => {
      if (completion.finished || finishRequested || !recordingStarted) return false;
      finishRequested = true;
      timeouts?.clear();
      clearAutoFinishTimer();
      return true;
    };
    const announceScoring = () => {
      if (completion.finished || scoringStarted) return false;
      scoringStarted = true;
      onState("scoring");
      if (completion.finished) return true;
      scoringTimer = window.setTimeout(
        () => finish(scoringTimeoutError()),
        scoringTimeoutMs,
      );
      return true;
    };
    const stopRecordingOnce = () => {
      if (completion.finished || recordingStopIssued || !recordingStarted) {
        return false;
      }
      recordingStopIssued = true;
      engineInstance?.stopRecord?.();
      return true;
    };
    const releaseEngineAfterFinal = () => new Promise((released) => {
      const completedEngine = engineInstance;
      engineInstance = null;
      window.queueMicrotask(() => {
        try {
          completedEngine?.destroyEngine?.();
        } catch {
          // A final provider result already owns settlement; teardown is best-effort.
        } finally {
          released();
        }
      });
    });
    const failBeforeProviderFinal = (error) => {
      if (providerFinalAccepted || completion.finished) return;
      finish(error);
    };
    const controls = {
      stop() {
        if (completion.finished || recordingStopIssued) return false;
        if (!recordingStarted) {
          finish(recordingInterruptedError());
          return false;
        }
        if (!prepareScoring()) {
          finish(recordingInterruptedError());
          return false;
        }
        try {
          stopRecordingOnce();
        } catch (error) {
          if (!providerFinalAccepted) {
            finish(error);
            return false;
          }
        }
        if (!providerFinalAccepted) announceScoring();
        return true;
      },
      destroy() {
        clearAutoFinishTimer();
        completion.cancel();
      },
      fail(error) {
        finish(error instanceof Error ? error : knowledgeListenerError(error));
      },
    };
    const scheduleAutoFinish = () => {
      if (
        completion.finished
        || finishRequested
        || recordingStopIssued
        || !recordingStarted
        || !speechDetected
      ) {
        return;
      }
      clearAutoFinishTimer();
      autoFinishTimer = window.setTimeout(() => {
        autoFinishTimer = null;
        controls.stop();
      }, autoFinishSilenceMs);
    };
    registerControls(controls);
    if (completion.finished) return;

    const startRecording = () => {
      if (
        recordingStarted
        || completion.finished
        || isCancelled()
      ) return;
      recordingStarted = true;
      onState("listening");
      timeouts.startRecording();
      try {
        engineInstance.startRecord({
          ...start.assessment,
          warrantId: provider.warrantId,
        });
      } catch (error) {
        finish(error);
      }
    };
    const readiness = createRecordingReadinessGate(startRecording);
    timeouts = createAssessmentTimeouts({
      onTimeout: (phase) => finish(
        phase === "preparation"
          ? new Error("麦克风准备超时，请重新允许后再试")
          : recordingTimeoutError(),
      ),
      assessmentMs: recordingTimeoutMs,
    });

    try {
      engineInstance = new EngineEvaluat({
        applicationId: provider.applicationId,
        userId: provider.userId,
        warrantId: provider.warrantId,
        ...createAliyunEngineSettings(start.assessment.coreType),
        intermission: SENTENCE_RECORDING_TIMEOUT_MS,
        micAllowCallback: () => {
          if (completion.finished || isCancelled()) {
            window.queueMicrotask(() => engineInstance?.destroyEngine?.());
            return;
          }
          readiness.markMicrophoneReady();
        },
        micForbidCallback: () => failBeforeProviderFinal(
          new Error("麦克风权限被拒绝，请在浏览器设置中允许后重试"),
        ),
        engineFirstInitDone: () => window.queueMicrotask(
          () => readiness.markEngineReady(),
        ),
        engineBackResultDone: async (rawResult, isFinal) => {
          if (completion.finished || !isFinal) return;
          if (!speechDetected) {
            finish(recordingInterruptedError());
            return;
          }
          if (!finalResult.accept(isFinal)) return;
          providerFinalAccepted = true;
          prepareScoring();
          try {
            stopRecordingOnce();
          } catch {
            // A valid final result must not be replaced by an already-stopped SDK error.
          }
          await releaseEngineAfterFinal();
          announceScoring();
          try {
            finish(null, await completeResult(rawResult));
          } catch (error) {
            finish(error);
          }
        },
        engineBackResultFail: () => failBeforeProviderFinal(
          finishRequested
            ? new Error("这次没有听清，请再读一次")
            : recordingInterruptedError(),
        ),
        JSSDKNotSupport: () => failBeforeProviderFinal(
          new Error("当前浏览器不支持声音评测，请使用最新版 Chrome"),
        ),
        noNetwork: () => failBeforeProviderFinal(
          new Error("网络断开了，请恢复网络后再试"),
        ),
        micVolumeCallback: (value) => {
          if (
            completion.finished
            || finishRequested
            || recordingStopIssued
            || isCancelled()
          ) return;
          const volume = numericVolume(value);
          if (!Number.isFinite(volume)) return;
          if (!speechDetected) {
            loudSamples = volume >= autoFinishStartVolume
              ? loudSamples + 1
              : 0;
            if (loudSamples >= autoFinishMinLoudSamples) {
              speechDetected = true;
              showPreview();
            }
          }
          if (speechDetected && volume >= autoFinishContinueVolume) {
            scheduleAutoFinish();
          }
        },
      });
      if (completion.finished || isCancelled()) {
        engineInstance?.destroyEngine?.();
        if (!completion.finished) finish(abortError());
      }
    } catch (error) {
      finish(error);
    }
  });
}

export class SentenceAssessmentClient {
  constructor({
    onState = () => {},
    onPreview = () => {},
    apiClient = api,
    runAssessment = runSentenceAssessmentSdk,
    createKnowledgeListener = null,
    knowledgeDecisionTimeoutMs = SENTENCE_KNOWLEDGE_DECISION_TIMEOUT_MS,
  } = {}) {
    this.onState = onState;
    this.onPreview = onPreview;
    this.apiClient = apiClient;
    this.runAssessment = runAssessment;
    this.createKnowledgeListener = createKnowledgeListener;
    this.knowledgeDecisionTimeoutMs = knowledgeDecisionTimeoutMs;
    this.controls = null;
    this.cleanupKnowledgeListener = null;
    this.cancelKnowledgeDecision = null;
    this.active = false;
    this.cancelled = false;
  }

  async assess(context) {
    if (this.active) throw new Error("上一轮声音评测还没有结束");
    const expectedContext = assessmentContext(context);
    this.active = true;
    this.cancelled = false;
    this.onState("requesting_permission");

    let cleanupKnowledgeListener = () => {};
    let knowledgeDecisionGate = null;
    let deferredScoringState = false;
    try {
      const start = await this.apiClient.startVoiceBoardAssessment(
        expectedContext,
      );
      if (this.cancelled) throw abortError();
      assertProviderStart(start, expectedContext);
      if (start.assessmentPolicy) {
        if (typeof this.createKnowledgeListener !== "function") {
          throw knowledgeListenerUnavailableError();
        }
        knowledgeDecisionGate = createKnowledgeDecisionGate(
          this.knowledgeDecisionTimeoutMs,
        );
        let knowledgeListener;
        let knowledgeListenerDestroyed = false;
        cleanupKnowledgeListener = () => {
          if (knowledgeListenerDestroyed) return;
          knowledgeListenerDestroyed = true;
          try {
            const cleanup = knowledgeListener?.destroy?.();
            cleanup?.catch?.(() => {});
          } catch {
            // Cleanup must never turn an already-safe failed attempt into a score.
          }
        };
        this.cleanupKnowledgeListener = cleanupKnowledgeListener;
        this.cancelKnowledgeDecision = () => {
          knowledgeDecisionGate?.reject(abortError());
        };
        const listenerContext = {
          attemptId: start.attemptId,
          gameSessionId: start.gameSessionId,
          turnId: start.turnId,
          learningPackId: start.learningPackId,
          learningPackVersion: start.learningPackVersion,
          taskId: start.taskId,
        };
        const stopAssessment = () => {
          this.controls?.stop?.();
        };
        try {
          knowledgeListener = this.createKnowledgeListener({
            start,
            context: listenerContext,
            ...listenerContext,
            assessmentPolicy: start.assessmentPolicy,
            onTranscript: (payload) => {
              const transcript = typeof payload === "string"
                ? payload
                : typeof payload?.transcript === "string"
                  ? payload.transcript
                  : "";
              try {
                this.onPreview(transcript);
              } catch {
                // A visual preview must not interrupt either evidence stream.
              }
            },
            onDecision: (decision) => {
              if (!knowledgeDecisionGate.resolve(decision)) return;
              stopAssessment();
              if (deferredScoringState) {
                deferredScoringState = false;
                this.onState("scoring");
              }
            },
            onError: (error) => {
              const failure = knowledgeListenerError(error);
              if (!knowledgeDecisionGate.reject(failure)) return;
              if (typeof this.controls?.fail === "function") {
                this.controls.fail(failure);
              } else {
                this.controls?.destroy?.();
              }
            },
          });
        } catch (error) {
          throw knowledgeListenerError(error);
        }
        if (
          !knowledgeListener
          || typeof knowledgeListener.start !== "function"
          || typeof knowledgeListener.destroy !== "function"
        ) {
          throw knowledgeListenerUnavailableError();
        }
        try {
          await knowledgeListener.start();
        } catch (error) {
          knowledgeDecisionGate.reject(knowledgeListenerError(error));
          throw knowledgeListenerError(error);
        }
        if (this.cancelled) throw abortError();
        if (knowledgeDecisionGate.rejected) {
          await knowledgeDecisionGate.wait();
        }
      }
      const result = await this.runAssessment({
        start,
        onState: (state) => {
          if (
            state === "scoring"
            && knowledgeDecisionGate
            && !knowledgeDecisionGate.resolved
          ) {
            deferredScoringState = true;
            return;
          }
          this.onState(state);
        },
        onPreview: this.onPreview,
        isCancelled: () => this.cancelled,
        registerControls: (controls) => {
          this.controls = controls;
          if (controls && knowledgeDecisionGate?.resolved) {
            controls.stop?.();
          }
          if (controls && knowledgeDecisionGate?.rejected) {
            if (typeof controls.fail === "function") {
              controls.fail(knowledgeDecisionGate.failure);
            } else {
              controls.destroy?.();
            }
          }
        },
        completeResult: async (rawResult) => {
          if (knowledgeDecisionGate) {
            await knowledgeDecisionGate.wait();
          }
          return this.apiClient.completeVoiceBoardAssessment({
            attemptId: start.attemptId,
            gameSessionId: start.gameSessionId,
            turnId: start.turnId,
            learningPackId: start.learningPackId,
            learningPackVersion: start.learningPackVersion,
            taskId: start.taskId,
            resultContractVersion: SENTENCE_ASSESSMENT_RESULT_CONTRACT,
            result: rawResult,
          });
        },
      });
      if (knowledgeDecisionGate) {
        await knowledgeDecisionGate.wait();
      }
      return assertAssessmentResult(result, start, expectedContext);
    } finally {
      deferredScoringState = false;
      cleanupKnowledgeListener();
      if (this.cleanupKnowledgeListener === cleanupKnowledgeListener) {
        this.cleanupKnowledgeListener = null;
      }
      this.cancelKnowledgeDecision = null;
      this.controls = null;
      this.active = false;
    }
  }

  stop() {
    return this.controls?.stop?.() ?? false;
  }

  destroy() {
    this.cancelled = true;
    this.cancelKnowledgeDecision?.();
    this.cancelKnowledgeDecision = null;
    this.cleanupKnowledgeListener?.();
    this.cleanupKnowledgeListener = null;
    this.controls?.destroy?.();
    this.controls = null;
  }
}
