import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readLocalAdminConfig } from "./seed-local-admin.mjs";
import { createSampleResults } from "./sample-results-data.mjs";
import { aggregateResults, rankResults } from "../lib/results.ts";

const config = readLocalAdminConfig();
const origin = process.env.QUIZ_TEST_ORIGIN || "http://127.0.0.1:3101";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await db.auth.signInWithPassword({ email: config.email, password: config.password });
assert.equal(error, null);
const sample = createSampleResults();
const url = `${origin}/api/admin/scores?roomId=${sample.roomId}`;
assert.equal((await fetch(url)).status, 401, "Results require administrator authentication");
const response = await fetch(url, { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
assert.equal(response.status, 200);
const results = await response.json();
assert.equal(results.scores.length, 50);
const eventResponse = await fetch(`${origin}/api/admin/event`, { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
assert.equal(eventResponse.status, 200);
assert.equal((await eventResponse.json()).room.id, sample.roomId);
const ignoredSelection = await fetch(`${origin}/api/admin/scores?roomId=not-an-event`, { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
assert.equal((await ignoredSelection.json()).room.id, sample.roomId);
assert.equal((await fetch(`${origin}/api/admin/create-room`, { method: "POST" })).status, 404);
const participantEntry = await (await fetch(`${origin}/join`)).text();
assert.ok(!participantEntry.includes('href="/admin'));

assert.equal(results.questionCount, 21);
assert.equal(results.setCount, 3);
for (const p of sample.participants) {
  const expected = aggregateResults(sample.questions, sample.submissions.filter(s => s.participant_id === p.id), 7);
  const actual = results.scores.find(row => row.id === p.id);
  assert.ok(actual);
  assert.equal(actual.correctCount, expected.correctCount);
  assert.equal(actual.totalTimeMs, expected.totalTimeMs);
  assert.deepEqual(actual.sets, expected.sets);
}
for (const set of [null, 1, 2, 3]) {
  const ranking = rankResults(results.scores, set);
  assert.equal(ranking.length, 50);
  assert.deepEqual(ranking.slice(0, 3).map(row => row.rank), [1, 1, 3]);
}
assert.equal((await fetch(`${origin}/admin/results`)).status, 200);
console.log("PASS: protected results API, 50 participants, 21 questions, 3 sets, all stored totals, tied rankings, results page response");
