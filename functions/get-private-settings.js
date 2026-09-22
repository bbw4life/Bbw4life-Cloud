export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const ok   = body.password === env.EPROLO_PASSWORD;
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 });
}
