// functions/save-plan-request.js
const { google } = require('googleapis');
const { notifyTelegram } = require('./_lib/notify-telegram');
const { notifyPlanRequest } = require('./_lib/notify-email');

export async function onRequestPost(context) {
  const { request, env } = context;

  try {

    const {
      firstName,
      lastName,
      email,
      phone,
      program,
      productId,
      size,
      color,
      consent
    } = await request.json();

    if (!firstName || !lastName || !email || !program) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key:  env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets        = google.sheets({ version: 'v4', auth });
    const spreadsheetId = env.SHEET_ID_BBW4LIFE_PLAN_REQUEST;

    function formatDate() {
      const d = new Date();
      return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear().toString().slice(-2)} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    }


    const values = [[
      formatDate(),
      firstName,
      lastName,
      email,
      phone || '',
      program,
      productId || '',
      size || '',
      color || '',
      consent || 'Yes',
      'Pending'
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range:            'bbw4life-plan-request!A:K',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource:         { values }
    });

    notifyPlanRequest({ email, firstName, lastName, program, productId, size, color }, env).catch(() => {});

    await notifyTelegram(
    `⏳ <b>Pdg Francenel, un client vient de mettre en attente un des design BBW4LIFE!</b>\n\n` +
    `👤 <b>Nom:</b> ${firstName} ${lastName}\n` +
    `📧 <b>Email:</b> ${email}\n` +
    `🎨 <b>Produit:</b> ${program}`,
    env
  );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('PLAN REQUEST ERROR:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
