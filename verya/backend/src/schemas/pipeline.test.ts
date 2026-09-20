import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_FLOOR, TIE_GAP, decisionThresholds, needsTieBreak } from "./pipeline";

test("decision thresholds use deployment overrides", () => {
  const oldFloor = process.env.VERYA_AUTO_FLOOR;
  const oldGap = process.env.VERYA_TIE_GAP;
  process.env.VERYA_AUTO_FLOOR = "0.9";
  process.env.VERYA_TIE_GAP = "0.03";
  try {
    assert.deepEqual(decisionThresholds(), { autoFloor: 0.9, tieGap: 0.03 });
    assert.equal(needsTieBreak([{ confidence: 0.85 }, { confidence: 0.7 }]), true);
    assert.equal(needsTieBreak([{ confidence: 0.95 }, { confidence: 0.9 }]), false);
  } finally {
    if (oldFloor === undefined) delete process.env.VERYA_AUTO_FLOOR;
    else process.env.VERYA_AUTO_FLOOR = oldFloor;
    if (oldGap === undefined) delete process.env.VERYA_TIE_GAP;
    else process.env.VERYA_TIE_GAP = oldGap;
  }
});

test("invalid decision threshold overrides fall back to safe defaults", () => {
  const oldFloor = process.env.VERYA_AUTO_FLOOR;
  const oldGap = process.env.VERYA_TIE_GAP;
  process.env.VERYA_AUTO_FLOOR = "2";
  process.env.VERYA_TIE_GAP = "not-a-number";
  try {
    assert.deepEqual(decisionThresholds(), { autoFloor: AUTO_FLOOR, tieGap: TIE_GAP });
  } finally {
    if (oldFloor === undefined) delete process.env.VERYA_AUTO_FLOOR;
    else process.env.VERYA_AUTO_FLOOR = oldFloor;
    if (oldGap === undefined) delete process.env.VERYA_TIE_GAP;
    else process.env.VERYA_TIE_GAP = oldGap;
  }
});