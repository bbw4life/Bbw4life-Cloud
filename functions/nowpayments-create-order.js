const { saveTempOrder } = require('./_lib/temp-orders-store');
const { getAllProductsData, computeServerTotal } = require('./_lib/pricing');

const BASE_URL_NOW = 'https://api.nowpayments.io';

// ── POST helper — remplace le https.request bas niveau (module Node
//    absent sur Workers) par fetch natif, même contrat de retour ──
async function nowPaymentsPost(path, data, headers) {
  const res = await fetch(`${BASE_URL_NOW}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data)
  });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, data: json };
}

function res(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const API_KEY = env.NOWPAYMENTS_API_KEY;

  try {
    const bodyText = await request.text();
    if (!bodyText) return res(400, { success: false, error: 'No data received' });

    const { cart: rawCart, shipping, promoCode, clientTotal } = JSON.parse(bodyText);

    if (!Array.isArray(rawCart) || rawCart.length === 0) {
      return res(400, { success: false, error: 'Cart empty' });
    }

    if (!API_KEY) {
      console.error('[NOWPAYMENTS] Missing API key');
      return res(500, { success: false, error: 'NOWPayments not configured' });
    }

    console.log(`[NOWPAYMENTS] Mode: LIVE | Host: ${BASE_URL_NOW}`);

    // ── Recalcul du prix EXCLUSIVEMENT côté serveur (jamais les prix/shipping/tax bruts du client) ──
    const allProducts    = await getAllProductsData(env);
    const settings       = allProducts.find(p => p.type === 'settings') || {};
    const shippingMethod = shipping?.shipping_method || 'Standard Shipping';

    const { total, sanitizedCart, discountAmount } = await computeServerTotal(
      rawCart,
      settings,
      allProducts,
      shippingMethod,
      promoCode || null,
      env
    );

    if (clientTotal !== undefined) {
      const clientTotalRounded = parseFloat(parseFloat(clientTotal).toFixed(2));
      const diff = Math.abs(clientTotalRounded - total);
      if (diff > 0.10) {
        console.warn(`[NOWPAYMENTS SECURITY] Price mismatch — client: $${clientTotal} | server: $${total}`);
        return res(400, { success: false, error: 'Price mismatch detected. Please refresh and try again.' });
      }
    }

    const cart = sanitizedCart;
    const totalAmount = total;

    const BASE_SITE  = env.BASE_URL || 'https://bbw4lifee.netlify.app';
    const orderId    = `BBW-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const orderTitle = cart.length === 1
      ? cart[0].title.substring(0, 100)
      : `BBW4LIFE — ${cart.length} articles`;

    // ── Le code promo affilié appliqué (et son montant, déjà calculé côté
    //    serveur ci-dessus) voyage avec shipping jusqu'à verify-payment.js,
    //    qui déduira le solde réel APRÈS confirmation du paiement — jamais
    //    avant, pour ne jamais brûler un solde sur un paiement abandonné. ──
    if (shipping && discountAmount > 0 && promoCode) {
      shipping.appliedPromoCode     = promoCode;
      shipping.appliedPromoDiscount = discountAmount;
    }

    // ── Stocker cart + shipping dans le Sheet temporaire (clé = orderId) ──
    await saveTempOrder(orderId, cart, shipping, env);
    console.log('[NOWPAYMENTS] Temp order saved | orderId:', orderId);

    const invoiceBody = {
      price_amount:        totalAmount,
      price_currency:      'usd',
      order_id:            orderId,
      order_description:   orderTitle,
      ipn_callback_url:    `${BASE_SITE}/nowpayments-webhook`,
      success_url:         `${BASE_SITE}/thankyou.html?provider=nowpayments&orderId=${orderId}`,
      cancel_url:          `${BASE_SITE}/checkout.html`,
      is_fixed_rate:       false,
      is_fee_paid_by_user: false,
    };

    console.log('[NOWPAYMENTS] Creating invoice:', orderId, '| Amount:', totalAmount, 'USD');

    const result = await nowPaymentsPost(
      '/v1/invoice',
      invoiceBody,
      { 'x-api-key': API_KEY }
    );

    console.log('[NOWPAYMENTS] Response status:', result.status);

    if (result.status !== 200 || !result.data.invoice_url) {
      console.error('[NOWPAYMENTS] Error response:', JSON.stringify(result.data));
      return res(500, {
        success: false,
        error: result.data?.message || result.data?.error || 'NOWPayments invoice creation failed'
      });
    }

    console.log('[NOWPAYMENTS] Invoice created:', result.data.id);

    return res(200, {
      success:    true,
      invoiceUrl: result.data.invoice_url,
      orderId,
      paymentId:  result.data.id,
    });

  } catch (err) {
    console.error('[NOWPAYMENTS] Fatal:', err.message);
    return res(500, { success: false, error: err.message || 'Internal server error' });
  }
}

export async function onRequestGet() {
  return res(405, { success: false, error: 'Method not allowed' });
}
