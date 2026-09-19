import test from "node:test";
import assert from "node:assert/strict";
import {
  fuzzyScore,
  gaugeReading,
  isStable,
  matchEquipment,
  normalizeAngle,
  parseNumericReading,
} from "../lib/vision";
test("gauge calibration converts and clamps", () => {
  const c = { minValue: 0, maxValue: 10, minAngle: -135, maxAngle: 135 };
  assert.equal(gaugeReading(0, c), 5);
  assert.equal(gaugeReading(170, c), 10);
});
test("angles normalize", () => assert.equal(normalizeAngle(270), -90));
test("OCR numeric parser tolerates comma and O", () => {
  assert.equal(parseNumericReading("P O2,45 bar"), 2.45);
  assert.equal(parseNumericReading("none"), null);
});
test("equipment matching is station-scoped and fuzzy", () => {
  assert.ok(fuzzyScore("MP-4", "MP4") > 0.9);
  assert.equal(matchEquipment("MP 4", ["MP-4", "VALVE-2"])[0].label, "MP-4");
});
test("reading stability rejects moving samples", () => {
  assert.equal(isStable([5, 5.02, 4.99]), true);
  assert.equal(isStable([4, 5, 6]), false);
});
