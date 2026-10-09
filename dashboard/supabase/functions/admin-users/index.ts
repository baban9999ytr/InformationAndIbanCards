import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (origin: string) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
  vary: "Origin",
});

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = (
    Deno.env.get("CORS_ALLOWED_ORIGINS") ??
    Deno.env.get("APP_ORIGIN") ??
    "https://bilgi.openstacktool.com,https://openstacktool.com"
  ).split(",").map((value) => value.trim()).filter(Boolean);
  const responseOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] ?? "https://bilgi.openstacktool.com";
  const headers = corsHeaders(responseOrigin);
  if (origin && !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Admin user service is not configured" }), { status: 503, headers });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userResult, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !userResult.user) {
    return new Response(JSON.stringify({ error: "Invalid user session" }), { status: 401, headers });
  }
  const actor = userResult.user;
  const { data: actorProfile, error: actorError } = await admin
    .from("profiles")
    .select("role,is_super_user,is_suspended")
    .eq("id", actor.id)
    .maybeSingle();
  if (actorError) {
    console.error("Admin actor lookup failed", actorError.message);
    return new Response(JSON.stringify({ error: "Unable to verify admin permissions" }), { status: 500, headers });
  }
  if (!actorProfile || actorProfile.is_suspended || (actorProfile.role !== "admin" && actorProfile.is_super_user !== true)) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers });
  }

  if (payload.action === "list") {
    const page = Number.isInteger(payload.page) && Number(payload.page) > 0 ? Number(payload.page) : 1;
    const perPage = 50;
    const { data: usersResult, error: usersError } = await admin.auth.admin.listUsers({ page, perPage });
    if (usersError) {
      console.error("Admin user list failed", usersError.message);
      return new Response(JSON.stringify({ error: "Unable to list users" }), { status: 500, headers });
    }
    const userIds = usersResult.users.map((user) => user.id);
    const [{ data: profiles, error: profilesError }, { count: totalUsers, error: countError }, { count: activeUsers, error: activeCountError }] = await Promise.all([
      userIds.length
        ? admin.from("profiles").select("id,full_name,role,is_suspended,is_super_user").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_suspended", false),
    ]);
    if (profilesError || countError || activeCountError) {
      console.error("Admin profile query failed", profilesError?.message || countError?.message || activeCountError?.message);
      return new Response(JSON.stringify({ error: "Unable to read user profiles" }), { status: 500, headers });
    }
    const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const users = usersResult.users.map((user) => {
      const profile = profileById.get(user.id);
      return {
        id: user.id,
        email: user.email ?? null,
        full_name: profile?.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        role: profile?.role ?? "user",
        is_super_user: Boolean(profile?.is_super_user),
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        is_suspended: Boolean(profile?.is_suspended) || Boolean(
          user.banned_until && new Date(user.banned_until).getTime() > Date.now(),
        ),
      };
    });
    return new Response(JSON.stringify({
      users,
      page,
      perPage,
      totalUsers: totalUsers ?? users.length,
      activeUsers: activeUsers ?? 0,
      hasMore: usersResult.users.length === perPage,
    }), { status: 200, headers });
  }

  if (payload.action === "set_status") {
    const targetId = payload.userId;
    const suspended = payload.suspended;
    if (
      typeof targetId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) ||
      typeof suspended !== "boolean"
    ) {
      return new Response(JSON.stringify({ error: "Invalid user status request" }), { status: 400, headers });
    }
    if (targetId === actor.id) {
      return new Response(JSON.stringify({ error: "You cannot suspend your own account" }), { status: 400, headers });
    }
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("role,is_super_user")
      .eq("id", targetId)
      .maybeSingle();
    if (targetError) {
      console.error("Admin target lookup failed", targetError.message);
      return new Response(JSON.stringify({ error: "Unable to verify target user" }), { status: 500, headers });
    }
    if (!targetProfile) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers });
    if (targetProfile.role === "admin" || targetProfile.is_super_user) {
      return new Response(JSON.stringify({ error: "Administrator accounts cannot be suspended here" }), { status: 403, headers });
    }

    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update({ is_suspended: suspended })
      .eq("id", targetId);
    if (profileUpdateError) {
      console.error("Admin profile status update failed", profileUpdateError.message);
      return new Response(JSON.stringify({ error: "Unable to update profile status" }), { status: 500, headers });
    }
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetId, {
      ban_duration: suspended ? "876000h" : "none",
    });
    if (authUpdateError) {
      const { error: rollbackError } = await admin
        .from("profiles")
        .update({ is_suspended: !suspended })
        .eq("id", targetId);
      console.error("Admin user status update failed", authUpdateError.message);
      if (rollbackError) console.error("Admin user status rollback failed", rollbackError.message);
      return new Response(JSON.stringify({ error: rollbackError
        ? "Authentication update failed and profile status rollback also failed"
        : "Unable to update authentication status; profile status was restored" }), { status: 500, headers });
    }
    const { error: auditError } = await admin.from("admin_audit_log").insert({
      actor_user_id: actor.id,
      action: suspended ? "user.suspend" : "user.activate",
      entity_type: "profile",
      entity_id: targetId,
      changed_fields: ["is_suspended", "banned_until"],
    });
    if (auditError) {
      console.error("Admin user audit write failed", auditError.message);
      return new Response(JSON.stringify({ error: "User status changed but audit logging failed" }), { status: 500, headers });
    }
    return new Response(JSON.stringify({ ok: true, userId: targetId, is_suspended: suspended }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: "Unsupported action" }), { status: 400, headers });
});
