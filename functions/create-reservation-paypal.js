// functions/create-reservation-paypal.js
const { google } = require('googleapis');
const { getGoogleAuthClient } = require('./_lib/google-auth');

// ── Lire reservation_price depuis products.data.json (anti-tamper) ──
async function getReservationPrice(env) {
  try {
    const BASE_URL = env.BASE_URL || '';
    const res = await fetch(`${BASE_URL}/products.data.json`);
    if (!res.ok) throw new Error('Failed to fetch products.data.json');
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    const settings = arr.find(function(p) { return p.type === 'settings'; }) || {};
    const price = parseFloat(settings.reservation_price);
    if (!price || price <= 0) throw new Error('reservation_price not set in settings');
    return price;
  } catch (err) {
    throw new Error('Cannot read reservation price from server: ' + err.message);
  }
}

async function getPaypalToken(PAYPAL_BASE, env) {
  const auth = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!tokenRes.ok) throw new Error('Failed to get PayPal token');
  const { access_token } = await tokenRes.json();
  return access_token;
}

async function saveToSheet(data, env) {
  const auth = await getGoogleAuthClient(env);
  const sheets        = google.sheets({ version: 'v4', auth });
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_PLAN;

  function formatDate() {
    const d = new Date();
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear().toString().slice(-2)} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:            'bbw4life-pending-plan!A:I',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [[
        formatDate(),
        data.firstName || '',
        data.lastName  || '',
        data.email     || '',
        data.phone     || '',
        data.program   || '',
        'Yes',
        data.amount    || '',
        'PayPal - Paid'
      ]]
    },
  });
}

function response(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const bodyText = await request.text();
    if (!bodyText) throw new Error('No data received');

    const body   = JSON.parse(bodyText);
    const action = body.action || 'create';

    const PAYPAL_BASE = env.PAYPAL_ENV === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    // ════════════════════════════════
    // ACTION : create — crée l'ordre
    // ════════════════════════════════
    if (action === 'create') {
      const { program, customer } = body;

      // ── Prix lu côté serveur — le montant du client est ignoré ──
      const serverAmount = await getReservationPrice(env);

      const BASE_URL     = env.BASE_URL || '';
      const returnUrl    = body.returnUrl || `${BASE_URL}/`;
      const access_token = await getPaypalToken(PAYPAL_BASE, env);

      const orderBody = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: serverAmount.toFixed(2),
          },
          description: `BBW4LIFE Reservation — ${program || 'Program'}`,
          custom_id:   `${customer.email || ''}|${customer.firstName || ''}|${customer.lastName || ''}|${customer.phone || ''}|${program || ''}|${serverAmount}`,
        }],
        application_context: {
          return_url: `${returnUrl}?res_paypal=1`,
          cancel_url: returnUrl,
          brand_name: 'Bbw4life',
          user_action: 'PAY_NOW',
        },
      };

      const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderBody),
      });

      if (!orderRes.ok) {
        const errText = await orderRes.text();
        throw new Error(errText || 'PayPal order creation failed');
      }

      const orderData    = await orderRes.json();
      const approvalLink = orderData.links.find(l => l.rel === 'approve');
      if (!approvalLink) throw new Error('No PayPal approval URL found');

      return response(200, { success: true, approvalUrl: approvalLink.href });
    }

    // ════════════════════════════════
    // ACTION : capture — capture + sauvegarde
    // ════════════════════════════════
    if (action === 'capture') {
      const { orderID, clientData, program, amount } = body;
      if (!orderID) throw new Error('Missing orderID');

      const access_token = await getPaypalToken(PAYPAL_BASE, env);

      // Capturer le paiement
      const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const captureData = await captureRes.json();

      if (captureData.status !== 'COMPLETED') {
        throw new Error(`PayPal capture failed: ${captureData.status}`);
      }

      // Récupérer les données depuis custom_id si clientData absent
      let firstName = clientData?.firstName || '';
      let lastName  = clientData?.lastName  || '';
      let email     = clientData?.email     || '';
      let phone     = clientData?.phone     || '';
      let prog      = program               || '';
      let amt       = amount                || '';

      // Fallback depuis custom_id PayPal
      if (!email) {
        const unit      = captureData.purchase_units?.[0] || {};
        const customId  = unit.custom_id || '';
        const parts     = customId.split('|');
        email     = parts[0] || '';
        firstName = parts[1] || '';
        lastName  = parts[2] || '';
        phone     = parts[3] || '';
        prog      = parts[4] || '';
        amt       = parts[5] || '';
      }

      // Sauvegarder dans le sheet
      await saveToSheet({ firstName, lastName, email, phone, program: prog, amount: amt }, env);

      return response(200, { success: true });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (err) {
    console.error('[create-reservation-paypal]', err.message);
    return response(500, { success: false, error: err.message });
  }
}

export async function onRequestGet() {
  return response(405, { success: false, error: 'Method not allowed' });
}
