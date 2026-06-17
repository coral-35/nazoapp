import { NextResponse } from "next/server";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId") || "";

  if (!roomId) {
    return jsonError("ルームを指定してください。");
  }

  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, total_score, created_at")
    .eq("room_id", roomId)
    .order("total_score", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return jsonError("得点一覧の取得に失敗しました。", 500);
  }

  return NextResponse.json({ scores: data || [] });
}
