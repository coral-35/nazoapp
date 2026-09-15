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
  try {
    const raw = storage.getItem(participantStorageKey(roomCode));
    if (!raw) return null;
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

export async function restoreStoredParticipant(
  storage: Pick<Storage, "getItem" | "removeItem">,
  roomCode: string,
  validate: (participant: StoredParticipant) => Promise<number>
): Promise<StoredParticipant | null> {
  const saved = readStoredParticipant(storage, roomCode);
  if (!saved) return null;
  const status = await validate(saved);
  if (status >= 200 && status < 300) return saved;
  if (status === 401) {
    storage.removeItem(participantStorageKey(roomCode));
    return null;
  }
  throw new Error("参加情報を確認できませんでした。再試行してください。");
}
