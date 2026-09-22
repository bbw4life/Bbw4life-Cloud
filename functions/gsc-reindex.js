// functions/gsc-reindex.js
// Vérifie le statut d'indexation de chaque URL du sitemap via Search Console,
// puis soumet une demande de réindexation (Indexing API) pour celles qui ne
// sont pas indexées (ou dont Google n'a pas encore vu la dernière version).
// ⚠️ Aucune authentification sur cette fonction (comportement original
// préservé) — auto-pagine via le champ nextUrl retourné dans sa propre
// réponse, probablement déclenchée manuellement ou par un script externe
// suivant ce nextUrl.
const { google } = require('googleapis');

function getAuth(scopes, env) {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes
  });
}

async function getUrlsFromSitemap(env) {
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
  const res = await fetch(`${BASE_URL}/sitemap.xml`);
  if (!res.ok) throw new Error(`Failed to fetch sitemap.xml (HTTP ${res.status})`);
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)];
  return matches.map(m => m[1].trim());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Traite un lot d'URLs par appel (évite le timeout des fonctions synchrones) ──
const BATCH_SIZE = 3;

export async function onRequestGet(context) {
  const { request, env } = context;
  const SITE_URL = env.GOOGLE_SEARCH_CONSOLE_SITE_URL;

  try {
    if (!SITE_URL) throw new Error('Missing GOOGLE_SEARCH_CONSOLE_SITE_URL env var');

    const url    = new URL(request.url);
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    const allUrls = await getUrlsFromSitemap(env);
    const urls    = allUrls.slice(offset, offset + BATCH_SIZE);

    const inspectAuth = getAuth(['https://www.googleapis.com/auth/webmasters.readonly'], env);
    const searchconsole = google.searchconsole({ version: 'v1', auth: inspectAuth });

    const indexAuth = getAuth(['https://www.googleapis.com/auth/indexing'], env);
    const indexingClient = await indexAuth.getClient();

    const notIndexed = [];
    const indexed = [];
    const errors = [];

    for (const u of urls) {
      try {
        const res = await searchconsole.urlInspection.index.inspect({
          requestBody: { inspectionUrl: u, siteUrl: SITE_URL }
        });
        const verdict = res.data.inspectionResult?.indexStatusResult?.verdict || 'UNKNOWN';
        if (verdict === 'PASS') {
          indexed.push(u);
        } else {
          notIndexed.push({ url: u, verdict });
        }
      } catch (e) {
        errors.push({ url: u, error: e.message });
      }
      await sleep(80);
    }

    // ── Soumet une demande de réindexation pour chaque URL non indexée du lot ──
    const resubmitted = [];
    const resubmitErrors = [];
    for (const item of notIndexed) {
      try {
        await google.indexing({ version: 'v3', auth: indexingClient }).urlNotifications.publish({
          requestBody: { url: item.url, type: 'URL_UPDATED' }
        });
        resubmitted.push(item.url);
      } catch (e) {
        resubmitErrors.push({ url: item.url, error: e.message });
      }
      await sleep(80);
    }

    const nextOffset = offset + BATCH_SIZE;
    const done = nextOffset >= allUrls.length;

    return new Response(JSON.stringify({
      success: true,
      totalUrls: allUrls.length,
      batchOffset: offset,
      batchSize: urls.length,
      done,
      nextUrl: done ? null : `/gsc-reindex?offset=${nextOffset}`,
      indexedCount: indexed.length,
      notIndexedCount: notIndexed.length,
      notIndexed,
      resubmitted,
      resubmitErrors,
      inspectionErrors: errors
    }, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[gsc-reindex]', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
