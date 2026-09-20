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
══════════════════════════════════════════════════════ */
process.removeAllListeners('warning');
const {
  BASE_URL,
  getSettings,
  getTelegramSubscribers,
  getNextNewArrivalsBatch,
  sendTelegramPhoto,
  sendTelegramMessage
} = require('./_lib/telegram-broadcast');

const NEW_ARRIVALS_COLLECTION_ID = 'bbw4life-new-arrivals';
const NEW_ARRIVALS_URL = `${BASE_URL}/collections/bbw4life-new-arrivals.html`;

const WOMEN_COLLECTION_ID = 'curvy-woman';
const WOMEN_URL = `${BASE_URL}/collections/curvy-woman.html`;

const MEN_COLLECTION_ID = 'men-plus-size';
const MEN_URL = `${BASE_URL}/collections/men-plus-size.html`;

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

async function sendBatchToSubscriber(sub, batchProducts, promo, collectionUrl) {
  const intro =
    `Hey ${sub.firstName} 💛\n\n` +
    `We just dropped fresh new pieces for our plus size Queens and Kings — ` +
    `quality, comfort and style made for you.`;
  await sendTelegramMessage(sub.chatId, intro);

  for (const prod of batchProducts) {
    const caption =
      `<b>${prod.title}</b>\n$${Number(prod.price).toFixed(2)}`;
    await sendTelegramPhoto(sub.chatId, prod.image, caption);
  }

  const promoLine = promo
    ? `\n\n🎁 Use code <b>${promo.code}</b> for ${promo.percent}% off your order.`
    : '';
  await sendTelegramMessage(
    sub.chatId,
    `Don't miss out on what's new.${promoLine}`,
    { inline_keyboard: [[{ text: 'See New Collection', url: collectionUrl }]] }
  );
}

exports.handler = async () => {
  try {
    const { settings, products } = await getSettings();
    const collections = (settings.jrgq_collections && settings.jrgq_collections.collections) || [];

    const subscribers = await getTelegramSubscribers();
    if (!subscribers.length) return { statusCode: 200, body: 'no subscribers' };

    const promo = pickPromo(settings);

    const genericIds = getProductIds(collections, NEW_ARRIVALS_COLLECTION_ID);
    const womenIds = getProductIds(collections, WOMEN_COLLECTION_ID);
    const menIds = getProductIds(collections, MEN_COLLECTION_ID);

    // Un curseur de rotation distinct par groupe — le groupe générique garde
    // sa clé d'origine ('new_arrivals_cursor') pour ne pas repartir de zéro.
    const [genericBatchIds, womenBatchIds, menBatchIds] = await Promise.all([
      genericIds.length ? getNextNewArrivalsBatch(genericIds, 3, 'new_arrivals_cursor') : Promise.resolve([]),
      womenIds.length ? getNextNewArrivalsBatch(womenIds, 3, 'new_arrivals_cursor_women') : Promise.resolve([]),
      menIds.length ? getNextNewArrivalsBatch(menIds, 3, 'new_arrivals_cursor_men') : Promise.resolve([])
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

      await sendBatchToSubscriber(sub, batchProducts, promo, collectionUrl);
      sentCount++;
    }

    console.log(
      `[telegram-new-arrivals] Sent to ${sentCount}/${subscribers.length} subscriber(s). ` +
      `generic: ${genericBatchIds.join(', ') || '—'} | women: ${womenBatchIds.join(', ') || '—'} | men: ${menBatchIds.join(', ') || '—'}`
    );
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.error('[telegram-new-arrivals] FAILED:', e.message);
    return { statusCode: 200, body: 'error' };
  }
};
