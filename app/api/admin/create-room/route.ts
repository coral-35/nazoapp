import { NextResponse } from "next/server";
import { jsonError, logServerError } from "@/lib/http";
import { exceedsTextLimit, MAX_ROOM_TITLE_LENGTH } from "@/lib/input-limits";
import { requireAdminUser } from "@/lib/admin-auth";
import { createRoomCode } from "@/lib/room-code.server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("リクエスト形式が正しくありません。");
  }

  const title = (body.title || "").trim();
  if (!title) {
    return jsonError("ルーム名を入力してください。");
  }

  if (exceedsTextLimit(title, MAX_ROOM_TITLE_LENGTH)) {
    return jsonError(`ルーム名は${MAX_ROOM_TITLE_LENGTH}文字以内で入力してください。`);
  }

  try {
    const supabase = getSupabaseAdmin();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const roomCode = createRoomCode();
      const { data, error } = await supabase
        .from("rooms")
        .insert({
          room_code: roomCode,
          title,
          status: "waiting",
          created_by: auth.user.id
        })
        .select("id, room_code, title, status, created_at")
        .single();

      if (!error && data) {
        return NextResponse.json({ room: data });
      }

      if (error?.code !== "23505") {
        logServerError("POST /api/admin/create-room rooms.insert", error);
        return jsonError("ルーム作成に失敗しました。", 500);
      }
    }

    return jsonError("ルーム番号の発行に失敗しました。もう一度お試しください。", 500);
  } catch (error) {
    logServerError("POST /api/admin/create-room", error);
    return jsonError("ルーム作成に失敗しました。", 500);
  }
}
