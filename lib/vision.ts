export type VisionKind = "gauge" | "digital" | "tag" | "equipment";
export interface VisionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface VisionQuality {
  brightness: number;
  contrast: number;
  sharpness: number;
  glare: number;
  score: number;
  warnings: string[];
}
export interface VisionDetection {
  id: string;
  kind: VisionKind;
  label: string;
  box: VisionBox;
  confidence: number;
  value?: number;
  rawText?: string;
  needleAngle?: number;
  quality: VisionQuality;
  warning?: string;
}
export interface GaugeCalibration {
  minValue: number;
  maxValue: number;
  minAngle: number;
  maxAngle: number;
  center?: { x: number; y: number };
  radius?: number;
  orientation?: number;
}
export function normalizeAngle(angle: number) {
  let a = angle % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}
export function gaugeReading(angle: number, c: GaugeCalibration) {
  const span = c.maxAngle - c.minAngle;
  if (!span) throw new Error("Gauge angles must differ");
  const ratio = Math.max(
    0,
    Math.min(1, (normalizeAngle(angle) - c.minAngle) / span),
  );
  return c.minValue + ratio * (c.maxValue - c.minValue);
}
export function parseNumericReading(text: string) {
  const match = text.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
export function normalizeTag(text: string) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function fuzzyScore(a: string, b: string) {
  a = normalizeTag(a);
  b = normalizeTag(b);
  if (!a || !b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}
export function matchEquipment(
  text: string,
  equipment: string[],
  threshold = 0.62,
) {
  return equipment
    .map((label) => ({ label, score: fuzzyScore(text, label) }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score >= threshold);
}
export function isStable(values: number[], tolerance = 0.025) {
  if (values.length < 3) return false;
  const range = Math.max(...values) - Math.min(...values);
  const scale = Math.max(
    1,
    Math.abs(values.reduce((a, b) => a + b, 0) / values.length),
  );
  return range / scale <= tolerance;
}
export function analyseGauge(
  image: ImageData,
  calibration?: GaugeCalibration,
): VisionDetection[] {
  const { width: w, height: h, data } = image;
  if (w < 32 || h < 32) return [];
  const gray = new Float32Array(w * h);
  let sum = 0,
    sum2 = 0,
    glare = 0;
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const g = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    gray[p] = g;
    sum += g;
    sum2 += g * g;
    if (g > 248) glare++;
  }
  const mean = sum / gray.length,
    contrast = Math.sqrt(Math.max(0, sum2 / gray.length - mean * mean));
  let lap = 0,
    lap2 = 0,
    n = 0;
  for (let y = 1; y < h - 1; y += 2)
    for (let x = 1; x < w - 1; x += 2) {
      const p = y * w + x,
        v = 4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - w] - gray[p + w];
      lap += v;
      lap2 += v * v;
      n++;
    }
  const sharp = Math.sqrt(Math.max(0, lap2 / n - (lap / n) ** 2));
  const warnings: string[] = [];
  if (mean < 42) warnings.push("Poor lighting");
  if (mean > 220 || glare / gray.length > 0.08) warnings.push("Strong glare");
  if (sharp < 18) warnings.push("Hold steady — image is blurry");
  const qualityScore = Math.max(
    0,
    Math.min(
      1,
      (contrast / 55) * 0.4 +
        (sharp / 70) * 0.45 +
        (1 - glare / gray.length) * 0.15,
    ),
  );
  const cx = (calibration?.center?.x ?? 0.5) * w,
    cy = (calibration?.center?.y ?? 0.5) * h,
    r = (calibration?.radius ?? 0.36) * Math.min(w, h);
  let best = -1,
    bestAngle = 0,
    second = -1;
  for (let deg = -180; deg < 180; deg += 2) {
    const rad = (deg * Math.PI) / 180;
    let score = 0,
      count = 0;
    for (let d = r * 0.12; d < r * 0.88; d += 2) {
      const x = Math.round(cx + Math.cos(rad) * d),
        y = Math.round(cy + Math.sin(rad) * d);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const p = y * w + x;
      score +=
        Math.abs(gray[p - 1] - gray[p + 1]) +
        Math.abs(gray[p - w] - gray[p + w]);
      count++;
    }
    score /= Math.max(1, count);
    if (score > best) {
      second = best;
      best = score;
      bestAngle = deg;
    } else if (score > second) second = score;
  }
  const lineConfidence = Math.max(
    0,
    Math.min(
      1,
      (best / (contrast + 12)) * 0.55 + (best - second) / Math.max(1, best),
    ),
  );
  const confidence = Math.max(
    0,
    Math.min(1, qualityScore * 0.55 + lineConfidence * 0.45),
  );
  const q = {
    brightness: mean,
    contrast,
    sharpness: sharp,
    glare: glare / gray.length,
    score: qualityScore,
    warnings,
  };
  return [
    {
      id: "gauge-0",
      kind: "gauge",
      label: "Analog gauge",
      box: {
        x: (cx - r) / w,
        y: (cy - r) / h,
        width: (2 * r) / w,
        height: (2 * r) / h,
      },
      confidence,
      value: calibration ? gaugeReading(bestAngle, calibration) : undefined,
      needleAngle: bestAngle,
      quality: q,
      warning:
        warnings[0] ||
        (!calibration ? "Calibration required for a reading" : undefined),
    },
  ];
}
export function imageDifference(a: ImageData, b: ImageData) {
  if (a.width !== b.width || a.height !== b.height)
    return { score: 1, changed: true };
  let total = 0;
  for (let i = 0; i < a.data.length; i += 16)
    total +=
      (Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2])) /
      (255 * 3);
  const score = total / Math.ceil(a.data.length / 16);
  return { score, changed: score > 0.18 };
}
