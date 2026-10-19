import assert from "node:assert/strict";
import test from "node:test";
import { dryRunCardMigration } from "./cardMigration.js";

test("dry run classifies compatible, warning, and incompatible cards without mutation", () => {
  const cards = [
    {
      id: "current",
      user_id: "u1",
      access_mode: "public",
      slug: "current",
      blocks: [{ type: "profile", data: { name: "Current" } }],
    },
    { id: "legacy", user_id: "u2", access_mode: "public", slug: "legacy" },
    {
      id: "unknown",
      user_id: "u3",
      access_mode: "private",
      blocks: [{ type: "calendar", data: { source: "x" } }],
    },
    { id: "bad", access_mode: "public", slug: "current", blocks: "bad" },
  ];
  const original = structuredClone(cards);
  const report = dryRunCardMigration(cards);

  assert.equal(report.inspected, 4);
  assert.equal(report.compatible, 0);
  assert.equal(report.warning, 2);
  assert.equal(report.incompatible, 2);
  assert.deepEqual(cards, original);
  assert.ok(
    report.records
      .find((record) => record.id === "unknown")
      .warnings[0].includes("calendar"),
  );
  assert.ok(
    report.records
      .find((record) => record.id === "bad")
      .errors.includes("Duplicate public slug"),
  );
});
