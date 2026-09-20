import { defaultRoomId } from "@/lib/default-room";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_QUESTION_TIME_LIMIT_MS,
  MAX_ALLOWED_ATTEMPTS,
  normalizeAnswer
} from "@/lib/answer";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError, toPositiveInteger } from "@/lib/http";
import { MAX_ANSWER_LENGTH, exceedsTextLimit } from "@/lib/input-limits";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isChoiceAnswer, isValidQuestionMode } from "@/lib/results";
type Context = { params: Promise<{ questionId: string }> };
export async function PATCH(request: Request, context: Context) {
  const auth = await requireAdminUser(request); if (!auth.ok) return jsonError(auth.message, auth.status);
  const eventId = defaultRoomId(); const owner = await ensureRoomOwner(eventId, auth.user.id); if (!owner.ok) return jsonError(owner.message, owner.status);
  const { questionId } = await context.params; let body: {
    answerText?: unknown;
    answerTexts?: unknown;
    mode?: unknown;
    timeLimitMs?: unknown;
    maxAttempts?: unknown;
    imagePath?: unknown;
    imageUrl?: unknown;
    isPractice?: unknown;
  };
  try { body = await request.json(); } catch { return jsonError("リクエスト形式が正しくありません。"); }
  const supabase = getSupabaseAdmin();
  const { data: question } = await supabase.from("questions").select("mode, image_path, image_url").eq("id", questionId).eq("event_id", eventId).single();
  if (!question) return jsonError("問題候補が見つかりません。", 404);
  const mode = body.mode ?? question.mode;
  if (!isValidQuestionMode(mode)) return jsonError("問題モードが正しくありません。");
  const rawAnswers = Array.isArray(body.answerTexts) ? body.answerTexts : [body.answerText];
  const answerTexts = [...new Set(rawAnswers
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))];
  const answers = mode === "multiple_choice" ? answerTexts.slice(0, 1) : answerTexts;
  const answerText = answers[0] || "";
  if (!answerText) return jsonError("正答を入力してください。");
  if (mode === "multiple_choice" && !isChoiceAnswer(answerText)) return jsonError("4択の正答は1〜4から選択してください。");
  if (answers.some((answer) => exceedsTextLimit(answer, MAX_ANSWER_LENGTH))) return jsonError("入力文字数が上限を超えています。");
  const maxAttempts =
    body.maxAttempts === undefined || body.maxAttempts === ""
      ? DEFAULT_MAX_ATTEMPTS
      : Number(body.maxAttempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ALLOWED_ATTEMPTS) return jsonError(`解答可能回数は1〜${MAX_ALLOWED_ATTEMPTS}の整数で指定してください。`);
  const timeLimitMs = toPositiveInteger(body.timeLimitMs, DEFAULT_QUESTION_TIME_LIMIT_MS);
  const updates = {
    answer_text: answerText,
    normalized_answer: normalizeAnswer(answerText),
    mode,
    time_limit_ms: timeLimitMs,
    max_attempts: maxAttempts,
    image_path: typeof body.imagePath === "string" && body.imagePath.trim() ? body.imagePath.trim() : question.image_path,
    image_url: typeof body.imageUrl === "string" && body.imageUrl.trim() ? body.imageUrl.trim() : question.image_url,
    is_practice: body.isPractice === true
  };
  const { data, error } = await supabase.from("questions").update(updates).eq("id", questionId).eq("event_id", eventId).select("id").single();
  if (error || !data) return jsonError("問題候補を更新できませんでした。", 500);
  const { error: aliasError } = await supabase.rpc("replace_question_answer_aliases", { target_question_id: questionId, alias_texts: answers.slice(1) });
  if (aliasError) return jsonError("正答リストを更新できませんでした。", 500);
  return NextResponse.json({ success: true });
}
