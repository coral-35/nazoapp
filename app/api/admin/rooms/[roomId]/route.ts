import { NextResponse } from "next/server";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { getDisplayImageUrl } from "@/lib/question-images";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  const { roomId } = await context.params;
  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const supabase = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, room_code, title, status, current_question_id, created_at")
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    return jsonError("ルームが見つかりません。", 404);
  }

  const [{ data: questions }, { data: participants }, { data: submissions }] =
    await Promise.all([
      supabase
        .from("questions")
        .select("id, title, image_url, image_path, answer_text, points, time_limit_ms, order_index, status, created_at")
        .eq("room_id", roomId)
        .order("order_index", { ascending: true }),
      supabase
        .from("participants")
        .select("id, name, total_score, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true }),
      supabase
        .from("submissions")
        .select("id, participant_id, question_id, submitted_answer, is_correct, awarded_points, answer_elapsed_ms, server_received_at, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
    ]);

  const questionsWithSignedImages = await Promise.all(
    (questions || []).map(async (question) => ({
      ...question,
      display_image_url: await getDisplayImageUrl(
        supabase,
        question.image_path,
        question.image_url
      )
    }))
  );

  return NextResponse.json({
    room,
    questions: questionsWithSignedImages,
    participants: participants || [],
    submissions: submissions || []
  });
}
