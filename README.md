# Pepper · Paceline Chief of Staff

Daily briefing bot. Fires every weekday at 7am PT, generates a briefing via Claude, and DMs John on Slack.

---

## Setup

### 1. Vercel Environment Variables

Add these in **Vercel → Paceline Product → Settings → Environment Variables**:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (from console.anthropic.com) |
| `SLACK_BOT_TOKEN` | Bot token from api.slack.com (starts with `xoxb-`) |
| `JOHN_SLACK_USER_ID` | Your Slack member ID — see instructions below |
| `CRON_SECRET` | Any random string — used to manually trigger the briefing |

### 2. Find Your Slack Member ID

1. Open Slack → click your profile picture → **Profile**
2. Click the **⋮** (three dots) menu → **Copy member ID**
3. It looks like `U0123456789` — paste that as `JOHN_SLACK_USER_ID`

### 3. Slack App Permissions

Make sure your Slack bot has these scopes in **OAuth & Permissions**:
- `chat:write`
- `im:write` (to open DM channels)

If the bot can't DM you, go to the bot's App Home in Slack and send it a message first — this opens the DM channel.

### 4. Deploy

```bash
git clone https://github.com/jbl-paceline/pepper.git
cd pepper
# Push to GitHub — Vercel auto-deploys from main
git push origin main
```

### 5. Test manually

Once deployed, trigger the briefing manually:

```
GET https://your-vercel-url.vercel.app/api/briefing
Authorization: Bearer YOUR_CRON_SECRET
```

Or just visit the URL in your browser after adding the auth header via a tool like Postman or curl:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-vercel-url.vercel.app/api/briefing
```

---

## Schedule

Cron fires at `0 15 * * 1-5` = **7am PT, Monday–Friday**.

To change the time, edit `vercel.json`. Vercel crons run in UTC:
- 7am PT = `0 15 * * 1-5`  
- 8am PT = `0 16 * * 1-5`

---

## Files

```
pepper/
├── api/
│   └── briefing.js      # Cron function — generates + sends briefing
├── vercel.json          # Cron schedule config
├── package.json
└── README.md
```
