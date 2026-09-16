/** The single event operated by this deployment. Never fall back to test data. */
export function defaultRoomId(env: { DEFAULT_EVENT_ID?: string } = { DEFAULT_EVENT_ID: process.env.DEFAULT_EVENT_ID }): string {
  const eventId = env.DEFAULT_EVENT_ID?.trim();
  if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new Error("DEFAULT_EVENT_ID にイベントのUUIDを設定してください。");
  }
  return eventId;
}
