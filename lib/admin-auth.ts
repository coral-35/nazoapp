import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin, getSupabaseAuthClient } from "./supabase/server";

export type AdminAuthResult =
  | { ok: true; user: User }
  | { ok: false; status: number; message: string };

export async function requireAdminUser(request: Request): Promise<AdminAuthResult> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    return { ok: false, status: 401, message: "出題者ログインが必要です。" };
  }

  try {
    const authClient = getSupabaseAuthClient();
    const { data, error } = await authClient.auth.getUser(token);

    if (error || !data.user) {
      return { ok: false, status: 401, message: "ログイン情報を確認できません。" };
    }

    return { ok: true, user: data.user };
  } catch {
    return { ok: false, status: 500, message: "認証設定が不足しています。" };
  }
}

export async function ensureRoomOwner(roomId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, created_by")
    .eq("id", roomId)
    .single();

  if (error || !data) {
    return { ok: false as const, status: 404, message: "ルームが見つかりません。" };
  }

  if (data.created_by !== userId) {
    return { ok: false as const, status: 403, message: "このルームを操作する権限がありません。" };
  }

  return { ok: true as const, room: data };
}
