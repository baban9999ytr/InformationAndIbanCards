import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  demoCard,
  resolvePrimaryAction,
  resolvePresentationMode,
  validatePrimaryAction,
} from "./cardExperience.js";

test("legacy cards without a presentation setting remain Showcase", () => {
  assert.equal(resolvePresentationMode({ title: "Existing" }), "showcase");
  assert.equal(resolvePresentationMode({ blocks: [{ type: "profile", data: {} }] }), "showcase");
});

test("legacy cards without a primary action resolve safely to no action", () => {
  assert.equal(resolvePrimaryAction({ title: "Existing", blocks: [] }), null);
  assert.equal(validatePrimaryAction({ title: "Existing", blocks: [] }), "Choose a primary action.");
});

test("public Showcase renderer binds the optional action before rendering it", async () => {
  const source = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(source, /const showcaseAction = resolvePrimaryAction\(card\);/);
});

test("presentation mode is compatible when stored in the profile block", () => {
  assert.equal(resolvePresentationMode({ blocks: [{ type: "profile", data: { presentation_mode: "smart" } }] }), "smart");
  assert.equal(resolvePresentationMode({ presentation_mode: "unknown" }), "showcase");
});

test("primary action references stable block IDs instead of block ordering", () => {
  const card = {
    primary_action: { type: "copy_iban", source_block_id: "pay-1" },
    blocks: [
      { id: "profile-1", type: "profile", data: {} },
      { id: "pay-1", type: "payment_or_iban", visible: true, data: { iban: "TR120006200123400006789012" } },
    ],
  };
  assert.equal(validatePrimaryAction(card), "");
  card.blocks.reverse();
  assert.equal(resolvePrimaryAction(card).source_block_id, "pay-1");
  assert.equal(validatePrimaryAction(card), "");
});

test("missing, hidden, and incomplete primary action sources are rejected", () => {
  const card = { blocks: [{ id: "payment", type: "payment_or_iban", visible: false, data: { iban: "TR120006200123400006789012" } }] };
  assert.match(validatePrimaryAction(card, { type: "copy_iban", source_block_id: "payment" }), /missing or hidden/);
  assert.match(validatePrimaryAction({ blocks: [] }, { type: "custom_url", url: "" }), /valid destination/);
});

test("primary actions can address a stable link inside a source block", () => {
  const card = { blocks: [{ id: "social", type: "social", data: { links: [{ id: "site", url: "https://example.com" }] } }] };
  assert.equal(validatePrimaryAction(card, { type: "website", source_block_id: "social", source_item_id: "site" }), "");
  assert.match(validatePrimaryAction(card, { type: "website", source_block_id: "social", source_item_id: "deleted" }), /no longer available/);
});

test("local demo fixture covers real Showcase content without a production record", () => {
  assert.equal(resolvePresentationMode(demoCard), "showcase");
  assert.ok(demoCard.blocks.find((block) => block.type === "profile").data.cover_url);
  assert.ok(demoCard.blocks.find((block) => block.type === "profile").data.gallery.length >= 3);
  assert.ok(demoCard.blocks.find((block) => block.type === "payment_or_iban").data.iban);
  assert.equal(validatePrimaryAction(demoCard), "");
});
