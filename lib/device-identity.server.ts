import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEVICE_COOKIE_NAME = "quiz_device";
const DEVICE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type DeviceIdentity = {
  token: string;
  hash: string;
};

export function createDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resolveDeviceIdentity(
  cookieValue: string | undefined,
  tokenFactory = createDeviceToken
): DeviceIdentity {
  const token =
    cookieValue && DEVICE_TOKEN_PATTERN.test(cookieValue) ? cookieValue : tokenFactory();
  return { token, hash: hashDeviceToken(token) };
}

export function getRequestDeviceIdentity(request: NextRequest): DeviceIdentity {
  return resolveDeviceIdentity(request.cookies.get(DEVICE_COOKIE_NAME)?.value);
}

export function attachDeviceCookie(response: NextResponse, identity: DeviceIdentity): NextResponse {
  response.cookies.set({
    name: DEVICE_COOKIE_NAME,
    value: identity.token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS
  });
  return response;
}

export async function bindParticipantToDevice(
  supabase: SupabaseClient,
  participant: { id: string; device_token_hash: string | null },
  deviceHash: string
): Promise<boolean> {
  if (participant.device_token_hash) {
    return participant.device_token_hash === deviceHash;
  }

  const { data, error } = await supabase
    .from("participants")
    .update({ device_token_hash: deviceHash })
    .eq("id", participant.id)
    .is("device_token_hash", null)
    .select("id")
    .maybeSingle();

  if (!error && data) {
    return true;
  }

  const { data: refreshed } = await supabase
    .from("participants")
    .select("device_token_hash")
    .eq("id", participant.id)
    .maybeSingle();

  return refreshed?.device_token_hash === deviceHash;
}
