# Legacy card compatibility

## What is read today

`nfc_cards` keeps legacy presentation fields (`title`, contact details, IBAN,
Google review URL, Instagram URL, and `extra_links`) alongside the modular
`blocks` JSONB array, palette assignment, access mode/slug or capability token,
owner, and NFC activation state. Public cards are resolved by the `resolve-card`
Edge Function, which preserves the established `/c/:slug` lookup and private
capability URLs.

## Compatibility approach

`src/cardBlocks.js` is the in-memory compatibility boundary used by the public
renderer and editor. A missing `schema_version` is interpreted as legacy data;
this is read-only and does not change a row. Legacy `payment` and `custom` block
aliases are normalized to their current equivalents. Recognized block defaults
are filled only in memory. Unknown block types, their top-level fields, their
data, visibility, and ordering remain intact so saving an otherwise editable
card does not silently erase future or historical content.

Unsupported blocks display a non-destructive editor notice. They can still be
reordered and have visibility changed; duplicate/delete controls are disabled
until a purpose-built editor exists.

## Dry run

Export card rows through an authorized process and run:

```sh
node scripts/card-migration-dry-run.mjs cards-export.json
```

The utility is read-only. It reports legacy cards without blocks, unsupported
block types, missing public slugs/owners, and duplicate public slugs. It never
connects to Supabase and never writes records.

## Production migration

No production migration was executed. Before changing stored card structures,
take and validate a recoverable backup, run the dry-run report on the actual
export, resolve every reported incompatibility, and obtain explicit approval.
Any later write migration must be idempotent, preserve slugs, owners, NFC tag
associations, palettes, and unknown fields, and support concurrency-safe
rollback without overwriting post-migration owner edits.
