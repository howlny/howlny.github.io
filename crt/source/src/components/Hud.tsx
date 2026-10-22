import type { MicStatus, Telemetry } from "@/visualizer/types";
import { Wordmark } from "./Wordmark";

interface HudProps {
  status: MicStatus;
  telemetry: Telemetry | null;
  visible: boolean;
}

const SEGMENTS = 14;

export function Hud({ status, telemetry, visible }: HudProps) {
  const t = telemetry;
  const lit = Math.round((t?.level ?? 0) * SEGMENTS);
  const phase = t?.phase ?? "IDLE";
  const muted = status === "muted";
  const suspended = status === "suspended";
  const testing = status === "test";
  const ledClass = suspended
    ? "wr-led--amber wr-led--blink"
    : muted
      ? "wr-led--red wr-led--blink"
      : testing
        ? "wr-led--amber"
        : "wr-led--green";
  const alert = suspended
    ? "AUDIO PAUSED by the system. Tap anywhere to resume."
    : muted
      ? "Input muted by the system. Unmute your mic."
      : t?.silent && !testing
        ? "NO SIGNAL. Nothing is coming in. Turn it up."
        : null;

  return (
    <header className={`wr-hud ${visible || alert ? "" : "wr-hud--hidden"}`} aria-label="Rack status">
      <div className="wr-hud__brand">
        <Wordmark size="sm" />
      </div>
      <div className="wr-hud__cell">
        <span className={`wr-led ${ledClass}`} />
        <span className="wr-hud__k">{suspended ? "PAUSED" : muted ? "MUTED" : testing ? "TEST" : "ON AIR"}</span>
      </div>
      <div className={`wr-hud__cell wr-phase wr-phase--${phase.toLowerCase()}`} aria-live="polite">
        {phase}
      </div>
      <div className="wr-hud__cell wr-hud__meter" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={i < lit ? (i > SEGMENTS * 0.82 ? "on red" : i > SEGMENTS * 0.6 ? "on yellow" : "on") : ""} />
        ))}
      </div>
      <div className="wr-hud__cell">
        <span className="wr-hud__k">BPM</span>
        <span className="wr-hud__v">{t && t.bpm > 1 ? Math.round(t.bpm) : "---"}</span>
      </div>
      <div className="wr-hud__cell wr-hud__wide">
        <span className="wr-hud__k">CHAOS</span>
        <span className="wr-hud__v">{Math.round((t?.chaos ?? 0) * 100)}%</span>
      </div>
      <div className="wr-hud__cell wr-hud__wide">
        <span className="wr-hud__k">WIRES</span>
        <span className="wr-hud__v">{t?.cables ?? 0}</span>
        <span className="wr-hud__k">DEAD</span>
        <span className="wr-hud__v">{t?.destroyed ?? 0}</span>
      </div>
      <div className="wr-hud__cell wr-hud__wide wr-hud__prg">{t?.program ?? "PRG 01 PHOSPHOR"}</div>
      {alert && (
        <div className="wr-hud__alert" role="status">
          {alert}
        </div>
      )}
    </header>
  );
}
