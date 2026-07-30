import assert from "node:assert/strict";
import test from "node:test";
import {
  participantStorageKey,
  readStoredParticipant
} from "../lib/participant-storage.ts";

function createStorage(value) {
  return {
    getItem() {
      return value;
    }
  };
}

test("readStoredParticipant returns a valid participant for the room", () => {
  const roomCode = "123456";
  const participant = {
    participantToken: "participant-token",
    participantName: "参加者",
    roomCode
  };

  assert.equal(participantStorageKey(roomCode), "nazotoki:participant:123456");
  assert.deepEqual(
    readStoredParticipant(createStorage(JSON.stringify(participant)), roomCode),
    participant
  );
});

test("readStoredParticipant rejects malformed or different-room data", () => {
  assert.equal(readStoredParticipant(createStorage("not-json"), "123456"), null);
  assert.equal(
    readStoredParticipant(
      createStorage(
        JSON.stringify({
          participantToken: "participant-token",
          participantName: "参加者",
          roomCode: "654321"
        })
      ),
      "123456"
    ),
    null
  );
});
