import { defaultRoomId } from "@/lib/default-room";
import { isValidQuestionMode, isChoiceAnswer } from "@/lib/results";
import { NextResponse } from "next/server";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_QUESTION_TIME_LIMIT_MS,
  MAX_ALLOWED_ATTEMPTS,
  normalizeAnswer
} from "@/lib/answer";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError, toPositiveInteger } from "@/lib/http";
import {
  exceedsTextLimit,
  MAX_ANSWER_LENGTH
} from "@/lib/input-limits";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type CreateQuestionBody = {
  roomId?: string;
  answerText?: string;
  answerTexts?: unknown;
  mode?: unknown;
  timeLimitMs?: number | string;
  maxAttempts?: number | string;
  imageUrl?: string;
  imagePath?: string;
  isPractice?: unknown;
};

function normalizedAnswerList(body: CreateQuestionBody, mode: "normal" | "multiple_choice") {
  const raw = Array.isArray(body.answerTexts) ? body.answerTexts : [body.answerText];
  const answers = raw
    .filter((value): value is string => typeof value === "string")
    .flatMap((value) => value.split(/\r?\n/))
    .map((value) => value.trim())
    .filter(Boolean);
  const uniqueAnswers = [...new Set(answers)];
  if (mode === "multiple_choice") {
    return uniqueAnswers.slice(0, 1);
  }
  return uniqueAnswers;
}

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

  const roomId = defaultRoomId();
  const mode = body.mode ?? "normal";
  if (!isValidQuestionMode(mode)) return jsonError("問題モードが正しくありません。");
  const answerTexts = normalizedAnswerList(body, mode);
  const answerText = answerTexts[0] || "";
  if (mode === "multiple_choice" && !isChoiceAnswer(answerText)) return jsonError("4択の正答は1〜4から選択してください。");
  const timeLimitMs = toPositiveInteger(body.timeLimitMs, DEFAULT_QUESTION_TIME_LIMIT_MS);
  const maxAttempts =
    body.maxAttempts === undefined || body.maxAttempts === ""
      ? DEFAULT_MAX_ATTEMPTS
      : Number(body.maxAttempts);
  const imageUrl = (body.imageUrl || "").trim() || null;
  const imagePath = (body.imagePath || "").trim() || null;
  const isPractice = body.isPractice === true;

  if (!roomId || !answerText) {
    return jsonError("イベントと正答を入力してください。");
  }

  if (answerTexts.some((answer) => exceedsTextLimit(answer, MAX_ANSWER_LENGTH))) {
    return jsonError(`正答は${MAX_ANSWER_LENGTH}文字以内で入力してください。`);
  }

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ALLOWED_ATTEMPTS) {
    return jsonError(`解答可能回数は1〜${MAX_ALLOWED_ATTEMPTS}の整数で指定してください。`);
  }

  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const supabase = getSupabaseAdmin();
  const { data: lastQuestion } = await supabase
    .from("questions")
    .select("order_index")
    .eq("event_id", roomId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orderIndex = Number(lastQuestion?.order_index || 0) + 1;
  const title = isPractice ? "例題" : `問題${orderIndex}`;
  const { data, error } = await supabase
    .from("questions")
    .insert({
      event_id: roomId,
      title,
      image_url: imageUrl,
      image_path: imagePath,
      answer_text: answerText,
      normalized_answer: normalizeAnswer(answerText),
      mode,
      time_limit_ms: timeLimitMs,
      max_attempts: maxAttempts,
      order_index: orderIndex,
      is_adopted: false,
      is_practice: isPractice,
      status: "draft"
    })
    .select(
      "id, title, image_url, image_path, answer_text, mode, time_limit_ms, max_attempts, order_index, is_adopted, is_practice, status"
    )
    .single();

  if (error || !data) {
    return jsonError("問題登録に失敗しました。", 500);
  }

  const { error: aliasError } = await supabase.rpc("replace_question_answer_aliases", {
    target_question_id: data.id,
    alias_texts: answerTexts.slice(1)
  });
  if (aliasError) return jsonError("正答リストの保存に失敗しました。", 500);

  return NextResponse.json({ question: data });
}
