// Pepper · Daily Briefing Cron
// Runs every weekday morning at 7am PT
// Calls Claude to generate briefing, posts to Slack as a DM to John

const SYSTEM_PROMPT = `You are Pepper, the Chief of Staff to John B Lin, COO of Paceline (paceline.fit). You are a trusted senior operator — not an assistant. You think ahead, protect John's time, surface what's slipping, and draft the comms and plans that keep things moving.

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

When generating a briefing, format it for Slack using these exact section headers and keep it tight — no filler, every line triggers an action or informs a decision.`;

const SLACK_BRIEFING_PROMPT = `Generate today's Daily Briefing for John. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.

Format it for Slack using Block Kit-friendly markdown. Use these exact sections:

*🔴 Needs John Today*
1–3 time-sensitive items, blocked decisions, or things at risk of slipping. Be specific. Each item on its own line starting with •

*🟡 On Deck · Next 72 hrs*
2–4 upcoming items that need prep or a decision. Each item on its own line starting with •

*📬 Comms to Review / Send*
Drafts ready, threads needing a reply, outreach to initiate. Each item on its own line starting with •

*📅 Schedule Snapshot*
Key meetings today and tomorrow. Flag any that need prep or have the ELT pre-read deadline approaching. Each item on its own line starting with •

*💡 One Proactive Suggestion*
One thing John isn't asking about but should know or act on.

Keep every bullet to 1–2 lines max. No preamble. Start directly with the first section.`;

export default async function handler(req, res) {
  // Verify this is called by Vercel cron (or allow manual trigger via GET with secret)
  const authHeader = req.headers['authorization'];
  if (
    req.method === 'GET' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    process.env.NODE_ENV !== 'development'
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Generate briefing via Claude
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
        messages: [{ role: 'user', content: SLACK_BRIEFING_PROMPT }],
      }),
    });

    const claudeData = await claudeRes.json();
    const briefingText = claudeData.content?.[0]?.text;

    if (!briefingText) {
      throw new Error('No content from Claude: ' + JSON.stringify(claudeData));
    }

    // 2. Format as Slack Block Kit message
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Pepper · Daily Briefing`,
          emoji: true,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${today}  ·  Paceline Chief of Staff`,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: briefingText,
        },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_Generated by Pepper · Reply with any task and I'll handle it_`,
          },
        ],
      },
    ];

    // 3. Post to Slack — DM to John
    // JOHN_SLACK_USER_ID should be set as an env var (your Slack member ID, e.g. U0123456789)
    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: process.env.JOHN_SLACK_USER_ID,
        blocks,
        text: `Pepper · Daily Briefing — ${today}`, // fallback for notifications
        unfurl_links: false,
      }),
    });

    const slackData = await slackRes.json();

    if (!slackData.ok) {
      throw new Error('Slack error: ' + slackData.error);
    }

    return res.status(200).json({ ok: true, ts: slackData.ts });
  } catch (err) {
    console.error('Pepper briefing error:', err);
    return res.status(500).json({ error: err.message });
  }
}
