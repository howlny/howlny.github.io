import { AudioEngine } from "./AudioEngine";
import { CableSystem } from "./Cables";
import type { CompParams } from "./CompFX";
import { Director } from "./Director";
import { FX, arcColor } from "./FX";
import { Overlays, type OverlayFrame } from "./Overlays";
import { FONT_MONO, FONT_STENCIL, FONT_VCR } from "./palette";
import { PostFX, type PostParams } from "./PostFX";
import { ProgramDeck } from "./Programs";
import { QUALITY_LEVELS, QualityGovernor } from "./Quality";
import { Rack } from "./Rack";
import { buildBrandAtlas } from "./media/brandAtlas";
import { footage } from "./media/FootageBank";
import { photoBank } from "./photo/PhotoBank";
import { STAMP_WORDS, Stamps } from "./Stamps";
import { loadTestRecord } from "./testRecordLoader";
import { chance, clamp, damp, lerp, noise1, pick, rand } from "./math";
import type { MicStatus, Phase, Telemetry } from "./types";

export interface VisualizerCallbacks {
  onTelemetry?: (t: Telemetry) => void;
  onStatus?: (s: MicStatus) => void;
}

const PHASES: { phase: Phase; at: number }[] = [
  { phase: "IDLE", at: 0 },
  { phase: "WARM", at: 0.15 },
  { phase: "HOT", at: 0.35 },
  { phase: "OVERLOAD", at: 0.58 },
  { phase: "MELTDOWN", at: 0.8 },
];

export class Visualizer {
  readonly audio = new AudioEngine();
  private readonly fx = new FX();
  private readonly rack = new Rack(this.fx);
  private readonly cables = new CableSystem(this.rack, this.fx);
  private readonly stamps = new Stamps();
  private readonly overlays = new Overlays();
  private readonly programs = new ProgramDeck();
  /** Sequences the HOWL footage and logo over the rack. */
  readonly director = new Director();
  private comp: CompParams | null = null;
  private readonly governor = new QualityGovernor(QualityGovernor.initialLevel());

  private readonly scene: HTMLCanvasElement;
  private readonly sctx: CanvasRenderingContext2D;
  private readonly glCanvas: HTMLCanvasElement;
  /** VCR on-screen display, composited above the tape picture like a real deck's OSD. */
  private readonly osd: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private osdScale = 1;
  private post: PostFX | null;
  private readonly container: HTMLElement;
  private readonly cb: VisualizerCallbacks;

  private W = 1;
  private H = 1;
  private renderScale = 1;
  private panelScale = 1;

  intensity = 0.85;
  /** Full-frame flashes (strobe, invert, color bars, blue screen) allowed. */
  flashOK = true;
  private chaos = 0;
  private phaseIdx = 0;
  private trauma = 0;
  private flashEnv = 0;
  private flashColor: [number, number, number] = [1, 0.55, 0.25];
  private invertEnv = 0;
  private glitchEnv = 0;
  private mirrorEnv = 0;
  private strobeEnv = 0;
  private strobeCooldown = 0;
  private snowEnv = 0;
  private rollPos = 0;
  // VHS tape transport state.
  private trackEnv = 0;
  private trackY = 0.5;
  private trackV = 0.1;
  private vjump = 0;
  private chanT = 0;
  private chanMode = 0;
  private macroEnv = 0;
  private paused = false;
  private field = 0;
  private quietFor = 0;
  private destructCooldown = 0;
  private spawnCooldown = 0;
  private stampCooldown = 0;
  private traceY = 0.5;
  private readonly reducedMotion: boolean;

  private time = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private ready = false;
  private telemetryTimer = 0;
  private resizeTimer = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  /** Dev profiling: rolling ms spent per section. */
  readonly prof = { update: 0, scene: 0, post: 0, frame: 0 };
  private renderStart = 0;
  private readonly oframe: OverlayFrame;

  constructor(container: HTMLElement, callbacks: VisualizerCallbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (this.reducedMotion) {
      this.intensity = 0.45;
      this.flashOK = false;
    }
    this.oframe = {
      W: 1,
      H: 1,
      f: this.audio.features,
      chaos: 0,
      time: 0,
      I: this.intensity,
      flashOK: this.flashOK,
      scale: 1,
      program: this.programs.label,
      track: 0,
      cam: "CAM_01",
      feed: "CCTV",
    };
    this.programs.onSwitch = p => this.overlays.programSwitch(p.id, p.name);

    this.scene = document.createElement("canvas");
    this.sctx = this.scene.getContext("2d", { alpha: false })!;
    this.glCanvas = document.createElement("canvas");
    this.post = PostFX.create(this.glCanvas);

    const display = this.post ? this.glCanvas : this.scene;
    display.className = "wr-canvas";
    container.appendChild(display);
    this.osd = document.createElement("canvas");
    this.osd.className = "wr-canvas wr-osd";
    this.octx = this.osd.getContext("2d")!;
    container.appendChild(this.osd);

    this.audio.onStatus = s => this.cb.onStatus?.(s);
    this.rack.onSlam = m => {
      const p0 = m.localToWorld(0, m.h);
      const p1 = m.localToWorld(m.w, m.h);
      this.fx.sparkBurst(p0.x, p0.y, 14, 500, -1, -1, 1.2);
      this.fx.sparkBurst(p1.x, p1.y, 14, 500, 1, -1, 1.2);
      this.fx.smokePuff((p0.x + p1.x) / 2, p0.y, 3, this.rack.rowH * 0.15);
      this.addTrauma(0.22);
    };
    this.cables.onPlug = (x, y) => {
      this.fx.flash(x, y, this.rack.rowH * 0.3, "#FFE27A", 0.15);
    };
  }

  async init(): Promise<void> {
    const r0 = this.container.getBoundingClientRect();
    this.director.setPortrait(r0.height > r0.width * 1.05);
    footage.start();
    const photos = photoBank.load();
    await Promise.all([this.loadFonts(), Promise.race([photos, new Promise(r => setTimeout(r, 2500))])]);
    if (this.disposed) return;
    void buildBrandAtlas().then(c => this.post?.setBrand(c));
    this.layout();
    // Slow network: the photographed rack drops in over the stand-in once it arrives.
    if (!photoBank.ready) photoBank.onReady(() => this.reskin());
    this.resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.layout(), 180);
    });
    this.resizeObserver.observe(this.container);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.ready = true;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    // Synthesise the test record in a worker while the start screen idles, so TEST starts instantly.
    void loadTestRecord();
  }

  private async loadFonts(): Promise<void> {
    if (!("fonts" in document)) return;
    const loads = Promise.all([
      document.fonts.load(`500 12px ${FONT_MONO}`),
      document.fonts.load(`700 12px ${FONT_MONO}`),
      document.fonts.load(`400 40px ${FONT_STENCIL}`),
      document.fonts.load(`400 24px ${FONT_VCR}`),
    ]).catch(() => undefined);
    await Promise.race([loads, new Promise(r => setTimeout(r, 2200))]);
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    } else if (this.ready && !this.disposed && !this.running) {
      this.running = true;
      this.last = performance.now();
      this.audio.resume();
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private layout(): void {
    const rect = this.container.getBoundingClientRect();
    // Transient zero-size layouts (rotation, hidden iframes): keep the previous rack.
    if (rect.width < 40 || rect.height < 40) return;
    this.W = Math.round(rect.width);
    this.H = Math.round(rect.height);
    this.director.setPortrait(this.H > this.W * 1.05);
    const dpr = window.devicePixelRatio || 1;
    this.panelScale = clamp(Math.min(dpr, 2), 1, 2);
    this.applyQuality();
    this.osdScale = Math.min(dpr, 2);
    this.osd.width = Math.round(this.W * this.osdScale);
    this.osd.height = Math.round(this.H * this.osdScale);
    this.rack.layout(this.W, this.H, this.panelScale);
    this.cables.clear();
    this.fx.clear();
    this.overlays.clear();
    const target = this.cableTarget();
    for (let i = 0; i < target; i++) this.cables.spawn(false);
  }

  private reskin(): void {
    if (this.disposed) return;
    this.layout();
    for (const m of this.rack.modules) m.startDrop(this.rack.rowH * rand(0.6, 2.4) + m.row * 40);
    this.addTrauma(0.4);
  }

  private applyQuality(): void {
    const q = this.governor.current;
    const dpr = window.devicePixelRatio || 1;
    this.renderScale = clamp(dpr * q.scale, 0.5, 1.5);
    if (this.post) {
      // Never exceed what the GPU can hold as a texture/viewport.
      const max = this.post.maxSize;
      this.renderScale = Math.min(this.renderScale, max / this.W, max / this.H);
    }
    const pw = Math.round(this.W * this.renderScale);
    const ph = Math.round(this.H * this.renderScale);
    this.scene.width = pw;
    this.scene.height = ph;
    this.post?.resize(pw, ph);
    this.fx.maxSparks = q.maxSparks;
    this.fx.maxDebris = q.maxDebris;
    this.fx.maxSmoke = q.maxSmoke;
    this.cables.maxCables = q.maxCables;
    this.cables.maxSegs = q.maxSegs;
  }

  private cableTarget(): number {
    const modules = this.rack.attachedCount;
    return Math.min(this.cables.maxCables, Math.round(modules * (0.2 + this.chaos * 0.6)) + 3);
  }

  setIntensity(v: number): void {
    this.intensity = clamp(v);
  }

  setSensitivity(v: number): void {
    this.audio.sensitivity = clamp(v, 0.25, 3);
  }

  setFlash(on: boolean): void {
    this.flashOK = on;
  }

  async startMic(): Promise<void> {
    footage.unlock();
    await this.audio.start();
    if (this.audio.isLive) {
      this.stamps.slam("JOIN THE SIGNAL", this.W, this.H, true);
      this.addTrauma(0.5);
      this.flashEnv = 0.4;
      this.cables.electrify(0.6);
    }
  }

  stopMic(): void {
    this.audio.stop("stopped");
  }

  /** Start the built-in test beat (no mic needed). Call from a user gesture. */
  startTest(): void {
    footage.unlock();
    this.audio.startTest();
    if (this.audio.isTest) this.testBegan();
    else this.audio.onTestReady = () => this.testBegan();
  }

  private testBegan(): void {
    this.stamps.slam("TEST RECORD", this.W, this.H, true);
    this.addTrauma(0.5);
    this.flashEnv = 0.4;
    this.cables.electrify(0.6);
  }

  // ---------- Offline preview rendering (frame-stepped rendering for video capture) ----------

  /** Stop the live loop, pin top quality and analyse `source` inside an offline context. */
  beginOfflinePreview(ctx: OfflineAudioContext, source: AudioNode): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.governor.level = QUALITY_LEVELS.length - 1;
    this.applyQuality();
    this.audio.attachOffline(ctx, source);
    footage.setOffline(true);
    this.stamps.slam("TEST RECORD", this.W, this.H, true);
    this.addTrauma(0.5);
    this.flashEnv = 0.4;
    this.cables.electrify(0.6);
  }

  /** Advance and draw exactly one frame of `dt` seconds. */
  stepFrame(dt: number): void {
    this.time += dt;
    this.update(dt);
    this.render();
  }

  /** Composite the displayed picture and the OSD layer into `out` (call right after stepFrame). */
  captureTo(out: CanvasRenderingContext2D, w: number, h: number): void {
    const display = this.post && !this.post.lost ? this.glCanvas : this.scene;
    out.drawImage(display, 0, 0, w, h);
    out.drawImage(this.osd, 0, 0, w, h);
  }

  get size(): { w: number; h: number } {
    return { w: this.W, h: this.H };
  }

  /**
   * The picture isn't interactive (the mic does all the effecting); a tap only un-pauses
   * audio that the OS suspended, which mobile browsers require a gesture for.
   */
  resumeAudio(): void {
    this.audio.resume();
  }

  private overlayFrame(chaos: number): OverlayFrame {
    const o = this.oframe;
    o.W = this.W;
    o.H = this.H;
    o.chaos = chaos;
    o.time = this.time;
    o.I = this.intensity;
    o.flashOK = this.flashOK;
    o.scale = this.renderScale;
    o.program = this.programs.label;
    o.track = clamp(this.trackEnv + this.programs.out.skew * 0.5);
    o.cam = this.director.label;
    o.feed = this.director.modeName;
    return o;
  }

  private addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v);
  }

  private frame = (ts: number): void => {
    if (!this.running) return;
    const rawDt = Math.max(0.001, (ts - this.last) / 1000);
    const dt = Math.min(0.05, rawDt);
    this.last = ts;
    this.time += dt;
    try {
      const t0 = performance.now();
      this.update(dt);
      const t1 = performance.now();
      this.render();
      const p = this.prof;
      p.update = p.update * 0.9 + (t1 - t0) * 0.1;
      p.frame = p.frame * 0.9 + rawDt * 1000 * 0.1;
    } catch (err) {
      console.error("[HOWL] frame error", err);
    }
    // Ignore long gaps (tab switches, debugger pauses) but otherwise judge on real frame time.
    if (rawDt < 0.5 && this.governor.sample(rawDt)) this.applyQuality();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const f = this.audio.update(dt, this.time);
    const live = this.audio.isAnalysing;
    const I = this.intensity;

    // --- Escalation ----------------------------------------------------------
    const drive = live ? clamp(f.energy * 1.3 + f.onsetRate * 0.05 + f.level * 0.25) : 0.14;
    const target = clamp(drive * (0.4 + I * 1.1));
    this.chaos += (target - this.chaos) * damp(target > this.chaos ? 0.7 : 0.18, dt);
    // Instant per-hit bump on top of the slow macro state.
    const chaos = clamp(this.chaos + f.hitPulse * 0.12 * I + f.transient * 0.08 * I);

    // Phase with hysteresis
    let idx = this.phaseIdx;
    while (idx < PHASES.length - 1 && this.chaos > PHASES[idx + 1].at + 0.02) idx++;
    while (idx > 0 && this.chaos < PHASES[idx].at - 0.04) idx--;
    if (idx > this.phaseIdx && live) this.onPhaseUp(idx);
    this.phaseIdx = idx;

    // --- Timers ----------------------------------------------------------------------
    this.destructCooldown -= dt;
    this.spawnCooldown -= dt;
    this.stampCooldown -= dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    this.flashEnv *= Math.exp(-dt * 9);
    this.invertEnv = Math.max(0, this.invertEnv - dt * 14);
    this.glitchEnv *= Math.exp(-dt * 7);
    this.mirrorEnv = Math.max(0, this.mirrorEnv - dt);
    this.strobeEnv *= Math.exp(-dt * 45);
    this.strobeCooldown -= dt;
    this.snowEnv *= Math.exp(-dt * 18);
    this.trackEnv *= Math.exp(-dt * 3.5);
    this.trackY += this.trackV * dt;
    if (this.trackY > 1.15) this.trackY = -0.15;
    if (this.trackY < -0.15) this.trackY = 1.15;
    this.vjump *= Math.exp(-dt * 22);
    this.chanT -= dt;
    this.macroEnv *= Math.exp(-dt * 12);
    this.field = 1 - this.field;
    if (live && f.level < 0.12) {
      this.quietFor += dt;
      if (this.quietFor > 0.8 && !this.paused) {
        this.paused = true;
        this.overlays.pause();
      }
    }
    const o = this.overlayFrame(chaos);

    // --- Audio-triggered events ----------------------------------------------------
    if (f.onset) {
      this.cables.pulse(1 + Math.round(chaos * 4));
      this.addTrauma(f.onsetStrength * 0.12 * chaos * I);
      if (chaos > 0.3 && chance(chaos * 0.55)) this.spawnArc();
      if (chaos > 0.35) this.glitchEnv = Math.max(this.glitchEnv, f.onsetStrength * chaos);
    }
    if (f.kick) {
      this.programs.onKick(chaos);
      this.overlays.kick(o, f.kickEnv);
      // A hit after a breakdown: the drop.
      if (live && this.quietFor > 0.6 && f.kickEnv > 0.6 && chaos > 0.25) {
        this.snowEnv = 0.75;
        this.programs.jump(chaos);
        this.stamps.slam("DROP", this.W, this.H, true);
        this.overlays.drop();
        this.director.drop(chaos);
        this.trackEnv = 1;
        this.trackY = rand(0.2, 0.8);
        this.stampCooldown = 0.5;
        this.addTrauma(0.6);
      }
      this.quietFor = 0;
      this.paused = false;
      // Frame jumps and macroblock bursts land on the kick itself.
      if (chaos > 0.35 && chance(0.08 + chaos * 0.3)) this.vjump = rand(0.02, 0.1) * (this.reducedMotion ? 0.3 : 1);
      if (chaos > 0.5 && chance(0.12 + chaos * 0.3)) this.macroEnv = Math.max(this.macroEnv, rand(0.4, 1) * chaos);
      if (chaos > 0.6 && chance(0.1)) this.snowEnv = Math.max(this.snowEnv, rand(0.2, 0.45));
      if (this.flashOK && chaos > 0.72 && this.strobeCooldown <= 0 && chance(0.18 + (chaos - 0.72) * 1.2 * I)) {
        this.strobeEnv = 1;
        this.strobeCooldown = 0.28;
      }
      this.addTrauma(f.beatPulse * (0.1 + chaos * 0.35) * I);
      if (chaos > 0.5) {
        this.flashEnv = Math.max(this.flashEnv, 0.12 * f.beatPulse * chaos);
        this.flashColor = pick([
          [1, 0.45, 0.15],
          [1, 1, 1],
          [0.2, 0.9, 1],
          [1, 0.2, 0.8],
        ] as [number, number, number][]);
      }
      if (chaos > 0.25 && chance(0.1 + chaos * 0.35)) this.cables.snapRandom();
      this.tryDestruction(chaos, f.onsetStrength || f.beatPulse);
      if (chaos > 0.45 && this.stampCooldown <= 0 && chance(0.08 + chaos * 0.2)) {
        this.stamps.slam(pick(STAMP_WORDS), this.W, this.H);
        this.stampCooldown = 0.5;
      }
      if (this.flashOK && this.phaseIdx >= 4 && chance(0.12 * I)) this.invertEnv = 1;
      if (this.phaseIdx >= 4 && chance(0.06 * I)) this.mirrorEnv = rand(0.1, 0.3);
    }
    if (f.snare) {
      this.overlays.snare(o, f.snareEnv);
      if (chaos > 0.4) this.glitchEnv = Math.max(this.glitchEnv, f.snareEnv * chaos);
      if (chaos > 0.6 && chance(0.15)) this.snowEnv = Math.max(this.snowEnv, 0.35);
      if (this.programs.out.roll > 0) this.rollPos += rand(0.05, 0.3);
      // Tracking error: the band jumps somewhere new and starts rolling.
      if (chaos > 0.25 && chance(0.25 + chaos * 0.35)) {
        this.trackEnv = Math.max(this.trackEnv, rand(0.45, 1) * (0.4 + chaos * 0.6));
        this.trackY = rand(0.05, 0.95);
        this.trackV = rand(-0.5, 0.5);
      }
      if (chaos > 0.45 && chance(0.15 + chaos * 0.3)) {
        this.chanT = rand(0.04, 0.1);
        this.chanMode = 1 + Math.floor(rand(0, 3));
      }
      this.addTrauma(f.snareEnv * 0.1 * chaos * I);
    }
    if (f.hat) {
      this.programs.onHat(chaos);
      this.overlays.hat(o);
      if (chaos > 0.7 && chance(0.06)) this.snowEnv = Math.max(this.snowEnv, 0.25);
    }
    // Spontaneous tracking drift, more often the hotter it runs.
    if (live && chaos > 0.2 && chance(dt * (0.15 + chaos * 0.6))) {
      this.trackEnv = Math.max(this.trackEnv, rand(0.3, 0.7));
      this.trackV = rand(-0.35, 0.35);
    }
    if (f.hat && chaos > 0.45 && chance(0.35)) {
      const jacks = this.rack.jacks();
      if (jacks.length) {
        const j = pick(jacks);
        const p = j.m.jackWorld(j.i);
        this.fx.sparkBurst(p.x, p.y, 6, 420, 0, -1, Math.PI * 2);
      }
    }
    // Live snapped wires arc to the rack.
    if (chaos > 0.35) {
      for (const e of this.cables.liveEnds()) {
        if (chance(dt * (2 + chaos * 8))) {
          this.fx.arc(e.x, e.y, e.x + rand(-1, 1) * this.rack.rowH * 0.6, e.y + rand(-1, 1) * this.rack.rowH * 0.6, arcColor());
        }
      }
    }

    // --- Density: patch more cables when hot, pull them when it cools --------
    const tgt = this.cableTarget();
    const liveCables = this.cables.liveCount;
    if (liveCables < tgt && this.spawnCooldown <= 0) {
      this.cables.spawn(true);
      this.spawnCooldown = lerp(0.9, 0.1, chaos);
    } else if (liveCables > tgt + 4 && chance(dt * 0.8)) {
      this.cables.dropRandom();
    }

    this.rack.update(dt, f, chaos, this.time);
    this.cables.update(dt, f, chaos, this.time);
    this.fx.update(dt, this.H);
    this.stamps.update(dt);
    const P = this.programs.update(dt, chaos);
    this.comp = this.director.update(dt, f, chaos, live, this.time, this.flashOK);
    this.rollPos = (this.rollPos + dt * P.roll * (0.25 + chaos * 0.6 + f.kickEnv * 3)) % 1;
    this.overlays.update(dt, o);

    // --- Telemetry --------------------------------------------------------------
    this.telemetryTimer -= dt;
    if (this.telemetryTimer <= 0 && this.cb.onTelemetry) {
      this.telemetryTimer = 0.15;
      this.cb.onTelemetry({
        phase: PHASES[this.phaseIdx].phase,
        chaos: this.chaos,
        level: f.level,
        bpm: f.bpm,
        fps: this.governor.fps,
        quality: this.governor.level,
        silent: live && f.silent,
        cables: this.cables.liveCount,
        destroyed: this.rack.destroyedCount,
        program: this.programs.label,
      });
    }
  }

  private tryDestruction(chaos: number, strength: number): void {
    if (this.destructCooldown > 0 || !this.audio.isAnalysing) return;
    const slots = this.rack.slots.length || 1;
    const broken = this.rack.destroyedCount / slots;
    const maxBroken = 0.12 + chaos * 0.35;

    // Explode: loose modules first, then seated ones.
    let exploded = false;
    if (chaos > 0.58 && strength > 0.4 && chance(0.06 + (chaos - 0.58) * 0.9)) {
      const loose = this.rack.randomModule(m => m.state === "loose");
      const target = loose && chance(0.65) ? loose : broken < maxBroken ? this.rack.randomModule(m => m.state === "alive") : loose;
      if (target) {
        this.rack.explode(target, chaos, 0.8 + chaos * 0.5);
        this.addTrauma(0.55 * this.intensity + 0.15);
        this.flashEnv = Math.max(this.flashEnv, 0.45);
        this.flashColor = [1, 0.6, 0.3];
        this.glitchEnv = 1;
        this.cables.electrify(0.3);
        if (this.stampCooldown <= 0) {
          this.stamps.slam(pick(["DESTROYED", "BLOWN", "KILL", "FAULT", "BREACH", "BURN"]), this.W, this.H);
          this.stampCooldown = 0.4;
        }
        this.destructCooldown = 0.9 - chaos * 0.6;
        exploded = true;
      }
    }
    // Loosen: a module rips off a screw and swings. At the top end this stacks with explosions.
    if ((!exploded || chaos > 0.75) && chaos > 0.4 && broken < maxBroken && chance(0.05 + chaos * 0.22)) {
      const m = this.rack.randomModule(mm => mm.state === "alive");
      if (m && this.rack.loosen(m, chaos)) {
        this.addTrauma(0.25);
        if (!exploded) this.destructCooldown = 0.55 - chaos * 0.25;
      }
    }
  }

  private spawnArc(): void {
    const jacks = this.rack.jacks();
    if (jacks.length < 2) return;
    const a = pick(jacks);
    const pa = a.m.jackWorld(a.i);
    let best = a;
    let bestD = Infinity;
    for (let k = 0; k < 8; k++) {
      const b = pick(jacks);
      if (b === a) continue;
      const pb = b.m.jackWorld(b.i);
      const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (d > this.rack.hpPx * 2 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (best === a) return;
    const pb = best.m.jackWorld(best.i);
    this.fx.arc(pa.x, pa.y, pb.x, pb.y, arcColor());
  }

  private onPhaseUp(idx: number): void {
    const phase = PHASES[idx].phase;
    this.programs.jump(this.chaos);
    this.overlays.phaseUp(this.overlayFrame(this.chaos));
    if (idx >= 2) {
      this.director.drop(this.chaos);
      this.stamps.slam(phase, this.W, this.H, true);
      this.stampCooldown = 0.8;
      this.flashEnv = 0.35;
      this.addTrauma(0.4);
      this.cables.electrify(0.7);
    }
    if (phase === "MELTDOWN") {
      if (this.flashOK) this.invertEnv = 1;
      this.snowEnv = 0.6;
      for (let i = 0; i < 3; i++) {
        const m = this.rack.randomModule(mm => mm.state === "alive" || mm.state === "loose");
        if (m) this.rack.explode(m, this.chaos, 1.3);
      }
      this.addTrauma(0.8);
    }
  }

  private render(): void {
    this.renderStart = performance.now();
    const ctx = this.sctx;
    const W = this.W;
    const H = this.H;
    const f = this.audio.features;
    const chaos = this.chaos;
    const I = this.intensity;
    const s = this.renderScale;

    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // Camera: controlled shake + bass zoom
    const motion = this.reducedMotion ? 0.3 : 1;
    const t2 = this.trauma * this.trauma;
    const maxShake = Math.min(W, H) * 0.028 * motion;
    const ox = noise1(this.time * 26, 1) * maxShake * t2;
    const oy = noise1(this.time * 26, 2) * maxShake * t2;
    const rot = noise1(this.time * 17, 3) * 0.04 * t2 * motion;
    const zoom = 1.03 + f.beatPulse * 0.025 * (0.3 + chaos) * I * motion + this.trauma * 0.025;

    ctx.save();
    ctx.translate(W / 2 + ox, H / 2 + oy);
    ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    this.rack.drawBackground(ctx);
    this.rack.drawHoles(ctx, f, this.time);
    this.rack.drawModules(ctx, f, chaos, this.time);
    this.cables.draw(ctx);
    this.fx.drawSolid(ctx);
    this.fx.drawLight(ctx);
    this.drawTrace(ctx, chaos);
    this.stamps.draw(ctx);
    ctx.restore();
    // Without the GPU compositing pass the footage is laid over the rack in 2D.
    const c = this.comp;
    if ((!this.post || this.post.lost || !this.post.canComposite) && c && c.hasFoot && c.mode > 0 && c.mix > 0.02) {
      ctx.globalAlpha = Math.min(0.85, c.mix * 0.8);
      footage.drawCell(ctx, 0, 0, W, H, c.cell);
      ctx.globalAlpha = 1;
    }
    this.overlays.draw(ctx, this.overlayFrame(chaos), this.scene);

    const tPost = performance.now();
    if (this.post && !this.post.lost) {
      const q = QUALITY_LEVELS[this.governor.level];
      const g = this.glitchEnv;
      const P = this.programs.out;
      const kick = f.kickEnv;
      const snare = f.snareEnv;
      const hat = f.hatEnv;
      // How hard the active video program is driven.
      const amt = clamp(0.4 + chaos * 0.8) * (0.55 + I * 0.55);
      // Footage on screen is far brighter than the rack: pull back the passes that accumulate light.
      const cp = this.comp;
      const fm = cp && cp.hasFoot && cp.mode > 0 && this.post.canComposite ? clamp(cp.mix) : 0;
      // Footage punch-through: right after a cut the noise layers duck so the shot reads.
      const pu = fm > 0 ? clamp(this.director.punch) : 0;
      const duck = (k: number) => 1 - k * pu;
      const u: PostParams = {
        time: this.time,
        chaos,
        rgb:
          (0.001 + chaos * 0.004 + kick * 0.01 * (0.3 + chaos) + hat * 0.004 + g * 0.006 + P.rgb * 0.006 * amt) *
          (0.4 + I * 0.8),
        tear: clamp((chaos > 0.45 ? (chaos - 0.45) * 0.22 : 0) + g * 0.28 * I + snare * 0.25 * chaos, 0, 0.5),
        block: clamp(g * Math.max(0, chaos - 0.3) * 1.2 * I + snare * 0.5 * chaos) * duck(0.9),
        noise: (0.035 + chaos * 0.07 + g * 0.05 + hat * 0.05) * duck(0.6),
        // Trails surge on hits and clear between them, so the picture snaps back.
        feedback: q.feedback
          ? clamp(Math.max(chaos * 0.3 * (0.5 + I * 0.5), P.feedback * amt * 0.85) + kick * 0.15, 0, 0.88) *
            (1 - 0.45 * fm) *
            duck(0.75)
          : 0,
        flash: this.flashEnv * (0.5 + I * 0.5) * (this.flashOK ? 1 : 0.35),
        flashColor: this.flashColor,
        invert: this.flashOK && this.invertEnv > 0.5 ? 1 : 0,
        warp: 0.12 + chaos * 0.14 + kick * 0.08 * I * motion,
        scan: 0.22 + chaos * 0.1 + P.scan * 0.2,
        mirror: this.mirrorEnv > 0 ? 1 : amt > 0.5 ? P.mirror : 0,
        kaleido: P.kaleido * amt,
        segments: P.segments,
        wobble: P.wobble * amt * (0.5 + f.fastLow * 1.2 + kick) * motion,
        wobbleFreq: P.wobbleFreq,
        pixel: P.pixelate > 0 ? P.pixelate * (3 + chaos * 10 + kick * 8) * this.renderScale : 0,
        poster: P.posterize > 0 ? Math.max(2, P.posterize - Math.round(kick * 2)) : 0,
        colorize: P.colorize * amt * (1 - 0.4 * fm),
        palette: P.palette,
        solar: P.solarize * amt * duck(0.6),
        edge: P.edge * amt * duck(0.5),
        thermal: P.thermal * amt,
        osc: P.osc * amt * (0.6 + f.fastMid * 0.8),
        oscFreq: P.oscFreq * (1 + kick * 0.5),
        fbZoom: P.fbZoom + kick * 0.02,
        fbRot: P.fbRot * (1 + snare * 2),
        fbHue: P.fbHue,
        roll: this.rollPos,
        rollOn: P.roll * amt > 0.2 ? 1 : 0,
        skew: P.skew * amt + snare * 0.3 * chaos,
        scramble: clamp(P.scramble * amt + snare * 0.35 * chaos * I) * duck(0.9),
        yuv: P.yuv * amt,
        mask: this.governor.level >= 1 ? 0.35 + chaos * 0.25 : 0.25,
        bloom: (0.5 + chaos * 0.7 + kick * 0.6) * (1 - 0.65 * fm),
        snow: clamp(this.snowEnv) * (this.flashOK ? 1 : 0.4) * duck(0.95),
        zoom: kick * (0.03 + chaos * 0.07) * I * motion,
        kick,
        strobe: this.flashOK ? this.strobeEnv * 0.85 : 0,
        dropout: clamp(hat * chaos * 1.5 + g * 0.5) * duck(0.85),
        field: this.field,
        bandY: ((this.time * 0.37) % 1) * 1.3 - 0.15,
        quality: this.governor.level,
        tape: clamp((0.55 + chaos * 0.45) * (0.6 + I * 0.4) + kick * 0.2) * duck(0.55),
        track: clamp(this.trackEnv) * motion,
        trackY: this.trackY,
        streak: clamp(hat * (0.4 + chaos) * I + g * 0.6) * duck(0.8),
        macro: clamp(snare * chaos * 1.2 * I + g * Math.max(0, chaos - 0.4) + this.macroEnv) * duck(0.85),
        chan: this.chanT > 0 ? this.chanMode : 0,
        vjump: this.vjump,
        comb: clamp(hat * 0.8 * chaos + f.transient * 0.3) * motion,
        wrinkle: clamp(kick * chaos * 1.2 + (chaos > 0.7 ? 0.2 : 0)) * motion,
        drops: clamp(0.1 + chaos * 0.25 + hat * 1.2) * duck(0.85),
        clean: pu,
      };
      this.post.render(this.scene, u, this.comp, footage.video, footage.serial, footage.frameUnknown);
    } else if (this.post?.lost && this.glCanvas.parentElement) {
      // WebGL went away: fall back to the raw 2D canvas.
      this.glCanvas.replaceWith(this.scene);
      this.scene.className = "wr-canvas";
      this.post = null;
    }
    const tEnd = performance.now();
    this.prof.post = this.prof.post * 0.9 + (tEnd - tPost) * 0.1;
    this.prof.scene = this.prof.scene * 0.9 + (tPost - this.renderStart) * 0.1;

    // OSD layer: crisp, but it still shudders and splits on hits.
    const oc = this.octx;
    oc.setTransform(this.osdScale, 0, 0, this.osdScale, 0, 0);
    oc.clearRect(0, 0, W, H);
    this.overlays.drawOsd(oc, this.overlayFrame(chaos), clamp(f.kickEnv * 0.8 + f.snareEnv * 0.6 + this.vjump * 6));
  }

  /** At high chaos the scope signal escapes its module and slashes across the screen. */
  private drawTrace(ctx: CanvasRenderingContext2D, chaos: number): void {
    if (chaos < 0.5) return;
    const f = this.audio.features;
    const a = clamp((chaos - 0.5) / 0.35);
    if (f.kick && chance(0.3)) this.traceY = rand(0.2, 0.8);
    const y0 = this.H * this.traceY;
    const amp = this.H * (0.08 + f.level * 0.22);
    const n = 160;
    const wf = f.waveform;
    const stride = Math.floor(wf.length / n);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * this.W;
      const y = y0 - wf[i * stride] * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a * 0.35;
    ctx.strokeStyle = "#FF5A1F";
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.strokeStyle = "#FFE9D6";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.audio.dispose();
    footage.stop();
    this.glCanvas.remove();
    this.osd.remove();
    this.scene.remove();
  }
}
