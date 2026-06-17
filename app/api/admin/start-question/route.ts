import { NextResponse } from "next/server";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type StartQuestionBody = {
  roomId?: string;
  questionId?: string;
};

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  let body: StartQuestionBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("リクエスト形式が正しくありません。");
  }

  const roomId = body.roomId || "";
  const questionId = body.questionId || "";

  if (!roomId || !questionId) {
    return jsonError("ルームと開始する問題を指定してください。");
  }

  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const supabase = getSupabaseAdmin();
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .eq("room_id", roomId)
    .single();

  if (questionError || !question) {
    return jsonError("開始する問題が見つかりません。", 404);
  }

  await supabase.from("questions").update({ status: "closed" }).eq("room_id", roomId);
  const { error: openError } = await supabase
    .from("questions")
    .update({ status: "open" })
    .eq("id", questionId)
    .eq("room_id", roomId);

  if (openError) {
    return jsonError("問題開始に失敗しました。", 500);
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .update({
      status: "question_open",
      current_question_id: questionId
    })
    .eq("id", roomId)
    .eq("created_by", auth.user.id)
    .select("id, room_code, title, status, current_question_id")
    .single();

  if (roomError || !room) {
    return jsonError("ルーム状態の更新に失敗しました。", 500);
  }

  return NextResponse.json({ room });
}
