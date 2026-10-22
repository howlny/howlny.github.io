import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AudioEngine } from "@/visualizer/AudioEngine";
import { Visualizer } from "@/visualizer/Visualizer";
import type { MicStatus, Telemetry } from "@/visualizer/types";

function initialStatus(): MicStatus {
  const s = AudioEngine.checkSupport();
  return s.ok ? "idle" : s.status ?? "unsupported";
}

export function useVisualizer(stageRef: RefObject<HTMLDivElement | null>) {
  const vizRef = useRef<Visualizer | null>(null);
  const [status, setStatus] = useState<MicStatus>(initialStatus);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const viz = new Visualizer(el, { onStatus: setStatus, onTelemetry: setTelemetry });
    vizRef.current = viz;
    void viz.init().then(() => setReady(true));
    return () => {
      viz.dispose();
      vizRef.current = null;
    };
  }, [stageRef]);

  // Keep the screen awake while the mic or test signal is running.
  useEffect(() => {
    if (status !== "live" && status !== "test") return;
    type WakeLockSentinelLike = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } };
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    nav.wakeLock
      ?.request("screen")
      .then(l => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void lock?.release().catch(() => undefined);
    };
  }, [status]);

  const start = useCallback(() => {
    void vizRef.current?.startMic();
  }, []);

  const stop = useCallback(() => {
    vizRef.current?.stopMic();
  }, []);

  const startTest = useCallback(() => {
    vizRef.current?.startTest();
  }, []);

  const setSensitivity = useCallback((v: number) => {
    vizRef.current?.setSensitivity(v);
  }, []);

  const setIntensity = useCallback((v: number) => {
    vizRef.current?.setIntensity(v);
  }, []);

  const setFlash = useCallback((on: boolean) => {
    vizRef.current?.setFlash(on);
  }, []);

  const resumeAudio = useCallback(() => {
    vizRef.current?.resumeAudio();
  }, []);

  return { status, telemetry, ready, start, stop, startTest, setSensitivity, setIntensity, setFlash, resumeAudio };
}
