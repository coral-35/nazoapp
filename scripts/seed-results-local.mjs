import { randomBytes, randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readLocalAdminConfig, seedLocalAdmin } from "./seed-local-admin.mjs";
import { createSampleResults, SAMPLE_TITLE } from "./sample-results-data.mjs";

const config = readLocalAdminConfig(); // Reject remote databases before performing any writes.
const { userId } = await seedLocalAdmin({ logger: { log() {} } });
const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
function check(error) { if (error) throw new Error(error.message); }
const sample = createSampleResults();
const { data: existing, error: lookupError } = await db.from("event_settings").select("id, title, created_by, room_code").eq("id", sample.roomId).maybeSingle();
check(lookupError);
if (existing && (existing.title !== SAMPLE_TITLE || existing.created_by !== userId)) {
  throw new Error("サンプル用IDが別のイベントで使用されています。処理を中止しました。");
}
let roomCode = existing?.room_code;
if (!existing) {
  for (let attempt = 0; attempt < 10; attempt++) {
    roomCode = String(randomInt(1000000)).padStart(6, "0");
    const { error } = await db.from("event_settings").insert({ id: sample.roomId, room_code: roomCode, title: SAMPLE_TITLE, created_by: userId, questions_per_set: 7, status: "finished" });
    if (!error) break;
    if (error.code !== "23505" || attempt === 9) check(error);
  }
}
// Stable IDs keep repeated runs from adding duplicate participants or submissions.
for (const participant of sample.participants) {
  const { error } = await db.from("participants").upsert({ ...participant, token_hash: randomBytes(32).toString("hex") }, { onConflict: "id" });
  check(error);
}
check((await db.from("questions").upsert(sample.questions, { onConflict: "id" })).error);
for (let offset = 0; offset < sample.submissions.length; offset += 250) {
  check((await db.from("submissions").upsert(sample.submissions.slice(offset, offset + 250), { onConflict: "id" })).error);
}
check((await db.from("event_settings").update({ questions_per_set: 7, status: "finished", current_question_id: null }).eq("id", sample.roomId)).error);
for (const [table, expected] of [["participants", 50], ["questions", 21], ["submissions", 1050]]) {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("event_id", sample.roomId);
  check(error);
  if (count !== expected) throw new Error(`${table}: 件数が想定と異なります。`);
}
console.log(`サンプル作成完了: 50人 / 21問 / 1050解答 / 3セット\nイベント番号: ${roomCode}\n結果発表: /admin/results`);
