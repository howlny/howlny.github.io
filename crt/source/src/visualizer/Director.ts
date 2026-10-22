import type { CompParams } from "./CompFX";
import { footage } from "./media/FootageBank";
import { chance, clamp, lerp, pick, rand, randInt } from "./math";
import type { AudioFeatures } from "./types";

interface FootMode {
  id: number;
  name: string;
  minChaos: number;
  weight: number;
  /** Footage opacity at low / high chaos. */
  mix: [number, number];
  param?: [number, number];
  /** Integer parameter (tiles, strips). */
  intParam?: boolean;
  key?: [number, number];
  grades?: number[];
}

/** Footage compositing modes. Index = shader MODE. */
export const FOOT_MODES: FootMode[] = [
  { id: 0, name: "RACK", minChaos: 0, weight: 1.2, mix: [0, 0] },
  { id: 1, name: "FEED", minChaos: 0, weight: 1.4, mix: [0.55, 0.95], grades: [0, 0, 1, 2, 3] },
  { id: 2, name: "KEY", minChaos: 0, weight: 1.1, mix: [0.8, 1], key: [0.18, 0.38], grades: [0, 1, 2] },
  { id: 3, name: "HOWL", minChaos: 0.1, weight: 0.9, mix: [1, 1], grades: [0, 1, 0] },
  { id: 4, name: "MIRROR", minChaos: 0, weight: 0.9, mix: [0.85, 1], grades: [1, 1, 0, 2] },
  { id: 5, name: "CCTV", minChaos: 0, weight: 1, mix: [0.9, 1], param: [2, 3], intParam: true, grades: [2, 0, 3, 1] },
  { id: 6, name: "STRIPS", minChaos: 0.3, weight: 0.9, mix: [0.9, 1], param: [3, 9], intParam: true, grades: [0, 1, 2, 4] },
  { id: 7, name: "RUTT-ETRA", minChaos: 0.2, weight: 0.8, mix: [0.9, 1], param: [55, 120], intParam: true, grades: [2, 0, 1] },
  { id: 8, name: "HALFTONE", minChaos: 0.25, weight: 0.7, mix: [0.85, 1], param: [7, 14], grades: [2, 0, 4] },
  { id: 9, name: "ASCII", minChaos: 0.3, weight: 0.7, mix: [0.9, 1], param: [9, 16], intParam: true, grades: [2, 0, 0] },
  { id: 10, name: "NEON", minChaos: 0.25, weight: 0.8, mix: [0.9, 1], grades: [0, 1, 4] },
  { id: 11, name: "MELT", minChaos: 0.45, weight: 0.7, mix: [0.9, 1], grades: [0, 2, 4] },
  { id: 12, name: "XEROX", minChaos: 0.4, weight: 0.7, mix: [0.85, 1], key: [0.3, 0.55], grades: [0, 2, 4] },
  { id: 13, name: "SLICE", minChaos: 0.35, weight: 0.9, mix: [1, 1], param: [6, 18], intParam: true, grades: [0, 1, 2] },
];

const IDLE_MODES = [1, 4, 5, 3, 2];

/** Sequences HOWL footage over the rack: modes, cuts, stutters and logo slams, all from the audio. */
export class Director {
  private mode = 5;
  private grade = 2;
  private param = 2;
  private key = 0.3;
  private beats = 0;
  private hold = 8;
  private mix = 0;
  /**
   * Punch-through envelope: 1 on every footage cut, gone in ~150 ms. The visualizer ducks the
   * tape noise with it so each new shot lands readable before the destruction closes over it.
   */
  punch = 0;
  /** Seconds the punch stays at full strength before it decays. */
  private punchHold = 0;

  private punchCut(): void {
    this.punch = 1;
    this.punchHold = 0.06;
  }
  private zoom = 0;
  private seed = 1;
  private logo = 0;
  private logoKind = 0;
  private logoScale = 0.6;
  private logoX = 0.5;
  private logoY = 0.5;
  private stutter = 0;
  private stutterCell = 0;
  private idleT = 0;
  private sweep = -1;
  private kicks = 0;
  private sinceAtlas = 0;
  private portrait = false;
  /** Shown in the OSD. */
  label = "CAM_01";
  modeName = "CCTV";
  onMode: ((name: string) => void) | null = null;

  private out: CompParams = {
    time: 0, mix: 0, mode: 0, cell: 0, cols: 2, rows: 2, cellAspect: 16 / 9, hasFoot: 0,
    logo: 0, logoKind: 0, logoScale: 0.6, logoX: 0.5, logoY: 0.5, zoom: 0, key: 0.3, param: 2,
    kick: 0, hat: 0, snare: 0, level: 0, sweepPos: -1, sweepAmt: 0, grade: 0, seed: 1, punch: 0,
  };

  setPortrait(p: boolean): void {
    this.portrait = p;
    footage.prefer(p);
  }

  private choose(chaos: number): void {
    const pool = FOOT_MODES.filter(m => m.minChaos <= chaos + 0.001 && m.id !== this.mode);
    let total = 0;
    for (const m of pool) total += m.weight * (m.id === 0 ? 1.4 - chaos : 1);
    let r = Math.random() * total;
    let next = pool[0];
    for (const m of pool) {
      r -= m.weight * (m.id === 0 ? 1.4 - chaos : 1);
      if (r <= 0) {
        next = m;
        break;
      }
    }
    this.apply(next);
  }

  private apply(m: FootMode): void {
    this.mode = m.id;
    this.modeName = m.name;
    this.grade = m.grades ? pick(m.grades) : 0;
    if (m.param) this.param = m.intParam ? randInt(m.param[0], m.param[1]) : rand(m.param[0], m.param[1]);
    if (m.key) this.key = rand(m.key[0], m.key[1]);
    if (m.id === 3) {
      this.logoKind = chance(0.5) ? 0 : 1;
      this.logoScale = this.portrait ? rand(0.86, 0.96) : rand(0.55, 0.78);
      this.logoX = 0.5;
      this.logoY = 0.5;
    }
    footage.cutCell();
    if (m.id !== 0) this.punchCut();
    this.seed = Math.floor(rand(1, 999));
    this.label = `CAM_0${footage.cell + 1}`;
    this.onMode?.(m.name);
  }

  private slamLogo(big: boolean): void {
    this.logo = 1;
    this.logoKind = chance(0.55) ? 0 : 1;
    this.logoScale = (this.portrait ? 0.9 : 0.62) * (big ? rand(1, 1.15) : rand(0.45, 0.7));
    this.logoX = big ? 0.5 : rand(0.3, 0.7);
    this.logoY = big ? 0.5 : pick([0.22, 0.5, 0.78]);
  }

  /** Drops and phase-ups: new atlas, big logo. */
  drop(chaos: number): void {
    if (footage.switchAtlas()) this.sinceAtlas = 0;
    this.slamLogo(true);
    this.choose(Math.max(chaos, 0.4));
    this.beats = 0;
  }

  update(dt: number, f: AudioFeatures, chaos: number, analyzing: boolean, time: number, flashOK: boolean): CompParams {
    const o = this.out;
    const v = footage.video;
    const atlas = footage.atlas;
    o.hasFoot = v && atlas ? 1 : 0;
    if (v && atlas) {
      o.cols = atlas.cols;
      o.rows = atlas.rows;
      o.cellAspect = v.videoWidth / atlas.cols / (v.videoHeight / atlas.rows);
    }

    let target = 0;
    const m = FOOT_MODES[this.mode];
    if (!analyzing) {
      // Waiting for input: a slow, moody tour of the footage behind the panel.
      this.idleT += dt;
      if (this.idleT > 4.2) {
        this.idleT = 0;
        const next = FOOT_MODES[pick(IDLE_MODES.filter(i => i !== this.mode))];
        this.apply(next);
        if (next.id === 3) this.grade = 1;
      }
      target = this.mode === 0 ? 0 : 0.55;
    } else if (f.silent) {
      target = 0;
    } else {
      if (f.kick) {
        this.kicks++;
        this.beats++;
        this.sinceAtlas++;
        this.zoom = Math.max(this.zoom, 0.04 + chaos * 0.1);
        this.hold = chaos < 0.3 ? 8 : chaos < 0.55 ? 4 : chaos < 0.8 ? 2 : 1;
        if (this.beats >= this.hold) {
          this.beats = 0;
          this.choose(chaos);
        } else if (chaos > 0.45 || this.kicks % 2 === 0) {
          footage.cutCell();
          this.label = `CAM_0${footage.cell + 1}`;
          if (this.mode !== 0) this.punchCut();
        }
        this.seed += 1;
        if (this.sinceAtlas > (chaos > 0.6 ? 16 : 32) && footage.switchAtlas()) this.sinceAtlas = 0;
        if (chaos > 0.75 ? this.kicks % 4 === 0 : chaos > 0.5 ? this.kicks % 16 === 0 : false) this.slamLogo(chaos > 0.85 && chance(0.5));
        if (chaos < 0.55 && this.kicks % 4 === 1) this.sweep = -0.4;
      }
      if (f.snare && chaos > 0.35 && chance(0.4 + chaos * 0.5)) {
        // Stutter cut: a couple of frames of another shot.
        this.stutter = rand(0.04, 0.09);
        this.stutterCell = (footage.cell + randInt(1, Math.max(1, footage.cellCount - 1))) % footage.cellCount;
      }
      if (f.hat && chaos > 0.6 && (this.mode === 5 || this.mode === 6 || this.mode === 13)) this.seed += 1;
      const [lo, hi] = m.mix;
      target = lerp(lo, hi, chaos);
      // Hits push the picture in harder.
      target = clamp(target * (0.82 + 0.18 * f.kickEnv) + (this.mode === 1 ? f.kickEnv * 0.15 : 0));
    }
    // Fast attack, slower release, so cuts land on the transient.
    const k = target > this.mix ? 1 - Math.exp(-dt * 40) : 1 - Math.exp(-dt * 6);
    this.mix += (target - this.mix) * k;
    this.zoom *= Math.exp(-dt * 7);
    if (this.punchHold > 0) {
      this.punchHold -= dt;
      this.punch = 1;
    } else {
      this.punch *= Math.exp(-dt * 7);
    }
    if (!analyzing || f.silent) {
      this.punch = 0;
      this.punchHold = 0;
    }
    this.logo *= Math.exp(-dt * (flashOK ? 5 : 3.5));
    if (!flashOK) this.logo = Math.min(this.logo, 0.75);
    this.stutter -= dt;
    if (this.sweep < 1.6) this.sweep += dt * 2.6;

    o.time = time;
    o.mix = this.mix;
    o.punch = this.mode === 0 ? 0 : clamp(this.punch);
    o.mode = this.mode;
    o.cell = this.stutter > 0 ? this.stutterCell : footage.cell;
    o.logo = this.mode === 3 ? 0 : this.logo;
    o.logoKind = this.logoKind;
    o.logoScale = this.mode === 3 ? this.logoScale * (1 + f.kickEnv * 0.06) : this.logoScale * (1 + (1 - this.logo) * 0.15);
    o.logoX = this.logoX;
    o.logoY = this.logoY;
    o.zoom = this.zoom;
    o.key = this.key;
    o.param = this.param;
    o.kick = f.kickEnv;
    o.hat = f.hatEnv;
    o.snare = f.snareEnv;
    o.level = f.level;
    o.sweepPos = this.sweep;
    o.sweepAmt = this.sweep < 1.6 ? 0.35 : 0;
    o.grade = this.grade;
    o.seed = this.seed;
    return o;
  }
}
