import { AudioEngine } from "@/visualizer/AudioEngine";
import type { MicStatus } from "@/visualizer/types";
import { Wordmark } from "./Wordmark";

interface StartPanelProps {
  status: MicStatus;
  ready: boolean;
  onStart: () => void;
  onTest: () => void;
}

const MESSAGES: Partial<Record<MicStatus, { led: "amber" | "red" | "grey"; title: string; body: string }>> = {
  requesting: {
    led: "amber",
    title: "Waiting for permission",
    body: "Check the browser prompt and allow the microphone.",
  },
  denied: {
    led: "red",
    title: "Mic access blocked",
    body: "Allow the microphone for this site in your browser settings, then join the signal again.",
  },
  nodevice: {
    led: "red",
    title: "No microphone found",
    body: "Plug in or enable a mic, then retry.",
  },
  busy: {
    led: "red",
    title: "Mic is busy",
    body: "Another app is holding the microphone. Close it and retry.",
  },
  unsupported: {
    led: "red",
    title: "Browser can't capture audio",
    body: "Try a recent Chrome, Safari, Firefox or Edge.",
  },
  insecure: {
    led: "red",
    title: "Secure connection required",
    body: "Microphone access only works over https.",
  },
  error: {
    led: "red",
    title: "Signal lost",
    body: "The mic failed to start. Try again.",
  },
  stopped: {
    led: "grey",
    title: "Signal disconnected",
    body: "The feed is idling. Reconnect any time.",
  },
};

const STATUS_LINE: Partial<Record<MicStatus, { text: string; cls: string }>> = {
  idle: { text: "AWAITING SIGNAL", cls: "is-hot" },
  requesting: { text: "REQUESTING ACCESS", cls: "is-hot" },
  stopped: { text: "DISCONNECTED", cls: "" },
};

export function StartPanel({ status, ready, onStart, onTest }: StartPanelProps) {
  const msg = MESSAGES[status];
  const blocked = status === "unsupported" || status === "insecure";
  const busy = status === "requesting";
  const label = status === "stopped" ? "RECONNECT" : status === "idle" ? "JOIN THE SIGNAL" : busy ? "CONNECTING…" : "RETRY";
  const canTest = AudioEngine.canTest();
  const line = STATUS_LINE[status] ?? { text: "NO CARRIER", cls: "is-bad" };
  return (
    <section className="wr-start" aria-labelledby="wr-start-title">
      <div className="wr-plate">
        <span className="wr-corner wr-corner--tl" />
        <span className="wr-corner wr-corner--tr" />
        <span className="wr-corner wr-corner--bl" />
        <span className="wr-corner wr-corner--br" />
        <div className="wr-plate__meta">
          <span className="is-rec">SIGNAL // 004</span>
          <span>CAM_01 // NYC</span>
        </div>
        <h1 id="wr-start-title" className="sr-only">
          HOWL — mic-reactive signal visualizer
        </h1>
        <Wordmark size="lg" />
        <p className="wr-plate__lede">Something instinctive, raw, and impossible to ignore.</p>
        <p className="wr-plate__body">
          Play HOWL out loud and open the mic. The music cuts the footage, fries the tape and blows the rack apart.
        </p>
        <div className="wr-term" aria-hidden="true">
          <div>&gt; ESTABLISHING SECURE CHANNEL…</div>
          <div>&gt; INPUT: MICROPHONE</div>
          <div>
            &gt; STATUS: <span className={line.cls}>{ready ? line.text : "BOOTING"}</span>
            <span className="wr-term__cursor" />
          </div>
        </div>
        <div className="wr-plate__row">
          <button
            type="button"
            className="wr-patch"
            onClick={onStart}
            disabled={blocked || busy || !ready}
            aria-describedby={msg ? "wr-start-status" : undefined}
          >
            <span className="wr-patch__dot" aria-hidden="true" />
            <span className="wr-patch__label">{ready ? label : "WARMING UP…"}</span>
          </button>
        </div>
        {msg && (
          <div id="wr-start-status" className="wr-status" role="status" aria-live="polite">
            <span className={`wr-led wr-led--${msg.led} ${msg.led === "amber" ? "wr-led--blink" : ""}`} />
            <div>
              <strong>{msg.title}</strong>
              <span>{msg.body}</span>
            </div>
          </div>
        )}
        {canTest && (
          <button type="button" className="wr-testsig" onClick={onTest} disabled={!ready}>
            <span className="wr-led wr-led--green" aria-hidden="true" />
            <span className="wr-testsig__label">TEST TRANSMISSION</span>
            <span className="wr-testsig__hint">No music around? Play the built-in 60-second techno record.</span>
          </button>
        )}
        <p className="wr-plate__fine">Audio is analysed on your device and never leaves it. Hands off: the mic drives every glitch.</p>
        <p className="wr-plate__warn">
          <span aria-hidden="true">⚠</span> Intense strobe and flashing effects. Turn STROBE off in the controls if
          flashing lights affect you.
        </p>
      </div>
    </section>
  );
}
