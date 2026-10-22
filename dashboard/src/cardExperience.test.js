import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isValidIban } from "./cardBlocks.js";
import {
  copyPublicCardValue,
  demoCard,
  getEligiblePrimaryActionSources,
  getPrimaryActionBlockTypes,
  resolvePrimaryAction,
  resolvePresentationMode,
  validatePrimaryAction,
} from "./cardExperience.js";

test("public card copy writes the exact recipient or IBAN value", async () => {
  const copied = [];
  const clipboard = { writeText: async (value) => copied.push(value) };
  await copyPublicCardValue(clipboard, "Mavi Kahve Ltd. Şti.");
  await copyPublicCardValue(clipboard, "TR270006200123400006789012");
  assert.deepEqual(copied, ["Mavi Kahve Ltd. Şti.", "TR270006200123400006789012"]);
  await assert.rejects(copyPublicCardValue(null, "Mavi Kahve Ltd. Şti."));
});

test("legacy cards without a presentation setting remain Showcase", () => {
  assert.equal(resolvePresentationMode({ title: "Existing" }), "showcase");
  assert.equal(
    resolvePresentationMode({ blocks: [{ type: "profile", data: {} }] }),
    "showcase",
  );
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
  assert.equal(
    resolvePresentationMode({
      blocks: [{ type: "profile", data: { presentation_mode: "smart" } }],
    }),
    "smart",
  );
  assert.equal(
    resolvePresentationMode({ presentation_mode: "unknown" }),
    "showcase",
  );
});

test("primary action references stable block IDs instead of block ordering", () => {
  const card = {
    primary_action: { type: "copy_iban", source_block_id: "pay-1" },
    blocks: [
      { id: "profile-1", type: "profile", data: {} },
      {
        id: "pay-1",
        type: "payment_or_iban",
        visible: true,
        data: { iban: "TR270006200123400006789012" },
      },
    ],
  };
  assert.equal(validatePrimaryAction(card), "");
  card.blocks.reverse();
  assert.equal(resolvePrimaryAction(card).source_block_id, "pay-1");
  assert.equal(validatePrimaryAction(card), "");
});

test("missing, hidden, and incomplete primary action sources are rejected", () => {
  const card = {
    blocks: [
      {
        id: "payment",
        type: "payment_or_iban",
        visible: false,
        data: { iban: "TR270006200123400006789012" },
      },
    ],
  };
  assert.match(
    validatePrimaryAction(card, {
      type: "copy_iban",
      source_block_id: "payment",
    }),
    /missing or hidden/,
  );
  assert.match(
    validatePrimaryAction({ blocks: [] }, { type: "custom_url", url: "" }),
    /valid destination/,
  );
});

test("primary actions can address a stable link inside a source block", () => {
  const card = {
    blocks: [
      {
        id: "social",
        type: "social",
        data: { links: [{ id: "site", url: "https://example.com" }] },
      },
    ],
  };
  assert.equal(
    validatePrimaryAction(card, {
      type: "website",
      source_block_id: "social",
      source_item_id: "site",
    }),
    "",
  );
  assert.match(
    validatePrimaryAction(card, {
      type: "website",
      source_block_id: "social",
      source_item_id: "deleted",
    }),
    /no longer available/,
  );
});

test("source picker offers only visible blocks with content for the selected action", () => {
  const card = { blocks: [
    { id: "empty", type: "payment_or_iban", visible: true, data: { iban: "" } },
    { id: "hidden", type: "payment_or_iban", visible: false, data: { iban: "TR270006200123400006789012" } },
    { id: "ready", type: "payment_or_iban", visible: true, data: { iban: "TR270006200123400006789012" } },
    { id: "contact", type: "contact", visible: true, data: { phone: "+902121234567" } },
  ] };
  assert.deepEqual(getEligiblePrimaryActionSources(card, "copy_iban").map((block) => block.id), ["ready"]);
  assert.deepEqual(getEligiblePrimaryActionSources(card, "call").map((block) => block.id), ["contact"]);
  assert.deepEqual(getEligiblePrimaryActionSources(card, "social"), []);
});

test("primary actions identify the block type to add when a source is missing", () => {
  assert.deepEqual(getPrimaryActionBlockTypes("copy_iban"), ["payment_or_iban"]);
  assert.deepEqual(getPrimaryActionBlockTypes("call"), ["contact"]);
  assert.deepEqual(getPrimaryActionBlockTypes("google_review"), ["google_review"]);
  assert.deepEqual(getPrimaryActionBlockTypes("custom_url"), []);
});

test("deleted, hidden, and incompatible selected sources are rejected", () => {
  const card = { blocks: [
    { id: "phone", type: "contact", visible: true, data: { phone: "+902121234567" } },
    { id: "social", type: "social", visible: true, data: { links: [{ id: "site", url: "https://example.com" }] } },
  ] };
  assert.match(validatePrimaryAction(card, { type: "copy_iban", source_block_id: "phone" }), /incompatible/);
  assert.match(validatePrimaryAction(card, { type: "call", source_block_id: "deleted" }), /missing or hidden/);
  card.blocks[0].visible = false;
  assert.match(validatePrimaryAction(card, { type: "call", source_block_id: "phone" }), /missing or hidden/);
  assert.equal(validatePrimaryAction(card, { type: "website", source_block_id: "social", source_item_id: "site" }), "");
});

test("malformed legacy source data does not crash the source picker", () => {
  const card = { blocks: [
    { id: "broken", type: "payment_or_iban", data: { iban: 12345 } },
    { id: "bad-links", type: "social", data: { links: [{ url: 7 }, null] } },
  ] };
  assert.deepEqual(getEligiblePrimaryActionSources(card, "copy_iban"), []);
  assert.deepEqual(getEligiblePrimaryActionSources(card, "social"), []);
  assert.match(validatePrimaryAction(card, { type: "copy_iban", source_block_id: "broken" }), /incompatible/);
});

test("local demo fixture covers real Showcase content without a production record", () => {
  assert.equal(resolvePresentationMode(demoCard), "showcase");
  assert.equal(
    isValidIban(
      demoCard.blocks.find((block) => block.type === "payment_or_iban")?.data
        .iban,
    ),
    true,
  );
  assert.ok(
    demoCard.blocks.find((block) => block.type === "profile").data.cover_url,
  );
  assert.ok(
    demoCard.blocks.find((block) => block.type === "profile").data.gallery
      .length >= 3,
  );
  assert.ok(
    demoCard.blocks.find((block) => block.type === "payment_or_iban").data.iban,
  );
  assert.equal(validatePrimaryAction(demoCard), "");
});
