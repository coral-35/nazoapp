import { NextResponse } from "next/server";
import { normalizeRoomCode, jsonError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashParticipantToken } from "@/lib/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomCode = normalizeRoomCode(url.searchParams.get("room_code") || "");
  const participantToken = url.searchParams.get("participant_token") || "";

  if (!roomCode || !participantToken) {
    return jsonError("ルーム番号と参加者情報が必要です。", 400);
  }

  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("rooms")
    .select("id")
    .eq("room_code", roomCode)
    .single();

  if (!room) {
    return jsonError("ルームが見つかりません。", 404);
  }

  const { data: participant, error } = await supabase
    .from("participants")
    .select("id, name, total_score")
    .eq("room_id", room.id)
    .eq("token_hash", hashParticipantToken(participantToken))
    .single();

  if (error || !participant) {
    return jsonError("参加者情報を確認できません。", 401);
  }

  const { count: correctCount } = await supabase
    .from("score_events")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participant.id);

  return NextResponse.json({
    participantId: participant.id,
    name: participant.name,
    totalScore: participant.total_score,
    correctCount: correctCount || 0
  });
}
