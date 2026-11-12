const RECONNECT_DELAYS_MS = Object.freeze([250, 500, 1_000, 2_000]);
const CONNECT_TIMEOUT_MS = 12_000;
// Same-word burst capacity; this is not a cap on projectiles already in flight.
const MAX_OCCURRENCES_PER_ENTRY = 4;
const MAX_OCCURRENCES_PER_RESULT = 8;
const OCCURRENCE_REFILL_MS = 500;

function normalizeSpeechText(value) {
  if (value === null || value === undefined) return "";
  const normalized = String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/[\u2010-\u2015-]+/g, " ");
  return (normalized.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || []).join(" ");
}

function configuredCandidates(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, entryIndex) => {
      const normalized = normalizeSpeechText(entry?.word || entry?.displayText || "");
      return { entry, entryIndex, normalized, tokens: normalized ? normalized.split(" ") : [] };
    })
    .filter(({ tokens }) => tokens.length > 0)
    .sort((left, right) => right.tokens.length - left.tokens.length || left.entryIndex - right.entryIndex);
}

export function matchBailianOccurrences(transcript, entries) {
  const normalizedTranscript = normalizeSpeechText(transcript);
  if (!normalizedTranscript) return [];
  const transcriptTokens = normalizedTranscript.split(" ");
  const candidates = configuredCandidates(entries);
  const matches = [];

  for (let tokenIndex = 0; tokenIndex < transcriptTokens.length;) {
    const candidate = candidates.find(({ tokens }) => tokens.every((token, offset) => transcriptTokens[tokenIndex + offset] === token));
    if (!candidate) {
      tokenIndex += 1;
      continue;
    }
    const tokenEndIndex = tokenIndex + candidate.tokens.length;
    matches.push({
      entry: candidate.entry,
      entryId: candidate.entry.id,
      word: candidate.entry.word,
      normalizedWord: candidate.normalized,
      entryIndex: candidate.entryIndex,
      occurrenceIndex: matches.length,
      tokenIndex,
      tokenEndIndex,
    });
    tokenIndex = tokenEndIndex;
  }
  return matches;
}

function limitBailianBurst(matches, bucketState, nowMs = Date.now()) {
  const accepted = [];
  for (const match of matches) {
    const key = match.entryId;
    const previous = bucketState.get(key) || { tokens: MAX_OCCURRENCES_PER_ENTRY, updatedAt: nowMs };
    const elapsed = Math.max(0, nowMs - previous.updatedAt);
    const refillCount = Math.floor(elapsed / OCCURRENCE_REFILL_MS);
    const tokens = Math.min(MAX_OCCURRENCES_PER_ENTRY, previous.tokens + refillCount);
    const updatedAt = refillCount > 0 ? previous.updatedAt + refillCount * OCCURRENCE_REFILL_MS : previous.updatedAt;
    if (accepted.length >= MAX_OCCURRENCES_PER_RESULT || tokens < 1) {
      bucketState.set(key, { tokens, updatedAt });
      continue;
    }
    bucketState.set(key, { tokens: tokens - 1, updatedAt });
    accepted.push(match);
  }
  return { matches: accepted, suppressedCount: matches.length - accepted.length };
}

function listenerError(message, code = "asr_unavailable", cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function safelyCall(callback, ...args) {
  try {
    callback(...args);
  } catch {
    // Rendering callbacks must not break the microphone or WebSocket lifecycle.
  }
}

function defaultWebSocketUrl(path = "/ws/asr") {
  const scheme = globalThis.location?.protocol === "https:" ? "wss:" : "ws:";
  const host = globalThis.location?.host || "127.0.0.1:19321";
  return `${scheme}//${host}${path}`;
}

export class BailianWordListener {
  constructor({
    entries,
    onState = () => {},
    onTranscript = () => {},
    onMatches = () => {},
    onError = () => {},
    WebSocketCtor,
    mediaDevices,
    AudioContextCtor,
    AudioWorkletNodeCtor,
    socketUrl,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
    startMessageFactory = null,
    onMessage = null,
  } = {}) {
    this.entries = Array.isArray(entries) ? [...entries] : [];
    this.onState = onState;
    this.onTranscript = onTranscript;
    this.onMatches = onMatches;
    this.onError = onError;
    this.WebSocketCtor = WebSocketCtor || globalThis.WebSocket || null;
    this.mediaDevices = mediaDevices || globalThis.navigator?.mediaDevices || null;
    this.AudioContextCtor = AudioContextCtor || globalThis.AudioContext || globalThis.webkitAudioContext || null;
    this.AudioWorkletNodeCtor = AudioWorkletNodeCtor || globalThis.AudioWorkletNode || null;
    this.socketUrl = socketUrl || defaultWebSocketUrl();
    this.connectTimeoutMs = connectTimeoutMs;
    this.startMessageFactory = typeof startMessageFactory === "function"
      ? startMessageFactory
      : null;
    this.onMessage = typeof onMessage === "function" ? onMessage : null;

    this.stream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.captureNode = null;
    this.socket = null;
    this.connectTimer = null;
    this.restartTimer = null;
    this.restartAttempt = 0;
    this.generation = 0;
    this.providerReady = false;
    this.wantsListening = false;
    this.paused = false;
    this.destroyed = false;
    this.pendingConnect = null;
    this.occurrenceBuckets = new Map();
    this.finalResults = new Set();
    this.lastError = null;
  }

  async start() {
    if (this.destroyed) throw listenerError("百炼实时识别器已经销毁", "asr_destroyed");
    if (this.wantsListening && (this.providerReady || this.pendingConnect)) return this.pendingConnect;
    if (!this.WebSocketCtor || !this.mediaDevices?.getUserMedia || !this.AudioContextCtor || !this.AudioWorkletNodeCtor) {
      throw listenerError("当前浏览器无法开启百炼麦克风识别", "asr_browser_unsupported");
    }

    this.wantsListening = true;
    this.paused = false;
    this.restartAttempt = 0;
    this.generation += 1;
    const generation = this.generation;

    try {
      await this.#prepareMicrophone();
      if (!this.wantsListening || this.destroyed || generation !== this.generation) return;
      return await this.#connect(generation);
    } catch (cause) {
      const error = cause?.code ? cause : this.#microphoneError(cause);
      this.wantsListening = false;
      await this.#releaseMicrophone();
      if (this.lastError !== error) {
        this.#state("error", { error });
        this.#error(error);
      }
      throw error;
    }
  }

  stop() {
    if (this.destroyed) return;
    this.wantsListening = false;
    this.paused = false;
    this.#resetSession();
    void this.#releaseMicrophone();
    this.#state("stopped");
  }

  pause() {
    if (this.destroyed || this.paused) return;
    this.wantsListening = false;
    this.paused = true;
    this.#resetSession();
    void this.#releaseMicrophone();
    this.#state("paused");
  }

  async resume() {
    if (this.destroyed) throw listenerError("百炼实时识别器已经销毁", "asr_destroyed");
    if (!this.paused && this.wantsListening) return this.pendingConnect;
    this.paused = false;
    return this.start();
  }

  destroy() {
    if (this.destroyed) return;
    this.wantsListening = false;
    this.paused = false;
    this.destroyed = true;
    this.#resetSession();
    void this.#releaseMicrophone();
  }

  async #prepareMicrophone() {
    if (this.stream && this.audioContext && this.captureNode) return;
    this.#state("requesting_permission");
    this.stream = await this.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    this.audioContext = new this.AudioContextCtor({ latencyHint: "interactive" });
    if (!this.audioContext.audioWorklet?.addModule) {
      throw listenerError("当前浏览器不支持实时音频处理", "asr_audio_worklet_unavailable");
    }
    await this.audioContext.audioWorklet.addModule("/js/pcm16-worklet.js");
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.captureNode = new this.AudioWorkletNodeCtor(this.audioContext, "pcm16-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });
    this.captureNode.port.onmessage = (event) => {
      if (!this.providerReady || this.socket?.readyState !== this.WebSocketCtor.OPEN) return;
      if (event.data instanceof ArrayBuffer) this.socket.send(event.data);
    };
    this.sourceNode.connect(this.captureNode);
    await this.audioContext.resume();
  }

  #connect(generation) {
    this.#clearConnectTimer();
    this.providerReady = false;
    this.#state(this.restartAttempt > 0 ? "restarting" : "connecting");

    const socket = new this.WebSocketCtor(this.socketUrl);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    this.pendingConnect = new Promise((resolve, reject) => {
      let settled = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        this.pendingConnect = null;
        this.#clearConnectTimer();
        callback(value);
      };

      this.connectTimer = globalThis.setTimeout(() => {
        const error = listenerError("连接百炼实时识别超时", "asr_connect_timeout");
        settle(reject, error);
        this.#fail(error);
      }, this.connectTimeoutMs);

      socket.onopen = () => {
        if (!this.wantsListening || this.destroyed || generation !== this.generation) return;
        let startMessage;
        try {
          startMessage = this.startMessageFactory
            ? this.startMessageFactory()
            : {
                type: "start",
                words: this.entries.map((entry) => ({
                  id: entry.id,
                  word: entry.word || entry.displayText,
                })),
              };
        } catch (cause) {
          const error = listenerError(
            "当前语音任务无法启动",
            "asr_start_payload_invalid",
            cause,
          );
          settle(reject, error);
          this.#fail(error);
          return;
        }
        socket.send(JSON.stringify(startMessage));
      };

      socket.onmessage = (event) => {
        if (!this.wantsListening || this.destroyed || generation !== this.generation) return;
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (this.onMessage) {
          let handled = false;
          try {
            handled = this.onMessage(message) === true;
          } catch {
            // Protocol extensions are isolated from the audio lifecycle.
          }
          if (handled) return;
        }
        if (message.type === "ready") {
          this.providerReady = true;
          this.restartAttempt = 0;
          this.#state("listening", { provider: "bailian", model: message.model });
          settle(resolve);
        } else if (message.type === "transcript") {
          this.#handleTranscript(message);
        } else if (message.type === "error") {
          const error = listenerError(message.message || "百炼实时识别暂时不可用", message.code || "asr_provider_failed");
          settle(reject, error);
          this.#fail(error);
        }
      };

      socket.onerror = () => {
        // The close event owns reconnect/error handling so one outage emits once.
      };

      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        this.providerReady = false;
        if (!this.wantsListening || this.destroyed || generation !== this.generation) return;
        if (!settled) {
          const error = listenerError("无法建立百炼实时识别连接", "asr_connection_failed");
          settle(reject, error);
          this.#fail(error);
        } else {
          this.#scheduleReconnect(generation);
        }
      };
    });
    return this.pendingConnect;
  }

  #handleTranscript(message) {
    const transcript = typeof message.transcript === "string" ? message.transcript : "";
    const isFinal = message.isFinal === true;
    let matches = matchBailianOccurrences(transcript, this.entries);
    let burstLimited = false;

    if (isFinal) {
      const finalKey = message.sentenceId === null || message.sentenceId === undefined
        ? `${transcript}:${this.finalResults.size}`
        : `sentence:${message.sentenceId}`;
      if (this.finalResults.has(finalKey)) return;
      this.finalResults.add(finalKey);
      if (this.finalResults.size > 50) this.finalResults.delete(this.finalResults.values().next().value);
      const limited = limitBailianBurst(matches, this.occurrenceBuckets);
      matches = limited.matches;
      burstLimited = limited.suppressedCount > 0;
    }

    const payload = { transcript, isFinal, matches, burstLimited, provider: "bailian" };
    safelyCall(this.onTranscript, payload);
    if (isFinal) safelyCall(this.onMatches, matches, payload);
  }

  #scheduleReconnect(generation) {
    if (this.restartAttempt >= RECONNECT_DELAYS_MS.length) {
      return this.#fail(listenerError("百炼识别连接多次中断，请重新开启麦克风", "asr_restart_exhausted"));
    }
    const delay = RECONNECT_DELAYS_MS[this.restartAttempt];
    this.restartAttempt += 1;
    this.#state("restarting", { attempt: this.restartAttempt, delay });
    this.restartTimer = globalThis.setTimeout(() => {
      this.restartTimer = null;
      if (!this.wantsListening || this.destroyed || generation !== this.generation) return;
      void this.#connect(generation).catch(() => {});
    }, delay);
  }

  #fail(error) {
    if (!this.wantsListening) return;
    this.lastError = error;
    this.wantsListening = false;
    this.providerReady = false;
    this.#clearRestartTimer();
    this.#closeSocket();
    void this.#releaseMicrophone();
    this.#state("error", { error });
    this.#error(error);
  }

  #microphoneError(cause) {
    const denied = cause?.name === "NotAllowedError" || cause?.name === "SecurityError";
    return listenerError(
      denied ? "麦克风权限未开启，请允许后重试" : "无法读取麦克风音频",
      denied ? "asr_not_allowed" : "asr_audio_capture",
      cause,
    );
  }

  #resetSession() {
    this.generation += 1;
    this.providerReady = false;
    this.pendingConnect = null;
    this.occurrenceBuckets.clear();
    this.finalResults.clear();
    this.lastError = null;
    this.#clearConnectTimer();
    this.#clearRestartTimer();
    this.#closeSocket();
  }

  #closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === this.WebSocketCtor.OPEN || socket.readyState === this.WebSocketCtor.CONNECTING) socket.close(1000, "client stopped");
  }

  async #releaseMicrophone() {
    if (this.captureNode) {
      this.captureNode.port.onmessage = null;
      this.captureNode.disconnect();
    }
    this.sourceNode?.disconnect();
    this.stream?.getTracks?.().forEach((track) => track.stop());
    const audioContext = this.audioContext;
    this.captureNode = null;
    this.sourceNode = null;
    this.stream = null;
    this.audioContext = null;
    if (audioContext && audioContext.state !== "closed") {
      try {
        await audioContext.close();
      } catch {
        // The browser may already be tearing down the audio graph.
      }
    }
  }

  #clearConnectTimer() {
    if (this.connectTimer !== null) globalThis.clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  #clearRestartTimer() {
    if (this.restartTimer !== null) globalThis.clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  #state(state, detail = {}) {
    safelyCall(this.onState, state, detail);
  }

  #error(error) {
    safelyCall(this.onError, error);
  }
}

export class BailianSentenceListener {
  constructor({
    gameSessionId,
    turnId,
    attemptId,
    learningPackId,
    learningPackVersion,
    taskId,
    onState = () => {},
    onTranscript = () => {},
    onDecision = () => {},
    onError = () => {},
    WebSocketCtor,
    mediaDevices,
    AudioContextCtor,
    AudioWorkletNodeCtor,
    socketUrl,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
  } = {}) {
    this.context = {
      gameSessionId,
      turnId,
      attemptId,
      learningPackId,
      learningPackVersion,
      taskId,
    };
    this.onTranscript = onTranscript;
    this.onDecision = onDecision;
    this.processedDecisionIds = new Set();
    this.listener = new BailianWordListener({
      entries: [],
      onState,
      onError,
      WebSocketCtor,
      mediaDevices,
      AudioContextCtor,
      AudioWorkletNodeCtor,
      socketUrl: socketUrl || defaultWebSocketUrl("/ws/voice-board-asr"),
      connectTimeoutMs,
      startMessageFactory: () => ({
        type: "start",
        ...this.context,
      }),
      onMessage: (message) => this.#handleMessage(message),
    });
  }

  start() {
    return this.listener.start();
  }

  stop() {
    this.listener.stop();
  }

  pause() {
    this.listener.pause();
  }

  resume() {
    return this.listener.resume();
  }

  destroy() {
    this.listener.destroy();
    this.processedDecisionIds.clear();
  }

  #handleMessage(message) {
    if (message?.type === "transcript") {
      if (!this.#matchesCurrentTurn(message)) return true;
      safelyCall(this.onTranscript, {
        transcript: typeof message.transcript === "string" ? message.transcript : "",
        isFinal: message.isFinal === true,
        sentenceId: Number.isInteger(message.sentenceId) ? message.sentenceId : null,
        recognitionWindowId: message.recognitionWindowId || null,
        provider: message.provider || "bailian",
      });
      return true;
    }
    if (message?.type !== "answer-resolved") return false;
    if (!this.#matchesCurrentTurn(message)) return true;
    const decisionId = String(
      message.recognitionResultId
      || `${message.providerTaskId || "provider"}:${message.sentenceId ?? "final"}`,
    );
    if (this.processedDecisionIds.has(decisionId)) return true;
    this.processedDecisionIds.add(decisionId);
    if (this.processedDecisionIds.size > 32) {
      this.processedDecisionIds.delete(this.processedDecisionIds.values().next().value);
    }
    this.listener.pause();
    safelyCall(this.onTranscript, {
      transcript: typeof message.transcript === "string" ? message.transcript : "",
      isFinal: true,
      sentenceId: Number.isInteger(message.sentenceId) ? message.sentenceId : null,
      recognitionWindowId: message.recognitionWindowId || null,
      provider: message.provider || "bailian",
    });
    safelyCall(this.onDecision, {
      ...message,
      recognitionResultId: decisionId,
    });
    return true;
  }

  #matchesCurrentTurn(message) {
    return (
      message?.gameSessionId === this.context.gameSessionId
      && message?.turnId === this.context.turnId
      && message?.attemptId === this.context.attemptId
      && message?.learningPackId === this.context.learningPackId
      && message?.learningPackVersion === this.context.learningPackVersion
      && message?.taskId === this.context.taskId
    );
  }
}
