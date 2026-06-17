import { createHash, randomBytes } from "node:crypto";

export function createParticipantToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashParticipantToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
