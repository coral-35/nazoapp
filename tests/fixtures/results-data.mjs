import { createHash } from "node:crypto";

export const FIXTURE_TITLE = "テスト用イベント";
export function fixtureId(key) {
  const hex = createHash("sha256").update(`quiz-results-fixture-v1:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function createSampleResults() {
  const roomId = fixtureId("room");
  const participants = Array.from({ length: 50 }, (_, i) => ({
    id: fixtureId(`participant:${i}`), event_id: roomId,
    name: `テスト参加者${String(i + 1).padStart(2, "0")}`
  }));
  const questions = Array.from({ length: 21 }, (_, i) => ({
    id: fixtureId(`question:${i}`), event_id: roomId,
    title: `セット${Math.floor(i / 7) + 1}・第${i % 7 + 1}問`,
    mode: i % 2 ? "multiple_choice" : "normal",
    answer_text: i % 2 ? "A" : "こたえ", normalized_answer: i % 2 ? "a" : "こたえ",
    order_index: i + 1, status: "closed", time_limit_ms: 30000, max_attempts: 1
  }));
  const submissions = participants.flatMap((participant, p) => questions.map((question, q) => {
    // Participants 01 and 02 share first place; 49 and 50 have zero correct answers.
    const correct = p < 2 || (p < 48 && (p * 17 + q * 13) % 100 < 90 - p);
    const timeout = !correct && (p === 49 || (p + q) % 3 === 0);
    const elapsed = correct
      ? p < 2 ? 3000 + q * 125 : 4500 + (p * 937 + q * 1601) % 24000
      : timeout ? 30000 : 5000 + (p * 733 + q * 971) % 24000;
    const answer = correct ? question.answer_text : timeout ? "" : question.mode === "multiple_choice" ? "B" : "不正解";
    return {
      id: fixtureId(`submission:${p}:${q}`), event_id: roomId, participant_id: participant.id, question_id: question.id,
      submitted_answer: answer, normalized_submitted_answer: answer.toLowerCase(), final_answer: answer,
      is_correct: correct, final_status: correct ? "correct" : timeout ? "timeout" : "attempt_limit_exceeded",
      answer_elapsed_ms: elapsed, attempt_count: timeout ? 0 : 1, max_attempts_snapshot: 1,
      answered_before_reveal: false, awarded_points: 0
    };
  }));
  return { roomId, participants, questions, submissions };
}
