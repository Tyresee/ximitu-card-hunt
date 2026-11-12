import test from "node:test";
import assert from "node:assert/strict";

import {
  sentenceFramePresentation,
} from "../public/prototypes/universal-board/mission-answer-presentation.js";

test("answer presentation fills one blank from the canonical sentence", () => {
  const result = sentenceFramePresentation(
    "She ___ two apples.",
    "She has two apples.",
  );

  assert.equal(result.hasBlank, true);
  assert.equal(result.matched, true);
  assert.deepEqual(result.parts, [
    { text: "She ", answer: false },
    { text: "has", answer: true },
    { text: " two apples.", answer: false },
  ]);
});

test("answer presentation keeps a multiword answer together", () => {
  const result = sentenceFramePresentation(
    "The bag is ___ the desk.",
    "The bag is next to the desk.",
  );

  assert.equal(result.matched, true);
  assert.equal(result.parts.find((part) => part.answer)?.text, "next to");
});

test("answer presentation supports more than one blank", () => {
  const result = sentenceFramePresentation(
    "Turn on the ___ and bring ___.",
    "Turn on the light and bring water.",
  );

  assert.deepEqual(
    result.parts.filter((part) => part.answer).map((part) => part.text),
    ["light", "water"],
  );
});

test("answer presentation leaves a sentence without blanks unchanged", () => {
  const result = sentenceFramePresentation(
    "She has two apples.",
    "She has two apples.",
  );

  assert.equal(result.hasBlank, false);
  assert.equal(result.matched, false);
  assert.deepEqual(result.parts, [
    { text: "She has two apples.", answer: false },
  ]);
});

test("answer presentation never guesses when scaffold and model do not align", () => {
  const result = sentenceFramePresentation(
    "She ___ two apples.",
    "He has a grandmother.",
  );

  assert.equal(result.matched, false);
  assert.deepEqual(result.parts, [
    { text: "She ___ two apples.", answer: false },
  ]);
  assert.equal(result.fallback, "He has a grandmother.");
});
