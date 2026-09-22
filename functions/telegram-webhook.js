/* ══════════════════════════════════════════════════════
   LIVE CHAT — Telegram webhook
   Reçoit chaque message entrant du bot Telegram. Si le texte
   commence par "CHAT-xxxxxx:", c'est une réponse de l'agent
   (PDG Francenel) à un client en live chat :
     - écrit la réponse dans bbw4life-live-chat (sender=agent)
     - passe le statut de la session à "answered" (ou "closed"
       si le message est "CLOSE")
     - envoie une push notification au visiteur (uniquement à
       ce moment précis — jamais avant, cf. demande explicite)

   Configuration (one-shot, après déploiement) :
     https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://bbw4life.com/telegram-webhook

   ⚠️ NOTE MIGRATION CLOUDFLARE — RISQUE NON VÉRIFIÉ : le package npm
   "web-push" dépend en interne de crypto.createECDH, une API Node qui
   n'existe PAS nativement dans le runtime Cloudflare Workers. Il peut
   fonctionner via le flag `nodejs_compat` (wrangler.toml), mais ce n'est
   pas garanti par web-push lui-même et alourdit sensiblement le bundle.
   Recherche effectuée (voir web-push-libs/web-push issue #718) : aucune
   confirmation officielle de compatibilité totale. Ce fichier est migré
   à l'identique (même code, même dépendance) sur demande explicite —
   à valider réellement après déploiement Cloudflare (envoi d'une vraie
   notification push). Si non fonctionnel, alternatives compatibles
   Workers nativement : @block65/webcrypto-web-push, pushforge.
══════════════════════════════════════════════════════ */
const webpush = require('web-push');
const { google } = require('googleapis');
const {
  appendLiveChatRow,
  setLiveChatStatus,
  getDeviceIdFor
} = require('./_lib/live-chat-sheet');
const { getGoogleAuthClient } = require('./_lib/google-auth');

const CHAT_ID_PATTERN = /^(CHAT-[A-Z0-9]+):\s*(.*)$/s;
const START_PATTERN = /^\/start(?:\s+(.*))?$/s;

async function getSheetsClient(env) {
  const auth = await getGoogleAuthClient(env);
  return google.sheets({ version: 'v4', auth });
}

/* Push_Subscriptions vit dans un spreadsheet différent de celui du live
   chat (cf. send-cart-push-reminder.js) — même logique de lookup ici. */
async function findSubscriptionByDeviceId(deviceId, env) {
  if (!deviceId) return null;
  const sheets = await getSheetsClient(env);
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Push_Subscriptions!A:D'
  });
  const rows = res.data.values || [];
  const row = rows.find(r => r[0] === deviceId);
  if (!row || !row[1]) return null;
  return { endpoint: row[1], keys: { p256dh: row[2], auth: row[3] } };
}

async function notifyClientPush(deviceId, chatId, env) {
  try {
    const subscription = await findSubscriptionByDeviceId(deviceId, env);
    if (!subscription) return;

    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
    const payload = JSON.stringify({
      title: 'BBW4LIFE',
      body: 'Un agent vient de vous répondre en direct 💬',
      icon: `${BASE_URL}/public/bbw4life-favicon.png`,
      badge: `${BASE_URL}/public/bbw4life-favicon.png`,
      url: `${BASE_URL}/?openChat=${chatId}`,
      hasCart: false
    });

    await webpush.sendNotification(subscription, payload);
  } catch (e) {
    console.warn('[live-chat] Push notification failed:', e.message);
  }
}

async function sendTelegramMessage(chatId, text, replyMarkup, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.warn('[telegram-webhook] TELEGRAM_BOT_TOKEN missing'); return; }
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    console.warn('[telegram-webhook] sendMessage failed:', res.status, await res.text().catch(() => ''));
  }
}

/* Accuse réception d'un clic sur bouton inline — sans cet appel, Telegram
   affiche un état "chargement" indéfini sur le bouton côté client. */
async function answerCallbackQuery(callbackQueryId, text, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' })
    });
  } catch (e) {
    console.warn('[telegram-webhook] answerCallbackQuery failed:', e.message);
  }
}

/* Clic sur le menu Homme/Femme (cf. sendGenderSelectMenu dans
   save-account.js) — enregistre le choix colonne AL, sans jamais bloquer
   le webhook si save-account échoue (best effort, comme le reste du fichier). */
async function handleGenderCallback(telegramChatId, callbackQueryId, gender, env) {
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
  try {
    const res = await fetch(`${BASE_URL}/save-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_telegram_gender', telegramChatId: String(telegramChatId), gender })
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.success) {
      await answerCallbackQuery(callbackQueryId, 'Got it! 💛', env);
      const label = gender === 'woman' ? 'Queen' : 'King';
      await sendTelegramMessage(telegramChatId, `Perfect — you're all set as a ${label} 👑. We'll send new arrivals picked just for you.`, undefined, env);
    } else {
      console.error('[telegram-webhook] set_telegram_gender failed, status:', res.status, 'body:', JSON.stringify(data));
      await answerCallbackQuery(callbackQueryId, "We couldn't save that — please try again.", env);
    }
  } catch (e) {
    console.error('[telegram-webhook] handleGenderCallback failed:', e.message);
    await answerCallbackQuery(callbackQueryId, "Something went wrong — please try again.", env);
  }
}

function decodeAccountPayload(payload) {
  try {
    let b64 = payload.slice('acct_'.length).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const email = Buffer.from(b64, 'base64').toString('utf8').trim();
    return email.includes('@') ? email : null;
  } catch (e) {
    return null;
  }
}

async function handleStart(telegramChatId, payload, env) {
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';

  if (payload && payload.startsWith('acct_')) {
    const email = decodeAccountPayload(payload);
    if (!email) {
      await sendTelegramMessage(telegramChatId, "Sorry, that link seems invalid. Please try the “Add me on Telegram” button again from the BBW4LIFE menu.", undefined, env);
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/save-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link_telegram', email, telegramChatId: String(telegramChatId) })
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.success) {
        await sendTelegramMessage(telegramChatId, "✅ You're all set! Your BBW4LIFE account is now linked to Telegram — order confirmations, tracking numbers, new arrivals and exclusive promos will be sent here.", undefined, env);
      } else {
        await sendTelegramMessage(telegramChatId, "We couldn't find a BBW4LIFE account for you just yet. Please make sure you're logged in on the site, then try the button again.", undefined, env);
      }
    } catch (e) {
      console.error('[telegram-webhook] link_telegram failed:', e.message);
      await sendTelegramMessage(telegramChatId, "Something went wrong linking your account. Please try again in a moment.", undefined, env);
    }
    return;
  }

  // payload === 'new' (ou tout autre cas non reconnu) — le client n'a pas
  // encore de compte BBW4LIFE, on lui propose de le créer via un formulaire
  // ouvert en Web App directement dans Telegram (pas de redirection externe).
  const signupUrl = `${BASE_URL}/telegram-signup.html?chat_id=${telegramChatId}`;
  await sendTelegramMessage(
    telegramChatId,
    "Welcome to BBW4LIFE! 💛\n\nYou don't have a BBW4LIFE account linked yet, so we can't send you order confirmations, tracking numbers, new arrivals or promo codes here.\n\nTap the button below to create your account in a few seconds — right here in Telegram.",
    {
      inline_keyboard: [[
        { text: 'Create my BBW4LIFE account', web_app: { url: signupUrl } }
      ]]
    },
    env
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const bodyText = await request.text();
    const update = JSON.parse(bodyText || '{}');

    // ── Clic sur un bouton inline (menu Homme/Femme) — update distinct de
    // "message", géré en premier et retourné immédiatement. N'affecte pas
    // le reste du handler (messages texte, /start, live chat). ──
    if (update.callback_query) {
      const cq = update.callback_query;
      const cqData = cq.data || '';
      const cqChatId = cq.message && cq.message.chat && cq.message.chat.id;
      if (cqChatId && (cqData === 'bbw_gender_woman' || cqData === 'bbw_gender_man')) {
        await handleGenderCallback(cqChatId, cq.id, cqData === 'bbw_gender_woman' ? 'woman' : 'man', env);
      } else if (cq.id) {
        await answerCallbackQuery(cq.id, '', env);
      }
      return new Response('ok', { status: 200 });
    }

    const text = (update.message && update.message.text) || '';
    const telegramChatId = update.message && update.message.chat && update.message.chat.id;
    if (!text) return new Response('ok', { status: 200 });

    const startMatch = text.match(START_PATTERN);
    if (startMatch && telegramChatId) {
      await handleStart(telegramChatId, (startMatch[1] || '').trim(), env);
      return new Response('ok', { status: 200 });
    }

    const match = text.match(CHAT_ID_PATTERN);
    if (!match) {
      // Message Telegram normal, sans préfixe CHAT-xxx: — ignoré (pas une
      // réponse de live chat, ne pas casser d'autres usages du bot).
      return new Response('ok', { status: 200 });
    }

    const chatId = match[1];
    const replyText = match[2].trim();

    if (!replyText) return new Response('ok', { status: 200 });

    if (replyText.toUpperCase() === 'CLOSE') {
      await setLiveChatStatus(chatId, 'closed', env);
      return new Response('ok', { status: 200 });
    }

    await appendLiveChatRow(chatId, 'agent', replyText, '', '', env);
    await setLiveChatStatus(chatId, 'answered', env);

    const deviceId = await getDeviceIdFor(chatId, env);
    await notifyClientPush(deviceId, chatId, env);

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[live-chat] telegram-webhook FAILED:', e.message);
    // Toujours renvoyer 200 à Telegram — sinon Telegram réessaie le même
    // update indéfiniment, ce qui dupliquerait la réponse de l'agent.
    return new Response('ok', { status: 200 });
  }
}

export async function onRequestGet() {
  return new Response('Method not allowed', { status: 405 });
}
