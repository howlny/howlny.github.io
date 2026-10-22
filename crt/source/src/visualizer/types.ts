/** Audio features computed every animation frame and consumed by the renderer. */
export interface AudioFeatures {
  /** Normalized, auto-gained loudness 0..1. */
  level: number;
  /** Un-normalized RMS of the time-domain signal. */
  rawRms: number;
  /** Eight normalized frequency bands, sub → air, 0..1. */
  bands: Float32Array;
  bass: number;
  mid: number;
  high: number;
  /** True on the frame a broadband transient is detected. */
  onset: boolean;
  /** Strength of the latest onset, 0..1 (only meaningful when onset is true). */
  onsetStrength: number;
  /** True on the frame a low-frequency (kick) transient is detected. */
  kick: boolean;
  /** True on the frame a high-frequency (hat/snare) transient is detected. */
  hat: boolean;
  /** True on the frame a mid-band (snare/clap) transient is detected. */
  snare: boolean;
  /** Instant-attack envelopes (≈40–80 ms decay) from the low-latency transient path. */
  kickEnv: number;
  snareEnv: number;
  hatEnv: number;
  /** Largest of the fast envelopes. */
  transient: number;
  /** Instantaneous normalized band energies from the last few ms of audio. */
  fastLow: number;
  fastMid: number;
  fastHigh: number;
  /** Decaying 1 → 0 envelope triggered by kicks. */
  beatPulse: number;
  /** Decaying envelope triggered by any onset. */
  hitPulse: number;
  /** Rough tempo estimate, 0 when unknown. */
  bpm: number;
  /** Slow-moving (≈3 s) energy envelope, 0..1. */
  energy: number;
  /** Onsets per second over the last few seconds. */
  onsetRate: number;
  /** Time-domain samples, -1..1. */
  waveform: Float32Array;
  /** 64 log-spaced normalized spectrum bins, 0..1. */
  spectrum: Float32Array;
  /** True when the input has been effectively silent for a while. */
  silent: boolean;
  /** Current input level in dBFS (approximate). */
  db: number;
}

export const BAND_COUNT = 8;
export const SPECTRUM_BINS = 64;
export const WAVEFORM_SIZE = 1024;

export function createFeatures(): AudioFeatures {
  return {
    level: 0,
    rawRms: 0,
    bands: new Float32Array(BAND_COUNT),
    bass: 0,
    mid: 0,
    high: 0,
    onset: false,
    onsetStrength: 0,
    kick: false,
    hat: false,
    snare: false,
    kickEnv: 0,
    snareEnv: 0,
    hatEnv: 0,
    transient: 0,
    fastLow: 0,
    fastMid: 0,
    fastHigh: 0,
    beatPulse: 0,
    hitPulse: 0,
    bpm: 0,
    energy: 0,
    onsetRate: 0,
    waveform: new Float32Array(WAVEFORM_SIZE),
    spectrum: new Float32Array(SPECTRUM_BINS),
    silent: true,
    db: -100,
  };
}

export type MicStatus =
  | "idle"
  | "requesting"
  | "live"
  | "test"
  | "muted"
  | "suspended"
  | "denied"
  | "nodevice"
  | "busy"
  | "unsupported"
  | "insecure"
  | "error"
  | "stopped";

export type Phase = "IDLE" | "WARM" | "HOT" | "OVERLOAD" | "MELTDOWN";

export interface Telemetry {
  phase: Phase;
  chaos: number;
  level: number;
  bpm: number;
  fps: number;
  quality: number;
  silent: boolean;
  cables: number;
  destroyed: number;
  /** Active video program label, e.g. "PRG 07 KALEIDO". */
  program: string;
}
