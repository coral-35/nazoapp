import { NextRequest, NextResponse } from "next/server";
import { GET as getMyScore } from "@/app/api/my-score/route";
import { getDefaultRoom } from "@/lib/default-room.server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { loadResults } from "@/lib/results.server";
import { normalizeSetQuestionCounts, questionPlacementBySetCounts } from "@/lib/question-placement";

export async function GET(request: NextRequest) {
  const room = await getDefaultRoom();
  const authUrl = new URL(request.url);
  authUrl.searchParams.set("room_code", room.room_code);
  const auth = await getMyScore(new NextRequest(authUrl, { headers: request.headers }));
  if (!auth.ok) return auth;
  const db = getSupabaseAdmin();
  const { data: settings, error } = await db.from("event_settings").select("id, title, questions_per_set, set_question_counts, show_results").eq("id", room.id).single();
  if (error || !settings) return NextResponse.json({ error: "設定を取得できませんでした。" }, { status: 500 });
  if (!settings.show_results) return NextResponse.json({ error: "結果発表はまだ開始されていません。" }, { status: 403 });
  const { data: participants, error: participantsError } = await db.from("participants").select("id, name").eq("event_id", room.id);
  const { data: questions, error: questionError } = await db.from("questions").select("order_index, is_practice").eq("event_id", room.id).eq("is_adopted", true).order("order_index", { ascending: true });
  if (participantsError || questionError) return NextResponse.json({ error: "結果を取得できませんでした。" }, { status: 500 });
  const setQuestionCounts = normalizeSetQuestionCounts(settings.set_question_counts, settings.questions_per_set);
  const resultsFor = await loadResults(room.id, setQuestionCounts);
  const setCount = new Set((questions || [])
    .filter((question) => !question.is_practice)
    .map((question) => questionPlacementBySetCounts(question.order_index, setQuestionCounts).setNumber)).size;
  const questionCount = (questions || []).filter((question) => !question.is_practice).length;
  return NextResponse.json({ room: { ...settings, set_question_counts: setQuestionCounts }, scores: (participants || []).map(p => ({ ...p, ...resultsFor(p.id) })), questionCount,
    setCount }, { headers: { "Cache-Control": "no-store" } });
}
