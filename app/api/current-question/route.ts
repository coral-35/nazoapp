import { loadResults } from "@/lib/results.server";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MAX_ATTEMPTS, DEFAULT_QUESTION_TIME_LIMIT_MS } from "@/lib/answer";
import { buildCorrectAnswerHashes } from "@/lib/answer-hash.server";
import {
  attachDeviceCookie,
  bindParticipantToDevice,
  getRequestDeviceIdentity
} from "@/lib/device-identity.server";
import { normalizeRoomCode, jsonError } from "@/lib/http";
import { isValidRoomCode } from "@/lib/room-code";
import { getDisplayImageUrl } from "@/lib/question-images";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashParticipantToken } from "@/lib/tokens";
import { questionPlacement } from "@/lib/question-placement";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const roomCode = normalizeRoomCode(url.searchParams.get("room_code") || "");
  const participantToken = url.searchParams.get("participant_token") || "";

  if (!isValidRoomCode(roomCode) || !participantToken) {
    return jsonError("イベント番号と参加者情報が必要です。", 400);
  }

  const supabase = getSupabaseAdmin();
  const deviceIdentity = getRequestDeviceIdentity(request);
  const { data: room, error: roomError } = await supabase
    .from("event_settings")
    .select("id, room_code, title, status, current_question_id, questions_per_set, show_results")
    .eq("room_code", roomCode)
    .single();

  if (roomError || !room) {
    return jsonError("イベントが見つかりません。", 404);
  }

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select("id, name, device_token_hash")
    .eq("event_id", room.id)
    .eq("token_hash", hashParticipantToken(participantToken))
    .single();

  if (participantError || !participant) {
    return jsonError("参加者情報を確認できません。もう一度参加してください。", 401);
  }

  if (!(await bindParticipantToDevice(supabase, participant, deviceIdentity.hash))) {
    return jsonError("この参加情報は別の端末に紐付いています。", 401);
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
        "id, title, image_url, image_path, answer_text, mode, order_index, status, time_limit_ms, max_attempts"
      )
      .eq("id", room.current_question_id)
      .eq("event_id", room.id)
      .eq("is_adopted", true)
      .single();

    if (currentQuestion) {
      const placement = questionPlacement(currentQuestion.order_index, room.questions_per_set);
      const imageUrl = await getDisplayImageUrl(
        supabase,
        currentQuestion.image_path,
        currentQuestion.image_url
      );

      const [{ data: submissions }, { data: answerAliases }] =
        await Promise.all([
        supabase
          .from("submissions")
          .select("id, is_correct")
          .eq("event_id", room.id)
          .eq("participant_id", participant.id)
          .eq("question_id", currentQuestion.id)
          .order("is_correct", { ascending: false })
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

      hasCorrectSubmission = Boolean(submissions?.some(row => row.is_correct));
      hasSubmission = Boolean(submissions?.[0]);
      question = {
        id: currentQuestion.id,
        title: currentQuestion.title,
        imageUrl,
        mode: currentQuestion.mode,
        setNumber: placement.setNumber,
        questionLabel: placement.label,
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

  const resultsFor = await loadResults(room.id, room.questions_per_set, participant.id);
  return attachDeviceCookie(
    NextResponse.json({
      room: {
        id: room.id,
        roomCode: room.room_code,
        title: room.title,
        status: room.status,
        showResults: room.show_results
      },
      participant: {
        id: participant.id,
        name: participant.name,
        results: resultsFor(participant.id)
      },
      question,
      hasCorrectSubmission,
      hasSubmission,
      serverNowMs: Date.now()
    }),
    deviceIdentity
  );
}
