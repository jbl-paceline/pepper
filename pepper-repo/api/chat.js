const ALLOWED_ORIGIN = process.env.PEPPER_URL || "*";

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function getCalendarContext() {
  try {
    const token = await getAccessToken();
    console.log("GCal token fetch result:", token ? "got token" : "NO TOKEN");
    
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true&orderBy=startTime&maxResults=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    console.log("GCal API status:", res.status, "items:", data.items?.length, "error:", data.error?.message);
    if (!data.items?.length) return "No upcoming calendar events found.";

    const lines = data.items.map(e => {
      const start = e.start?.dateTime || e.start?.date || "TBD";
      const startDate = new Date(start).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles"
      });
      return `- ${startDate}: ${e.summary || "(No title)"}${e.location ? ` @ ${e.location}` : ""}`;
    });
    return `Upcoming calendar events (next 7 days, PT):\n${lines.join("\n")}`;
  } catch (err) {
    console.error("Calendar fetch error:", err.message, err.stack);
    return "";
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

let parsedBody;
try {
  const raw = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
  parsedBody = JSON.parse(raw);
} catch {
  return res.status(400).json({ error: "Invalid JSON" });
}
const { messages, system, max_tokens = 1024 } = parsedBody;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing messages array" });
  }

  const calendarContext = await getCalendarContext();
  const enrichedSystem = calendarContext
    ? `${system || ""}\n\n--- LIVE CONTEXT ---\n${calendarContext}`
    : (system || "");

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens,
      messages,
      system: enrichedSystem,
    }),
  });

  const data = await anthropicRes.json();
  return res.status(anthropicRes.status).json(data);
}
