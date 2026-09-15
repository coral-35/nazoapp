import assert from "node:assert/strict";
import test from "node:test";
import { buildJoinRoomResponse } from "../lib/join-room.ts";

test("join response uses the persisted participant name when resuming", () => {
  const response = buildJoinRoomResponse(
    {
      id: "room-id",
      room_code: "123456",
      title: "テストルーム",
      status: "waiting"
    },
    {
      id: "participant-id",
      name: "最初に入った名前",
      total_score: 10
    },
    "new-participant-token"
  );

  assert.equal("totalScore" in response.participant, false);
  assert.equal(response.participant.name, "最初に入った名前");
  assert.equal(response.participantToken, "new-participant-token");
  assert.equal(response.room.roomCode, "123456");
});
