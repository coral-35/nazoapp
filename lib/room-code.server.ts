import { randomInt } from "node:crypto";

const ROOM_CODE_UPPER_BOUND = 1_000_000;

type RandomIntGenerator = (minimum: number, maximum: number) => number;

export function createRoomCode(randomIntGenerator: RandomIntGenerator = randomInt): string {
  return String(randomIntGenerator(0, ROOM_CODE_UPPER_BOUND)).padStart(6, "0");
}
