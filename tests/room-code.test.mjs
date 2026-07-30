import assert from "node:assert/strict";
import test from "node:test";
import { createRoomCode } from "../lib/room-code.server.ts";
import { isValidRoomCode } from "../lib/room-code.ts";

test("createRoomCode always formats a six-digit numeric code", () => {
  assert.equal(createRoomCode(() => 0), "000000");
  assert.equal(createRoomCode(() => 42), "000042");
  assert.equal(createRoomCode(() => 999_999), "999999");
});

test("isValidRoomCode accepts only six ASCII digits", () => {
  assert.equal(isValidRoomCode("000042"), true);
  assert.equal(isValidRoomCode("123456"), true);
  assert.equal(isValidRoomCode("12345"), false);
  assert.equal(isValidRoomCode("1234567"), false);
  assert.equal(isValidRoomCode("ABC123"), false);
  assert.equal(isValidRoomCode("１２３４５６"), false);
});
