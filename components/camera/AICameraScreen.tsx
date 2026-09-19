"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Flashlight, Pause, Play, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { AppState, Round, RoundItem } from "@/lib/local-store";
import { analyseGauge, canConfirmLiveDetection, hasOppositeAmbiguity, isNumericStable, isStable, matchEquipment, shouldRunDigitalOcr, type VisionDetection, type VisionQuality } from "@/lib/vision";
import { recognizeLocal } from "@/lib/ocr";
import { VisionOverlay } from "./VisionOverlay";
import { DetectionCard } from "./DetectionCard";

export interface CameraResult {
  photo?: string;
  detection: VisionDetection;
  ocrRawText?: string;
  timestamp: string;
  equipment: string;
}
const OCR_INTERVAL = 1600;
const emptyQuality = (score: number): VisionQuality => ({ brightness: 0, contrast: 0, sharpness: 0, glare: 0, score, warnings: [] });

export default function AICameraScreen({ item, round, settings, calibration, back, confirm }: {
  item: RoundItem;
  round: Round;
  settings: AppState["settings"];
  calibration?: AppState["calibrations"][number];
  back: () => void;
  confirm: (result: CameraResult) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const workerBusy = useRef(false);
  const ocrBusy = useRef(false);
  const lastOcrAt = useRef(0);
  const angleHistory = useRef<number[]>([]);
  const valueHistory = useRef<number[]>([]);
  const latestDetections = useRef<VisionDetection[]>([]);
  const [evidencePhoto, setEvidencePhoto] = useState<string>();
  const [freezeFrame, setFreezeFrame] = useState<string>();
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [paused, setPaused] = useState(false);
  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [ocr, setOcr] = useState<string>();
  const cal = useMemo(() => calibration ? ({ minValue: calibration.minValue, maxValue: calibration.maxValue, minAngle: calibration.minAngle, maxAngle: calibration.maxAngle, center: calibration.center, radius: calibration.radius }) : undefined, [calibration]);
  const equipmentLabels = useMemo(() => [...new Set(round.items.map((entry) => entry.equipment))], [round.items]);
  const readingContext = useMemo(() => {
    const text = `${item.label} ${item.unit || ""}`.toLowerCase();
    if (/pressure|bar|psi/.test(text)) return "pressure";
    if (/level|tank|meter|\bm\b/.test(text)) return "level";
    return item.kind === "reading" ? "reading" : "equipment";
  }, [item.kind, item.label, item.unit]);
  const publish = useCallback((next: VisionDetection[]) => {
    latestDetections.current = next;
    setDetections(next);
    setSelected((current) => current && next.some((d) => d.id === current) ? current : next[0]?.id || null);
  }, []);
  const stabilizeGauge = useCallback((raw: VisionDetection[]) => raw.map((detection) => {
    if (detection.kind !== "gauge" || detection.needleAngle == null) return detection;
    angleHistory.current = [...angleHistory.current, detection.needleAngle].slice(-7);
    const stable = isStable(angleHistory.current);
    const ambiguity180 = hasOppositeAmbiguity(angleHistory.current);
    return {
      ...detection,
      stable: stable && !ambiguity180,
      value: stable && !ambiguity180 && cal ? detection.value : undefined,
      warning: !cal ? "Calibration required" : ambiguity180 ? "Needle direction uncertain" : stable ? undefined : angleHistory.current.length < 5 ? "Reading..." : "Hold steady",
      debug: detection.debug ? { ...detection.debug, stable, ambiguity180 } : detection.debug,
    };
  }), [cal]);
  const runLiveOcr = useCallback(async () => {
    const source = canvas.current;
    if (!source || ocrBusy.current || !settings.ocrEnabled || Date.now() - lastOcrAt.current < OCR_INTERVAL || !shouldRunDigitalOcr(latestDetections.current)) return;
    ocrBusy.current = true;
    lastOcrAt.current = Date.now();
    try {
      const result = await recognizeLocal(source);
      if (!shouldRunDigitalOcr(latestDetections.current)) return;
      setOcr(result.text);
      const match = matchEquipment(result.text, equipmentLabels)[0];
      if (readingContext !== "equipment" && result.value != null) {
        valueHistory.current = [...valueHistory.current, result.value].slice(-7);
        const stable = isNumericStable(valueHistory.current);
        publish([{ id: "live-digital", kind: "digital", label: "Digital Display", box: result.box || { x: 0.18, y: 0.3, width: 0.64, height: 0.4 }, confidence: result.confidence, value: stable ? result.value : undefined, rawText: result.text, stable, quality: emptyQuality(result.confidence), warning: stable ? undefined : "Reading... Hold steady" }]);
      } else if (match) {
        publish([{ id: "live-tag", kind: "tag", label: match.label, box: result.box || { x: 0.2, y: 0.35, width: 0.6, height: 0.25 }, confidence: Math.min(result.confidence, match.score), rawText: result.text, stable: true, quality: emptyQuality(result.confidence) }]);
      }
    } catch {
      // Offline OCR is best-effort; gauge processing and manual entry continue.
    } finally {
      ocrBusy.current = false;
    }
  }, [equipmentLabels, publish, readingContext, settings.ocrEnabled]);
  const handleVision = useCallback((raw: VisionDetection[]) => {
    workerBusy.current = false;
    const next = stabilizeGauge(raw);
    if (next.length) publish(next);
    else { publish([]); void runLiveOcr(); }
  }, [publish, runLiveOcr, stabilizeGauge]);
  useEffect(() => {
    try {
      worker.current = new Worker(new URL("../../workers/vision.worker.ts", import.meta.url), { type: "module" });
      worker.current.onmessage = (event) => handleVision(event.data.detections as VisionDetection[]);
      worker.current.onerror = () => { workerBusy.current = false; };
    } catch { worker.current = null; }
    return () => worker.current?.terminate();
  }, [handleVision]);
  useEffect(() => {
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then((media) => {
      if (!active) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      if (video.current) video.current.srcObject = media;
    }).catch(() => toast.error("Camera unavailable. Use manual entry."));
    return () => { active = false; stream.current?.getTracks().forEach((track) => track.stop()); };
  }, [facing]);
  const process = useCallback(() => {
    const source = video.current;
    const target = canvas.current;
    if (!source || !target || !source.videoWidth || paused || freezeFrame || workerBusy.current || !settings.aiCameraEnabled) return;
    target.width = 480;
    target.height = Math.max(270, Math.round((480 * source.videoHeight) / source.videoWidth));
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(source, 0, 0, target.width, target.height);
    const image = context.getImageData(0, 0, target.width, target.height);
    if (worker.current) {
      workerBusy.current = true;
      worker.current.postMessage({ id: Date.now(), image, calibration: cal }, [image.data.buffer]);
    } else handleVision(analyseGauge(image, cal));
  }, [cal, freezeFrame, handleVision, paused, settings.aiCameraEnabled]);
  useEffect(() => {
    process();
    const interval = Math.min(500, Math.max(350, settings.processingInterval || 450));
    const id = window.setInterval(process, interval);
    return () => window.clearInterval(id);
  }, [process, settings.processingInterval]);
  const saveEvidence = () => {
    const source = video.current;
    const target = canvas.current;
    if (!source || !target || !source.videoWidth) return;
    target.width = settings.imageQuality === "high" ? 1600 : 1000;
    target.height = Math.round(target.width * (source.videoHeight / source.videoWidth));
    target.getContext("2d")?.drawImage(source, 0, 0, target.width, target.height);
    setEvidencePhoto(target.toDataURL("image/jpeg", 0.82));
    toast.success("Evidence photo saved locally");
  };
  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); }
    catch { toast.info("Torch is not supported on this device"); }
  };
  const chosen = detections.find((d) => d.id === selected) || detections[0];
  const canConfirm = canConfirmLiveDetection(chosen, settings.confidenceThreshold);
  const confirmReading = () => {
    if (!chosen || !canConfirm || !canvas.current) return;
    setPaused(true);
    setFreezeFrame(canvas.current.toDataURL("image/jpeg", 0.72));
    confirm({ photo: evidencePhoto, detection: chosen, ocrRawText: ocr, timestamp: new Date().toISOString(), equipment: item.equipment });
  };
  return <div className="camera-screen">
    <div className="camera-head">
      <button className="icon-btn light" onClick={back} aria-label="Close camera"><X /></button>
      <div><small>{round.stationName} · {item.equipment} · {readingContext}</small><b>{item.label}</b></div>
      <div>
        <button className="icon-btn light" onClick={toggleTorch} aria-label="Torch"><Flashlight /></button>
        <button className="icon-btn light" onClick={() => setFacing(facing === "environment" ? "user" : "environment")} aria-label="Switch camera"><RotateCcw /></button>
      </div>
    </div>
    <div className="camera-stage">
      <video ref={video} autoPlay playsInline muted />
      {freezeFrame && <img src={freezeFrame} alt="Confirmed live frame" />}
      {settings.showBoundingBoxes && <VisionOverlay detections={detections} selected={selected} onSelect={setSelected} showConfidence={settings.showConfidence} debugMode={settings.aiDebugMode} />}
      <canvas ref={canvas} hidden />
    </div>
    <div className="camera-info">
      <span><Camera /> Live AI · On-device</span>
      <p>Analysis starts automatically. No photo is required for a result.</p>
      <DetectionCard detection={chosen} threshold={settings.confidenceThreshold} unit={item.unit} />
      {settings.aiDebugMode && chosen && <pre>{JSON.stringify(chosen, null, 2)}</pre>}
    </div>
    <div className="camera-controls live-controls">
      <button className="btn primary live-confirm" disabled={!canConfirm} onClick={confirmReading}>Confirm Reading</button>
      <button className="manual-link" onClick={back}>Enter Manually</button>
      <button className="evidence-button" onClick={saveEvidence}><Camera size={18} /> {evidencePhoto ? "Photo Saved" : "Save Photo"}</button>
      <button className="icon-btn light" onClick={() => setPaused(!paused)} aria-label={paused ? "Resume AI" : "Pause AI"}>{paused ? <Play /> : <Pause />}</button>
    </div>
  </div>;
}
