import assert from "node:assert/strict";
import test from "node:test";
import {
  boundReadRows,
  classifyBotSql,
  confirmationPhrase,
  prepareReadSql,
  readRowCap,
  rowPhrase,
} from "./read-query.ts";

function sqlOf(input: string) {
  const prepared = prepareReadSql(input);
  assert.ok(!("error" in prepared), "error" in prepared ? prepared.error : "");
  return prepared.text;
}

test("a select is wrapped once and keeps a single parameter", () => {
  const text = sqlOf("select id, family_name from patients where family_name = 'Rossi'");
  assert.match(text, /jsonb_agg/);
  assert.match(text, /limit 201/);
  assert.match(text, /where \$1::boolean/);
  assert.match(text, /family_name = 'Rossi'/);
});

test("a with query is accepted", () => {
  const text = sqlOf("with today as (select id from appointments) select * from today");
  assert.match(text, /with today/);
});

test("writes, multiple statements, and identity changes are refused", () => {
  for (const sample of [
    "insert into patients (given_name) values ('A')",
    "select 1; select 2",
    "select set_config('request.jwt.claim.sub', 'x', true)",
    "select pg_catalog.set_config('request.jwt.claim.sub', 'x', true)",
    "select * from private.whatsapp_secrets",
    "select * into notes from patients",
    "select id from patients where id = $1",
    "select 1) union all select 2",
  ]) {
    const prepared = prepareReadSql(sample);
    assert.ok("error" in prepared, sample);
  }
});

test("a forbidden call hidden in a string or comment still allows the select", () => {
  const text = sqlOf("select payload->>'body' as body from chat_events where payload->>'body' = 'set_config'");
  assert.match(text, /set_config/);
  const commented = sqlOf("select 1 /* ; select set_config('a','b', true) */");
  assert.match(commented, /select 1/);
});

test("a write is classified for confirmation and a select still reads", () => {
  const write = classifyBotSql("delete from patients where id = '11111111-1111-1111-1111-111111111111'");
  assert.equal(write.mode, "write");
  if (write.mode === "write") assert.match(write.sql, /^delete from patients/i);

  const hidden = classifyBotSql("select id from patients where note = 'delete me'");
  assert.equal(hidden.mode, "read");

  const modifying = classifyBotSql(
    "with gone as (delete from patients where family_name = 'Rossi' returning id) select * from gone",
  );
  assert.equal(modifying.mode, "write");
});

test("a bulk write is described with the count and a few names", () => {
  const phrase = confirmationPhrase(
    "l'eliminazione dei pazienti senza codice fiscale",
    174,
    "delete from patients where fiscal_code is null or fiscal_code = ''",
    ["Mario Rossi", "Luca Bianchi"],
  );
  assert.match(phrase, /174 pazienti/);
  assert.match(phrase, /Mario Rossi, Luca Bianchi/);
  assert.match(phrase, /altri 172/);
  assert.equal(rowPhrase({ given_name: "Ada", family_name: "Lovelace" }), "Ada Lovelace");
  assert.equal(rowPhrase({ title: "Visita" }), "Visita");
});

test("an unclosed string is refused", () => {
  const prepared = prepareReadSql("select 'Rossi");
  assert.ok("error" in prepared);
});

test("the row cap drops the extra row and a huge payload", () => {
  const extra = Array.from({ length: readRowCap + 1 }, (_, index) => ({ id: index }));
  assert.equal(boundReadRows(extra).truncated, true);
  assert.equal(boundReadRows(extra).rows.length, readRowCap);
  const huge = [{ body: "x".repeat(30_000) }, { body: "ok" }];
  const bounded = boundReadRows(huge);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.rows.length, 0);
});
