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

const legacyBlockTypes = {
  payment: "payment_or_iban",
  custom: "custom_links",
};

const blockDefaults = {
  profile: { name: "", title: "", bio: "", company: "", avatar_url: "" },
  google_review: { business_name: "", url: "", rating: "", review_count: "", button_text: "", title: "" },
  payment_or_iban: { bank_name: "", recipient_name: "", iban: "", description: "", button_text: "" },
  contact: { phone: "", sms: "", whatsapp: "", email: "", maps_url: "", address: "", channels: {} },
  social: { links: [] },
  custom_button: { title: "", description: "", url: "", icon: "", button_text: "" },
  custom_links: { links: [] },
  text_or_note: { title: "", text: "" },
};

export function normalizeBlockType(type) {
  return legacyBlockTypes[type] || type;
}

export function createCardBlock(type, order = 0, data = {}) {
  const normalizedType = normalizeBlockType(type);
  if (!CARD_BLOCK_TYPES.includes(normalizedType)) {
    throw new Error(`Unsupported card block type: ${type}`);
  }
  return {
    id: globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: normalizedType,
    order,
    visible: true,
    data: { ...blockDefaults[normalizedType], ...data },
  };
}

export function makeCardBlocks(existing = [], legacyCard = {}) {
  const blocks = Array.isArray(existing)
    ? existing
      .filter((block) => block && CARD_BLOCK_TYPES.includes(normalizeBlockType(block.type)))
      .map((block, order) => {
        const type = normalizeBlockType(block.type);
        const data = block.data && typeof block.data === "object" && !Array.isArray(block.data)
          ? block.data
          : {};
        return {
          ...createCardBlock(type, order, data),
          id: block.id || `legacy-${type}-${order}`,
          order: Number.isFinite(block.order) ? block.order : order,
          visible: block.visible !== false,
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
  addMissing("contact", legacyCard.email || legacyCard.whatsapp || legacyCard.sms, {
    email: legacyCard.email || "",
    whatsapp: legacyCard.whatsapp || "",
    sms: legacyCard.sms || "",
  });
  addMissing("social", legacyCard.instagram_url, {
    links: [{ label: "Instagram", url: legacyCard.instagram_url }],
  });
  addMissing("custom_links", legacyCard.extra_links?.length, {
    links: legacyCard.extra_links || [],
  });
  return blocks.sort((left, right) => left.order - right.order)
    .map((block, order) => ({ ...block, order }));
}
//export function RemoveInformationAbouttHEcARDS(card)
//{
// const Id = makeCardBlocks(card.Id || [])
//
//
//}

export function hydrateCardFromBlocks(card) {
  if (!card) return card;
  const blocks = makeCardBlocks(card.blocks || [], card);
  const fields = toLegacyCardFields(blocks);
  const profile = blocks.find((block) => block.type === "profile")?.data || {};
  const review = blocks.find((block) => block.type === "google_review")?.data || {};
  return {
    ...card,
    blocks,
    title: profile.name || card.title,
    google_review_url: review.url || fields.google_review_url,
    ...fields,
  };
}

export function isValidIban(value) {
  const iban = String(value || "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function toLegacyCardFields(blocks) {
  const dataFor = (type) => blocks.find((block) => block.type === type && block.visible !== false)?.data || {};
  const payment = dataFor("payment_or_iban");
  const review = dataFor("google_review");
  const contact = dataFor("contact");
  const socialLinks = dataFor("social").links || [];
  const customLinks = dataFor("custom_links").links || [];
  const instagram = socialLinks.find((link) => /instagram/i.test(link.label || link.url || ""));
  return {
    google_review_url: review.url || null,
    iban: payment.iban ? String(payment.iban).replace(/\s/g, "").toUpperCase() : null,
    bank_name: payment.bank_name || null,
    whatsapp: contact.whatsapp ? String(contact.whatsapp).replace(/\D/g, "") : null,
    sms: contact.sms ? String(contact.sms).replace(/\D/g, "") : null,
    email: contact.email || null,
    instagram_url: instagram?.url || null,
    extra_links: customLinks.slice(0, 3).map((link) => ({
      label: String(link.label || "").trim(),
      url: String(link.url || "").trim(),
    })),
  };
}
