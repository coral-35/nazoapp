import type { SupabaseClient } from "@supabase/supabase-js";
import { getQuestionImageBucket } from "./supabase/server";

export async function getDisplayImageUrl(
  supabase: SupabaseClient,
  imagePath?: string | null,
  imageUrl?: string | null
): Promise<string | null> {
  if (!imagePath) {
    return imageUrl || null;
  }

  const { data, error } = await supabase.storage
    .from(getQuestionImageBucket())
    .createSignedUrl(imagePath, 60 * 60);

  if (error || !data?.signedUrl) {
    return imageUrl || null;
  }

  return data.signedUrl;
}
