import { NextResponse } from "next/server";
import {
  ANSWER_GRACE_MS,
  DEFAULT_QUESTION_TIME_LIMIT_MS,
  isValidAnswerElapsedMsValue,
  normalizeAnswer,
  validateAnswerElapsedMs
} from "@/lib/answer";
import { normalizeRoomCode, jsonError, toPositiveInteger } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashParticipantToken } from "@/lib/tokens";

type SubmitBody = {
  roomCode?: string;
  participantToken?: string;
  questionId?: string;
  answer?: string;
  answerElapsedMs?: unknown;
};

function answerError(error: string, message: string, status = 400) {
  return NextResponse.json({ success: false, result: "error", error, message }, { status });
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
  const answer = (body.answer || "").trim();
  const answerElapsedMs = body.answerElapsedMs;

  if (!roomCode || !participantToken || !questionId) {
    return jsonError("解答送信に必要な情報が不足しています。");
  }

  if (!answer) {
    return jsonError("解答を入力してください。");
  }

  if (!isValidAnswerElapsedMsValue(answerElapsedMs)) {
    return answerError("ANSWER_TIME_INVALID", "回答時間が正しくありません。");
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

  if (participantError || !participant) {
    return answerError("PARTICIPANT_NOT_FOUND", "参加者情報を確認できません。", 401);
  }

  if (room.status !== "question_open" || room.current_question_id !== questionId) {
    return NextResponse.json(
      {
        success: false,
        result: "closed",
        error: "QUESTION_NOT_ACTIVE",
        isCorrect: false,
        awardedPoints: 0,
        totalScore: participant.total_score,
        message: "この問題は受付終了、または現在の問題ではありません。"
      },
      { status: 409 }
    );
  }

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id, room_id, normalized_answer, answer_text, points, status, time_limit_ms")
    .eq("id", questionId)
    .eq("room_id", room.id)
    .single();

  if (questionError || !question) {
    return jsonError("問題が見つかりません。", 404);
  }

  if (question.status !== "open") {
    return answerError("QUESTION_NOT_ACTIVE", "この問題は現在回答受付中ではありません。", 409);
  }

  const timeLimitMs = toPositiveInteger(
    question.time_limit_ms,
    DEFAULT_QUESTION_TIME_LIMIT_MS
  );
  if (!validateAnswerElapsedMs(answerElapsedMs, timeLimitMs, ANSWER_GRACE_MS)) {
    return answerError("ANSWER_TIME_EXCEEDED", "制限時間を超過しています。", 409);
  }

  const { data: existingSubmissions, error: existingSubmissionError } = await supabase
    .from("submissions")
    .select("id")
    .eq("room_id", room.id)
    .eq("participant_id", participant.id)
    .eq("question_id", question.id)
    .limit(1);

  if (existingSubmissionError) {
    return jsonError("回答履歴の確認に失敗しました。", 500);
  }

  if (existingSubmissions?.[0]) {
    return answerError("DUPLICATE_ANSWER", "この問題には回答済みです。", 409);
  }

  const normalizedSubmittedAnswer = normalizeAnswer(answer);
  const normalizedCorrectAnswer =
    question.normalized_answer || normalizeAnswer(question.answer_text);
  const isCorrect = normalizedSubmittedAnswer === normalizedCorrectAnswer;

  let awardedPoints = 0;
  let totalScore = participant.total_score;
  let alreadyScored = false;

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .insert({
      room_id: room.id,
      participant_id: participant.id,
      question_id: question.id,
      submitted_answer: answer,
      normalized_submitted_answer: normalizedSubmittedAnswer,
      is_correct: isCorrect,
      awarded_points: 0,
      answer_elapsed_ms: answerElapsedMs,
      server_received_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    if (submissionError?.code === "23505") {
      return answerError("DUPLICATE_ANSWER", "この問題には回答済みです。", 409);
    }
    return jsonError("解答保存に失敗しました。", 500);
  }

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
      await supabase
        .from("submissions")
        .update({ awarded_points: awardedPoints })
        .eq("id", submission.id);

      const { data: scoreRows, error: incrementError } = await supabase.rpc(
        "increment_participant_score",
        {
          target_participant_id: participant.id,
          delta: question.points
        }
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
    result: isCorrect ? "correct" : "incorrect",
    isCorrect,
    awardedPoints,
    totalScore,
    alreadyScored,
    answerElapsedMs,
    message: isCorrect
      ? alreadyScored
        ? "正解済みです。得点は加算済みです。"
        : `正解です。${awardedPoints}点を獲得しました。`
      : "不正解です。回答を受け付けました。"
  });
}
