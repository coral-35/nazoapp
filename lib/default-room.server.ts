import { defaultRoomId } from "@/lib/default-room";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function getDefaultRoom() {
  const { data, error } = await getSupabaseAdmin().from("rooms")
    .select("id, room_code, title, status").eq("id", defaultRoomId()).single();
  if (error || !data) throw new Error("参加先がまだ準備されていません。出題者に確認してください。");
  return data;
}
