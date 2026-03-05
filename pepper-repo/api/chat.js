export const config = { runtime: "edge" };

const ALLOWED_ORIGIN = process.env.PEPPER_URL || "*";

// ---- Google Calendar helpers ----

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
    console.error("Calendar fetch error:", err);
    return ""; // Fail silently
  }
}

// ---- Main handler ----

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { messages, system, max_tokens = 1024 } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Missing messages array" }), { status: 400 });
  }

  // Fetch live calendar context and inject into system prompt
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

  return new Response(JSON.stringify(data), {
    status: anthropicRes.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    },
  });
}
