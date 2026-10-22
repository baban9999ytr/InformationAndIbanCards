const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

const hasUrlIn = (value) =>
  Array.isArray(value) && value.some((item) => hasText(item?.url));

/** A card needs meaningful visible content beyond its business name and slug. */
export function isCardReadyForPublic(card = {}) {
  const title = String(card.title || "").trim().toLocaleLowerCase();
  const legacyContent = [
    card.google_review_url,
    card.whatsapp,
    card.sms,
    card.instagram_url,
    card.email,
    card.iban,
  ].some(hasText) || hasUrlIn(card.extra_links);

  if (legacyContent) return true;

  return (Array.isArray(card.blocks) ? card.blocks : []).some((block) => {
    if (!block || block.visible === false) return false;
    const type = block.type === "payment" ? "payment_or_iban" : block.type;
    const data = block.data && typeof block.data === "object" ? block.data : {};

    switch (type) {
      case "profile": {
        const identity = [data.name, data.company].some(
          (value) => hasText(value) && value.trim().toLocaleLowerCase() !== title,
        );
        return (
          identity ||
          [data.title, data.bio, data.avatar_url, data.cover_url, data.location].some(hasText) ||
          (Array.isArray(data.gallery) && data.gallery.some(hasText))
        );
      }
      case "google_review":
        return hasText(data.url);
      case "payment_or_iban":
        return hasText(data.iban);
      case "contact":
        return [
          data.phone,
          data.sms,
          data.whatsapp,
          data.email,
          data.maps_url,
          data.address,
        ].some(hasText);
      case "location":
        return [data.address, data.map_url].some(hasText);
      case "social":
      case "custom_links":
      case "custom":
        return hasUrlIn(data.links);
      case "custom_button":
        return hasText(data.url);
      case "text_or_note":
        return hasText(data.title) || hasText(data.text);
      default:
        return false;
    }
  });
}
