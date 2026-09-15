import test from "node:test";
import assert from "node:assert/strict";
import { verifyAdminLogin } from "../lib/admin-login.ts";

test("login checks management API using the newly issued token", async () => {
  await verifyAdminLogin("new-token", async (url, init) => {
    assert.equal(url, "/api/admin/event");
    assert.equal(init.headers.Authorization, "Bearer new-token");
    assert.equal(init.cache, "no-store");
    return new Response("{}", { status: 200 });
  });
});
test("failed management checks show actionable errors instead of entering redirect loop", async () => {
  for (const [status, message] of [[403, /管理権限/], [401, /もう一度ログイン/], [500, /DB設定/]]) {
    await assert.rejects(verifyAdminLogin("token", async () => new Response("{}", { status })), message);
  }
});
