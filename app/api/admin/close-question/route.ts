import { NextResponse } from "next/server";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type CloseQuestionBody = {
  roomId?: string;
};

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  let body: CloseQuestionBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("リクエスト形式が正しくありません。");
  }

  const roomId = body.roomId || "";
  if (!roomId) {
    return jsonError("ルームを指定してください。");
  }

  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("rooms")
    .select("current_question_id")
    .eq("id", roomId)
    .eq("created_by", auth.user.id)
    .single();

  if (room?.current_question_id) {
    await supabase
      .from("questions")
      .update({ status: "closed" })
      .eq("id", room.current_question_id)
      .eq("room_id", roomId);
  }

  const { data: updatedRoom, error } = await supabase
    .from("rooms")
    .update({ status: "question_closed" })
    .eq("id", roomId)
    .eq("created_by", auth.user.id)
    .select("id, room_code, title, status, current_question_id")
    .single();

  if (error || !updatedRoom) {
    return jsonError("締切処理に失敗しました。", 500);
  }

  return NextResponse.json({ room: updatedRoom });
}
