// functions/save-reviews.js
const { google } = require('googleapis');
const { notifyReviewResponse } = require('./_lib/notify-email');
const { verifyAccountToken } = require('./_lib/account-token');
const { getGoogleAuthClient } = require('./_lib/google-auth');

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { action, fullName, email, title, rating, text, productId } = body;

    const auth = await getGoogleAuthClient(env);
    const sheets = google.sheets({ version: "v4", auth });

    const reviewsSpreadsheetId  = env.SHEET_ID_BBW4LIFE_CUSTOMERS_REVIEWS;
    const accountsSpreadsheetId = env.SHEET_ID_BBW4LIFE_ACCOUNTS;

    function formatReviewDate() {
      const d = new Date();
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${d.getFullYear()}-${monthNames[d.getMonth()]}-${d.getDate().toString().padStart(2, '0')}`;
    }

    const normalize = (str) => str ? str.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() : "";

    if (action === 'save-review') {
      if (!fullName || !email || !title || !rating || !text || !productId) throw new Error("Toutes les données sont obligatoires");
      if (!email.includes('@')) throw new Error("Email invalide");

      const date = formatReviewDate();

      const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
      const imagesCell = images.filter(Boolean).join(' | ');

      const values = [[fullName.trim(), email.trim(), title.trim(), rating, text.trim(), date, productId, imagesCell]];
      await sheets.spreadsheets.values.append({
        spreadsheetId: reviewsSpreadsheetId,
        range: "bbw4life-customers-reviews!A:H",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        resource: { values }
      });

      const accountsRes = await sheets.spreadsheets.values.get({
        spreadsheetId: accountsSpreadsheetId,
        range: "bbw4life-accounts!A:Z"
      });
      const accountsRows = accountsRes.data.values || [];

      const accountRowIndex = accountsRows.findIndex(row => normalize(row[2] || "") === normalize(email));

      if (accountRowIndex !== -1) {
        const accountRowNum = accountRowIndex + 1;
        const currentRow = accountsRows[accountRowIndex] || [];
        let currentReviewsCount = parseInt(currentRow[8] || 0);
        const newReviewsCount = currentReviewsCount + 1;

        await sheets.spreadsheets.values.update({
          spreadsheetId: accountsSpreadsheetId,
          range: `bbw4life-accounts!I${accountRowNum}`,
          valueInputOption: "RAW",
          resource: { values: [[newReviewsCount]] }
        });

        console.log(`✅ Reviews Written mis à jour pour ${email} → ${newReviewsCount}`);
      } else {
        console.log(`ℹ️ Email ${email} non trouvé dans les comptes`);
      }

      await notifyReviewResponse({
        email,
        firstName: fullName.trim().split(' ')[0],
        title,
        text,
        productId
      }, env).catch(e => console.warn('[ReviewEmail] Failed:', e.message));

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get-reviews') {
      if (!productId) throw new Error("Product ID manquant");
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: reviewsSpreadsheetId,
        range: "bbw4life-customers-reviews!A:Z"
      });
      const rows = res.data.values || [];

      const reviews = rows.slice(1)
        // row[0] (fullName) est obligatoire pour un vrai avis (voir action
        // 'save-review' ci-dessus) — exclut la ligne "compteur de likes"
        // dédiée par produit (action 'like-vote' plus bas), qui elle n'a
        // que G (productId) + I/J/K remplis, sans fullName.
        .filter(row => row[6] === productId && row[0])
        .map(row => ({
          fullName: row[0] || "",
          email:    row[1] || "",
          title:    row[2] || "",
          rating:   parseInt(row[3]) || 5,
          text:     row[4] || "",
          date:     row[5] || "",
          images:   row[7] ? row[7].split(' | ').filter(Boolean) : []
        }));

      return new Response(JSON.stringify({ success: true, reviews }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── LIKE / DISLIKE PRODUIT ─────────────────────────────────────
    // Même feuille que les avis (bbw4life-customers-reviews) — une ligne
    // dédiée par produit (identifiée par G=productId, A=fullName vide)
    // porte le compteur cumulatif, sans toucher à la colonne I existante
    // (REVIEWSWRITTEN) :
    //   J = total (likes + dislikes combinés)
    //   K = likes
    //   L = dislikes
    //   M = voters, JSON stringifié { "email_ou_anonId": "like"|"dislike" },
    //       pour permettre à un votant de changer d'avis sans compter deux fois.
    if (action === 'like-vote' || action === 'get-likes') {
      const { voteType, anonId } = body;
      const token = body.token;
      if (!productId) throw new Error("Product ID manquant");

      // Identité du votant : compte connecté (token HMAC vérifié) sinon
      // anonId généré/persisté côté client (localStorage) — jamais un
      // simple email non vérifié, contrairement à 'save-review' plus haut.
      let voterKey = null;
      if (email && token) {
        if (!verifyAccountToken(email, token, env)) {
          return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
            status: 401, headers: { 'Content-Type': 'application/json' }
          });
        }
        voterKey = normalize(email);
      } else if (anonId) {
        voterKey = String(anonId).trim();
      }
      if (!voterKey) throw new Error("Identité du votant manquante");

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: reviewsSpreadsheetId,
        range: "bbw4life-customers-reviews!A:M"
      });
      const rows = res.data.values || [];

      // La ligne "compteur likes" du produit : G=productId ET A vide.
      const likeRowIndex = rows.findIndex((row, i) => i > 0 && row[6] === productId && !row[0]);

      let likes = 0, dislikes = 0, voters = {};
      if (likeRowIndex !== -1) {
        const row = rows[likeRowIndex];
        likes    = parseInt(row[10] || 0) || 0; // K
        dislikes = parseInt(row[11] || 0) || 0; // L
        try { voters = row[12] ? JSON.parse(row[12]) : {}; } catch (e) { voters = {}; } // M
      }

      if (action === 'get-likes') {
        return new Response(JSON.stringify({ success: true, likes, dislikes, myVote: voters[voterKey] || null }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }

      // action === 'like-vote'
      if (voteType !== 'like' && voteType !== 'dislike') throw new Error("Type de vote invalide");

      const previousVote = voters[voterKey] || null;
      if (previousVote === voteType) {
        // Déjà voté pareil — pas de double comptage, renvoie l'état actuel.
        return new Response(JSON.stringify({ success: true, likes, dislikes, myVote: voteType }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
      if (previousVote === 'like') likes = Math.max(0, likes - 1);
      if (previousVote === 'dislike') dislikes = Math.max(0, dislikes - 1);
      if (voteType === 'like') likes += 1;
      if (voteType === 'dislike') dislikes += 1;
      voters[voterKey] = voteType;

      const total = likes + dislikes;

      if (likeRowIndex !== -1) {
        const rowNum = likeRowIndex + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: reviewsSpreadsheetId,
          range: `bbw4life-customers-reviews!J${rowNum}:M${rowNum}`,
          valueInputOption: "RAW",
          resource: { values: [[total, likes, dislikes, JSON.stringify(voters)]] }
        });
      } else {
        // Première interaction sur ce produit : crée la ligne compteur.
        // A-F, H, I vides (ce n'est pas un avis, I=REVIEWSWRITTEN ne
        // s'applique pas ici), G=productId, J-M remplis.
        await sheets.spreadsheets.values.append({
          spreadsheetId: reviewsSpreadsheetId,
          range: "bbw4life-customers-reviews!A:M",
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          resource: { values: [["", "", "", "", "", "", productId, "", "", total, likes, dislikes, JSON.stringify(voters)]] }
        });
      }

      return new Response(JSON.stringify({ success: true, likes, dislikes, myVote: voteType }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    throw new Error("Action inconnue");
  } catch (error) {
    console.error("REVIEWS ERROR:", error.message);
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
