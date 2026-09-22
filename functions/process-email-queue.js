// functions/process-email-queue.js
// ⚠️ SCHEDULED FUNCTION — Netlify : [functions.process-email-queue]
// schedule = "* * * * *" (chaque minute). Cron Trigger Cloudflare câblé
// séparément — attention à la granularité minute-par-minute contre les
// limites du plan Cloudflare choisi.
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const base = env.BASE_URL || 'https://bbw4life.com';
    const res = await fetch(
      `${base}/send-email-auto?action=process-queue&secret=${env.REPORT_SECRET}`
    );
    const data = await res.json();
    console.log('[Scheduled Queue]', JSON.stringify(data));
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('[Scheduled Queue] Error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
