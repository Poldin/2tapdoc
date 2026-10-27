import { spawn, execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type pg from "pg";

const execFileAsync = promisify(execFile);
const installTimeoutMs = 5 * 60 * 1000;
const pairTimeoutMs = 4 * 60 * 1000;
const useTimeoutMs = 40_000;

type WaMessage = {
  body: string;
  fromMe: boolean;
  timestamp: number;
};

type WaChat = {
  id: { _serialized: string; user: string };
  name: string;
  unreadCount: number;
  isGroup: boolean;
  fetchMessages: (options: { limit: number }) => Promise<WaMessage[]>;
};

type WaClient = {
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  info?: { wid?: { user?: string } };
  getChats: () => Promise<WaChat[]>;
  getChatById: (id: string) => Promise<WaChat>;
  sendMessage: (to: string, body: string) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

type WaLibrary = {
  Client: new (options: {
    authStrategy: unknown;
    puppeteer: { headless: boolean; args: string[] };
  }) => WaClient;
  LocalAuth: new (options: { clientId: string; dataPath: string }) => unknown;
};

let installing: Promise<void> | null = null;
let held = false;

function toolDir() {
  return process.env.WHATSAPP_TOOL_DIR?.trim() || path.join(os.tmpdir(), "2tapdoc-wwebjs");
}

function run(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });
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
        console.error("whatsapp install", output.trim().slice(-300));
        reject(new Error("install"));
      }
    });
  });
}

async function ensureInstalled() {
  if (!installing) {
    installing = installPackage().catch((error) => {
      installing = null;
      throw error;
    });
  }
  await installing;
}

async function installPackage() {
  const dir = toolDir();
  await mkdir(dir, { recursive: true });
  process.env.PUPPETEER_CACHE_DIR ??= path.join(dir, "puppeteer");
  const pkg = path.join(dir, "node_modules", "whatsapp-web.js", "package.json");
  if (existsSync(pkg)) return;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (!existsSync(path.join(dir, "package.json"))) {
    await run(npm, ["init", "-y"], dir);
  }
  console.log("installing whatsapp-web.js");
  await run(npm, ["install", "whatsapp-web.js@1.34.7", "--omit=dev", "--no-audit", "--no-fund"], dir);
}

async function loadLibrary() {
  await ensureInstalled();
  const require = createRequire(path.join(toolDir(), "package.json"));
  return require("whatsapp-web.js") as WaLibrary;
}

async function exclusive<T>(task: () => Promise<T>) {
  if (held) throw new Error("WhatsApp è occupato nel server. Riprova tra poco.");
  held = true;
  try {
    return await task();
  } finally {
    held = false;
  }
}

function browserArgs() {
  return ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
}

function launch(wa: WaClient, timeoutMs: number, onQr?: (qr: string) => void) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error("pair-timeout")), timeoutMs);
    wa.on("qr", (qr) => {
      if (typeof qr === "string" && onQr) onQr(qr);
    });
    wa.on("ready", () => finish());
    wa.on("auth_failure", () => finish(new Error("auth")));
    void wa.initialize().catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error("start"));
    });
  });
}

async function packDir(dir: string) {
  const { stdout } = await execFileAsync("tar", ["-czf", "-", "-C", dir, "."], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout as Buffer;
}

async function unpack(session: Buffer, dir: string) {
  const archive = path.join(toolDir(), `session-${Date.now()}.tgz`);
  await writeFile(archive, session);
  try {
    await execFileAsync("tar", ["-xzf", archive, "-C", dir], { windowsHide: true });
  } finally {
    await rm(archive, { force: true });
  }
}

function phoneFrom(client: WaClient) {
  const raw = client.info?.wid?.user ?? "";
  return raw.split(":")[0].replace(/\D/g, "");
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
      await new Promise((resolve) => setTimeout(resolve, 1500));
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
    await exclusive(() => pair(db, stateId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("occupato")) {
      await db.query("select private.release_whatsapp_pairing($1)", [stateId]).catch(() => undefined);
      return;
    }
    console.error("whatsapp pairing failed", message);
    await failPairing(db, stateId, "Non sono riuscito a collegare WhatsApp.");
  }
}

async function pair(db: pg.Client, stateId: string) {
  let wa: WaClient | null = null;
  const dataPath = path.join(toolDir(), "sessions");
  const sessionDir = path.join(dataPath, `session-${stateId}`);
  try {
    const lib = await loadLibrary();
    await mkdir(dataPath, { recursive: true });
    await rm(sessionDir, { recursive: true, force: true });
    wa = new lib.Client({
      authStrategy: new lib.LocalAuth({ clientId: stateId, dataPath }),
      puppeteer: { headless: true, args: browserArgs() },
    });
    let qrChain: Promise<void> = Promise.resolve();
    await launch(wa, pairTimeoutMs, (qr) => {
      qrChain = qrChain.then(() =>
        db.query("select private.save_whatsapp_qr($1, $2)", [stateId, qr]).then(
          () => undefined,
          (error: unknown) => {
            console.error("whatsapp qr", error instanceof Error ? error.message : error);
          },
        ),
      );
    });
    await qrChain;
    const account = phoneFrom(wa);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const session = await packDir(sessionDir);
    await db.query("select private.finish_whatsapp_pairing($1, $2, $3)", [stateId, account, session]);
    console.log("whatsapp linked", stateId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("whatsapp pair", message);
    const publicMessage =
      message === "pair-timeout"
        ? "Nessuno ha scansionato il QR in tempo."
        : message === "auth"
          ? "WhatsApp ha rifiutato il collegamento."
          : message === "install"
            ? "Non sono riuscito a installare WhatsApp nel server."
            : "Non sono riuscito a collegare WhatsApp.";
    await failPairing(db, stateId, publicMessage);
  } finally {
    await wa?.destroy().catch(() => undefined);
    await rm(sessionDir, { recursive: true, force: true });
  }
}

export async function withWhatsApp<T>(session: Buffer, linkId: string, task: (client: WaClient) => Promise<T>) {
  return exclusive(async () => {
    const lib = await loadLibrary();
    const dataPath = path.join(toolDir(), "sessions");
    const sessionDir = path.join(dataPath, `session-${linkId}`);
    await rm(sessionDir, { recursive: true, force: true });
    await mkdir(sessionDir, { recursive: true });
    await unpack(session, sessionDir);
    const wa = new lib.Client({
      authStrategy: new lib.LocalAuth({ clientId: linkId, dataPath }),
      puppeteer: { headless: true, args: browserArgs() },
    });
    try {
      try {
        await launch(wa, useTimeoutMs);
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "pair-timeout") throw new Error("WhatsApp non è partito in tempo.");
        if (code === "auth") throw new Error("La sessione WhatsApp non è più valida. Va ricollegata.");
        throw new Error("WhatsApp non è partito.");
      }
      const result = await task(wa);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const next = await packDir(sessionDir);
      return { result, session: next };
    } finally {
      await wa.destroy().catch(() => undefined);
      await rm(sessionDir, { recursive: true, force: true });
    }
  });
}

export async function listWhatsAppChats(session: Buffer, linkId: string) {
  const outcome = await withWhatsApp(session, linkId, async (client) => {
    const chats = await client.getChats();
    return chats.slice(0, 30).map((chat) => ({
      id: chat.id._serialized,
      name: chat.name || chat.id.user,
      unread: chat.unreadCount,
      group: chat.isGroup,
    }));
  });
  return outcome;
}

export async function readWhatsAppMessages(session: Buffer, linkId: string, chatId: string, limit: number) {
  return withWhatsApp(session, linkId, async (client) => {
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    return messages.slice(-limit).map((message) => ({
      fromMe: message.fromMe,
      body: message.body.slice(0, 500),
      at: new Date(message.timestamp * 1000).toISOString(),
    }));
  });
}

export async function sendWhatsAppMessage(session: Buffer, linkId: string, chatId: string, body: string) {
  return withWhatsApp(session, linkId, async (client) => {
    await client.sendMessage(chatId, body);
    return { sent: true };
  });
}
