import assert from "node:assert/strict";
import test from "node:test";
import { aggregateResults, rankResults } from "../lib/results.ts";
import { createSampleResults } from "../scripts/sample-results-data.mjs";

const player = (id, count, time, missing = 0, sets = []) => ({ id, name: id, correctCount: count, totalTimeMs: time, missingTimeCount: missing, sets });

test("rank primarily by correct count, then time; equal results share competition rank", () => {
  const input = [player("D", 6, 1), player("C", 7, 101), player("B", 7, 100), player("A", 7, 100)];
  assert.deepEqual(rankResults(input).map(r => [r.id, r.rank]), [["A", 1], ["B", 1], ["C", 3], ["D", 4]]);
  assert.equal(input[0].id, "D");
});

test("set ranking uses set results rather than overall totals and compares milliseconds", () => {
  const input = [
    player("A", 20, 10000, 0, [{ setNumber: 1, correctCount: 3, totalTimeMs: 1001, missingTimeCount: 0 }]),
    player("B", 10, 20000, 0, [{ setNumber: 1, correctCount: 3, totalTimeMs: 1000, missingTimeCount: 0 }])
  ];
  assert.deepEqual(rankResults(input, 1).map(r => r.id), ["B", "A"]);
  assert.deepEqual(rankResults(input).map(r => r.id), ["A", "B"]);
});

test("missing time is not treated as zero, and empty and unanswered results are supported", () => {
  assert.deepEqual(rankResults([]), []);
  assert.deepEqual(rankResults([player("A", 3, 0, 1), player("B", 3, 5000)]).map(r => r.id), ["B", "A"]);
  assert.equal(rankResults([player("A", 0, 0)], 1)[0].result.correctCount, 0);
});

test("sample has 50 synthetic participants, three seven-question sets and 1050 consistent answers", () => {
  const sample = createSampleResults();
  assert.equal(sample.participants.length, 50);
  assert.equal(sample.questions.length, 21);
  assert.equal(sample.submissions.length, 1050);
  assert.equal(new Set(sample.submissions.map(s => s.id)).size, 1050);
  assert.deepEqual(createSampleResults(), sample);
  for (const submission of sample.submissions) {
    assert.equal(submission.is_correct, submission.final_status === "correct");
    assert.ok(submission.answer_elapsed_ms >= 0 && submission.answer_elapsed_ms <= 30000);
  }
  const participants = sample.participants.map(p => ({ ...p, ...aggregateResults(sample.questions, sample.submissions.filter(s => s.participant_id === p.id), 7) }));
  for (const p of participants) {
    assert.equal(p.sets.length, 3);
    assert.equal(p.correctCount, p.sets.reduce((sum, set) => sum + set.correctCount, 0));
    assert.equal(p.totalTimeMs, p.sets.reduce((sum, set) => sum + set.totalTimeMs, 0));
  }
  for (const set of [null, 1, 2, 3]) {
    const ranked = rankResults(participants, set);
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].rank, 1);
    assert.equal(ranked[2].rank, 3);
    assert.equal(ranked.at(-1).result.correctCount, 0);
  }
});
