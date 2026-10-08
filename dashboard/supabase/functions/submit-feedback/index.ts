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
  const { key, rating, customer_message: message, customer_contact: customerContact } = payload;
  if (
    typeof key !== "string" || key.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(key) ||
    typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 3 ||
    typeof message !== "string" || message.trim().length < 1 || message.length > 2000 ||
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
  let { data: card, error: cardError } = await admin
    .from("nfc_cards")
    .select("id")
    .eq("access_mode", "public")
    .eq("slug", key)
    .eq("type", "google_review")
    .eq("is_active", true)
    .maybeSingle();
  if (!card && !cardError) {
    ({ data: card, error: cardError } = await admin
      .from("nfc_cards")
      .select("id")
      .eq("access_mode", "private")
      .eq("access_token", key)
      .eq("type", "google_review")
      .eq("is_active", true)
      .maybeSingle());
  }
  if (cardError) {
    console.error("Feedback card lookup failed", cardError.message);
    return new Response(JSON.stringify({ error: "Unable to verify card" }), { status: 500, headers });
  }
  if (!card) return new Response(JSON.stringify({ error: "Card not found" }), { status: 404, headers });

  const { error: insertError } = await admin.from("card_feedbacks").insert({
    card_id: card.id,
    rating,
    customer_message: message.trim(),
    customer_contact: typeof customerContact === "string" && customerContact.trim() ? customerContact.trim() : null,
  });
  if (insertError) {
    console.error("Feedback insert failed", insertError.message);
    return new Response(JSON.stringify({ error: "Unable to save feedback" }), { status: 500, headers });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 201, headers });
});
