import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ServerAlert = {
  id: string;
  botId: string;
  chatId: string;
  clinicId: string;
  firesAt: string;
  prompt: string;
  createdAt: string;
};

const storagePath =
  process.env.ALERTS_STORAGE_PATH || path.join(os.tmpdir(), "2tapdoc-server-alerts.json");

const alerts = new Map<string, ServerAlert>();
let loaded = false;

function loadFromDisk() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(storagePath)) return;
    const raw = fs.readFileSync(storagePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as ServerAlert).id === "string" &&
        typeof (item as ServerAlert).botId === "string" &&
        typeof (item as ServerAlert).chatId === "string" &&
        typeof (item as ServerAlert).clinicId === "string" &&
        typeof (item as ServerAlert).firesAt === "string" &&
        typeof (item as ServerAlert).prompt === "string"
      ) {
        alerts.set((item as ServerAlert).id, item as ServerAlert);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("could not load alerts from disk", message);
  }
}

function saveToDisk() {
  try {
    const data = JSON.stringify([...alerts.values()], null, 2);
    fs.writeFileSync(storagePath, data, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("could not persist alerts to disk", message);
  }
}

export function scheduleServerAlerts(
  botId: string,
  chatId: string,
  clinicId: string,
  items: Array<{ firesAt: Date; prompt: string }>,
): ServerAlert[] {
  loadFromDisk();
  const created: ServerAlert[] = [];
  const nowIso = new Date().toISOString();

  for (const item of items) {
    const alert: ServerAlert = {
      id: crypto.randomUUID(),
      botId,
      chatId,
      clinicId,
      firesAt: item.firesAt.toISOString(),
      prompt: item.prompt.trim().slice(0, 2000),
      createdAt: nowIso,
    };
    alerts.set(alert.id, alert);
    created.push(alert);
  }

  saveToDisk();
  return created;
}

export function listServerAlerts(botId: string, chatId: string): ServerAlert[] {
  loadFromDisk();
  return [...alerts.values()]
    .filter((alert) => alert.botId === botId && alert.chatId === chatId)
    .sort((a, b) => a.firesAt.localeCompare(b.firesAt));
}

export function cancelServerAlerts(
  botId: string,
  chatId: string,
  alertIds: string[],
): ServerAlert[] {
  loadFromDisk();
  const idSet = new Set(alertIds);
  const removed: ServerAlert[] = [];

  for (const [id, alert] of alerts.entries()) {
    if (alert.botId === botId && alert.chatId === chatId && idSet.has(id)) {
      alerts.delete(id);
      removed.push(alert);
    }
  }

  if (removed.length > 0) {
    saveToDisk();
  }
  return removed;
}

export function claimDueServerAlerts(now = new Date()): ServerAlert[] {
  loadFromDisk();
  const nowMs = now.getTime();
  const due: ServerAlert[] = [];

  for (const [id, alert] of alerts.entries()) {
    const targetMs = Date.parse(alert.firesAt);
    if (Number.isNaN(targetMs) || targetMs <= nowMs) {
      alerts.delete(id);
      due.push(alert);
    }
  }

  if (due.length > 0) {
    saveToDisk();
  }
  return due;
}
