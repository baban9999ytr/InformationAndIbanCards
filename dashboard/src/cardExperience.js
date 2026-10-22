export const PRESENTATION_MODES = ["classic", "smart", "showcase"];

export async function copyPublicCardValue(clipboard, value) {
  if (!clipboard?.writeText || typeof value !== "string" || !value) {
    throw new Error("Clipboard or card value is unavailable.");
  }
  await clipboard.writeText(value);
}

const hasText = (value) => typeof value === "string" && Boolean(value.trim());

const ACTION_SOURCE_TYPES = {
  copy_iban: ["payment_or_iban"],
  save_contact: ["profile", "contact"],
  call: ["contact"],
  whatsapp: ["contact"],
  website: ["social", "custom_links", "custom_button"],
  social: ["social"],
  maps: ["location", "contact"],
  google_review: ["google_review"],
};

function hasActionContent(block, actionType) {
  const data = block?.data || {};
  const hasLink = Array.isArray(data.links) && data.links.some((link) => hasText(link?.url));
  switch (actionType) {
    case "copy_iban": return hasText(data.iban);
    case "save_contact": return hasText(data.name) || hasText(data.phone) || hasText(data.email);
    case "call": return hasText(data.phone);
    case "whatsapp": return hasText(data.whatsapp);
    case "website": return hasText(data.url) || hasLink;
    case "social": return hasLink;
    case "maps": return hasText(data.map_url) || hasText(data.maps_url) || hasText(data.address);
    case "google_review": return hasText(data.url);
    default: return false;
  }
}

export function getEligiblePrimaryActionSources(card, actionType) {
  const types = ACTION_SOURCE_TYPES[actionType];
  if (!types) return [];
  return (Array.isArray(card?.blocks) ? card.blocks : []).filter(
    (block) =>
      block?.id &&
      block.visible !== false &&
      types.includes(block.type) &&
      hasActionContent(block, actionType),
  );
}

export function getPrimaryActionBlockTypes(actionType) {
  return ACTION_SOURCE_TYPES[actionType] || [];
}

export function resolvePresentationMode(card) {
  const profile = (Array.isArray(card?.blocks) ? card.blocks : []).find(
    (block) => block?.type === "profile",
  )?.data;
  const mode = card?.presentation_mode || profile?.presentation_mode;
  return PRESENTATION_MODES.includes(mode) ? mode : "showcase";
}

export function getPrimaryActionSource(card, action = card?.primary_action) {
  if (!action?.source_block_id) return null;
  return (
    (Array.isArray(card?.blocks) ? card.blocks : []).find(
      (block) =>
        block?.id === action.source_block_id && block.visible !== false,
    ) || null
  );
}

export function resolvePrimaryAction(card) {
  return (
    card?.primary_action ||
    (Array.isArray(card?.blocks) ? card.blocks : []).find(
      (block) => block?.type === "profile",
    )?.data?.primary_action ||
    null
  );
}

export function validatePrimaryAction(
  card,
  action = resolvePrimaryAction(card),
) {
  if (!action?.type) return "Choose a primary action.";
  const source = getPrimaryActionSource(card, action);
  if (action.source_block_id && !source)
    return "The selected source block is missing or hidden.";
  if (
    action.source_block_id &&
    !getEligiblePrimaryActionSources(card, action.type).some(
      (block) => block.id === action.source_block_id,
    )
  )
    return "The selected source is incompatible or incomplete.";
  const data = source?.data || {};
  if (
    action.source_item_id &&
    Array.isArray(data.links) &&
    !data.links.some(
      (item) =>
        item &&
        (item.id === action.source_item_id ||
          item.url === action.source_item_id),
    )
  )
    return "The selected link is no longer available.";
  const selectedItem = Array.isArray(data.links)
    ? data.links.find(
        (item) =>
          item &&
          (item.id === action.source_item_id ||
            item.url === action.source_item_id),
      )
    : null;
  const available = {
    copy_iban: Boolean(data.iban || card?.iban),
    save_contact: Boolean(data.phone || data.email || data.name || card?.title),
    call: Boolean(data.phone || card?.phone),
    whatsapp: Boolean(data.whatsapp || card?.whatsapp),
    website: Boolean(
      action.url ||
      data.url ||
      selectedItem?.url ||
      (Array.isArray(data.links) && data.links.some((link) => link?.url)),
    ),
    social: Boolean(
      action.url ||
      selectedItem?.url ||
      (Array.isArray(data.links) && data.links.some((link) => link?.url)),
    ),
    maps: Boolean(data.map_url || data.maps_url || data.address || card?.map_url || card?.map_address),
    google_review: Boolean(data.url || card?.google_review_url),
    custom_url: Boolean(action.url),
    copy_text: Boolean(action.text),
  };
  return available[action.type]
    ? ""
    : "The selected action has no valid destination or content.";
}

export const demoCard = {
  id: "local-demo-card",
  title: "Mavi Kahve",
  slug: "demo",
  access_mode: "public",
  is_active: true,
  presentation_mode: "showcase",
  primary_action: {
    type: "whatsapp",
    label: "WhatsApp'tan Ulaş",
    source_block_id: "demo-contact",
  },
  palette: {
    tokens: {
      background: "#ffffff",
      surface: "#ffffff",
      text: "#15263d",
      primary: "#1479ed",
      accent: "#b8d5f7",
      muted: "#68788e",
      button_text: "#ffffff",
    },
  },
  blocks: [
    {
      id: "demo-profile",
      type: "profile",
      order: 0,
      visible: true,
      data: {
        name: "Mavi Kahve",
        title: "Specialty coffee",
        company: "İstanbul",
        category: "Specialty coffee",
        location: "İstanbul",
        bio: "İyi kahve, güzel insanlar, daha iyi sohbetler. Kadıköy’deki bağımsız bir kahve dükkânı.",
        avatar_url: "/mavi-kahve-mark.svg",
        cover_url:
          "https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1500&q=88",
        address: "Caferağa Mah. Moda Cad. No: 56/A, Kadıköy, İstanbul",
        gallery: [
          "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=85",
          "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=600&q=85",
          "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=85",
        ],
        hours: [
          { days: "Pazartesi – Cuma", time: "08:00 – 20:00" },
          { days: "Cumartesi – Pazar", time: "09:00 – 21:00" },
        ],
      },
    },
    {
      id: "demo-contact",
      type: "contact",
      order: 1,
      visible: true,
      data: {
        phone: "+902163555555",
        whatsapp: "905551234567",
        email: "merhaba@mavikahve.com",
        maps_url: "https://maps.google.com/?q=Kadikoy+Istanbul",
      },
    },
    {
      id: "demo-payment",
      type: "payment_or_iban",
      order: 2,
      visible: true,
      data: {
        bank_name: "VakıfBank",
        recipient_name: "Mavi Kahve Ltd. Şti.",
        iban: "TR270006200123400006789012",
        description: "Banka Hesabı (IBAN)",
      },
    },
    {
      id: "demo-social",
      type: "social",
      order: 3,
      visible: true,
      data: {
        links: [
          {
            label: "Instagram",
            description: "@mavikahve",
            url: "https://instagram.com/",
          },
          {
            label: "Konum",
            description: "Google Maps’te aç",
            url: "https://maps.google.com/?q=Kadikoy+Istanbul",
          },
          {
            label: "Web sitesi",
            description: "www.mavikahve.com",
            url: "https://example.com/",
          },
        ],
      },
    },
    {
      id: "demo-note",
      type: "text_or_note",
      order: 4,
      visible: true,
      data: {
        title: "",
        text: "Toplu sipariş, etkinlik ve iş birlikleri için lütfen WhatsApp üzerinden ulaşın.",
      },
    },
    {
      id: "demo-hours",
      type: "text_or_note",
      order: 5,
      visible: true,
      data: { title: "hours", text: "" },
    },
  ],
};
