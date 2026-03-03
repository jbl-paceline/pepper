// Pepper - Gmail Context Fetcher
// Pulls recent unread and important threads for briefing context

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

function decodeBase64(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (payload.body?.data) return decodeBase64(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64(part.body.data)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
  }
  return '';
}

export async function getGmailContext(maxThreads = 10) {
  try {
    const accessToken = await getAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Fetch recent unread threads + threads with ELT members
    const query = 'is:unread OR from:joel OR from:tom OR from:terry OR from:tyler OR from:nick';
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(query)}&maxResults=${maxThreads}`,
      { headers }
    );
    const listData = await listRes.json();

    if (!listData.threads?.length) return 'No recent unread email threads.';

    const threads = await Promise.all(
      listData.threads.slice(0, maxThreads).map(async (thread) => {
        try {
          const threadRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=full`,
            { headers }
          );
          const threadData = await threadRes.json();
          const messages = threadData.messages || [];
          if (!messages.length) return null;

          // Get subject from first message
          const firstMsg = messages[0];
          const subject = firstMsg.payload?.headers?.find(h => h.name === 'Subject')?.value || '(no subject)';
          const from = firstMsg.payload?.headers?.find(h => h.name === 'From')?.value || '';
          const date = firstMsg.payload?.headers?.find(h => h.name === 'Date')?.value || '';

          // Get latest message body
          const lastMsg = messages[messages.length - 1];
          const lastFrom = lastMsg.payload?.headers?.find(h => h.name === 'From')?.value || '';
          const body = extractBody(lastMsg.payload || {}).slice(0, 400);

          const isUnread = firstMsg.labelIds?.includes('UNREAD');
          const unreadFlag = isUnread ? '[UNREAD] ' : '';
          const replyCount = messages.length > 1 ? ` (${messages.length} messages)` : '';

          return `${unreadFlag}Subject: ${subject}${replyCount}\nFrom: ${from}\nLatest reply from: ${lastFrom}\n${body}`;
        } catch {
          return null;
        }
      })
    );

    const valid = threads.filter(Boolean);
    if (!valid.length) return 'No readable email threads found.';

    return valid.join('\n\n---\n\n');

  } catch (err) {
    console.error('Gmail context error:', err);
    return `Gmail unavailable: ${err.message}`;
  }
}
