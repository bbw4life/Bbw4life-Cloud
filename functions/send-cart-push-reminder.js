// functions/send-cart-push-reminder.js
// ⚠️ SCHEDULED FUNCTION — sur Netlify, déclenchée par [functions.send-cart-push-reminder]
// schedule = "*/5 * * * *" dans netlify.toml. Sur Cloudflare, l'équivalent est
// un Cron Trigger (wrangler.toml [triggers] crons), qui invoque un handler
// `scheduled(event, env, ctx)` distinct des Pages Functions HTTP normales —
// à câbler séparément lors de la configuration Cron Triggers (traité avec
// les 7 autres scheduled functions du projet). Cette fonction est migrée ici
// avec un handler HTTP (onRequestGet) pour permettre un test manuel/direct
// en attendant cette configuration.
//
// ⚠️ RISQUE web-push NON VÉRIFIÉ (voir telegram-webhook.js pour le détail de
// la recherche) : le package "web-push" dépend de crypto.createECDH, une API
// Node absente du runtime Workers standard — fonctionne potentiellement via
// nodejs_compat, non garanti. Migré tel quel sur demande explicite.
const { google } = require('googleapis');
const webpush = require('web-push');
const { getGoogleAuthClient } = require('./_lib/google-auth');

const REMINDER_THRESHOLD_MINUTES = 10;
const REMINDER_SCHEDULE_HOURS = [0, 1, 6, 24, 48, 72];
const MARKETING_INTERVAL_HOURS = 72;

async function getSheetsClient(env) {
  const auth = await getGoogleAuthClient(env);
  return google.sheets({ version: 'v4', auth });
}

const TAB   = 'Push_Subscriptions';
const RANGE = `${TAB}!A:I`;

async function getSettings(env) {
  try {
    const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
    const res = await fetch(`${BASE_URL}/products.data.json`);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).find(p => p.type === 'settings') || {};
  } catch (e) { return {}; }
}

function pickRandomPromo(settings) {
  const promos = settings.promos || [];
  if (!promos.length) return null;
  return promos[Math.floor(Math.random() * promos.length)];
}

// ── Messages marketing pour les abonnés sans panier ──
function pickMarketingMessage(settings) {
  const pool = settings.marketing_push_messages || [
    { body: "New arrivals just dropped 👑 Come see what's new!", url: '/collections/bbw4life-all-product.html' },
    { body: "Flash sale — up to 40% off today only! 🔥", url: '/collections/bbw4life-all-product.html' },
    { body: "Beauty Has No Sizes 💕 Your next favorite piece is waiting.", url: '/collections/bbw4life-all-product.html' }
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

async function getTabSheetId(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tab = meta.data.sheets.find(s => s.properties.title === TAB);
  return tab ? tab.properties.sheetId : null;
}

async function deleteRow(sheets, spreadsheetId, sheetId, rowIndex) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
        }
      }]
    }
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
  const LOGO_URL = `${BASE_URL}/public/bbw4life-favicon.png`;
  const CART_URL = `${BASE_URL}/?openCart=true`;

  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );

  try {
    const sheets = await getSheetsClient(env);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
    const rows = res.data.values || [];

    if (rows.length <= 1) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    const settings = await getSettings(env);
    const now = new Date();
    let processed = 0;

    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i];
      const [deviceId, endpoint, p256dh, auth, cartJson, lastUpdatedStr, lastNotifiedStr, promoSent, notifyCountStr] = row;

      if (!endpoint) continue;

      let cart = [];
      try { cart = JSON.parse(cartJson || '[]'); } catch {}

      const notifyCount = parseInt(notifyCountStr) || 0;
      let payload = null;
      let promoCodeToStore = '';

      // ══════════════════════════════════
      //  CAS 1 — Panier avec produits
      // ══════════════════════════════════
      if (cart.length > 0) {
        const lastUpdated = lastUpdatedStr ? new Date(lastUpdatedStr) : null;
        if (!lastUpdated) continue;

        const scheduleIdx = Math.min(notifyCount, REMINDER_SCHEDULE_HOURS.length - 1);
        const requiredGapHours = REMINDER_SCHEDULE_HOURS[scheduleIdx];

        if (notifyCount === 0) {
          const minutesSinceUpdate = (now - lastUpdated) / (1000 * 60);
          if (minutesSinceUpdate < REMINDER_THRESHOLD_MINUTES) continue;
        } else {
          if (!lastNotifiedStr) continue;
          const hoursSinceNotified = (now - new Date(lastNotifiedStr)) / (1000 * 60 * 60);
          if (hoursSinceNotified < requiredGapHours) continue;
        }

        const promo = pickRandomPromo(settings);
        promoCodeToStore = promo ? promo.code : '';
        const itemCount = cart.reduce((sum, it) => sum + (parseInt(it.quantity) || 1), 0);

        const body = promo
          ? `You left ${itemCount} item(s) in your cart. Use code ${promo.code} for ${promo.percent}% off!`
          : `You left ${itemCount} item(s) in your cart. Come back and grab them before they're gone!`;

        payload = JSON.stringify({
          title: 'BBW4LIFE',
          body,
          icon:  LOGO_URL,
          badge: LOGO_URL,
          url:   CART_URL,
          hasCart: true
        });

      // ══════════════════════════════════
      //  CAS 2 — Panier vide → marketing
      // ══════════════════════════════════
      } else {
        if (lastNotifiedStr) {
          const hoursSince = (now - new Date(lastNotifiedStr)) / (1000 * 60 * 60);
          if (hoursSince < MARKETING_INTERVAL_HOURS) continue;
        }

        const msg = pickMarketingMessage(settings);
        payload = JSON.stringify({
          title: 'BBW4LIFE',
          body:  msg.body,
          icon:  LOGO_URL,
          badge: LOGO_URL,
          url:   `${BASE_URL}${msg.url}`,
          hasCart: false
        });
      }

      if (!payload) continue;

      const subscription = { endpoint, keys: { p256dh, auth } };

      try {
        await webpush.sendNotification(subscription, payload);
        processed++;

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${TAB}!G${i + 1}:I${i + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[now.toISOString(), promoCodeToStore, notifyCount + 1]] }
        });
      } catch (err) {
        const statusCode = err.statusCode || (err.body && err.body.statusCode) || null;

        if (statusCode === 404 || statusCode === 410) {
          console.warn(`[send-cart-push-reminder] Subscription gone (${statusCode}) for ${deviceId} — deleting row.`);
          try {
            const sheetId = await getTabSheetId(sheets, spreadsheetId);
            if (sheetId !== null) await deleteRow(sheets, spreadsheetId, sheetId, i);
          } catch (delErr) {
            console.warn(`[send-cart-push-reminder] Could not delete row for ${deviceId}:`, delErr.message);
          }
        } else {
          console.warn(`[send-cart-push-reminder] Failed for ${deviceId} (status ${statusCode || 'unknown'}):`, err.message);
          try {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${TAB}!G${i + 1}:G${i + 1}`,
              valueInputOption: 'RAW',
              resource: { values: [[now.toISOString()]] }
            });
          } catch (updErr) {}
        }
      }

      await new Promise(r => setTimeout(r, 300));
    }

    return new Response(JSON.stringify({ success: true, processed }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[send-cart-push-reminder] ERROR:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
