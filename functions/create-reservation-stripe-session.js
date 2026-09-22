// functions/create-reservation-stripe-session.js
const Stripe = require('stripe');
const { google } = require('googleapis');

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

async function saveToSheet(data, env) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
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
        'Stripe - Paid'
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

  // Cloudflare Workers n'ont pas le module Node "https" utilisé par défaut
  // par stripe-node — httpClient: fetch est requis (stripe-node >= 11.10).
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient()
  });

  try {
    const bodyText = await request.text();
    if (!bodyText) throw new Error('No data received');

    const body   = JSON.parse(bodyText);
    const action = body.action || 'create';

    // ════════════════════════════════
    // ACTION : create — crée la session
    // ════════════════════════════════
    if (action === 'create') {
      const { program, customer, productId, productImage } = body;

      // ── Prix lu côté serveur — le montant du client est ignoré ──
      const reservationAmount = await getReservationPrice(env);

      const BASE_URL  = env.BASE_URL || '';
      const returnUrl = body.returnUrl || `${BASE_URL}/`;

      const productName = program
        ? `Reservation — ${program}`
        : 'BBW4LIFE Product Reservation';

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode:                 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name:        productName,
              description: 'Refundable reservation fee — deducted from your final order total.',
              images:      productImage ? [productImage] : [],
            },
            unit_amount: Math.round(reservationAmount * 100),
          },
          quantity: 1,
        }],
        customer_email: customer.email || undefined,
        metadata: {
          firstName: customer.firstName || '',
          lastName:  customer.lastName  || '',
          email:     customer.email     || '',
          phone:     customer.phone     || '',
          program:   program            || '',
          productId: productId          || '',
          amount:    String(reservationAmount),
        },
        success_url: `${returnUrl}?res_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  returnUrl,
      });

      return response(200, { success: true, sessionId: session.id });
    }

    // ════════════════════════════════
    // ACTION : verify — vérifie + sauvegarde
    // ════════════════════════════════
    if (action === 'verify') {
      const { sessionId } = body;
      if (!sessionId) throw new Error('Missing sessionId');

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        return response(200, { success: false, error: `Payment status: ${session.payment_status}` });
      }

      const m = session.metadata || {};
      await saveToSheet({
        firstName: m.firstName,
        lastName:  m.lastName,
        email:     m.email,
        phone:     m.phone,
        program:   m.program,
        amount:    m.amount,
      }, env);

      return response(200, { success: true });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (err) {
    console.error('[create-reservation-stripe-session]', err.message);
    return response(500, { success: false, error: err.message });
  }
}

export async function onRequestGet() {
  return response(405, { success: false, error: 'Method not allowed' });
}
