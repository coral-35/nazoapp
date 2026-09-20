import assert from "node:assert/strict";
import test from "node:test";
import { alphabeticQuestionLabel, questionPlacement } from "../lib/question-placement.ts";

test("question slots use alphabetic labels", () => {
  assert.equal(alphabeticQuestionLabel(0), "A");
  assert.equal(alphabeticQuestionLabel(25), "Z");
  assert.equal(alphabeticQuestionLabel(26), "AA");
});
test("seven questions are grouped into numbered sets", () => {
  assert.deepEqual(questionPlacement(1, 7), { setNumber: 1, label: "A" });
  assert.deepEqual(questionPlacement(7, 7), { setNumber: 1, label: "G" });
  assert.deepEqual(questionPlacement(8, 7), { setNumber: 2, label: "A" });
  assert.deepEqual(questionPlacement(21, 7), { setNumber: 3, label: "G" });
});
