// functions/daily-report.js
// ⚠️ Probablement déclenchée par un cron EXTERNE (type cron-job.org, hors
// Netlify/Cloudflare — aucune trace dans netlify.toml). Protégée par
// REPORT_SECRET. Après déploiement Cloudflare, ce cron externe devra être
// reconfiguré pour pointer vers la nouvelle URL /daily-report.
const { google } = require('googleapis');
const { notifyTelegram } = require('./_lib/notify-telegram');

function getAuth(env) {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// Le rapport résume la journée d'HIER (envoyé le matin pour la veille
// complète), pas le jour courant — sans ça, un cron qui déclenche le
// rapport après minuit ne trouve jamais les commandes/activité de la
// veille car il compare à la date du jour d'exécution.
function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear().toString().slice(-2)}`;
}

function getYesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // Sécurité — clé secrète pour éviter les appels non autorisés
  const url = new URL(request.url);
  const secret = request.headers.get('x-report-secret') || url.searchParams.get('secret');
  if (secret !== env.REPORT_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const auth   = getAuth(env);
    const sheets = google.sheets({ version: 'v4', auth });
    const today     = getYesterdayDate();
    const todayISO  = getYesterdayISO();

    // ── 1. Commandes du jour ──
    let ordersToday = 0;
    let revenueToday = 0;
    const countedOrderIds = new Set(); // évite de compter le même payment_id 2x (multi-articles)
    try {
      const ordersRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SHEET_ID_BBW4LIFE_PENDING_ORDERS,
        range: 'bbw4life-pending-orders!A:W'
      });
      const orderRows = (ordersRes.data.values || []).slice(1);
      orderRows.forEach(row => {
        if (row[16] && row[16].toString().startsWith(todayISO)) {
          ordersToday++;
          const orderId = row[2]; // colonne C = payment_id
          if (orderId && !countedOrderIds.has(orderId)) {
            countedOrderIds.add(orderId);
            revenueToday += parseFloat(row[22]) || 0; // colonne W
          }
        }
      });
    } catch(e) { console.warn('Orders read failed:', e.message); }

     // ── Paniers abandonnés du jour ──
    let abandonedToday = 0;
    try {
      const abandonedRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SHEET_ID_BBW4LIFE_PENDING_ORDERS,
        range: 'Abandoned_Carts!A:J'
      });
      const abandonedRows = (abandonedRes.data.values || []).slice(1);
      abandonedRows.forEach(row => {
        if (row[7] && row[7].toString().startsWith(todayISO)) {
          abandonedToday++;
        }
      });
    } catch(e) { console.warn('Abandoned carts read failed:', e.message); }

    // ── 2. Nouveaux clients du jour ──
    let newClients = 0;
    try {
      const accountsRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SHEET_ID_BBW4LIFE_ACCOUNTS,
        range: 'bbw4life-accounts!A:Z'
      });
      const accountRows = (accountsRes.data.values || []).slice(1);
      accountRows.forEach(row => {
        if (row[0] && row[0].toString() === today) newClients++;
      });
    } catch(e) { console.warn('Accounts read failed:', e.message); }

    // ── 3. Messages contact du jour ──
    let messagesTODAY = 0;
    try {
      const messagesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SHEET_ID_BBW4LIFE_ACCOUNTS,
        range: 'bbw4life-contact-messages!A:G'
      });
      const messageRows = (messagesRes.data.values || []).slice(1);
      messageRows.forEach(row => {
        if (row[6] && row[6].toString() === today) messagesTODAY++;
      });
    } catch(e) { console.warn('Messages read failed:', e.message); }

    // ── 4. Stories du jour ──
    let storiesToday = 0;
    try {
      const storiesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SHEET_ID_BBW4LIFE_STORIES,
        range: 'bbw4life-stories!A:Q'
      });
      const storyRows = (storiesRes.data.values || []).slice(1);
      storyRows.forEach(row => {
        if (row[16] && row[16].toString() === today) storiesToday++;
      });
    } catch(e) { console.warn('Stories read failed:', e.message); }

    // ── 5. Produits personnalisés du jour ──
    let customToday = 0;
    try {
      const customRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SHEET_ID_BBW4LIFE_PLAN_REQUEST,
        range: 'bbw4life-product-personalized!A:Q'
      });
      const customRows = (customRes.data.values || []).slice(1);
      customRows.forEach(row => {
        if (row[0] && row[0].toString() === today) customToday++;
      });
    } catch(e) { console.warn('Custom products read failed:', e.message); }

    // ── 6. Plan requests du jour ──
    let plansToday = 0;
    try {
      const plansRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SHEET_ID_BBW4LIFE_PLAN_REQUEST,
        range: 'bbw4life-plan-request!A:K'
      });
      const planRows = (plansRes.data.values || []).slice(1);
      planRows.forEach(row => {
        if (row[0] && row[0].toString().startsWith(today)) plansToday++;
      });
    } catch(e) { console.warn('Plans read failed:', e.message); }

    // ── Envoyer le rapport ──
    const rapport =
      `📊 <b>Rapport Quotidien BBW4LIFE</b>\n` +
      `📅 <b>${today}</b>\n\n` +
      `🛍️ <b>Commandes:</b> ${ordersToday}\n` +
      `💰 <b>Chiffre d'affaires:</b> $${revenueToday.toFixed(2)}\n` +
      `🛒 <b>Paniers abandonnés:</b> ${abandonedToday}\n` +
      `👥 <b>Nouveaux clients:</b> ${newClients}\n` +
      `💌 <b>Messages contact:</b> ${messagesTODAY}\n` +
      `📖 <b>Stories soumises:</b> ${storiesToday}\n` +
      `🎨 <b>Produits personnalisés:</b> ${customToday}\n` +
      `⏳ <b>Plan requests:</b> ${plansToday}\n\n` +
      `👑 <i>Beauty Has No Sizes — BBW4LIFE</i>`;

    await notifyTelegram(rapport, env);

    // ── Lancer le tracking checker en même temps ──
    try {
      await fetch(`${env.BASE_URL}/send-email-auto?action=tracking&secret=${env.REPORT_SECRET}`, {
        method: 'GET'
      });
      console.log('[DailyReport] Tracking checker triggered');
    } catch (e) {
      console.warn('[DailyReport] Tracking trigger failed:', e.message);
    }

    return new Response(JSON.stringify({ success: true, today }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[DailyReport] Error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
