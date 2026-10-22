import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261022120239_reserve_slugs_for_incomplete_cards.sql",
    import.meta.url,
  ),
  "utf8",
);

test("expired slug migration only queues cards for an explicit admin decision", () => {
  assert.match(migration, /slug_expires_at/);
  assert.match(migration, /slug_expiry_resolved_at/);
  assert.match(migration, /created_at \+ interval '48 hours'/);
  assert.doesNotMatch(migration, /cron\.schedule|pg_cron/i);
  assert.doesNotMatch(migration, /release_expired_incomplete_card_slugs/);
  assert.doesNotMatch(migration, /new\.slug\s*:=\s*null/i);
  assert.doesNotMatch(
    migration,
    /update public\.nfc_cards\s+as card\s+set access_mode\s*=\s*'private'/i,
  );
});
