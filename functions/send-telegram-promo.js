/* ══════════════════════════════════════════════════════
   TELEGRAM — Notification "Promotion" tous les 6 jours
   Envoyée à chaque client ayant lié son compte BBW4LIFE à
   Telegram. Contient tous les codes promo actifs (settings.promos)
   accompagnés de quelques produits, et un bouton vers la page
   "Tous les produits".

   ⚠️ SCHEDULED FUNCTION — Netlify : [functions."send-telegram-promo"]
   schedule = "0 12 (every 6 days) * *". Cron Trigger Cloudflare câblé séparément.
══════════════════════════════════════════════════════ */
const {
  getSettings,
  getTelegramSubscribers,
  sendTelegramPhoto,
  sendTelegramMessage
} = require('./_lib/telegram-broadcast');

const SHOWCASE_COUNT = 3;

function pickRandomProducts(products, count) {
  const pool = [...products];
  const picked = [];
  while (picked.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

export async function onRequestGet(context) {
  const { env } = context;
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
  const ALL_PRODUCTS_URL = `${BASE_URL}/collections/bbw4life-all-product.html`;

  try {
    const { settings, products } = await getSettings(env);

    const promos = settings.promos || [];
    if (!promos.length) return new Response('no promos', { status: 200 });

    const subscribers = await getTelegramSubscribers(env);
    if (!subscribers.length) return new Response('no subscribers', { status: 200 });

    const showcaseProducts = pickRandomProducts(products, SHOWCASE_COUNT);

    const promoLines = promos
      .map(p => `🎁 <b>${p.code}</b> — ${p.percent}% off`)
      .join('\n');

    for (const sub of subscribers) {
      const intro =
        `Hey ${sub.firstName} 💛\n\n` +
        `It's promo time! Here are our current codes just for you:\n\n${promoLines}`;
      await sendTelegramMessage(sub.chatId, intro, undefined, env);

      for (const prod of showcaseProducts) {
        const caption = `<b>${prod.title}</b>\n$${Number(prod.price).toFixed(2)}`;
        await sendTelegramPhoto(sub.chatId, prod.image, caption, env);
      }

      await sendTelegramMessage(
        sub.chatId,
        `Treat yourself, Queen 👑 Don't let these deals pass you by.`,
        { inline_keyboard: [[{ text: 'Shop All Products', url: ALL_PRODUCTS_URL }]] },
        env
      );
    }

    console.log(`[telegram-promo] Sent to ${subscribers.length} subscriber(s)`);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[telegram-promo] FAILED:', e.message);
    return new Response('error', { status: 200 });
  }
}
