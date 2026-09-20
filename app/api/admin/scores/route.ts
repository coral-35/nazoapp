import { defaultRoomId } from "@/lib/default-room";
import { loadResults } from "@/lib/results.server";
import { NextResponse } from "next/server";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { normalizeSetQuestionCounts, questionPlacementBySetCounts } from "@/lib/question-placement";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  const url = new URL(request.url);
  const roomId = defaultRoomId();

  if (!roomId) {
    return jsonError("イベントを指定してください。");
  }

  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, created_at")
    .eq("event_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonError("成績一覧の取得に失敗しました。", 500);
  }

  const { data: room, error: roomError } = await supabase.from("event_settings").select("id, title, room_code, questions_per_set, set_question_counts").eq("id", roomId).single();
  if (roomError || !room) return jsonError("イベント情報を取得できませんでした。", 500);
  const setQuestionCounts = normalizeSetQuestionCounts(room.set_question_counts, room.questions_per_set);
  const resultsFor = await loadResults(roomId, setQuestionCounts);
  const scores = (data || []).map(p => ({ ...p, ...resultsFor(p.id) }));
  scores.sort((a, b) => b.correctCount - a.correctCount || a.missingTimeCount - b.missingTimeCount || a.totalTimeMs - b.totalTimeMs);
  const { data: questions, error: questionError } = await supabase
    .from("questions").select("order_index, is_practice").eq("event_id", roomId)
    .eq("is_adopted", true)
    .order("order_index", { ascending: true });
  if (questionError) return jsonError("問題数を取得できませんでした。", 500);
  const questionCount = (questions || []).filter((question) => !question.is_practice).length;
  const setCount = new Set((questions || [])
    .filter((question) => !question.is_practice)
    .map((question) => questionPlacementBySetCounts(question.order_index, setQuestionCounts).setNumber)).size;
  return NextResponse.json({ scores, room: { ...room, set_question_counts: setQuestionCounts }, questionCount: questionCount || 0,
    setCount });
}
