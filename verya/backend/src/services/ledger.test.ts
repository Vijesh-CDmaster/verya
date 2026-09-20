// F44 regression tests — routing/system overhead aggregation from stage_timing rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateStageTimings } from "./ledger";
import type { LedgerEntry } from "../repositories/ledger";

function timing(gate: string, stageMs: number, providerMs: number): LedgerEntry {
  return {
    seq: 1,
    orgId: "org-1",
    gate,
    eventType: "stage_timing",
    actor: "system",
    detail: { summary: "x", stageMs, providerMs, overheadMs: Math.max(0, stageMs - providerMs) },
    prevHash: "GENESIS",
    chainHash: "abc",
    createdAt: new Date().toISOString(),
  };
}

test("empty history reports zeroed overhead without dividing by zero", () => {
  const summary = aggregateStageTimings([]);
  assert.equal(summary.stages, 0);
  assert.equal(summary.avgStageMs, 0);
  assert.equal(summary.overheadShare, 0);
  assert.deepEqual(summary.byGate, []);
});

test("averages separate provider latency from Verya's own overhead", () => {
  const summary = aggregateStageTimings([
    timing("flaws", 12000, 10000),
    timing("flaws", 8000, 6000),
    timing("routing", 2000, 500),
  ]);
  assert.equal(summary.stages, 3);
  assert.equal(summary.avgStageMs, Math.round((12000 + 8000 + 2000) / 3));
  assert.equal(summary.avgProviderMs, Math.round((10000 + 6000 + 500) / 3));
  assert.equal(summary.avgOverheadMs, Math.round((2000 + 2000 + 1500) / 3));

  const flaws = summary.byGate.find((g) => g.gate === "flaws");
  assert.ok(flaws);
  assert.equal(flaws!.runs, 2);
  assert.equal(flaws!.avgStageMs, 10000);
  assert.equal(flaws!.avgProviderMs, 8000);
  assert.equal(flaws!.avgOverheadMs, 2000);
});

test("non-timing ledger rows are ignored", () => {
  const noise: LedgerEntry = {
    seq: 2,
    orgId: "org-1",
    gate: "execution",
    eventType: "task_verified",
    actor: "ai",
    detail: { summary: "verified", latencyMs: 900 },
    prevHash: "abc",
    chainHash: "def",
    createdAt: new Date().toISOString(),
  };
  const summary = aggregateStageTimings([noise, timing("models", 1000, 900)]);
  assert.equal(summary.stages, 1);
  assert.equal(summary.byGate[0]!.gate, "models");
});
