export function participantStorageKey(roomCode: string): string {
  return `nazotoki:participant:${roomCode.trim().toUpperCase()}`;
}

export type StoredParticipant = {
  participantToken: string;
  participantName: string;
  roomCode: string;
};

export function readStoredParticipant(
  storage: Pick<Storage, "getItem">,
  roomCode: string
): StoredParticipant | null {
  const raw = storage.getItem(participantStorageKey(roomCode));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredParticipant>;
    if (
      typeof parsed.participantToken !== "string" ||
      !parsed.participantToken ||
      typeof parsed.participantName !== "string" ||
      !parsed.participantName ||
      parsed.roomCode !== roomCode
    ) {
      return null;
    }
    return parsed as StoredParticipant;
  } catch {
    return null;
  }
}
