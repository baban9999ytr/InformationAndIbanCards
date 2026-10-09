import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateCardFromBlocks,
  isValidIban,
  makeCardBlocks,
  toLegacyCardFields,
} from "./cardBlocks.js";

test("legacy card fields hydrate into supported editable blocks", () => {
  const card = hydrateCardFromBlocks({
    title: "Cafe",
    google_review_url: "https://example.com/review",
    iban: "TR330006100519786457841326",
    bank_name: "Example Bank",
    email: "hello@example.com",
  });

  assert.deepEqual(card.blocks.map((block) => block.type), [
    "profile",
    "google_review",
    "payment_or_iban",
    "contact",
  ]);
  assert.equal(card.blocks[1].data.url, card.google_review_url);
  assert.equal(card.blocks[2].data.iban, card.iban);
});

test("legacy block aliases normalize without losing order or hidden state", () => {
  const blocks = makeCardBlocks([
    { id: "old-payment", type: "payment", order: 7, visible: false, data: { iban: "TR00" } },
    { id: "old-links", type: "custom", order: 2, data: { links: [] } },
  ]);

  assert.deepEqual(blocks.map(({ type, order }) => [type, order]), [
    ["custom_links", 0],
    ["profile", 1],
    ["payment_or_iban", 2],
  ]);
  assert.equal(blocks[2].visible, false);
});

test("legacy columns are mirrored only from visible blocks", () => {
  const fields = toLegacyCardFields([
    { type: "payment_or_iban", visible: false, data: { iban: "TR330006100519786457841326" } },
    { type: "contact", visible: true, data: { email: "person@example.com" } },
  ]);

  assert.equal(fields.iban, null);
  assert.equal(fields.email, "person@example.com");
});

test("IBAN validation checks format and mod-97 checksum", () => {
  assert.equal(isValidIban("TR33 0006 1005 1978 6457 8413 26"), true);
  assert.equal(isValidIban("TR33 0006 1005 1978 6457 8413 27"), false);
  assert.equal(isValidIban("TR330006100519786457841326:44"), false);
});
