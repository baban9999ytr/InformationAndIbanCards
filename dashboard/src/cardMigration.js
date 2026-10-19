import {
  inspectCardCompatibility,
  normalizeCardConfiguration,
} from "./cardBlocks.js";

function identity(card, index) {
  return card?.id || card?.title || `record-${index + 1}`;
}

/** Read-only migration assessment. It neither calls Supabase nor mutates input. */
export function dryRunCardMigration(cards) {
  if (!Array.isArray(cards)) throw new Error("Expected an array of cards");
  const report = {
    inspected: cards.length,
    compatible: 0,
    warning: 0,
    incompatible: 0,
    records: [],
  };
  const slugs = new Map();

  cards.forEach((rawCard, index) => {
    const issues = inspectCardCompatibility(rawCard);
    const warnings = [...issues.warnings];
    const errors = [...issues.errors];
    const id = identity(rawCard, index);
    if (
      !issues.errors.length &&
      (!Array.isArray(rawCard.blocks) || !rawCard.blocks.length)
    ) {
      warnings.push(
        "No modular blocks; legacy fields will be adapted in memory",
      );
    }
    if (rawCard?.access_mode === "public") {
      if (!rawCard.slug) errors.push("Public card has no slug");
      else {
        const matches = slugs.get(rawCard.slug) || [];
        matches.push(index);
        slugs.set(rawCard.slug, matches);
      }
    }
    if (!rawCard?.user_id) errors.push("Card has no owner");
    report.records.push({
      id,
      errors,
      warnings,
      normalized:
        errors.length === 0 ? normalizeCardConfiguration(rawCard) : null,
    });
  });

  for (const indexes of slugs.values()) {
    if (indexes.length < 2) continue;
    indexes.forEach((index) =>
      report.records[index].errors.push("Duplicate public slug"),
    );
  }
  for (const record of report.records) {
    if (record.errors.length) report.incompatible += 1;
    else if (record.warnings.length) report.warning += 1;
    else report.compatible += 1;
    delete record.normalized;
  }
  return report;
}
