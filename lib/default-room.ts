// Stable ID of the synthetic sample room. Override only on the server.
export const SAMPLE_DEFAULT_ROOM_ID = "74cdd564-a4e2-415d-a37d-92e924bc5986";

export function defaultRoomId(env: { DEFAULT_ROOM_ID?: string } = { DEFAULT_ROOM_ID: process.env.DEFAULT_ROOM_ID }): string {
  return env.DEFAULT_ROOM_ID?.trim() || SAMPLE_DEFAULT_ROOM_ID;
}
