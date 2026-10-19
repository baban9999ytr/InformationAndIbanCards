import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateCardFromBlocks,
  inspectCardCompatibility,
  isValidIban,
  legacyFieldsForCardSave,
  makeCardBlocks,
  normalizeCardConfiguration,
  serializeCardBlocks,
  toLegacyCardFields,
} from "./cardBlocks.js";

test("legacy card fields hydrate into supported editable blocks", () => {
  const card = hydrateCardFromBlocks({
    title: "Cafe",
    google_review_url: "https://example.com/review",
    iban: "TR120006100000000123456789",
    bank_name: "Example Bank",
    email: "hello@example.com",
  });

  assert.deepEqual(
    card.blocks.map((block) => block.type),
    ["profile", "google_review", "payment_or_iban", "contact"],
  );
  assert.equal(card.blocks[1].data.url, card.google_review_url);
  assert.equal(card.blocks[2].data.iban, card.iban);
});

test("legacy block aliases normalize without losing order or hidden state", () => {
  const blocks = makeCardBlocks([
    {
      id: "old-payment",
      type: "payment",
      order: 7,
      visible: false,
      data: { iban: "TR12 0006 1000 0000 0123 4567 89" },
    },
    { id: "old-links", type: "custom", order: 2, data: { links: [] } },
  ]);

  assert.deepEqual(
    blocks.map(({ type, order }) => [type, order]),
    [
      ["custom_links", 0],
      ["profile", 1],
      ["payment_or_iban", 2],
    ],
  );
  assert.equal(blocks[2].visible, false);
});

test("legacy columns are mirrored only from visible blocks", () => {
  const fields = toLegacyCardFields([
    {
      type: "payment_or_iban",
      visible: false,
      data: { iban: "TR120006100000000123456789" },
    },
    { type: "contact", visible: true, data: { email: "person@example.com" } },
  ]);

  assert.equal(fields.iban, null);
  assert.equal(fields.email, "person@example.com");
});

test("IBAN validation checks Turkish format and mod-97 checksum", () => {
  assert.equal(isValidIban("TR12 0006 1000 0000 0123 4567 89"), false);
  assert.equal(isValidIban("TR12 0006 1000 0000 0123 4567 8"), false);
  assert.equal(isValidIban("TR120006100000000123456789:44"), false);
});

test("unknown legacy blocks and fields are retained for a non-destructive save", () => {
  const card = normalizeCardConfiguration({
    title: "Legacy business",
    custom_legacy_setting: { keep: true },
    blocks: [
      {
        id: "legacy-map",
        type: "map_embed",
        order: 4,
        visible: false,
        data: { provider: "maps", place_id: "abc", future_field: "keep" },
        integration_id: "map-v1",
      },
    ],
  });

  assert.equal(card.schema_version, 1);
  assert.deepEqual(card.custom_legacy_setting, { keep: true });
  const legacyBlock = card.blocks.find((block) => block.id === "legacy-map");
  assert.equal(legacyBlock.type, "map_embed");
  assert.equal(legacyBlock.unsupported, true);
  assert.equal(legacyBlock.visible, false);
  assert.equal(legacyBlock.data.future_field, "keep");
  assert.equal(legacyBlock.integration_id, "map-v1");
});

test("legacy card survives normalize, edit, serialize, and reload", () => {
  const source = {
    id: "legacy-1",
    user_id: "owner-1",
    access_mode: "public",
    slug: "gulet",
    nfc_active: true,
    palette_id: "custom-palette",
    palette: { tokens: { background: "#101010" } },
    title: "Gület Denizcilik",
    iban: "TR120006100000000123456789",
    bank_name: "Eski Banka",
    whatsapp: "905551112233",
    email: "merhaba@example.com",
    blocks: [
      { id: "note", type: "text_or_note", order: 8, visible: true, data: { text: "Merhaba" } },
      { id: "pay", type: "payment", order: 3, visible: true, data: { iban: "TR120006100000000123456789", bank_name: "Eski Banka" } },
      { id: "future", type: "appointment", order: 5, visible: false, data: { provider: "calendar", slot_length: 30 }, revision: 4 },
    ],
  };
  const normalized = hydrateCardFromBlocks(source);
  const payment = normalized.blocks.find((block) => block.id === "pay");
  payment.data.bank_name = "Yeni Banka";
  const serialized = serializeCardBlocks(normalized.blocks);
  const saved = {
    ...source,
    ...legacyFieldsForCardSave(source, serialized),
    blocks: serialized,
  };
  const reloaded = hydrateCardFromBlocks(saved);
  const unknown = reloaded.blocks.find((block) => block.id === "future");

  assert.equal(saved.slug, "gulet");
  assert.equal(saved.nfc_active, true);
  assert.equal(saved.palette_id, "custom-palette");
  assert.equal(saved.palette.tokens.background, "#101010");
  assert.equal(saved.bank_name, "Yeni Banka");
  assert.deepEqual(
    reloaded.blocks
      .filter((block) => ["pay", "future", "note"].includes(block.id))
      .map((block) => block.id),
    ["pay", "future", "note"],
  );
  assert.equal(unknown.visible, false);
  assert.equal(unknown.data.slot_length, 30);
  assert.equal(unknown.revision, 4);
});

test("hidden blocks do not clear legacy mirror fields during save", () => {
  const source = { iban: "TR120006100000000123456789", bank_name: "Korunan Banka" };
  const fields = legacyFieldsForCardSave(source, [
    { id: "profile", type: "profile", visible: true, data: { name: "Kart" } },
    { id: "iban", type: "payment_or_iban", visible: false, data: { iban: "", bank_name: "" } },
  ]);
  assert.equal(fields.iban, source.iban);
  assert.equal(fields.bank_name, source.bank_name);
});

test("malformed legacy blocks are reported and block a safe save", () => {
  const malformed = normalizeCardConfiguration({
    title: "Broken",
    blocks: [{ type: "contact", data: "not-an-object" }],
  });
  assert.deepEqual(inspectCardCompatibility({ blocks: "invalid" }).errors, [
    "blocks must be an array when present",
  ]);
  assert.equal(malformed.compatibility.errors.length, 1);
});
