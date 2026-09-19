"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { AppState } from "@/lib/local-store";

export function ValveCalibrationPanel({ state, setState }: { state: AppState; setState: (state: AppState) => void }) {
  const [stationId, setStationId] = useState(state.activeRound?.stationId || "");
  const [equipment, setEquipment] = useState(state.activeRound?.items[0]?.equipment || "");
  const [closedAngle, setClosedAngle] = useState(0), [openAngle, setOpenAngle] = useState(90);
  const [direction, setDirection] = useState<"clockwise-opens" | "counterclockwise-opens">("clockwise-opens");
  const save = () => {
    if (!stationId.trim() || !equipment.trim()) return toast.error("Station and equipment are required");
    const calibration = { id: `${stationId}:${equipment}`, stationId: stationId.trim(), equipment: equipment.trim(), closedAngle, openAngle, direction };
    setState({ ...state, valveCalibrations: [...state.valveCalibrations.filter((item) => item.id !== calibration.id), calibration] });
    toast.success("Valve calibration saved locally");
  };
  return <section className="panel"><h2>Valve indicator calibration</h2><p className="muted">Record the indicator angles at mechanically verified closed and open positions. Handwheels without an indicator never produce a percentage.</p>
    <label>Station<input value={stationId} onChange={(event) => setStationId(event.target.value)} /></label>
    <label>Equipment<input value={equipment} onChange={(event) => setEquipment(event.target.value)} /></label>
    <label>Closed angle<input type="number" min="0" max="359" value={closedAngle} onChange={(event) => setClosedAngle(Number(event.target.value))} /></label>
    <label>Open angle<input type="number" min="0" max="359" value={openAngle} onChange={(event) => setOpenAngle(Number(event.target.value))} /></label>
    <label>Opening direction<select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="clockwise-opens">Clockwise opens</option><option value="counterclockwise-opens">Counterclockwise opens</option></select></label>
    <button className="btn secondary" onClick={save}>Save Valve Calibration</button><p className="muted">{state.valveCalibrations.length} saved calibration(s)</p>
  </section>;
}
