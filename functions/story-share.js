const { google } = require('googleapis');
const { notifyTelegram } = require('./_lib/notify-telegram');
const { notifyStoryReceived } = require('./_lib/notify-email');
const { getGoogleAuthClient } = require('./_lib/google-auth');

const SHEET_NAME = 'bbw4life-stories';

async function getAuth(env) {
  return await getGoogleAuthClient(env);
}

function formatDate() {
  const d = new Date();
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear().toString().slice(-2)}`;
}

// ── SAVE ──────────────────────────────────────────────────────────────
async function saveStory(body, env) {
  const {
    firstName, age, email, country,
    bodyPressureDuration, bbwHelped, discoveredWhen,
    selfChange, wordToday, toldBefore,
    story, mentalQuote, rating, photo, anonymous
  } = body;

  if (!firstName || !email || !bodyPressureDuration || !bbwHelped || !story || !selfChange) {
    throw new Error('Required fields missing');
  }

  const auth   = await getAuth(env);
  const sheets = google.sheets({ version: 'v4', auth });
  const values = [[
    firstName.trim(),
    age                  || '',
    email.trim().toLowerCase(),
    country              || '',
    bodyPressureDuration || '',
    bbwHelped            || '',
    discoveredWhen       || '',
    selfChange           || '',
    wordToday            || '',
    toldBefore           || '',
    story.trim(),
    mentalQuote          || '',
    rating               || '5',
    photo                || '',
    anonymous === true || anonymous === 'true' ? 'yes' : 'no',
    'pending',
    formatDate()
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.SHEET_ID_BBW4LIFE_ACCOUNTS,
    range:           `${SHEET_NAME}!A:Q`,
    valueInputOption:'RAW',
    insertDataOption:'INSERT_ROWS',
    resource: { values }
  });

  await notifyTelegram(
    `💕 <b>Waww Pdg Francenel, une personne vient de partager son story, c'est en attente!</b>\n\n` +
    `👤 <b>Prénom:</b> ${firstName}\n` +
    `📧 <b>Email:</b> ${email}\n` +
    `🌍 <b>Pays:</b> ${country || 'N/A'}\n` +
    `⭐ <b>Note:</b> ${rating || '5'}/5`,
    env
  );
  await notifyStoryReceived({ email, firstName }, env).catch(e =>
    console.error('[story-share] notifyStoryReceived failed:', e.message)
  );

  return { success: true };
}

// ── FETCH approved stories ─────────────────────────────────────────────
async function fetchStories(env) {
  const auth   = await getAuth(env);
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.SHEET_ID_BBW4LIFE_ACCOUNTS,
    range:         `${SHEET_NAME}!A:Q`
  });

  const rows = res.data.values || [];
  const stories = rows
    .slice(1)
    .filter(r => r[15] && r[15].toString().toLowerCase() === 'approved')
    .map(r => ({
      firstName:           r[14] && r[14].toString().toLowerCase() === 'yes' ? 'Anonymous' : (r[0] || 'Anonymous'),
      age:                 r[1]  || '',
      country:             r[3]  || '',
      bodyPressureDuration:r[4]  || '',
      bbwHelped:           r[5]  || '',
      discoveredWhen:      r[6]  || '',
      selfChange:          r[7]  || '',
      wordToday:           r[8]  || '',
      toldBefore:          r[9]  || '',
      story:               r[10] || '',
      mentalQuote:         r[11] || '',
      rating:              r[12] || '5',
      photo:               r[13] || '',
      date:                r[16] || ''
    }));

  return { success: true, stories };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const data = await saveStory(body, env);
    return new Response(JSON.stringify(data), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    console.error('STORY-SHARE ERROR:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS_HEADERS });
  }
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const data = await fetchStories(env);
    return new Response(JSON.stringify(data), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    console.error('STORY-SHARE ERROR:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS_HEADERS });
  }
}
