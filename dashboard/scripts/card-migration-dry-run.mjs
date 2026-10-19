#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dryRunCardMigration } from "../src/cardMigration.js";

const file = process.argv[2];
if (!file) {
  console.error(
    "Usage: node scripts/card-migration-dry-run.mjs <cards-export.json>",
  );
  process.exitCode = 1;
} else {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  const cards = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(cards))
    throw new Error(
      "Expected an array of cards or an object with a cards array.",
    );

  console.log(JSON.stringify(dryRunCardMigration(cards), null, 2));
}
