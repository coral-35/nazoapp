import { defaultRoomId } from "@/lib/default-room";
import { loadResults } from "@/lib/results.server";
import { NextResponse } from "next/server";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { getDisplayImageUrl } from "@/lib/question-images";
import { normalizeSetQuestionCounts } from "@/lib/question-placement";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  const roomId = defaultRoomId();
  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const supabase = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabase
    .from("event_settings")
    .select("id, room_code, title, status, current_question_id, questions_per_set, set_question_counts, show_results, created_at")
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    return jsonError("イベントが見つかりません。", 404);
  }

  const [{ data: questions, error: questionsError }, { data: participants, error: participantsError }, { data: submissions, error: submissionsError }] =
    await Promise.all([
      supabase
        .from("questions")
        .select(
          "id, title, image_url, image_path, answer_text, mode, time_limit_ms, max_attempts, order_index, is_adopted, is_practice, status, created_at"
        )
        .eq("event_id", roomId)
        .order("order_index", { ascending: true }),
      supabase
        .from("participants")
        .select("id, name, created_at")
        .eq("event_id", roomId)
        .order("created_at", { ascending: true }),
      supabase
        .from("submissions")
        .select(
          "id, participant_id, question_id, submitted_answer, is_correct, answer_elapsed_ms, final_status, attempt_count, max_attempts_snapshot, final_answer, answered_before_reveal, server_received_at, created_at"
        )
        .eq("event_id", roomId)
        .order("created_at", { ascending: false })
    ]);

  if (questionsError || participantsError || submissionsError) return jsonError("イベント詳細を取得できませんでした。", 500);
  const questionIds = (questions || []).map((question) => question.id);
  const { data: answerAliases, error: aliasesError } = questionIds.length
    ? await supabase.from("answer_aliases").select("question_id, alias_text").in("question_id", questionIds)
    : { data: [], error: null };
  if (aliasesError) return jsonError("正答リストを取得できませんでした。", 500);
  const aliasesByQuestion = new Map<string, string[]>();
  for (const alias of answerAliases || []) {
    const values = aliasesByQuestion.get(alias.question_id) || [];
    values.push(alias.alias_text);
    aliasesByQuestion.set(alias.question_id, values);
  }

  const questionsWithSignedImages = await Promise.all(
    (questions || []).map(async (question) => ({
      ...question,
      answer_aliases: aliasesByQuestion.get(question.id) || [],
      display_image_url: await getDisplayImageUrl(
        supabase,
        question.image_path,
        question.image_url
      )
    }))
  );

  const setQuestionCounts = normalizeSetQuestionCounts(room.set_question_counts, room.questions_per_set);
  const resultsFor = await loadResults(roomId, setQuestionCounts);
  return NextResponse.json({
    room: { ...room, set_question_counts: setQuestionCounts },
    questions: questionsWithSignedImages,
    participants: (participants || []).map(p => ({ ...p, results: resultsFor(p.id) })),
    submissions: submissions || []
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return jsonError(auth.message, auth.status);
  const roomId = defaultRoomId();
  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) return jsonError(owner.message, owner.status);
  let body;
  try { body = await request.json(); } catch { return jsonError("リクエスト形式が正しくありません。"); }
  const updates: { questions_per_set?: number; set_question_counts?: number[]; show_results?: boolean } = {};
  if (body?.questionsPerSet !== undefined) {
    const size = body.questionsPerSet;
    if (!Number.isInteger(size) || size < 1 || size > 1000) return jsonError("1セットの問題数は1〜1000の整数で指定してください。");
    updates.questions_per_set = size;
    updates.set_question_counts = [size];
  }
  if (body?.setQuestionCounts !== undefined) {
    const counts = normalizeSetQuestionCounts(body.setQuestionCounts);
    if (!Array.isArray(body.setQuestionCounts) || counts.length !== body.setQuestionCounts.length) return jsonError("セットごとの問題数は1〜1000の整数で指定してください。");
    updates.set_question_counts = counts;
    updates.questions_per_set = counts[0];
  }
  if (body?.showResults !== undefined) {
    if (typeof body.showResults !== "boolean") return jsonError("結果表示設定が正しくありません。");
    updates.show_results = body.showResults;
  }
  if (!Object.keys(updates).length) return jsonError("変更する設定がありません。");
  const { error } = await getSupabaseAdmin().from("event_settings").update(updates).eq("id", roomId);
  if (error) return jsonError("セット設定を保存できませんでした。", 500);
  return NextResponse.json({ success: true });
}
