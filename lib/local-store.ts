export interface UserSession {
  id: string;
  name: string;
  username: string;
  group: string;
}
export interface RoundItem {
  id: string;
  equipment: string;
  label: string;
  kind: "reading" | "inspection" | "observation";
  unit?: string;
  required: boolean;
  previous?: number;
  value?: number;
  status: "pending" | "completed" | "attention" | "skipped";
  photos: string[];
  notes: string;
  skipReason?: string;
  visionType?: string;
  detectedLabel?: string;
  aiDetectedValue?: number;
  confirmedValue?: number;
  aiConfidence?: number;
  ocrRawText?: string;
  needleAngle?: number;
  qualityScore?: number;
  confirmedByUser?: boolean;
  processingVersion?: string;
  visionTimestamp?: string;
}
export interface Round {
  id: string;
  stationId: string;
  stationName: string;
  operator: string;
  group: string;
  type: "Routine Round" | "Special Inspection" | "Follow-up Round";
  status: "active" | "completed";
  startedAt: string;
  finishedAt?: string;
  items: RoundItem[];
}
export interface Calibration {
  id: string;
  stationId: string;
  equipment: string;
  minValue: number;
  maxValue: number;
  minAngle: number;
  maxAngle: number;
  unit: string;
  center?: { x: number; y: number };
  radius?: number;
  orientation?: number;
  referencePhoto?: string;
  label?: string;
  min?: number;
  max?: number;
}
export interface AppState {
  session: UserSession | null;
  activeRound: Round | null;
  rounds: Round[];
  calibrations: Calibration[];
  settings: {
    cameraRecognition: boolean;
    voiceNotes: boolean;
    imageQuality: "balanced" | "high";
    pressureThreshold: number;
    tankThreshold: number;
    conductivityThreshold: number;
    aiCameraEnabled: boolean;
    gaugeDetectionEnabled: boolean;
    ocrEnabled: boolean;
    equipmentDetectionEnabled: boolean;
    processingInterval: number;
    confidenceThreshold: number;
    showConfidence: boolean;
    showBoundingBoxes: boolean;
    aiDebugMode: boolean;
  };
}
const defaults: AppState["settings"] = {
  cameraRecognition: true,
  voiceNotes: true,
  imageQuality: "balanced",
  pressureThreshold: 15,
  tankThreshold: 10,
  conductivityThreshold: 12,
  aiCameraEnabled: true,
  gaugeDetectionEnabled: true,
  ocrEnabled: true,
  equipmentDetectionEnabled: false,
  processingInterval: 450,
  confidenceThreshold: 0.6,
  showConfidence: true,
  showBoundingBoxes: true,
  aiDebugMode: false,
};
const initial: AppState = {
  session: null,
  activeRound: null,
  rounds: [],
  calibrations: [],
  settings: defaults,
};
const DB = "masa-smart-round",
  STORE = "app",
  KEY = "state";
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE))
        r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
function migrate(value: Partial<AppState> | undefined): AppState {
  if (!value) return initial;
  return {
    ...initial,
    ...value,
    settings: { ...defaults, ...value.settings },
    calibrations: (value.calibrations || []).map((c) => ({
      ...c,
      minValue: c.minValue ?? c.min ?? 0,
      maxValue: c.maxValue ?? c.max ?? 100,
    })),
  };
}
export async function loadState() {
  try {
    const db = await open();
    return await new Promise<AppState>((resolve) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(migrate(r.result));
      r.onerror = () => resolve(initial);
    });
  } catch {
    try {
      return migrate(JSON.parse(localStorage.getItem(KEY) || "null"));
    } catch {
      return initial;
    }
  }
}
export async function saveState(state: AppState) {
  try {
    const db = await open();
    db.transaction(STORE, "readwrite").objectStore(STORE).put(state, KEY);
  } catch {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
}
export async function resetState() {
  try {
    indexedDB.deleteDatabase(DB);
    localStorage.removeItem(KEY);
  } catch {}
}
export function exportJson(state: AppState) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
  );
  a.download = `masa-round-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}
export async function importJson(file: File) {
  const parsed = JSON.parse(await file.text());
  if (!parsed.settings || !Array.isArray(parsed.rounds))
    throw new Error("Invalid backup");
  const migrated = migrate(parsed);
  await saveState(migrated);
  return migrated;
}
