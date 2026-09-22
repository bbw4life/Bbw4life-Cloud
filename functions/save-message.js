// functions/save-message.js
const { google } = require('googleapis');
const { notifyTelegram } = require('./_lib/notify-telegram');
const { notifyContactReply } = require('./_lib/notify-email');
const { getGoogleAuthClient } = require('./_lib/google-auth');

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { firstName, lastName, email, subject, category, message } = body;

        if (!firstName || !lastName || !email || !subject || !message) {
            throw new Error("All fields are required");
        }

        const normalize = (str) => str ? str.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() : "";

        const auth = await getGoogleAuthClient(env);

        const sheets = google.sheets({ version: "v4", auth });
        const spreadsheetId = env.SHEET_ID_BBW4LIFE_ACCOUNTS;

        function formatDate() {
            const d = new Date();
            return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear().toString().slice(-2)}`;
        }

        const values = [[
            normalize(firstName),
            normalize(lastName),
            normalize(email),
            subject,
            category || "N/A",
            message,
            formatDate()
        ]];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: "bbw4life-contact-messages!A:G",
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: { values }
        });

        await notifyTelegram(
        `📩 <b>Pdg Francenel, un client vient de vous envoyer un message depuis la page contact!</b>\n\n` +
        `👤 <b>Nom:</b> ${firstName} ${lastName}\n` +
        `📧 <b>Email:</b> ${email}\n` +
        `📌 <b>Sujet:</b> ${subject}\n` +
        `🗂️ <b>Catégorie:</b> ${category || 'N/A'}`,
        env
        );

        // ── Email Contact Auto-Reply ──
        await notifyContactReply({ email, firstName, lastName, subject, category: category || 'N/A' }, env)
            .catch(e => console.error('[save-message] notifyContactReply failed:', e.message));

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error("SAVE MESSAGE ERROR:", error.message);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function onRequestGet() {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
    });
}
