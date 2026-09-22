// functions/_lib/account-token.js
const crypto = require('crypto');

function normalizeEmail(email) {
  return (email || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Génère un token = HMAC-SHA256(email_normalisé, SECRET)
function generateAccountToken(email, env) {
  const secret = env.ACCOUNT_TOKEN_SECRET;
  if (!secret) throw new Error('ACCOUNT_TOKEN_SECRET not configured');
  const normalized = normalizeEmail(email);
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

// Vérifie que le token fourni correspond bien à l'email fourni
function verifyAccountToken(email, token, env) {
  if (!email || !token) return false;
  const expected = generateAccountToken(email, env);
  // Comparaison à temps constant pour éviter les timing attacks
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Génère un token de confirmation d'email (différent du token de session)
function generateConfirmToken(email, env) {
  const secret = env.ACCOUNT_TOKEN_SECRET;
  if (!secret) throw new Error('ACCOUNT_TOKEN_SECRET not configured');
  const normalized = normalizeEmail(email);
  return crypto.createHmac('sha256', secret + '_CONFIRM').update(normalized).digest('hex');
}

// Vérifie le token de confirmation d'email
function verifyConfirmToken(email, token, env) {
  if (!email || !token) return false;
  const expected = generateConfirmToken(email, env);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { generateAccountToken, verifyAccountToken, normalizeEmail, generateConfirmToken, verifyConfirmToken };
