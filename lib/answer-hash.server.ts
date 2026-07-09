import { createHash } from "node:crypto";
import { normalizeAnswer } from "@/lib/answer";

export function hashNormalizedAnswer(value: string): string {
  return createHash("sha256").update(normalizeAnswer(value), "utf8").digest("hex");
}

export function buildCorrectAnswerHashes(values: string[]): string[] {
  return [...new Set(values.map(hashNormalizedAnswer))];
}
