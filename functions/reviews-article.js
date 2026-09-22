// functions/reviews-article.js
const { google } = require('googleapis');
const { getGoogleAuthClient } = require('./_lib/google-auth');

const SHEET_NAME = 'bbw4life-reviews-article';

async function getSheets(env) {
  const auth = await getGoogleAuthClient(env);
  return google.sheets({ version: 'v4', auth });
}

// Colonnes :
// A=articleId | B=firstName | C=lastName | D=avatar | E=rating | F=reviewText | G=date | H=likes | I=shares

async function getAllRows(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:I`
  });
  return res.data.values || [];
}

async function ensureHeader(sheets, spreadsheetId) {
  const rows = await getAllRows(sheets, spreadsheetId);
  if (rows.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      resource: {
        values: [['articleId', 'firstName', 'lastName', 'avatar', 'rating', 'reviewText', 'date', 'likes', 'shares']]
      }
    });
  }
}

// Récupère toutes les reviews d'un article
function getReviewsFromRows(rows, articleId) {
  return rows
    .filter((r, i) => i > 0 && r[0] === articleId && r[1])
    .map(r => ({
      firstName: r[1] || '',
      lastName:  r[2] || '',
      avatar:    r[3] || '',
      rating:    parseInt(r[4] || '5'),
      text:      r[5] || '',
      date:      r[6] || ''
    }));
}

function getStatsFromRows(rows, articleId) {
  const articleRows = rows.filter((r, i) => i > 0 && r[0] === articleId);
  if (articleRows.length === 0) return { likes: 0, shares: 0, reviewsCount: 0 };

  const likes  = parseInt(articleRows[0][7] || '0');
  const shares = parseInt(articleRows[0][8] || '0');
  const reviewsCount = articleRows.filter(r => r[1]).length;

  return { likes, shares, reviewsCount };
}

async function updateStatsOnAllRows(sheets, spreadsheetId, rows, articleId, likes, shares) {
  const updates = [];
  rows.forEach((r, i) => {
    if (i > 0 && r[0] === articleId) {
      updates.push(
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!H${i + 1}:I${i + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[likes, shares]] }
        })
      );
    }
  });
  if (updates.length > 0) await Promise.all(updates);
}

async function appendStatsRow(sheets, spreadsheetId, articleId) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [[articleId, '', '', '', '', '', '', 0, 0]]
    }
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_CUSTOMERS_REVIEWS;

  try {
    const sheets = await getSheets(env);

    const url = new URL(request.url);
    const articleId = url.searchParams.get('articleId');
    if (!articleId) {
      return new Response(JSON.stringify({ success: false, error: 'articleId required' }), {
        status: 400, headers: CORS_HEADERS
      });
    }

    const rows    = await getAllRows(sheets, spreadsheetId);
    const stats   = getStatsFromRows(rows, articleId);
    const reviews = getReviewsFromRows(rows, articleId);

    return new Response(JSON.stringify({
      success:      true,
      likes:        stats.likes,
      shares:       stats.shares,
      reviewsCount: stats.reviewsCount,
      reviews
    }), { status: 200, headers: CORS_HEADERS });

  } catch (err) {
    console.error('reviews-article ERROR:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: CORS_HEADERS
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const spreadsheetId = env.SHEET_ID_BBW4LIFE_CUSTOMERS_REVIEWS;

  try {
    const sheets = await getSheets(env);

    const body = await request.json().catch(() => ({}));
    const { action, articleId } = body;

    if (!articleId) {
      return new Response(JSON.stringify({ success: false, error: 'articleId required' }), {
        status: 400, headers: CORS_HEADERS
      });
    }

    await ensureHeader(sheets, spreadsheetId);
    let rows  = await getAllRows(sheets, spreadsheetId);
    const stats = getStatsFromRows(rows, articleId);

    const articleExists = rows.some((r, i) => i > 0 && r[0] === articleId);
    if (!articleExists) {
      await appendStatsRow(sheets, spreadsheetId, articleId);
      rows = await getAllRows(sheets, spreadsheetId);
    }

    // ── like ─────────────────────────────────────────────────
    if (action === 'like') {
      const newLikes = stats.likes + 1;
      await updateStatsOnAllRows(sheets, spreadsheetId, rows, articleId, newLikes, stats.shares);
      return new Response(JSON.stringify({ success: true, likes: newLikes }), {
        status: 200, headers: CORS_HEADERS
      });
    }

    // ── share ────────────────────────────────────────────────
    if (action === 'share') {
      const newShares = stats.shares + 1;
      await updateStatsOnAllRows(sheets, spreadsheetId, rows, articleId, stats.likes, newShares);
      return new Response(JSON.stringify({ success: true, shares: newShares }), {
        status: 200, headers: CORS_HEADERS
      });
    }

    // ── add-review ───────────────────────────────────────────
    if (action === 'add-review') {
      const { firstName, lastName, avatar, text, rating } = body;

      if (!firstName || !lastName || !text) {
        return new Response(JSON.stringify({ success: false, error: 'firstName, lastName and text are required' }), {
          status: 400, headers: CORS_HEADERS
        });
      }

      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A:I`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [[
            articleId,
            firstName.trim(),
            lastName.trim(),
            avatar || '',
            parseInt(rating) || 5,
            text.trim(),
            date,
            stats.likes,
            stats.shares
          ]]
        }
      });

      const newReviewsCount = stats.reviewsCount + 1;

      return new Response(JSON.stringify({ success: true, reviewsCount: newReviewsCount }), {
        status: 200, headers: CORS_HEADERS
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
      status: 400, headers: CORS_HEADERS
    });

  } catch (err) {
    console.error('reviews-article ERROR:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: CORS_HEADERS
    });
  }
}
