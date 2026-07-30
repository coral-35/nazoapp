export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^\d{6}$/;

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value);
}
