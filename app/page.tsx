"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  Camera,
  Check,
  ChevronLeft,
  ClipboardCheck,
  Download,
  FileText,
  Gauge,
  Home,
  Image as ImageIcon,
  LogOut,
  Menu,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { stations, seedHistory } from "@/lib/demo-data";
import {
  loadState,
  saveState,
  exportJson,
  importJson,
  resetState,
  type AppState,
  type Round,
  type RoundItem,
} from "@/lib/local-store";
import {
  calculateComparison,
  calculateTankRate,
  gaugeAngleToReading,
  validateRoundCompletion,
} from "@/lib/calculations";
import AICameraScreen, {
  type CameraResult,
} from "@/components/camera/AICameraScreen";
import { DataCollectionPanel } from "@/components/camera/DataCollectionPanel";
import { ValveCalibrationPanel } from "@/components/camera/ValveCalibrationPanel";

type View =
  | "login"
  | "home"
  | "start"
  | "round"
  | "camera"
  | "entry"
  | "summary"
  | "history"
  | "reports"
  | "stations"
  | "settings"
  | "calibration";
const nav: { view: View; label: string; icon: typeof Home }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "round", label: "Round", icon: ClipboardCheck },
  { view: "history", label: "History", icon: Archive },
  { view: "reports", label: "Reports", icon: FileText },
  { view: "settings", label: "Settings", icon: Settings },
];

export default function HomePage() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("login");
  const [selectedStation, setSelectedStation] = useState(stations[3].id);
  const [roundType, setRoundType] = useState<Round["type"]>("Routine Round");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState("All");
  useEffect(() => {
    loadState().then((s) => {
      setState(s);
      if (s.session) setView(s.activeRound ? "round" : "home");
    });
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    if (state) saveState(state);
  }, [state]);
  const round = state?.activeRound;
  const item = round?.items.find((i) => i.id === selectedItem);
  const go = (v: View) => {
    if (v === "round" && !round) {
      toast.info("No active round");
      return;
    }
    setView(v);
    scrollTo(0, 0);
  };
  if (!state)
    return (
      <div className="splash">
        <img src="/masa-logo.png" alt="MASA" />
        <div className="loader" />
      </div>
    );
  const login = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({
      ...state,
      session: {
        id: "demo",
        name: "Ahmed Al-Harbi",
        username: String(fd.get("username") || "OP-1042"),
        group: String(fd.get("group") || "B"),
      },
    });
    setView("home");
  };
  const startRound = () => {
    const station = stations.find((s) => s.id === selectedStation)!;
    const now = new Date().toISOString();
    const r: Round = {
      id: crypto.randomUUID(),
      stationId: station.id,
      stationName: station.name,
      operator: state.session!.name,
      group: state.session!.group,
      type: roundType,
      status: "active",
      startedAt: now,
      items: station.checkpoints.map((c, n) => ({
        ...c,
        id: `${station.id}-${n}-${Date.now()}`,
        status: "pending" as const,
        photos: [],
        notes: "",
      })),
    };
    setState({ ...state, activeRound: r });
    setView("round");
    toast.success(`${station.name} round started`);
  };
  const updateItem = (patch: Partial<RoundItem>) => {
    if (!round || !item) return;
    const updated = { ...item, ...patch };
    setState({
      ...state,
      activeRound: {
        ...round,
        items: round.items.map((x) => (x.id === item.id ? updated : x)),
      },
    });
  };
  const finishRound = () => {
    if (!round) return;
    const validation = validateRoundCompletion(round.items);
    if (!validation.valid) {
      toast.error(`${validation.remaining} required checks remaining`);
      return;
    }
    setView("summary");
  };
  const confirmFinish = () => {
    if (!round) return;
    const completed: Round = {
      ...round,
      status: "completed",
      finishedAt: new Date().toISOString(),
    };
    setState({
      ...state,
      activeRound: null,
      rounds: [completed, ...state.rounds],
    });
    setView("home");
    toast.success("Round completed and locked");
  };
  const logOut = () => {
    setState({ ...state, session: null });
    setView("login");
  };
  const acceptCamera = ({
    photo,
    detection,
    ocrRawText,
    timestamp,
  }: CameraResult) => {
    if (!item) return;
    const comparison = calculateComparison(item.previous, detection.value!);
    const threshold =
      item.unit === "bar"
        ? state.settings.pressureThreshold
        : item.unit === "m"
          ? state.settings.tankThreshold
          : state.settings.conductivityThreshold;
    const needsAttention = Math.abs(comparison.percent || 0) > threshold;
    updateItem({
      photos: photo ? [...item.photos, photo] : item.photos,
      visionType: detection?.kind,
      detectedLabel: detection?.label,
      aiDetectedValue: detection?.value,
      aiConfidence: detection?.confidence,
      ocrRawText,
      needleAngle: detection?.needleAngle,
      qualityScore: detection?.quality.score,
      value: detection.value,
      confirmedValue: detection.value,
      status: needsAttention ? "attention" : "completed",
      confirmedByUser: true,
      processingVersion: "vision-live-1",
      visionTimestamp: timestamp,
    });
    setView("round");
    toast.success("Live reading confirmed");
  };
  return (
    <div className="app-shell">
      <Toaster position="top-center" richColors />
      {view === "login" ? (
        <Login onSubmit={login} />
      ) : (
        <>
          <Header state={state} view={view} go={go} logOut={logOut} />
          <main className="main-content">
            {view === "home" && <Dashboard state={state} go={go} />}{" "}
            {view === "start" && (
              <StartRound
                station={selectedStation}
                setStation={setSelectedStation}
                type={roundType}
                setType={setRoundType}
                start={startRound}
                user={state.session!}
              />
            )}{" "}
            {view === "round" && round && (
              <ActiveRound
                round={round}
                select={(id, mode) => {
                  setSelectedItem(id);
                  setView(mode);
                }}
                finish={finishRound}
              />
            )}{" "}
            {view === "camera" && item && round && (
              <AICameraScreen
                item={item}
                round={round}
                settings={state.settings}
                calibration={state.calibrations.find(
                  (c) => c.stationId === round.stationId && c.equipment === item.equipment,
                )}
                valveCalibration={state.valveCalibrations.find((c) => c.stationId === round.stationId && c.equipment === item.equipment)}
                back={() => setView("round")}
                confirm={acceptCamera}
              />
            )}{" "}
            {view === "entry" && item && round && (
              <EntryScreen
                item={item}
                round={round}
                settings={state.settings}
                save={(patch) => {
                  updateItem(patch);
                  setView("round");
                  toast.success("Check saved locally");
                }}
                back={() => setView("round")}
              />
            )}{" "}
            {view === "summary" && round && (
              <RoundSummary
                round={round}
                confirm={confirmFinish}
                back={() => setView("round")}
              />
            )}{" "}
            {view === "history" && (
              <History
                rounds={[...state.rounds, ...seedHistory]}
                filter={historyFilter}
                setFilter={setHistoryFilter}
              />
            )}{" "}
            {view === "reports" && (
              <Reports rounds={[...state.rounds, ...seedHistory]} />
            )}{" "}
            {view === "stations" && <Stations />}{" "}
            {view === "settings" && (
              <SettingsPage state={state} setState={setState} go={go} />
            )}{" "}
            {view === "calibration" && (
              <Calibration state={state} setState={setState} />
            )}
          </main>
          <BottomNav view={view} go={go} />
        </>
      )}
    </div>
  );
}

function Login({
  onSubmit,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-lockup">
          <img src="/masa-logo.png" alt="MASA logo" />
          <span />
          <img src="/marafiq-logo.png" alt="Marafiq logo" />
        </div>
        <p className="eyebrow">FIELD OPERATIONS</p>
        <h1>
          MASA Smart
          <br />
          Operator Round
        </h1>
        <p className="subtitle">
          Digital Field Inspection & Operator Round System
        </p>
        <form onSubmit={onSubmit}>
          <label>
            Operator ID / Username
            <input
              name="username"
              defaultValue="OP-1042"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              defaultValue="demo123"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            Group
            <select name="group" defaultValue="B">
              {["A", "B", "C", "D"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <button className="btn primary" type="submit">
            Sign In <ChevronLeft size={19} />
          </button>
        </form>
        <div className="demo-note">
          <ShieldCheck size={17} />
          <span>Demo account is stored locally on this device.</span>
        </div>
        <p className="safety">
          Inspection and logging only — no equipment control
        </p>
      </section>
    </main>
  );
}
function Header({
  state,
  view,
  go,
  logOut,
}: {
  state: AppState;
  view: View;
  go: (v: View) => void;
  logOut: () => void;
}) {
  return (
    <header className="topbar">
      <div className="top-inner">
        <button className="icon-btn mobile-only" aria-label="Menu">
          <Menu />
        </button>
        <button className="brand" onClick={() => go("home")}>
          <img src="/masa-logo.png" alt="MASA" />
          <span>
            <b>Smart Operator Round</b>
            <small>FIELD OPERATIONS</small>
          </span>
        </button>
        <nav className="desktop-nav">
          {nav.map((n) => (
            <button
              key={n.view}
              className={view === n.view ? "active" : ""}
              onClick={() => go(n.view)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="operator">
          <span className="avatar">AH</span>
          <span>
            <b>{state.session?.name}</b>
            <small>Group {state.session?.group} · Online</small>
          </span>
          <button className="icon-btn" onClick={logOut} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
function Dashboard({ state, go }: { state: AppState; go: (v: View) => void }) {
  const active = state.activeRound;
  return (
    <div className="page dashboard">
      <section className="welcome">
        <div>
          <p className="eyebrow">FRIDAY, 18 SEPTEMBER 2026</p>
          <h1>Good morning, {state.session?.name.split(" ")[0]}</h1>
          <p>Group {state.session?.group} · Water Operations</p>
        </div>
        <button
          className="btn primary start"
          onClick={() => go(active ? "round" : "start")}
        >
          <Play size={20} />
          {active ? "Continue Round" : "Start New Round"}
        </button>
      </section>
      <section className="metrics">
        <Metric
          label="Today's rounds"
          value="3"
          note="2 completed"
          icon={ClipboardCheck}
        />
        <Metric
          label="Completed stations"
          value="2"
          note="of 4 assigned"
          icon={Check}
        />
        <Metric
          label="Pending stations"
          value="2"
          note="action required"
          icon={Activity}
        />
        <Metric
          label="Abnormal readings"
          value="1"
          note="requires attention"
          icon={AlertTriangle}
          warn
        />
        <Metric
          label="Open observations"
          value="3"
          note="2 follow-ups"
          icon={Wrench}
        />
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">CURRENT OPERATIONS</p>
              <h2>{active ? "Active round" : "Today’s station plan"}</h2>
            </div>
            <button
              className="text-btn"
              onClick={() => go(active ? "round" : "start")}
            >
              {active ? "Open round" : "View plan"}
              <ChevronLeft size={17} />
            </button>
          </div>
          {active ? (
            <ActiveSummary round={active} />
          ) : (
            <div className="station-plan">
              <div className="station-mark">11A</div>
              <div>
                <h3>CAMP-11A</h3>
                <p>Routine Round · Group {state.session?.group}</p>
              </div>
              <span className="badge pending">Next station</span>
            </div>
          )}
        </section>
        <section className="panel attention-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">ATTENTION</p>
              <h2>Latest findings</h2>
            </div>
          </div>
          <div className="finding">
            <span className="alert-icon">
              <AlertTriangle />
            </span>
            <div>
              <b>MP-4 discharge pressure</b>
              <p>CAMP-11A · 2.45 bar</p>
              <small>19.4% below previous reading</small>
            </div>
            <span className="badge attention">Attention</span>
          </div>
          <div className="finding">
            <span className="ok-icon">
              <Check />
            </span>
            <div>
              <b>Tank level trend</b>
              <p>JIC-H · 8.50 m</p>
              <small>Within expected rate of change</small>
            </div>
            <span className="badge completed">Normal</span>
          </div>
        </section>
      </div>
      <section className="quick-actions">
        <button onClick={() => go("history")}>
          <Archive />
          <span>
            <b>Round History</b>
            <small>Review completed rounds</small>
          </span>
        </button>
        <button onClick={() => go("reports")}>
          <FileText />
          <span>
            <b>Reports</b>
            <small>Print, PDF or CSV</small>
          </span>
        </button>
        <button onClick={() => go("stations")}>
          <Activity />
          <span>
            <b>Stations</b>
            <small>{stations.length} configured</small>
          </span>
        </button>
        <button onClick={() => go("settings")}>
          <Settings />
          <span>
            <b>Settings</b>
            <small>Thresholds & storage</small>
          </span>
        </button>
      </section>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon: Icon,
  warn,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Home;
  warn?: boolean;
}) {
  return (
    <div className={`metric ${warn ? "warn" : ""}`}>
      <span className="metric-icon">
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <p>{note}</p>
      </div>
    </div>
  );
}
function ActiveSummary({ round }: { round: Round }) {
  const done = round.items.filter((i) => i.status !== "pending").length,
    p = Math.round((done / round.items.length) * 100);
  return (
    <div className="active-summary">
      <div className="station-mark">
        {round.stationName.replace(/[^0-9A-Z]/g, "").slice(-3)}
      </div>
      <div className="grow">
        <div className="row">
          <div>
            <h3>{round.stationName}</h3>
            <p>
              {round.type} · Group {round.group}
            </p>
          </div>
          <span className="badge live">In progress</span>
        </div>
        <div className="progress">
          <i style={{ width: `${p}%` }} />
        </div>
        <div className="progress-meta">
          <span>
            {done} of {round.items.length} checks
          </span>
          <b>{p}%</b>
        </div>
      </div>
    </div>
  );
}
function StartRound({
  station,
  setStation,
  type,
  setType,
  start,
  user,
}: {
  station: string;
  setStation: (x: string) => void;
  type: Round["type"];
  setType: (x: Round["type"]) => void;
  start: () => void;
  user: { name: string; group: string };
}) {
  const s = stations.find((x) => x.id === station)!;
  return (
    <div className="page narrow">
      <div className="page-title">
        <p className="eyebrow">NEW INSPECTION</p>
        <h1>Start a station round</h1>
        <p>
          Choose a station and round type. The checklist is available offline.
        </p>
      </div>
      <section className="panel form-panel">
        <label>
          Station
          <select value={station} onChange={(e) => setStation(e.target.value)}>
            {stations.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="station-preview">
          <div className="station-mark">{s.name.slice(-3)}</div>
          <div>
            <b>{s.name}</b>
            <span>
              {s.equipmentCount} equipment · {s.checkpoints.length} required
              checks
            </span>
          </div>
          <span className="offline-dot">Offline ready</span>
        </div>
        <label>
          Round type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Round["type"])}
          >
            <option>Routine Round</option>
            <option>Special Inspection</option>
            <option>Follow-up Round</option>
          </select>
        </label>
        <div className="details-grid">
          <div>
            <small>Operator</small>
            <b>{user.name}</b>
          </div>
          <div>
            <small>Group</small>
            <b>{user.group}</b>
          </div>
          <div>
            <small>Start time</small>
            <b>On confirmation</b>
          </div>
          <div>
            <small>Required</small>
            <b>{s.checkpoints.length} checks</b>
          </div>
        </div>
        <button className="btn primary" onClick={start}>
          <Play size={20} />
          Start Round
        </button>
      </section>
    </div>
  );
}
function ActiveRound({
  round,
  select,
  finish,
}: {
  round: Round;
  select: (id: string, mode: View) => void;
  finish: () => void;
}) {
  const done = round.items.filter((i) => i.status !== "pending").length,
    p = Math.round((done / round.items.length) * 100),
    remaining = round.items.filter(
      (i) => i.required && i.status === "pending",
    ).length;
  return (
    <div className="page round-page">
      <section className="round-hero">
        <div>
          <p className="eyebrow">ACTIVE ROUND</p>
          <h1>{round.stationName}</h1>
          <p>
            {round.type} · Group {round.group} · Started {time(round.startedAt)}
          </p>
        </div>
        <div className="round-progress">
          <b>
            {done}
            <span>/{round.items.length}</span>
          </b>
          <small>checks complete</small>
        </div>
      </section>
      <div className="progress large">
        <i style={{ width: `${p}%` }} />
      </div>
      <div className="round-toolbar">
        <div>
          <SlidersHorizontal size={18} />
          <span>{remaining} required checks remaining</span>
        </div>
        <span className="badge live">Saved locally</span>
      </div>
      <section className="equipment-list">
        {round.items.map((i) => (
          <article className={`equipment-card ${i.status}`} key={i.id}>
            <div className="equipment-top">
              <div className="equipment-icon">
                {i.kind === "reading" ? <Gauge /> : <ClipboardCheck />}
              </div>
              <div className="grow">
                <div className="row">
                  <div>
                    <p className="equipment-name">{i.equipment}</p>
                    <h3>{i.label}</h3>
                  </div>
                  <Status status={i.status} />
                </div>
                {i.value != null ? (
                  <div className="reading-line">
                    <b>
                      {i.value} {i.unit}
                    </b>
                    {i.previous != null && (
                      <span>
                        Previous {i.previous} {i.unit}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="muted">
                    {i.required ? "Required check" : "Optional check"}
                  </p>
                )}
              </div>
            </div>
            <div className="card-actions">
              <button onClick={() => select(i.id, "camera")}>
                <Camera size={18} />
                Camera
              </button>
              <button
                className="primary-soft"
                onClick={() => select(i.id, "entry")}
              >
                <FileText size={18} />
                {i.status === "pending" ? "Enter check" : "View / edit"}
              </button>
            </div>
          </article>
        ))}
      </section>
      <div className="sticky-finish">
        <div>
          <b>{p}% complete</b>
          <small>
            {remaining ? `${remaining} required remaining` : "Ready to finish"}
          </small>
        </div>
        <button className="btn primary" onClick={finish}>
          Finish Round
        </button>
      </div>
    </div>
  );
}
function Status({ status }: { status: RoundItem["status"] }) {
  return (
    <span className={`badge ${status}`}>
      {status === "completed"
        ? "Completed"
        : status === "attention"
          ? "Attention required"
          : status === "skipped"
            ? "Skipped"
            : "Pending"}
    </span>
  );
}
function CameraScreen({
  item,
  round,
  back,
  confirm,
}: {
  item: RoundItem;
  round: Round;
  back: () => void;
  confirm: (p: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null),
    [photo, setPhoto] = useState<string | null>(null),
    [facing, setFacing] = useState<"environment" | "user">("environment");
  useEffect(() => {
    let active = true;
    let local: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 1920 },
        },
        audio: false,
      })
      .then((s) => {
        local = s;
        if (active) {
          setStream(s);
          if (video.current) video.current.srcObject = s;
        }
      })
      .catch(() => toast.error("Camera unavailable. Use manual entry."));
    return () => {
      active = false;
      local?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);
  const capture = () => {
    if (!video.current || !canvas.current) return;
    const v = video.current,
      c = canvas.current;
    c.width = 900;
    c.height = Math.round(900 * (v.videoHeight / v.videoWidth || 1.33));
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    setPhoto(c.toDataURL("image/jpeg", 0.78));
    stream?.getTracks().forEach((t) => t.stop());
  };
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
        <button
          className="icon-btn light"
          onClick={() =>
            setFacing(facing === "environment" ? "user" : "environment")
          }
        >
          <RotateCcw />
        </button>
      </div>
      <div className="camera-stage">
        {photo ? (
          <img src={photo} alt="Captured inspection" />
        ) : (
          <video ref={video} autoPlay playsInline muted />
        )}
        <div className="guide">
          <span />
          <p>
            {item.kind === "reading"
              ? "Align the gauge or display inside the frame"
              : "Keep the equipment tag clearly visible"}
          </p>
        </div>
        <canvas ref={canvas} hidden />
      </div>
      <div className="camera-info">
        <span>
          <Camera /> Recognition assist
        </span>
        <p>
          Nothing is saved until you confirm. Low-confidence results always
          require manual confirmation.
        </p>
      </div>
      <div className="camera-controls">
        {photo ? (
          <>
            <button className="btn secondary" onClick={() => setPhoto(null)}>
              Retake
            </button>
            <button className="btn primary" onClick={() => confirm(photo)}>
              Use Photo
            </button>
          </>
        ) : (
          <>
            <button className="manual-link" onClick={back}>
              Manual entry
            </button>
            <button
              className="shutter"
              onClick={capture}
              aria-label="Capture photo"
            >
              <span />
            </button>
            <span />
          </>
        )}
      </div>
    </div>
  );
}
function EntryScreen({
  item,
  round,
  settings,
  save,
  back,
}: {
  item: RoundItem;
  round: Round;
  settings: AppState["settings"];
  save: (p: Partial<RoundItem>) => void;
  back: () => void;
}) {
  const [value, setValue] = useState(
      item.value?.toString() ?? item.aiDetectedValue?.toString() ?? "",
    ),
    [notes, setNotes] = useState(item.notes || ""),
    [status, setStatus] = useState(
      item.status === "pending" ? "completed" : item.status,
    ),
    [skipReason, setSkipReason] = useState(item.skipReason || "");
  const comparison = calculateComparison(item.previous, Number(value));
  const tank = item.label.toLowerCase().includes("tank")
    ? calculateTankRate(item.previous, Number(value), 2)
    : null;
  const threshold =
    item.unit === "bar"
      ? settings.pressureThreshold
      : item.unit === "m"
        ? settings.tankThreshold
        : settings.conductivityThreshold;
  const smartAttention = Math.abs(comparison.percent || 0) > threshold;
  const submit = () => {
    if (item.kind === "reading" && !Number.isFinite(Number(value))) {
      toast.error("Enter a valid reading");
      return;
    }
    if (status === "skipped" && !skipReason.trim()) {
      toast.error("A skip reason is required");
      return;
    }
    save({
      value: item.kind === "reading" ? Number(value) : undefined,
      notes,
      status:
        smartAttention && status === "completed"
          ? "attention"
          : (status as RoundItem["status"]),
      skipReason,
      confirmedValue: item.kind === "reading" ? Number(value) : undefined,
      confirmedByUser: true,
    });
  };
  return (
    <div className="page narrow">
      <button className="back-link" onClick={back}>
        ‹ Back to active round
      </button>
      <div className="page-title">
        <p className="eyebrow">
          {round.stationName} · {item.equipment}
        </p>
        <h1>{item.label}</h1>
        <p>
          Confirm the result before saving. Camera recognition never submits
          automatically.
        </p>
      </div>
      <section className="panel form-panel">
        {item.photos.length > 0 && (
          <div className="evidence">
            <img src={item.photos.at(-1)} alt="Latest evidence" />
            <div>
              <ImageIcon />
              <b>Photo captured</b>
              <small>Compressed for offline storage</small>
            </div>
          </div>
        )}
        {item.kind === "reading" && (
          <>
            <label>
              Current reading
              <div className="unit-input">
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0.00"
                />
                <span>{item.unit}</span>
              </div>
            </label>
            {item.previous != null && value && (
              <div className={`comparison ${smartAttention ? "warn" : ""}`}>
                <div>
                  <small>Previous</small>
                  <b>
                    {item.previous} {item.unit}
                  </b>
                </div>
                <div>
                  <small>Difference</small>
                  <b>
                    {comparison.difference > 0 ? "+" : ""}
                    {comparison.difference.toFixed(2)} {item.unit}
                  </b>
                </div>
                <div>
                  <small>Change</small>
                  <b>{comparison.percent?.toFixed(1)}%</b>
                </div>
                {tank && (
                  <div>
                    <small>Rate</small>
                    <b>{tank.rate.toFixed(2)} m/hr</b>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {item.kind !== "reading" && (
          <label>
            Inspection result
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "completed" | "attention" | "skipped")}
            >
              <option value="completed">Normal / Completed</option>
              <option value="attention">Attention Required</option>
              <option value="skipped">Skip with reason</option>
            </select>
          </label>
        )}
        {status === "skipped" && (
          <label>
            Skip reason
            <input
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Reason is mandatory"
            />
          </label>
        )}
        <QuickNotes setNotes={setNotes} />
        <label>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add field observations…"
            rows={4}
          />
        </label>
        <button className="btn primary" onClick={submit}>
          <Check />
          Confirm & Save
        </button>
      </section>
    </div>
  );
}
function QuickNotes({ setNotes }: { setNotes: (x: string) => void }) {
  return (
    <div>
      <span className="field-label">Quick notes</span>
      <div className="chips">
        {[
          "Normal",
          "Checked",
          "No Leak",
          "Running Normal",
          "Stopped",
          "Under Maintenance",
          "Need Follow-up",
          "Abnormal Reading",
          "Valve Open",
          "Valve Closed",
        ].map((x) => (
          <button key={x} onClick={() => setNotes(x)}>
            {x}
          </button>
        ))}
      </div>
    </div>
  );
}
function RoundSummary({
  round,
  confirm,
  back,
}: {
  round: Round;
  confirm: () => void;
  back: () => void;
}) {
  const stats = {
    completed: round.items.filter((i) => i.status === "completed").length,
    skipped: round.items.filter((i) => i.status === "skipped").length,
    attention: round.items.filter((i) => i.status === "attention").length,
    photos: round.items.reduce((a, i) => a + i.photos.length, 0),
  };
  return (
    <div className="page narrow">
      <button className="back-link" onClick={back}>
        ‹ Back to round
      </button>
      <div className="page-title">
        <p className="eyebrow">FINAL REVIEW</p>
        <h1>Round summary</h1>
        <p>Completed rounds are locked and available in History.</p>
      </div>
      <section className="panel summary-card">
        <div className="summary-station">
          <div className="station-mark">{round.stationName.slice(-3)}</div>
          <div>
            <h2>{round.stationName}</h2>
            <p>
              {round.type} · Group {round.group}
            </p>
          </div>
        </div>
        <div className="details-grid">
          <div>
            <small>Operator</small>
            <b>{round.operator}</b>
          </div>
          <div>
            <small>Started</small>
            <b>{time(round.startedAt)}</b>
          </div>
          <div>
            <small>Completed checks</small>
            <b>{stats.completed}</b>
          </div>
          <div>
            <small>Skipped checks</small>
            <b>{stats.skipped}</b>
          </div>
          <div>
            <small>Attention findings</small>
            <b>{stats.attention}</b>
          </div>
          <div>
            <small>Evidence photos</small>
            <b>{stats.photos}</b>
          </div>
        </div>
        {stats.attention > 0 && (
          <div className="summary-warning">
            <AlertTriangle />
            <span>
              <b>{stats.attention} finding requires attention</b>
              <small>Review the report and arrange follow-up as needed.</small>
            </span>
          </div>
        )}
        <button className="btn primary" onClick={confirm}>
          <ShieldCheck />
          Confirm Finish Round
        </button>
      </section>
    </div>
  );
}
function History({
  rounds,
  filter,
  setFilter,
}: {
  rounds: Round[];
  filter: string;
  setFilter: (x: string) => void;
}) {
  const filtered =
    filter === "All" ? rounds : rounds.filter((r) => r.stationName === filter);
  return (
    <div className="page">
      <div className="page-title row">
        <div>
          <p className="eyebrow">ARCHIVE</p>
          <h1>Round history</h1>
          <p>Completed inspections stored on this device.</p>
        </div>
        <select
          className="compact-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>All</option>
          {stations.map((s) => (
            <option key={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <section className="history-list">
        {filtered.map((r) => (
          <article className="history-card" key={r.id}>
            <div className="station-mark">{r.stationName.slice(-3)}</div>
            <div className="grow">
              <div className="row">
                <div>
                  <h3>{r.stationName}</h3>
                  <p>
                    {date(r.startedAt)} · {r.operator} · Group {r.group}
                  </p>
                </div>
                <span className="badge completed">Completed</span>
              </div>
              <div className="history-stats">
                <span>
                  <b>{r.items.length}</b> checks
                </span>
                <span>
                  <b>
                    {r.items.filter((i) => i.status === "attention").length}
                  </b>{" "}
                  findings
                </span>
                <span>
                  <b>{r.items.reduce((a, i) => a + i.photos.length, 0)}</b>{" "}
                  photos
                </span>
              </div>
            </div>
            <button className="icon-btn">
              <ChevronLeft />
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
function Reports({ rounds }: { rounds: Round[] }) {
  const [selected, setSelected] = useState(rounds[0]?.id);
  const r = rounds.find((x) => x.id === selected);
  const csv = () => {
    if (!r) return;
    const rows = [
      [
        "Equipment",
        "Check Point",
        "Reading",
        "Unit",
        "Status",
        "Previous",
        "Difference",
        "Time",
        "Notes",
      ],
      ...r.items.map((i) => [
        i.equipment,
        i.label,
        i.value ?? "",
        i.unit ?? "",
        i.status,
        i.previous ?? "",
        i.value != null && i.previous != null ? i.value - i.previous : "",
        time(r.startedAt),
        i.notes,
      ]),
    ];
    const blob = new Blob(
      [
        rows
          .map((x) =>
            x.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `MASA-${r.stationName}-${date(r.startedAt)}.csv`;
    a.click();
  };
  return (
    <div className="page report-page">
      <div className="page-title row no-print">
        <div>
          <p className="eyebrow">OPERATIONS REPORTING</p>
          <h1>Round reports</h1>
          <p>Print, save as PDF, or export CSV without a server.</p>
        </div>
        <div className="report-actions">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {rounds.map((x) => (
              <option value={x.id} key={x.id}>
                {x.stationName} · {date(x.startedAt)}
              </option>
            ))}
          </select>
          <button className="btn secondary" onClick={csv}>
            <Download />
            CSV
          </button>
          <button className="btn primary" onClick={() => print()}>
            <FileText />
            Print / PDF
          </button>
        </div>
      </div>
      {r && (
        <article className="print-report">
          <header>
            <div className="brand-lockup">
              <img src="/masa-logo.png" alt="MASA" />
              <span />
              <img src="/marafiq-logo.png" alt="Marafiq" />
            </div>
            <h2>MASA Smart Operator Round</h2>
            <p>Digital Field Inspection Report</p>
          </header>
          <div className="report-meta">
            <div>
              <small>Station</small>
              <b>{r.stationName}</b>
            </div>
            <div>
              <small>Date</small>
              <b>{date(r.startedAt)}</b>
            </div>
            <div>
              <small>Operator</small>
              <b>{r.operator}</b>
            </div>
            <div>
              <small>Group</small>
              <b>{r.group}</b>
            </div>
            <div>
              <small>Round start</small>
              <b>{time(r.startedAt)}</b>
            </div>
            <div>
              <small>Round finish</small>
              <b>{r.finishedAt ? time(r.finishedAt) : "—"}</b>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Check point</th>
                  <th>Reading</th>
                  <th>Status</th>
                  <th>Previous</th>
                  <th>Difference</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.equipment}</td>
                    <td>{i.label}</td>
                    <td>
                      {i.value ?? "—"} {i.unit}
                    </td>
                    <td>{i.status}</td>
                    <td>{i.previous ?? "—"}</td>
                    <td>
                      {i.value != null && i.previous != null
                        ? (i.value - i.previous).toFixed(2)
                        : "—"}
                    </td>
                    <td>{i.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="report-summary">
            <h3>Completion Summary</h3>
            <p>
              {r.items.filter((i) => i.status !== "pending").length} of{" "}
              {r.items.length} checks completed ·{" "}
              {r.items.filter((i) => i.status === "attention").length} attention
              findings · {r.items.reduce((a, i) => a + i.photos.length, 0)}{" "}
              evidence photos
            </p>
          </section>
          <footer>
            Generated locally by MASA Smart Operator Round · Inspection and
            logging only
          </footer>
        </article>
      )}
    </div>
  );
}
function Stations() {
  return (
    <div className="page">
      <div className="page-title">
        <p className="eyebrow">MASTER DATA</p>
        <h1>Stations</h1>
        <p>
          Editable configuration is separated from the interface for future
          administration.
        </p>
      </div>
      <section className="station-grid">
        {stations.map((s) => (
          <article className="station-card" key={s.id}>
            <div className="station-mark">{s.name.slice(-3)}</div>
            <div>
              <h3>{s.name}</h3>
              <p>{s.area}</p>
            </div>
            <div className="station-counts">
              <span>{s.equipmentCount} equipment</span>
              <span>{s.checkpoints.length} checks</span>
            </div>
            <span className="offline-dot">Offline ready</span>
          </article>
        ))}
      </section>
    </div>
  );
}
function SettingsPage({
  state,
  setState,
  go,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  go: (v: View) => void;
}) {
  const s = state.settings,
    update = (p: Partial<typeof s>) =>
      setState({ ...state, settings: { ...s, ...p } });
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="page settings-page">
      <div className="page-title">
        <p className="eyebrow">APPLICATION</p>
        <h1>Settings</h1>
        <p>Device-local preferences, thresholds, calibration and data.</p>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <h2>Camera & recognition</h2>
          <SettingToggle
            label="Camera recognition"
            value={s.cameraRecognition}
            onChange={(x) => update({ cameraRecognition: x })}
          />
          <SettingToggle
            label="Voice-to-text notes"
            value={s.voiceNotes}
            onChange={(x) => update({ voiceNotes: x })}
          />
          <label>
            Image quality
            <select
              value={s.imageQuality}
              onChange={(e) =>
                update({ imageQuality: e.target.value as "balanced" | "high" })
              }
            >
              <option value="balanced">Balanced (recommended)</option>
              <option value="high">High detail</option>
            </select>
          </label>
        </section>
        <section className="panel">
          <h2>AI Camera</h2>
          <label>Vision mode<select value={s.visionMode} onChange={(e) => update({ visionMode: e.target.value as "industrial" | "general" })}><option value="industrial">Industrial (recommended)</option><option value="general">General/debug</option></select></label>
          <SettingToggle label="Enable local AI" value={s.aiCameraEnabled} onChange={(x) => update({ aiCameraEnabled: x })} />
          <SettingToggle label="Analog gauge detection" value={s.gaugeDetectionEnabled} onChange={(x) => update({ gaugeDetectionEnabled: x })} />
          <SettingToggle label="OCR for displays & tags" value={s.ocrEnabled} onChange={(x) => update({ ocrEnabled: x })} />
          <SettingToggle label="Equipment model adapter" value={s.equipmentDetectionEnabled} onChange={(x) => update({ equipmentDetectionEnabled: x })} />
          <SettingToggle label="Show confidence" value={s.showConfidence} onChange={(x) => update({ showConfidence: x })} />
          <SettingToggle label="Show bounding boxes" value={s.showBoundingBoxes} onChange={(x) => update({ showBoundingBoxes: x })} />
          <SettingToggle label="Debug details" value={s.aiDebugMode} onChange={(x) => update({ aiDebugMode: x })} />
          <label>Processing interval ({s.processingInterval} ms)<input type="range" min="250" max="1500" step="50" value={s.processingInterval} onChange={(e) => update({ processingInterval: Number(e.target.value) })} /></label>
          <label>Confidence threshold ({Math.round(s.confidenceThreshold * 100)}%)<input type="range" min="0.3" max="0.95" step="0.05" value={s.confidenceThreshold} onChange={(e) => update({ confidenceThreshold: Number(e.target.value) })} /></label>
          <label>Industrial detection ({Math.round(s.industrialDetectionThreshold * 100)}%)<input type="range" min="0.2" max="0.95" step="0.05" value={s.industrialDetectionThreshold} onChange={(e) => update({ industrialDetectionThreshold: Number(e.target.value) })} /></label>
          <label>Valve position ({Math.round(s.valvePositionThreshold * 100)}%)<input type="range" min="0.3" max="0.95" step="0.05" value={s.valvePositionThreshold} onChange={(e) => update({ valvePositionThreshold: Number(e.target.value) })} /></label>
          <label>OCR ({Math.round(s.ocrThreshold * 100)}%)<input type="range" min="0.3" max="0.95" step="0.05" value={s.ocrThreshold} onChange={(e) => update({ ocrThreshold: Number(e.target.value) })} /></label>
          <label>Gauge ({Math.round(s.gaugeThreshold * 100)}%)<input type="range" min="0.3" max="0.95" step="0.05" value={s.gaugeThreshold} onChange={(e) => update({ gaugeThreshold: Number(e.target.value) })} /></label>
          <label>General fallback ({Math.round(s.generalDetectionThreshold * 100)}%)<input type="range" min="0.3" max="0.95" step="0.05" value={s.generalDetectionThreshold} onChange={(e) => update({ generalDetectionThreshold: Number(e.target.value) })} /></label>
          <a className="btn secondary" href="/vision-test">Open Vision Test Lab</a>
        </section>
        <DataCollectionPanel state={state} setState={setState} />
        <ValveCalibrationPanel state={state} setState={setState} />
        <section className="panel">
          <h2>Warning thresholds</h2>
          <label>
            Pressure change (%)
            <input
              type="number"
              value={s.pressureThreshold}
              onChange={(e) =>
                update({ pressureThreshold: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Tank level change (%)
            <input
              type="number"
              value={s.tankThreshold}
              onChange={(e) =>
                update({ tankThreshold: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Conductivity change (%)
            <input
              type="number"
              value={s.conductivityThreshold}
              onChange={(e) =>
                update({ conductivityThreshold: Number(e.target.value) })
              }
            />
          </label>
        </section>
        <section className="panel">
          <h2>Gauge reader</h2>
          <p className="muted">
            Configure gauge range, needle angles and center point per
            instrument.
          </p>
          <button className="btn secondary" onClick={() => go("calibration")}>
            <Gauge />
            Open Gauge Calibration
          </button>
        </section>
        <section className="panel">
          <h2>Local data</h2>
          <div className="storage-bar">
            <i style={{ width: "18%" }} />
            <span>18% estimated device allocation</span>
          </div>
          <button className="btn secondary" onClick={() => exportJson(state)}>
            <Download />
            Backup JSON
          </button>
          <button
            className="btn secondary"
            onClick={() => file.current?.click()}
          >
            <Archive />
            Restore JSON
          </button>
          <input
            ref={file}
            hidden
            type="file"
            accept="application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setState(await importJson(f));
            }}
          />
          <button
            className="btn danger"
            onClick={async () => {
              await resetState();
              location.reload();
            }}
          >
            Clear demo data
          </button>
        </section>
      </div>
      <section className="about-strip">
        <img src="/masa-logo.png" alt="MASA" />
        <div>
          <b>MASA Smart Operator Round</b>
          <span>Version 1.0.0 · Offline-first PWA</span>
        </div>
        <ShieldCheck />
      </section>
    </div>
  );
}
function SettingToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (x: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
    </label>
  );
}
function Calibration({
  state,
  setState,
}: {
  state: AppState;
  setState: (s: AppState) => void;
}) {
  const [min, setMin] = useState(0),
    [max, setMax] = useState(10),
    [minA, setMinA] = useState(-135),
    [maxA, setMaxA] = useState(135),
    [angle, setAngle] = useState(25),
    [unit, setUnit] = useState("bar");
  const result = gaugeAngleToReading(angle, {
    min,
    max,
    minAngle: minA,
    maxAngle: maxA,
  });
  return (
    <div className="page narrow">
      <div className="page-title">
        <p className="eyebrow">VISION SETUP</p>
        <h1>Gauge Calibration</h1>
        <p>Store a confirmed range and sweep for each physical gauge.</p>
      </div>
      <section className="panel calibration">
        <div className="gauge-preview">
          <div className="dial">
            <i style={{ transform: `rotate(${angle}deg)` }} />
            <span>
              {result.toFixed(2)}
              <small>{unit}</small>
            </span>
          </div>
          <p>Prototype preview · always confirm in the field</p>
        </div>
        <div className="two-col">
          <label>
            Minimum reading
            <input
              type="number"
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
            />
          </label>
          <label>
            Maximum reading
            <input
              type="number"
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
          </label>
          <label>
            Minimum needle angle
            <input
              type="number"
              value={minA}
              onChange={(e) => setMinA(Number(e.target.value))}
            />
          </label>
          <label>
            Maximum needle angle
            <input
              type="number"
              value={maxA}
              onChange={(e) => setMaxA(Number(e.target.value))}
            />
          </label>
          <label>
            Test angle
            <input
              type="range"
              min={minA}
              max={maxA}
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
            />
          </label>
          <label>
            Unit
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {["bar", "psi", "m", "m³/h", "µS/cm", "°C", "A", "V"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn secondary">
          <Camera />
          Take Reference Photo
        </button>
        <button
          className="btn primary"
          onClick={() => {
            setState({
              ...state,
              calibrations: [
                ...state.calibrations,
                {
                  id: crypto.randomUUID(),
                  stationId: "camp-11a",
                  equipment: "MP-4",
                  minValue: min,
                  maxValue: max,
                  minAngle: minA,
                  maxAngle: maxA,
                  unit,
                },
              ],
            });
            toast.success("Calibration saved locally");
          }}
        >
          <Check />
          Save Calibration
        </button>
      </section>
    </div>
  );
}
function BottomNav({ view, go }: { view: View; go: (v: View) => void }) {
  return (
    <nav className="bottom-nav">
      {nav.map(({ view: v, label, icon: Icon }) => (
        <button
          key={v}
          className={view === v ? "active" : ""}
          onClick={() => go(v)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
