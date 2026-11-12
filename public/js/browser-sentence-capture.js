export const BROWSER_SENTENCE_SOURCE = "browser-speech-teacher-review";
export const BROWSER_SENTENCE_AUTO_FINISH_MS = 1_800;

const CONTEXT_FIELDS = Object.freeze([
  "gameSessionId",
  "turnId",
  "learningPackId",
  "learningPackVersion",
  "taskId",
]);

function abortError() {
  return new DOMException("Cancelled", "AbortError");
}

function normalizedContext(value) {
  const context = {};
  for (const field of CONTEXT_FIELDS) {
    const item = String(value?.[field] || "").normalize("NFKC").trim();
    if (!item || item.length > 128) {
      throw new Error("当前朗读任务信息不完整");
    }
    context[field] = item;
  }
  return context;
}

function recognitionConstructor(scope) {
  return scope?.SpeechRecognition || scope?.webkitSpeechRecognition || null;
}

function recognitionErrorMessage(code) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "麦克风权限被拒绝，请在浏览器设置中允许后重试";
  }
  if (code === "audio-capture") {
    return "没有找到可用的麦克风，请检查设备后重试";
  }
  if (code === "network") {
    return "浏览器语音服务暂时无法连接，请稍后重试";
  }
  return "这次没有听清，请再读一次";
}

function transcriptFromResults(results) {
  const parts = [];
  for (let index = 0; index < Number(results?.length || 0); index += 1) {
    const alternative = results[index]?.[0];
    const transcript = String(alternative?.transcript || "").trim();
    if (transcript) parts.push(transcript);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function resultsContainFinal(results) {
  for (let index = 0; index < Number(results?.length || 0); index += 1) {
    if (results[index]?.isFinal === true) return true;
  }
  return false;
}

function teacherReviewResult(context, transcript, reason) {
  const hasTranscript = Boolean(transcript);
  return {
    ...context,
    source: BROWSER_SENTENCE_SOURCE,
    score: null,
    valid: false,
    transcript,
    result: hasTranscript ? "teacher_review" : "retry",
    completeUtterance: hasTranscript,
    primaryAccepted: false,
    reason: hasTranscript ? "browser_transcript_teacher_review" : reason,
  };
}

export function browserSentenceCaptureSupported(scope = globalThis) {
  return Boolean(recognitionConstructor(scope));
}

export class BrowserSentenceCapture {
  constructor({
    onState = () => {},
    onPreview = () => {},
    scope = globalThis,
    timeoutMs = 60_000,
    stopTimeoutMs = 2_000,
    autoFinishMs = BROWSER_SENTENCE_AUTO_FINISH_MS,
  } = {}) {
    this.onState = onState;
    this.onPreview = onPreview;
    this.scope = scope;
    this.timeoutMs = timeoutMs;
    this.stopTimeoutMs = stopTimeoutMs;
    this.autoFinishMs = autoFinishMs;
    this.recognition = null;
    this.cancelActive = null;
    this.stopActive = null;
    this.active = false;
    this.cancelled = false;
  }

  async assess(value) {
    if (this.active) throw new Error("上一轮浏览器语音识别还没有结束");
    const context = normalizedContext(value);
    const Recognition = recognitionConstructor(this.scope);
    if (!Recognition) {
      throw new Error("当前浏览器不支持语音识别，请使用最新版 Chrome");
    }

    this.active = true;
    this.cancelled = false;
    this.onState("requesting_permission");

    return new Promise((resolve, reject) => {
      let settled = false;
      let committedTranscript = "";
      let currentTranscript = "";
      let recordingTimer = null;
      let stopTimer = null;
      let autoFinishTimer = null;
      let finishRequested = false;
      const recognition = new Recognition();
      this.recognition = recognition;
      const completeTranscript = () => (
        [committedTranscript, currentTranscript]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      );

      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        if (recordingTimer !== null) this.scope.clearTimeout(recordingTimer);
        if (stopTimer !== null) this.scope.clearTimeout(stopTimer);
        if (autoFinishTimer !== null) this.scope.clearTimeout(autoFinishTimer);
        recordingTimer = null;
        stopTimer = null;
        autoFinishTimer = null;
        recognition.onstart = null;
        recognition.onspeechstart = null;
        recognition.onspeechend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        this.recognition = null;
        this.cancelActive = null;
        this.stopActive = null;
        this.active = false;
        if (error) reject(error);
        else resolve(result);
      };
      const clearAutoFinish = () => {
        if (autoFinishTimer === null) return;
        this.scope.clearTimeout(autoFinishTimer);
        autoFinishTimer = null;
      };
      const scheduleAutoFinish = () => {
        if (settled || finishRequested || !completeTranscript()) return;
        clearAutoFinish();
        autoFinishTimer = this.scope.setTimeout(() => {
          autoFinishTimer = null;
          this.stopActive?.();
        }, this.autoFinishMs);
      };
      this.cancelActive = () => finish(abortError());
      this.stopActive = () => {
        if (settled || finishRequested) return;
        finishRequested = true;
        clearAutoFinish();
        if (recordingTimer !== null) {
          this.scope.clearTimeout(recordingTimer);
          recordingTimer = null;
        }
        stopTimer = this.scope.setTimeout(() => {
          finish(null, teacherReviewResult(
            context,
            completeTranscript(),
            "browser_stop_timeout",
          ));
        }, this.stopTimeoutMs);
        try {
          recognition.stop();
        } catch (error) {
          // Do not turn a stale or already-ended recognition session into a
          // successful review without the matching post-stop `onend`.
          finish(error);
          return;
        }
        this.onState("scoring");
      };

      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if (this.cancelled) {
          finish(abortError());
          return;
        }
        this.onState("listening");
      };
      recognition.onspeechstart = () => {
        clearAutoFinish();
      };
      recognition.onspeechend = () => {
        scheduleAutoFinish();
      };
      recognition.onresult = (event) => {
        clearAutoFinish();
        currentTranscript = transcriptFromResults(event?.results);
        const transcript = completeTranscript();
        if (transcript) this.onPreview(transcript);
        if (transcript && resultsContainFinal(event?.results)) {
          scheduleAutoFinish();
        }
      };
      recognition.onerror = (event) => {
        const code = String(event?.error || "");
        if (this.cancelled || code === "aborted") {
          if (this.cancelled) finish(abortError());
          return;
        }
        if (code === "no-speech") {
          // Chrome normally follows this with `onend`; that handler restarts
          // the continuous listening window unless the teacher clicked stop.
          return;
        }
        finish(new Error(recognitionErrorMessage(code)));
      };
      recognition.onend = () => {
        if (this.cancelled) {
          finish(abortError());
          return;
        }
        if (finishRequested) {
          finish(null, teacherReviewResult(
            context,
            completeTranscript(),
            "browser_no_speech",
          ));
          return;
        }
        committedTranscript = completeTranscript();
        currentTranscript = "";
        const restart = () => {
          if (settled || this.cancelled || finishRequested) return;
          try {
            recognition.start();
          } catch (error) {
            finish(error);
          }
        };
        const enqueue = this.scope.queueMicrotask || globalThis.queueMicrotask;
        enqueue(restart);
      };

      recordingTimer = this.scope.setTimeout(() => {
        finish(null, teacherReviewResult(
          context,
          "",
          "browser_timeout",
        ));
        try {
          recognition.stop();
        } catch {
          // The browser may already have ended the recognition session.
        }
      }, this.timeoutMs);

      try {
        recognition.start();
      } catch (error) {
        finish(error);
      }
    });
  }

  stop() {
    this.stopActive?.();
  }

  destroy() {
    this.cancelled = true;
    const recognition = this.recognition;
    this.cancelActive?.();
    try {
      recognition?.abort();
    } catch {
      // The browser may already have released the microphone.
    }
    this.recognition = null;
    this.stopActive = null;
  }
}
