"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Flashlight, Pause, Play, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { AppState, Round, RoundItem } from "@/lib/local-store";
import {
  analyseGauge,
  hasOppositeAmbiguity,
  isStable,
  type VisionDetection,
} from "@/lib/vision";
import { recognizeLocal } from "@/lib/ocr";
import { VisionOverlay } from "./VisionOverlay";
import { DetectionCard } from "./DetectionCard";
export interface CameraResult {
  photo: string;
  detection?: VisionDetection;
  ocrRawText?: string;
}
export default function AICameraScreen({
  item,
  round,
  settings,
  calibration,
  back,
  confirm,
}: {
  item: RoundItem;
  round: Round;
  settings: AppState["settings"];
  calibration?: AppState["calibrations"][number];
  back: () => void;
  confirm: (r: CameraResult) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    worker = useRef<Worker | null>(null),
    stream = useRef<MediaStream | null>(null),
    angleHistory = useRef<number[]>([]);
  const [photo, setPhoto] = useState<string | null>(null),
    [facing, setFacing] = useState<"environment" | "user">("environment"),
    [paused, setPaused] = useState(false),
    [detections, setDetections] = useState<VisionDetection[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [torch, setTorch] = useState(false),
    [ocr, setOcr] = useState<string>();
  const cal = useMemo(
    () =>
      calibration
        ? {
            minValue: calibration.minValue,
            maxValue: calibration.maxValue,
            minAngle: calibration.minAngle,
            maxAngle: calibration.maxAngle,
            center: calibration.center,
            radius: calibration.radius,
          }
        : undefined,
    [calibration],
  );
  const stabilize = useCallback(
    (raw: VisionDetection[]) =>
      raw.map((d) => {
        if (d.kind !== "gauge" || d.needleAngle == null) return d;
        angleHistory.current = [...angleHistory.current, d.needleAngle].slice(
          -7,
        );
        const stable = isStable(angleHistory.current),
          ambiguity180 = hasOppositeAmbiguity(angleHistory.current);
        return {
          ...d,
          value: stable && !ambiguity180 ? d.value : undefined,
          warning: !cal
            ? "Calibration required before numeric reading"
            : ambiguity180
              ? "180° needle/counterweight ambiguity — hold steady"
              : stable
                ? d.warning
                : "Scanning — waiting for a stable needle",
          debug: d.debug ? { ...d.debug, stable, ambiguity180 } : d.debug,
        };
      }),
    [cal],
  );
  useEffect(() => {
    try {
      worker.current = new Worker(
        new URL("../../workers/vision.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current.onmessage = (e) => {
        const next = stabilize(e.data.detections as VisionDetection[]);
        setDetections(next);
        setSelected((s: string | null) => s || next[0]?.id || null);
      };
    } catch {}
    return () => worker.current?.terminate();
  }, [stabilize]);
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => toast.error("Camera unavailable. Use manual entry."));
    return () => {
      active = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);
  const process = useCallback(() => {
    const v = video.current,
      c = canvas.current;
    if (
      !v ||
      !c ||
      !v.videoWidth ||
      paused ||
      photo ||
      !settings.aiCameraEnabled
    )
      return;
    c.width = 480;
    c.height = Math.max(270, Math.round((480 * v.videoHeight) / v.videoWidth));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const image = ctx.getImageData(0, 0, c.width, c.height);
    if (worker.current)
      worker.current.postMessage({ id: Date.now(), image, calibration: cal }, [
        image.data.buffer,
      ]);
    else setDetections(stabilize(analyseGauge(image, cal)));
  }, [paused, photo, settings.aiCameraEnabled, cal, stabilize]);
  useEffect(() => {
    const id = setInterval(process, Math.max(250, settings.processingInterval));
    return () => clearInterval(id);
  }, [process, settings.processingInterval]);
  const capture = async () => {
    const v = video.current,
      c = canvas.current;
    if (!v || !c) return;
    c.width = settings.imageQuality === "high" ? 1600 : 1000;
    c.height = Math.round(c.width * (v.videoHeight / v.videoWidth || 0.75));
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    const p = c.toDataURL("image/jpeg", 0.82);
    setPhoto(p);
    const liveGauge = detections.filter((d) => d.kind === "gauge");
    const capturedGauge = liveGauge.length
      ? liveGauge
      : settings.gaugeDetectionEnabled
        ? analyseGauge(
            c.getContext("2d")!.getImageData(0, 0, c.width, c.height),
            cal,
          ).map((d) => ({
            ...d,
            value: undefined,
            warning: !cal
              ? "Calibration required before numeric reading"
              : "Waiting for a stable live reading",
          }))
        : [];
    if (capturedGauge.length) {
      setDetections(capturedGauge);
      setSelected(capturedGauge[0].id);
      return;
    }
    if (settings.ocrEnabled)
      try {
        const result = await recognizeLocal(c);
        setOcr(result.text);
        if (result.value != null) {
          const base = detections[0] || {
            id: "digital-0",
            kind: "digital" as const,
            label: "Digital display",
            box: { x: 0.18, y: 0.3, width: 0.64, height: 0.4 },
            confidence: 0,
            quality: {
              brightness: 0,
              contrast: 0,
              sharpness: 0,
              glare: 0,
              score: result.confidence,
              warnings: [],
            },
          };
          setDetections([
            {
              ...base,
              id: "ocr-0",
              kind: "digital",
              label: "Digital display",
              value: result.value,
              rawText: result.text,
              confidence: result.confidence,
            },
          ]);
          setSelected("ocr-0");
        }
      } catch {
        toast.info(
          "OCR unavailable offline; manual confirmation remains available",
        );
      }
  };
  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torch } as MediaTrackConstraintSet],
      });
      setTorch(!torch);
    } catch {
      toast.info("Torch is not supported on this device");
    }
  };
  const chosen = detections.find((d) => d.id === selected) || detections[0];
  return (
    <div className="camera-screen">
      <div className="camera-head">
        <button className="icon-btn light" onClick={back}>
          <X />
        </button>
        <div>
          <small>
            {round.stationName} · {item.equipment}
          </small>
          <b>{item.label}</b>
        </div>
        <div>
          <button className="icon-btn light" onClick={toggleTorch}>
            <Flashlight />
          </button>
          <button
            className="icon-btn light"
            onClick={() =>
              setFacing(facing === "environment" ? "user" : "environment")
            }
          >
            <RotateCcw />
          </button>
        </div>
      </div>
      <div className="camera-stage">
        {photo ? (
          <img src={photo} alt="Captured inspection" />
        ) : (
          <video ref={video} autoPlay playsInline muted />
        )}
        {settings.showBoundingBoxes && (
          <VisionOverlay
            detections={detections}
            selected={selected}
            onSelect={setSelected}
            showConfidence={settings.showConfidence}
            debugMode={settings.aiDebugMode}
          />
        )}
        <canvas ref={canvas} hidden />
      </div>
      <div className="camera-info">
        <span>
          <Camera /> Local AI Camera
        </span>
        <p>
          No image leaves this device. Results never save without operator
          confirmation.
        </p>
        <DetectionCard
          detection={chosen}
          threshold={settings.confidenceThreshold}
        />
        {settings.aiDebugMode && chosen && (
          <pre>{JSON.stringify(chosen, null, 2)}</pre>
        )}
      </div>
      <div className="camera-controls">
        {photo ? (
          <>
            <button
              className="btn secondary"
              onClick={() => {
                setPhoto(null);
                setOcr(undefined);
              }}
            >
              Retake
            </button>
            <button
              className="btn primary"
              onClick={() =>
                confirm({ photo, detection: chosen, ocrRawText: ocr })
              }
            >
              Use Photo
            </button>
          </>
        ) : (
          <>
            <button className="manual-link" onClick={back}>
              Manual entry
            </button>
            <button
              className="icon-btn light"
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play /> : <Pause />}
            </button>
            <button
              className="shutter"
              onClick={capture}
              aria-label="Capture photo"
            >
              <span />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
