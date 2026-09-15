import { createClient } from "@supabase/supabase-js";
import { readLocalAdminConfig } from "./seed-local-admin.mjs";
import { SAMPLE_DEFAULT_ROOM_ID, defaultRoomId } from "../lib/default-room.ts";
import { SAMPLE_TITLE } from "./sample-results-data.mjs";

const config = readLocalAdminConfig();
if (defaultRoomId() !== SAMPLE_DEFAULT_ROOM_ID) throw new Error("サンプル以外の既定ルームは変更しません。");
const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: room, error } = await db.from("rooms").select("id, title, status").eq("id", SAMPLE_DEFAULT_ROOM_ID).single();
if (error || !room) throw new Error("先に npm run seed:results:local でサンプルを作成してください。");
if (room.title !== SAMPLE_TITLE) throw new Error("想定するサンプルルームと一致しません。");
if (room.status === "finished" || room.status === "draft") {
  const { error: updateError } = await db.from("rooms").update({ status: "waiting", current_question_id: null }).eq("id", room.id);
  if (updateError) throw new Error(updateError.message);
}
console.log("サンプルを既定の参加先として受付開始しました。既存の成績データは保持しています。\n入口: / → /join → /play");
