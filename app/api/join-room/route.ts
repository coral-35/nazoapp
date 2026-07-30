import { NextRequest, NextResponse } from "next/server";
import {
  attachDeviceCookie,
  getRequestDeviceIdentity
} from "@/lib/device-identity.server";
import { normalizeRoomCode, jsonError } from "@/lib/http";
import { isValidRoomCode } from "@/lib/room-code";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createParticipantToken, hashParticipantToken } from "@/lib/tokens";

export async function POST(request: NextRequest) {
  let body: { roomCode?: string; participantName?: string };

  try {
    body = await request.json();
  } catch {
    return jsonError("リクエスト形式が正しくありません。");
  }

  const roomCode = normalizeRoomCode(body.roomCode || "");
  const participantName = (body.participantName || "").trim();

  if (!isValidRoomCode(roomCode)) {
    return jsonError("ルーム番号は6桁の数字で入力してください。");
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

  const deviceIdentity = getRequestDeviceIdentity(request);
  const { data: existingDeviceParticipant } = await supabase
    .from("participants")
    .select("id")
    .eq("room_id", room.id)
    .eq("device_token_hash", deviceIdentity.hash)
    .maybeSingle();

  if (existingDeviceParticipant) {
    return attachDeviceCookie(
      NextResponse.json(
        {
          code: "DEVICE_ALREADY_JOINED",
          error: "この端末はすでにこのルームへ参加しています。"
        },
        { status: 409 }
      ),
      deviceIdentity
    );
  }

  const token = createParticipantToken();
  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .insert({
      room_id: room.id,
      name: participantName,
      token_hash: hashParticipantToken(token),
      device_token_hash: deviceIdentity.hash
    })
    .select("id, name, total_score")
    .single();

  if (participantError) {
    if (participantError.code === "23505") {
      const { data: duplicateDeviceParticipant } = await supabase
        .from("participants")
        .select("id")
        .eq("room_id", room.id)
        .eq("device_token_hash", deviceIdentity.hash)
        .maybeSingle();
      if (duplicateDeviceParticipant) {
        return attachDeviceCookie(
          NextResponse.json(
            {
              code: "DEVICE_ALREADY_JOINED",
              error: "この端末はすでにこのルームへ参加しています。"
            },
            { status: 409 }
          ),
          deviceIdentity
        );
      }
      return jsonError("同じ名前の参加者がすでにいます。別の名前で参加してください。", 409);
    }
    return jsonError("参加登録に失敗しました。", 500);
  }

  return attachDeviceCookie(
    NextResponse.json({
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
    }),
    deviceIdentity
  );
}
