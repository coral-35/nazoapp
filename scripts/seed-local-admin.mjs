import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const USERS_PER_PAGE = 1000;

function requireValue(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function readLocalAdminConfig(env = process.env) {
  const supabaseUrl = requireValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const email = requireValue(env, "LOCAL_ADMIN_EMAIL").toLowerCase();
  const password = requireValue(env, "LOCAL_ADMIN_PASSWORD");

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL");
  }

  if (!LOCAL_HOSTNAMES.has(parsedUrl.hostname)) {
    throw new Error(
      "Refusing to seed an admin user outside local Supabase (localhost, 127.0.0.1, or ::1)"
    );
  }

  if (password.length < 6) {
    throw new Error("LOCAL_ADMIN_PASSWORD must be at least 6 characters");
  }

  return { supabaseUrl, serviceRoleKey, email, password };
}

async function findUserByEmail(admin, email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({
      page,
      perPage: USERS_PER_PAGE
    });

    if (error) {
      throw new Error(`Failed to list local Auth users: ${error.message}`);
    }

    const users = data?.users || [];
    const existingUser = users.find((user) => user.email?.toLowerCase() === email);
    if (existingUser) {
      return existingUser;
    }

    if (users.length < USERS_PER_PAGE) {
      return null;
    }
  }
}

export async function seedLocalAdmin({
  env = process.env,
  createSupabaseClient = createClient,
  logger = console
} = {}) {
  const { supabaseUrl, serviceRoleKey, email, password } = readLocalAdminConfig(env);
  const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const existingUser = await findUserByEmail(supabase.auth.admin, email);
  let userId;
  let created = false;

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true
    });
    if (error || !data.user) {
      throw new Error(`Failed to update local admin user: ${error?.message || "unknown error"}`);
    }
    userId = data.user.id;
    logger.log(`Updated local quiz admin: ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error || !data.user) {
      throw new Error(`Failed to create local quiz admin: ${error?.message || "unknown error"}`);
    }
    userId = data.user.id;
    created = true;
    logger.log(`Created local quiz admin: ${email}`);
  }

  const eventId = env.DEFAULT_EVENT_ID?.trim();
  if (eventId) {
    const { data: event, error: eventError } = await supabase
      .from("event_settings")
      .update({ created_by: userId })
      .eq("id", eventId)
      .select("id")
      .maybeSingle();
    if (eventError) {
      throw new Error(`Failed to assign local event owner: ${eventError.message}`);
    }
    if (!event) {
      throw new Error("DEFAULT_EVENT_ID does not match a local event");
    }
    logger.log(`Assigned local event owner: ${eventId}`);
  }

  return { created, userId };
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  seedLocalAdmin().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
