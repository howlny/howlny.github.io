import { ControlDeck } from "@/components/ControlDeck";
import { Hud } from "@/components/Hud";
import { StartPanel } from "@/components/StartPanel";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useVisualizer } from "@/hooks/useVisualizer";
import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_MS = 3500;

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Home() {
  const stageRef = useRef<HTMLDivElement>(null);
  const { status, telemetry, ready, start, stop, startTest, setSensitivity, setIntensity, setFlash, resumeAudio } =
    useVisualizer(stageRef);
  const fs = useFullscreen();
  const [sensitivity, setSens] = useState(1);
  const [intensity, setInt] = useState(() => (prefersReducedMotion() ? 0.45 : 0.85));
  const [flash, setFlashState] = useState(() => !prefersReducedMotion());
  const [awake, setAwake] = useState(true);
  const [uiHidden, setUiHidden] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);

  const live = status === "live" || status === "test" || status === "muted" || status === "suspended";
  const testing = status === "test";

  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
  }, []);

  useEffect(() => {
    if (ready) {
      setIntensity(intensity);
      setSensitivity(sensitivity);
      setFlash(flash);
    }
    // Only sync once the engine is up; later changes go through the handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const toggleMic = useCallback(() => {
    if (status === "requesting") return;
    // While the test signal runs, the mic button switches over to the mic.
    if (live && !testing) stop();
    else start();
  }, [live, testing, status, start, stop]);

  const toggleTest = useCallback(() => {
    if (testing) stop();
    else startTest();
  }, [testing, startTest, stop]);

  const toggleFlash = useCallback(() => {
    setFlashState(v => {
      setFlash(!v);
      return !v;
    });
  }, [setFlash]);

  // Arm the idle timer once; listeners below re-arm it only on real input.
  useEffect(() => {
    wake();
    return () => window.clearTimeout(idleTimer.current);
  }, [wake]);

  const fsSupported = fs.supported;
  const fsToggle = fs.toggle;
  useEffect(() => {
    const onMove = () => wake();
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (k === "f" && fsSupported) fsToggle();
      else if (k === "h") setUiHidden(h => !h);
      else if (k === "m") toggleMic();
      else if (k === "t") toggleTest();
      else if (k === "s") toggleFlash();
      wake();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [wake, fsSupported, fsToggle, toggleMic, toggleTest, toggleFlash]);

  // The picture itself isn't interactive: a tap only brings the controls back
  // (and un-pauses audio the OS suspended).
  const onStagePointer = () => {
    resumeAudio();
    wake();
  };

  const onSens = (v: number) => {
    setSens(v);
    setSensitivity(v);
  };
  const onInt = (v: number) => {
    setInt(v);
    setIntensity(v);
  };

  return (
    <main className={`wr-root ${live ? "is-live" : ""} ${live && !awake ? "is-idle" : ""}`}>
      <div ref={stageRef} className="wr-stage" onPointerDown={onStagePointer} aria-hidden="true" />

      {!live && <StartPanel status={status} ready={ready} onStart={start} onTest={startTest} />}

      {live && <Hud status={status} telemetry={telemetry} visible={awake && !uiHidden} />}

      {live && (
        <ControlDeck
          status={status}
          visible={awake && !uiHidden}
          sensitivity={sensitivity}
          intensity={intensity}
          flash={flash}
          fullscreenSupported={fs.supported}
          fullscreenActive={fs.active}
          onToggleMic={toggleMic}
          onToggleTest={toggleTest}
          onSensitivity={onSens}
          onIntensity={onInt}
          onToggleFlash={toggleFlash}
          onFullscreen={fs.toggle}
          onHideUi={() => setUiHidden(true)}
        />
      )}

      {live && uiHidden && (
        <button type="button" className={`wr-showui ${awake ? "" : "wr-showui--hidden"}`} onClick={() => setUiHidden(false)}>
          SHOW UI
        </button>
      )}
    </main>
  );
}
