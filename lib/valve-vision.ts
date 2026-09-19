export type ValveDirection = "clockwise-opens" | "counterclockwise-opens";
export interface ValveCalibration {
  id: string; stationId: string; equipment: string; closedAngle: number; openAngle: number;
  direction: ValveDirection; closedThreshold?: number; openThreshold?: number;
}
export type ValveState = "closed" | "mostly_closed" | "partially_open" | "mostly_open" | "open";
export function normalize360(angle: number) { return ((angle % 360) + 360) % 360; }
export function directedAngleDistance(from: number, to: number, direction: ValveDirection) {
  return direction === "counterclockwise-opens" ? normalize360(from - to) : normalize360(to - from);
}
export function valvePositionPercent(angle: number, calibration: ValveCalibration) {
  const span = directedAngleDistance(calibration.closedAngle, calibration.openAngle, calibration.direction);
  if (span < 1) return undefined;
  const travelled = directedAngleDistance(calibration.closedAngle, angle, calibration.direction);
  return Math.max(0, Math.min(100, (travelled / span) * 100));
}
export function classifyValveState(percent: number, closedThreshold = 8, openThreshold = 92): ValveState {
  if (percent <= closedThreshold) return "closed";
  if (percent < 35) return "mostly_closed";
  if (percent <= 65) return "partially_open";
  if (percent < openThreshold) return "mostly_open";
  return "open";
}
export function describeValve(angle: number | undefined, calibration: ValveCalibration | undefined, hasIndicator: boolean) {
  if (!hasIndicator) return { warning: "Position unavailable visually — handwheel has no indicator" };
  if (angle == null) return { warning: "Valve indicator direction uncertain" };
  if (!calibration) return { angle, warning: "Valve calibration required" };
  const percent = valvePositionPercent(angle, calibration);
  return percent == null ? { angle, warning: "Invalid valve calibration" } : { angle, percent, state: classifyValveState(percent, calibration.closedThreshold, calibration.openThreshold) };
}
export function estimateValveIndicatorAngle(image: ImageData) {
  const { width, height, data } = image, cx = width / 2, cy = height / 2, radius = Math.min(width, height) / 2;
  let best = { angle: 0, score: 0 };
  for (let angle = 0; angle < 360; angle += 2) {
    const radians = angle * Math.PI / 180; let darkness = 0, edges = 0, samples = 0, previous = 255;
    for (let distance = radius * .2; distance < radius * .9; distance += 2) {
      const x = Math.round(cx + Math.cos(radians) * distance), y = Math.round(cy + Math.sin(radians) * distance);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const index = (y * width + x) * 4, gray = data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
      darkness += (255 - gray) / 255; edges += Math.abs(gray - previous) / 255; previous = gray; samples++;
    }
    const score = samples ? darkness / samples * .75 + Math.min(1, edges / samples * 3) * .25 : 0;
    if (score > best.score) best = { angle, score };
  }
  return best.score >= .18 ? best : undefined;
}
