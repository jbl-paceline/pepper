export default async function handler(req, res) {
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(500).json({ error: "No token", tokenData });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=5&timeMin=${new Date().toISOString()}`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const calData = await calRes.json();
    return res.status(200).json({ ok: true, eventCount: calData.items?.length, events: calData.items?.map(e => e.summary), error: calData.error });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
