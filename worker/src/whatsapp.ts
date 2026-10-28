import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, symlink, writeFile, lstat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type pg from "pg";

const execFileAsync = promisify(execFile);
const installTimeoutMs = 20 * 60 * 1000;
const pairTimeoutMs = 4 * 60 * 1000;
const OPENWA_VERSION = "v0.26.0";
const archiveUrl = `https://github.com/rmyndharis/OpenWA/archive/refs/tags/${OPENWA_VERSION}.tar.gz`;

let installing: Promise<void> | null = null;
let server: ReturnType<typeof spawn> | null = null;
let startLog = "";
const heldUntil = new Map<string, number>();

function holdSession(sessionId: string) {
  heldUntil.set(sessionId, Date.now() + 90_000);
}

function stillHeld(sessionId: string) {
  return (heldUntil.get(sessionId) ?? 0) > Date.now();
}

function externalOpenWA() {
  return Boolean(process.env.OPENWA_URL?.trim());
}

function toolDir() {
  return process.env.WHATSAPP_TOOL_DIR?.trim() || path.join(os.homedir(), ".2tapdoc", "openwa");
}

function codeDir() {
  return process.env.OPENWA_DIR?.trim() || path.join(toolDir(), "app");
}

function dataDir() {
  return process.env.OPENWA_DATA_DIR?.trim() || path.join(toolDir(), "data");
}

function versionFile() {
  return path.join(codeDir(), ".2tapdoc-openwa-version");
}

function openwaOrigin() {
  return (process.env.OPENWA_URL?.trim() || "http://127.0.0.1:2785").replace(/\/+$/, "");
}

function bakedInstall() {
  return Boolean(process.env.OPENWA_DIR?.trim());
}

function run(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, windowsHide: true });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-2000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-2000);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("install"));
    }, installTimeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        console.error("openwa install", output.trim().slice(-300));
        reject(new Error("install"));
      }
    });
  });
}

function installed() {
  return existsSync(path.join(codeDir(), "dist", "main.js")) && existsSync(path.join(codeDir(), "package.json"));
}

function pinnedVersion() {
  if (!existsSync(versionFile())) return "";
  try {
    return readFileSync(versionFile(), "utf8").trim();
  } catch {
    return "";
  }
}

async function linkDataDir() {
  await mkdir(dataDir(), { recursive: true });
  const link = path.join(codeDir(), "data");
  const resolvedLink = path.resolve(link);
  const resolvedData = path.resolve(dataDir());
  try {
    const stat = await lstat(link);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      if (resolvedLink === resolvedData) return;
      for (const name of await readdir(link)) {
        const from = path.join(link, name);
        const to = path.join(dataDir(), name);
        if (!existsSync(to)) await rename(from, to);
      }
      await rm(link, { recursive: true, force: true });
    }
  } catch {
    // missing
  }
  await symlink(dataDir(), link, process.platform === "win32" ? "junction" : "dir");
}

async function downloadOpenWA() {
  if (bakedInstall()) return;
  if (installed() && pinnedVersion() === OPENWA_VERSION) return;
  await mkdir(toolDir(), { recursive: true });
  const response = await fetch(archiveUrl);
  if (!response.ok) throw new Error("install");
  const archive = path.join(toolDir(), "openwa.tgz");
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const extracted = path.join(toolDir(), "extract");
  await rm(extracted, { recursive: true, force: true });
  await mkdir(extracted, { recursive: true });
  await execFileAsync("tar", ["-xzf", archive, "-C", extracted], { windowsHide: true });
  const [folder] = await readdir(extracted);
  if (!folder) throw new Error("install");
  const dir = codeDir();
  await rm(dir, { recursive: true, force: true });
  await rename(path.join(extracted, folder), dir);
  await writeFile(versionFile(), OPENWA_VERSION);
  await rm(archive, { force: true });
  await rm(extracted, { recursive: true, force: true });
}

async function installOpenWA() {
  if (bakedInstall()) {
    if (!installed()) throw new Error("install");
    await linkDataDir();
    return;
  }
  await downloadOpenWA();
  await linkDataDir();
  if (existsSync(path.join(codeDir(), "dist", "main.js"))) return;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log("installing OpenWA", OPENWA_VERSION);
  await run(npm, ["ci", "--no-audit", "--no-fund"], codeDir());
  await run(npm, ["run", "build"], codeDir());
}

function gatewayEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_TYPE;
  delete env.DATABASE_HOST;
  delete env.DATABASE_USERNAME;
  delete env.DATABASE_PASSWORD;
  delete env.DATABASE_NAME;
  env.NODE_ENV = "production";
  env.PORT = "2785";
  env.HOST = "127.0.0.1";
  env.BIND_HOST = "127.0.0.1";
  env.AUTO_START_SESSIONS = "false";
  env.SERVE_DASHBOARD = "false";
  env.ENABLE_SWAGGER = "false";
  env.CORS_ORIGINS = "http://127.0.0.1:2785";
  env.ENGINE_TYPE = "baileys";
  return env;
}

async function ensureOpenWA() {
  if (externalOpenWA()) return;
  if (!installing) {
    installing = installOpenWA().catch((error) => {
      installing = null;
      throw error;
    });
  }
  await installing;
  if (await healthy()) return;
  if (!server) {
    startLog = "";
    server = spawn(process.execPath, ["dist/main.js"], {
      cwd: codeDir(),
      env: gatewayEnv(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunk: Buffer) => {
      startLog = (startLog + chunk.toString()).slice(-4000);
    };
    server.stdout?.on("data", collect);
    server.stderr?.on("data", collect);
    server.on("exit", () => {
      server = null;
    });
  }
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (await healthy()) return;
    await sleep(1000);
  }
  console.error("openwa start", startLog.trim().slice(-500));
  throw new Error("install");
}

async function healthy() {
  try {
    const response = await fetch(`${openwaOrigin()}/api/health/live`);
    return response.ok;
  } catch {
    return false;
  }
}

async function apiKey() {
  const fromEnv = process.env.OPENWA_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const files = [path.join(dataDir(), ".api-key"), path.join(codeDir(), "data", ".api-key")];
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    for (const file of files) {
      if (existsSync(file)) return (await readFile(file, "utf8")).trim();
    }
    await sleep(500);
  }
  throw new Error("install");
}

async function callOpenWA(method: string, pathname: string, body?: unknown) {
  const response = await fetch(`${openwaOrigin()}/api${pathname}`, {
    method,
    headers: {
      "X-API-Key": await apiKey(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  return { ok: response.ok, status: response.status, payload };
}

async function openwa(method: string, pathname: string, body?: unknown) {
  await ensureOpenWA();
  const response = await callOpenWA(method, pathname, body);
  if (!response.ok) {
    const payload = response.payload;
    const message =
      payload && typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message: unknown }).message)
        : "OpenWA non ha risposto.";
    throw new Error(message.slice(0, 300));
  }
  return response.payload;
}

function stopGateway() {
  if (externalOpenWA()) return;
  const child = server;
  server = null;
  child?.kill();
}

async function parkSession(sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return;
  await callOpenWA("POST", `/sessions/${sessionId}/stop`).catch(() => undefined);
}

async function closeSession(sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return;
  await callOpenWA("POST", `/sessions/${sessionId}/logout`).catch(() => undefined);
  const deleted = await callOpenWA("DELETE", `/sessions/${sessionId}`).catch(() => undefined);
  if (deleted && deleted.status !== 404 && !deleted.ok) {
    await callOpenWA("POST", `/sessions/${sessionId}/force-kill`).catch(() => undefined);
    await callOpenWA("DELETE", `/sessions/${sessionId}`).catch(() => undefined);
  }
}

async function waitReady(sessionId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = (await openwa("GET", `/sessions/${sessionId}`)) as {
      status?: string;
      lastError?: string | null;
    };
    if (session.status === "ready") return;
    if (session.status === "failed" || session.status === "qr_ready") {
      throw new Error(session.lastError || "auth");
    }
    await sleep(1000);
  }
  throw new Error("install");
}

async function ensureSessionReady(sessionId: string) {
  holdSession(sessionId);
  await ensureOpenWA();
  const current = await callOpenWA("GET", `/sessions/${sessionId}`);
  if (!current.ok) throw new Error("WhatsApp non trovato.");
  const status = current.payload && typeof current.payload === "object" ? (current.payload as { status?: string }).status : "";
  if (status === "ready") return;
  await openwa("POST", `/sessions/${sessionId}/start`);
  await waitReady(sessionId, 45_000);
}

function sessionsFrom(payload: unknown) {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const session = row as { id?: unknown; name?: unknown };
    return [
      {
        id: typeof session.id === "string" ? session.id : "",
        name: typeof session.name === "string" ? session.name : "",
      },
    ];
  });
}

async function sessionKeys(db: pg.Client, fn: "whatsapp_stored_sessions" | "whatsapp_live_sessions") {
  const rows = await db.query<{ session_key: string }>(`select private.${fn}() as session_key`);
  return new Set(rows.rows.map((row) => row.session_key));
}

async function sweepSessions(db: pg.Client) {
  const stored = await sessionKeys(db, "whatsapp_stored_sessions");
  const live = await sessionKeys(db, "whatsapp_live_sessions");
  if (live.size > 0) {
    try {
      await ensureOpenWA();
    } catch (error) {
      console.error("openwa start", error instanceof Error ? error.message : error);
      return;
    }
  }
  if (!(await healthy())) {
    if (live.size === 0) stopGateway();
    return;
  }
  const listed = await callOpenWA("GET", "/sessions?limit=100");
  if (!listed.ok) return;
  const sessions = sessionsFrom(listed.payload);
  let engines = 0;
  for (const session of sessions) {
    if (!session.id) continue;
    const named = Boolean(session.name && live.has(session.name));
    if (live.has(session.id) || named || stillHeld(session.id)) {
      engines += 1;
      continue;
    }
    if (stored.has(session.id) || (session.name && stored.has(session.name))) {
      await parkSession(session.id);
      continue;
    }
    await closeSession(session.id);
  }
  if (live.size === 0 && engines === 0) stopGateway();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function failPairing(db: pg.Client, stateId: string, message: string) {
  await db.query("select private.fail_whatsapp_pairing($1, $2)", [stateId, message]).catch((error: unknown) => {
    console.error("whatsapp fail", error instanceof Error ? error.message : error);
  });
}

type PollClaim = {
  link_id: string;
  clinic_id: string;
  account: string;
  session: Buffer | Uint8Array;
  last_inbox: string | null;
  bot_id: string | null;
  chat_id: string | null;
};

export function startWhatsAppSupervisor(db: pg.Client, workerId: string) {
  let stopped = false;
  const loop = (async () => {
    try {
      await db.query("select private.requeue_whatsapp_pairings()");
    } catch (error) {
      console.error("whatsapp requeue", error instanceof Error ? error.message : error);
    }
    while (!stopped) {
      try {
        const claimed = await db.query<{ id: string }>("select id from private.claim_whatsapp_pairings()");
        for (const row of claimed.rows) {
          if (stopped) return;
          await runPairing(db, row.id);
        }
        const due = await db.query<PollClaim>("select * from private.claim_whatsapp_polls($1)", [1]);
        for (const row of due.rows) {
          if (stopped) return;
          await runPoll(db, workerId, row);
        }
        await sweepSessions(db);
      } catch (error) {
        console.error("whatsapp pairing", error instanceof Error ? error.message : error);
      }
      await sleep(1500);
    }
  })();
  void loop;
  return {
    stop() {
      stopped = true;
      stopGateway();
    },
  };
}

async function runPairing(db: pg.Client, stateId: string) {
  try {
    await pair(db, stateId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("whatsapp pairing failed", message);
    await failPairing(
      db,
      stateId,
      message === "install"
        ? "Non sono riuscito ad avviare OpenWA sul server."
        : message === "pair-timeout"
          ? "Nessuno ha scansionato il QR in tempo."
          : message === "auth"
            ? "WhatsApp ha rifiutato il collegamento."
            : message.slice(0, 200) || "Non sono riuscito a collegare WhatsApp.",
    );
  }
}

async function pairingActive(db: pg.Client, stateId: string) {
  try {
    const result = await db.query<{ ok: boolean }>("select private.whatsapp_pairing_active($1) as ok", [stateId]);
    return result.rows[0]?.ok === true;
  } catch (error) {
    console.error("whatsapp pairing", error instanceof Error ? error.message : error);
    return true;
  }
}

async function pair(db: pg.Client, stateId: string) {
  await ensureOpenWA();
  if (!(await pairingActive(db, stateId))) return;
  let sessionId: string | undefined;
  let linked = false;
  try {
    const created = (await openwa("POST", "/sessions", { name: stateId })) as { id?: string };
    if (!created.id) throw new Error("OpenWA non ha aperto la sessione.");
    sessionId = created.id;
    if (!(await pairingActive(db, stateId))) return;
    await openwa("POST", `/sessions/${created.id}/start`);
    const deadline = Date.now() + pairTimeoutMs;
    let sawQr = false;
    while (Date.now() < deadline) {
      if (!(await pairingActive(db, stateId))) return;
      const session = (await openwa("GET", `/sessions/${created.id}`)) as {
        status?: string;
        phone?: string | null;
        lastError?: string | null;
      };
      if (session.status === "qr_ready") {
        const qr = (await openwa("GET", `/sessions/${created.id}/qr`)) as { qrCode?: string };
        if (qr.qrCode) {
          sawQr = true;
          await db.query("select private.save_whatsapp_qr($1, $2)", [stateId, qr.qrCode]);
        }
      }
      if (session.status === "ready") {
        const account = (session.phone ?? "").replace(/\D/g, "");
        const packed = Buffer.from(JSON.stringify({ sessionId: created.id }), "utf8");
        await db.query("select private.finish_whatsapp_pairing($1, $2, $3)", [stateId, account, packed]);
        linked = true;
        await parkSession(created.id);
        console.log("whatsapp linked", stateId);
        return;
      }
      if (session.status === "failed") throw new Error(session.lastError || "auth");
      await sleep(2000);
    }
    throw new Error(sawQr ? "pair-timeout" : "install");
  } finally {
    if (sessionId && !linked && !(await pairingActive(db, stateId))) await closeSession(sessionId);
  }
}

function sessionIdFrom(session: Buffer | Uint8Array) {
  const parsed = JSON.parse(Buffer.from(session).toString("utf8")) as { sessionId?: unknown };
  if (typeof parsed.sessionId !== "string" || parsed.sessionId.length < 8) {
    throw new Error("WhatsApp non trovato.");
  }
  return parsed.sessionId;
}

async function inboxFingerprint(sessionId: string) {
  const payload = await openwa("GET", `/sessions/${sessionId}/chats?limit=30`);
  const chats = Array.isArray(payload) ? payload : [];
  const unread = chats.flatMap((chat) => {
    const row = chat as { id?: string; name?: string; unreadCount?: number };
    const count = row.unreadCount ?? 0;
    if (!row.id || count < 1) return [];
    return [`${row.id}:${count}:${(row.name || "").slice(0, 40)}`];
  });
  unread.sort();
  return { digest: unread.join("|").slice(0, 1800), unread };
}

async function runPoll(db: pg.Client, workerId: string, row: PollClaim) {
  let sessionId = "";
  try {
    sessionId = sessionIdFrom(row.session);
    await ensureSessionReady(sessionId);
    const inbox = await inboxFingerprint(sessionId);
    if (inbox.unread.length > 0 && inbox.digest !== (row.last_inbox ?? "") && row.bot_id && row.chat_id) {
      const lines = inbox.unread.slice(0, 12).map((item) => `- ${item.split(":").slice(2).join(":") || item}`);
      const prompt = [
        `Controllo WhatsApp ${row.account}: ci sono messaggi non letti.`,
        ...lines,
        "Se serve, leggi e rispondi con i tool WhatsApp. Non sei in ascolto 24 ore: è un controllo a giri.",
      ].join("\n");
      await db.query("select private.enqueue_bot_alert($1, $2, $3, $4)", [
        workerId,
        row.bot_id,
        row.chat_id,
        prompt.slice(0, 2000),
      ]);
    }
    await db.query("select private.finish_whatsapp_poll($1, $2)", [row.link_id, inbox.digest]);
    console.log("whatsapp poll", row.link_id, inbox.unread.length);
  } catch (error) {
    console.error("whatsapp poll", error instanceof Error ? error.message : error);
    await db.query("select private.finish_whatsapp_poll($1, $2)", [row.link_id, row.last_inbox ?? ""]).catch(() => undefined);
  } finally {
    if (sessionId) await parkSession(sessionId);
  }
}

export async function listWhatsAppChats(session: Buffer, _linkId: string) {
  const sessionId = sessionIdFrom(session);
  await ensureSessionReady(sessionId);
  const payload = await openwa("GET", `/sessions/${sessionId}/chats?limit=30`);
  const chats = Array.isArray(payload) ? payload : [];
  const result = chats.slice(0, 30).map((chat) => {
    const row = chat as { id?: string; name?: string; unreadCount?: number; isGroup?: boolean };
    return {
      id: row.id ?? "",
      name: row.name || row.id || "",
      unread: row.unreadCount ?? 0,
      group: Boolean(row.isGroup),
    };
  });
  return { result, session };
}

export async function readWhatsAppMessages(session: Buffer, _linkId: string, chatId: string, limit: number) {
  const sessionId = sessionIdFrom(session);
  await ensureSessionReady(sessionId);
  const payload = await openwa(
    "GET",
    `/sessions/${sessionId}/messages/${encodeURIComponent(chatId)}/history?limit=${limit}`,
  );
  const messages = Array.isArray(payload) ? payload : [];
  const result = messages.slice(-limit).map((message) => {
    const row = message as { fromMe?: boolean; body?: string | null; timestamp?: number | null };
    return {
      fromMe: Boolean(row.fromMe),
      body: (row.body ?? "").slice(0, 500),
      at: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : "",
    };
  });
  return { result, session };
}

export async function sendWhatsAppMessage(session: Buffer, _linkId: string, chatId: string, body: string) {
  const sessionId = sessionIdFrom(session);
  await ensureSessionReady(sessionId);
  await openwa("POST", `/sessions/${sessionId}/messages/send-text`, { chatId, text: body });
  return { result: { sent: true }, session };
}
