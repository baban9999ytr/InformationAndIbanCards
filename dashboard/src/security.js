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

export async function scanExternalUrl(value, { accessToken, skipScan = false } = {}) {
  const url = validateHttpsUrl(value);
  const workerBase = (
    import.meta.env.VITE_WORKER_URL ||
    import.meta.env.VITE_APP_ORIGIN ||
    "https://bilgi.openstacktool.com"
  ).replace(/\/$/, "");
  const endpoint =
    import.meta.env.VITE_URL_SCAN_ENDPOINT || `${workerBase}/api/check-url`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ url, skipScan }),
    });
  } catch {
    return { url, reviewRequired: true };
  }

  if (response.status >= 500 || response.status === 429 || response.status === 404) {
    return { url, reviewRequired: true };
  }

  if (response.status === 401 || response.status === 403 || response.status === 400) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      throw new Error("URL güvenlik kontrolü için yetkilendirme yapılamadı.");
    }
    throw new Error(errorData.error || "URL güvenlik kontrolü için yetkilendirme yapılamadı.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    return { url, reviewRequired: true };
  }
  if (result?.safe !== true) throw new Error(unsafeUrlMessage);
  return { url, reviewRequired: result.reviewRequired === true };
}
