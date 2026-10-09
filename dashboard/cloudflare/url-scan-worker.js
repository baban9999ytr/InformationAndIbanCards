const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "cache-control": "no-store",
      vary: "Origin",
    },
  });

function isPublicHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test")
  ) return false;

  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = octets;
    if (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) return false;
  }
  if (host.includes(":") && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"))) {
    return false;
  }
  return true;
}

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("origin");
    const allowedOrigins = (env.APP_ORIGINS || env.APP_ORIGIN ||
      "https://bilgi.openstacktool.com,https://openstacktool.com")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      return json({ safe: false, error: "Origin not allowed" }, 403, "null");
    }
    const appOrigin = requestOrigin;
    const requestUrl = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": appOrigin,
          "access-control-allow-methods": "POST, DELETE, OPTIONS",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "86400",
          vary: "Origin",
        },
      });
    }
    if (request.method === "DELETE" && requestUrl.pathname === "/api/user/delete") {
      const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
      if (!bearer) return json({ error: "Authentication required" }, 401, appOrigin);
      if (!supabaseUrl || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return json({ error: "Account deletion is not configured" }, 503, appOrigin);
      }

      let userResponse;
      try {
        userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            authorization: "Bearer " + bearer,
          },
        });
      } catch {
        return json({ error: "Unable to verify the user session" }, 502, appOrigin);
      }
      if (!userResponse.ok) {
        return json({ error: "The user session is invalid or expired" }, 401, appOrigin);
      }
      let user;
      try {
        user = await userResponse.json();
      } catch {
        return json({ error: "Supabase returned an invalid user response" }, 502, appOrigin);
      }
      if (typeof user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) {
        return json({ error: "Supabase returned an invalid user identity" }, 502, appOrigin);
      }

      let deleteResponse;
      try {
        deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
          method: "DELETE",
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
          },
        });
      } catch {
        return json({ error: "Unable to delete the account" }, 502, appOrigin);
      }
      if (!deleteResponse.ok) {
        console.error("Supabase account deletion failed", deleteResponse.status);
        return json({ error: "Account deletion failed" }, 502, appOrigin);
      }
      return json({ ok: true }, 200, appOrigin);
    }
    if (request.method !== "POST" || requestUrl.pathname !== "/api/check-url") {
      return json({ safe: false, error: "Not found" }, 404, appOrigin);
    }

    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
    if (!bearer || !supabaseUrl || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Authentication required" }, 401, appOrigin);
    }
    let userResponse;
    try {
      userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      return json({ error: "Unable to verify the user session" }, 502, appOrigin);
    }
    if (!userResponse.ok) return json({ error: "The user session is invalid or expired" }, 401, appOrigin);
    let user;
    try {
      user = await userResponse.json();
    } catch {
      return json({ error: "Supabase returned an invalid user response" }, 502, appOrigin);
    }
    if (typeof user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) {
      return json({ error: "Supabase returned an invalid user identity" }, 502, appOrigin);
    }
    let profileResponse;
    try {
      profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,is_super_user`,
        { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(3000) },
      );
    } catch {
      return json({ error: "Unable to verify card permissions" }, 502, appOrigin);
    }
    if (!profileResponse.ok) return json({ error: "Unable to verify card permissions" }, 502, appOrigin);
    let profileRows;
    try {
      profileRows = await profileResponse.json();
    } catch {
      return json({ error: "Supabase returned an invalid profile response" }, 502, appOrigin);
    }
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    const privileged = profile?.role === "admin" || profile?.is_super_user === true;
    let submittedUrl;
    let skipScan = false;
    try {
      const body = await request.json();
      if (typeof body.url !== "string" || body.url.length > 2048) {
        return json({ safe: false, error: "Invalid URL" }, 400, appOrigin);
      }
      submittedUrl = new URL(body.url);
      skipScan = body.skipScan === true;
    } catch {
      return json({ safe: false, error: "Invalid request" }, 400, appOrigin);
    }
    if (skipScan && !privileged) return json({ error: "Insufficient permissions to skip URL scanning" }, 403, appOrigin);
    if (
      submittedUrl.protocol !== "https:" ||
      !submittedUrl.hostname ||
      submittedUrl.username ||
      submittedUrl.password ||
      !isPublicHostname(submittedUrl.hostname)
    ) {
      return json({ safe: false, error: "Only public HTTPS URLs can be scanned" }, 400, appOrigin);
    }

    const host = submittedUrl.hostname.toLowerCase();
    const trustedDomains = ["google.com", "googleapis.com", "instagram.com", "whatsapp.com"];
    if (trustedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return json({ safe: true, provider: "allowlist" }, 200, appOrigin);
    }

    if (skipScan && privileged) return json({ safe: true, provider: "privileged-bypass" }, 200, appOrigin);

    const providers = [];
    if (env.VIRUSTOTAL_API_KEY) {
      providers.push(["VirusTotal", async () => {
        const timeout = { signal: AbortSignal.timeout(3000) };
        const create = await fetch("https://www.virustotal.com/api/v3/urls", {
          ...timeout,
          method: "POST",
          headers: { "x-apikey": env.VIRUSTOTAL_API_KEY, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ url: submittedUrl.href }),
        });
        if (!create.ok) throw new Error(`VirusTotal returned ${create.status}`);
        const analysisId = (await create.json()).data?.id;
        if (typeof analysisId !== "string" || !/^[A-Za-z0-9-]+$/.test(analysisId)) throw new Error("Invalid VirusTotal response");
        const result = await fetch(
          `https://www.virustotal.com/api/v3/analyses/${encodeURIComponent(analysisId)}`,
          { ...timeout, headers: { "x-apikey": env.VIRUSTOTAL_API_KEY } },
        );
        if (!result.ok) throw new Error(`VirusTotal returned ${result.status}`);
        const stats = (await result.json()).data?.attributes;
        if (stats?.status !== "completed" || typeof stats.stats?.malicious !== "number" || typeof stats.stats?.suspicious !== "number") {
          throw new Error("VirusTotal scan is incomplete");
        }
        return stats.stats.malicious === 0 && stats.stats.suspicious === 0;
      }]);
    }
    if (env.GOOGLE_SAFE_BROWSING_API_KEY) {
      providers.push(["Google Safe Browsing", async () => {
        const response = await fetch(
          `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(env.GOOGLE_SAFE_BROWSING_API_KEY)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              client: { clientId: "bilgi-digital-cards", clientVersion: "1.0" },
              threatInfo: {
                threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
                platformTypes: ["ANY_PLATFORM"],
                threatEntryTypes: ["URL"],
                threatEntries: [{ url: submittedUrl.href }],
              },
            }),
            signal: AbortSignal.timeout(3000),
          },
        );
        if (!response.ok) throw new Error(`Safe Browsing returned ${response.status}`);
        const result = await response.json();
        if (result.matches && !Array.isArray(result.matches)) throw new Error("Invalid Safe Browsing response");
        return !result.matches?.length;
      }]);
    }
    if (env.PHISHTANK_API_KEY) {
      providers.push(["PhishTank", async () => {
        const response = await fetch("https://checkurl.phishtank.com/checkurl/", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ url: submittedUrl.href, format: "json", app_key: env.PHISHTANK_API_KEY }),
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error(`PhishTank returned ${response.status}`);
        const result = await response.json();
        if (result.results?.in_database === true && result.results?.valid === true) return false;
        if (result.results?.in_database === false || result.results?.valid === false) return true;
        throw new Error("Incomplete PhishTank response");
      }]);
    }

    for (const [provider, scan] of providers) {
      try {
        const safe = await scan();
        if (!safe) return json({ safe: false, provider }, 200, appOrigin);
        return json({ safe: true, provider }, 200, appOrigin);
      } catch (scanError) {
        console.warn(`${provider} scan unavailable; trying the next provider`, scanError?.message);
      }
    }
    return json({
      safe: true,
      reviewRequired: true,
      message: "URL security services are unavailable; card requires approval.",
    }, 200, appOrigin);
  },
};
