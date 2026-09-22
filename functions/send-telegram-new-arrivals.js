/* ══════════════════════════════════════════════════════
   TELEGRAM — Notification "New Arrivals" tous les 3 jours
   Envoyée à chaque client ayant lié son compte BBW4LIFE à
   Telegram (colonne AK, cf. _lib/telegram-broadcast.js).

   Fait tourner un curseur sur la collection "bbw4life-new-arrivals" :
   3 produits par envoi, on avance de 3 à chaque exécution, et on
   reboucle sur le début une fois la collection épuisée.

   Genre (colonne AL, menu envoyé après liaison Telegram) :
     - 'woman' → 3 produits de la collection curvy-woman
     - 'man'   → 3 produits de la collection men-plus-size
     - non défini → comportement inchangé : bbw4life-new-arrivals
   Chaque groupe a son propre curseur de rotation (aucun partagé),
   donc aucune régression sur le cycle déjà en cours pour les
   abonnés non genrés.

   ⚠️ SCHEDULED FUNCTION — Netlify : [functions."send-telegram-new-arrivals"]
   schedule = "0 12 (every 3 days) * *". Cron Trigger Cloudflare câblé séparément.
══════════════════════════════════════════════════════ */
const {
  getSettings,
  getTelegramSubscribers,
  getNextNewArrivalsBatch,
  sendTelegramPhoto,
  sendTelegramMessage
} = require('./_lib/telegram-broadcast');

const NEW_ARRIVALS_COLLECTION_ID = 'bbw4life-new-arrivals';
const WOMEN_COLLECTION_ID = 'curvy-woman';
const MEN_COLLECTION_ID = 'men-plus-size';

function pickPromo(settings) {
  const promos = settings.promos || [];
  if (!promos.length) return null;
  return promos[Math.floor(Math.random() * promos.length)];
}

function getProductIds(collections, collectionId) {
  const collection = collections.find(c => c.id === collectionId);
  if (!collection) return [];
  return (collection.product_ids || []).filter(id => !id.startsWith('--'));
}

async function sendBatchToSubscriber(sub, batchProducts, promo, collectionUrl, env) {
  // Adresse le message au genre choisi (colonne AL) quand il est connu —
  // "Queens" pour woman, "Kings" pour man ; garde "Queens and Kings" pour
  // les abonnés qui n'ont pas encore fait de choix.
  const audience =
    sub.gender === 'woman' ? 'Queens' :
    sub.gender === 'man'   ? 'Kings'  :
    'Queens and Kings';
  const intro =
    `Hey ${sub.firstName} 💛\n\n` +
    `We just dropped fresh new pieces for our plus size ${audience} — ` +
    `quality, comfort and style made for you.`;
  await sendTelegramMessage(sub.chatId, intro, undefined, env);

  for (const prod of batchProducts) {
    const caption =
      `<b>${prod.title}</b>\n$${Number(prod.price).toFixed(2)}`;
    await sendTelegramPhoto(sub.chatId, prod.image, caption, env);
  }

  const promoLine = promo
    ? `\n\n🎁 Use code <b>${promo.code}</b> for ${promo.percent}% off your order.`
    : '';
  await sendTelegramMessage(
    sub.chatId,
    `Don't miss out on what's new.${promoLine}`,
    { inline_keyboard: [[{ text: 'See New Collection', url: collectionUrl }]] },
    env
  );
}

export async function onRequestGet(context) {
  const { env } = context;
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
  const NEW_ARRIVALS_URL = `${BASE_URL}/collections/bbw4life-new-arrivals.html`;
  const WOMEN_URL = `${BASE_URL}/collections/curvy-woman.html`;
  const MEN_URL = `${BASE_URL}/collections/men-plus-size.html`;

  try {
    const { settings, products } = await getSettings(env);
    const collections = (settings.jrgq_collections && settings.jrgq_collections.collections) || [];

    const subscribers = await getTelegramSubscribers(env);
    if (!subscribers.length) return new Response('no subscribers', { status: 200 });

    const promo = pickPromo(settings);

    const genericIds = getProductIds(collections, NEW_ARRIVALS_COLLECTION_ID);
    const womenIds = getProductIds(collections, WOMEN_COLLECTION_ID);
    const menIds = getProductIds(collections, MEN_COLLECTION_ID);

    // Un curseur de rotation distinct par groupe — le groupe générique garde
    // sa clé d'origine ('new_arrivals_cursor') pour ne pas repartir de zéro.
    const [genericBatchIds, womenBatchIds, menBatchIds] = await Promise.all([
      genericIds.length ? getNextNewArrivalsBatch(genericIds, 3, 'new_arrivals_cursor', env) : Promise.resolve([]),
      womenIds.length ? getNextNewArrivalsBatch(womenIds, 3, 'new_arrivals_cursor_women', env) : Promise.resolve([]),
      menIds.length ? getNextNewArrivalsBatch(menIds, 3, 'new_arrivals_cursor_men', env) : Promise.resolve([])
    ]);

    const genericProducts = genericBatchIds.map(id => products.find(p => p.id === id)).filter(Boolean);
    const womenProducts = womenBatchIds.map(id => products.find(p => p.id === id)).filter(Boolean);
    const menProducts = menBatchIds.map(id => products.find(p => p.id === id)).filter(Boolean);

    let sentCount = 0;

    for (const sub of subscribers) {
      let batchProducts = genericProducts;
      let collectionUrl = NEW_ARRIVALS_URL;

      if (sub.gender === 'woman' && womenProducts.length) {
        batchProducts = womenProducts;
        collectionUrl = WOMEN_URL;
      } else if (sub.gender === 'man' && menProducts.length) {
        batchProducts = menProducts;
        collectionUrl = MEN_URL;
      }
      // Genre défini mais collection correspondante vide → repli silencieux
      // sur le lot générique plutôt que de n'envoyer aucun message.

      if (!batchProducts.length) continue;

      await sendBatchToSubscriber(sub, batchProducts, promo, collectionUrl, env);
      sentCount++;
    }

    console.log(
      `[telegram-new-arrivals] Sent to ${sentCount}/${subscribers.length} subscriber(s). ` +
      `generic: ${genericBatchIds.join(', ') || '—'} | women: ${womenBatchIds.join(', ') || '—'} | men: ${menBatchIds.join(', ') || '—'}`
    );
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[telegram-new-arrivals] FAILED:', e.message);
    return new Response('error', { status: 200 });
  }
}
