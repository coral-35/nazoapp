import assert from "node:assert/strict";
import test from "node:test";
import {
  readLocalAdminConfig,
  seedLocalAdmin
} from "../scripts/seed-local-admin.mjs";

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
  LOCAL_ADMIN_EMAIL: "Admin@Example.test",
  LOCAL_ADMIN_PASSWORD: "local-password"
};

test("readLocalAdminConfig normalizes a local admin email", () => {
  const config = readLocalAdminConfig(baseEnv);

  assert.equal(config.email, "admin@example.test");
  assert.equal(config.password, "local-password");
});

test("readLocalAdminConfig refuses a remote Supabase URL", () => {
  assert.throws(
    () =>
      readLocalAdminConfig({
        ...baseEnv,
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co"
      }),
    /Refusing to seed an admin user outside local Supabase/
  );
});

test("seedLocalAdmin creates and confirms a missing user", async () => {
  const createUserCalls = [];
  const logs = [];
  const fakeClient = {
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: [] }, error: null };
        },
        async createUser(attributes) {
          createUserCalls.push(attributes);
          return { data: { user: { id: "new-user-id" } }, error: null };
        }
      }
    }
  };

  const result = await seedLocalAdmin({
    env: baseEnv,
    createSupabaseClient: () => fakeClient,
    logger: { log: (message) => logs.push(message) }
  });

  assert.deepEqual(createUserCalls, [
    {
      email: "admin@example.test",
      password: "local-password",
      email_confirm: true
    }
  ]);
  assert.deepEqual(result, { created: true, userId: "new-user-id" });
  assert.deepEqual(logs, ["Created local quiz admin: admin@example.test"]);
});

test("seedLocalAdmin synchronizes an existing user's password", async () => {
  let createUserCalled = false;
  const updateUserCalls = [];
  const fakeClient = {
    auth: {
      admin: {
        async listUsers() {
          return {
            data: { users: [{ id: "existing-user-id", email: "admin@example.test" }] },
            error: null
          };
        },
        async createUser() {
          createUserCalled = true;
          throw new Error("createUser should not be called");
        },
        async updateUserById(id, attributes) {
          updateUserCalls.push({ id, attributes });
          return { data: { user: { id } }, error: null };
        }
      },
      from() {
        throw new Error("event ownership should not run without DEFAULT_EVENT_ID");
      }
    }
  };

  const result = await seedLocalAdmin({
    env: baseEnv,
    createSupabaseClient: () => fakeClient,
    logger: { log() {} }
  });

  assert.equal(createUserCalled, false);
  assert.deepEqual(updateUserCalls, [{
    id: "existing-user-id",
    attributes: { password: "local-password", email_confirm: true }
  }]);
  assert.deepEqual(result, { created: false, userId: "existing-user-id" });
});

test("seedLocalAdmin assigns the configured local event to the admin", async () => {
  const updates = [];
  const fakeClient = {
    auth: { admin: {
      async listUsers() { return { data: { users: [] }, error: null }; },
      async createUser() { return { data: { user: { id: "admin-id" } }, error: null }; }
    } },
    from(table) {
      assert.equal(table, "event_settings");
      return {
        update(values) { updates.push(values); return this; },
        eq(column, value) { assert.deepEqual([column, value], ["id", "event-id"]); return this; },
        select() { return this; },
        async maybeSingle() { return { data: { id: "event-id" }, error: null }; }
      };
    }
  };
  const result = await seedLocalAdmin({
    env: { ...baseEnv, DEFAULT_EVENT_ID: "event-id" },
    createSupabaseClient: () => fakeClient,
    logger: { log() {} }
  });
  assert.deepEqual(updates, [{ created_by: "admin-id" }]);
  assert.deepEqual(result, { created: true, userId: "admin-id" });
});
