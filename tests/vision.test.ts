import test from "node:test";
import assert from "node:assert/strict";
import {
  fuzzyScore,
  gaugeReading,
  isStable,
  matchEquipment,
  normalizeAngle,
  parseNumericReading,
  angleDistance,
  needleDirectionScore,
  selectNeedleDirection,
  analyseGauge,
  type RadialMetrics,
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
  assert.equal(isStable([5, 5.02, 4.99, 5.01, 5]), true);
  assert.equal(isStable([4, 9, 14, 19, 24]), false);
});
const metric = (angle: number, long = true): RadialMetrics => {
  const bare = {
    angle,
    centerPassScore: 0.9,
    lengthScore: long ? 0.95 : 0.35,
    thinnessScore: long ? 0.9 : 0.15,
    outerReachScore: long ? 0.95 : 0.2,
    continuityScore: long ? 0.9 : 0.45,
    radialDarknessScore: long ? 0.8 : 0.75,
    counterweightPenalty: long ? 0.05 : 0.85,
    tickMarkPenalty: 0.05,
  };
  return { ...bare, score: needleDirectionScore(bare) };
};
test("opposite angle handling wraps correctly", () =>
  assert.equal(angleDistance(170, -10), 180));
test("long thin pointer wins over short thick counterweight", () => {
  const needle = metric(35, true),
    counter = metric(-145, false);
  assert.equal(selectNeedleDirection(needle, counter).angle, 35);
  assert.ok(needle.score > counter.score);
});
test("line through center receives a stronger score", () => {
  const centered = metric(20, true),
    off = { ...metric(20, true), centerPassScore: 0 };
  off.score = needleDirectionScore(off);
  assert.ok(centered.score > off.score);
});
function syntheticGauge() {
  const w = 220,
    h = 220,
    data = new Uint8ClampedArray(w * h * 4);
  data.fill(255);
  const set = (x: number, y: number, v = 20) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = (y * w + x) * 4;
    data[p] = data[p + 1] = data[p + 2] = v;
    data[p + 3] = 255;
  };
  const cx = 110,
    cy = 110,
    r = 78;
  for (let a = 0; a < Math.PI * 2; a += 0.006) {
    for (let t = -2; t <= 2; t++)
      set(
        Math.round(cx + Math.cos(a) * (r + t)),
        Math.round(cy + Math.sin(a) * (r + t)),
      );
  }
  for (let d = 14; d < 72; d++)
    for (let t = -1; t <= 1; t++) set(cx + d, cy + t);
  for (let d = 12; d < 32; d++)
    for (let t = -5; t <= 5; t++) set(cx - d, cy + t);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12)
    for (let d = 62; d < 73; d++)
      set(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d));
  return { width: w, height: h, data } as ImageData;
}
test("analog circle and needle classification beats digital path", () => {
  const result = analyseGauge(syntheticGauge());
  assert.equal(result[0]?.kind, "gauge");
  assert.ok(
    (result[0]?.debug?.analogGaugeScore ?? 0) >
      (result[0]?.debug?.digitalDisplayScore ?? 1),
  );
});
test("missing calibration never produces a zero numeric reading", () => {
  const result = analyseGauge(syntheticGauge())[0];
  assert.equal(result?.value, undefined);
  assert.match(result?.warning || "", /Calibration required/);
});
