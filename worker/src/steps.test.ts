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
