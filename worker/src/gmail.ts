const endpoint = "https://gmailmcp.googleapis.com/mcp/v1";
const protocol = "2025-06-18";

export type GmailSecret = {
  refreshToken: string;
  accessToken: string | null;
  accessExpiresAt: string | null;
};

export type GmailAccess = GmailSecret & { refreshed: boolean };

type RpcBody = {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
};

export async function gmailOperation(
  secret: GmailSecret,
  operation: "list" | "call",
  name?: string,
  args?: Record<string, unknown>,
): Promise<{ result: unknown; access: GmailAccess }> {
  const access = await freshAccess(secret);
  const session = await openSession(access.accessToken!);
  const result =
    operation === "list"
      ? await listTools(access.accessToken!, session)
      : await callTool(access.accessToken!, session, name ?? "", args ?? {});
  return { result, access };
}

async function freshAccess(secret: GmailSecret): Promise<GmailAccess> {
  const expires = secret.accessExpiresAt ? new Date(secret.accessExpiresAt).getTime() : 0;
  if (secret.accessToken && expires > Date.now() + 60_000) {
    return { ...secret, refreshed: false };
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Manca il client OAuth di Gmail sulla piattaforma.");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: secret.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error("La casella Gmail non è più collegata. Va collegata di nuovo.");
  }
  return {
    refreshToken: payload.refresh_token ?? secret.refreshToken,
    accessToken: payload.access_token,
    accessExpiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString(),
    refreshed: true,
  };
}

async function openSession(token: string) {
  const opened = await postMcp(
    token,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: protocol,
        capabilities: {},
        clientInfo: { name: "2tapdoc", version: "0.1.0" },
      },
    },
    null,
  );
  const session = opened.session;
  await postMcp(token, { jsonrpc: "2.0", method: "notifications/initialized" }, session);
  return session;
}

async function listTools(token: string, session: string | null) {
  const payload = await rpc(token, session, "tools/list", {});
  const tools = Array.isArray((payload as { tools?: unknown }).tools)
    ? (payload as { tools: Array<{ name?: unknown; description?: unknown }> }).tools
    : [];
  return {
    tools: tools.slice(0, 40).map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      description: typeof item.description === "string" ? item.description.slice(0, 240) : "",
    })),
  };
}

async function callTool(token: string, session: string | null, name: string, args: Record<string, unknown>) {
  const payload = await rpc(token, session, "tools/call", { name, arguments: args });
  return clip(payload);
}

async function rpc(token: string, session: string | null, method: string, params: unknown) {
  const posted = await postMcp(token, { jsonrpc: "2.0", id: 1, method, params }, session);
  const body = posted.body as { result?: unknown; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message?.slice(0, 300) || "Gmail non ha risposto.");
  }
  return body.result ?? body;
}

async function postMcp(token: string, message: RpcBody, session: string | null) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": protocol,
  };
  if (session) headers["Mcp-Session-Id"] = session;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  const nextSession = response.headers.get("mcp-session-id") ?? session;
  if (!response.ok) {
    throw new Error(text.replace(/\s+/g, " ").slice(0, 300) || "Gmail non ha risposto.");
  }
  if (!text.trim()) return { body: {}, session: nextSession };
  return { body: parseRpc(text), session: nextSession };
}

function parseRpc(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as unknown;
  const data = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  const last = data.at(-1);
  if (!last) throw new Error("Gmail non ha risposto.");
  return JSON.parse(last) as unknown;
}

function clip(value: unknown) {
  const text = JSON.stringify(value);
  if (text.length <= 6000) return value;
  return { truncated: true, body: text.slice(0, 6000) };
}
