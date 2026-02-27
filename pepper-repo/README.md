# Pepper · Paceline Chief of Staff

Pepper is John's AI Chief of Staff. Every weekday at 7:30am PST, she sends a Daily Briefing as a Slack DM with a link to the full interactive app.

---

## What's in this repo

```
pepper-repo/
├── public/
│   └── index.html          ← The Pepper web app (briefing + chat)
├── api/
│   └── send-briefing.js    ← Serverless function: generates briefing, DMs John on Slack
├── vercel.json             ← Cron schedule (Mon–Fri, 7:30am PST)
├── .env.example            ← All required environment variables
└── README.md
```

---

## Setup — follow these steps in order

### Step 1 — Create a Slack App (~5 min)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it `Pepper`, pick your Paceline workspace
3. In the left sidebar: **OAuth & Permissions**
4. Under **Bot Token Scopes**, add: `chat:write`
5. Click **Install to Workspace** → Authorize
6. Copy the **Bot User OAuth Token** (starts with `xoxb-`) — this is your `SLACK_BOT_TOKEN`
7. Find your own Slack user ID: in Slack, click your profile photo → **Profile** → three-dot menu → **Copy member ID** — this is your `SLACK_USER_ID`

> The bot will DM you directly using your user ID as the channel. No need to add it to any channel.

---

### Step 2 — Get your keys

- **Anthropic API key**: [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key
- **CRON_SECRET**: Run `openssl rand -hex 32` in your terminal (or use any random string)

---

### Step 3 — Push to GitHub

```bash
cd pepper-repo
git init
git add .
git commit -m "init pepper"
gh repo create pepper --private --push --source=.
# or manually create a repo on github.com and push
```

---

### Step 4 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `pepper` GitHub repo
3. **Framework Preset**: Other
4. **Root Directory**: leave as `/` (default)
5. Click **Deploy** — it'll build and give you a URL like `pepper-abc123.vercel.app`

---

### Step 5 — Add Environment Variables in Vercel

In your Vercel project: **Settings → Environment Variables** → add each of these:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `SLACK_BOT_TOKEN` | `xoxb-...` from Step 1 |
| `SLACK_USER_ID` | Your Slack member ID from Step 1 |
| `PEPPER_URL` | Your Vercel URL from Step 4 (e.g. `https://pepper-abc123.vercel.app`) |
| `CRON_SECRET` | Your random secret from Step 2 |

After adding variables: **Deployments → Redeploy** (so the function picks them up).

---

### Step 6 — Add your Anthropic API key to the frontend

The Pepper web app (`public/index.html`) calls the Anthropic API directly from the browser. For this to work, you'll need to either:

**Option A (quick):** Open `public/index.html`, find the two `fetch("https://api.anthropic.com/v1/messages"` calls, and add your API key to the headers:
```js
headers: {
  "Content-Type": "application/json",
  "x-api-key": "sk-ant-YOUR_KEY_HERE",   // ← add this line
  "anthropic-version": "2023-06-01"
}
```

**Option B (more secure):** Create a second API route (`api/chat.js`) that proxies requests to Claude, so the key stays server-side. Let me know if you want this built out.

---

### Step 7 — Test it

Trigger the cron manually to confirm everything works:

```bash
curl -X GET https://your-project.vercel.app/api/send-briefing \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

You should get a Slack DM from Pepper within a few seconds.

---

## Schedule

The cron runs **Mon–Fri at 15:30 UTC = 7:30am PST**.

To change the time, edit `vercel.json`:
```json
"schedule": "30 15 * * 1-5"
```
Use [crontab.guru](https://crontab.guru) to build a new expression.

---

## Updating Pepper's context

When you want to add new information to what Pepper knows (new team members, priorities, protocols), update the `SYSTEM_PROMPT` in two places:
- `api/send-briefing.js` — for the morning Slack briefing
- `public/index.html` — for the interactive web app (search for `const SYSTEM_PROMPT`)

Both should stay in sync.
