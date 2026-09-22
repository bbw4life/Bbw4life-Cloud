// functions/fetch-cj-stock.js
// ⚠️ NOTE MIGRATION CLOUDFLARE : jusqu'à 8 sleep(1100ms) séquentiels
// (~9s) — outil admin interne, à surveiller après déploiement contre les
// limites d'exécution du plan Workers choisi.

const SEP = "═".repeat(80);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Délai entre chaque appel CJ pour respecter le rate-limit (~1 req/s) ──
const CJ_REQUEST_DELAY_MS = 1100;

const MAX_VIDS_PER_CALL = 8;

async function getCJAccessToken(env) {
  const res = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: env.CJ_API_KEY })
  });

  const data = await res.json();
  if (!data.result || !data.data?.accessToken) {
    throw new Error('CJ auth failed: ' + (data.message || JSON.stringify(data)));
  }
  return data.data.accessToken;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  let vidsRaw = [];
  try {
    const body = await request.json().catch(() => ({}));
    vidsRaw = Array.isArray(body.vids) ? body.vids.filter(Boolean) : [];
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  if (!vidsRaw.length) {
    return new Response(JSON.stringify({ success: true, stocks: {}, truncated: false, logs: ["Aucun vid fourni."] }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  const truncated = vidsRaw.length > MAX_VIDS_PER_CALL;
  const vids = vidsRaw.slice(0, MAX_VIDS_PER_CALL);

  if (!env.CJ_API_KEY) {
    return new Response(JSON.stringify({ success: false, error: "CJ_API_KEY missing in env", logs }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  log(SEP);
  log(`  CJ STOCK — RÉCUPÉRATION POUR ${vids.length} VARIANT(S)${truncated ? ` (sur ${vidsRaw.length} demandés, tronqué à ${MAX_VIDS_PER_CALL})` : ''}`);
  log(`  Délai entre appels : ${CJ_REQUEST_DELAY_MS}ms`);
  log(SEP);

  try {
    const token = await getCJAccessToken(env);
    log("  🔑  Access token CJ obtenu");

    const stocks = {};

    for (const vid of vids) {
      try {
        const url = `https://developers.cjdropshipping.com/api2.0/v1/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`;
        const response = await fetch(url, {
          method: "GET",
          headers: { "CJ-Access-Token": token }
        });
        const responseText = await response.text();

        let data = {};
        try { data = JSON.parse(responseText); } catch {}

        if (data.result === true && Array.isArray(data.data)) {
          const total = data.data.reduce((sum, w) => sum + (Number(w.totalInventoryNum) || 0), 0);
          stocks[vid] = total;
          log(`  ✅  ${vid}  →  ${total} en stock  (${data.data.length} entrepôt(s))`);
        } else {
          stocks[vid] = null;
          const errMsg = data.message || responseText.slice(0, 150) || 'réponse invalide';
          log(`  ⚠️  ${vid}  →  ERREUR : ${errMsg}`);
        }
      } catch (err) {
        stocks[vid] = null;
        log(`  ❌  ${vid}  →  EXCEPTION : ${err.message}`);
      }

      await sleep(CJ_REQUEST_DELAY_MS);
    }

    log(SEP);
    log(truncated ? "  ➡️  LOT TERMINÉ — il reste des vids à traiter dans un autre appel" : "  ✅  FIN");

    return new Response(JSON.stringify({ success: true, stocks, truncated, processed: vids.length, requested: vidsRaw.length, logs }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (error) {
    console.error("[CJ STOCK ERROR]", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message, logs }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ success: false, error: "Method not allowed, use POST" }), {
    status: 405, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
