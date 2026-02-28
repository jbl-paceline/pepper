// Pepper · Slack Chat Handler
// Receives DMs and @mentions, responds via Claude

const SYSTEM_PROMPT = `You are Pepper, the Chief of Staff to John B Lin, COO of Paceline (paceline.fit). You are a trusted senior operator — not an assistant. You think ahead, protect John's time, surface what's slipping, and draft the comms and plans that keep things moving.

You are responding via Slack. Keep responses appropriately concise for Slack — use formatting, bullets, and line breaks naturally. For drafts (Slack messages, emails), present them ready-to-use. For recommendations, be direct and specific.

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

// In-memory conversation store (resets on cold start — good enough for now)
const conversations = {};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  // Slack URL verification challenge
  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  // Only handle message events
  if (body.type !== 'event_callback') {
    return res.status(200).json({ ok: true });
  }

  const event = body.event;

  // Ignore bot messages (including Pepper's own replies) to avoid loops
  if (event.bot_id || event.subtype === 'bot_message') {
    return res.status(200).json({ ok: true });
  }

  // Handle DMs and @mentions in channels
  const isDM = event.channel_type === 'im';
  const isMention = event.type === 'app_mention';

  if (!isDM && !isMention) {
    return res.status(200).json({ ok: true });
  }

  // Respond immediately to avoid Slack timeout, then process
  res.status(200).json({ ok: true });

  // Strip the @mention from the message text if present
  const botUserId = process.env.SLACK_BOT_USER_ID || '';
  const text = (event.text || '').replace(`<@${botUserId}>`, '').trim();

  if (!text) return;

  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;
  const conversationKey = `${channelId}:${threadTs}`;

  // Build conversation history
  if (!conversations[conversationKey]) {
    conversations[conversationKey] = [];
  }

  conversations[conversationKey].push({
    role: 'user',
    content: text,
  });

  // Keep last 20 messages to stay within context limits
  if (conversations[conversationKey].length > 20) {
    conversations[conversationKey] = conversations[conversationKey].slice(-20);
  }

  try {
    // Call Claude
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

    if (!reply) throw new Error('No response from Claude');

    // Store Pepper's reply in history
    conversations[conversationKey].push({
      role: 'assistant',
      content: reply,
    });

    // Post reply to Slack — in thread if it was a thread, otherwise start one
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: channelId,
        thread_ts: threadTs,
        text: reply,
        unfurl_links: false,
      }),
    });

  } catch (err) {
    console.error('Pepper chat error:', err);

    // Post error message to Slack so John knows something went wrong
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: channelId,
        thread_ts: threadTs,
        text: `_Something went wrong on my end — try again in a moment._`,
      }),
    });
  }
}
