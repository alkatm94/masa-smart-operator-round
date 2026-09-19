"use client";
import { useRef, useState } from "react";
import { Camera, Download } from "lucide-react";
import { toast } from "sonner";
import type { AppState, DataCollectionRecord } from "@/lib/local-store";
import { INDUSTRIAL_MODEL_CLASSES } from "@/lib/vision-orchestrator";
import { exportDatasetZip } from "@/lib/dataset-export";

export function DataCollectionPanel({ state, setState }: { state: AppState; setState: (state: AppState) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [classLabel, setClassLabel] = useState<(typeof INDUSTRIAL_MODEL_CLASSES)[number]>("pump");
  const [position, setPosition] = useState<"unknown" | "0" | "25" | "50" | "75" | "100">("unknown");
  const [stationId, setStationId] = useState(state.activeRound?.stationId || "");
  const [equipment, setEquipment] = useState(state.activeRound?.items[0]?.equipment || "");
  const capture = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const record: DataCollectionRecord = { id: crypto.randomUUID(), imageDataUrl: String(reader.result), classLabel, stationId, equipment, capturedAt: new Date().toISOString(), knownValvePosition: position === "unknown" ? "unknown" : Number(position) as 0 | 25 | 50 | 75 | 100 };
      setState({ ...state, dataCollection: [...state.dataCollection, record] });
      toast.success("Dataset image saved locally");
    };
    reader.readAsDataURL(file);
  };
  const download = async () => {
    if (!state.dataCollection.length) return toast.info("Capture at least one dataset image first");
    const blob = await exportDatasetZip(state.dataCollection);
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `masa-industrial-dataset-${new Date().toISOString().slice(0, 10)}.zip`; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  return <section className="panel">
    <h2>Industrial Data Collection</h2>
    <p className="muted">Field images stay on this device until you export a training ZIP.</p>
    <label>Station<input value={stationId} onChange={(event) => setStationId(event.target.value)} placeholder="Station ID" /></label>
    <label>Equipment<input value={equipment} onChange={(event) => setEquipment(event.target.value)} placeholder="Equipment tag" /></label>
    <label>Object class<select value={classLabel} onChange={(event) => setClassLabel(event.target.value as typeof classLabel)}>{INDUSTRIAL_MODEL_CLASSES.map((label) => <option key={label}>{label}</option>)}</select></label>
    {(classLabel === "valve" || classLabel === "valve_indicator" || classLabel === "handwheel") && <label>Known valve position<select value={position} onChange={(event) => setPosition(event.target.value as typeof position)}><option value="unknown">Unknown</option>{[0,25,50,75,100].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>}
    <button className="btn secondary" onClick={() => input.current?.click()}><Camera /> Capture Dataset Image</button>
    <input ref={input} hidden type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) capture(file); event.currentTarget.value = ""; }} />
    <button className="btn secondary" onClick={download}><Download /> Export Dataset ZIP ({state.dataCollection.length})</button>
  </section>;
}
