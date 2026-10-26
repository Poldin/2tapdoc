import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import type pg from "pg";
import { claimTurn, completeTurn, failTurn, openDatabase } from "./db.js";
import { replyToTurn } from "./reply.js";

const idleMs = 2000;
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
  await client.connect();
  await client.query("listen bot_jobs");
  console.log("worker listening", workerId);

  try {
    while (running) {
      const turn = await claimTurn(client, workerId);
      if (!turn) {
        await waitForWork(client);
        continue;
      }

      console.log("claimed", turn.id);
      try {
        const body = await replyToTurn(apiKey as string, turn);
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
    await client.end().catch(() => undefined);
  }
}

function stop() {
  running = false;
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
