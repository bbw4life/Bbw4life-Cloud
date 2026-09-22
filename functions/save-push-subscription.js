const { google } = require('googleapis');

function getSheetsClient(env) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const TAB   = 'Push_Subscriptions';
const RANGE = `${TAB}!A:I`;

async function ensureTabExists(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === TAB);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: [{ addSheet: { properties: { title: TAB } } }] }
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [[
        'Device ID', 'Endpoint', 'P256dh', 'Auth',
        'Cart JSON', 'Last Updated', 'Last Notified', 'Promo Sent', 'Notify Count'
      ]]
    }
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;

  try {
    const body = await request.json();
    const { deviceId, subscription, cart } = body;

    if (!deviceId || !subscription || !subscription.endpoint) {
      return new Response(JSON.stringify({ error: 'Missing deviceId or subscription' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    const sheets = getSheetsClient(env);
    await ensureTabExists(sheets, spreadsheetId);

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
    const rows = res.data.values || [];

    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === deviceId) { rowIndex = i; break; }
    }

    const rowValues = [
      deviceId,
      subscription.endpoint,
      subscription.keys ? subscription.keys.p256dh : '',
      subscription.keys ? subscription.keys.auth   : '',
      JSON.stringify(cart || []),
      new Date().toISOString(),
      rowIndex !== -1 ? (rows[rowIndex][6] || '') : '',
      rowIndex !== -1 ? (rows[rowIndex][7] || '') : '',
      rowIndex !== -1 ? (rows[rowIndex][8] || 0)  : 0
    ];

    if (rowIndex === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: RANGE,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [rowValues] }
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A${rowIndex + 1}:I${rowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: { values: [rowValues] }
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    console.error('[save-push-subscription] Error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: CORS_HEADERS
  });
}
