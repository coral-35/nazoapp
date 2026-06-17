import { NextResponse } from "next/server";
import { normalizeAnswer } from "@/lib/answer";
import { normalizeRoomCode, jsonError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashParticipantToken } from "@/lib/tokens";

type SubmitBody = {
  roomCode?: string;
  participantToken?: string;
  questionId?: string;
  answer?: string;
};

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

  if (!roomCode || !participantToken || !questionId) {
    return jsonError("解答送信に必要な情報が不足しています。");
  }

  if (!answer) {
    return jsonError("解答を入力してください。");
  }

  const supabase = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, status, current_question_id")
    .eq("room_code", roomCode)
    .single();

  if (roomError || !room) {
    return jsonError("ルームが見つかりません。", 404);
  }

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select("id, room_id, total_score")
    .eq("room_id", room.id)
    .eq("token_hash", hashParticipantToken(participantToken))
    .single();

  if (participantError || !participant) {
    return jsonError("参加者情報を確認できません。", 401);
  }

  if (room.status !== "question_open" || room.current_question_id !== questionId) {
    return NextResponse.json(
      {
        result: "closed",
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
    .select("id, room_id, normalized_answer, answer_text, points")
    .eq("id", questionId)
    .eq("room_id", room.id)
    .single();

  if (questionError || !question) {
    return jsonError("問題が見つかりません。", 404);
  }

  const normalizedSubmittedAnswer = normalizeAnswer(answer);
  const normalizedCorrectAnswer =
    question.normalized_answer || normalizeAnswer(question.answer_text);
  const isCorrect = normalizedSubmittedAnswer === normalizedCorrectAnswer;

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

  await supabase.from("submissions").insert({
    room_id: room.id,
    participant_id: participant.id,
    question_id: question.id,
    submitted_answer: answer,
    normalized_submitted_answer: normalizedSubmittedAnswer,
    is_correct: isCorrect,
    awarded_points: awardedPoints
  });

  return NextResponse.json({
    result: isCorrect ? "correct" : "incorrect",
    isCorrect,
    awardedPoints,
    totalScore,
    alreadyScored,
    message: isCorrect
      ? alreadyScored
        ? "正解済みです。得点は加算済みです。"
        : `正解です。${awardedPoints}点を獲得しました。`
      : "不正解です。もう一度考えてみてください。"
  });
}
