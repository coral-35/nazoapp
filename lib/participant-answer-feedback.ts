export type ParticipantFinalStatus = "correct" | "timeout" | "attempt_limit_exceeded";

export type ParticipantAttemptFeedback = {
  answer: string;
  isCorrect: boolean;
};

export function finalStatusMessage(finalStatus: ParticipantFinalStatus | undefined): string {
  if (finalStatus === "correct") {
    return "正解です。";
  }
  if (finalStatus === "timeout") {
    return "タイムアップです。";
  }
  return "不正解です。解答回数の上限に達しました。";
}

export function formatAttemptLog(
  attempt: ParticipantAttemptFeedback,
  attemptIndex: number
): string {
  return `${attemptIndex + 1}回目：送信した解答「${attempt.answer}」— ${
    attempt.isCorrect ? "正解" : "不正解"
  }`;
}
