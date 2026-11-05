import assert from "node:assert/strict";
import test from "node:test";
import { boundReadRows, prepareReadSql, readRowCap } from "./read-query.ts";

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
