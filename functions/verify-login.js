const { google } = require("googleapis");
const { generateAccountToken } = require('./_lib/account-token');
const { hashPassword, verifyPassword, isHashedPassword } = require('./_lib/password');

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      throw new Error("Email et mot de passe requis");
    }

    const normalize = (str) =>
      str ? str.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim() : "";

    const userEmail = normalize(email).toLowerCase();
    const userPassword = normalize(password).toLowerCase();

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = env.SHEET_ID_BBW4LIFE_ACCOUNTS;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "bbw4life-accounts!A:AF"
    });
    const rows = res.data.values || [];

    if (!rows || rows.length === 0) throw new Error("Impossible de lire le Google Sheet");

    const rowIndex = rows.findIndex((row) => (row[2] || "").toLowerCase() === userEmail);
    const userRow  = rowIndex !== -1 ? rows[rowIndex] : null;

    let passwordMatches = false;
    if (userRow) {
      const storedPassword = (userRow[4] || "").trim();

      if (isHashedPassword(storedPassword)) {
        // ── Compte déjà migré : vérification via scrypt ──
        passwordMatches = verifyPassword(userPassword, storedPassword);
      } else {
        // ── Ancien compte en clair : comparaison directe (comportement historique) ──
        passwordMatches = storedPassword.toLowerCase() === userPassword;

        // Migration progressive et transparente : on hash immédiatement si le mot de
        // passe en clair est correct, sans jamais casser le compte existant.
        if (passwordMatches) {
          try {
            const newHash = hashPassword(userPassword);
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `bbw4life-accounts!E${rowIndex + 1}`,
              valueInputOption: "RAW",
              resource: { values: [[newHash]] }
            });
          } catch (e) {
            console.warn("[verify-login] Password migration to hash failed:", e.message);
          }
        }
      }
    }

    if (!userRow || !passwordMatches) {
      console.log("❌ No user found with this email/password");
      return new Response(JSON.stringify({ success: false, error: "Incorrect email or password" }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }
    // ── Block if account is not confirmed (column AF) ──
    const emailConfirmed = (userRow[31] || '').toLowerCase().trim();
    if (emailConfirmed !== 'yes') {
      return new Response(JSON.stringify({ success: false, error: "EMAIL_NOT_CONFIRMED" }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }
    const user = {
      lastName:     userRow[0]  || "",
      firstName:    userRow[1]  || "",
      email:        userRow[2]  || "",
      phone:        userRow[3]  || "",
      addressLine1: userRow[9]  || "",
      line2:        userRow[10] || "",
      city:         userRow[11] || "",
      state:        userRow[12] || "",
      zip:          userRow[13] || ""
    };

    // ── Génère un token lié à cet email pour sécuriser les futures requêtes ──
    const token = generateAccountToken(user.email, env);

    // Mêmes champs que save-account.js action=get-stats, lus depuis la même
    // ligne déjà chargée en mémoire ci-dessus (pas de 2e appel Sheets) — le
    // front (script.js:__bbwRestoreSavedCart) peut ainsi restaurer le panier
    // directement depuis cette réponse au lieu de refaire un fetch séparé
    // vers save-account.js juste après. Champ "stats" optionnel et additif :
    // ne change rien pour un appelant qui l'ignore (comportement identique
    // à avant pour tout le reste de cette réponse).
    const stats = {
      savedCart: userRow[28] || "[]"
    };

    return new Response(JSON.stringify({ success: true, user, token, stats }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("VERIFY LOGIN ERROR:", error.message);
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
