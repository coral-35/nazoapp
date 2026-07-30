import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeviceToken,
  hashDeviceToken,
  resolveDeviceIdentity
} from "../lib/device-identity.server.ts";

test("createDeviceToken returns a 256-bit hexadecimal token", () => {
  assert.match(createDeviceToken(), /^[a-f0-9]{64}$/);
});

test("resolveDeviceIdentity reuses a valid cookie token", () => {
  const token = "a".repeat(64);
  const identity = resolveDeviceIdentity(token, () => "b".repeat(64));

  assert.equal(identity.token, token);
  assert.equal(identity.hash, hashDeviceToken(token));
});

test("resolveDeviceIdentity replaces an invalid cookie token", () => {
  const replacement = "b".repeat(64);
  const identity = resolveDeviceIdentity("invalid", () => replacement);

  assert.equal(identity.token, replacement);
  assert.equal(identity.hash, hashDeviceToken(replacement));
});
