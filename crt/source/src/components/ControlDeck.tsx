import type { MicStatus } from "@/visualizer/types";

interface ControlDeckProps {
  status: MicStatus;
  visible: boolean;
  sensitivity: number;
  intensity: number;
  flash: boolean;
  fullscreenSupported: boolean;
  fullscreenActive: boolean;
  onToggleMic: () => void;
  onToggleTest: () => void;
  onSensitivity: (v: number) => void;
  onIntensity: (v: number) => void;
  onToggleFlash: () => void;
  onFullscreen: () => void;
  onHideUi: () => void;
}

export function ControlDeck(props: ControlDeckProps) {
  const testing = props.status === "test";
  const micLive = props.status === "live" || props.status === "muted" || props.status === "suspended";
  return (
    <nav
      className={`wr-deck ${props.visible ? "" : "wr-deck--hidden"}`}
      aria-label="Visualizer controls"
      aria-hidden={!props.visible}
      inert={!props.visible}
    >
      <button
        type="button"
        className={`wr-btn wr-btn--mic ${micLive ? "is-live" : ""}`}
        onClick={props.onToggleMic}
        aria-pressed={micLive}
        aria-label={micLive ? "Stop the microphone" : "Switch to microphone"}
      >
        <span className={`wr-led ${micLive ? "wr-led--green" : "wr-led--grey"}`} />
        {micLive ? "CUT MIC" : "OPEN MIC"}
      </button>

      <button
        type="button"
        className={`wr-btn wr-btn--test ${testing ? "is-live" : ""}`}
        onClick={props.onToggleTest}
        aria-pressed={testing}
        aria-label={testing ? "Stop test record" : "Play test record"}
        title="Built-in electronic test record (T)"
      >
        <span className={`wr-led ${testing ? "wr-led--amber wr-led--blink" : "wr-led--grey"}`} />
        {testing ? "STOP TEST" : "TEST"}
      </button>

      <label className="wr-fader">
        <span className="wr-fader__k">SENS</span>
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={props.sensitivity}
          onChange={e => props.onSensitivity(Number(e.target.value))}
          aria-label="Microphone sensitivity"
        />
        <span className="wr-fader__v">{props.sensitivity.toFixed(1)}×</span>
      </label>

      <label className="wr-fader">
        <span className="wr-fader__k">CHAOS</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.intensity}
          onChange={e => props.onIntensity(Number(e.target.value))}
          aria-label="Visual intensity"
        />
        <span className="wr-fader__v">{Math.round(props.intensity * 100)}%</span>
      </label>

      <button
        type="button"
        className={`wr-btn ${props.flash ? "wr-btn--hot" : "wr-btn--ghost"}`}
        onClick={props.onToggleFlash}
        aria-pressed={props.flash}
        title="Strobe, inversions and full-frame flashes (S)"
      >
        {props.flash ? "STROBE ON" : "STROBE OFF"}
      </button>

      {props.fullscreenSupported && (
        <button type="button" className="wr-btn" onClick={props.onFullscreen} aria-pressed={props.fullscreenActive}>
          {props.fullscreenActive ? "EXIT FULL" : "FULLSCREEN"}
        </button>
      )}
      <button type="button" className="wr-btn wr-btn--ghost" onClick={props.onHideUi}>
        HIDE UI
      </button>
    </nav>
  );
}
