// Cache en mémoire (6 heures)
// ⚠️ NOTE MIGRATION CLOUDFLARE : ce cache en variable globale ne persistera
// pas de façon fiable entre requêtes sur Workers (isolates recyclés
// fréquemment) — comportement dégradé (cache moins efficace, plus d'appels
// à l'API externe) mais non cassé. Pour un vrai cache fiable, utiliser la
// Cache API ou KV Cloudflare.
let cachedRates = null;
let cacheTime   = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

export async function onRequestGet() {
  const now = Date.now();

  // Retourner le cache si encore valide
  if (cachedRates && (now - cacheTime) < CACHE_TTL) {
    return new Response(JSON.stringify({ success: true, rates: cachedRates, cached: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Appel API — exchangerate.host (gratuit, pas de clé requise)
  try {
    const res = await fetch('https://api.exchangerate.host/latest?base=USD');
    const json = await res.json();

    if (json && json.rates) {
      cachedRates = json.rates;
      cacheTime   = now;
      return new Response(JSON.stringify({ success: true, rates: cachedRates, cached: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    throw new Error('Invalid response');
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
