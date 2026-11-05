import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDuration,
  formatStepTokens,
  formatTokenCount,
  parseAgentSteps,
  stepTotals,
} from "./agent-steps.ts";

describe("agent step metrics", () => {
  it("keeps time and tokens and drops junk", () => {
    const steps = parseAgentSteps([
      { name: "modello", input: "", outcome: "", ms: 2100.4, inputTokens: 6100, outputTokens: 180 },
      { name: "query", input: "select 1", outcome: "1 riga", ms: "140", inputTokens: "no" },
      { name: "modello", ms: -1, inputTokens: 9_000_000 },
    ]);
    assert.equal(steps.length, 3);
    assert.equal(steps[0].ms, 2100);
    assert.equal(steps[0].inputTokens, 6100);
    assert.equal(steps[0].outputTokens, 180);
    assert.equal(steps[1].ms, 140);
    assert.equal(steps[1].inputTokens, undefined);
    assert.equal(steps[2].ms, undefined);
    assert.equal(steps[2].inputTokens, undefined);
  });

  it("formats a reply total from the steps", () => {
    assert.equal(formatDuration(140), "140 ms");
    assert.equal(formatDuration(2100), "2,1 s");
    assert.equal(formatDuration(10400), "10 s");
    assert.equal(formatStepTokens({ inputTokens: 6100, outputTokens: 180 }), `${formatTokenCount(6100)} in · ${formatTokenCount(180)} out`);
    const totals = stepTotals([
      { name: "modello", input: "", outcome: "", ms: 2100, inputTokens: 6100, outputTokens: 180 },
      { name: "query", input: "", outcome: "", ms: 140 },
    ]);
    assert.equal(totals.ms, 2240);
    assert.equal(totals.tokens, 6280);
  });
});
