import assert from "node:assert/strict";
import test from "node:test";
import { exceedsTextLimit } from "../lib/input-limits.ts";
import {
  questionStatusPresentation,
  roomStatusPresentation
} from "../lib/status-labels.ts";

test("room and question statuses use production-facing Japanese labels", () => {
  assert.deepEqual(roomStatusPresentation("question_open"), {
    label: "出題中",
    tone: "open"
  });
  assert.deepEqual(questionStatusPresentation("closed"), {
    label: "締切済み",
    tone: "closed"
  });
  assert.equal(roomStatusPresentation("unexpected").label, "状態不明");
});

test("text limits count Unicode characters instead of UTF-16 units", () => {
  assert.equal(exceedsTextLimit("謎".repeat(50), 50), false);
  assert.equal(exceedsTextLimit("🧩".repeat(51), 50), true);
});
