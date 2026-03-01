/**
 * Pepper Backlog Grooming Cron
 * Runs 2x daily: 9am PT and 2pm PT (Mon-Fri)
 * Sends Slack DMs to John with deep links into pepper-backlog.vercel.app
 *
 * Deploy: add this file to your pepper repo at /api/cron/backlog-groom.js
 * Add SLACK_BOT_TOKEN and SLACK_USER_ID to Vercel env vars
 * Add the cron schedule to vercel.json
 */

const BACKLOG_URL = 'https://pepper-backlog.vercel.app';
const SLACK_USER_ID = process.env.SLACK_USER_ID; // your DM channel/user ID
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// PT offset: UTC-8 in winter (before Mar DST), UTC-7 after
function getPTHour() {
  const now = new Date();
  // Check if DST is active (second Sunday of March through first Sunday of November)
  const year = now.getUTCFullYear();
  const dstStart = getNthSundayUTC(year, 2, 2); // March, 2nd Sunday
  const dstEnd = getNthSundayUTC(year, 10, 1);  // November, 1st Sunday
  const isDST = now >= dstStart && now < dstEnd;
  const offsetHours = isDST ? 7 : 8;
  return (now.getUTCHours() - offsetHours + 24) % 24;
}

function getNthSundayUTC(year, month, nth) {
  // month: 1-indexed. Find nth Sunday at 2am local (10am UTC approx)
  const d = new Date(Date.UTC(year, month - 1, 1, 10, 0, 0));
  let count = 0;
  while (count < nth) {
    if (d.getUTCDay() === 0) count++;
    if (count < nth) d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function getDayOfWeekPT() {
  const now = new Date();
  const ptHour = getPTHour();
  // Adjust day if we've rolled over midnight in PT
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const isDST = getPTHour() !== (utcHour - 8 + 24) % 24;
  const offset = isDST ? 7 : 8;
  // If UTC hour < offset, PT is still previous day
  const ptDay = utcHour < offset ? (utcDay + 6) % 7 : utcDay;
  return ptDay; // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
}

async function sendSlackDM(message) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel: SLACK_USER_ID,
      text: message,
      mrkdwn: true,
    }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data;
}

export default async function handler(req, res) {
  // Verify this is a legitimate Vercel cron call
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const ptHour = getPTHour();
    const dayOfWeek = getDayOfWeekPT();
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Skip weekends
    if (isWeekend) {
      return res.status(200).json({ skipped: true, reason: 'weekend', day: dayName });
    }

    const isMorning = ptHour >= 9 && ptHour < 10;
    const isAfternoon = ptHour >= 14 && ptHour < 15;

    if (!isMorning && !isAfternoon) {
      return res.status(200).json({
        skipped: true,
        reason: 'outside window',
        ptHour,
      });
    }

    let message;

    if (isMorning) {
      message = [
        `☀️ *Morning Briefing — ${dayName}*`,
        '',
        `Good morning. Here's your day:`,
        '',
        `📋 *Backlog Briefing* → ${BACKLOG_URL}?mode=briefing`,
        `🌿 *Morning Groom* → ${BACKLOG_URL}?mode=groom`,
        '',
        `_2 min to groom. Confirm your Do First list, clear anything stale, then go._`,
      ].join('\n');
    } else {
      const isFriday = dayOfWeek === 5;
      message = isFriday
        ? [
            `🌿 *End-of-Week Groom — Friday*`,
            '',
            `Clear anything done, park what slipped. Clean slate going into the weekend.`,
            '',
            `🌿 *Groom now* → ${BACKLOG_URL}?mode=groom`,
          ].join('\n')
        : [
            `🌿 *Afternoon Groom — ${dayName}*`,
            '',
            `Midday check-in. Your priorities may have shifted — take 2 min.`,
            '',
            `🌿 *Groom now* → ${BACKLOG_URL}?mode=groom`,
          ].join('\n');
    }

    await sendSlackDM(message);

    return res.status(200).json({
      ok: true,
      sent: isMorning ? 'morning' : 'afternoon',
      day: dayName,
      ptHour,
    });

  } catch (err) {
    console.error('Backlog cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
