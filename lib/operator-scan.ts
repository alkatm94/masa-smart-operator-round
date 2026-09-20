import { fuzzyScore, normalizeTag, type VisionBox } from "./vision";
import type { ScanDetection, ScanSession } from "./local-store";

export const SCAN_COOLDOWN_MS = 30_000;
export const STABLE_FRAME_COUNT = 5;
export function normalizeEquipmentTag(text: string) {
  return text.toUpperCase().replace(/[—–_ ]+/g, "-").replace(/[^A-Z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}
export function extractEquipmentTags(text: string) {
  const normalized = text.toUpperCase().replace(/[—–_]/g, "-");
  return [...new Set(normalized.match(/\b(?:MP[- ]?\d+|JIC[- ]?[A-Z0-9]+|RO[- ]?\d+|C[- ]?\d+[A-Z]?|WTP|EBS|JBS|EPS|MOT|P[- ]?\d+)\b/g)?.map(normalizeEquipmentTag) || [])];
}
export function extractReadingUnit(text: string) {
  return text.match(/(?:µS\/cm|uS\/cm|m³\/h|m3\/h|bar|psi|kPa|MPa|%|mm|cm|\bm\b)/i)?.[0]?.replace(/^uS/i, "µS").replace(/^m3/i, "m³");
}
export function bestEquipmentMatch(text: string, equipment: string[], threshold = .62) {
  const candidates = extractEquipmentTags(text);
  return candidates.flatMap((tag) => equipment.map((label) => { const tagKey = normalizeTag(tag), labelKey = normalizeTag(label); return { tag, label, score: labelKey.includes(tagKey) || tagKey.includes(labelKey) ? .95 : fuzzyScore(tagKey, labelKey) }; })).filter((match) => match.score >= threshold).sort((a, b) => b.score - a.score)[0];
}
export function mapRoiBox(box: VisionBox, roi: VisionBox): VisionBox {
  return { x: roi.x + box.x * roi.width, y: roi.y + box.y * roi.height, width: box.width * roi.width, height: box.height * roi.height };
}
export function isPossibleObstruction(box: VisionBox) {
  const centerX = box.x + box.width / 2, bottom = box.y + box.height;
  return centerX >= .2 && centerX <= .8 && bottom >= .58 && box.width * box.height >= .025;
}
export function sightGlassLevelPercent(top: number, bottom: number, liquidBoundary: number) {
  if (bottom <= top || liquidBoundary < top || liquidBoundary > bottom) return undefined;
  return Math.max(0, Math.min(100, ((bottom - liquidBoundary) / (bottom - top)) * 100));
}
export function estimateSightGlassLevel(image: ImageData) {
  const { width, height, data } = image; if (width < 12 || height < 24) return undefined;
  const rowContrast: number[] = [];
  for (let y = 0; y < height; y++) { let sum = 0, sum2 = 0; for (let x = Math.floor(width * .25); x < Math.ceil(width * .75); x++) { const i = (y * width + x) * 4, gray = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722; sum += gray; sum2 += gray * gray; } const n = Math.max(1, Math.ceil(width * .75) - Math.floor(width * .25)); rowContrast[y] = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)); }
  const top = Math.floor(height * .08), bottom = Math.ceil(height * .92);
  let boundary = -1, strength = 0;
  for (let y = top + 2; y < bottom - 2; y++) { const edge = Math.abs(rowContrast[y + 2] - rowContrast[y - 2]); if (edge > strength) { strength = edge; boundary = y; } }
  const percent = sightGlassLevelPercent(top, bottom, boundary);
  return percent != null && strength > 4 ? { top, bottom, liquidBoundary: boundary, levelPercent: percent, confidence: Math.min(1, strength / 30) } : undefined;
}
export function parsePanelIndicators(text: string) {
  const statuses: Record<string, "ON" | "OFF"> = {};
  for (const label of ["RUN", "STOP", "TRIP", "FAULT", "AUTO", "MANUAL", "LOCAL", "REMOTE", "HEALTHY"])
    for (const state of ["ON", "OFF"] as const)
      if (new RegExp(`\\b${label}\\s*[:=-]?\\s*${state}\\b`, "i").test(text)) statuses[label] = state;
  return statuses;
}
export function stabilityKey(detection: Pick<ScanDetection, "type" | "equipment" | "label">) { return `${detection.equipment || "scene"}:${detection.type}:${detection.label}`; }
export function shouldAutoCapture(previous: ScanDetection | undefined, next: ScanDetection, lastCaptureAt: number | undefined, now: number, cooldown = SCAN_COOLDOWN_MS) {
  return next.stableFrames >= STABLE_FRAME_COUNT && (!previous || previous.reviewStatus === "rejected" || !lastCaptureAt || now - lastCaptureAt >= cooldown);
}
export function updateStableDetection(previous: ScanDetection | undefined, next: ScanDetection) {
  const closeValue = previous?.value == null || next.value == null || Math.abs(previous.value - next.value) <= Math.max(.02, Math.abs(next.value) * .02);
  return { ...next, stableFrames: previous && previous.trackKey === next.trackKey && closeValue ? previous.stableFrames + 1 : 1 };
}
export function createScanSession(stationId: string, stationName: string, roundId: string, now = new Date().toISOString()): ScanSession {
  return { id: crypto.randomUUID(), stationId, stationName, roundId, startTime: now, detections: [], snapshots: [] };
}
export function reviewScanDetection(session: ScanSession, id: string, action: "confirm" | "reject" | "edit", patch: Partial<ScanDetection> = {}): ScanSession {
  return { ...session, detections: session.detections.map((detection) => detection.id === id ? { ...detection, ...patch, reviewStatus: action === "confirm" ? "operator_confirmed" : action === "edit" ? "operator_edited" : "rejected" } : detection) };
}
export function generateScanSummary(session: ScanSession) {
  const accepted = session.detections.filter((item) => item.reviewStatus !== "rejected");
  return { station: session.stationName, equipment: [...new Set(accepted.map((item) => item.equipment).filter(Boolean))], readings: accepted.filter((item) => item.value != null), observations: accepted.filter((item) => item.statusText), confirmed: accepted.filter((item) => /operator_/.test(item.reviewStatus)).length, rejected: session.detections.filter((item) => item.reviewStatus === "rejected").length };
}
