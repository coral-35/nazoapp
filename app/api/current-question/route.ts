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
import { alphabeticQuestionLabel, normalizeSetQuestionCounts, questionPlacementBySetCounts } from "@/lib/question-placement";

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
    .select("id, room_code, title, status, current_question_id, questions_per_set, set_question_counts, show_results")
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
        "id, image_url, image_path, answer_text, mode, order_index, is_practice, status, time_limit_ms, max_attempts"
      )
      .eq("id", room.current_question_id)
      .eq("event_id", room.id)
      .eq("is_adopted", true)
      .single();

    if (currentQuestion) {
      const setQuestionCounts = normalizeSetQuestionCounts(room.set_question_counts, room.questions_per_set);
      const { data: adoptedQuestions } = await supabase
        .from("questions")
        .select("id, order_index, is_practice")
        .eq("event_id", room.id)
        .eq("is_adopted", true)
        .order("order_index", { ascending: true });
      const scoringSetCounts = (adoptedQuestions || []).reduce<Map<number, number>>((counts, question) => {
        if (question.is_practice) return counts;
        const displayPlacement = questionPlacementBySetCounts(question.order_index, setQuestionCounts);
        counts.set(displayPlacement.setNumber, (counts.get(displayPlacement.setNumber) || 0) + 1);
        return counts;
      }, new Map());
      const scoringCounts = [...scoringSetCounts.entries()].sort((a, b) => a[0] - b[0]).map(([, count]) => count);
      const scoringOrderIndex = (adoptedQuestions || [])
        .filter((question) => !question.is_practice && question.order_index <= currentQuestion.order_index)
        .length;
      const practiceIndex = (adoptedQuestions || [])
        .filter((question) => question.is_practice && question.order_index <= currentQuestion.order_index)
        .length;
      const placement = currentQuestion.is_practice
        ? { setNumber: 0, label: alphabeticQuestionLabel(Math.max(0, practiceIndex - 1)) }
        : questionPlacementBySetCounts(scoringOrderIndex, scoringCounts);
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
        imageUrl,
        mode: currentQuestion.mode,
        isPractice: currentQuestion.is_practice,
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

  const resultsFor = await loadResults(room.id, normalizeSetQuestionCounts(room.set_question_counts, room.questions_per_set), participant.id);
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
