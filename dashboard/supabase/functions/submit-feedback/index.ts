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

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }
  const {
    key,
    rating,
    customer_message: message,
    customer_contact: customerContact,
    customer_name: customerName,
    hide_name: hideName,
    hide_email: hideEmail,
  } = payload;
  if (
    typeof key !== "string" || key.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(key) ||
    typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 3 ||
    typeof message !== "string" || message.trim().length < 1 || message.length > 2000 ||
    (customerName !== undefined &&
      (typeof customerName !== "string" || customerName.trim().length > 120)) ||
    (hideName !== undefined && typeof hideName !== "boolean") ||
    (hideEmail !== undefined && typeof hideEmail !== "boolean") ||
    (customerContact !== undefined && customerContact !== "" &&
      (typeof customerContact !== "string" || customerContact.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerContact)))
  ) {
    return new Response(JSON.stringify({ error: "Invalid feedback" }), { status: 400, headers });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Feedback service is not configured" }), { status: 503, headers });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let userId: string | null = null;
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: authenticatedUser, error: authError } = await admin.auth.getUser(token);
    if (authError || !authenticatedUser.user) {
      return new Response(JSON.stringify({ error: "Invalid user session" }), { status: 401, headers });
    }
    userId = authenticatedUser.user.id;
  }
  let { data: card, error: cardError } = await admin
    .from("nfc_cards")
    .select("id,user_id,blocks,google_review_url")
    .eq("access_mode", "public")
    .eq("slug", key)
    .eq("status", "active")
    .eq("is_active", true)
    .not("user_id", "is", null)
    .maybeSingle();
  if (!card && !cardError) {
    ({ data: card, error: cardError } = await admin
      .from("nfc_cards")
      .select("id,user_id,blocks,google_review_url")
      .eq("access_mode", "private")
      .eq("access_token", key)
      .eq("status", "active")
      .eq("is_active", true)
      .not("user_id", "is", null)
      .maybeSingle());
  }
  if (cardError) {
    console.error("Feedback card lookup failed", cardError.message);
    return new Response(JSON.stringify({ error: "Unable to verify card" }), { status: 500, headers });
  }
  if (!card) return new Response(JSON.stringify({ error: "Card not found" }), { status: 404, headers });
  const reviewBlocks = Array.isArray(card.blocks)
    ? card.blocks.filter((block: { type?: unknown }) => block.type === "google_review")
    : [];
  const hasReviewBlock = reviewBlocks.length
    ? reviewBlocks.some((block: { visible?: unknown }) => block.visible !== false)
    : Boolean(card.google_review_url);
  if (!hasReviewBlock) return new Response(JSON.stringify({ error: "Feedback is not enabled for this card" }), { status: 404, headers });
  const { data: ownerProfile, error: ownerError } = await admin
    .from("profiles")
    .select("is_suspended")
    .eq("id", card.user_id)
    .maybeSingle();
  if (ownerError) {
    console.error("Feedback owner status lookup failed", ownerError.message);
    return new Response(JSON.stringify({ error: "Unable to verify card owner" }), { status: 500, headers });
  }
  if (!ownerProfile || ownerProfile.is_suspended) {
    return new Response(JSON.stringify({ error: "Card not found" }), { status: 404, headers });
  }

  const { error: insertError } = await admin.from("card_feedbacks").insert({
    card_id: card.id,
    user_id: userId,
    rating,
    customer_message: message.trim(),
    customer_contact: typeof customerContact === "string" && customerContact.trim() ? customerContact.trim() : null,
    name: typeof customerName === "string" && customerName.trim() ? customerName.trim() : null,
    email: typeof customerContact === "string" && customerContact.trim() ? customerContact.trim() : null,
    is_name_hidden: hideName === true,
    is_email_hidden: hideEmail === true,
  });
  if (insertError) {
    console.error("Feedback insert failed", insertError.message);
    return new Response(JSON.stringify({ error: "Unable to save feedback" }), { status: 500, headers });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 201, headers });
});
