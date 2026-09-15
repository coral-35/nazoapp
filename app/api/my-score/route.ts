import { loadResults } from "@/lib/results.server";
import { NextRequest, NextResponse } from "next/server";
import {
  attachDeviceCookie,
  bindParticipantToDevice,
  getRequestDeviceIdentity
} from "@/lib/device-identity.server";
import { normalizeRoomCode, jsonError } from "@/lib/http";
import { isValidRoomCode } from "@/lib/room-code";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashParticipantToken } from "@/lib/tokens";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const roomCode = normalizeRoomCode(url.searchParams.get("room_code") || "");
  const participantToken = url.searchParams.get("participant_token") || "";

  if (!isValidRoomCode(roomCode) || !participantToken) {
    return jsonError("イベント番号と参加者情報が必要です。", 400);
  }

  const supabase = getSupabaseAdmin();
  const deviceIdentity = getRequestDeviceIdentity(request);
  const { data: room } = await supabase
    .from("event_settings")
    .select("id, questions_per_set")
    .eq("room_code", roomCode)
    .single();

  if (!room) {
    return jsonError("イベントが見つかりません。", 404);
  }

  const { data: participant, error } = await supabase
    .from("participants")
    .select("id, name, device_token_hash")
    .eq("event_id", room.id)
    .eq("token_hash", hashParticipantToken(participantToken))
    .single();

  if (error || !participant) {
    return jsonError("参加者情報を確認できません。", 401);
  }

  if (!(await bindParticipantToDevice(supabase, participant, deviceIdentity.hash))) {
    return jsonError("この参加情報は別の端末に紐付いています。", 401);
  }

  const resultsFor = await loadResults(room.id, room.questions_per_set, participant.id);

  return attachDeviceCookie(
    NextResponse.json({
      participantId: participant.id,
      name: participant.name,
      ...resultsFor(participant.id)
    }),
    deviceIdentity
  );
}
