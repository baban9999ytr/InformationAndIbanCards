const paletteColumns =
  "id,owner_user_id,name,description,kind,tokens,is_default,is_active,moderation_status,moderation_note,created_at,updated_at";
const tokenNames = [
  "background",
  "surface",
  "text",
  "primary",
  "accent",
  "muted",
  "button_text",
];
const safeColor = /^#[0-9a-f]{6}$/i;

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(first, second) {
  if (!safeColor.test(first || "") || !safeColor.test(second || "")) return 0;
  const luminance = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (luminance[0] + 0.05) / (luminance[1] + 0.05);
}

export function paletteContrastIssues(tokens) {
  const valid = validatePaletteTokens(tokens);
  return [
    ["text", "background"],
    ["text", "surface"],
    ["button_text", "primary"],
  ].flatMap(([foreground, background]) => {
    const ratio = contrastRatio(valid[foreground], valid[background]);
    return ratio < 4.5 ? [{ foreground, background, ratio }] : [];
  });
}

export function validatePaletteTokens(tokens) {
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    throw new Error("Palette tokens must be an object");
  }
  const keys = Object.keys(tokens);
  if (
    keys.length !== tokenNames.length ||
    keys.some((key) => !tokenNames.includes(key))
  ) {
    throw new Error("Palette tokens contain unsupported fields");
  }
  for (const name of tokenNames) {
    if (typeof tokens[name] !== "string" || !safeColor.test(tokens[name])) {
      throw new Error(`Invalid color token: ${name}`);
    }
  }
  return Object.fromEntries(
    tokenNames.map((name) => [name, tokens[name].toUpperCase()]),
  );
}

function requireClient(client) {
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

export async function getDefaultPalette(client) {
  const { data, error } = await requireClient(client)
    .from("palette_definitions")
    .select(paletteColumns)
    .eq("kind", "system")
    .eq("is_default", true)
    .eq("is_active", true)
    .eq("moderation_status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMyPalettes(client) {
  const { data, error } = await requireClient(client)
    .from("palette_definitions")
    .select(paletteColumns)
    .eq("kind", "custom")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveCustomPalette(client, palette) {
  const payload = {
    name: String(palette.name || "").trim(),
    description: palette.description || null,
    tokens: validatePaletteTokens(palette.tokens),
    owner_user_id: palette.owner_user_id,
    kind: "custom",
    is_default: false,
  };
  const query = palette.id
    ? requireClient(client)
        .from("palette_definitions")
        .update(payload)
        .eq("id", palette.id)
    : requireClient(client).from("palette_definitions").insert(payload);
  const { data, error } = await query.select(paletteColumns).single();
  if (error) throw error;
  return data;
}

export async function applyPaletteToCard(client, cardId, paletteId) {
  const { data, error } = await requireClient(client)
    .from("nfc_cards")
    .update({ palette_id: paletteId || null })
    .eq("id", cardId)
    .select("id,palette_id")
    .single();
  if (error) throw error;
  return data;
}

export async function listPalettesForAdmin(client, { status } = {}) {
  let query = requireClient(client)
    .from("palette_definitions")
    .select(paletteColumns)
    .order("updated_at", { ascending: false });
  if (status) query = query.eq("moderation_status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function moderatePalette(client, paletteId, changes) {
  if (changes.tokens)
    changes = { ...changes, tokens: validatePaletteTokens(changes.tokens) };
  const { data, error } = await requireClient(client)
    .from("palette_definitions")
    .update(changes)
    .eq("id", paletteId)
    .select(paletteColumns)
    .single();
  if (error) throw error;
  return data;
}

export async function deletePalette(client, paletteId) {
  const { error } = await requireClient(client)
    .from("palette_definitions")
    .delete()
    .eq("id", paletteId);
  if (error) throw error;
}
