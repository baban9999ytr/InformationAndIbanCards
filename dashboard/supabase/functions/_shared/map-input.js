const MAX_ADDRESS_LENGTH = 500;
const MAX_MAP_INPUT_LENGTH = 10_000;

export function normalizeAddress(value) {
  const address = String(value || "").trim();
  if (address.length > MAX_ADDRESS_LENGTH)
    throw new Error("Address must be 500 characters or fewer.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(address))
    throw new Error("Address contains unsupported control characters.");
  return address;
}

function extractIframeSrc(value) {
  const input = String(value || "").trim();
  if (!/^<iframe\b/i.test(input)) return input;
  if (input.length > MAX_MAP_INPUT_LENGTH)
    throw new Error("Google Maps embed code is too long.");

  const openingTags = [...input.matchAll(/<iframe\b[^>]*>/gi)];
  if (openingTags.length !== 1 || openingTags[0].index !== 0)
    throw new Error("Paste one Google Maps iframe embed code.");
  const openingTag = openingTags[0][0];
  const remainder = input.slice(openingTag.length);
  if (remainder && !/^\s*(?:<\/iframe\s*>)?\s*$/i.test(remainder))
    throw new Error("Only a single iframe element is accepted.");

  const attributes = openingTag.slice("<iframe".length, -1);
  const sources = [
    ...attributes.matchAll(
      /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
    ),
  ];
  if (sources.length !== 1)
    throw new Error("The iframe must contain exactly one src attribute.");
  return (sources[0][1] ?? sources[0][2] ?? sources[0][3] ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&")
    .replace(/&#x0*26;/gi, "&");
}

function parseHttpsUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_MAP_INPUT_LENGTH)
    throw new Error("Enter a valid Google Maps URL.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid Google Maps URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error("Google Maps links must use HTTPS without credentials.");
  }
  return url;
}

export function parseGoogleMapsEmbed(value) {
  const url = parseHttpsUrl(extractIframeSrc(value));
  if (
    url.hostname !== "www.google.com" ||
    !/^\/maps\/embed(?:\/|$)/.test(url.pathname)
  ) {
    throw new Error(
      "Only https://www.google.com/maps/embed links are allowed for embeds.",
    );
  }
  return url.href;
}

export function parseGoogleMapsShortLink(value) {
  const url = parseHttpsUrl(value);
  if (
    url.hostname !== "maps.app.goo.gl" ||
    !/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
  ) {
    throw new Error("Use a Google Maps share link from maps.app.goo.gl.");
  }
  return url.href;
}

export function normalizeMapReference(mapType, value) {
  if (!value) return null;
  if (mapType === "embed") return parseGoogleMapsEmbed(value);
  if (mapType === "short") return parseGoogleMapsShortLink(value);
  if (mapType === "legacy") {
    const url = parseHttpsUrl(value);
    const allowedLegacyMap =
      (url.hostname === "maps.google.com" && (url.pathname === "/" || url.pathname.startsWith("/maps"))) ||
      (url.hostname === "www.google.com" &&
        /^\/maps\/(?:search|place)(?:\/|$)/.test(url.pathname));
    if (!allowedLegacyMap)
      throw new Error("Unsupported legacy map link.");
    return url.href;
  }
  throw new Error("Choose a Google Maps link type.");
}

export function normalizeLocationData(data = {}) {
  const address = normalizeAddress(data.address);
  const mapInput = String(data.map_url || "").trim();
  const mapType = data.map_type || (mapInput ? "legacy" : null);
  const mapUrl = mapInput ? normalizeMapReference(mapType, mapInput) : null;
  if (!address && !mapUrl)
    throw new Error("Add an address or one Google Maps link.");
  return {
    ...data,
    address,
    map_url: mapUrl,
    map_type: mapUrl ? mapType : null,
  };
}

export function safeLocationForRender(data = {}) {
  let address = "";
  try {
    address = normalizeAddress(data.address);
  } catch {
    address = "";
  }
  let mapUrl = null;
  try {
    mapUrl = data.map_url
      ? normalizeMapReference(data.map_type, data.map_url)
      : null;
  } catch {
    mapUrl = null;
  }
  return { address, map_url: mapUrl, map_type: mapUrl ? data.map_type : null };
}
