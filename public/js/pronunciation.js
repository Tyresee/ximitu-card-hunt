
const SDK_LOAD_TIMEOUT_MS = 8_000;
const PREPARATION_TIMEOUT_MS = 30_000;
const ASSESSMENT_TIMEOUT_MS = 14_000;
let sdkPromise = null;
let activeStandardAudio = null;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function loadAliyunSdk(src) {
  if (typeof window.EngineEvaluat === "function") return Promise.resolve(window.EngineEvaluat);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-aliyun-evaluation-sdk="${CSS.escape(src)}"]`);
    const script = existing || document.createElement("script");
    const timeout = window.setTimeout(() => {
      sdkPromise = null;
      reject(new Error("语音评测组件加载超时"));
    }, SDK_LOAD_TIMEOUT_MS);

    const done = () => {
      window.clearTimeout(timeout);
      if (typeof window.EngineEvaluat === "function") resolve(window.EngineEvaluat);
      else reject(new Error("语音评测组件不可用"));
    };
    const failed = () => {
      window.clearTimeout(timeout);
      sdkPromise = null;
      reject(new Error("语音评测组件加载失败"));
    };

    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.aliyunEvaluationSdk = src;
      document.head.append(script);
    }
  });
  return sdkPromise;
}

function numericVolume(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") return Number(value.volume ?? value.value ?? value.data);
  return Number(value);
}

export function createRecordingReadinessGate(onReady) {
  let engineReady = false;
  let microphoneReady = false;
  let started = false;

  const flush = () => {
    if (started || !engineReady || !microphoneReady) return;
    started = true;
    onReady();
  };

  return {
    markEngineReady() {
      engineReady = true;
      flush();
    },
    markMicrophoneReady() {
      microphoneReady = true;
      flush();
    },
  };
}

export function createFinalResultGate() {
  let accepted = false;
  return {
    accept(isFinal) {
      if (accepted || isFinal !== true) return false;
      accepted = true;
      return true;
    },
  };
}

export function createAssessmentTimeouts({
  onTimeout,
  schedule = (callback, ms) => window.setTimeout(callback, ms),
  cancel = (timer) => window.clearTimeout(timer),
  preparationMs = PREPARATION_TIMEOUT_MS,
  assessmentMs = ASSESSMENT_TIMEOUT_MS,
}) {
  let timer = schedule(() => onTimeout("preparation"), preparationMs);

  const clear = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };

  return {
    startRecording() {
      clear();
      timer = schedule(() => onTimeout("assessment"), assessmentMs);
    },
    clear,
  };
}

export function createAliyunEngineSettings(coreType) {
  if (typeof coreType !== "string" || !coreType) throw new Error("语音评测题型无效");
  return {
    coreType,
    logIsOpen: false,
    autoConnect: false,
    serverTimeout: 10_000,
    intermission: 5_000,
  };
}

export function createAttemptCompletion(onFinish) {
  let finished = false;
  const finish = (error = null, result) => {
    if (finished) return false;
    finished = true;
    onFinish(error, result);
    return true;
  };
  return {
    finish,
    cancel: () => finish(new DOMException("Cancelled", "AbortError")),
    get finished() {
      return finished;
    },
  };
}
