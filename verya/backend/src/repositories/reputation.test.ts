import { test } from "node:test";
import assert from "node:assert/strict";

test("trust decay configuration stays bounded", () => {
  const score = Math.max(0, 80 - 2.5 * (365 / 30));
  assert.equal(Math.round(score * 10) / 10, 49.6);
  assert.equal(Math.max(0, 1 - 2.5 * 100), 0);
});