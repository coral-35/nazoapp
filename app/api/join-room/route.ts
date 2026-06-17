import { NextResponse } from "next/server";
import { normalizeRoomCode, jsonError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createParticipantToken, hashParticipantToken } from "@/lib/tokens";

export async function POST(request: Request) {
  let body: { roomCode?: string; participantName?: string };

  try {
    body = await request.json();
  } catch {
    return jsonError("リクエスト形式が正しくありません。");
  }

  const roomCode = normalizeRoomCode(body.roomCode || "");
  const participantName = (body.participantName || "").trim();

  if (!roomCode) {
    return jsonError("ルーム番号を入力してください。");
  }

  if (!participantName) {
    return jsonError("参加者名を入力してください。");
  }

  const supabase = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, room_code, title, status")
    .eq("room_code", roomCode)
    .single();

  if (roomError || !room) {
    return jsonError("指定されたルームが見つかりません。", 404);
  }

  if (room.status === "draft" || room.status === "finished") {
    return jsonError("このルームは現在参加できません。", 409);
  }

  const token = createParticipantToken();
  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .insert({
      room_id: room.id,
      name: participantName,
      token_hash: hashParticipantToken(token)
    })
    .select("id, name, total_score")
    .single();

  if (participantError) {
    if (participantError.code === "23505") {
      return jsonError("同じ名前の参加者がすでにいます。別の名前で参加してください。", 409);
    }
    return jsonError("参加登録に失敗しました。", 500);
  }

  return NextResponse.json({
    room: {
      id: room.id,
      roomCode: room.room_code,
      title: room.title,
      status: room.status
    },
    participant: {
      id: participant.id,
      name: participant.name,
      totalScore: participant.total_score
    },
    participantToken: token
  });
}
