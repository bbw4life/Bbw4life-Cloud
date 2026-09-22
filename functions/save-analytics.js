// functions/save-analytics.js — BBW4LIFE Analytics + Orders
const { google } = require('googleapis');

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function onRequestOptions() {
  return new Response("", { status: 200, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets        = google.sheets({ version: "v4", auth });
    const spreadsheetId = env.SHEET_ID_BBW4LIFE_ANALYTICS;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "bbw4life-analytics!A:T"
    });
    const rows = res.data.values || [];
    return new Response(JSON.stringify({ success: true, rows }), {
      status: 200, headers: CORS_HEADERS
    });
  } catch (err) {
    console.error("[ANALYTICS]", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: CORS_HEADERS
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets        = google.sheets({ version: "v4", auth });
    const spreadsheetId = env.SHEET_ID_BBW4LIFE_ANALYTICS;

    const bodyText = await request.text();
    if (!bodyText) {
      return new Response(JSON.stringify({ success: false, error: "No body" }), {
        status: 400, headers: CORS_HEADERS
      });
    }

    const data = JSON.parse(bodyText);

    // ── Géolocalisation IP ──
    let country = "Unknown";
    let city    = "Unknown";

    try {
      const rawIp =
        (request.headers.get("cf-connecting-ip")           || "").trim() ||
        (request.headers.get("x-nf-client-connection-ip")  || "").trim() ||
        (request.headers.get("x-forwarded-for")            || "").split(",")[0].trim() ||
        (request.headers.get("x-real-ip")                  || "").trim() ||
        (request.headers.get("client-ip")                  || "").trim() ||
        "";

      const ip = rawIp.replace(/^::ffff:/, "");

      if (ip && ip !== "127.0.0.1" && ip !== "::1" && ip !== "") {
        const geoRes  = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city&lang=en`);
        const geoData = await geoRes.json();

        if (geoData.status === "success") {
          country = geoData.country || "Unknown";
          city    = geoData.city    || "Unknown";
        } else {
          const fallbackRes  = await fetch(`https://ipapi.co/${ip}/json/`);
          const fallbackData = await fallbackRes.json();
          if (!fallbackData.error) {
            country = fallbackData.country_name || "Unknown";
            city    = fallbackData.city         || "Unknown";
          }
        }
      }
    } catch (geoErr) {
      console.warn("[ANALYTICS] Geo lookup failed:", geoErr.message);
    }

    const row = [[
      data.timestamp    || new Date().toISOString(),  // A
      data.sessionId    || "",                         // B
      country,                                         // C
      city,                                            // D
      data.pageUrl      || "",                         // E
      data.pageTitle    || "",                         // F
      data.timeOnPage   || 0,                          // G
      data.clicks       || 0,                          // H
      data.menuClicks   || 0,                          // I
      data.scrollDepth  || 0,                          // J
      data.referrer     || "direct",                   // K
      data.device       || "desktop",                  // L
      data.browser      || "unknown",                  // M
      data.screenWidth  || 0,                          // N
      data.actionsCount || 0,                          // O
      data.orderId      || "",                         // P
      data.orderTotal   || "",                         // Q
      data.currency     || "",                         // R
      data.itemsCount   || "",                         // S
      data.orderCountry || ""                          // T
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range:             "bbw4life-analytics!A:T",
      valueInputOption:  "RAW",
      insertDataOption:  "INSERT_ROWS",
      resource:          { values: row }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: CORS_HEADERS
    });

  } catch (err) {
    console.error("[ANALYTICS]", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: CORS_HEADERS
    });
  }
}
