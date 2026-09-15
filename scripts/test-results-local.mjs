import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readLocalAdminConfig } from "./seed-local-admin.mjs";

const config = readLocalAdminConfig();
const origin = process.env.QUIZ_TEST_ORIGIN || "http://127.0.0.1:3101";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } });
const { data: auth, error } = await db.auth.signInWithPassword({ email: config.email, password: config.password });
assert.equal(error, null, "Local admin login must succeed");
let cookie = "";
let roomId;
async function api(path, body, admin = false, expected = 200, method = body ? "POST" : "GET") {
  const response = await fetch(`${origin}/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(admin ? { Authorization: `Bearer ${auth.session.access_token}` } : { Cookie: cookie }) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!admin && response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  assert.equal(response.status, expected, `${method} ${path.split("?")[0]} status`);
  return response.json();
}
try {
  const { room } = await api("admin/create-room", { title: "Local results regression", questionsPerSet: 2 }, true);
  roomId = room.id;
  await api(`admin/rooms/${room.id}`, { questionsPerSet: 0 }, true, 400, "PATCH");
  const joined = await api("join-room", { roomCode: room.room_code, participantName: "Regression participant" });
  assert.equal("totalScore" in joined.participant, false);
  const participantQuery = new URLSearchParams({ room_code: room.room_code, participant_token: joined.participantToken });
  for (const [mode, answerText] of [["unknown", "A"], ["multiple_choice", "E"]]) {
    await api("admin/create-question", { roomId, title: "Invalid question", mode, answerText }, true, 400);
  }
  const cases = [
    { mode: "normal", answerText: "答え", finalStatus: "correct", time: 1250 },
    { mode: "multiple_choice", answerText: "B", finalStatus: "attempt_limit_exceeded", finalAnswer: "A", time: 2000 },
    { mode: "multiple_choice", answerText: "D", finalStatus: "correct", time: 3500 },
    { mode: "normal", answerText: "時間切れ", finalStatus: "timeout", finalAnswer: "", time: 30000 }
  ];
  for (const [index, item] of cases.entries()) {
    const { question } = await api("admin/create-question", { roomId, title: `Question ${index + 1}`, mode: item.mode, answerText: item.answerText }, true);
    await api("admin/start-question", { roomId, questionId: question.id }, true);
    const current = await api(`current-question?${participantQuery}`);
    assert.equal(current.question.mode, item.mode);
    assert.equal(current.question.setNumber, Math.floor(index / 2) + 1);
    const submission = { roomCode: room.room_code, participantToken: joined.participantToken, questionId: question.id, finalStatus: item.finalStatus, finalAnswer: item.finalAnswer ?? item.answerText, answerElapsedMs: item.time, attemptCount: 1, maxAttempts: 1 };
    if (item.mode === "multiple_choice") await api("submit-answer", { ...submission, finalAnswer: "E" }, false, 400);
    const result = await api("submit-answer", submission);
    assert.equal("awardedPoints" in result, false);
    await api("submit-answer", submission, false, 409);
    const after = await api(`current-question?${participantQuery}`);
    assert.equal(after.hasSubmission, true);
    assert.equal(after.hasCorrectSubmission, item.finalStatus === "correct");
  }
  const score = await api(`my-score?${participantQuery}`);
  assert.equal(score.correctCount, 2);
  assert.equal(score.totalTimeMs, 4750);
  assert.deepEqual(score.sets.map(s => [s.correctCount, s.totalTimeMs]), [[1, 1250], [1, 3500]]);
  const detail = await api(`admin/rooms/${roomId}`, undefined, true);
  assert.equal(detail.participants[0].results.totalTimeMs, 4750);
  const scores = await api(`admin/scores?roomId=${roomId}`, undefined, true);
  assert.equal(scores.scores[0].correctCount, 2);
  await api(`admin/rooms/${roomId}`, { questionsPerSet: 7 }, true, 200, "PATCH");
  const regrouped = await api(`my-score?${participantQuery}`);
  assert.deepEqual(regrouped.sets.map(s => [s.correctCount, s.totalTimeMs]), [[2, 4750]]);
  const service = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } });
  const { count, error: scoreError } = await service.from("score_events").select("id", { count: "exact", head: true }).eq("room_id", roomId);
  assert.equal(scoreError, null);
  assert.equal(count, 0);
  console.log("PASS: question modes, submissions, duplicate prevention, totals, set regrouping, no score events");
} finally {
  if (roomId) {
    assert.match(roomId, /^[0-9a-f-]{36}$/);
    execFileSync("docker", ["exec", "supabase_db_quiz", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DELETE FROM public.rooms WHERE id = '${roomId}'`], { stdio: "pipe" });
  }
}
