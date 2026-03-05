export const config = { runtime: "edge" };

const ALLOWED_ORIGIN = process.env.PEPPER_URL || "*";

const MCP_SERVERS = [
  { type: "url", url: "https://gcal.mcp.claude.com/mcp",  name: "google-calendar" },
  { type: "url", url: "https://mcp.slack.com/mcp",         name: "slack"           },
  { type: "url", url: "https://mcp.notion.com/mcp",        name: "notion"          },
];

export default async function handler(req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, system, max_tokens = 1024 } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response("Missing messages array", { status: 400 });
  }

  const anthropicBody = {
    model: "claude-sonnet-4-20250514",
    max_tokens,
    messages,
    ...(system ? { system } : {}),
    mcp_servers: MCP_SERVERS,
  };

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mcp-client-2025-04-04",
    },
    body: JSON.stringify(anthropicBody),
  });

  const data = await upstream.json();

  return new Response(JSON.stringify(data), {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    },
  });
}
