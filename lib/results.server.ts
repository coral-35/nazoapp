import { aggregateResults } from "@/lib/results";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function loadResults(roomId: string, questionsPerSet: number, participantId?: string) {
  const db = getSupabaseAdmin();
  const questions: { id: string; order_index: number }[] = [];
  const submissions: { participant_id: string; question_id: string; is_correct: boolean; answer_elapsed_ms: number | null }[] = [];
  // Page through every row so large rooms are not truncated by the API row limit.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("questions").select("id, order_index").eq("event_id", roomId).eq("is_adopted", true).order("id").range(offset, offset + 999);
    if (error) throw new Error("問題集計の取得に失敗しました。");
    questions.push(...data);
    if (data.length < 1000) break;
  }
  for (let offset = 0; ; offset += 1000) {
    let query = db.from("submissions").select("participant_id, question_id, is_correct, answer_elapsed_ms").eq("event_id", roomId).eq("is_correct", true).order("id").range(offset, offset + 999);
    if (participantId) query = query.eq("participant_id", participantId);
    const { data, error } = await query;
    if (error) throw new Error("成績集計の取得に失敗しました。");
    submissions.push(...data);
    if (data.length < 1000) break;
  }
  return (id: string) => aggregateResults(questions, submissions.filter(row => row.participant_id === id), questionsPerSet);
}
