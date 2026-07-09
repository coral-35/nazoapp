import { NextResponse } from "next/server";
import {
  ANSWER_GRACE_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_QUESTION_TIME_LIMIT_MS,
  isValidAnswerElapsedMsValue,
  normalizeAnswer,
  validateAnswerElapsedMs
} from "@/lib/answer";
import { normalizeRoomCode, jsonError, toPositiveInteger } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashParticipantToken } from "@/lib/tokens";

const FINAL_STATUSES = ["correct", "timeout", "attempt_limit_exceeded"] as const;
type FinalStatus = (typeof FINAL_STATUSES)[number];

type SubmitBody = {
  roomCode?: string;
  participantId?: string;
  participantToken?: string;
  questionId?: string;
  finalStatus?: string;
  isCorrect?: boolean;
  finalAnswer?: string | null;
  answerElapsedMs?: unknown;
  attemptCount?: unknown;
  maxAttempts?: unknown;
  answeredBeforeReveal?: unknown;
  clientStartedAt?: string;
  clientCompletedAt?: string;
};

function answerError(error: string, message: string, status = 400) {
  return NextResponse.json({ success: false, result: "error", error, message }, { status });
}

function isFinalStatus(value: unknown): value is FinalStatus {
  return typeof value === "string" && FINAL_STATUSES.includes(value as FinalStatus);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

function optionalIsoDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function POST(request: Request) {
  let body: SubmitBody;

  try {
    body = await request.json();
  } catch {
    return jsonError("リクエスト形式が正しくありません。");
  }

  const roomCode = normalizeRoomCode(body.roomCode || "");
  const participantToken = body.participantToken || "";
  const questionId = body.questionId || "";
  const finalAnswer = typeof body.finalAnswer === "string" ? body.finalAnswer.trim() : null;
  const answerElapsedMs = body.answerElapsedMs;
  const attemptCount = body.attemptCount;
  const answeredBeforeReveal = body.answeredBeforeReveal === true;

  if (!roomCode || !participantToken || !questionId) {
    return jsonError("最終結果の送信に必要な情報が不足しています。");
  }

  if (!isFinalStatus(body.finalStatus)) {
    return answerError("FINAL_STATUS_INVALID", "最終結果の種類が正しくありません。");
  }

  if (!isValidAnswerElapsedMsValue(answerElapsedMs)) {
    return answerError("ANSWER_TIME_INVALID", "回答時間が正しくありません。");
  }

  if (!isNonNegativeInteger(attemptCount)) {
    return answerError("ATTEMPT_COUNT_INVALID", "解答回数が正しくありません。");
  }

  if (
    body.answeredBeforeReveal !== undefined &&
    typeof body.answeredBeforeReveal !== "boolean"
  ) {
    return answerError("ANSWER_BEFORE_REVEAL_INVALID", "画像表示前の回答情報が正しくありません。");
  }

  if (
    answeredBeforeReveal &&
    (body.finalStatus !== "correct" || answerElapsedMs !== 0)
  ) {
    return answerError(
      "ANSWER_BEFORE_REVEAL_INVALID",
      "画像表示前の正解は回答時間0ミリ秒で送信してください。"
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, status, current_question_id")
    .eq("room_code", roomCode)
    .single();

  if (roomError || !room) {
    return answerError("ROOM_NOT_FOUND", "ルームが見つかりません。", 404);
  }

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select("id, room_id, total_score")
    .eq("room_id", room.id)
    .eq("token_hash", hashParticipantToken(participantToken))
    .single();

  if (participantError || !participant || (body.participantId && body.participantId !== participant.id)) {
    return answerError("PARTICIPANT_NOT_FOUND", "参加者情報を確認できません。", 401);
  }

  if (room.status !== "question_open" || room.current_question_id !== questionId) {
    return answerError(
      "QUESTION_NOT_ACTIVE",
      "この問題は受付終了、または現在の問題ではありません。",
      409
    );
  }

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, room_id, answer_text, points, status, time_limit_ms, max_attempts"
    )
    .eq("id", questionId)
    .eq("room_id", room.id)
    .single();

  if (questionError || !question) {
    return answerError("QUESTION_MISMATCH", "問題が見つかりません。", 404);
  }

  if (question.status !== "open") {
    return answerError("QUESTION_NOT_ACTIVE", "この問題は現在回答受付中ではありません。", 409);
  }

  const timeLimitMs = toPositiveInteger(question.time_limit_ms, DEFAULT_QUESTION_TIME_LIMIT_MS);
  const maxAttempts = toPositiveInteger(question.max_attempts, DEFAULT_MAX_ATTEMPTS);

  if (!validateAnswerElapsedMs(answerElapsedMs, timeLimitMs, ANSWER_GRACE_MS)) {
    return answerError("ANSWER_TIME_EXCEEDED", "制限時間を超過しています。", 409);
  }

  if (attemptCount > maxAttempts) {
    return answerError("ATTEMPT_LIMIT_EXCEEDED", "解答回数が上限を超えています。", 409);
  }

  if (!Number.isInteger(body.maxAttempts) || body.maxAttempts !== maxAttempts) {
    return answerError("ATTEMPT_COUNT_INVALID", "解答可能回数が現在の問題設定と一致しません。", 409);
  }

  if (body.finalStatus === "correct" && (attemptCount < 1 || !finalAnswer)) {
    return answerError("ATTEMPT_COUNT_INVALID", "正解結果に必要な解答情報がありません。");
  }

  if (body.finalStatus === "attempt_limit_exceeded" && attemptCount !== maxAttempts) {
    return answerError("ATTEMPT_COUNT_INVALID", "解答回数が上限に達していません。", 409);
  }

  const { data: existingSubmissions, error: existingSubmissionError } = await supabase
    .from("submissions")
    .select("id")
    .eq("room_id", room.id)
    .eq("participant_id", participant.id)
    .eq("question_id", question.id)
    .limit(1);

  if (existingSubmissionError) {
    return jsonError("最終結果の確認に失敗しました。", 500);
  }

  if (existingSubmissions?.[0]) {
    return answerError("DUPLICATE_ANSWER", "この問題には最終結果を送信済みです。", 409);
  }

  const { data: answerAliases } = await supabase
    .from("answer_aliases")
    .select("alias_text")
    .eq("question_id", question.id);
  const normalizedSubmittedAnswer = finalAnswer ? normalizeAnswer(finalAnswer) : "";
  const normalizedCorrectAnswers = new Set([
    normalizeAnswer(question.answer_text),
    ...(answerAliases || []).map((alias) => normalizeAnswer(alias.alias_text))
  ]);
  const serverJudgedCorrect =
    Boolean(finalAnswer) && normalizedCorrectAnswers.has(normalizedSubmittedAnswer);

  if ((body.finalStatus === "correct" || body.isCorrect === true) && !serverJudgedCorrect) {
    return answerError("ANSWER_INCORRECT", "最終解答をサーバーで正解と確認できませんでした。", 422);
  }

  const finalStatus = body.finalStatus;
  const isCorrect = finalStatus === "correct" && serverJudgedCorrect;
  const persistedElapsedMs = finalStatus === "timeout" ? timeLimitMs : answerElapsedMs;
  const now = new Date().toISOString();
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .insert({
      room_id: room.id,
      participant_id: participant.id,
      question_id: question.id,
      submitted_answer: finalAnswer || "",
      normalized_submitted_answer: normalizedSubmittedAnswer,
      is_correct: isCorrect,
      awarded_points: 0,
      answer_elapsed_ms: persistedElapsedMs,
      final_status: finalStatus,
      attempt_count: attemptCount,
      max_attempts_snapshot: maxAttempts,
      final_answer: finalAnswer,
      answered_before_reveal: answeredBeforeReveal,
      client_started_at: optionalIsoDate(body.clientStartedAt),
      client_completed_at: optionalIsoDate(body.clientCompletedAt),
      server_received_at: now
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    if (submissionError?.code === "23505") {
      return answerError("DUPLICATE_ANSWER", "この問題には最終結果を送信済みです。", 409);
    }
    return jsonError("最終結果の保存に失敗しました。", 500);
  }

  let awardedPoints = 0;
  let totalScore = participant.total_score;
  let alreadyScored = false;

  if (isCorrect) {
    const { error: scoreError } = await supabase.from("score_events").insert({
      room_id: room.id,
      participant_id: participant.id,
      question_id: question.id,
      points: question.points,
      reason: "correct_answer"
    });

    if (!scoreError) {
      awardedPoints = question.points;
      await supabase.from("submissions").update({ awarded_points: awardedPoints }).eq("id", submission.id);

      const { data: scoreRows, error: incrementError } = await supabase.rpc(
        "increment_participant_score",
        { target_participant_id: participant.id, delta: question.points }
      );

      if (!incrementError && Array.isArray(scoreRows) && scoreRows[0]) {
        totalScore = Number(scoreRows[0].total_score);
      } else {
        totalScore = participant.total_score + question.points;
      }
    } else if (scoreError.code === "23505") {
      alreadyScored = true;
    } else {
      return jsonError("得点処理に失敗しました。", 500);
    }
  }

  return NextResponse.json({
    success: true,
    result: finalStatus,
    finalStatus,
    isCorrect,
    awardedPoints,
    totalScore,
    alreadyScored,
    answerElapsedMs: persistedElapsedMs,
    answeredBeforeReveal,
    message: isCorrect
      ? alreadyScored
        ? "正解済みです。得点は加算済みです。"
        : `正解です。${awardedPoints}点を獲得しました。`
      : finalStatus === "timeout"
        ? "タイムアップとして記録しました。"
        : "解答回数の上限到達として記録しました。"
  });
}
