const unsafeUrlMessage =
  "Girdiğiniz URL güvenlik kontrolünden geçemedi. Lütfen geçerli ve güvenli bir bağlantı adresi yazın.";

export function validateHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Lütfen geçerli bir bağlantı adresi girin.");
  }

  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Bağlantılar HTTPS ile başlamalı ve kullanıcı bilgisi içermemelidir.");
  }
  return parsed.href;
}

export async function scanExternalUrl(value) {
  const url = validateHttpsUrl(value);
  const workerBase = (
    import.meta.env.VITE_WORKER_URL ||
    import.meta.env.VITE_APP_ORIGIN ||
    "https://bilgi.openstacktool.com"
  ).replace(/\/$/, "");
  const endpoint =
    import.meta.env.VITE_URL_SCAN_ENDPOINT || `${workerBase}/api/check-url`;
  if (!endpoint) {
    throw new Error("URL güvenlik kontrolü yapılandırılmamış. Lütfen daha sonra tekrar deneyin.");
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error("URL güvenlik kontrolüne şu anda ulaşılamıyor. Lütfen tekrar deneyin.");
  }

  if (!response.ok) {
    throw new Error("URL güvenlik kontrolü tamamlanamadı. Lütfen tekrar deneyin.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("URL güvenlik kontrolünden geçerli bir yanıt alınamadı.");
  }
  if (result?.safe !== true) throw new Error(unsafeUrlMessage);
  return url;
}
