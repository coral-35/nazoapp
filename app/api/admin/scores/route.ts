import { loadResults } from "@/lib/results.server";
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
    .select("id, name, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonError("成績一覧の取得に失敗しました。", 500);
  }

  const { data: room, error: roomError } = await supabase.from("rooms").select("questions_per_set").eq("id", roomId).single();
  if (roomError || !room) return jsonError("ルーム情報を取得できませんでした。", 500);
  const resultsFor = await loadResults(roomId, room.questions_per_set);
  const scores = (data || []).map(p => ({ ...p, ...resultsFor(p.id) }));
  scores.sort((a, b) => b.correctCount - a.correctCount || a.missingTimeCount - b.missingTimeCount || a.totalTimeMs - b.totalTimeMs);
  return NextResponse.json({ scores });
}
