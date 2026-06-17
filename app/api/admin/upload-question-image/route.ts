import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureRoomOwner, requireAdminUser } from "@/lib/admin-auth";
import { jsonError } from "@/lib/http";
import { getQuestionImageBucket, getSupabaseAdmin } from "@/lib/supabase/server";

const maxImageBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  const formData = await request.formData();
  const roomId = String(formData.get("roomId") || "");
  const file = formData.get("file");

  if (!roomId || !(file instanceof File)) {
    return jsonError("ルームと画像ファイルを指定してください。");
  }

  if (!allowedTypes.has(file.type)) {
    return jsonError("PNG、JPEG、WebP、GIFの画像をアップロードしてください。");
  }

  if (file.size > maxImageBytes) {
    return jsonError("画像サイズは5MB以下にしてください。");
  }

  const owner = await ensureRoomOwner(roomId, auth.user.id);
  if (!owner.ok) {
    return jsonError(owner.message, owner.status);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "question-image";
  const imagePath = `${roomId}/${randomUUID()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(getQuestionImageBucket())
    .upload(imagePath, bytes, {
      contentType: file.type,
      upsert: false
    });

  if (error) {
    return jsonError("画像アップロードに失敗しました。Storageバケット設定を確認してください。", 500);
  }

  const { data: signed } = await supabase.storage
    .from(getQuestionImageBucket())
    .createSignedUrl(imagePath, 60 * 60);

  return NextResponse.json({
    imagePath,
    imageUrl: signed?.signedUrl || null
  });
}
