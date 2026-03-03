// Pepper - Google OAuth Callback

export default async function handler(req, res) {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`Auth error: ${error}`);
  if (!code) return res.status(400).send('No auth code received.');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) return res.status(400).send(`Token error: ${tokens.error}`);

    return res.status(200).send(`<html><body style="font-family:monospace;padding:40px;background:#0a0a0a;color:#f5f2ec;">
      <h2 style="color:#e8440a;">Pepper - Google Auth Success</h2>
      <p>Add this to Vercel as <strong>GOOGLE_REFRESH_TOKEN</strong>:</p>
      <textarea style="width:100%;height:80px;background:#1a1a1a;color:#34d399;border:1px solid #333;padding:12px;font-size:13px;">${tokens.refresh_token}</textarea>
      <p style="color:#7a7570;margin-top:16px;">Done. You only need to do this once.</p>
    </body></html>`);
  } catch (err) {
    return res.status(500).send(`Error: ${err.message}`);
  }
}
