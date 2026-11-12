function escapePatternText(value) {
  return String(value)
    .split(/(\s+)/)
    .map((part) => (
      /^\s+$/.test(part)
        ? "\\s+"
        : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ))
    .join("");
}

export function sentenceFramePresentation(scaffoldValue, modelValue) {
  const scaffold = String(scaffoldValue || "").normalize("NFKC").trim();
  const modelContent = String(modelValue || "").normalize("NFKC").trim();
  const tokens = scaffold.split(/(_{2,})/g);
  const hasBlank = tokens.some((token) => /^_{2,}$/.test(token));

  if (!hasBlank || !modelContent) {
    return {
      hasBlank,
      matched: false,
      parts: [{ text: scaffold, answer: false }],
      fallback: modelContent,
    };
  }

  const pattern = tokens.map((token) => (
    /^_{2,}$/.test(token) ? "(.+?)" : escapePatternText(token)
  )).join("");
  const match = modelContent.match(new RegExp(`^${pattern}$`, "iu"));
  if (!match) {
    return {
      hasBlank: true,
      matched: false,
      parts: [{ text: scaffold, answer: false }],
      fallback: modelContent,
    };
  }

  let answerIndex = 1;
  return {
    hasBlank: true,
    matched: true,
    parts: tokens.map((token) => {
      if (!/^_{2,}$/.test(token)) {
        return { text: token, answer: false };
      }
      const answer = String(match[answerIndex] || "").trim();
      answerIndex += 1;
      return { text: answer, answer: true };
    }),
    fallback: modelContent,
  };
}
