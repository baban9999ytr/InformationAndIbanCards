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

  let key: unknown;
  try {
    ({ key } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }
  if (typeof key !== "string" || key.length < 3 || key.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return new Response(JSON.stringify({ error: "Invalid card link" }), { status: 400, headers });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Card lookup is not configured" }), { status: 503, headers });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const safeFields = "id,title,type,access_mode,google_review_url,whatsapp,sms,instagram_url,email,iban,bank_name,extra_links,blocks,is_active,user_id";
  let card = null;
  let error = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    ({ data: card, error } = await admin
      .from("nfc_cards")
      .select(safeFields)
      .eq("access_mode", "public")
      .eq("id", key)
      .eq("status", "active")
      .not("user_id", "is", null)
      .maybeSingle());
  }
  if (!card && !error) {
    ({ data: card, error } = await admin
      .from("nfc_cards")
      .select(safeFields)
      .eq("access_mode", "public")
      .eq("slug", key)
      .eq("status", "active")
      .not("user_id", "is", null)
      .maybeSingle());
  }

  if (!card && !error) {
    ({ data: card, error } = await admin
      .from("nfc_cards")
      .select(safeFields)
      .eq("access_mode", "private")
      .eq("access_token", key)
      .eq("status", "active")
      .not("user_id", "is", null)
      .maybeSingle());
  }
  if (error) {
    console.error("Card lookup failed", error.message);
    return new Response(JSON.stringify({ error: "Card lookup failed" }), { status: 500, headers });
  }
  if (!card) return new Response(JSON.stringify({ error: "Card not found" }), { status: 404, headers });
  const { data: ownerProfile, error: ownerError } = await admin
    .from("profiles")
    .select("is_suspended")
    .eq("id", card.user_id)
    .maybeSingle();
  if (ownerError) {
    console.error("Card owner status lookup failed", ownerError.message);
    return new Response(JSON.stringify({ error: "Card lookup failed" }), { status: 500, headers });
  }
  if (!ownerProfile || ownerProfile.is_suspended) {
    return new Response(JSON.stringify({ error: "Card not found" }), { status: 404, headers });
  }
  if (!card.is_active) {
    return new Response(
      JSON.stringify({ card: { id: card.id, title: card.title, type: card.type, is_active: false } }),
      { status: 200, headers },
    );
  }
  const publicCard = { ...card };
  delete publicCard.user_id;
  return new Response(JSON.stringify({ card: publicCard }), { status: 200, headers });
});
