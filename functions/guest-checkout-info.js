// functions/guest-checkout-info.js
// Sauvegarde/restauration des infos de checkout pour un client NON connecté
// ("Save this information for next time" côté invité). Identifié uniquement
// par un guestId généré côté client (localStorage) — sans compte, sans mot
// de passe. Si le client vide son cache, le guestId disparaît et sa ligne
// devient définitivement inatteignable : à la demande, on la supprime alors
// du sheet dès qu'on détecte cet état (action 'clear').
const { google } = require("googleapis");
const { getGoogleAuthClient } = require('./_lib/google-auth');

const SHEET_NAME = "Guest_Saved_Info";
const SHEET_RANGE = `${SHEET_NAME}!A:C`;

async function getSheetsClient(env) {
  const auth = await getGoogleAuthClient(env);
  return google.sheets({ version: "v4", auth });
}

async function ensureSheetExists(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const exists = (meta.data.sheets || []).some(s => s.properties.title === SHEET_NAME);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:C1`,
    valueInputOption: 'RAW',
    resource: { values: [['guest_id', 'info_json', 'updated_at']] }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_ACCOUNTS;

  try {
    const body = await request.json();
    const { action, guestId, info } = body;
    if (!guestId) throw new Error("guestId required");

    const sheets = await getSheetsClient(env);
    await ensureSheetExists(sheets, spreadsheetId);

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: SHEET_RANGE });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(row => (row[0] || '') === guestId);
    const rowNum = rowIndex + 1;

    // ==================== SAVE ====================
    if (action === 'save') {
      if (!info) throw new Error("info required");
      const nowIso = new Date().toISOString();

      if (rowIndex !== -1) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!B${rowNum}:C${rowNum}`,
          valueInputOption: 'RAW',
          resource: { values: [[JSON.stringify(info), nowIso]] }
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: SHEET_RANGE,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [[guestId, JSON.stringify(info), nowIso]] }
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // ==================== GET ====================
    if (action === 'get') {
      if (rowIndex === -1) {
        return new Response(JSON.stringify({ success: true, info: null }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
      let info = null;
      try { info = JSON.parse(rows[rowIndex][1] || 'null'); } catch (e) {}
      return new Response(JSON.stringify({ success: true, info }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // ==================== CLEAR ====================
    // Appelé quand le client revient sans guestId retrouvé en localStorage
    // (cache vidé) — supprime toute ligne orpheline correspondant à l'ancien
    // guestId qu'il nous redonne une dernière fois avant de le regénérer.
    if (action === 'clear') {
      if (rowIndex === -1) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: (await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }))
                  .data.sheets.find(s => s.properties.title === SHEET_NAME).properties.sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1
              }
            }
          }]
        }
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    throw new Error("Action inconnue");
  } catch (error) {
    console.error("GUEST CHECKOUT INFO ERROR:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
    status: 405, headers: { 'Content-Type': 'application/json' }
  });
}
