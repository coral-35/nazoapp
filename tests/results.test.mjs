import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnswer } from "../lib/answer.ts";
import { aggregateResults, isValidQuestionMode, isChoiceAnswer } from "../lib/results.ts";

const questions = Array.from({ length: 15 }, (_, i) => ({ id: String(i + 1), order_index: i + 1 }));
const row = (question, correct, time) => ({ question_id: String(question), is_correct: correct, answer_elapsed_ms: time });

test("seven-question sets count only correct answers and their times, including partial last set", () => {
  const result = aggregateResults(questions, [row(1, true, 1000), row(7, true, 2000), row(8, true, 4500), row(14, false, 30000), row(15, true, 500)], 7);
  assert.deepEqual(result, {
    correctCount: 4, totalTimeMs: 8000, missingTimeCount: 0,
    sets: [
      { setNumber: 1, correctCount: 2, totalTimeMs: 3000, missingTimeCount: 0 },
      { setNumber: 2, correctCount: 1, totalTimeMs: 4500, missingTimeCount: 0 },
      { setNumber: 3, correctCount: 1, totalTimeMs: 500, missingTimeCount: 0 }
    ]
  });
});

test("legacy duplicate submissions count a question once, zero time is valid, missing time is explicit", () => {
  const result = aggregateResults(questions, [row(1, false, 150), row(1, true, 350), row(1, true, 500), row(2, true, 0), row(3, true, null), row(99, true, 999)], 7);
  assert.equal(result.correctCount, 3);
  assert.equal(result.totalTimeMs, 350);
  assert.equal(result.missingTimeCount, 1);
});

test("set size changes regroup historical results without changing totals", () => {
  const submissions = [row(7, true, 750), row(8, true, 800)];
  const result = aggregateResults(questions, submissions, 5);
  assert.equal(result.correctCount, 2);
  assert.equal(result.totalTimeMs, 1550);
  assert.equal(result.sets[1].correctCount, 2);
});

test("set sizes can vary per set", () => {
  const result = aggregateResults(questions, [row(1, true, 100), row(2, true, 200), row(8, true, 800), row(9, true, 900)], [1, 7]);
  assert.equal(result.correctCount, 4);
  assert.deepEqual(result.sets.map(set => set.correctCount), [1, 2, 1]);
});

test("empty results and unanswered sets stay zero; invalid set sizes are rejected", () => {
  assert.deepEqual(aggregateResults([], [], 7), { correctCount: 0, totalTimeMs: 0, missingTimeCount: 0, sets: [] });
  assert.equal(aggregateResults(questions, [], 7).sets.length, 3);
  for (const size of [0, -1, 1.5, 1001, NaN]) assert.throws(() => aggregateResults(questions, [], size));
});

test("normal and 1-4 choice modes validate registration values", () => {
  assert.equal(isValidQuestionMode("normal"), true);
  assert.equal(isValidQuestionMode("multiple_choice"), true);
  assert.equal(isValidQuestionMode("unknown"), false);
  for (const key of ["1", "2", "3", "4"]) assert.equal(isChoiceAnswer(key), true);
  for (const key of ["", "E", "AB", "a"]) assert.equal(isChoiceAnswer(key), false);
});

test("answer normalization removes spaces and lowercases ASCII words", () => {
  assert.equal(normalizeAnswer(" Apple  Pie "), "applepie");
  assert.equal(normalizeAnswer("Ａ Ｂ Ｃ"), "abc");
  assert.equal(normalizeAnswer("  な ぞ と き  "), "なぞとき");
  assert.equal(normalizeAnswer("ナゾトキ"), "なぞとき");
  assert.equal(normalizeAnswer("ﾅｿﾞﾄｷ"), "なぞとき");
  assert.equal(normalizeAnswer("カタカナ ABC"), "かたかなabc");
});
