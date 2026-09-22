/* ══════════════════════════════════════════════════════
   LIVE CHAT — polling frontend (toutes les 3-5s tant que la
   page reste ouverte, cf. script.js). Renvoie les messages
   "agent" pour un chat_id donné, plus le statut de session
   (pending / answered / closed) pour que le frontend sache
   quand arrêter le polling.
══════════════════════════════════════════════════════ */
const { getLiveChatRowsFor, findOpenStatusFor } = require('./_lib/live-chat-sheet');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId');
  if (!chatId) {
    return new Response(JSON.stringify({ error: 'chatId is required' }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const rows = await getLiveChatRowsFor(chatId, env);
    const status = await findOpenStatusFor(chatId, env);

    const agentMessages = rows
      .filter(r => r[1] === 'agent')
      .map(r => ({ message: r[2], timestamp: r[3] }));

    return new Response(JSON.stringify({ success: true, status: status || 'pending', messages: agentMessages }), {
      status: 200, headers: CORS_HEADERS
    });
  } catch (e) {
    console.error('[live-chat] get-live-chat-messages FAILED:', e.message);
    return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), { status: 500, headers: CORS_HEADERS });
  }
}
