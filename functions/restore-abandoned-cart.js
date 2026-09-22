// functions/restore-abandoned-cart.js
const { google } = require("googleapis");
const { getGoogleAuthClient } = require('./_lib/google-auth');

async function getSheetsClient(env) {
  const auth = await getGoogleAuthClient(env);
  return google.sheets({ version: "v4", auth });
}

const ABANDONED_TAB  = "Abandoned_Carts";
const ABANDONED_RANGE = `${ABANDONED_TAB}!A:J`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;

  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    if (!orderId) {
      return new Response(JSON.stringify({ success: false, error: "Missing orderId" }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    const sheets = await getSheetsClient(env);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: ABANDONED_RANGE
    });

    const rows = res.data.values || [];
    // Cherche la dernière occurrence (au cas où plusieurs lignes existeraient pour le même ID)
    let match = null;
    for (let i = rows.length - 1; i >= 1; i--) { // skip header (row 0)
      if (rows[i][0] === orderId) { match = rows[i]; break; }
    }

    if (!match) {
      return new Response(JSON.stringify({ success: false, error: "Order not found" }), {
        status: 404,
        headers: CORS_HEADERS
      });
    }

    const [, email, firstName, lastName, cartJson, shippingJson, promoCode] = match;

    let cart = [];
    let shipping = {};
    try { cart = JSON.parse(cartJson || "[]"); } catch {}
    try { shipping = JSON.parse(shippingJson || "{}"); } catch {}

    return new Response(JSON.stringify({
      success: true,
      cart,
      shipping,
      promoCode: promoCode || null
    }), { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    console.error("[RESTORE ABANDONED CART] ERROR:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}
