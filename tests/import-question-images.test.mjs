import assert from "node:assert/strict";
import test from "node:test";
import { orderedQuestionImages } from "../scripts/import-question-images-local.mjs";

test("question images are sorted numerically from Frame 101 through 121", () => {
  const names = Array.from({ length: 21 }, (_, index) => `Frame ${121 - index}.png`);
  assert.deepEqual(orderedQuestionImages([".DS_Store", ...names]).map(item => item.number),
    Array.from({ length: 21 }, (_, index) => 101 + index));
});

test("question image import rejects missing or unexpected sequences", () => {
  assert.throws(() => orderedQuestionImages(["Frame 101.png"]), /21枚/);
  const names = Array.from({ length: 21 }, (_, index) => `Frame ${100 + index}.png`);
  assert.throws(() => orderedQuestionImages(names), /101.png/);
});
