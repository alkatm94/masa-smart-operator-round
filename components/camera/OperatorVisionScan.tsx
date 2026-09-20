"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Flashlight, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import type { AppState, Round, ScanDetection, ScanSession } from "@/lib/local-store";
import { analyseGauge, isNumericStable, matchEquipment, type VisionDetection, type VisionQuality } from "@/lib/vision";
import { recognizeLocal } from "@/lib/ocr";
import { GeneralObjectDetector } from "@/lib/general-object-detector";
import { MasaIndustrialDetector } from "@/lib/industrial-vision";
import { ObservationModelStatus } from "@/lib/observation-models";
import { bestEquipmentMatch, createScanSession, extractEquipmentTags, extractReadingUnit, generateScanSummary, isPossibleObstruction, parsePanelIndicators, reviewScanDetection, shouldAutoCapture, stabilityKey, updateStableDetection } from "@/lib/operator-scan";
import { VisionOverlay } from "./VisionOverlay";

const quality = (score: number): VisionQuality => ({ brightness: 0, contrast: 0, sharpness: 0, glare: 0, score, warnings: [] });
const toVision = (item: ScanDetection): VisionDetection => ({ id: item.id, kind: item.type === "analog_gauge" ? "gauge" : item.type === "digital_display" ? "digital" : item.type === "equipment_tag" ? "tag" : "equipment", label: item.label, box: item.bbox, confidence: item.confidence, value: item.value, stable: item.stableFrames >= 5, warning: item.stableFrames >= 5 ? undefined : "Hold camera steady", source: item.source === "masa-industrial" ? "masa-industrial" : item.source === "general" ? "general" : "equipment-ocr", quality: quality(item.confidence) });
function crop(source: HTMLCanvasElement, box: ScanDetection["bbox"]) { const output = document.createElement("canvas"); output.width = Math.max(1, source.width * box.width); output.height = Math.max(1, source.height * box.height); output.getContext("2d")?.drawImage(source, source.width * box.x, source.height * box.y, source.width * box.width, source.height * box.height, 0, 0, output.width, output.height); return output; }

export function OperatorVisionScan({ round, settings, calibrations, back, finish }: { round: Round; settings: AppState["settings"]; calibrations: AppState["calibrations"]; back: () => void; finish: (session: ScanSession) => void }) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), stream = useRef<MediaStream | null>(null);
  const industrial = useRef<MasaIndustrialDetector | undefined>(undefined), general = useRef<GeneralObjectDetector | undefined>(undefined), observations = useRef(new ObservationModelStatus());
  const busy = useRef(false), lastIndustrial = useRef(0), lastGeneral = useRef(0), lastOcr = useRef(0), lastGauge = useRef(0), captureTimes = useRef<Record<string, number>>({}), numericHistory = useRef<Record<string, number[]>>({});
  const [session, setSession] = useState(() => createScanSession(round.stationId, round.stationName, round.id));
  const [paused, setPaused] = useState(false), [debug, setDebug] = useState(settings.aiDebugMode), [summaryMode, setSummaryMode] = useState(false), [torch, setTorch] = useState(false);
  const [modelStatus, setModelStatus] = useState({ industrial: "Loading", observations: "Loading", general: "Loading" });
  const [stats, setStats] = useState({ fps: 0, inferenceMs: 0, active: [] as string[], ocrText: "", gaugeConfidence: 0 });
  const equipment = useMemo(() => [...new Set(round.items.map((item) => item.equipment))], [round.items]);

  const publish = useCallback((incoming: Omit<ScanDetection, "id" | "trackKey" | "detectedAt" | "stableFrames" | "reviewStatus">[]) => {
    setSession((current) => {
      const next = { ...current, detections: [...current.detections], snapshots: [...current.snapshots] };
      for (const raw of incoming) {
        const seed: ScanDetection = { ...raw, id: crypto.randomUUID(), trackKey: "", detectedAt: new Date().toISOString(), stableFrames: 1, reviewStatus: "ai_detected" };
        seed.trackKey = stabilityKey(seed);
        const index = next.detections.findIndex((item) => item.trackKey === seed.trackKey && item.reviewStatus !== "rejected");
        const previous = index >= 0 ? next.detections[index] : undefined, stable = updateStableDetection(previous, seed);
        if (index >= 0) stable.id = previous!.id;
        if (index >= 0) next.detections[index] = stable; else next.detections.push(stable);
        const now = Date.now();
        if (canvas.current && shouldAutoCapture(previous, stable, captureTimes.current[stable.trackKey], now)) {
          captureTimes.current[stable.trackKey] = now;
          next.snapshots.push({ id: crypto.randomUUID(), detectionId: stable.id, imageDataUrl: canvas.current.toDataURL("image/jpeg", .72), timestamp: stable.detectedAt, station: round.stationName, equipment: stable.equipment, detectionType: stable.type, readingOrStatus: stable.value != null ? `${stable.value} ${stable.unit || ""}`.trim() : stable.statusText || stable.label, confidence: stable.confidence });
        }
      }
      return next;
    });
  }, [round.stationName]);

  useEffect(() => {
    const masa = new MasaIndustrialDetector(), common = new GeneralObjectDetector(); industrial.current = masa; general.current = common;
    void masa.load().then(() => setModelStatus((s) => ({ ...s, industrial: masa.status() })));
    void common.load().then((ok) => setModelStatus((s) => ({ ...s, general: ok ? "MediaPipe Ready" : "MediaPipe unavailable" })));
    void observations.current.load().then(() => setModelStatus((s) => ({ ...s, observations: observations.current.status() })));
    return () => { masa.dispose(); common.close(); };
  }, []);
  useEffect(() => { let active = true; navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then((media) => { if (!active) return media.getTracks().forEach((track) => track.stop()); stream.current = media; if (video.current) video.current.srcObject = media; }).catch(() => toast.error("Camera unavailable")); return () => { active = false; stream.current?.getTracks().forEach((track) => track.stop()); }; }, []);

  const process = useCallback(async () => {
    const source = video.current, target = canvas.current; if (!source?.videoWidth || !target || paused || summaryMode || busy.current) return;
    busy.current = true; const started = performance.now(); target.width = 480; target.height = Math.max(270, Math.round(480 * source.videoHeight / source.videoWidth)); const context = target.getContext("2d", { willReadFrequently: true }); if (!context) { busy.current = false; return; } context.drawImage(source, 0, 0, target.width, target.height);
    const now = performance.now(), activePipelines: string[] = [];
    try {
      let candidates: VisionDetection[] = [];
      if (industrial.current?.isReady() && now - lastIndustrial.current > 700) { lastIndustrial.current = now; candidates = await industrial.current.detect(target); activePipelines.push("industrial"); setStats((s) => ({ ...s, inferenceMs: industrial.current!.stats.inferenceMs })); }
      if ((!industrial.current?.isReady() || !candidates.length) && now - lastGeneral.current > 1000) { lastGeneral.current = now; const objects = await general.current?.detect(target) || []; activePipelines.push("general"); const obstructions = objects.filter((item) => /person|backpack|handbag|suitcase|bottle|chair/i.test(item.label) && isPossibleObstruction(item.box)).map((item) => ({ type: "object_obstruction" as const, label: "Possible obstruction", confidence: item.confidence, bbox: item.box, statusText: `Possible obstruction: ${item.label}`, source: "general" })); publish(obstructions); }
      const gaugeCandidate = candidates.find((item) => item.metadata?.industrialClass === "analog_gauge");
      if (now - lastGauge.current > 750) { lastGauge.current = now; const roiCanvas = gaugeCandidate ? crop(target, gaugeCandidate.box) : target; const gauge = analyseGauge(roiCanvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, roiCanvas.width, roiCanvas.height), calibrations.find((item) => item.stationId === round.stationId)); if (gauge[0]) { const result = gauge[0], calibration = calibrations.find((item) => item.stationId === round.stationId); publish([{ type: "analog_gauge", label: calibration ? "Pressure Gauge" : "Gauge detected", confidence: result.confidence, bbox: gaugeCandidate?.box || result.box, value: result.value, unit: calibration?.unit, statusText: calibration ? undefined : "Calibration required", source: "gauge" }]); setStats((s) => ({ ...s, gaugeConfidence: result.confidence })); activePipelines.push("gauge"); } }
      if (now - lastOcr.current > 1700) { lastOcr.current = now; const ocrCandidates = candidates.filter((item) => ["nameplate", "digital_meter", "control_panel"].includes(String(item.metadata?.industrialClass))); const targets = ocrCandidates.length ? ocrCandidates : [{ box: { x: .12, y: .15, width: .76, height: .7 }, metadata: {}, confidence: .5 } as VisionDetection]; for (const candidate of targets.slice(0, 2)) { const result = await recognizeLocal(crop(target, candidate.box)); setStats((s) => ({ ...s, ocrText: result.text })); const className = String(candidate.metadata?.industrialClass || ""); const match = bestEquipmentMatch(result.text, equipment) || matchEquipment(result.text, equipment)[0]; const tag = extractEquipmentTags(result.text)[0]; if (match || tag) publish([{ type: "equipment_tag", label: `Equipment: ${"label" in (match || {}) ? (match as {label:string}).label : tag}`, equipment: "label" in (match || {}) ? (match as {label:string}).label : tag, confidence: Math.min(result.confidence, (match as {score?:number} | undefined)?.score || result.confidence), bbox: candidate.box, statusText: `Station: ${round.stationName}`, source: "equipment-ocr" }]);
        if (className === "digital_meter" && result.value != null) { const key = `digital:${candidate.id}`, history = [...(numericHistory.current[key] || []), result.value].slice(-7); numericHistory.current[key] = history; publish([{ type: "digital_display", label: "Digital Display", confidence: result.confidence, bbox: candidate.box, value: result.value, unit: extractReadingUnit(result.text), statusText: isNumericStable(history) ? "Stable" : "Hold camera steady", source: "digital-ocr" }]); }
        if (className === "control_panel") { const indicators = parsePanelIndicators(result.text); for (const [label, state] of Object.entries(indicators)) publish([{ type: "panel_indicator", label: `${label}: ${state}`, confidence: result.confidence, bbox: candidate.box, statusText: `${label}: ${state}`, source: "panel-ocr" }]); }
      } activePipelines.push("ocr"); }
      setStats((s) => ({ ...s, fps: Math.round(1000 / Math.max(1, performance.now() - started)), active: activePipelines }));
    } finally { busy.current = false; }
  }, [calibrations, equipment, paused, publish, round.stationId, round.stationName, summaryMode]);
  useEffect(() => { const id = window.setInterval(() => void process(), 450); return () => clearInterval(id); }, [process]);
  const toggleTorch = async () => { const track = stream.current?.getVideoTracks()[0]; if (!track) return; try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { toast.info("Torch is unavailable on this device"); } };
  const reviewed = (id: string, action: "confirm" | "reject" | "edit") => { let patch: Partial<ScanDetection> = {}; if (action === "edit") { const current = session.detections.find((item) => item.id === id); const edited = window.prompt("Edit reading or status", current?.value != null ? String(current.value) : current?.statusText || ""); if (edited == null) return; const numeric = Number(edited); patch = Number.isFinite(numeric) ? { value: numeric } : { statusText: edited }; } setSession((current) => reviewScanDetection(current, id, action, patch)); };
  const summary = generateScanSummary(session);
  if (summaryMode) return <div className="camera-screen scan-summary"><div className="camera-head"><button className="icon-btn light" onClick={() => setSummaryMode(false)} aria-label="Back"><X /></button><div><small>{round.stationName}</small><b>Scan Summary</b></div><span /></div><div className="scan-review-list"><section className="panel"><h2>{round.stationName} Scan</h2><p>{summary.equipment.length} equipment · {summary.readings.length} readings · {summary.observations.length} observations</p></section>{session.detections.map((item) => <article className="scan-result-card" key={item.id}><div><b>{item.label}</b><small>{item.value != null ? `${item.value.toFixed(2)} ${item.unit || ""}` : item.statusText || "AI Detected"} · {Math.round(item.confidence * 100)}%</small></div><span className={`badge ${item.reviewStatus === "rejected" ? "attention" : item.reviewStatus === "ai_detected" ? "pending" : "completed"}`}>{item.reviewStatus.replaceAll("_", " ")}</span><div className="scan-review-actions"><button onClick={() => reviewed(item.id, "confirm")}>Confirm</button><button onClick={() => reviewed(item.id, "edit")}>Edit</button><button onClick={() => reviewed(item.id, "reject")}>Reject</button></div></article>)}</div><div className="camera-controls"><button className="btn secondary" onClick={() => setSummaryMode(false)}>Continue Scan</button><button className="btn primary" onClick={() => finish({ ...session, endTime: new Date().toISOString() })}>Save Scan</button></div></div>;
  return <div className="camera-screen operator-scan"><div className="camera-head"><button className="icon-btn light" onClick={back} aria-label="Close scan"><X /></button><div><small>{round.stationName} · Live</small><b>Operator Vision Scan</b></div><button className="icon-btn light" onClick={() => setDebug(!debug)} aria-label="Vision debug"><Bug /></button></div><div className="camera-stage"><video ref={video} autoPlay playsInline muted /><VisionOverlay detections={session.detections.filter((item) => item.reviewStatus !== "rejected").map(toVision)} selected={null} onSelect={() => {}} showConfidence debugMode={false} /><canvas ref={canvas} hidden /></div><div className="scan-detection-strip">{session.detections.filter((item) => item.reviewStatus !== "rejected").slice(-4).map((item) => <div key={item.id}><b>{item.label}</b><small>{item.value != null ? `${item.value.toFixed(2)} ${item.unit || ""}` : item.statusText || (item.stableFrames >= 5 ? "Stable" : "Hold camera steady")} · {Math.round(item.confidence * 100)}%</small></div>)}{!session.detections.length && <p>Scanning for operational items…</p>}</div>{debug && <pre className="scan-debug">{JSON.stringify({ sessionId: session.id, modelStatus, ...stats, stableFrames: session.detections.map((item) => ({ id: item.id, frames: item.stableFrames })) }, null, 2)}</pre>}<div className="camera-controls scan-controls"><button className="icon-btn light" onClick={toggleTorch} aria-label="Flash"><Flashlight /></button><button className="icon-btn light" onClick={() => setPaused(!paused)} aria-label="Pause AI">{paused ? <Play /> : <Pause />}</button><button className="btn primary" onClick={() => { setPaused(true); setSummaryMode(true); }}>Finish Scan</button></div></div>;
}
