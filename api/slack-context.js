// Pepper · Slack Context Fetcher
// Fetches recent messages from channels John is in

export async function getSlackContext(maxChannels = 8, maxMessagesPerChannel = 20) {
  const token = process.env.SLACK_BOT_TOKEN;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  try {
    // 1. Get all public channels the bot is in
    const pubRes = await fetch('https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=200', { headers });
    const pubData = await pubRes.json();

    // 2. Get all private channels the bot is in
    const privRes = await fetch('https://slack.com/api/conversations.list?types=private_channel&exclude_archived=true&limit=200', { headers });
    const privData = await privRes.json();

    const allChannels = [
      ...(pubData.channels || []).filter(c => c.is_member),
      ...(privData.channels || []).filter(c => c.is_member),
    ];

    if (allChannels.length === 0) return 'No Slack channels accessible.';

    // Prioritize channels with recent activity, limit to maxChannels
    const channelsToFetch = allChannels.slice(0, maxChannels);

    // 3. Fetch recent messages from each channel
    const channelSummaries = await Promise.all(
      channelsToFetch.map(async (channel) => {
        try {
          const histRes = await fetch(
            `https://slack.com/api/conversations.history?channel=${channel.id}&limit=${maxMessagesPerChannel}`,
            { headers }
          );
          const histData = await histRes.json();

          if (!histData.ok || !histData.messages?.length) return null;

          // Get user info for messages (batch lookup)
          const userIds = [...new Set(histData.messages.map(m => m.user).filter(Boolean))];
          const userMap = {};
          await Promise.all(userIds.map(async (uid) => {
            try {
              const uRes = await fetch(`https://slack.com/api/users.info?user=${uid}`, { headers });
              const uData = await uRes.json();
              userMap[uid] = uData.user?.profile?.display_name || uData.user?.real_name || uid;
            } catch { userMap[uid] = uid; }
          }));

          const messages = histData.messages
            .filter(m => m.type === 'message' && m.text && !m.bot_id)
            .slice(0, maxMessagesPerChannel)
            .map(m => {
              const time = new Date(parseFloat(m.ts) * 1000).toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              });
              const name = userMap[m.user] || 'Unknown';
              return `  [${time}] ${name}: ${m.text.slice(0, 300)}`;
            })
            .join('\n');

          if (!messages) return null;

          return `#${channel.name}:\n${messages}`;
        } catch {
          return null;
        }
      })
    );

    const validSummaries = channelSummaries.filter(Boolean);
    if (validSummaries.length === 0) return 'Could not read any Slack channels.';

    return validSummaries.join('\n\n');

  } catch (err) {
    console.error('Slack context error:', err);
    return `Slack context unavailable: ${err.message}`;
  }
}
