// functions/watermark-image.js
//
// ⚠️ MIGRATION CLOUDFLARE — COMPROMIS VISUEL IMPORTANT, À VALIDER :
// L'original (Netlify) utilise `sharp` pour composer un SVG texte stylé
// (police 'Cormorant Garamond'/Georgia, taille proportionnelle à l'image,
// letter-spacing, couleur rgba(80,60,60,0.34) semi-transparente, positionné
// à 90% de la hauteur) par-dessus l'image produit. `sharp` est un binding
// natif C++ (libvips) — 100% incompatible avec Cloudflare Workers, aucun
// portage direct possible.
//
// Remplacé ici par `@cf-wasm/photon` (Photon compilé en WASM, nativement
// compatible Workers). MAIS sa fonction `draw_text` :
//   - n'a QUE la police Roboto (pas de police custom) ;
//   - n'a AUCUN contrôle de couleur ni d'opacité (texte opaque par défaut,
//     contrairement au rgba(...,0.34) subtil de l'original) ;
//   - ne supporte que position (x, y) et taille de police.
// Résultat : le watermark sera visuellement DIFFÉRENT et probablement plus
// visible/intrusif qu'avant sur les photos produit (perte de la police
// stylée et surtout de la semi-transparence). Migré tel quel sur décision
// explicite — le rendu final devra être vérifié visuellement après
// déploiement et éventuellement ajusté avec l'agent design, ou remplacé
// par Cloudflare Images (service payant séparé, offre un vrai contrôle
// d'overlay/opacité) si le rendu Photon n'est pas satisfaisant.
//
// Dépendance npm à ajouter : "@cf-wasm/photon" (nouvelle dépendance,
// jamais utilisée ailleurs dans ce projet — à confirmer/installer avant
// déploiement : npm install @cf-wasm/photon).
import { PhotonImage, draw_text } from "@cf-wasm/photon/workerd";

const ALLOWED_HOST = 'cdn.shopify.com';
const DEFAULT_WATERMARK_TEXT = 'bbw4life.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ── Lit le réglage watermark depuis products.data.json — plus de lecture
//    filesystem locale possible sur Workers (pas de fs/process.cwd()),
//    remplacé par un fetch réseau vers le site publié, même pattern que
//    partout ailleurs dans le projet migré (chat.js, pricing.js, etc.). ──
async function getWatermarkSetting(env) {
  try {
    const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
    const res = await fetch(`${BASE_URL}/products.data.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const allProducts = await res.json();
    const settings = (Array.isArray(allProducts) ? allProducts : []).find((p) => p.type === 'settings') || {};
    return settings.watermark || {};
  } catch (e) {
    console.error('[watermark-image] Could not read watermark setting:', e.message);
    return {};
  }
}

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const src = url.searchParams.get('src');

  if (!src) {
    return jsonResponse(400, { success: false, error: 'Missing src parameter' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(src);
  } catch (e) {
    return jsonResponse(400, { success: false, error: 'Invalid src URL' });
  }

  if (parsedUrl.hostname !== ALLOWED_HOST) {
    return jsonResponse(400, { success: false, error: 'src host not allowed' });
  }

  let inputImage = null;
  let outputImage = null;

  try {
    const imgResponse = await fetch(parsedUrl.toString());
    if (!imgResponse.ok) {
      return jsonResponse(502, { success: false, error: `Upstream image fetch failed (${imgResponse.status})` });
    }

    const inputBytes = new Uint8Array(await imgResponse.arrayBuffer());
    inputImage = PhotonImage.new_from_byteslice(inputBytes);

    const wmSetting = await getWatermarkSetting(env);
    const watermarkEnabled = (wmSetting.show || 'no').toLowerCase().trim() === 'yes';

    if (watermarkEnabled) {
      const width  = inputImage.get_width()  || 1200;
      const height = inputImage.get_height() || 1200;
      const text   = wmSetting.text || DEFAULT_WATERMARK_TEXT;

      // Reproduction approximative du positionnement original (texte bas
      // de l'image, taille proportionnelle à la largeur) — voir le
      // commentaire en tête de fichier pour les limites (pas de couleur/
      // opacité/police custom disponibles avec draw_text).
      //
      // draw_text(x, y) place le coin HAUT-GAUCHE du texte (pas de
      // text-anchor="middle" comme le SVG original) — Photon ne fournit
      // pas de mesure de largeur de texte rendu, donc le centrage
      // horizontal ci-dessous est une ESTIMATION (largeur moyenne d'un
      // caractère Roboto ≈ 0.56 × fontSize), pas un calcul exact. Le
      // texte peut donc être légèrement décentré selon le contenu réel.
      const fontSize = Math.max(18, Math.round(width * 0.055));
      const estimatedTextWidth = text.length * fontSize * 0.56;
      const x = Math.max(0, Math.round((width - estimatedTextWidth) / 2));
      const y = Math.round(height * 0.90);

      draw_text(inputImage, text, x, y, fontSize);
    }

    outputImage = inputImage;
    const outputBytes = outputImage.get_bytes_jpeg(88);

    return new Response(outputBytes, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error) {
    console.error('[watermark-image] Error:', error.message);
    return jsonResponse(500, { success: false, error: error.message });
  } finally {
    // Obligatoire avec Photon/WASM — la mémoire linéaire WASM n'est pas
    // garbage-collectée automatiquement comme un objet JS normal.
    if (inputImage) { try { inputImage.free(); } catch (e) {} }
  }
}
