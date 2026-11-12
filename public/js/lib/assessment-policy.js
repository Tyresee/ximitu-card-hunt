const POLICY_SCHEMA_VERSION = "assessment-policy.v1";
const MAX_POLICY_ENTRIES = 32;
const MAX_EVIDENCE_DETAILS = 256;
export const WRONG_KNOWLEDGE_SCORE = 45;
const POLICY_TEXT_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const ENGLISH_PHRASE_PATTERN = /^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*$/;
const WEIGHT_KEYS = Object.freeze([
  "knowledgeCorrectness",
  "targetPronunciation",
  "sentencePronunciation",
  "fluency",
]);
const POLICY_KEYS = new Set([
  "schemaVersion",
  "skillId",
  "displayName",
  "requiredGate",
  "expectedBySubject",
  "confusables",
  "onWrong",
  "onUncertain",
  "providerProfileRef",
  "weights",
]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedString(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim()
    : value;
}

function normalizedEnglishPhrase(value) {
  const normalized = normalizedString(value);
  return typeof normalized === "string"
    ? normalized.toLocaleLowerCase("en-US").replace(/\s+/gu, " ")
    : normalized;
}

function normalizedTranscript(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedRecord(record, normalizeValue) {
  if (!isPlainObject(record)) return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      normalizedEnglishPhrase(key),
      normalizeValue(value),
    ]),
  );
}

function derivedConfusables(expectedBySubject) {
  if (!isPlainObject(expectedBySubject)) return {};
  const forms = [...new Set(
    Object.values(expectedBySubject)
      .map(normalizedEnglishPhrase)
      .filter((value) => typeof value === "string" && value),
  )];
  return Object.fromEntries(
    forms.map((form) => [form, forms.filter((candidate) => candidate !== form)]),
  );
}

export const ASSESSMENT_PROVIDER_CAPABILITIES = deepFreeze({
  "aliyun.sentence-details.v1": {
    provider: "aliyun",
    mode: "sentence_details",
    coreType: "en.sent_kid.score",
    targetWordWeight: false,
    exclusiveChoice: false,
    keyUnkey: false,
    transcript: false,
    overall: true,
    pron: true,
    accuracy: true,
    fluency: true,
    wordDetails: true,
    phoneDetails: true,
    localKnowledgeGate: true,
  },
  "aliyun.extended-choice.v1": {
    provider: "aliyun",
    mode: "extended_choice",
    coreType: "en.pche.score",
    targetWordWeight: false,
    exclusiveChoice: true,
    keyUnkey: true,
    transcript: false,
    overall: true,
    pron: false,
    accuracy: false,
    fluency: false,
    wordDetails: false,
    phoneDetails: false,
    pronScale: true,
    pronDerivedFromOverall: true,
    localKnowledgeGate: true,
  },
});

export const DEFAULT_HAVE_HAS_ASSESSMENT_POLICY = deepFreeze({
  schemaVersion: POLICY_SCHEMA_VERSION,
  skillId: "grammar.have_has",
  displayName: "Have / Has",
  requiredGate: true,
  expectedBySubject: {
    i: "have",
    you: "have",
    we: "have",
    they: "have",
    he: "has",
    she: "has",
    it: "has",
  },
  confusables: {
    have: ["has"],
    has: ["have"],
  },
  onWrong: "score_low",
  onUncertain: "teacher_review",
  providerProfileRef: "aliyun.sentence-details.v1",
  weights: {
    knowledgeCorrectness: 60,
    targetPronunciation: 25,
    sentencePronunciation: 10,
    fluency: 5,
  },
});

/**
 * Produce the canonical, serializable policy representation. Missing fields use
 * the v1 have/has defaults; supplied records replace their default record rather
 * than inheriting unrelated entries.
 */
export function normalizeAssessmentPolicy(input = DEFAULT_HAVE_HAS_ASSESSMENT_POLICY) {
  if (!isPlainObject(input)) {
    throw new TypeError("assessment policy must be a plain object");
  }
  const unknownPolicyKey = Object.keys(input).find((key) => !POLICY_KEYS.has(key));
  if (unknownPolicyKey) {
    throw new TypeError(`assessment policy field is unsupported: ${unknownPolicyKey}`);
  }
  if (isPlainObject(input.weights)) {
    const unknownWeightKey = Object.keys(input.weights)
      .find((key) => !WEIGHT_KEYS.includes(key));
    if (unknownWeightKey) {
      throw new TypeError(`assessment policy weight is unsupported: ${unknownWeightKey}`);
    }
  }

  const expectedBySubject = input.expectedBySubject === undefined
    ? { ...DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.expectedBySubject }
    : normalizedRecord(input.expectedBySubject, normalizedEnglishPhrase);
  const confusablesSource = input.confusables === undefined
    ? derivedConfusables(expectedBySubject)
    : input.confusables;
  const confusables = normalizedRecord(
    confusablesSource,
    (value) => Array.isArray(value)
      ? value.map(normalizedEnglishPhrase)
      : value,
  );
  const suppliedWeights = input.weights === undefined
    ? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.weights
    : input.weights;
  const weights = isPlainObject(suppliedWeights)
    ? Object.fromEntries(
      WEIGHT_KEYS.map((key) => [
        key,
        suppliedWeights[key] === undefined
          ? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.weights[key]
          : suppliedWeights[key],
      ]),
    )
    : suppliedWeights;

  return {
    schemaVersion: normalizedString(
      input.schemaVersion ?? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.schemaVersion,
    ),
    skillId: normalizedString(
      input.skillId ?? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.skillId,
    ),
    displayName: normalizedString(
      input.displayName ?? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.displayName,
    ),
    requiredGate: input.requiredGate
      ?? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.requiredGate,
    expectedBySubject,
    confusables,
    onWrong: normalizedString(
      input.onWrong ?? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.onWrong,
    ),
    onUncertain: normalizedString(
      input.onUncertain ?? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.onUncertain,
    ),
    providerProfileRef: normalizedString(
      input.providerProfileRef
        ?? DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.providerProfileRef,
    ),
    weights,
  };
}

function issue(path, code, message) {
  return { path, code, message };
}

function unknownProperties(value, allowed, path, errors) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(issue(`${path}.${key}`, "unknown_property", "不支持此字段"));
    }
  }
}

function validPolicyText(value, { maxLength = 80 } = {}) {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && POLICY_TEXT_PATTERN.test(value)
  );
}

function validEnglishPhrase(value, { maxLength = 80 } = {}) {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && ENGLISH_PHRASE_PATTERN.test(value)
  );
}

/**
 * Validate user-authored policy data without throwing for ordinary validation
 * failures. A normalized policy is returned only when all errors are resolved.
 */
export function validateAssessmentPolicy(input) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: [issue("$", "object_required", "评分策略必须是对象")],
      warnings,
      normalizedPolicy: null,
    };
  }

  unknownProperties(input, POLICY_KEYS, "$", errors);
  let policy;
  try {
    policy = normalizeAssessmentPolicy(input);
  } catch {
    return {
      valid: false,
      errors: [
        ...errors,
        issue("$", "normalization_failed", "评分策略无法规范化"),
      ],
      warnings,
      normalizedPolicy: null,
    };
  }

  if (policy.schemaVersion !== POLICY_SCHEMA_VERSION) {
    errors.push(issue(
      "$.schemaVersion",
      "schema_version_unsupported",
      `仅支持 ${POLICY_SCHEMA_VERSION}`,
    ));
  }
  if (!validPolicyText(policy.skillId, { maxLength: 96 })) {
    errors.push(issue(
      "$.skillId",
      "skill_id_invalid",
      "知识点标识格式无效",
    ));
  }
  if (
    typeof policy.displayName !== "string"
    || !policy.displayName
    || policy.displayName.length > 80
  ) {
    errors.push(issue(
      "$.displayName",
      "display_name_invalid",
      "显示名称必须是 1–80 个字符",
    ));
  }
  if (policy.requiredGate !== true) {
    errors.push(issue(
      "$.requiredGate",
      "required_gate_required",
      "v1 主考知识点必须启用高权重评分保护",
    ));
  }
  if (!["score_low", "retry"].includes(policy.onWrong)) {
    errors.push(issue(
      "$.onWrong",
      "wrong_action_invalid",
      "明确答错必须固定低分并继续游戏",
    ));
  } else if (policy.onWrong === "retry") {
    warnings.push(issue(
      "$.onWrong",
      "legacy_wrong_action_migrated",
      "旧版 retry 会在运行时迁移为固定 45 分并继续游戏",
    ));
  }
  if (policy.onUncertain !== "teacher_review") {
    errors.push(issue(
      "$.onUncertain",
      "uncertain_action_invalid",
      "证据不确定必须进入 teacher_review",
    ));
  }
  if (!(policy.providerProfileRef in ASSESSMENT_PROVIDER_CAPABILITIES)) {
    errors.push(issue(
      "$.providerProfileRef",
      "provider_profile_unknown",
      "供应商配置档未登记",
    ));
  }

  if (!isPlainObject(policy.expectedBySubject)) {
    errors.push(issue(
      "$.expectedBySubject",
      "subject_map_required",
      "主语到正确形式的映射必须是对象",
    ));
  } else {
    const entries = Object.entries(policy.expectedBySubject);
    if (entries.length < 1 || entries.length > MAX_POLICY_ENTRIES) {
      errors.push(issue(
        "$.expectedBySubject",
        "subject_map_size_invalid",
        `主语映射必须包含 1–${MAX_POLICY_ENTRIES} 项`,
      ));
    }
    for (const [subject, expected] of entries) {
      if (!validEnglishPhrase(subject)) {
        errors.push(issue(
          `$.expectedBySubject.${subject}`,
          "subject_invalid",
          "主语必须是英文单词或短语",
        ));
      }
      if (!validEnglishPhrase(expected)) {
        errors.push(issue(
          `$.expectedBySubject.${subject}`,
          "expected_form_invalid",
          "正确形式必须是英文单词或短语",
        ));
      }
    }
  }

  if (!isPlainObject(policy.confusables)) {
    errors.push(issue(
      "$.confusables",
      "confusables_map_required",
      "混淆项必须按正确形式分组",
    ));
  } else {
    const entries = Object.entries(policy.confusables);
    if (entries.length < 1 || entries.length > MAX_POLICY_ENTRIES) {
      errors.push(issue(
        "$.confusables",
        "confusables_map_size_invalid",
        `混淆项映射必须包含 1–${MAX_POLICY_ENTRIES} 项`,
      ));
    }
    const expectedForms = new Set(
      isPlainObject(policy.expectedBySubject)
        ? Object.values(policy.expectedBySubject)
        : [],
    );
    for (const expected of expectedForms) {
      if (!Object.hasOwn(policy.confusables, expected)) {
        errors.push(issue(
          `$.confusables.${expected}`,
          "confusables_missing",
          "每个正确形式都必须配置常见混淆项",
        ));
      }
    }
    for (const [expected, alternatives] of entries) {
      if (!validEnglishPhrase(expected)) {
        errors.push(issue(
          `$.confusables.${expected}`,
          "confusable_key_invalid",
          "混淆项键必须是英文单词或短语",
        ));
      }
      if (!expectedForms.has(expected)) {
        errors.push(issue(
          `$.confusables.${expected}`,
          "confusable_key_unknown",
          "混淆项键必须对应某个正确形式",
        ));
      }
      if (!Array.isArray(alternatives) || alternatives.length < 1 || alternatives.length > 16) {
        errors.push(issue(
          `$.confusables.${expected}`,
          "confusable_list_invalid",
          "每个正确形式必须包含 1–16 个混淆项",
        ));
        continue;
      }
      const seen = new Set();
      alternatives.forEach((alternative, index) => {
        const path = `$.confusables.${expected}[${index}]`;
        if (!validEnglishPhrase(alternative)) {
          errors.push(issue(
            path,
            "confusable_form_invalid",
            "混淆形式必须是英文单词或短语",
          ));
        }
        if (alternative === expected) {
          errors.push(issue(
            path,
            "confusable_matches_expected",
            "正确形式不能同时作为自己的混淆项",
          ));
        }
        if (seen.has(alternative)) {
          errors.push(issue(
            path,
            "confusable_duplicate",
            "同组混淆形式不能重复",
          ));
        }
        seen.add(alternative);
      });
    }
  }

  if (!isPlainObject(input.weights)) {
    errors.push(issue(
      "$.weights",
      "weights_required",
      "四项权重必须是对象",
    ));
  } else {
    unknownProperties(input.weights, new Set(WEIGHT_KEYS), "$.weights", errors);
  }
  if (!isPlainObject(policy.weights)) {
    errors.push(issue(
      "$.weights",
      "weights_invalid",
      "四项权重无法规范化",
    ));
  } else {
    let total = 0;
    let finiteTotal = true;
    for (const key of WEIGHT_KEYS) {
      const value = policy.weights[key];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(issue(
          `$.weights.${key}`,
          "weight_not_finite",
          "权重必须是有效数字",
        ));
        finiteTotal = false;
        continue;
      }
      if (value < 0 || value > 100) {
        errors.push(issue(
          `$.weights.${key}`,
          "weight_out_of_range",
          "权重必须在 0–100 之间",
        ));
      }
      total += value;
    }
    if (finiteTotal && Math.abs(total - 100) > 1e-9) {
      errors.push(issue(
        "$.weights",
        "weights_total_invalid",
        "四项权重总和必须等于 100",
      ));
    }
  }

  if (
    policy.providerProfileRef in ASSESSMENT_PROVIDER_CAPABILITIES
    && !ASSESSMENT_PROVIDER_CAPABILITIES[policy.providerProfileRef].targetWordWeight
  ) {
    warnings.push(issue(
      "$.providerProfileRef",
      "provider_local_weighting",
      "供应商不支持目标词直接加权，运行时将使用本地确定性权重",
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedPolicy: errors.length === 0 ? policy : null,
  };
}

function finiteScore(value) {
  let numeric = value;
  if (
    typeof value === "string"
    && value.trim()
    && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())
  ) {
    numeric = Number(value);
  }
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return null;
  if (numeric < 0 || numeric > 100) return null;
  return numeric;
}

function averageScores(values) {
  const scores = values
    .map(finiteScore)
    .filter((value) => value !== null);
  if (!scores.length) return null;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function tokensFor(value) {
  const normalized = normalizedTranscript(value);
  return normalized ? normalized.split(" ") : [];
}

function phraseIndex(tokens, phrase, start = 0) {
  const phraseTokens = tokensFor(phrase);
  if (!phraseTokens.length || phraseTokens.length > tokens.length) return -1;
  for (let index = Math.max(0, start); index <= tokens.length - phraseTokens.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < phraseTokens.length; offset += 1) {
      if (tokens[index + offset] !== phraseTokens[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return index;
  }
  return -1;
}

function phraseMatchesAt(tokens, phrase, index) {
  const phraseTokens = tokensFor(phrase);
  if (
    !phraseTokens.length
    || !Number.isSafeInteger(index)
    || index < 0
    || index + phraseTokens.length > tokens.length
  ) return false;
  return phraseTokens.every(
    (token, offset) => tokens[index + offset] === token,
  );
}

function resolveSubject(policy, requestedSubject, transcriptTokens) {
  if (requestedSubject !== undefined && requestedSubject !== null) {
    const normalized = normalizedEnglishPhrase(requestedSubject);
    return Object.hasOwn(policy.expectedBySubject, normalized)
      ? { subject: normalized, source: "provided" }
      : { subject: null, source: "provided_unknown" };
  }
  const subjects = Object.keys(policy.expectedBySubject)
    .sort((left, right) => tokensFor(right).length - tokensFor(left).length);
  const subject = subjects.find((candidate) => phraseIndex(transcriptTokens, candidate) === 0);
  return subject
    ? { subject, source: "transcript" }
    : { subject: null, source: "missing" };
}

function providerResultFor(evidence) {
  const candidates = [
    evidence.provider?.result,
    evidence.providerResult?.result,
    evidence.providerResult,
    evidence.aliyun?.result,
    evidence.aliyun,
    evidence.result,
  ];
  return candidates.find(isPlainObject) ?? {};
}

function detailsFor(evidence, providerResult) {
  const candidates = [
    providerResult.details,
    evidence.provider?.details,
    evidence.providerResult?.details,
    evidence.details,
  ];
  const details = candidates.find(Array.isArray) ?? [];
  return details.filter(isPlainObject).slice(0, MAX_EVIDENCE_DETAILS);
}

function detailLabel(detail) {
  for (const key of [
    "recognizedForm",
    "recognized",
    "actual",
    "actualText",
    "word",
    "char",
    "text",
    "token",
    "content",
  ]) {
    const value = detail[key];
    if (typeof value === "string" && normalizedTranscript(value)) {
      return normalizedTranscript(value);
    }
  }
  return "";
}

function phoneScoresFor(value) {
  const phones = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? [value]
      : [];
  return phones
    .map((phone) => isPlainObject(phone)
      ? finiteScore(phone.score ?? phone.pron ?? phone.accuracy)
      : finiteScore(phone))
    .filter((score) => score !== null);
}

function detailScore(detail) {
  const phoneScore = averageScores([
    ...phoneScoresFor(detail.phone),
    ...phoneScoresFor(detail.phones),
  ]);
  return finiteScore(detail.pron)
    ?? finiteScore(detail.accuracy)
    ?? finiteScore(detail.score)
    ?? phoneScore;
}

function fluencyScore(value) {
  if (isPlainObject(value)) {
    return finiteScore(value.overall)
      ?? finiteScore(value.score)
      ?? finiteScore(value.fluency);
  }
  return finiteScore(value);
}

function recognizedFormSignal(value, expected, alternatives, source) {
  const form = normalizedEnglishPhrase(value);
  if (typeof form !== "string" || !form) return null;
  if (form === expected) return { status: "correct", form, source };
  if (alternatives.includes(form)) return { status: "wrong", form, source };
  return null;
}

function transcriptSignal({
  transcriptTokens,
  subject,
  expected,
  alternatives,
}) {
  if (!transcriptTokens.length) return null;
  const subjectIndex = phraseIndex(transcriptTokens, subject);
  const subjectLength = tokensFor(subject).length;

  let targetIndex = subjectIndex >= 0
    ? subjectIndex + subjectLength
    : null;
  if (targetIndex === null && subject === "target") {
    const candidates = [expected, ...alternatives]
      .map((form) => ({
        form,
        index: phraseIndex(transcriptTokens, form),
      }))
      .filter(({ index }) => index >= 0)
      .sort((left, right) => left.index - right.index);
    targetIndex = candidates[0]?.index ?? null;
  }
  if (targetIndex === null) return null;

  const matchingForms = [expected, ...alternatives].filter(
    (form) => phraseMatchesAt(transcriptTokens, form, targetIndex),
  );
  if (matchingForms.length !== 1) {
    if (!matchingForms.length) return null;
    return {
      status: "uncertain",
      form: null,
      source: "transcript_conflict",
      tokenIndex: targetIndex,
    };
  }
  const form = matchingForms[0];
  return {
    status: form === expected ? "correct" : "wrong",
    form,
    source: "transcript",
    tokenIndex: targetIndex,
  };
}

function explicitSignals(evidence, expected, alternatives) {
  const signals = [];
  const explicitKnowledge = [
    evidence.knowledgeStatus,
    evidence.knowledgeResult,
    evidence.targetStatus,
  ];
  for (const status of explicitKnowledge) {
    if (["correct", "wrong", "uncertain"].includes(status)) {
      signals.push({
        status,
        form: null,
        source: "explicit_knowledge_status",
      });
      break;
    }
  }

  const recognizedCandidates = [
    evidence.recognizedForm,
    evidence.matchedChoice,
  ];
  for (const candidate of recognizedCandidates) {
    const signal = recognizedFormSignal(
      candidate,
      expected,
      alternatives,
      "recognized_form",
    );
    if (signal) {
      signals.push(signal);
      break;
    }
  }
  return signals;
}

function expectedOccurrenceOrdinal(transcriptTokens, expected, targetIndex) {
  if (!Number.isSafeInteger(targetIndex) || targetIndex < 0) return null;
  let ordinal = -1;
  for (let index = 0; index <= targetIndex; index += 1) {
    if (phraseMatchesAt(transcriptTokens, expected, index)) ordinal += 1;
  }
  return ordinal >= 0 ? ordinal : null;
}

function summarizedProviderEvidence(
  providerResult,
  details,
  expected,
  targetOccurrenceOrdinal = null,
) {
  const overall = finiteScore(providerResult.overall);
  const pron = finiteScore(providerResult.pron);
  const accuracy = finiteScore(providerResult.accuracy);
  const fluency = fluencyScore(providerResult.fluency);
  const targetDetails = details.filter((detail) => (
    expected
    && detailLabel(detail) === expected
    && detail.dp_type !== 1
    && detail.dp_type !== "1"
  ));
  const selectedTargetDetail = Number.isSafeInteger(targetOccurrenceOrdinal)
    ? targetDetails[targetOccurrenceOrdinal] ?? null
    : targetDetails.length === 1
      ? targetDetails[0]
      : null;
  const targetDetailScore = selectedTargetDetail
    ? detailScore(selectedTargetDetail)
    : null;
  const targetPhoneScore = selectedTargetDetail
    ? averageScores([
      ...phoneScoresFor(selectedTargetDetail.phone),
      ...phoneScoresFor(selectedTargetDetail.phones),
    ])
    : null;
  const sentencePronunciation = pron !== null && accuracy !== null
    ? averageScores([pron, accuracy])
    : null;

  return {
    overall,
    pron,
    accuracy,
    fluency,
    detailCount: details.length,
    targetDetailCount: targetDetails.length,
    selectedTargetDetailIndex: selectedTargetDetail
      ? targetDetails.indexOf(selectedTargetDetail)
      : null,
    targetDetailScore,
    phoneScore: targetPhoneScore,
    targetPronunciation: targetDetailScore,
    sentencePronunciation,
  };
}

function roundedScore(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function invalidPolicyError(validation) {
  const error = new TypeError("assessment policy is invalid");
  error.name = "AssessmentPolicyValidationError";
  error.issues = validation.errors;
  return error;
}

/**
 * Evaluate transcript and provider evidence with a protected local knowledge
 * score. A clear knowledge-point error is settled at a server-owned low score;
 * provider quality scores cannot raise it. Uncertain evidence still requires a
 * teacher decision.
 */
export function evaluateAssessmentEvidence({
  policy: policyInput = DEFAULT_HAVE_HAS_ASSESSMENT_POLICY,
  subject: requestedSubject,
  evidence,
} = {}) {
  const validation = validateAssessmentPolicy(policyInput);
  if (!validation.valid) throw invalidPolicyError(validation);
  if (!isPlainObject(evidence)) {
    throw new TypeError("assessment evidence must be a plain object");
  }
  const policy = validation.normalizedPolicy;
  const transcript = typeof evidence.transcript === "string"
    ? evidence.transcript
    : evidence.normalizedTranscript;
  const cleanTranscript = normalizedTranscript(transcript);
  const transcriptTokens = tokensFor(cleanTranscript);
  const subjectResolution = resolveSubject(
    policy,
    requestedSubject ?? evidence.subject,
    transcriptTokens,
  );

  if (!subjectResolution.subject) {
    const providerResult = providerResultFor(evidence);
    const details = detailsFor(evidence, providerResult);
    const providerEvidence = summarizedProviderEvidence(
      providerResult,
      details,
      "",
    );
    return {
      knowledgeStatus: "uncertain",
      result: "uncertain",
      action: policy.onUncertain,
      gameResult: policy.onUncertain,
      primaryAccepted: false,
      score: null,
      components: {
        knowledgeCorrectness: null,
        targetPronunciation: providerEvidence.targetPronunciation,
        sentencePronunciation: providerEvidence.sentencePronunciation,
        fluency: providerEvidence.fluency,
      },
      weightedComponents: null,
      reason: subjectResolution.source === "provided_unknown"
        ? "subject_unknown"
        : "subject_not_resolved",
      subject: null,
      expectedForm: null,
      observedForm: null,
      normalizedTranscript: cleanTranscript,
      providerProfileRef: policy.providerProfileRef,
      providerEvidence,
    };
  }

  const subject = subjectResolution.subject;
  const expected = policy.expectedBySubject[subject];
  const alternatives = policy.confusables[expected] ?? [];
  const providerResult = providerResultFor(evidence);
  const details = detailsFor(evidence, providerResult);
  const signals = explicitSignals(
    evidence,
    expected,
    alternatives,
  );
  const fromTranscript = transcriptSignal({
    transcriptTokens,
    subject,
    expected,
    alternatives,
  });
  if (fromTranscript) signals.push(fromTranscript);

  const statuses = new Set(signals.map((signal) => signal.status));
  let knowledgeStatus = "uncertain";
  let reason = "knowledge_evidence_missing";
  if (fromTranscript?.status === "wrong") {
    knowledgeStatus = "wrong";
    reason = "confusable_form_detected";
  } else if (
    statuses.has("uncertain")
    || (statuses.has("correct") && statuses.has("wrong"))
  ) {
    reason = "knowledge_evidence_conflict";
  } else if (statuses.has("wrong")) {
    knowledgeStatus = "wrong";
    reason = "confusable_form_detected";
  } else if (statuses.has("correct")) {
    knowledgeStatus = "correct";
    reason = "expected_form_detected";
  }

  const observedForms = [...new Set(
    signals
      .map((signal) => signal.form)
      .filter((form) => typeof form === "string" && form),
  )];
  const observedForm = fromTranscript?.status === "wrong"
    ? fromTranscript.form
    : observedForms.length === 1
      ? observedForms[0]
      : null;
  const targetOccurrenceOrdinal = fromTranscript?.status === "correct"
    ? expectedOccurrenceOrdinal(
      transcriptTokens,
      expected,
      fromTranscript.tokenIndex,
    )
    : null;
  const providerEvidence = summarizedProviderEvidence(
    providerResult,
    details,
    expected,
    targetOccurrenceOrdinal,
  );
  const components = {
    knowledgeCorrectness: knowledgeStatus === "correct"
      ? 100
      : knowledgeStatus === "wrong"
        ? 0
        : null,
    targetPronunciation: providerEvidence.targetPronunciation,
    sentencePronunciation: providerEvidence.sentencePronunciation,
    fluency: providerEvidence.fluency,
  };

  let score = knowledgeStatus === "wrong"
    ? WRONG_KNOWLEDGE_SCORE
    : null;
  let weightedComponents = null;
  const missingComponents = knowledgeStatus === "correct"
    ? WEIGHT_KEYS.filter((key) => (
      policy.weights[key] > 0 && finiteScore(components[key]) === null
    ))
    : [];
  const scoringEvidenceComplete = missingComponents.length === 0;
  if (knowledgeStatus === "correct" && scoringEvidenceComplete) {
    weightedComponents = Object.fromEntries(
      WEIGHT_KEYS.map((key) => {
        const component = finiteScore(components[key]);
        return [key, roundedScore((component * policy.weights[key]) / 100)];
      }),
    );
    score = roundedScore(
      Object.values(weightedComponents).reduce((sum, value) => sum + value, 0),
    );
  }
  const result = knowledgeStatus === "correct" && !scoringEvidenceComplete
    ? "uncertain"
    : knowledgeStatus;
  if (result === "uncertain" && knowledgeStatus === "correct") {
    reason = "weighted_component_missing";
  }

  return {
    knowledgeStatus,
    result,
    action: result === "correct"
      ? "accepted"
      : result === "wrong"
        ? "score_low"
        : policy.onUncertain,
    gameResult: result === "correct" || result === "wrong"
      ? "accepted"
      : policy.onUncertain,
    primaryAccepted: result === "correct",
    score,
    components,
    weightedComponents,
    missingComponents,
    reason,
    subject,
    expectedForm: expected,
    observedForm,
    normalizedTranscript: cleanTranscript,
    providerProfileRef: policy.providerProfileRef,
    providerEvidence,
  };
}

function titleCaseSubject(subject) {
  if (subject === "i") return "I";
  return subject.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function defaultSimulationCases(policy) {
  const subject = Object.hasOwn(policy.expectedBySubject, "she")
    ? "she"
    : Object.keys(policy.expectedBySubject)[0];
  const expected = policy.expectedBySubject[subject];
  const wrong = policy.confusables[expected][0];
  const subjectText = titleCaseSubject(subject);
  const providerResult = {
    overall: 94,
    pron: 92,
    accuracy: 90,
    fluency: { overall: 88 },
    details: [{
      char: expected,
      score: 91,
      phone: [{ score: 90 }, { score: 92 }, { score: 91 }],
    }],
  };
  return [
    {
      id: "correct",
      scenario: "correct",
      expectedResult: "correct",
      expectedAction: "accepted",
      expectedGameResult: "accepted",
      expectedPrimaryAccepted: true,
      subject,
      evidence: {
        transcript: `${subjectText} ${expected} two apples.`,
        provider: { result: providerResult },
      },
    },
    {
      id: "wrong",
      scenario: "wrong",
      expectedResult: "wrong",
      expectedAction: "score_low",
      expectedGameResult: "accepted",
      expectedPrimaryAccepted: false,
      expectedScore: WRONG_KNOWLEDGE_SCORE,
      subject,
      evidence: {
        transcript: `${subjectText} ${wrong} two apples.`,
        provider: {
          result: {
            ...providerResult,
            overall: 99,
            pron: 99,
            accuracy: 99,
            fluency: { overall: 99 },
            details: [{ char: expected, score: 99, phone: [{ score: 99 }] }],
          },
        },
      },
    },
    {
      id: "uncertain",
      scenario: "uncertain",
      expectedResult: "uncertain",
      expectedAction: "teacher_review",
      expectedGameResult: "teacher_review",
      expectedPrimaryAccepted: false,
      expectedScore: null,
      subject,
      evidence: {
        provider: { result: providerResult },
      },
    },
  ];
}

/**
 * Run deterministic correct/wrong/uncertain examples (or caller-supplied cases)
 * without mutating policy data or contacting a provider.
 */
export function simulateAssessmentPolicyCases(
  policyInput = DEFAULT_HAVE_HAS_ASSESSMENT_POLICY,
  cases,
) {
  const validation = validateAssessmentPolicy(policyInput);
  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      warnings: validation.warnings,
      cases: [],
      summary: {
        total: 0,
        matched: 0,
        mismatched: 0,
      },
    };
  }
  if (cases !== undefined && !Array.isArray(cases)) {
    throw new TypeError("assessment simulation cases must be an array");
  }
  const policy = validation.normalizedPolicy;
  const sourceCases = cases ?? defaultSimulationCases(policy);
  if (sourceCases.length < 1 || sourceCases.length > 100) {
    throw new RangeError("assessment simulation must contain 1–100 cases");
  }

  const results = sourceCases.map((simulationCase, index) => {
    if (!isPlainObject(simulationCase)) {
      throw new TypeError(`assessment simulation case ${index} must be an object`);
    }
    const evidence = simulationCase.evidence ?? simulationCase;
    const evaluation = evaluateAssessmentEvidence({
      policy,
      subject: simulationCase.subject,
      evidence,
    });
    const expectedResult = [
      "correct",
      "wrong",
      "uncertain",
    ].includes(simulationCase.expectedResult)
      ? simulationCase.expectedResult
      : null;
    const expectedAction = typeof simulationCase.expectedAction === "string"
      ? simulationCase.expectedAction
      : null;
    const hasExpectedScore = Object.hasOwn(simulationCase, "expectedScore");
    const expectedGameResult = typeof simulationCase.expectedGameResult === "string"
      ? simulationCase.expectedGameResult
      : null;
    const hasExpectedPrimaryAccepted = Object.hasOwn(
      simulationCase,
      "expectedPrimaryAccepted",
    );
    const expectationChecks = [
      expectedResult === null || evaluation.result === expectedResult,
      expectedAction === null || evaluation.action === expectedAction,
      !hasExpectedScore || evaluation.score === simulationCase.expectedScore,
      expectedGameResult === null
        || evaluation.gameResult === expectedGameResult,
      !hasExpectedPrimaryAccepted
        || evaluation.primaryAccepted
          === simulationCase.expectedPrimaryAccepted,
    ];
    return {
      id: typeof simulationCase.id === "string" && simulationCase.id.trim()
        ? simulationCase.id.trim()
        : `case-${index + 1}`,
      scenario: typeof simulationCase.scenario === "string"
        ? simulationCase.scenario
        : simulationCase.label ?? simulationCase.id ?? `case-${index + 1}`,
      expectedResult,
      knowledgeStatus: evaluation.knowledgeStatus,
      result: evaluation.result,
      outcome: evaluation.result,
      action: evaluation.action,
      gameResult: evaluation.gameResult,
      primaryAccepted: evaluation.primaryAccepted,
      score: evaluation.score,
      reason: evaluation.reason,
      components: evaluation.components,
      matchesExpectation: expectedResult === null
        && expectedAction === null
        && !hasExpectedScore
        && expectedGameResult === null
        && !hasExpectedPrimaryAccepted
        ? null
        : expectationChecks.every(Boolean),
    };
  });
  const mismatches = results.filter(
    (result) => result.matchesExpectation === false,
  );
  const simulationErrors = mismatches.map((result) => issue(
    `$.cases.${result.id}`,
    "simulation_expectation_mismatch",
    `模拟结果为 ${result.result}，预期为 ${result.expectedResult}`,
  ));

  return {
    valid: simulationErrors.length === 0,
    errors: simulationErrors,
    warnings: validation.warnings,
    cases: results,
    summary: {
      total: results.length,
      matched: results.filter((result) => result.matchesExpectation === true).length,
      mismatched: mismatches.length,
    },
  };
}
