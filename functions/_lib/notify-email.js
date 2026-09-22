function makeEndpoint(env) {
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
  return `${BASE_URL}/send-email-auto`;
}

async function notifyEmail(trigger, payload = {}, env) {
  if (!trigger) {
    console.warn('[notify-email] Missing trigger');
    return { success: false, error: 'Missing trigger' };
  }
  if (!payload.email || !payload.email.includes('@')) {
    console.warn(`[notify-email] Invalid email for trigger "${trigger}":`, payload.email);
    return { success: false, error: 'Invalid email' };
  }

  const ENDPOINT = makeEndpoint(env);

  try {
    console.log(`[notify-email] DEBUG calling ENDPOINT="${ENDPOINT}" (BASE_URL env raw="${env.BASE_URL}") for trigger="${trigger}"`);
    const res  = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ trigger, ...payload })
    });
    const rawText = await res.text();
    console.log(`[notify-email] DEBUG raw response status=${res.status} body=${rawText.slice(0, 500)}`);
    let data = {};
    try { data = JSON.parse(rawText); } catch (parseErr) {
      console.error(`[notify-email] DEBUG response is not valid JSON:`, parseErr.message);
    }

    if (!res.ok || data.success === false) {
      console.warn(`[notify-email] ✗ "${trigger}" failed for ${payload.email}:`, JSON.stringify(data));
      return { success: false, error: data.error || `HTTP ${res.status}`, raw: data };
    }

    console.log(`[notify-email] ✓ "${trigger}" sent for ${payload.email}`);
    return { success: true, raw: data };

  } catch (e) {
    console.error(`[notify-email] ✗ "${trigger}" network error for ${payload.email}:`, e.message, e.stack);
    return { success: false, error: e.message };
  }
}

// 2 — Account created
function notifyWelcome({ email, firstName }, env) {
  return notifyEmail('welcome', { email, firstName }, env);
}

// 1 (part 1) — Order confirmed
function notifyOrderConfirm({ email, firstName, lastName, orderId, items, total, shippingAddress }, env) {
  return notifyEmail('order_confirm', { email, firstName, lastName, orderId, items, total, shippingAddress }, env);
}

// 1 (part 2) — Tracking number available
function notifyOrderTracking({ email, firstName, lastName, orderId, trackingNumber, carrier }, env) {
  return notifyEmail('order_tracking', { email, firstName, lastName, orderId, trackingNumber, carrier }, env);
}

// 3 — Newsletter sequence J+0
function notifyNewsletter1({ email, firstName }, env) {
  return notifyEmail('newsletter_1', { email, firstName }, env);
}

// 3 — Newsletter sequence J+3
function notifyNewsletter2({ email, firstName }, env) {
  return notifyEmail('newsletter_2', { email, firstName }, env);
}

// 3 — Newsletter sequence J+5
function notifyNewsletter3({ email, firstName }, env) {
  return notifyEmail('newsletter_3', { email, firstName }, env);
}

// 3 — Newsletter sequence J+10 (already ordered)
function notifyNewsletter4Buyer({ email, firstName }, env) {
  return notifyEmail('newsletter_4_buyer', { email, firstName }, env);
}

// 3 — Newsletter sequence J+10 (never ordered)
function notifyNewsletter4New({ email, firstName }, env) {
  return notifyEmail('newsletter_4_new', { email, firstName }, env);
}

// 4 — Contact form received
function notifyContactReply({ email, firstName, lastName, subject, category }, env) {
  return notifyEmail('contact_reply', { email, firstName, lastName, subject, category }, env);
}

// 5 — Product request received
function notifyPlanRequest({ email, firstName, lastName, program, productId, size, color }, env) {
  return notifyEmail('plan_request', { email, firstName, lastName, program, productId, size, color }, env);
}

// 6 — Custom design request received
function notifyCustomProduct({ email, firstName, productTitle, productDesc }, env) {
  return notifyEmail('custom_product', { email, firstname: firstName, lastname: '', product_title: productTitle, product_desc: productDesc }, env);
}

// 7 — Story submission confirmation
function notifyStoryReceived({ email, firstName }, env) {
  return notifyEmail('story_received', { email, firstName }, env);
}

// 8 — Review response
function notifyReviewResponse({ email, firstName, title, text, productId }, env) {
  return notifyEmail('review_response', { email, firstName, title, text, productId }, env);
}

// Abandoned cart recovery
function notifyCartAbandoned({ email, orderId, firstName, items, promoCode, promoPercent, restartLink }, env) {
  return notifyEmail('cart_abandoned', { email, orderId, firstName, items, promoCode, promoPercent, restartLink }, env);
}

// Confirmation d'email après signup
function notifyConfirmEmail({ email, firstName, confirmToken }, env) {
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
  const confirmUrl = `${BASE_URL}/account.html?confirm_token=${encodeURIComponent(confirmToken)}&email=${encodeURIComponent(email)}`;
  return notifyEmail('confirm_account', { email, firstName, confirmUrl }, env);
}

// Réinitialisation de mot de passe (lien à usage unique, expire 10 min)
function notifyPasswordReset({ email, firstName, resetToken }, env) {
  const BASE_URL = env.BASE_URL || 'https://bbw4life.com';
  const resetUrl = `${BASE_URL}/account.html?reset_token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;
  return notifyEmail('password_reset', { email, firstName, resetUrl }, env);
}

module.exports = {
  notifyEmail,
  notifyWelcome,
  notifyOrderConfirm,
  notifyOrderTracking,
  notifyNewsletter1,
  notifyNewsletter2,
  notifyNewsletter3,
  notifyNewsletter4Buyer,
  notifyNewsletter4New,
  notifyContactReply,
  notifyPlanRequest,
  notifyCustomProduct,
  notifyCartAbandoned,
  notifyStoryReceived,
  notifyReviewResponse,
  notifyConfirmEmail,
  notifyPasswordReset
};
