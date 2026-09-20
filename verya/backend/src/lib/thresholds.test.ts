import { test } from "node:test";
import assert from "node:assert/strict";
import { verificationDepthFor } from "./thresholds";

test("verification depth defaults by risk and accepts valid overrides", () => {
  const oldLow = process.env.VERYA_VERIFICATION_DEPTH_LOW;
  process.env.VERYA_VERIFICATION_DEPTH_LOW = "second_model";
  try {
    assert.equal(verificationDepthFor("low"), "second_model");
    assert.equal(verificationDepthFor("medium"), "second_model");
    assert.equal(verificationDepthFor("high"), "second_model");
  } finally {
    if (oldLow === undefined) delete process.env.VERYA_VERIFICATION_DEPTH_LOW;
    else process.env.VERYA_VERIFICATION_DEPTH_LOW = oldLow;
  }
});

test("invalid verification depth falls back to the risk default", () => {
  const oldMedium = process.env.VERYA_VERIFICATION_DEPTH_MEDIUM;
  process.env.VERYA_VERIFICATION_DEPTH_MEDIUM = "full";
  try {
    assert.equal(verificationDepthFor("medium"), "second_model");
  } finally {
    if (oldMedium === undefined) delete process.env.VERYA_VERIFICATION_DEPTH_MEDIUM;
    else process.env.VERYA_VERIFICATION_DEPTH_MEDIUM = oldMedium;
  }
});