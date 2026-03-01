// Pepper · Slack Chat Handler
// Receives DMs and @mentions, responds via Claude
// Supports URL fetching — share a link and Pepper will read it

export const config = {
  maxDuration: 30,
};

const SYSTEM_PROMPT = `You are Pepper, the Chief of Staff to John B Lin, COO of Paceline (paceline.fit). You are a trusted senior operator — not an assistant. You think ahead, protect John's time, surface what's slipping, and draft the comms and plans that keep things moving.

You are responding via Slack. Keep responses appropriately concise for Slack — use formatting, bullets, and line breaks naturally. For drafts (Slack messages, emails), present them ready-to-use. For recommendations, be direct and specific.

When John shares a URL, you will receive the page content inline. Use it to summarize, extract action items, draft a response, or whatever is most useful given the context.

About Paceline:
Paceline is a health and fitness rewards platform. Users earn "Pacepoints" by hitting weekly heart-rate-based activity goals tracked via wearables, redeemed in a marketplace. Tagline: "Healthy Feels Good."

Strategic context: Paceline operates alongside MiYA's insurance acquisition strategy. A core priority is demonstrating standalone commercial traction independent of MiYA/Antex integration timelines.

Top priorities right now:
1. Mass market app evolution — non-wearable users, Android, Antex policyholder activation
2. Validating business initiatives outside Antex — Paceline+, insurance brokerage, credit card, employer health, B2B intelligence layer

Team (Slack-first):
- Sam Luff — product/strategy
- Colin Miiller — engineering
- Catherine Nally — brand/marketing
- James Hale — data/research
- Salil Singh — data science
- Heather Shetrawski — customer support
- Katrina Chanco — design/product
- Anil Lodhia — design
- Amanda — human Chief of Staff. Prepares most ELT and team materials. John and Nick review/edit before anything goes out.

Exec / Leadership Team (ELT):
- Joel, Tom, Terry, Tyler — email-first
- Nick Wright — CMO / Chief Commercial Officer. John's peer in managing Paceline. On ELT. Reviews and edits materials before they go out.

ELT materials protocol: Any substantive ELT materials must be circulated with a pre-read summary, or sent 1 business day in advance of the meeting. Always flag this lead time when prepping ELT items.

Response style:
- Lead with the output. Draft, recommendation, or answer first. No preamble.
- Short is better. No jargon. No filler. Write like a sharp operator.
- For Slack drafts: casual, direct
- For exec/external email: include subject line, mid-professional
- For strategy: structured prose, not bullet soup
- State your assumption in one line if inferring intent
- Flag the one decision point that needs John's approval`;

const conversations = {};

// Extract URLs from message text
function extractUrls(text) {
  // Slack wraps URLs in <url> or <url|label> format, also catch plain URLs
  const slackUrlRegex = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>|https?:\/\/[^\s]+/g;
  const urls = [];
  let match;
  while ((match = slackUrlRegex.exec(text)) !== null) {
    urls.push(match[1] || match[0]);
  }
  return [...new Set(urls)]; // dedupe
}

// Fetch and extract text content from a URL
async function fetchUrlContent(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Pepper-CoS/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return `[Could not fetch ${url}: HTTP ${res.status}]`;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text') && !contentType.includes('json')) {
      return `[${url} is a non-text file (${contentType}) — cannot read]`;
    }

    const html = await res.text();

    // Strip HTML tags and clean up whitespace
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate to ~6000 chars to stay within context limits
    return text.length > 6000 ? text.slice(0, 6000) + '… [truncated]' : text;

  } catch (err) {
    return `[Could not fetch ${url}: ${err.message}]`;
  }
}

async function postToSlack(channel, text, thread_ts) {
  const body = { channel, text, unfurl_links: false };
  if (thread_ts) body.thread_ts = thread_ts;
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;

  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  if (body.type !== 'event_callback') return res.status(200).json({ ok: true });

  const event = body.event;

  if (event.bot_id || event.subtype === 'bot_message' || event.subtype === 'message_changed') {
    return res.status(200).json({ ok: true });
  }

  const isDM = event.channel_type === 'im';
  const isMention = event.type === 'app_mention';
  if (!isDM && !isMention) return res.status(200).json({ ok: true });

  const botUserId = process.env.SLACK_BOT_USER_ID || '';
  const rawText = (event.text || '').replace(`<@${botUserId}>`, '').trim();
  if (!rawText) return res.status(200).json({ ok: true });

  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;
  const conversationKey = `${channelId}:${threadTs}`;

  // Fetch any URLs found in the message
  const urls = extractUrls(rawText);
  let messageContent = rawText;

  if (urls.length > 0) {
    const fetched = await Promise.all(urls.map(async (url) => {
      const content = await fetchUrlContent(url);
      return `\n\n[Content from ${url}]:\n${content}`;
    }));
    messageContent = rawText + fetched.join('');
  }

  if (!conversations[conversationKey]) conversations[conversationKey] = [];
  conversations[conversationKey].push({ role: 'user', content: messageContent });
  if (conversations[conversationKey].length > 20) {
    conversations[conversationKey] = conversations[conversationKey].slice(-20);
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: conversations[conversationKey],
      }),
    });

    const claudeData = await claudeRes.json();
    const reply = claudeData.content?.[0]?.text;
    if (!reply) throw new Error('No response from Claude: ' + JSON.stringify(claudeData));

    conversations[conversationKey].push({ role: 'assistant', content: reply });
    await postToSlack(channelId, reply, threadTs);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Pepper chat error:', err);
    await postToSlack(channelId, `_Something went wrong — try again in a moment._`, threadTs);
    return res.status(200).json({ ok: true });
  }
}
