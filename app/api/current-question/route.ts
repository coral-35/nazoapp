import { NextResponse } from "next/server";
import { DEFAULT_MAX_ATTEMPTS, DEFAULT_QUESTION_TIME_LIMIT_MS } from "@/lib/answer";
import { buildCorrectAnswerHashes } from "@/lib/answer-hash.server";
import { normalizeRoomCode, jsonError } from "@/lib/http";
import { getDisplayImageUrl } from "@/lib/question-images";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashParticipantToken } from "@/lib/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomCode = normalizeRoomCode(url.searchParams.get("room_code") || "");
  const participantToken = url.searchParams.get("participant_token") || "";

  if (!roomCode || !participantToken) {
    return jsonError("ルーム番号と参加者情報が必要です。", 400);
  }

  const supabase = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, room_code, title, status, current_question_id")
    .eq("room_code", roomCode)
    .single();

  if (roomError || !room) {
    return jsonError("ルームが見つかりません。", 404);
  }

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select("id, name, total_score")
    .eq("room_id", room.id)
    .eq("token_hash", hashParticipantToken(participantToken))
    .single();

  if (participantError || !participant) {
    return jsonError("参加者情報を確認できません。もう一度参加してください。", 401);
  }

  let question = null;
  let hasCorrectSubmission = false;
  let hasSubmission = false;

  if (
    room.current_question_id &&
    (room.status === "question_open" || room.status === "question_closed")
  ) {
    const { data: currentQuestion } = await supabase
      .from("questions")
      .select(
        "id, title, image_url, image_path, answer_text, points, order_index, status, time_limit_ms, max_attempts"
      )
      .eq("id", room.current_question_id)
      .eq("room_id", room.id)
      .single();

    if (currentQuestion) {
      const imageUrl = await getDisplayImageUrl(
        supabase,
        currentQuestion.image_path,
        currentQuestion.image_url
      );

      const [{ data: scoreEvent }, { data: submissions }, { data: answerAliases }] =
        await Promise.all([
        supabase
          .from("score_events")
          .select("id")
          .eq("participant_id", participant.id)
          .eq("question_id", currentQuestion.id)
          .maybeSingle(),
        supabase
          .from("submissions")
          .select("id")
          .eq("room_id", room.id)
          .eq("participant_id", participant.id)
          .eq("question_id", currentQuestion.id)
          .limit(1),
        supabase
          .from("answer_aliases")
          .select("alias_text")
          .eq("question_id", currentQuestion.id)
      ]);

      const correctAnswerHashes = buildCorrectAnswerHashes([
        currentQuestion.answer_text,
        ...(answerAliases || []).map((alias) => alias.alias_text)
      ]);

      hasCorrectSubmission = Boolean(scoreEvent);
      hasSubmission = Boolean(submissions?.[0]);
      question = {
        id: currentQuestion.id,
        title: currentQuestion.title,
        imageUrl,
        points: currentQuestion.points,
        orderIndex: currentQuestion.order_index,
        timeLimitMs: currentQuestion.time_limit_ms || DEFAULT_QUESTION_TIME_LIMIT_MS,
        maxAttempts: currentQuestion.max_attempts || DEFAULT_MAX_ATTEMPTS,
        validation: {
          mode: "local_hash",
          type: "exact",
          correctAnswerHashes,
          caseSensitive: false,
          trimWhitespace: true,
          normalizeWidth: true,
          normalizeKana: false
        },
        status: room.status === "question_open" ? "open" : "closed"
      };
    }
  }

  return NextResponse.json({
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
    question,
    hasCorrectSubmission,
    hasSubmission,
    serverNowMs: Date.now()
  });
}
