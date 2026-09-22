/* ══════════════════════════════════════════════════════
   TELEGRAM BROADCAST — helpers partagés pour les notifications
   automatiques envoyées aux clients ayant lié leur compte
   BBW4LIFE à Telegram (colonne AK de bbw4life-accounts).

   - getTelegramSubscribers() : liste { firstName, chatId } pour
     chaque compte avec un TelegramChatId non vide.
   - getNewArrivalsCursor() / advanceNewArrivalsCursor() : position
     du cycle de rotation des nouveautés (3 produits tous les
     3 jours, boucle une fois la collection épuisée), stockée
     dans un onglet dédié "bbw4life-telegram-cursor".
   - sendTelegramPhoto() : envoie une photo distante (URL) avec
     légende — Telegram télécharge l'image lui-même, pas besoin
     de la rapatrier côté serveur.
   - getSettings() : recharge products.data.json (settings + liste
     de produits) pour construire les cartes produit.
══════════════════════════════════════════════════════ */
const { google } = require('googleapis');
const { getGoogleAuthClient } = require('./google-auth');

const CURSOR_SHEET = 'bbw4life-telegram-cursor';
const CURSOR_HEADERS = ['key', 'value'];

async function getSheetsClient(env) {
  const auth = await getGoogleAuthClient(env);
  return google.sheets({ version: 'v4', auth });
}

function getAccountsSpreadsheetId(env) {
  return env.SHEET_ID_BBW4LIFE_ACCOUNTS;
}

async function getSettings(env) {
  try {
    const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
    const res = await fetch(`${BASE_URL}/products.data.json`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    const settings = list.find(p => p.type === 'settings') || {};
    const products = list.filter(p => p.id && p.active !== false);
    return { settings, products };
  } catch (e) {
    console.warn('[telegram-broadcast] getSettings failed:', e.message);
    return { settings: {}, products: [] };
  }
}

/** Comptes avec un TelegramChatId rempli (colonne AK). "gender" est 'woman',
 *  'man' ou '' (non sélectionné — cf. menu envoyé après liaison Telegram,
 *  save-account.js:sendGenderSelectMenu / colonne AL). */
async function getTelegramSubscribers(env) {
  const sheets = await getSheetsClient(env);
  const spreadsheetId = getAccountsSpreadsheetId(env);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'bbw4life-accounts!B:AL' // B=firstName ... AK=telegram_chat_id, AL=gender
  });
  const rows = res.data.values || [];
  // Déduplique par chatId : si le même chat Telegram apparaît sur plusieurs
  // lignes (compte relié plusieurs fois, ou doublon de ligne), cette
  // personne recevait un envoi PAR ligne trouvée dans send-telegram-new-
  // arrivals.js — une fois avec ses produits ciblés (genre rempli sur
  // cette ligne) et une fois avec le lot générique (genre vide sur
  // l'autre ligne). Une seule entrée par chatId désormais, en gardant le
  // genre dès qu'une des lignes le fournit.
  const byChatId = new Map();
  for (const row of rows) {
    const firstName = (row[0] || '').trim();  // B
    const chatId = (row[35] || '').trim();    // AK - B = index 35
    const gender = (row[36] || '').trim().toLowerCase(); // AL - B = index 36
    if (!chatId) continue;

    const existing = byChatId.get(chatId);
    if (!existing) {
      byChatId.set(chatId, { firstName: firstName || 'there', chatId, gender });
    } else if (!existing.gender && gender) {
      existing.gender = gender;
    }
  }
  return Array.from(byChatId.values());
}

async function ensureCursorSheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const exists = (meta.data.sheets || []).some(s => s.properties.title === CURSOR_SHEET);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests: [{ addSheet: { properties: { title: CURSOR_SHEET } } }] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CURSOR_SHEET}!A1:B1`,
      valueInputOption: 'RAW',
      resource: { values: [CURSOR_HEADERS] }
    });
  }
}

async function getCursorValue(key, defaultValue = 0, env) {
  const sheets = await getSheetsClient(env);
  const spreadsheetId = getAccountsSpreadsheetId(env);
  await ensureCursorSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CURSOR_SHEET}!A2:B` });
  const rows = res.data.values || [];
  const row = rows.find(r => r[0] === key);
  return row ? parseInt(row[1], 10) || defaultValue : defaultValue;
}

async function setCursorValue(key, value, env) {
  const sheets = await getSheetsClient(env);
  const spreadsheetId = getAccountsSpreadsheetId(env);
  await ensureCursorSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CURSOR_SHEET}!A2:B` });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => r[0] === key);

  if (rowIndex === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${CURSOR_SHEET}!A:B`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [[key, String(value)]] }
    });
  } else {
    const rowNum = rowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CURSOR_SHEET}!B${rowNum}`,
      valueInputOption: 'RAW',
      resource: { values: [[String(value)]] }
    });
  }
}

/** Renvoie les 3 prochains produits du cycle "New Arrivals" et avance le curseur.
 *  cursorKey optionnel : permet un curseur séparé par genre (men/women) plutôt
 *  que de tous partager le même — défaut inchangé pour l'appel existant. */
async function getNextNewArrivalsBatch(productIds, batchSize = 3, cursorKey = 'new_arrivals_cursor', env) {
  if (!productIds.length) return [];
  const cursor = await getCursorValue(cursorKey, 0, env);
  const start = cursor % productIds.length;

  const batch = [];
  for (let i = 0; i < batchSize && i < productIds.length; i++) {
    batch.push(productIds[(start + i) % productIds.length]);
  }

  const nextCursor = (start + batchSize) % productIds.length;
  await setCursorValue(cursorKey, nextCursor, env);

  return batch;
}

async function sendTelegramPhoto(chatId, photoUrl, caption, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: 'HTML' })
    });
    if (!res.ok) {
      console.warn('[telegram-broadcast] sendPhoto failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[telegram-broadcast] sendPhoto error:', e.message);
  }
}

/** Retrouve le compte (prénom + TelegramChatId) d'un client à partir de son
 *  email — colonne B=firstName, C=email ... AK=telegram_chat_id. Le prénom
 *  est TOUJOURS celui du compte (créé à l'inscription), jamais celui saisi
 *  dans un formulaire ponctuel (checkout, story, contact) qui peut différer
 *  (ex: commande passée pour quelqu'un d'autre) — c'est le compte qui est
 *  lié à Telegram, pas le formulaire. */
async function getAccountByEmail(email, env) {
  if (!email) return null;
  try {
    const sheets = await getSheetsClient(env);
    const spreadsheetId = getAccountsSpreadsheetId(env);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'bbw4life-accounts!B:AK' // B=firstName, C=email ... AK=telegram_chat_id
    });
    const rows = res.data.values || [];
    const row = rows.find(r => (r[1] || '').trim().toLowerCase() === email.trim().toLowerCase()); // C - B = index 1
    if (!row) return null;
    return {
      firstName: (row[0] || '').trim(),  // B - B = index 0
      chatId:    (row[35] || '').trim()  // AK - B = index 35
    };
  } catch (e) {
    console.warn('[telegram-broadcast] getAccountByEmail failed:', e.message);
    return null;
  }
}

/** Conservé pour compatibilité — ne renvoie que le chatId. */
async function getTelegramChatIdByEmail(email, env) {
  const account = await getAccountByEmail(email, env);
  return account ? (account.chatId || null) : null;
}

/** Envoie un message Telegram à un client identifié par email, seulement
 *  s'il a lié son compte à Telegram (TelegramChatId non vide). Ne fait rien
 *  silencieusement sinon — jamais d'erreur bloquante pour l'appelant, même
 *  pattern que les autres notifications "best effort" du site.
 *  "text" peut être une chaîne, ou une fonction (firstName) => chaîne — dans
 *  ce 2e cas, firstName vient du COMPTE (jamais d'un formulaire ponctuel). */
async function notifyCustomerTelegram(email, text, replyMarkup, env) {
  const account = await getAccountByEmail(email, env);
  if (!account || !account.chatId) return { sent: false, reason: 'not_linked' };
  const finalText = typeof text === 'function' ? text(account.firstName || 'there') : text;
  await sendTelegramMessage(account.chatId, finalText, replyMarkup, env);
  return { sent: true, chatId: account.chatId };
}

async function sendTelegramMessage(chatId, text, replyMarkup, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.warn('[telegram-broadcast] sendMessage failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[telegram-broadcast] sendMessage error:', e.message);
  }
}

module.exports = {
  getSettings,
  getTelegramSubscribers,
  getNextNewArrivalsBatch,
  getCursorValue,
  setCursorValue,
  sendTelegramPhoto,
  sendTelegramMessage,
  getAccountByEmail,
  getTelegramChatIdByEmail,
  notifyCustomerTelegram
};
