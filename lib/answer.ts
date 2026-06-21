export function normalizeAnswer(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

export const DEFAULT_QUESTION_TIME_LIMIT_MS = 30_000;
export const ANSWER_GRACE_MS = 1_000;

export function isValidAnswerElapsedMsValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

export function validateAnswerElapsedMs(
  answerElapsedMs: unknown,
  timeLimitMs: number,
  graceMs = ANSWER_GRACE_MS
): boolean {
  if (!isValidAnswerElapsedMsValue(answerElapsedMs)) {
    return false;
  }

  if (!Number.isFinite(timeLimitMs) || timeLimitMs <= 0) {
    return false;
  }

  return answerElapsedMs <= timeLimitMs + graceMs;
}

export function formatElapsedTime(answerElapsedMs: number): string {
  return `${(answerElapsedMs / 1000).toFixed(2)}秒`;
}
