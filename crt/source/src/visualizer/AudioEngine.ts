import { clamp, damp, noise1 } from "./math";
import { buildTestBeat } from "./testBeat";
import { loadTestRecord, peekTestRecord } from "./testRecordLoader";
import {
  BAND_COUNT,
  SPECTRUM_BINS,
  WAVEFORM_SIZE,
  createFeatures,
  type AudioFeatures,
  type MicStatus,
} from "./types";

/** Frequency band edges in Hz: sub, bass, low-mid, mid, high-mid, presence, brilliance, air. */
const BAND_EDGES = [20, 60, 150, 400, 1000, 2500, 5000, 10000, 16000];

/** Spectrum dB window. Wide enough that loud bass in a room does not clip. */
const MIN_DB = -100;
const MAX_DB = -10;

/**
 * Low-latency transient path: each band gets its own filter + tiny analyser and we only look
 * at the most recent few milliseconds of samples, so hits register on the very next frame.
 */
const FAST_BANDS: {
  type: BiquadFilterType;
  freq: number;
  q: number;
  size: number;
  window: number;
  ratio: number;
  gap: number;
}[] = [
  // Kick: 20 ms window so a full low-frequency cycle is covered.
  { type: "lowpass", freq: 140, q: 0.8, size: 1024, window: 1024, ratio: 1.55, gap: 0.13 },
  // Snare / clap body.
  { type: "bandpass", freq: 1800, q: 0.7, size: 512, window: 256, ratio: 1.7, gap: 0.08 },
  // Hats / cymbals.
  { type: "highpass", freq: 6000, q: 0.7, size: 512, window: 256, ratio: 1.75, gap: 0.045 },
];

interface FastBand {
  filter: BiquadFilterNode;
  analyser: AnalyserNode;
  buf: Float32Array;
  byteBuf: Uint8Array | null;
  slow: number;
  peak: number;
  prev: number;
  last: number;
}

/**
 * Tracks a slow floor and a peak so raw values can be mapped to 0..1 regardless of
 * how loud the room or the microphone is.
 */
class AdaptiveRange {
  floor: number;
  peak: number;

  constructor(
    private readonly minRange: number,
    init = 0,
  ) {
    this.floor = init;
    this.peak = init + minRange;
  }

  update(v: number, dt: number): number {
    if (v < this.floor) this.floor += (v - this.floor) * damp(3, dt);
    else this.floor += (v - this.floor) * damp(0.03, dt);
    if (v > this.peak) this.peak += (v - this.peak) * damp(25, dt);
    else this.peak += (v - this.peak) * damp(0.15, dt);
    const range = Math.max(this.peak - this.floor, this.minRange);
    return clamp((v - this.floor) / range);
  }
}

/** Adaptive-threshold peak picker used for broadband, kick and hat transients. */
class OnsetDetector {
  private readonly hist: Float32Array;
  private idx = 0;
  private filled = 0;
  private last = -10;

  constructor(
    size: number,
    private readonly k: number,
    private readonly minGap: number,
    private readonly minValue: number,
  ) {
    this.hist = new Float32Array(size);
  }

  /** Returns strength 0..1 when an onset fires, otherwise 0. */
  detect(v: number, time: number): number {
    const n = this.filled;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += this.hist[i];
    mean = n > 0 ? mean / n : 0;
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const d = this.hist[i] - mean;
      variance += d * d;
    }
    const std = n > 0 ? Math.sqrt(variance / n) : 0;
    const thr = mean + this.k * std + this.minValue;

    this.hist[this.idx] = v;
    this.idx = (this.idx + 1) % this.hist.length;
    if (this.filled < this.hist.length) this.filled++;

    if (n < 8) return 0;
    if (v > thr && time - this.last > this.minGap) {
      this.last = time;
      return clamp((v / thr - 1) * 0.9 + 0.25);
    }
    return 0;
  }
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export interface SupportCheck {
  ok: boolean;
  status?: MicStatus;
}

export class AudioEngine {
  readonly features: AudioFeatures = createFeatures();
  sensitivity = 1;
  onStatus: ((status: MicStatus) => void) | null = null;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private test: { src: AudioBufferSourceNode; out: GainNode } | null = null;
  private testBuffer: AudioBuffer | null = null;
  private status: MicStatus = "idle";
  /** Analysing a source inside an OfflineAudioContext that the caller steps frame by frame. */
  private offline = false;

  /** Float spectrum in dBFS (no clipping, unlike byte data). */
  private freq = new Float32Array(1024);
  /** Spectrum normalised 0..1 over MIN_DB..MAX_DB. */
  private mag = new Float32Array(1024);
  private time = new Float32Array(2048);
  private prevMag = new Float32Array(1024);
  private binHz = 23.4375;

  private levelRange = new AdaptiveRange(0.22, 0.2);
  private bandRanges = Array.from({ length: BAND_COUNT }, () => new AdaptiveRange(0.14, 0.2));
  private specFloor = new Float32Array(SPECTRUM_BINS).fill(0.2);
  private specPeak = 0.3;
  private waveGain = 4;
  private bassEnv = -100;

  private broadOnset = new OnsetDetector(50, 1.4, 0.09, 0.004);
  private kickOnset = new OnsetDetector(45, 1.2, 0.22, 1.5);
  private hatOnset = new OnsetDetector(40, 1.5, 0.07, 0.003);

  private kickTimes: number[] = [];
  private onsetTimes: number[] = [];
  private silentFor = 0;
  private lastKickTime = -10;
  /** Diagnostics counters (read by dev tooling). */
  readonly counters = { kicks: 0, onsets: 0, hats: 0, frames: 0 };
  readonly dbg = { bassDb: 0, bassFlux: 0, flux: 0, gate: 0 };
  private startPromise: Promise<void> | null = null;
  /** Bumped by stop()/dispose() so in-flight permission requests know they are stale. */
  private generation = 0;
  private disposed = false;
  private byteTime: Uint8Array | null = null;
  private fast: FastBand[] = [];
  private lastHatTime = -10;

  static checkSupport(): SupportCheck {
    if (typeof window === "undefined") return { ok: false, status: "unsupported" };
    if (!window.isSecureContext) return { ok: false, status: "insecure" };
    if (!navigator.mediaDevices?.getUserMedia) return { ok: false, status: "unsupported" };
    if (!getAudioContextCtor()) return { ok: false, status: "unsupported" };
    return { ok: true };
  }

  /** The built-in test signal only needs Web Audio (no mic, no secure context). */
  static canTest(): boolean {
    return typeof window !== "undefined" && !!getAudioContextCtor();
  }

  get currentStatus(): MicStatus {
    return this.status;
  }

  get isLive(): boolean {
    return this.status === "live" || this.status === "test" || this.status === "muted" || this.status === "suspended";
  }

  get isTest(): boolean {
    return !!this.test;
  }

  /** True only while real samples (mic or test signal) are flowing through the analyser. */
  get isAnalysing(): boolean {
    return !!this.analyser && (this.offline || this.ctx?.state === "running");
  }

  private setStatus(s: MicStatus): void {
    if (this.disposed) return;
    this.status = s;
    this.onStatus?.(s);
  }

  private liveStatus(): MicStatus {
    if (this.ctx && this.ctx.state !== "running") return "suspended";
    if (this.test) return "test";
    const track = this.stream?.getAudioTracks()[0];
    return track?.muted ? "muted" : "live";
  }

  private ensureContext(): AudioContext {
    const Ctor = getAudioContextCtor()!;
    if (!this.ctx || this.ctx.state === "closed") {
      const ctx = new Ctor();
      // iOS/Safari can suspend or "interrupt" the context (calls, backgrounding).
      ctx.addEventListener("statechange", () => {
        if (this.ctx !== ctx || !this.source) return;
        this.setStatus(this.liveStatus());
      });
      this.ctx = ctx;
    }
    return this.ctx;
  }

  /** Try to resume a system-suspended context. Call from a user gesture on mobile. */
  resume(): void {
    if (!this.source || !this.ctx || this.ctx.state === "running" || this.ctx.state === "closed") return;
    void this.ctx
      .resume()
      .then(() => {
        if (this.source) this.setStatus(this.liveStatus());
      })
      .catch(() => undefined);
  }

  /** Must be called from a user gesture (tap/click) so mobile browsers unlock audio. */
  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    const support = AudioEngine.checkSupport();
    if (!support.ok) {
      this.setStatus(support.status ?? "unsupported");
      return;
    }
    if (this.disposed || this.stream) return;
    // Switching from the test signal to the mic.
    if (this.test) this.teardown();
    const gen = this.generation;

    // Create/resume the context synchronously inside the gesture (required on iOS Safari).
    const ctx = this.ensureContext();
    void ctx.resume().catch(() => undefined);

    this.setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch (err) {
      if (gen !== this.generation || this.disposed) return;
      const name = (err as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
        this.setStatus("denied");
      } else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
        this.setStatus("nodevice");
      } else if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
        this.setStatus("busy");
      } else {
        this.setStatus("error");
      }
      return;
    }

    const stale = () => gen !== this.generation || this.disposed || this.ctx !== ctx || ctx.state === "closed";
    if (stale()) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
    if (stale()) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    const source = ctx.createMediaStreamSource(stream);
    this.setAudioSession("play-and-record");
    this.stream = stream;
    this.attach(ctx, source);

    const track = stream.getAudioTracks()[0];
    if (track) {
      track.addEventListener("mute", () => {
        if (this.stream === stream) this.setStatus("muted");
      });
      track.addEventListener("unmute", () => {
        if (this.stream === stream) this.setStatus("live");
      });
      track.addEventListener("ended", () => {
        if (this.stream === stream) this.stop("stopped");
      });
    }
    this.setStatus(this.liveStatus());
  }

  /**
   * Play the built-in test beat through the speaker and analyse it directly, so the rack
   * reacts with no microphone or music around. Call from a user gesture.
   */
  startTest(): void {
    if (this.disposed || !AudioEngine.canTest()) return;
    if (this.test) return;
    // Cancel any pending mic request and release the mic if it's patched in.
    this.generation++;
    this.teardown();
    const gen = this.generation;
    const ctx = this.ensureContext();
    this.setAudioSession("playback");
    // Resume inside the gesture (iOS unlock); the source can start a moment later.
    void ctx
      .resume()
      .then(() => {
        if (this.test) this.setStatus(this.liveStatus());
      })
      .catch(() => undefined);
    const rec = peekTestRecord();
    if (this.testBuffer || rec) {
      this.testBuffer ??= buildTestBeat(ctx, rec!);
      this.playTest(ctx);
      return;
    }
    // Still synthesising (normally done within a second or two of page load).
    void loadTestRecord().then(r => {
      if (gen !== this.generation || this.disposed || this.ctx !== ctx || this.test) return;
      this.testBuffer = buildTestBeat(ctx, r);
      this.playTest(ctx);
      this.onTestReady?.();
    });
  }

  /** Fired when a test start had to wait for the record to finish synthesising. */
  onTestReady: (() => void) | null = null;

  private playTest(ctx: AudioContext): void {
    if (!this.testBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.testBuffer;
    src.loop = true;
    const out = ctx.createGain();
    out.gain.value = 0.6;
    src.connect(out);
    out.connect(ctx.destination);
    this.test = { src, out };
    // Analyse the dry source so detection doesn't depend on speaker volume or the mute switch.
    this.attach(ctx, src);
    src.start();
    this.setStatus(this.liveStatus());
  }

  /** Wire a source into the main analyser and the fast transient bands. */
  private attach(ctx: BaseAudioContext, source: AudioNode): void {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.12;
    analyser.minDecibels = MIN_DB;
    analyser.maxDecibels = MAX_DB;
    source.connect(analyser);
    const floatTime = typeof analyser.getFloatTimeDomainData === "function";
    this.fast = FAST_BANDS.map(cfg => {
      const filter = ctx.createBiquadFilter();
      filter.type = cfg.type;
      filter.frequency.value = cfg.freq;
      filter.Q.value = cfg.q;
      const a = ctx.createAnalyser();
      a.fftSize = cfg.size;
      a.smoothingTimeConstant = 0;
      source.connect(filter);
      filter.connect(a);
      return {
        filter,
        analyser: a,
        buf: new Float32Array(cfg.size),
        byteBuf: floatTime ? null : new Uint8Array(cfg.size),
        slow: 0,
        peak: 0.002,
        prev: 0,
        last: -10,
      };
    });
    this.source = source;
    this.analyser = analyser;
    this.freq = new Float32Array(analyser.frequencyBinCount);
    this.mag = new Float32Array(analyser.frequencyBinCount);
    this.time = new Float32Array(analyser.fftSize);
    this.byteTime = floatTime ? null : new Uint8Array(analyser.fftSize);
    this.prevMag = new Float32Array(analyser.frequencyBinCount);
    this.binHz = ctx.sampleRate / analyser.fftSize;
    this.silentFor = 0;
    this.bassEnv = -100;
  }

  /**
   * Preview rendering: analyse `source` inside an OfflineAudioContext. The caller suspends
   * the context at each video frame and calls update(), so picture and sound stay sample-locked.
   */
  attachOffline(ctx: OfflineAudioContext, source: AudioNode): void {
    this.generation++;
    this.teardown();
    this.attach(ctx, source);
    this.offline = true;
    this.setStatus("test");
  }

  /** iOS 17+: choose whether Web Audio plays through the ringer switch. */
  private setAudioSession(type: "playback" | "play-and-record" | "auto"): void {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = type;
    } catch {
      // Not supported; ignore.
    }
  }

  /** Disconnect every node and release the mic, without touching status or the context. */
  private teardown(): void {
    this.offline = false;
    if (this.test) {
      try {
        this.test.src.stop();
      } catch {
        // Already stopped.
      }
      this.test.src.disconnect();
      this.test.out.disconnect();
      this.test = null;
    }
    this.source?.disconnect();
    for (const b of this.fast) {
      b.filter.disconnect();
      b.analyser.disconnect();
    }
    this.fast = [];
    this.stream?.getTracks().forEach(t => t.stop());
    this.source = null;
    this.analyser = null;
    this.stream = null;
  }

  stop(nextStatus: MicStatus = "stopped"): void {
    this.generation++;
    this.teardown();
    this.setAudioSession("auto");
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend().catch(() => undefined);
    this.setStatus(nextStatus);
  }

  dispose(): void {
    this.stop("idle");
    this.disposed = true;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.onStatus = null;
  }

  /** Analyse the current audio frame. Falls back to a gentle synthetic signal when not live. */
  update(dt: number, now: number): AudioFeatures {
    const f = this.features;
    f.onset = false;
    f.kick = false;
    f.hat = false;
    f.snare = false;
    f.beatPulse *= Math.exp(-dt * 5.5);
    f.hitPulse *= Math.exp(-dt * 8);
    f.kickEnv *= Math.exp(-dt * 13);
    f.snareEnv *= Math.exp(-dt * 16);
    f.hatEnv *= Math.exp(-dt * 26);

    if (this.analyser && (this.offline || this.ctx?.state === "running")) {
      this.analyse(dt, now);
    } else {
      this.synthesize(dt, now);
    }
    f.transient = Math.max(f.kickEnv, f.snareEnv, f.hatEnv * 0.7);

    // Rolling onset rate (last 4 s).
    while (this.onsetTimes.length && now - this.onsetTimes[0] > 4) this.onsetTimes.shift();
    f.onsetRate = this.onsetTimes.length / 4;
    f.energy += (f.level - f.energy) * damp(0.4, dt);
    if (now - this.lastKickTime > 8) f.bpm *= Math.exp(-dt * 0.5);
    return f;
  }

  private analyse(dt: number, now: number): void {
    const f = this.features;
    const analyser = this.analyser!;
    analyser.getFloatFrequencyData(this.freq as Float32Array<ArrayBuffer>);
    if (this.byteTime) {
      // Older WebKit: no float time-domain API.
      analyser.getByteTimeDomainData(this.byteTime as Uint8Array<ArrayBuffer>);
      const bt = this.byteTime;
      for (let i = 0; i < bt.length; i++) this.time[i] = (bt[i] - 128) / 128;
    } else {
      analyser.getFloatTimeDomainData(this.time as Float32Array<ArrayBuffer>);
    }

    const s = this.sensitivity;
    const gainMul = 0.55 + 0.45 * s;

    // --- Loudness -------------------------------------------------------
    let sum = 0;
    let peakAbs = 0;
    const t = this.time;
    for (let i = 0; i < t.length; i++) {
      const v = t[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peakAbs) peakAbs = a;
    }
    const rms = Math.sqrt(sum / t.length);
    const db = 20 * Math.log10(rms + 1e-9);
    const abs = clamp((db + 70) / 60);
    const noiseGate = 0.16 / s;
    const gate = clamp((abs - noiseGate) / 0.12);
    const normLevel = this.levelRange.update(abs, dt);
    f.rawRms = rms;
    f.db = db;
    f.level = clamp(normLevel * gainMul * gate + abs * 0.15 * s * gate);

    if (rms < 0.0015) this.silentFor += dt;
    else this.silentFor = 0;
    f.silent = this.silentFor > 2.5;

    // --- Waveform (zero-crossing aligned, auto-gained) --------------------
    let start = 0;
    for (let i = 1; i < 768; i++) {
      if (t[i - 1] < 0 && t[i] >= 0) {
        start = i;
        break;
      }
    }
    const targetGain = clamp(0.85 / Math.max(peakAbs, 0.02), 1, 25);
    this.waveGain += (targetGain - this.waveGain) * damp(targetGain < this.waveGain ? 12 : 1.5, dt);
    const wave = f.waveform;
    const wg = this.waveGain * (0.25 + 0.75 * gate);
    for (let i = 0; i < WAVEFORM_SIZE; i++) {
      wave[i] = clamp((t[start + i] ?? 0) * wg, -1, 1);
    }

    // --- Spectrum magnitudes & flux ---------------------------------------
    const dbs = this.freq;
    const mag = this.mag;
    const prev = this.prevMag;
    const nyBins = dbs.length;
    const hz = this.binHz;
    const dbRange = MAX_DB - MIN_DB;
    for (let i = 0; i < nyBins; i++) {
      const v = (dbs[i] - MIN_DB) / dbRange;
      mag[i] = v > 0 ? (v < 1 ? v : 1) : 0;
    }
    let flux = 0;
    let hatFlux = 0;
    const fluxMax = Math.min(nyBins, Math.floor(12000 / hz));
    const hatStart = Math.floor(5000 / hz);
    for (let i = 1; i < fluxMax; i++) {
      const m = mag[i];
      const d = m - prev[i];
      if (d > 0) {
        flux += d;
        if (i >= hatStart) hatFlux += d;
      }
      prev[i] = m;
    }
    flux /= fluxMax;
    hatFlux /= Math.max(1, fluxMax - hatStart);

    // --- Bands --------------------------------------------------------------
    for (let b = 0; b < BAND_COUNT; b++) {
      const lo = Math.max(1, Math.floor(BAND_EDGES[b] / hz));
      const hi = Math.min(nyBins - 1, Math.max(lo + 1, Math.floor(BAND_EDGES[b + 1] / hz)));
      let acc = 0;
      for (let i = lo; i < hi; i++) acc += mag[i];
      const raw = acc / (hi - lo);
      const norm = clamp(this.bandRanges[b].update(raw, dt) * gainMul) * gate;
      const prevV = f.bands[b];
      f.bands[b] = prevV + (norm - prevV) * damp(norm > prevV ? 35 : 9, dt);
    }
    f.bass = Math.max(f.bands[0], f.bands[1]);
    f.mid = (f.bands[3] + f.bands[4]) * 0.5;
    f.high = (f.bands[5] + f.bands[6] + f.bands[7]) / 3;

    // Kick detection: rise of 40–150 Hz energy (in dB) above its slow envelope.
    const kLo = Math.max(1, Math.floor(40 / hz));
    const kHi = Math.max(kLo + 1, Math.floor(150 / hz));
    let bassPow = 0;
    for (let i = kLo; i < kHi; i++) bassPow += Math.pow(10, dbs[i] / 10);
    const bassDb = 10 * Math.log10(bassPow / (kHi - kLo) + 1e-12);
    const bassFlux = Math.max(0, bassDb - this.bassEnv);
    this.bassEnv += (bassDb - this.bassEnv) * damp(bassDb > this.bassEnv ? 6 : 10, dt);
    this.counters.frames++;
    this.dbg.bassDb = bassDb;
    this.dbg.bassFlux = bassFlux;
    this.dbg.flux = flux;
    this.dbg.gate = gate;

    // --- Transients -----------------------------------------------------------
    this.fastAnalyse(dt, now, gate);
    if (gate > 0.2) {
      const o = this.broadOnset.detect(flux, now);
      if (o > 0 && !f.onset) this.fireOnset(o, now);
      // Spectral detectors back up the fast path; the shared gap prevents double hits.
      const k = this.kickOnset.detect(bassFlux, now);
      if (k > 0 && f.bass > 0.2) this.tryKick(k, now);
      const h = this.hatOnset.detect(hatFlux, now);
      if (h > 0) this.tryHat(h, now);
    } else {
      this.broadOnset.detect(0, now);
      this.kickOnset.detect(0, now);
      this.hatOnset.detect(0, now);
    }

    // --- 64 log-spaced display bins -----------------------------------------
    const minF = 30;
    const maxF = 16000;
    const spec = f.spectrum;
    let frameMax = 0;
    const tmp = this.specTmp;
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const f0 = minF * Math.pow(maxF / minF, i / SPECTRUM_BINS);
      const f1 = minF * Math.pow(maxF / minF, (i + 1) / SPECTRUM_BINS);
      const lo = Math.max(1, Math.floor(f0 / hz));
      const hi = Math.min(nyBins - 1, Math.max(lo + 1, Math.ceil(f1 / hz)));
      let m = 0;
      for (let j = lo; j < hi; j++) if (mag[j] > m) m = mag[j];
      const v = m;
      const fl = this.specFloor[i];
      this.specFloor[i] = v < fl ? fl + (v - fl) * damp(3, dt) : fl + (v - fl) * damp(0.04, dt);
      const x = Math.max(0, v - this.specFloor[i]);
      tmp[i] = x;
      if (x > frameMax) frameMax = x;
    }
    this.specPeak =
      frameMax > this.specPeak
        ? this.specPeak + (frameMax - this.specPeak) * damp(20, dt)
        : Math.max(0.12, this.specPeak + (frameMax - this.specPeak) * damp(0.2, dt));
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const target = clamp((tmp[i] / this.specPeak) * gainMul) * gate;
      const p = spec[i];
      spec[i] = p + (target - p) * damp(target > p ? 40 : 7, dt);
    }
  }

  private specTmp = new Float32Array(SPECTRUM_BINS);

  /** Reads only the newest few ms of each filtered band and fires hits on sharp energy jumps. */
  private fastAnalyse(dt: number, now: number, gate: number): void {
    const f = this.features;
    const s = this.sensitivity;
    for (let b = 0; b < this.fast.length; b++) {
      const fb = this.fast[b];
      const cfg = FAST_BANDS[b];
      const buf = fb.buf;
      if (fb.byteBuf) {
        fb.analyser.getByteTimeDomainData(fb.byteBuf as Uint8Array<ArrayBuffer>);
        for (let i = 0; i < buf.length; i++) buf[i] = (fb.byteBuf[i] - 128) / 128;
      } else {
        fb.analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
      }
      let sum = 0;
      for (let i = buf.length - cfg.window; i < buf.length; i++) sum += buf[i] * buf[i];
      const e = Math.sqrt(sum / cfg.window);
      const ratio = e / (fb.slow + 0.0004);
      const rising = e > fb.prev * 1.06;
      fb.prev = e;
      fb.slow += (e - fb.slow) * damp(e > fb.slow ? 2.5 : 5, dt);
      fb.peak = Math.max(e, fb.peak * Math.exp(-dt * 0.3), 0.002);
      const norm = clamp((e / fb.peak) * (0.7 + 0.3 * s)) * gate;

      let hit = 0;
      if (gate > 0.15 && rising && norm > 0.2 && ratio > cfg.ratio / Math.sqrt(s) && now - fb.last > cfg.gap) {
        fb.last = now;
        hit = clamp(0.3 + (ratio - cfg.ratio) * 0.22 + norm * 0.35);
      }
      if (b === 0) {
        f.fastLow = norm;
        if (hit > 0) this.tryKick(hit, now);
      } else if (b === 1) {
        f.fastMid = norm;
        if (hit > 0) {
          f.snare = true;
          f.snareEnv = Math.max(f.snareEnv, 0.5 + hit * 0.5);
          if (!f.onset) this.fireOnset(hit, now);
        }
      } else {
        f.fastHigh = norm;
        if (hit > 0) this.tryHat(hit, now);
      }
    }
  }

  private tryKick(strength: number, now: number): void {
    if (now - this.lastKickTime < 0.13) return;
    this.fireKick(strength, now);
  }

  private tryHat(strength: number, now: number): void {
    if (now - this.lastHatTime < 0.045) return;
    this.lastHatTime = now;
    const f = this.features;
    f.hat = true;
    f.hatEnv = Math.max(f.hatEnv, 0.4 + strength * 0.6);
    this.counters.hats++;
  }

  private fireOnset(strength: number, now: number): void {
    const f = this.features;
    f.onset = true;
    f.onsetStrength = strength;
    f.hitPulse = Math.max(f.hitPulse, strength);
    this.onsetTimes.push(now);
    this.counters.onsets++;
  }

  private fireKick(strength: number, now: number): void {
    const f = this.features;
    f.kick = true;
    this.counters.kicks++;
    f.beatPulse = Math.max(f.beatPulse, 0.5 + strength * 0.5);
    f.kickEnv = Math.max(f.kickEnv, 0.55 + strength * 0.45);
    this.lastKickTime = now;
    this.kickTimes.push(now);
    if (this.kickTimes.length > 16) this.kickTimes.shift();
    if (!f.onset) this.fireOnset(strength, now);

    const intervals: number[] = [];
    for (let i = 1; i < this.kickTimes.length; i++) {
      const d = this.kickTimes[i] - this.kickTimes[i - 1];
      if (d > 0.25 && d < 1.5) intervals.push(d);
    }
    if (intervals.length >= 4) {
      intervals.sort((a, b) => a - b);
      let bpm = 60 / intervals[Math.floor(intervals.length / 2)];
      while (bpm < 80) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      f.bpm = f.bpm < 1 ? bpm : f.bpm + (bpm - f.bpm) * 0.25;
    }
  }

  /** Gentle synthetic "idle hum" so the rack breathes before the mic is patched in. */
  private synthesize(dt: number, now: number): void {
    const f = this.features;
    const period = 0.6;
    const beatIdx = Math.floor(now / period);
    if (beatIdx !== this.idleBeat) {
      this.idleBeat = beatIdx;
      f.kick = true;
      f.beatPulse = 0.45;
      f.kickEnv = 0.4;
      if (beatIdx % 2 === 0) this.fireOnset(0.25, now);
    }
    const halfIdx = Math.floor(now / (period / 2));
    if (halfIdx !== this.idleHalf) {
      this.idleHalf = halfIdx;
      f.hat = true;
      f.hatEnv = 0.25;
    }
    f.fastLow = f.kickEnv * 0.6;
    f.fastMid = 0.1;
    f.fastHigh = f.hatEnv * 0.5;
    const swell = 0.5 + 0.5 * Math.sin(now * 0.35);
    f.level = clamp(0.1 + swell * 0.12 + f.beatPulse * 0.15);
    f.rawRms = 0;
    f.db = -100;
    f.silent = false;
    for (let b = 0; b < BAND_COUNT; b++) {
      const base = 0.12 + 0.18 * (0.5 + 0.5 * noise1(now * 0.9 + b * 3.1, b));
      const kick = b < 2 ? f.beatPulse * 0.55 : b > 5 ? f.hitPulse * 0.2 : 0;
      f.bands[b] = clamp(base * (0.6 + swell * 0.6) + kick);
    }
    f.bass = Math.max(f.bands[0], f.bands[1]);
    f.mid = (f.bands[3] + f.bands[4]) * 0.5;
    f.high = (f.bands[5] + f.bands[6] + f.bands[7]) / 3;
    const amp = 0.25 + f.beatPulse * 0.4;
    for (let i = 0; i < WAVEFORM_SIZE; i++) {
      const x = i / WAVEFORM_SIZE;
      f.waveform[i] =
        amp *
        (Math.sin(x * Math.PI * 2 * 3 + now * 2) * 0.7 +
          Math.sin(x * Math.PI * 2 * 11 + now * 5) * 0.2 * swell +
          Math.sin(x * Math.PI * 2 * 1 - now) * 0.3);
    }
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const x = i / SPECTRUM_BINS;
      const shape = Math.exp(-x * 2.2) * 0.6 + 0.12 * (0.5 + 0.5 * noise1(now * 3 + i * 0.7, 3));
      const kick = x < 0.2 ? f.beatPulse * 0.5 : 0;
      f.spectrum[i] = clamp(shape * (0.5 + swell * 0.5) + kick);
    }
    void dt;
  }

  private idleBeat = -1;
  private idleHalf = -1;
}
