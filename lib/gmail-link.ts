const gmailRedirectPath = "/tools/gmail/callback";

export const gmailResource = "https://gmailmcp.googleapis.com/mcp/v1";

const gmailScope = "openid email https://www.googleapis.com/auth/gmail.modify";

export function gmailOAuthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
}

export function gmailAuthorizeUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
    redirect_uri: `${origin}${gmailRedirectPath}`,
    response_type: "code",
    scope: gmailScope,
    access_type: "offline",
    prompt: "consent",
    state,
    resource: gmailResource,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(origin: string, code: string) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
    code,
    grant_type: "authorization_code",
    redirect_uri: `${origin}${gmailRedirectPath}`,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };
  if (!response.ok || !payload.access_token || !payload.refresh_token || !payload.id_token) {
    throw new Error("token");
  }
  const account = emailFromIdToken(payload.id_token);
  if (!account) throw new Error("account");
  const expiresAt = new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString();
  return { account, refreshToken: payload.refresh_token, accessToken: payload.access_token, expiresAt };
}

function emailFromIdToken(idToken: string) {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      email?: unknown;
      email_verified?: unknown;
    };
    if (claims.email_verified === false) return null;
    if (typeof claims.email !== "string") return null;
    const email = claims.email.trim().toLowerCase();
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}
