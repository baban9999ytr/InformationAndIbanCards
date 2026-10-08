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
    if (!env.VIRUSTOTAL_API_KEY) return json({ safe: false, error: "Scanner is not configured" }, 503, appOrigin);

    let submittedUrl;
    try {
      const body = await request.json();
      if (typeof body.url !== "string" || body.url.length > 2048) {
        return json({ safe: false, error: "Invalid URL" }, 400, appOrigin);
      }
      submittedUrl = new URL(body.url);
    } catch {
      return json({ safe: false, error: "Invalid request" }, 400, appOrigin);
    }
    if (
      submittedUrl.protocol !== "https:" ||
      !submittedUrl.hostname ||
      submittedUrl.username ||
      submittedUrl.password ||
      !isPublicHostname(submittedUrl.hostname)
    ) {
      return json({ safe: false, error: "Only public HTTPS URLs can be scanned" }, 400, appOrigin);
    }

    let scanResponse;
    try {
      scanResponse = await fetch("https://www.virustotal.com/api/v3/urls", {
        method: "POST",
        headers: { "x-apikey": env.VIRUSTOTAL_API_KEY, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ url: submittedUrl.href }),
      });
    } catch {
      return json({ safe: false, error: "Reputation service unavailable" }, 502, appOrigin);
    }
    if (!scanResponse.ok) {
      return json({ safe: false, error: "Reputation scan could not be started" }, 502, appOrigin);
    }

    let analysisId;
    try {
      analysisId = (await scanResponse.json()).data?.id;
    } catch {
      return json({ safe: false, error: "Invalid reputation service response" }, 502, appOrigin);
    }
    if (typeof analysisId !== "string" || !/^[A-Za-z0-9-]+$/.test(analysisId)) {
      return json({ safe: false, error: "Invalid reputation service response" }, 502, appOrigin);
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
      let analysisResponse;
      try {
        analysisResponse = await fetch(
          `https://www.virustotal.com/api/v3/analyses/${encodeURIComponent(analysisId)}`,
          { headers: { "x-apikey": env.VIRUSTOTAL_API_KEY } },
        );
      } catch {
        return json({ safe: false, error: "Reputation service unavailable" }, 502, appOrigin);
      }
      if (!analysisResponse.ok) {
        return json({ safe: false, error: "Reputation scan could not be checked" }, 502, appOrigin);
      }
      let analysis;
      try {
        analysis = await analysisResponse.json();
      } catch {
        return json({ safe: false, error: "Invalid reputation service response" }, 502, appOrigin);
      }
      if (analysis.data?.attributes?.status !== "completed") continue;

      const stats = analysis.data.attributes.stats;
      if (!stats || typeof stats.malicious !== "number" || typeof stats.suspicious !== "number") {
        return json({ safe: false, error: "Incomplete reputation scan" }, 502, appOrigin);
      }
      const safe = stats.malicious === 0 && stats.suspicious === 0;
      return json(
        { safe, malicious: stats.malicious, suspicious: stats.suspicious },
        200,
        appOrigin,
      );
    }
    return json({ safe: false, error: "Reputation scan is still pending" }, 503, appOrigin);
  },
};
