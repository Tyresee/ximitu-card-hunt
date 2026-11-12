import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_PROVIDER_CAPABILITIES,
  DEFAULT_HAVE_HAS_ASSESSMENT_POLICY,
  WRONG_KNOWLEDGE_SCORE,
  evaluateAssessmentEvidence,
  normalizeAssessmentPolicy,
  simulateAssessmentPolicyCases,
  validateAssessmentPolicy,
} from "../public/js/lib/assessment-policy.js";

function policy(overrides = {}) {
  return {
    ...structuredClone(DEFAULT_HAVE_HAS_ASSESSMENT_POLICY),
    ...overrides,
  };
}

function aliyunResult(overrides = {}) {
  return {
    overall: 94,
    pron: 92,
    accuracy: 90,
    fluency: { overall: 88 },
    details: [{
      char: "has",
      score: 91,
      phone: [{ score: 90 }, { score: 92 }, { score: 91 }],
    }],
    ...overrides,
  };
}

test("default have/has policy is provider-independent, immutable, and valid", () => {
  assert.equal(Object.isFrozen(DEFAULT_HAVE_HAS_ASSESSMENT_POLICY), true);
  assert.equal(Object.isFrozen(DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.weights), true);
  assert.deepEqual(DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.weights, {
    knowledgeCorrectness: 60,
    targetPronunciation: 25,
    sentencePronunciation: 10,
    fluency: 5,
  });
  assert.deepEqual(DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.confusables, {
    have: ["has"],
    has: ["have"],
  });
  assert.equal(
    ASSESSMENT_PROVIDER_CAPABILITIES["aliyun.sentence-details.v1"].targetWordWeight,
    false,
  );
  assert.equal(
    ASSESSMENT_PROVIDER_CAPABILITIES["aliyun.extended-choice.v1"].exclusiveChoice,
    true,
  );
  assert.equal(
    DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.providerProfileRef,
    "aliyun.sentence-details.v1",
  );

  const validation = validateAssessmentPolicy(DEFAULT_HAVE_HAS_ASSESSMENT_POLICY);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(
    validation.warnings.some(({ code }) => code === "provider_local_weighting"),
    true,
  );
});

test("policy normalization canonicalizes subjects and derives paired confusables", () => {
  const normalized = normalizeAssessmentPolicy({
    ...policy(),
    expectedBySubject: {
      " I ": " HAVE ",
      " She ": " HAS ",
    },
    confusables: undefined,
  });

  assert.deepEqual(normalized.expectedBySubject, {
    i: "have",
    she: "has",
  });
  assert.deepEqual(normalized.confusables, {
    have: ["has"],
    has: ["have"],
  });
});

test("correct have/has transcript passes the knowledge gate and receives a finite score", () => {
  const result = evaluateAssessmentEvidence({
    policy: policy(),
    evidence: {
      normalizedTranscript: "she has two apples",
      provider: { result: aliyunResult() },
    },
  });

  assert.equal(result.knowledgeStatus, "correct");
  assert.equal(result.result, "correct");
  assert.equal(result.action, "accepted");
  assert.equal(result.subject, "she");
  assert.equal(result.expectedForm, "has");
  assert.equal(result.observedForm, "has");
  assert.equal(result.reason, "expected_form_detected");
  assert.equal(Number.isFinite(result.score), true);
  assert.equal(result.score, 96.25);
  assert.deepEqual(result.components, {
    knowledgeCorrectness: 100,
    targetPronunciation: 91,
    sentencePronunciation: 91,
    fluency: 88,
  });
  assert.equal(result.providerEvidence.phoneScore, 91);
});

test("wrong target form cannot be offset by a perfect Aliyun overall score", () => {
  const result = evaluateAssessmentEvidence({
    policy: policy(),
    subject: "she",
    evidence: {
      transcript: "She have two apples.",
      result: aliyunResult({
        overall: 100,
        pron: 100,
        accuracy: 100,
        fluency: { overall: 100 },
        details: [{
          char: "has",
          score: 100,
          phone: [{ score: 100 }],
        }],
      }),
    },
  });

  assert.equal(result.knowledgeStatus, "wrong");
  assert.equal(result.result, "wrong");
  assert.equal(result.action, "score_low");
  assert.equal(result.gameResult, "accepted");
  assert.equal(result.primaryAccepted, false);
  assert.equal(result.reason, "confusable_form_detected");
  assert.equal(result.observedForm, "have");
  assert.equal(result.score, WRONG_KNOWLEDGE_SCORE);
  assert.equal(result.weightedComponents, null);
  assert.equal(result.providerEvidence.overall, 100);
});

test("missing lexical evidence is uncertain even when provider scores are high", () => {
  const result = evaluateAssessmentEvidence({
    policy: policy(),
    subject: "he",
    evidence: {
      provider: {
        result: aliyunResult({
          overall: 99,
          pron: 99,
          accuracy: 99,
          fluency: { overall: 99 },
        }),
      },
    },
  });

  assert.equal(result.knowledgeStatus, "uncertain");
  assert.equal(result.result, "uncertain");
  assert.equal(result.action, "teacher_review");
  assert.equal(result.reason, "knowledge_evidence_missing");
  assert.equal(result.score, null);
  assert.equal(result.weightedComponents, null);
});

test("provider choice and overall cannot replace independent knowledge evidence", () => {
  const extendedChoicePolicy = policy({
    providerProfileRef: "aliyun.extended-choice.v1",
  });
  const providerOnly = evaluateAssessmentEvidence({
    policy: extendedChoicePolicy,
    subject: "she",
    evidence: {
      provider: {
        result: {
          choiceType: "key",
          recognizedForm: "has",
          overall: 100,
        },
      },
    },
  });
  const explicit = evaluateAssessmentEvidence({
    policy: extendedChoicePolicy,
    subject: "she",
    evidence: {
      recognizedForm: "has",
      provider: {
        result: aliyunResult(),
      },
    },
  });

  assert.equal(providerOnly.result, "uncertain");
  assert.equal(providerOnly.action, "teacher_review");
  assert.equal(providerOnly.score, null);
  assert.equal(explicit.result, "correct");
  assert.equal(Number.isFinite(explicit.score), true);
});

test("a correct knowledge answer needs every real weighted provider component", () => {
  const missingCases = [
    ["targetPronunciation", { details: [] }],
    ["sentencePronunciation", { pron: undefined }],
    ["sentencePronunciation", { accuracy: undefined }],
    ["fluency", { fluency: undefined }],
  ];

  for (const [missingComponent, overrides] of missingCases) {
    const result = evaluateAssessmentEvidence({
      policy: policy(),
      subject: "she",
      evidence: {
        transcript: "She has two apples.",
        provider: {
          result: aliyunResult(overrides),
        },
      },
    });

    assert.equal(result.knowledgeStatus, "correct");
    assert.equal(result.result, "uncertain");
    assert.equal(result.action, "teacher_review");
    assert.equal(result.gameResult, "teacher_review");
    assert.equal(result.primaryAccepted, false);
    assert.equal(result.score, null);
    assert.equal(result.weightedComponents, null);
    assert.equal(result.reason, "weighted_component_missing");
    assert.equal(result.missingComponents.includes(missingComponent), true);
  }
});

test("the target slot ignores a later confusable word in the same transcript", () => {
  const correct = evaluateAssessmentEvidence({
    policy: policy(),
    subject: "she",
    evidence: {
      transcript: "She has friends who have cats.",
      provider: { result: aliyunResult() },
    },
  });
  const wrong = evaluateAssessmentEvidence({
    policy: policy(),
    subject: "she",
    evidence: {
      transcript: "She have friends who has cats.",
      provider: { result: aliyunResult() },
      knowledgeStatus: "correct",
    },
  });

  assert.equal(correct.result, "correct");
  assert.equal(correct.observedForm, "has");
  assert.equal(wrong.knowledgeStatus, "wrong");
  assert.equal(wrong.result, "wrong");
  assert.equal(wrong.observedForm, "have");
  assert.equal(wrong.score, WRONG_KNOWLEDGE_SCORE);
});

test("weight validation rejects totals other than 100 and all non-finite values", () => {
  const wrongTotal = validateAssessmentPolicy(policy({
    weights: {
      knowledgeCorrectness: 60,
      targetPronunciation: 25,
      sentencePronunciation: 10,
      fluency: 4,
    },
  }));
  assert.equal(wrongTotal.valid, false);
  assert.equal(
    wrongTotal.errors.some(({ code }) => code === "weights_total_invalid"),
    true,
  );
  assert.equal(wrongTotal.normalizedPolicy, null);

  for (const invalidValue of [Number.NaN, Infinity, -Infinity, "5"]) {
    const invalid = validateAssessmentPolicy(policy({
      weights: {
        knowledgeCorrectness: 60,
        targetPronunciation: 25,
        sentencePronunciation: 10,
        fluency: invalidValue,
      },
    }));
    assert.equal(invalid.valid, false);
    assert.equal(
      invalid.errors.some(({ code }) => code === "weight_not_finite"),
      true,
    );
  }
});

test("validation rejects unknown provider profiles and self-confusable forms", () => {
  const unknownProvider = validateAssessmentPolicy(policy({
    providerProfileRef: "aliyun.imaginary-word-weight.v1",
  }));
  assert.equal(unknownProvider.valid, false);
  assert.equal(
    unknownProvider.errors.some(({ code }) => code === "provider_profile_unknown"),
    true,
  );

  const overlap = validateAssessmentPolicy(policy({
    confusables: {
      have: ["have"],
      has: ["have"],
    },
  }));
  assert.equal(overlap.valid, false);
  assert.equal(
    overlap.errors.some(({ code }) => code === "confusable_matches_expected"),
    true,
  );

  const unknownField = validateAssessmentPolicy({
    ...policy(),
    rawProviderParameters: { typeThres: 4 },
  });
  assert.equal(unknownField.valid, false);
  assert.equal(
    unknownField.errors.some(({ code }) => code === "unknown_property"),
    true,
  );
  assert.throws(
    () => normalizeAssessmentPolicy({
      ...policy(),
      rawProviderParameters: { typeThres: 4 },
    }),
    /unsupported/,
  );
});

test("default simulation proves correct, wrong, and uncertain policy outcomes", () => {
  const simulation = simulateAssessmentPolicyCases(policy());

  assert.equal(simulation.valid, true);
  assert.deepEqual(simulation.errors, []);
  assert.deepEqual(
    simulation.cases.map(({ id, result, outcome, action }) => ({
      id,
      result,
      outcome,
      action,
    })),
    [
      {
        id: "correct",
        result: "correct",
        outcome: "correct",
        action: "accepted",
      },
      {
        id: "wrong",
        result: "wrong",
        outcome: "wrong",
        action: "score_low",
      },
      {
        id: "uncertain",
        result: "uncertain",
        outcome: "uncertain",
        action: "teacher_review",
      },
    ],
  );
  assert.equal(Number.isFinite(simulation.cases[0].score), true);
  assert.equal(simulation.cases[1].score, WRONG_KNOWLEDGE_SCORE);
  assert.equal(simulation.cases[2].score, null);
  assert.deepEqual(simulation.summary, {
    total: 3,
    matched: 3,
    mismatched: 0,
  });
});
