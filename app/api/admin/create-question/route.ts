import { NextResponse } from "next/server";
import { DEFAULT_QUESTION_TIME_LIMIT_MS, normalizeAnswer } from "@/lib/answer";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError, toPositiveInteger } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type CreateQuestionBody = {
  roomId?: string;
  title?: string;
  answerText?: string;
  points?: number | string;
  timeLimitMs?: number | string;
  imageUrl?: string;
  imagePath?: string;
};

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  let body: CreateQuestionBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("リクエスト形式が正しくありません。");
  }

  const roomId = body.roomId || "";
  const title = (body.title || "").trim();
  const answerText = (body.answerText || "").trim();
  const points = toPositiveInteger(body.points, 10);
  const timeLimitMs = toPositiveInteger(body.timeLimitMs, DEFAULT_QUESTION_TIME_LIMIT_MS);
  const imageUrl = (body.imageUrl || "").trim() || null;
  const imagePath = (body.imagePath || "").trim() || null;

  if (!roomId || !title || !answerText) {
    return jsonError("ルーム、問題タイトル、正答を入力してください。");
  }

  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const supabase = getSupabaseAdmin();
  const { data: lastQuestion } = await supabase
    .from("questions")
    .select("order_index")
    .eq("room_id", roomId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orderIndex = Number(lastQuestion?.order_index || 0) + 1;
  const { data, error } = await supabase
    .from("questions")
    .insert({
      room_id: roomId,
      title,
      image_url: imageUrl,
      image_path: imagePath,
      answer_text: answerText,
      normalized_answer: normalizeAnswer(answerText),
      points,
      time_limit_ms: timeLimitMs,
      order_index: orderIndex,
      status: "draft"
    })
    .select("id, title, image_url, image_path, answer_text, points, time_limit_ms, order_index, status")
    .single();

  if (error || !data) {
    return jsonError("問題登録に失敗しました。", 500);
  }

  return NextResponse.json({ question: data });
}
