export function participantStorageKey(roomCode: string): string {
  return `nazotoki:participant:${roomCode.trim().toUpperCase()}`;
}
