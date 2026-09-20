import { defaultRoomId } from "@/lib/default-room";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  const auth = await requireAdminUser(request); if (!auth.ok) return jsonError(auth.message, auth.status);
  const eventId = defaultRoomId(); const owner = await ensureRoomOwner(eventId, auth.user.id); if (!owner.ok) return jsonError(owner.message, owner.status);
  let body: { orderedQuestionIds?: unknown; adoptedQuestionIds?: unknown };
  try { body = await request.json(); } catch { return jsonError("リクエスト形式が正しくありません。"); }
  if (!Array.isArray(body.orderedQuestionIds) || !Array.isArray(body.adoptedQuestionIds) || !body.orderedQuestionIds.every(id => typeof id === "string") || !body.adoptedQuestionIds.every(id => typeof id === "string")) return jsonError("問題の並び順または採用設定が正しくありません。");
  const supabase = getSupabaseAdmin();
  const { data: event } = await supabase.from("event_settings").select("current_question_id, status").eq("id", eventId).single();
  if (event?.status === "question_open" && event.current_question_id && !body.adoptedQuestionIds.includes(event.current_question_id)) return jsonError("出題中の問題は候補に戻せません。先に解答を締め切ってください。");
  const { error } = await supabase.rpc("organize_event_questions", { target_event_id: eventId, ordered_question_ids: body.orderedQuestionIds, adopted_question_ids: body.adoptedQuestionIds });
  if (error) return jsonError("問題の並び順を保存できませんでした。", 500);
  return NextResponse.json({ success: true });
}
