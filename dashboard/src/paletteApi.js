const paletteColumns = "id,owner_user_id,name,description,kind,tokens,is_default,is_active,moderation_status,moderation_note,created_at,updated_at";

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
    name: palette.name,
    description: palette.description || null,
    tokens: palette.tokens,
    owner_user_id: palette.owner_user_id,
    kind: "custom",
    is_default: false,
  };
  const query = palette.id
    ? requireClient(client).from("palette_definitions").update(payload).eq("id", palette.id)
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
