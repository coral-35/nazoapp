import { defaultRoomId } from "@/lib/default-room";
import { normalizeAnswer } from "@/lib/answer";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_TITLE_LENGTH, exceedsTextLimit } from "@/lib/input-limits";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isChoiceAnswer } from "@/lib/results";
type Context = { params: Promise<{ questionId: string }> };
export async function PATCH(request: Request, context: Context) {
  const auth = await requireAdminUser(request); if (!auth.ok) return jsonError(auth.message, auth.status);
  const eventId = defaultRoomId(); const owner = await ensureRoomOwner(eventId, auth.user.id); if (!owner.ok) return jsonError(owner.message, owner.status);
  const { questionId } = await context.params; let body: { title?: unknown; answerText?: unknown };
  try { body = await request.json(); } catch { return jsonError("リクエスト形式が正しくありません。"); }
  const title = typeof body.title === "string" ? body.title.trim() : ""; const answerText = typeof body.answerText === "string" ? body.answerText.trim() : "";
  if (!title || !answerText) return jsonError("問題タイトルと正答を入力してください。");
  if (exceedsTextLimit(title, MAX_QUESTION_TITLE_LENGTH) || exceedsTextLimit(answerText, MAX_ANSWER_LENGTH)) return jsonError("入力文字数が上限を超えています。");
  const supabase = getSupabaseAdmin();
  const { data: question } = await supabase.from("questions").select("mode").eq("id", questionId).eq("event_id", eventId).single();
  if (!question) return jsonError("問題候補が見つかりません。", 404);
  if (question.mode === "multiple_choice" && !isChoiceAnswer(answerText)) return jsonError("4択の正答はA〜Dから選択してください。");
  const { data, error } = await supabase.from("questions").update({ title, answer_text: answerText, normalized_answer: normalizeAnswer(answerText) }).eq("id", questionId).eq("event_id", eventId).select("id").single();
  if (error || !data) return jsonError("問題候補を更新できませんでした。", 500);
  return NextResponse.json({ success: true });
}
