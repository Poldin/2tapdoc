import assert from "node:assert/strict";
import test from "node:test";
import { StepLog, formatStepInput, formatStepOutcome, redactValue } from "./steps.ts";

test("a query step keeps the sql and hides a token", () => {
  const input = formatStepInput("query", { sql: "select id from patients", label: "elenco pazienti" });
  assert.match(input, /select id from patients/);
  assert.match(input, /elenco pazienti/);

  const hidden = redactValue({ accessToken: "secret-value", name: "Ada" }) as { accessToken: string; name: string };
  assert.equal(hidden.accessToken, "•••");
  assert.equal(hidden.name, "Ada");
});

test("a query result keeps a short preview of the rows", () => {
  const outcome = formatStepOutcome({ rows: [{ id: "1", given_name: "Ada" }], truncated: false });
  assert.match(outcome, /^1 riga/);
  assert.match(outcome, /Ada/);
});

test("the log pairs a call with its result and publishes json", () => {
  const log = new StepLog();
  log.noteCall("call-1", "query", { sql: "select 1" });
  log.noteResult("call-1", "query", { rows: [{ ok: true }] });
  const steps = log.list();
  assert.equal(steps.length, 1);
  assert.equal(steps[0].name, "query");
  assert.match(steps[0].input, /select 1/);
  assert.match(steps[0].outcome, /1 riga/);
  const draft = JSON.parse(log.draft()) as { name: string }[];
  assert.equal(draft[0].name, "query");
});

test("a model round keeps its time and tokens, and a tool keeps its duration", () => {
  const log = new StepLog([
    { name: "contesto", input: "", outcome: "", ms: 800, inputTokens: 400, outputTokens: 90 },
  ]);
  log.noteModelStart("modello-1");
  log.noteCall("call-1", "query", { sql: "select 1" });
  log.noteResult("call-1", "query", { rows: [{ ok: true }] });
  log.noteModelFinish("modello-1", { ms: 2100.4, inputTokens: 6100, outputTokens: 180 });
  log.noteDuration("call-1", 140.2);
  log.noteModelStart("modello-2");

  const live = JSON.parse(log.draft()) as { name: string; ms?: number }[];
  assert.deepEqual(
    live.map((step) => step.name),
    ["contesto", "modello", "query", "modello"],
  );
  assert.equal(live[3].ms, undefined);

  const steps = log.list();
  assert.deepEqual(
    steps.map((step) => step.name),
    ["contesto", "modello", "query"],
  );
  assert.equal(steps[0].ms, 800);
  assert.equal(steps[0].inputTokens, 400);
  assert.equal(steps[1].ms, 2100);
  assert.equal(steps[1].inputTokens, 6100);
  assert.equal(steps[1].outputTokens, 180);
  assert.equal(steps[2].ms, 140);
});
