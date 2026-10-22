import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261022123037_maps_and_card_permissions.sql", import.meta.url),
  "utf8",
);

test("location migration stores canonical map fields and extracts iframe src server-side", () => {
  assert.match(migration, /add column if not exists map_address/);
  assert.match(migration, /add column if not exists map_url/);
  assert.match(migration, /add column if not exists map_type/);
  assert.match(migration, /regexp_matches\(iframe_tag/);
  assert.match(migration, /is_valid_card_map_reference/);
  assert.match(migration, /raise exception 'Location block requires an address or one map URL'/);
});

test("card permissions are constrained, requests are admin-resolved, and RLS enforces each operation", () => {
  for (const key of ["card_create", "card_manage", "card_view"]) {
    assert.ok(migration.includes(key));
  }
  assert.match(migration, /card_permission_requests/);
  assert.match(migration, /revoke update \(card_permissions\) on public\.profiles from authenticated/);
  assert.match(migration, /Users can create cards with card permission[\s\S]*?has_card_permission\('card_create'\)/);
  assert.match(migration, /Users can update cards with card permission[\s\S]*?has_card_permission\('card_manage'\)/);
  assert.match(migration, /Users can view cards with card permission[\s\S]*?has_card_permission\('card_view'\)/);
  assert.match(migration, /Card viewing permission required/);
});
