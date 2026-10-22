export interface QualityLevel {
  scale: number;
  maxSparks: number;
  maxDebris: number;
  maxSmoke: number;
  maxCables: number;
  maxSegs: number;
  feedback: boolean;
}

export const QUALITY_LEVELS: QualityLevel[] = [
  { scale: 0.5, maxSparks: 250, maxDebris: 50, maxSmoke: 16, maxCables: 16, maxSegs: 10, feedback: false },
  { scale: 0.65, maxSparks: 450, maxDebris: 90, maxSmoke: 28, maxCables: 26, maxSegs: 12, feedback: true },
  { scale: 0.8, maxSparks: 700, maxDebris: 130, maxSmoke: 40, maxCables: 38, maxSegs: 16, feedback: true },
  { scale: 1.0, maxSparks: 1000, maxDebris: 180, maxSmoke: 50, maxCables: 52, maxSegs: 18, feedback: true },
];

/** Watches frame times and steps quality up or down to keep animation smooth. */
export class QualityGovernor {
  level: number;
  ema = 16.7;
  fps = 60;
  private bad = 0;
  private good = 0;
  private upgradeHold = 4;

  constructor(start: number) {
    this.level = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, start));
  }

  get current(): QualityLevel {
    return QUALITY_LEVELS[this.level];
  }

  /** Returns true when the level changed. */
  sample(dtSeconds: number): boolean {
    const ms = dtSeconds * 1000;
    this.ema = this.ema * 0.94 + ms * 0.06;
    this.fps = 1000 / this.ema;
    if (this.ema > 26) {
      this.bad += dtSeconds;
      this.good = 0;
    } else if (this.ema < 18.5) {
      this.good += dtSeconds;
      this.bad = 0;
    } else {
      this.bad = Math.max(0, this.bad - dtSeconds);
      this.good = 0;
    }
    if (this.bad > 1.5 && this.level > 0) {
      this.level--;
      this.bad = 0;
      this.ema = 17;
      this.upgradeHold = Math.min(30, this.upgradeHold * 2);
      return true;
    }
    if (this.good > this.upgradeHold && this.level < QUALITY_LEVELS.length - 1) {
      this.level++;
      this.good = 0;
      return true;
    }
    return false;
  }

  static initialLevel(): number {
    const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (coarse || small) return 1;
    if (cores <= 4) return 1;
    return 2;
  }
}
