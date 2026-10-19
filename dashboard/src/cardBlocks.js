export const CARD_BLOCK_TYPES = [
  "profile",
  "google_review",
  "payment_or_iban",
  "contact",
  "social",
  "custom_button",
  "custom_links",
  "text_or_note",
];

export const CARD_CONFIG_VERSION = 2;

const legacyBlockTypes = {
  payment: "payment_or_iban",
  custom: "custom_links",
};

const blockDefaults = {
  profile: { name: "", title: "", bio: "", company: "", avatar_url: "" },
  google_review: {
    business_name: "",
    url: "",
    rating: "",
    review_count: "",
    button_text: "",
    title: "",
  },
  payment_or_iban: {
    bank_name: "",
    recipient_name: "",
    iban: "",
    description: "",
    button_text: "",
  },
  contact: {
    phone: "",
    sms: "",
    whatsapp: "",
    email: "",
    maps_url: "",
    address: "",
    channels: {},
  },
  social: { links: [] },
  custom_button: {
    title: "",
    description: "",
    url: "",
    icon: "",
    button_text: "",
  },
  custom_links: { links: [] },
  text_or_note: { title: "", text: "" },
};

export function normalizeBlockType(type) {
  return legacyBlockTypes[type] || type;
}

export function isSupportedCardBlock(block) {
  return Boolean(block) && CARD_BLOCK_TYPES.includes(normalizeBlockType(block.type));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function inspectCardCompatibility(card) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(card)) {
    return { errors: ["Card must be an object"], warnings: [] };
  }
  if (card.blocks !== undefined && !Array.isArray(card.blocks)) {
    errors.push("blocks must be an array when present");
  }
  if (Array.isArray(card.blocks)) {
    card.blocks.forEach((block, index) => {
      if (!isPlainObject(block) || typeof block.type !== "string") {
        errors.push(`blocks[${index}] is not a valid block object`);
      } else if (!isPlainObject(block.data) && block.data !== undefined) {
        errors.push(`blocks[${index}].data must be an object when present`);
      } else if (!isSupportedCardBlock(block)) {
        warnings.push(`Unsupported block type: ${block.type}`);
      }
    });
  }
  return { errors, warnings };
}

export function createCardBlock(type, order = 0, data = {}) {
  const normalizedType = normalizeBlockType(type);
  if (!CARD_BLOCK_TYPES.includes(normalizedType)) {
    throw new Error(`Unsupported card block type: ${type}`);
  }
  return {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `block-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: normalizedType,
    order,
    visible: true,
    data: { ...blockDefaults[normalizedType], ...data },
  };
}

export function makeCardBlocks(existing = [], legacyCard = {}) {
  const blocks = Array.isArray(existing)
    ? existing
        .filter((block) => isPlainObject(block) && typeof block.type === "string")
        .map((block, order) => {
          const type = normalizeBlockType(block.type);
          const data = isPlainObject(block.data) ? block.data : {};
          const supported = CARD_BLOCK_TYPES.includes(type);
          return {
            // Keep the complete legacy object. Unknown fields are intentionally
            // round-tripped so opening the redesigned editor never destroys data
            // owned by a newer or older client.
            ...block,
            id: block.id || `legacy-${type}-${order}`,
            type,
            order: Number.isFinite(block.order) ? block.order : order,
            visible: block.visible !== false,
            data: supported ? { ...blockDefaults[type], ...data } : data,
            unsupported: !supported,
          };
        })
    : [];
  const addMissing = (type, condition, data) => {
    if (condition && !blocks.some((block) => block.type === type)) {
      blocks.push(createCardBlock(type, blocks.length, data));
    }
  };
  addMissing("profile", true, { name: legacyCard.title || "" });
  addMissing("google_review", legacyCard.google_review_url, {
    url: legacyCard.google_review_url,
    business_name: legacyCard.title || "",
  });
  addMissing("payment_or_iban", legacyCard.iban || legacyCard.bank_name, {
    iban: legacyCard.iban || "",
    bank_name: legacyCard.bank_name || "",
  });
  addMissing(
    "contact",
    legacyCard.email || legacyCard.whatsapp || legacyCard.sms,
    {
      email: legacyCard.email || "",
      whatsapp: legacyCard.whatsapp || "",
      sms: legacyCard.sms || "",
    },
  );
  addMissing("social", legacyCard.instagram_url, {
    links: [{ label: "Instagram", url: legacyCard.instagram_url }],
  });
  addMissing("custom_links", legacyCard.extra_links?.length, {
    links: legacyCard.extra_links || [],
  });
  return blocks
    .sort((left, right) => left.order - right.order)
    .map((block, order) => ({ ...block, order }));
}

/**
 * Produces the in-memory configuration used by the public renderer and editor.
 * It deliberately performs no persistence: legacy cards are readable before any
 * migration is approved, and all unknown card/block fields remain available.
 */
export function normalizeCardConfiguration(card = {}) {
  const compatibility = inspectCardCompatibility(card);
  const hasStoredBlocks = Array.isArray(card.blocks) && card.blocks.length > 0;
  return {
    ...card,
    schema_version: Number.isInteger(card.schema_version)
      ? card.schema_version
      : hasStoredBlocks
        ? 1
        : 0,
    compatibility,
    blocks: makeCardBlocks(card.blocks || [], card),
  };
}
//export function RemoveInformationAbouttHEcARDS(card)
//{
// const Id = makeCardBlocks(card.Id || [])
//
//
//}

export function hydrateCardFromBlocks(card) {
  if (!card) return card;
  const normalized = normalizeCardConfiguration(card);
  const blocks = normalized.blocks;
  const fields = toLegacyCardFields(blocks);
  const profile = blocks.find((block) => block.type === "profile")?.data || {};
  const review =
    blocks.find((block) => block.type === "google_review")?.data || {};
  return {
    ...normalized,
    blocks,
    title: profile.name || card.title,
    google_review_url: review.url || fields.google_review_url,
    ...fields,
  };
}

export function isValidIban(value) {
  const iban = String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (
    !/^TR\d{24}$/.test(iban) ||
    iban.length !== 26
  )
    return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits =
      char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function toLegacyCardFields(blocks) {
  const dataFor = (type) =>
    blocks.find((block) => block.type === type && block.visible !== false)
      ?.data || {};
  const payment = dataFor("payment_or_iban");
  const review = dataFor("google_review");
  const contact = dataFor("contact");
  const socialLinks = dataFor("social").links || [];
  const customLinks = dataFor("custom_links").links || [];
  const instagram = socialLinks.find((link) =>
    /instagram/i.test(link.label || link.url || ""),
  );
  return {
    google_review_url: review.url || null,
    iban: payment.iban
      ? String(payment.iban).replace(/\s/g, "").toUpperCase()
      : null,
    bank_name: payment.bank_name || null,
    whatsapp: contact.whatsapp
      ? String(contact.whatsapp).replace(/\D/g, "")
      : null,
    sms: contact.sms ? String(contact.sms).replace(/\D/g, "") : null,
    email: contact.email || null,
    instagram_url: instagram?.url || null,
    extra_links: customLinks.slice(0, 3).map((link) => ({
      label: String(link.label || "").trim(),
      url: String(link.url || "").trim(),
    })),
  };
}

/**
 * Mirrors editable blocks back to the legacy columns without clearing data from
 * a hidden or unsupported block. This preserves old readers while the new
 * renderer honours block visibility from the JSON configuration.
 */
export function legacyFieldsForCardSave(existingCard = {}, blocks = []) {
  const fromBlocks = toLegacyCardFields(blocks);
  const visible = (type) =>
    blocks.some(
      (block) => normalizeBlockType(block.type) === type && block.visible !== false,
    );
  return {
    google_review_url: visible("google_review")
      ? fromBlocks.google_review_url
      : existingCard.google_review_url ?? null,
    iban: visible("payment_or_iban") ? fromBlocks.iban : existingCard.iban ?? null,
    bank_name: visible("payment_or_iban")
      ? fromBlocks.bank_name
      : existingCard.bank_name ?? null,
    whatsapp: visible("contact")
      ? fromBlocks.whatsapp
      : existingCard.whatsapp ?? null,
    sms: visible("contact") ? fromBlocks.sms : existingCard.sms ?? null,
    email: visible("contact") ? fromBlocks.email : existingCard.email ?? null,
    instagram_url: visible("social")
      ? fromBlocks.instagram_url
      : existingCard.instagram_url ?? null,
    extra_links: visible("custom_links")
      ? fromBlocks.extra_links
      : existingCard.extra_links ?? [],
  };
}

export function serializeCardBlocks(blocks = []) {
  return blocks.map(({ unsupported, ...block }, order) => ({
    ...block,
    type: normalizeBlockType(block.type),
    order,
  }));
}
