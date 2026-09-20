"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  analyseGauge,
  shouldRunDigitalOcr,
  type VisionDetection,
} from "@/lib/vision";
import { recognizeLocal } from "@/lib/ocr";
import { VisionOverlay } from "@/components/camera/VisionOverlay";
import { DetectionCard } from "@/components/camera/DetectionCard";
import { GeneralObjectDetector, GENERAL_MODEL_NAME } from "@/lib/general-object-detector";
import { mergePipelineResults } from "@/lib/vision-orchestrator";
import { MasaIndustrialDetector } from "@/lib/industrial-vision";
import { ObservationModelStatus } from "@/lib/observation-models";
export default function VisionTest() {
  const [image, setImage] = useState("/test-vision/gauge.svg"),
    [detections, setDetections] = useState<VisionDetection[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [modelReady, setModelReady] = useState(false);
  const [industrialStatus, setIndustrialStatus] = useState("MASA Industrial Model: Loading");
  const [industrialStats, setIndustrialStats] = useState<{ ready: boolean; detections: number; inferenceMs: number; modelVersion: string }>({ ready: false, detections: 0, inferenceMs: 0, modelVersion: "not-installed" });
  const [cameraOn, setCameraOn] = useState(false), [observationStatus, setObservationStatus] = useState("Observation models: Loading");
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | undefined>(undefined);
  const general = useRef<GeneralObjectDetector | undefined>(undefined);
  const industrial = useRef<MasaIndustrialDetector | undefined>(undefined);
  useEffect(() => {
    const detector = new GeneralObjectDetector();
    general.current = detector;
    detector.load().then(setModelReady);
    return () => detector.close();
  }, []);
  useEffect(() => {
    const detector = new MasaIndustrialDetector();
    industrial.current = detector;
    detector.load().then((ready) => { setIndustrialStatus(detector.status()); setIndustrialStats({ ready, ...detector.stats }); });
    return () => detector.dispose();
  }, []);
  useEffect(() => { const status = new ObservationModelStatus(); void status.load().then(() => setObservationStatus(status.status())); return () => cameraStream.current?.getTracks().forEach((track) => track.stop()); }, []);
  const startCamera = async () => { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }); cameraStream.current = stream; setCameraOn(true); requestAnimationFrame(() => { if (camera.current) camera.current.srcObject = stream; }); };
  const run = async () => {
    setBusy(true);
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    if (cameraOn && camera.current?.videoWidth) { c.width = 640; c.height = Math.round(640 * camera.current.videoHeight / camera.current.videoWidth); ctx.drawImage(camera.current, 0, 0, c.width, c.height); }
    else { const img = new Image(); img.src = image; await img.decode(); c.width = 640; c.height = Math.round((640 * img.height) / img.width); ctx.drawImage(img, 0, 0, c.width, c.height); }
    const gauge = analyseGauge(ctx.getImageData(0, 0, c.width, c.height));
    const common = await general.current?.detect(c) || [];
    const masa = await industrial.current?.detect(c) || [];
    if (industrial.current) setIndustrialStats({ ready: industrial.current.isReady(), ...industrial.current.stats });
    const ocrDetections: VisionDetection[] = [];
    if (shouldRunDigitalOcr(gauge))
      try {
        const ocr = await recognizeLocal(c);
        const tag = ocr.text.toUpperCase().match(/\b[A-Z]{2,}(?:[- ][A-Z0-9]+)+\b/)?.[0];
        if (tag)
          ocrDetections.push({
            id: "equipment-tag",
            kind: "tag",
            label: `Equipment Tag: ${tag}`,
            rawText: ocr.text,
            confidence: ocr.confidence,
            source: "equipment-ocr",
            box: ocr.box || { x: 0.2, y: 0.35, width: 0.6, height: 0.3 },
            quality: { brightness: 0, contrast: 0, sharpness: 0, glare: 0, score: ocr.confidence, warnings: [] },
          });
        if (ocr.value != null)
          ocrDetections.push({
            id: "ocr",
            kind: "digital",
            label: "Digital display",
            value: ocr.value,
            rawText: ocr.text,
            confidence: ocr.confidence,
            source: "digital-ocr",
            box: { x: 0.2, y: 0.35, width: 0.6, height: 0.3 },
            quality: {
              brightness: 0,
              contrast: 0,
              sharpness: 0,
              glare: 0,
              score: ocr.confidence,
              warnings: [],
            },
          });
      } catch {}
    const merged = mergePipelineResults([
      { source: "masa-industrial", detections: masa, status: industrial.current?.status() },
      { source: "general", detections: common },
      { source: "gauge", detections: gauge },
      { source: "digital-ocr", detections: ocrDetections },
    ]).detections;
    setDetections(merged);
    setSelected(merged[0]?.id || null);
    setBusy(false);
  };
  return (
    <main className="vision-test">
      <p className="eyebrow">DEVELOPER TOOL</p>
      <h1>Vision Test Lab</h1>
      <p>
        Run general objects, gauge geometry and OCR against one image. No
        upload leaves this browser.
      </p>
      <section className="panel">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setImage(URL.createObjectURL(f));
          }}
        />
        <div className="chips">
          <button onClick={() => void startCamera()}>Camera Test</button>
          <button onClick={() => setImage("/test-vision/general-objects.jpg")}>
            COCO common objects
          </button>
          <button onClick={() => setImage("/test-vision/gauge.svg")}>
            Synthetic gauge
          </button>
          <button onClick={() => setImage("/test-vision/digital-display.svg")}>
            Digital display
          </button>
        </div>
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "Processing…" : modelReady ? "Run all local pipelines" : "Loading AI…"}
        </button>
      </section>
      <div className="vision-lab">
        <div className="test-canvas">
          {cameraOn ? <video ref={camera} autoPlay muted playsInline /> : <img src={image} alt="Vision test input" />}
          <VisionOverlay
            detections={detections}
            selected={selected}
            onSelect={setSelected}
            debugMode
          />
          <canvas ref={canvas} hidden />
        </div>
        <DetectionCard
          detection={detections.find((d) => d.id === selected) || detections[0]}
        />
      </div>
      <section className="panel">
        <h2>MASA Industrial Detection</h2>
        <p>{industrialStatus}</p>
        <p>{industrialStats.ready ? `${industrialStats.detections} objects · ${industrialStats.inferenceMs.toFixed(1)} ms · model ${industrialStats.modelVersion}` : "No industrial labels are emitted until a trained model and metadata are installed."}</p>
      </section>
      <section className="panel"><h2>Specialized pipeline results</h2><div className="details-grid"><div><small>Equipment Tag</small><b>{detections.filter((item) => item.kind === "tag").length} result(s)</b></div><div><small>Gauge</small><b>{detections.filter((item) => item.kind === "gauge").length} result(s)</b></div><div><small>Digital OCR</small><b>{detections.filter((item) => item.kind === "digital").length} result(s)</b></div><div><small>Panel / Sight glass</small><b>{observationStatus}</b></div><div><small>Leak / Pooling / Corrosion</small><b>{observationStatus}</b></div><div><small>General</small><b>{detections.filter((item) => item.source === "general").length} result(s)</b></div></div></section>
      <section className="panel">
        <h2>General Object Detection</h2>
        <p>{GENERAL_MODEL_NAME} · {modelReady ? "AI Ready" : "Loading AI..."}</p>
        <div className="table-wrap"><table><thead><tr><th>Object</th><th>Class</th><th>Confidence</th><th>Bounding box</th><th>Source</th></tr></thead><tbody>
          {detections.map((d) => <tr key={d.id}><td>{d.label}</td><td>{d.kind}</td><td>{Math.round(d.confidence * 100)}%</td><td>{[d.box.x,d.box.y,d.box.width,d.box.height].map((n) => n.toFixed(2)).join(", ")}</td><td>{d.source || "legacy"}</td></tr>)}
        </tbody></table></div>
      </section>
      {detections[0]?.debug && (
        <section className="panel">
          <h2>Gauge diagnostics</h2>
          <div className="details-grid">
            <div>
              <small>Classification</small>
              <b>Analog Gauge</b>
            </div>
            <div>
              <small>Gauge center</small>
              <b>
                {detections[0].debug.center.x.toFixed(3)},{" "}
                {detections[0].debug.center.y.toFixed(3)}
              </b>
            </div>
            <div>
              <small>Radius</small>
              <b>{detections[0].debug.radius.toFixed(3)}</b>
            </div>
            <div>
              <small>Selected needle angle</small>
              <b>{detections[0].needleAngle?.toFixed(1)}°</b>
            </div>
            <div>
              <small>Opposite angle</small>
              <b>{detections[0].debug.oppositeAngle.toFixed(1)}°</b>
            </div>
            <div>
              <small>Needle score</small>
              <b>{detections[0].debug.needleScore.toFixed(3)}</b>
            </div>
            <div>
              <small>Counterweight score</small>
              <b>{detections[0].debug.oppositeDirectionScore.toFixed(3)}</b>
            </div>
            <div>
              <small>Analog score</small>
              <b>{detections[0].debug.analogGaugeScore.toFixed(3)}</b>
            </div>
            <div>
              <small>Digital score</small>
              <b>{detections[0].debug.digitalDisplayScore.toFixed(3)}</b>
            </div>
            <div>
              <small>Circle confidence</small>
              <b>{detections[0].debug.circleConfidence.toFixed(3)}</b>
            </div>
            <div>
              <small>Center hub confidence</small>
              <b>{detections[0].debug.centerHubConfidence.toFixed(3)}</b>
            </div>
            <div>
              <small>Scale ring evidence</small>
              <b>{detections[0].debug.scaleRingEvidence.toFixed(3)}</b>
            </div>
            <div>
              <small>Rectangle display confidence</small>
              <b>{detections[0].debug.rectangleDisplayConfidence.toFixed(3)}</b>
            </div>
            <div>
              <small>Calibration</small>
              <b>Missing</b>
            </div>
          </div>
        </section>
      )}
      <Link className="back-link" href="/">
        ‹ Back to application
      </Link>
    </main>
  );
}
