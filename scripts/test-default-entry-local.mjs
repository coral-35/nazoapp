import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readLocalAdminConfig } from "./seed-local-admin.mjs";
import { SAMPLE_DEFAULT_ROOM_ID } from "../lib/default-room.ts";
import { restoreStoredParticipant } from "../lib/participant-storage.ts";

const config = readLocalAdminConfig();
const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } });
const { data: auth, error: loginError } = await db.auth.signInWithPassword({ email: config.email, password: config.password });
assert.equal(loginError, null);
const origin = process.env.QUIZ_TEST_ORIGIN || "http://127.0.0.1:3101";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const home = await fetch(origin, { redirect: "manual" });
assert.equal(home.status, 307);
assert.equal(home.headers.get("location"), "/join");
const entry = await fetch(`${origin}/join`);
assert.equal(entry.status, 200);
assert.ok(!(await entry.text()).includes("イベント番号"));
const destination = await (await fetch(`${origin}/api/default-room`)).json();
assert.equal(destination.status, "waiting");
let participantId;
let cookie = "";
try {
  const joinedResponse = await fetch(`${origin}/api/join-room`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantName: `entry-test-${randomUUID().slice(0, 8)}` })
  });
  assert.equal(joinedResponse.status, 200);
  cookie = joinedResponse.headers.get("set-cookie").split(";")[0];
  const joined = await joinedResponse.json();
  participantId = joined.participant.id;
  assert.equal(joined.room.id, SAMPLE_DEFAULT_ROOM_ID);
  assert.equal(joined.room.roomCode, destination.roomCode);
  const saved = { participantToken: joined.participantToken, participantName: joined.participant.name, roomCode: destination.roomCode };
  const store = { removed: false, getItem() { return JSON.stringify(saved); }, removeItem() { this.removed = true; } };
  const validate = async participant => (await fetch(`${origin}/api/my-score?${new URLSearchParams({ room_code: destination.roomCode, participant_token: participant.participantToken })}`, { headers: { Cookie: cookie } })).status;
  assert.deepEqual(await restoreStoredParticipant(store, destination.roomCode, validate), saved);
  const resumed = await fetch(`${origin}/api/join-room`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ participantName: "端末復帰確認" })
  });
  assert.equal(resumed.status, 200);
  const sameParticipant = await resumed.json();
  assert.equal(sameParticipant.participant.id, participantId);
  assert.equal(sameParticipant.participant.name, joined.participant.name);
  assert.equal(await restoreStoredParticipant(store, destination.roomCode, validate), null, "Rotated token returns to entry");
  assert.equal(store.removed, true);
  saved.participantToken = sameParticipant.participantToken;
  assert.deepEqual(await restoreStoredParticipant(store, destination.roomCode, validate), saved);
  const resultUrl = `${origin}/api/results?participant_token=${encodeURIComponent(saved.participantToken)}`;
  const settings = await (await fetch(`${origin}/api/admin/event`, { headers: { Authorization: `Bearer ${auth.session.access_token}` } })).json();
  const originalDisplay = settings.room.show_results;
  const toggle = async showResults => {
    const response = await fetch(`${origin}/api/admin/event`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` }, body: JSON.stringify({ showResults }) });
    assert.equal(response.status, 200);
  };
  try {
    assert.equal((await fetch(`${origin}/api/admin/event`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showResults: true }) })).status, 401);
    await toggle(false);
    assert.equal((await fetch(resultUrl, { headers: { Cookie: cookie } })).status, 403);
    await toggle(true);
    const published = await fetch(resultUrl, { headers: { Cookie: cookie } });
    assert.equal(published.status, 200);
    assert.equal((await published.json()).scores.length, settings.participants.length);
    assert.equal((await fetch(`${origin}/api/results`)).status, 400);
    const state = await (await fetch(`${origin}/api/current-question?${new URLSearchParams({ room_code: destination.roomCode, participant_token: saved.participantToken })}`, { headers: { Cookie: cookie } })).json();
    assert.equal(state.room.showResults, true);
    await toggle(false);
    assert.equal((await fetch(resultUrl, { headers: { Cookie: cookie } })).status, 403);
  } finally { await toggle(originalDisplay); }
  const play = await fetch(`${origin}/play`, { headers: { Cookie: cookie } });
  assert.equal(play.status, 200);
  console.log("PASS: home redirect, name-only entry, default sample, valid cache, expired cache, device recovery, /play response");
} finally {
  if (participantId) {
    assert.match(participantId, /^[0-9a-f-]{36}$/);
    execFileSync("docker", ["exec", "supabase_db_quiz", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DELETE FROM public.participants WHERE id = '${participantId}' AND event_id = '${SAMPLE_DEFAULT_ROOM_ID}'`], { stdio: "pipe" });
  }
}
