import assert from "node:assert/strict";
import test from "node:test";
import { defaultRoomId } from "../lib/default-room.ts";
import { readStoredParticipant, restoreStoredParticipant } from "../lib/participant-storage.ts";

const participant = { participantToken: "token", participantName: "参加者", roomCode: "123456" };
function storage(value = JSON.stringify(participant)) {
  return { value, removed: false, getItem() { return this.value; }, removeItem() { this.removed = true; this.value = null; } };
}

test("production event requires an explicit UUID", () => {
  const eventId = "74cdd564-a4e2-415d-a37d-92e924bc5986";
  assert.equal(defaultRoomId({ DEFAULT_EVENT_ID: ` ${eventId} ` }), eventId);
  for (const env of [{}, { DEFAULT_EVENT_ID: "" }, { DEFAULT_EVENT_ID: "sample" }]) {
    assert.throws(() => defaultRoomId(env), /DEFAULT_EVENT_ID/);
  }
});
test("valid cache is restored without changing the participant", async () => {
  const store = storage();
  assert.deepEqual(await restoreStoredParticipant(store, "123456", async p => { assert.equal(p.participantToken, "token"); return 200; }), participant);
  assert.equal(store.removed, false);
});
test("missing, broken or other-room cache returns to name entry", async () => {
  for (const value of [null, "broken", "null", JSON.stringify({ ...participant, roomCode: "654321" })]) {
    assert.equal(await restoreStoredParticipant(storage(value), "123456", async () => { assert.fail("must not validate absent cache"); }), null);
  }
  assert.equal(readStoredParticipant({ getItem() { throw new Error("storage disabled"); } }, "123456"), null);
});
test("expired token is removed so entry cannot loop back to an invalid session", async () => {
  const store = storage();
  assert.equal(await restoreStoredParticipant(store, "123456", async () => 401), null);
  assert.equal(store.removed, true);
});
test("transient server or network errors preserve the cache for retry", async () => {
  for (const validate of [async () => 503, async () => { throw new Error("offline"); }]) {
    const store = storage();
    await assert.rejects(restoreStoredParticipant(store, "123456", validate));
    assert.equal(store.removed, false);
  }
});
