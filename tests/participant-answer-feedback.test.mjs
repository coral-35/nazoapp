import assert from "node:assert/strict";
import test from "node:test";
import {
  finalStatusMessage,
  formatAttemptLog
} from "../lib/participant-answer-feedback.ts";

test("attempt limit message states both incorrect and limit reached", () => {
  assert.equal(
    finalStatusMessage("attempt_limit_exceeded"),
    "不正解です。解答回数の上限に達しました。"
  );
});

test("attempt log includes the submitted answer and incorrect result", () => {
  assert.equal(
    formatAttemptLog({ answer: "送信したこたえ", isCorrect: false }, 0),
    "1回目：送信した解答「送信したこたえ」— 不正解"
  );
});

test("attempt log includes the submitted answer and correct result", () => {
  assert.equal(
    formatAttemptLog({ answer: "正しいこたえ", isCorrect: true }, 1),
    "2回目：送信した解答「正しいこたえ」— 正解"
  );
});
