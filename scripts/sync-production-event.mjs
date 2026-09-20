import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { orderedQuestionImages } from "./import-question-images-local.mjs";

const EXPECTED_COUNT = 21;
const PROJECT_REF = process.env.PROD_SUPABASE_PROJECT_REF || "kekmwxnjnclsnoircejp";
const PROD_SUPABASE_URL = process.env.PROD_SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const PROD_EVENT_ID = process.env.PROD_DEFAULT_EVENT_ID || "1098b22c-0ec8-4c9c-a883-df28ae5d06fa";
const LOCAL_EVENT_ID = process.env.DEFAULT_EVENT_ID;
const BUCKET = process.env.PROD_QUESTION_IMAGE_BUCKET || "question-images";
const IMAGE_DIRECTORY = path.resolve(process.env.QUESTION_IMAGE_DIRECTORY || "nazo");

function requireValue(value, name) {
  if (!value || value === "[SENSITIVE]") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function productionServiceRoleKey() {
  const output = execFileSync("npx", [
    "supabase",
    "projects",
    "api-keys",
    "--project-ref",
    PROJECT_REF
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const parsed = JSON.parse(output);
  const key = parsed.keys?.find((item) => item.id === "service_role" && item.type === "legacy")?.api_key;
  return requireValue(key, "production service_role key");
}

function client(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function normalizeAnswer(value) {
  return value.trim().normalize("NFKC").toLowerCase();
}

async function main() {
  requireValue(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  requireValue(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  requireValue(LOCAL_EVENT_ID, "DEFAULT_EVENT_ID");

  const local = client(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const production = client(PROD_SUPABASE_URL, productionServiceRoleKey());

  const { data: localQuestions, error: localQuestionsError } = await local
    .from("questions")
    .select("title, answer_text, mode, time_limit_ms, max_attempts, order_index, is_adopted")
    .eq("event_id", LOCAL_EVENT_ID)
    .order("order_index");
  if (localQuestionsError) throw new Error(`local questions: ${localQuestionsError.message}`);
  if (localQuestions.length !== EXPECTED_COUNT) {
    throw new Error(`local questions must be ${EXPECTED_COUNT}, got ${localQuestions.length}`);
  }

  const images = orderedQuestionImages(await readdir(IMAGE_DIRECTORY));

  const { data: event, error: eventError } = await production
    .from("event_settings")
    .select("id, title")
    .eq("id", PROD_EVENT_ID)
    .single();
  if (eventError || !event) {
    throw new Error(`production event not found: ${eventError?.message || "missing"}`);
  }

  const rows = localQuestions.map((question, index) => ({
    event_id: PROD_EVENT_ID,
    title: question.title,
    answer_text: question.answer_text,
    normalized_answer: normalizeAnswer(question.answer_text),
    mode: question.mode,
    time_limit_ms: question.time_limit_ms,
    max_attempts: question.max_attempts,
    order_index: index + 1,
    is_adopted: true,
    status: "draft",
    image_path: `${PROD_EVENT_ID}/questions/${String(index + 1).padStart(2, "0")}.png`,
    image_url: null
  }));

  const { error: insertError } = await production.from("questions").insert(rows);
  if (insertError) throw new Error(`insert questions: ${insertError.message}`);

  for (let index = 0; index < images.length; index += 1) {
    const imagePath = `${PROD_EVENT_ID}/questions/${String(index + 1).padStart(2, "0")}.png`;
    const bytes = await readFile(path.join(IMAGE_DIRECTORY, images[index].name));
    const { error } = await production.storage.from(BUCKET).upload(imagePath, bytes, {
      contentType: "image/png",
      upsert: true
    });
    if (error) throw new Error(`upload ${images[index].name}: ${error.message}`);
  }

  const [{ count: questionCount }, { count: participantCount }, { count: submissionCount }] = await Promise.all([
    production.from("questions").select("id", { count: "exact", head: true }).eq("event_id", PROD_EVENT_ID),
    production.from("participants").select("id", { count: "exact", head: true }).eq("event_id", PROD_EVENT_ID),
    production.from("submissions").select("id", { count: "exact", head: true }).eq("event_id", PROD_EVENT_ID)
  ]);

  console.log(JSON.stringify({
    eventId: PROD_EVENT_ID,
    eventTitle: event.title,
    questions: questionCount,
    participants: participantCount,
    submissions: submissionCount
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
