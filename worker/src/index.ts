import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import type pg from "pg";
import { claimDueServerAlerts } from "./alerts.js";
import {
  claimTurn,
  completeTurn,
  enqueueBotAlert,
  failTurn,
  openDatabase,
} from "./db.js";
import { replyToTurn } from "./reply.js";
import { reconcileWhatsAppSessions, stopAllWhatsAppSessions } from "./whatsapp.js";

const idleMs = 1500;
let running = true;
let wakeWait: (() => void) | null = null;

const databaseUrl = process.env.DATABASE_URL;
const apiKey = process.env.MISTRAL_API_KEY;
if (!databaseUrl || !apiKey) {
  console.error("DATABASE_URL and MISTRAL_API_KEY are required");
  process.exit(1);
}

const workerId = `${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`.slice(0, 80);

const port = Number(process.env.PORT);
if (port) {
  http
    .createServer((request, response) => {
      const path = request.url?.split("?")[0];
      if (path === "/" || path === "/health") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("ok");
        return;
      }
      response.writeHead(404);
      response.end();
    })
    .listen(port, "0.0.0.0");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flushDueAlerts(client: pg.Client) {
  const due = claimDueServerAlerts();
  for (const alert of due) {
    try {
      await enqueueBotAlert(client, workerId, alert.botId, alert.chatId, alert.prompt);
      console.log("fired server alert", alert.id, alert.chatId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "alert enqueue failed";
      console.error("could not enqueue server alert", alert.id, message);
    }
  }
}

async function waitForWork(client: pg.Client) {
  const onNotify = () => wakeWait?.();
  client.on("notification", onNotify);
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wakeWait = null;
        resolve();
      }, idleMs);
      wakeWait = () => {
        clearTimeout(timer);
        wakeWait = null;
        resolve();
      };
      if (!running) wakeWait();
    });
  } finally {
    wakeWait = null;
    client.off("notification", onNotify);
  }
}

async function runSession() {
  const client = openDatabase(databaseUrl as string);
  try {
    await client.connect();
    await client.query("listen bot_jobs");
    console.log("worker listening", workerId);

    while (running) {
      await flushDueAlerts(client);
      await reconcileWhatsAppSessions(client, workerId);

      const turn = await claimTurn(client, workerId);
      if (!turn) {
        await waitForWork(client);
        continue;
      }

      console.log("claimed", turn.id);
      try {
        const body = await replyToTurn(apiKey as string, client, workerId, turn);
        await completeTurn(client, workerId, turn.id, body);
        console.log("finished", turn.id);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "The turn failed";
        console.error("turn failed", turn.id, reason);
        try {
          await failTurn(client, workerId, turn.id, reason);
        } catch (failError) {
          const message = failError instanceof Error ? failError.message : "fail failed";
          console.error("could not record the failure", turn.id, message);
        }
      }
    }
  } finally {
    stopAllWhatsAppSessions();
    await client.end().catch(() => undefined);
  }
}

function stop() {
  running = false;
  stopAllWhatsAppSessions();
  wakeWait?.();
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);

while (running) {
  try {
    await runSession();
  } catch (error) {
    const message = error instanceof Error ? error.message : "connection failed";
    console.error("worker connection lost", message);
    if (running) await sleep(idleMs);
  }
}
