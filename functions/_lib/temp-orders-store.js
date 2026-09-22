// functions/_lib/temp-orders-store.js
const { google } = require('googleapis');
const { getGoogleAuthClient } = require('./google-auth');

async function getSheetsClient(env) {
  const auth = await getGoogleAuthClient(env);
  return google.sheets({ version: "v4", auth });
}

const SHEET_TAB       = "Temp_Orders";
const SHEET_RANGE     = `${SHEET_TAB}!A:D`;

// ── Onglet dédié au marquage anti-doublon (même spreadsheet) ──
const PROCESSED_TAB   = "Processed_Orders";
const PROCESSED_RANGE = `${PROCESSED_TAB}!A:B`;

// ── Crée l'onglet Processed_Orders s'il n'existe pas encore ──
async function ensureProcessedTabExists(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === PROCESSED_TAB);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        addSheet: { properties: { title: PROCESSED_TAB } }
      }]
    }
  });
  console.log(`[TEMP ORDERS] Onglet "${PROCESSED_TAB}" créé`);
}

// ── Écrit cart + shipping dans le sheet temporaire, identifié par orderId ──
async function saveTempOrder(orderId, cart, shipping, env) {
  const sheets = await getSheetsClient(env);
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: SHEET_RANGE,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: {
      values: [[
        orderId,
        JSON.stringify(cart),
        JSON.stringify(shipping),
        now
      ]]
    }
  });
}

// ── Récupère cart + shipping par orderId, puis supprime immédiatement la ligne ──
async function getAndDeleteTempOrder(orderId, env) {
  const sheets = await getSheetsClient(env);
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: SHEET_RANGE
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(row => row[0] === orderId);

  if (rowIndex === -1) return null;

  const [, cartJson, shippingJson] = rows[rowIndex];
  const cart     = JSON.parse(cartJson     || "[]");
  const shipping = JSON.parse(shippingJson || "{}");

  // ── Nettoyage immédiat : suppression de la ligne ──
  try {
    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetObj  = sheetMeta.data.sheets.find(s => s.properties.title === SHEET_TAB);
    const sheetId   = sheetObj ? sheetObj.properties.sheetId : 0;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });
  } catch (e) {
    console.error("[TEMP ORDERS] Échec suppression ligne:", e.message);
  }

  return { cart, shipping };
}


// ── Supprime la ligne Temp_Orders correspondant à un orderId, sans la retourner ──
async function deleteTempOrderByPaymentId(orderId, env) {
  const sheets = await getSheetsClient(env);
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: SHEET_RANGE
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(row => row[0] === orderId);
  if (rowIndex === -1) return false;

  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetObj  = sheetMeta.data.sheets.find(s => s.properties.title === SHEET_TAB);
  const sheetId   = sheetObj ? sheetObj.properties.sheetId : 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: "ROWS",
            startIndex: rowIndex,
            endIndex: rowIndex + 1
          }
        }
      }]
    }
  });
  return true;
}


// ── Vérifie si paymentId a déjà été traité (lecture fiable, onglet dédié) ──
async function isOrderAlreadyProcessed(paymentId, env) {
  const sheets = await getSheetsClient(env);
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;
  try {
    await ensureProcessedTabExists(sheets, spreadsheetId);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PROCESSED_RANGE
    });
    const rows = res.data.values || [];
    return rows.some(row => row[0] === paymentId);
  } catch (e) {
    console.error("[TEMP ORDERS] Erreur vérification doublon:", e.message);
    // En cas d'erreur de lecture, on ne bloque pas le paiement légitime,
    // mais on log clairement pour investigation.
    return false;
  }
}

// ── Marque paymentId comme traité (écriture fiable, onglet dédié) ──
async function markOrderAsProcessed(paymentId, env) {
  const sheets = await getSheetsClient(env);
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_PENDING_ORDERS;
  try {
    await ensureProcessedTabExists(sheets, spreadsheetId);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: PROCESSED_RANGE,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [[paymentId, new Date().toISOString()]]
      }
    });
    return true;
  } catch (e) {
    console.error("[TEMP ORDERS] Échec marquage doublon:", e.message);
    return false;
  }
}

module.exports = {
  saveTempOrder,
  getAndDeleteTempOrder,
  deleteTempOrderByPaymentId,
  isOrderAlreadyProcessed,
  markOrderAsProcessed
};
