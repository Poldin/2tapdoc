import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type pg from "pg";

const execFileAsync = promisify(execFile);
const installTimeoutMs = 20 * 60 * 1000;
const pairTimeoutMs = 4 * 60 * 1000;
const archiveUrl = "https://github.com/rmyndharis/OpenWA/archive/refs/heads/main.tar.gz";

let installing: Promise<void> | null = null;
let server: ReturnType<typeof spawn> | null = null;

function toolDir() {
  return process.env.WHATSAPP_TOOL_DIR?.trim() || path.join(os.tmpdir(), "2tapdoc-openwa");
}

function openwaDir() {
  return path.join(toolDir(), "openwa");
}

function openwaOrigin() {
  return (process.env.OPENWA_URL?.trim() || "http://127.0.0.1:2785").replace(/\/+$/, "");
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

async function downloadOpenWA() {
  const dir = openwaDir();
  if (existsSync(path.join(dir, "package.json"))) return;
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
  await rm(dir, { recursive: true, force: true });
  await rename(path.join(extracted, folder), dir);
  await rm(archive, { force: true });
  await rm(extracted, { recursive: true, force: true });
}

async function installOpenWA() {
  await downloadOpenWA();
  const dir = openwaDir();
  if (existsSync(path.join(dir, "dist", "main.js"))) return;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log("installing OpenWA");
  await run(npm, ["ci", "--no-audit", "--no-fund"], dir);
  await run(npm, ["run", "build"], dir);
}

async function ensureOpenWA() {
  if (process.env.OPENWA_URL?.trim()) return;
  if (!installing) {
    installing = installOpenWA().catch((error) => {
      installing = null;
      throw error;
    });
  }
  await installing;
  if (await healthy()) return;
  if (!server) {
    server = spawn(process.execPath, ["dist/main.js"], {
      cwd: openwaDir(),
      env: { ...process.env, PORT: "2785", NODE_ENV: "production" },
      windowsHide: true,
      stdio: "ignore",
    });
    server.on("exit", () => {
      server = null;
    });
  }
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (await healthy()) return;
    await sleep(1000);
  }
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
  const file = path.join(openwaDir(), "data", ".api-key");
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (existsSync(file)) return (await readFile(file, "utf8")).trim();
    await sleep(500);
  }
  throw new Error("install");
}

async function openwa(method: string, pathname: string, body?: unknown) {
  await ensureOpenWA();
  const response = await fetch(`${openwaOrigin()}/api${pathname}`, {
    method,
    headers: {
      "X-API-Key": await apiKey(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message: unknown }).message)
        : "OpenWA non ha risposto.";
    throw new Error(message.slice(0, 300));
  }
  return payload;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function failPairing(db: pg.Client, stateId: string, message: string) {
  await db.query("select private.fail_whatsapp_pairing($1, $2)", [stateId, message]).catch((error: unknown) => {
    console.error("whatsapp fail", error instanceof Error ? error.message : error);
  });
}

export function startWhatsAppSupervisor(db: pg.Client) {
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
        ? "Non sono riuscito a installare OpenWA nel server."
        : message === "pair-timeout"
          ? "Nessuno ha scansionato il QR in tempo."
          : message === "auth"
            ? "WhatsApp ha rifiutato il collegamento."
            : message.slice(0, 200) || "Non sono riuscito a collegare WhatsApp.",
    );
  }
}

async function pair(db: pg.Client, stateId: string) {
  await ensureOpenWA();
  const created = (await openwa("POST", "/sessions", { name: stateId })) as { id?: string };
  if (!created.id) throw new Error("OpenWA non ha aperto la sessione.");
  await openwa("POST", `/sessions/${created.id}/start`);
  const deadline = Date.now() + pairTimeoutMs;
  let sawQr = false;
  while (Date.now() < deadline) {
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
      console.log("whatsapp linked", stateId);
      return;
    }
    if (session.status === "failed") throw new Error(session.lastError || "auth");
    await sleep(2000);
  }
  throw new Error(sawQr ? "pair-timeout" : "install");
}

function sessionIdFrom(session: Buffer) {
  const parsed = JSON.parse(session.toString("utf8")) as { sessionId?: unknown };
  if (typeof parsed.sessionId !== "string" || parsed.sessionId.length < 8) {
    throw new Error("WhatsApp non trovato.");
  }
  return parsed.sessionId;
}

export async function listWhatsAppChats(session: Buffer, _linkId: string) {
  await ensureOpenWA();
  const payload = await openwa("GET", `/sessions/${sessionIdFrom(session)}/chats?limit=30`);
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
  await ensureOpenWA();
  const payload = await openwa(
    "GET",
    `/sessions/${sessionIdFrom(session)}/messages/${encodeURIComponent(chatId)}/history?limit=${limit}`,
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
  await ensureOpenWA();
  await openwa("POST", `/sessions/${sessionIdFrom(session)}/messages/send-text`, { chatId, text: body });
  return { result: { sent: true }, session };
}
