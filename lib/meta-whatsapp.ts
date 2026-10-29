import { createHmac } from "crypto";

const idPattern = /^[0-9]{5,32}$/;

export type WhatsAppLink = {
  wabaId: string;
  phoneNumberId: string;
  businessId: string | null;
  displayPhone: string;
  accessToken: string;
  onBusinessApp: boolean;
};

type PhoneRow = {
  id?: unknown;
  display_phone_number?: unknown;
  is_on_biz_app?: unknown;
};

function graphVersion() {
  const value = process.env.META_GRAPH_VERSION?.trim() || "v26.0";
  return /^v\d+\.\d+$/.test(value) ? value : "v26.0";
}

function credentials() {
  const appId = process.env.META_APP_ID?.trim() ?? "";
  const secret = process.env.META_APP_SECRET?.trim() ?? "";
  if (!idPattern.test(appId) || secret.length < 8 || secret.length > 256) return null;
  return { appId, secret };
}

function proof(token: string, secret: string) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

function graphUrl(path: string, token: string, secret: string) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`);
  url.searchParams.set("appsecret_proof", proof(token, secret));
  return url;
}

async function graphGet(path: string, token: string, secret: string) {
  const response = await fetch(graphUrl(path, token, secret), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    console.error("meta graph read failed", response.status);
    return null;
  }
  return response.json().catch(() => null);
}

async function graphPost(path: string, token: string, secret: string, payload: unknown) {
  const response = await fetch(graphUrl(path, token, secret), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    console.error("meta graph write failed", response.status);
    return false;
  }
  return true;
}

function textId(value: unknown) {
  return typeof value === "string" && idPattern.test(value) ? value : "";
}

function displayPhone(value: unknown) {
  if (typeof value !== "string") return "";
  const phone = value.trim();
  return /^[0-9+() -]{1,40}$/.test(phone) ? phone : "";
}

function onBusinessApp(value: unknown) {
  return value === true || value === "true";
}

async function exchangeCode(code: string, appId: string, secret: string) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: appId, client_secret: secret, code }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
  const token = body && typeof body.access_token === "string" ? body.access_token : "";
  if (!response.ok || token.length < 20 || token.length > 8192) {
    console.error("meta code exchange failed", response.status);
    return "";
  }
  return token;
}

async function wabaIds(token: string, appId: string, secret: string, preferred: string) {
  const ids = preferred ? [preferred] : [];
  const appToken = `${appId}|${secret}`;
  const url = graphUrl("debug_token", appToken, secret);
  url.searchParams.set("input_token", token);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${appToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = (await response.json().catch(() => null)) as {
    data?: { granular_scopes?: { scope?: string; target_ids?: string[] }[] };
  } | null;
  const scopes = body?.data?.granular_scopes ?? [];
  const ordered = [
    ...scopes.filter((scope) => scope.scope?.includes("whatsapp")),
    ...scopes.filter((scope) => !scope.scope?.includes("whatsapp")),
  ];
  for (const scope of ordered) {
    for (const id of scope.target_ids ?? []) {
      if (textId(id) && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

async function phoneNumbers(wabaId: string, token: string, secret: string) {
  const rows: PhoneRow[] = [];
  let path = `${wabaId}/phone_numbers?fields=id,display_phone_number,is_on_biz_app`;
  for (let page = 0; page < 3 && path; page += 1) {
    const body = (await graphGet(path, token, secret)) as {
      data?: PhoneRow[];
      paging?: { next?: string };
    } | null;
    rows.push(...(body?.data ?? []));
    const next = body?.paging?.next;
    if (!next) break;
    try {
      const url = new URL(next);
      url.searchParams.delete("access_token");
      path = `${url.pathname.replace(/^\/v[\d.]+\//, "")}${url.search}`;
    } catch {
      break;
    }
  }
  return rows;
}

export async function linkWhatsAppNumber(input: {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId: string;
}): Promise<WhatsAppLink> {
  const meta = credentials();
  if (!meta) throw new Error("meta_config");
  const code = input.code.trim();
  if (code.length < 8 || code.length > 2000) throw new Error("meta_exchange");

  const token = await exchangeCode(code, meta.appId, meta.secret);
  if (!token) throw new Error("meta_exchange");

  const preferredPhone = textId(input.phoneNumberId);
  const accounts = await wabaIds(token, meta.appId, meta.secret, textId(input.wabaId));
  for (const wabaId of accounts) {
    const phones = await phoneNumbers(wabaId, token, meta.secret);
    const match = phones.find((phone) => textId(phone.id) === preferredPhone) ?? phones.find((phone) => displayPhone(phone.display_phone_number));
    const phoneNumberId = textId(match?.id);
    const phone = displayPhone(match?.display_phone_number);
    if (!phoneNumberId || !phone) continue;
    let businessApp = onBusinessApp(match?.is_on_biz_app);
    if (match && typeof match.is_on_biz_app === "undefined") {
      const detail = (await graphGet(`${phoneNumberId}?fields=is_on_biz_app`, token, meta.secret)) as {
        is_on_biz_app?: unknown;
      } | null;
      businessApp = onBusinessApp(detail?.is_on_biz_app);
    }
    return {
      wabaId,
      phoneNumberId,
      businessId: textId(input.businessId) || null,
      displayPhone: phone,
      accessToken: token,
      onBusinessApp: businessApp,
    };
  }
  throw new Error("meta_phone");
}

export async function readClinicWhatsApp(input: {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
}) {
  const token = input.accessToken.trim();
  const secret = input.appSecret.trim();
  const wabaId = textId(input.wabaId);
  const phoneNumberId = textId(input.phoneNumberId);
  if (!wabaId || !phoneNumberId || token.length < 20 || secret.length < 8) throw new Error("meta_phone");

  const phone = (await graphGet(`${phoneNumberId}?fields=display_phone_number`, token, secret)) as {
    display_phone_number?: unknown;
  } | null;
  const ownPhone = displayPhone(phone?.display_phone_number);
  if (!ownPhone) throw new Error("meta_phone");

  const account = (await graphGet(`${wabaId}?fields=id`, token, secret)) as { id?: unknown } | null;
  if (textId(account?.id) !== wabaId) throw new Error("meta_phone");

  const numbers = (await graphGet(`${wabaId}/phone_numbers?fields=id,display_phone_number`, token, secret)) as {
    data?: PhoneRow[];
  } | null;
  const listed = numbers?.data?.find((row) => textId(row.id) === phoneNumberId);
  if (Array.isArray(numbers?.data) && numbers.data.length > 0 && !listed) throw new Error("meta_phone");
  return displayPhone(listed?.display_phone_number) || ownPhone;
}

export async function subscribeWhatsApp(wabaId: string, token: string, appSecret?: string) {
  const secret = appSecret?.trim() || credentials()?.secret;
  if (!secret) return false;
  return graphPost(`${wabaId}/subscribed_apps`, token, secret, {});
}

export async function syncWhatsAppHistory(phoneNumberId: string, token: string) {
  const meta = credentials();
  if (!meta) return false;
  const contacts = await graphPost(`${phoneNumberId}/smb_app_data`, token, meta.secret, {
    messaging_product: "whatsapp",
    sync_type: "smb_app_state_sync",
  });
  const history = await graphPost(`${phoneNumberId}/smb_app_data`, token, meta.secret, {
    messaging_product: "whatsapp",
    sync_type: "history",
  });
  return contacts && history;
}
