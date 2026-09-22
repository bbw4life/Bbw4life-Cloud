// functions/_lib/google-auth.js
//
// Remplace google.auth.GoogleAuth({credentials: {...}}) pour l'authentification
// par compte de service, qui échoue sur Cloudflare Workers avec l'erreur
// "[unenv] crypto.createSign is not implemented yet!" — google-auth-library
// (utilisée en interne par googleapis) signe le JWT d'authentification via
// le module Node natif `crypto` (crypto.createSign), qui n'est pas
// implémenté par la couche de compatibilité `nodejs_compat` de Cloudflare.
//
// Ce module obtient un access_token OAuth2 valide en signant le JWT
// nous-mêmes via la Web Crypto API (crypto.subtle), nativement supportée
// par les Workers, en suivant le flow standard "OAuth 2.0 Service Account"
// documenté par Google : https://developers.google.com/identity/protocols/oauth2/service-account
//
// L'access_token obtenu est ensuite injecté dans un OAuth2Client de
// google-auth-library via setCredentials({ access_token }) — confirmé en
// lisant le code source de google-auth-library (node_modules/google-auth-library
// /build/src/auth/oauth2client.js) : tant que credentials.access_token existe
// et n'est pas expiré (expiry_date non défini = jamais considéré expiré),
// getRequestMetadataAsync() construit directement le header
// "Authorization: Bearer <token>" SANS jamais appeler de méthode de
// signature/refresh — donc crypto.createSign n'est jamais invoqué. Tout le
// reste du code existant (google.sheets({version, auth}), sheets.spreadsheets
// .values.get/append/update/batchUpdate, etc.) continue de fonctionner à
// l'identique, sans aucune modification ailleurs que sur la construction de
// l'objet `auth`.
const { OAuth2Client } = require('google-auth-library');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ── Encodage base64url (RFC 4648 §5) — différent du base64 standard :
//    remplace +/ par -_ et retire le padding =. Requis par le format JWT. ──
function base64url(input) {
  let base64;
  if (typeof input === 'string') {
    base64 = btoa(input);
  } else {
    // input est un ArrayBuffer/Uint8Array (résultat de crypto.subtle.sign)
    const bytes = new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// ── Convertit une clé privée PEM (PKCS#8, format "-----BEGIN PRIVATE KEY-----...")
//    en CryptoKey utilisable par crypto.subtle.sign. Le service account Google
//    fournit toujours une clé RSA PKCS#8 — jamais PKCS#1, donc pas besoin de
//    gérer "-----BEGIN RSA PRIVATE KEY-----" séparément. ──
async function importPrivateKey(pem) {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  const binaryDer = atob(pemBody);
  const derBytes = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) derBytes[i] = binaryDer.charCodeAt(i);

  return crypto.subtle.importKey(
    'pkcs8',
    derBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// ── Construit et signe le JWT d'assertion (RFC 7523), puis l'échange contre
//    un access_token via le endpoint OAuth2 token de Google. Même échange
//    que celui que google-auth-library fait en interne — uniquement la
//    méthode de signature change (Web Crypto au lieu de crypto.createSign). ──
async function getGoogleAccessToken(env, scopes) {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyPem = (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKeyPem) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY missing in env');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expirySeconds = nowSeconds + 3600; // 1h, identique à la durée de vie standard d'un token Google

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: (scopes || DEFAULT_SCOPES).join(' '),
    aud: TOKEN_URL,
    exp: expirySeconds,
    iat: nowSeconds
  };

  const unsignedToken = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const key = await importPrivateKey(privateKeyPem);
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signedJwt = `${unsignedToken}.${base64url(signatureBuffer)}`;

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error('Google OAuth token exchange failed: ' + JSON.stringify(tokenData));
  }

  return tokenData.access_token;
}

// ── Retourne un objet "auth" directement utilisable par
//    google.sheets({ version: 'v4', auth }) et tout autre client googleapis
//    (google.searchconsole, google.indexing, etc.), en remplacement direct
//    de `new google.auth.GoogleAuth({...})`. `scopes` optionnel : par
//    défaut le scope Sheets (utilisé par la quasi-totalité des functions
//    migrées) — à fournir explicitement pour les APIs Google non-Sheets
//    (ex: Search Console, Indexing API dans gsc-reindex.js), qui exigent
//    chacune leur propre scope OAuth. ──
async function getGoogleAuthClient(env, scopes) {
  const accessToken = await getGoogleAccessToken(env, scopes);
  const client = new OAuth2Client();
  client.setCredentials({ access_token: accessToken, token_type: 'Bearer' });
  return client;
}

module.exports = { getGoogleAccessToken, getGoogleAuthClient };
