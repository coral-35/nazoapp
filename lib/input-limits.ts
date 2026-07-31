export const MAX_PARTICIPANT_NAME_LENGTH = 50;
export const MAX_ROOM_TITLE_LENGTH = 100;
export const MAX_QUESTION_TITLE_LENGTH = 100;
export const MAX_ANSWER_LENGTH = 200;

export function exceedsTextLimit(value: string, maxLength: number): boolean {
  return Array.from(value).length > maxLength;
}
