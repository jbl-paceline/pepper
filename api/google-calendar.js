// Pepper - Google Calendar Context Fetcher

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

export async function getCalendarContext(daysAhead = 3) {
  try {
    const accessToken = await getAccessToken();

    const now = new Date();
    const end = new Date();
    end.setDate(end.getDate() + daysAhead);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '20',
    });

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();
    if (!data.items) throw new Error('No calendar data: ' + JSON.stringify(data));

    if (data.items.length === 0) return 'No upcoming events in the next ' + daysAhead + ' days.';

    const events = data.items.map(event => {
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;

      const startDate = new Date(start);
      const timeStr = event.start?.dateTime
        ? startDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
        : startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });

      const duration = event.start?.dateTime && event.end?.dateTime
        ? Math.round((new Date(end) - new Date(start)) / 60000) + ' min'
        : 'all day';

      const attendees = event.attendees
        ? event.attendees.filter(a => !a.self).map(a => a.displayName || a.email).slice(0, 5).join(', ')
        : '';

      const location = event.location ? ` · ${event.location}` : '';
      const attendeeStr = attendees ? ` · with ${attendees}` : '';
      const desc = event.description ? ` · ${event.description.slice(0, 100)}` : '';

      return `${timeStr} (${duration}) — ${event.summary || 'Untitled'}${attendeeStr}${location}`;
    });

    return events.join('\n');

  } catch (err) {
    console.error('Calendar context error:', err);
    return `Calendar unavailable: ${err.message}`;
  }
}
