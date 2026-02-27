// api/send-briefing.js
// Vercel serverless function — runs Mon–Fri at 7:30am PST (15:30 UTC)
// Generates a Pepper briefing via Claude API and DMs John on Slack

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
- Amanda — human Chief of Staff. She prepares most materials for ELT and team digestion, arranges meetings, and sets and manages the team to OKRs. John and Nick review and edit her materials before they're sent or circulated.

Exec / Leadership Team (ELT):
- Joel, Tom, Terry, Tyler — email-first
- Nick Wright — CMO / Chief Commercial Officer. John's peer and partner in managing the Paceline team. On ELT with John. Also reviews and edits materials before they go out.

ELT materials protocol: Any substantive ELT materials must be circulated with a pre-read summary, or the materials must be sent 1 business day in advance of the scheduled meeting or presentation. When drafting or flagging prep for ELT meetings, always account for this lead time.

When generating a briefing, format it as clean Slack-friendly text (no markdown headers, use emoji section labels). Keep it tight — each line should trigger an action or inform a decision.`;

export default async function handler(req, res) {
  // Verify this is a legitimate cron request from Vercel
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/Los_Angeles'
    });

    // 1. Generate briefing via Claude API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `/briefing — Today is ${dateStr}. Generate a tight daily briefing for John. Format for Slack: use emoji bullets, plain text, no markdown headers. End with a single line: "→ Open Pepper" followed by the app URL.`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const briefingText = claudeData.content?.[0]?.text;

    if (!briefingText) {
      throw new Error('No briefing content from Claude');
    }

    // 2. Append the Pepper link
    const pepperUrl = process.env.PEPPER_URL || 'https://pepper.vercel.app';
    const slackMessage = `${briefingText}\n\n*→ <${pepperUrl}|Open Pepper>*`;

    // 3. Send Slack DM to John
    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
      },
      body: JSON.stringify({
        channel: process.env.SLACK_USER_ID, // John's Slack user ID — DMs directly to him
        text: slackMessage,
        unfurl_links: false
      })
    });

    const slackData = await slackRes.json();

    if (!slackData.ok) {
      throw new Error(`Slack error: ${slackData.error}`);
    }

    return res.status(200).json({ ok: true, ts: slackData.ts });

  } catch (err) {
    console.error('Pepper briefing error:', err);
    return res.status(500).json({ error: err.message });
  }
}
