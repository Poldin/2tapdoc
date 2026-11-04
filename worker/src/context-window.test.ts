import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanTrace,
  compactContext,
  type ContextMessage,
  fitsWithoutFold,
  foldBatchSize,
  selectTail,
} from "./context-window.ts";

function message(seq: number, content = "ok", role: "user" | "assistant" = "user"): ContextMessage {
  return { seq, role, content };
}

function series(count: number, content = "ok"): ContextMessage[] {
  return Array.from({ length: count }, (_, index) => message(index + 1, content, index % 2 === 0 ? "user" : "assistant"));
}

test("a short chat is sent whole", () => {
  const messages = series(8, "visita");
  assert.equal(fitsWithoutFold(messages), true);
  assert.deepEqual(selectTail(messages), messages);
});

test("a long chat keeps the latest ten messages", () => {
  const messages = series(15);
  const tail = selectTail(messages);
  assert.deepEqual(
    tail.map((item) => item.seq),
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  );
});

test("very long messages stay at least four and within the tail", () => {
  const messages = series(8, "a".repeat(3000));
  const tail = selectTail(messages);
  assert.equal(tail.length, 4);
  assert.equal(tail[0].seq, 5);
  assert.equal(tail.at(-1)?.seq, 8);
});

test("compaction folds messages older than the claimed window and keeps the tail verbatim", async () => {
  const all = series(90).map((item) => ({ ...item, content: `m${item.seq}` }));
  const claimed = all.slice(-40);
  const saved: { trace: string; until: number }[] = [];
  const folded: { trace: string; from: number; to: number }[] = [];

  const result = await compactContext({
    messages: claimed,
    trace: null,
    untilSeq: 0,
    loadOlder: async (after, before, limit) =>
      all.filter((item) => item.seq > after && item.seq < before).slice(0, limit),
    writeTrace: async (trace, until) => {
      saved.push({ trace, until });
    },
    fold: async (trace, batch) => {
      folded.push({ trace, from: batch[0].seq, to: batch[batch.length - 1].seq });
      return `Traccia fino al messaggio ${batch[batch.length - 1].seq}, paziente Rossi.`;
    },
  });

  assert.equal(foldBatchSize, 40);
  assert.equal(result.mode, "window");
  assert.equal(result.foldedBatches, 2);
  assert.deepEqual(
    folded.map((item) => [item.from, item.to]),
    [
      [1, 40],
      [41, 80],
    ],
  );
  assert.equal(folded[1].trace, "Traccia fino al messaggio 40, paziente Rossi.");
  assert.equal(saved.at(-1)?.until, 80);
  assert.equal(result.messages[0].role, "user");
  assert.match(result.messages[0].content, /Nota interna di continuità/);
  assert.match(result.messages[0].content, /paziente Rossi/);
  assert.equal(result.messages[1].content, "Ho presente la traccia. Proseguo dai messaggi recenti.");
  assert.deepEqual(
    result.messages.slice(2).map((item) => item.content),
    ["m81", "m82", "m83", "m84", "m85", "m86", "m87", "m88", "m89", "m90"],
  );
  assert.equal(result.tailCount, 10);
});

test("a failed fold leaves the claimed transcript intact", async () => {
  const claimed = series(20);
  const result = await compactContext({
    messages: claimed,
    trace: null,
    untilSeq: 0,
    loadOlder: async () => claimed.slice(0, 10),
    writeTrace: async () => {
      throw new Error("db down");
    },
    fold: async () => "Traccia valida dei messaggi precedenti.",
  });

  assert.equal(result.mode, "fallback");
  assert.equal(result.messages.length, 20);
  assert.equal(result.messages[0].content, "ok");
});

test("an existing trace is reused without calling the model when the tail is already covered", async () => {
  let folds = 0;
  const claimed = series(12);
  const result = await compactContext({
    messages: claimed,
    trace: "Il paziente Rossi ha un appuntamento mercoledì alle 10.",
    untilSeq: 2,
    loadOlder: async () => [],
    writeTrace: async () => {
      throw new Error("should not write");
    },
    fold: async () => {
      folds += 1;
      return "nuova";
    },
  });

  assert.equal(folds, 0);
  assert.equal(result.mode, "window");
  assert.match(result.messages[0].content, /mercoledì alle 10/);
  assert.equal(result.tailCount, 10);
});

test("the trace sheds a markdown fence and stays within the cap", () => {
  const cleaned = cleanTrace("```text\n" + "a".repeat(3000) + "\n```");
  assert.equal(cleaned.startsWith("```"), false);
  assert.equal(cleaned.length, 1800);
});
