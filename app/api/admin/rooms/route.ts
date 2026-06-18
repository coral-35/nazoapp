import { NextResponse } from "next/server";
import { jsonError, logServerError } from "@/lib/http";
import { requireAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: rooms, error } = await supabase
      .from("rooms")
      .select("id, room_code, title, status, current_question_id, created_at")
      .eq("created_by", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      logServerError("GET /api/admin/rooms rooms.select", error);
      return jsonError("ルーム一覧の取得に失敗しました。", 500);
    }

    return NextResponse.json({ rooms: rooms || [] });
  } catch (error) {
    logServerError("GET /api/admin/rooms", error);
    return jsonError("ルーム一覧の取得に失敗しました。", 500);
  }
}
