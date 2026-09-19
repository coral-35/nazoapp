import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readLocalAdminConfig } from "./seed-local-admin.mjs";

const EXPECTED_COUNT = 21;
const IMAGE_PATTERN = /^Frame (\d+)\.png$/;

export function orderedQuestionImages(names) {
  const images = names
    .map((name) => ({ name, number: Number(IMAGE_PATTERN.exec(name)?.[1]) }))
    .filter((item) => Number.isInteger(item.number))
    .sort((a, b) => a.number - b.number);
  if (images.length !== EXPECTED_COUNT) {
    throw new Error(`PNG画像は${EXPECTED_COUNT}枚必要です（検出: ${images.length}枚）。`);
  }
  const expected = Array.from({ length: EXPECTED_COUNT }, (_, index) => 101 + index);
  if (images.some((item, index) => item.number !== expected[index])) {
    throw new Error("画像名は Frame 101.png から Frame 121.png まで連番にしてください。");
  }
  return images;
}

export async function importQuestionImages({ env = process.env, logger = console } = {}) {
  const config = readLocalAdminConfig(env);
  const eventId = env.DEFAULT_EVENT_ID?.trim();
  if (!eventId) throw new Error("DEFAULT_EVENT_ID is required");
  const imageDirectory = path.resolve(env.QUESTION_IMAGE_DIRECTORY || "nazo");
  const images = orderedQuestionImages(await readdir(imageDirectory));
  const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: questions, error: questionError } = await db.from("questions")
    .select("id, order_index, image_path").eq("event_id", eventId).order("order_index");
  if (questionError) throw new Error(`問題の取得に失敗しました: ${questionError.message}`);
  if (questions.length !== EXPECTED_COUNT) {
    throw new Error(`問題は${EXPECTED_COUNT}問必要です（登録済み: ${questions.length}問）。`);
  }
  if (questions.some((question, index) => question.order_index !== index + 1)) {
    throw new Error("問題の出題順は1〜21の連番にしてください。");
  }
  const replace = env.REPLACE_QUESTION_IMAGES === "1";
  if (!replace && questions.some((question) => question.image_path)) {
    throw new Error("画像設定済みの問題があります。置換する場合は REPLACE_QUESTION_IMAGES=1 を指定してください。");
  }
  const bucket = env.QUESTION_IMAGE_BUCKET || "question-images";
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const image = images[index];
    const imagePath = `${eventId}/questions/${String(question.order_index).padStart(2, "0")}.png`;
    const bytes = await readFile(path.join(imageDirectory, image.name));
    const { error: uploadError } = await db.storage.from(bucket).upload(imagePath, bytes, {
      contentType: "image/png", upsert: replace
    });
    if (uploadError) throw new Error(`${image.name} のアップロードに失敗しました: ${uploadError.message}`);
    const { error: updateError } = await db.from("questions").update({ image_path: imagePath, image_url: null }).eq("id", question.id).eq("event_id", eventId);
    if (updateError) throw new Error(`第${question.order_index}問への紐付けに失敗しました: ${updateError.message}`);
    logger.log(`${image.name} → 第${question.order_index}問`);
  }
  logger.log(`${EXPECTED_COUNT}問の画像取込が完了しました。`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  importQuestionImages().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
