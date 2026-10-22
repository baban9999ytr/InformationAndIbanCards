import assert from "node:assert/strict";
import test from "node:test";
import { isCardReadyForPublic } from "./card-readiness.js";

test("a card with only its business name, matching profile name, and slug is not ready", () => {
  assert.equal(
    isCardReadyForPublic({
      title: "Mavi Kahve",
      slug: "mavi-kahve",
      blocks: [
        { type: "profile", data: { name: "Mavi Kahve", company: "Mavi Kahve" } },
      ],
    }),
    false,
  );
});

test("hidden and blank blocks do not make a card public-ready", () => {
  assert.equal(
    isCardReadyForPublic({
      title: "Cafe",
      blocks: [
        { type: "contact", visible: false, data: { phone: "5551234567" } },
        { type: "contact", data: { phone: "   " } },
        { type: "social", data: { links: [{ label: "Instagram", url: "" }] } },
      ],
    }),
    false,
  );
});

test("meaningful legacy fields and editable blocks keep existing cards ready", () => {
  for (const card of [
    { title: "Cafe", iban: "TR270006200123400006789012" },
    { title: "Cafe", extra_links: [{ label: "Website", url: "https://example.com" }] },
    { title: "Cafe", blocks: [{ type: "contact", data: { phone: "+905551234567" } }] },
    { title: "Cafe", blocks: [{ type: "text_or_note", data: { text: "Welcome" } }] },
    { title: "Cafe", blocks: [{ type: "profile", data: { bio: "Independent coffee shop" } }] },
  ]) {
    assert.equal(isCardReadyForPublic(card), true);
  }
});

test("unknown and malformed blocks are ignored instead of crashing readiness checks", () => {
  assert.equal(
    isCardReadyForPublic({
      title: "Cafe",
      blocks: [null, "bad", { type: "calendar", data: { url: "https://example.com" } }],
    }),
    false,
  );
});
