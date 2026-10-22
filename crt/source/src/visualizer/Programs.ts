import { chance, clamp, pick, rand } from "./math";

/** Parameters a video "program" can drive in the CRT / video-synth pass. */
export interface ProgramParams {
  kaleido: number;
  segments: number;
  /** 0 none, 1 horizontal, 2 vertical, 3 quad. */
  mirror: number;
  wobble: number;
  wobbleFreq: number;
  /** 0..1 mosaic amount (scaled to a block size by the renderer). */
  pixelate: number;
  /** Quantization levels per channel, 0 = off. */
  posterize: number;
  colorize: number;
  palette: number;
  solarize: number;
  edge: number;
  thermal: number;
  osc: number;
  oscFreq: number;
  feedback: number;
  fbZoom: number;
  fbRot: number;
  fbHue: number;
  roll: number;
  skew: number;
  scramble: number;
  yuv: number;
  rgb: number;
  scan: number;
}

const BASE: ProgramParams = {
  kaleido: 0,
  segments: 6,
  mirror: 0,
  wobble: 0,
  wobbleFreq: 20,
  pixelate: 0,
  posterize: 0,
  colorize: 0,
  palette: 0,
  solarize: 0,
  edge: 0,
  thermal: 0,
  osc: 0,
  oscFreq: 30,
  feedback: 0,
  fbZoom: 0.01,
  fbRot: 0,
  fbHue: 0,
  roll: 0,
  skew: 0,
  scramble: 0,
  yuv: 0,
  rgb: 0,
  scan: 0,
};

/** Keys whose values are modes/counts rather than amounts; they are not blended. */
const DISCRETE: (keyof ProgramParams)[] = ["segments", "mirror", "wobbleFreq", "posterize", "palette", "oscFreq"];

export interface Program {
  id: string;
  name: string;
  /** Lowest chaos level at which this program enters the rotation. */
  minChaos: number;
  p: Partial<ProgramParams>;
}

export const PROGRAMS: Program[] = [
  { id: "01", name: "PHOSPHOR", minChaos: 0, p: { scan: 0.35 } },
  { id: "02", name: "ELASTIC WARP", minChaos: 0, p: { wobble: 1, wobbleFreq: 22, feedback: 0.35, fbZoom: 0.015 } },
  { id: "03", name: "THERMAL", minChaos: 0.12, p: { thermal: 1, posterize: 10 } },
  { id: "04", name: "POP POSTER", minChaos: 0.12, p: { posterize: 4, colorize: 0.75, palette: 1 } },
  { id: "05", name: "TECHNICOLOR", minChaos: 0, p: { colorize: 0.45, palette: 4, yuv: 0.6, rgb: 0.4 } },
  { id: "06", name: "SCRAMBLE", minChaos: 0.28, p: { scramble: 1, skew: 0.4, rgb: 0.8 } },
  { id: "07", name: "KALEIDO", minChaos: 0.28, p: { kaleido: 1, segments: 6, colorize: 0.25, palette: 2 } },
  { id: "08", name: "PINWHEEL", minChaos: 0.38, p: { kaleido: 1, segments: 12, feedback: 0.72, fbRot: 0.06, fbZoom: 0.02 } },
  { id: "09", name: "YUV PHASER", minChaos: 0.18, p: { yuv: 1, rgb: 0.6, wobble: 0.25 } },
  { id: "10", name: "BITCULL", minChaos: 0.32, p: { pixelate: 1, posterize: 3, rgb: 1 } },
  { id: "11", name: "SYNC LOSS", minChaos: 0.38, p: { roll: 1, skew: 1, scramble: 0.35 } },
  { id: "12", name: "TUNNEL", minChaos: 0.32, p: { feedback: 0.92, fbZoom: 0.05, fbHue: 0.12, fbRot: 0.015 } },
  { id: "13", name: "SOLAR EDGE", minChaos: 0.28, p: { solarize: 1, edge: 0.85, palette: 3 } },
  { id: "14", name: "QUAD MIRROR", minChaos: 0.45, p: { mirror: 3, osc: 0.35, oscFreq: 60, palette: 5 } },
  { id: "15", name: "OSC KEY", minChaos: 0.22, p: { osc: 1, oscFreq: 36, colorize: 0.4, palette: 3 } },
  { id: "16", name: "QUANTIZE", minChaos: 0.18, p: { posterize: 6, pixelate: 0.5, colorize: 0.3, palette: 0 } },
];

function value(p: Program, k: keyof ProgramParams): number {
  return p.p[k] ?? BASE[k];
}

/**
 * Switches programs on the beat. Calm music holds a program for bars; a meltdown flips
 * every kick, layers a second program on top and stutters to random programs on hats.
 */
export class ProgramDeck {
  primary = 0;
  private secondary = 1;
  private stutter = -1;
  private stutterT = 0;
  private beats = 0;
  /** Seconds since the last switch (used for the on-screen program banner). */
  sinceSwitch = 99;
  readonly out: ProgramParams = { ...BASE };
  onSwitch: ((p: Program) => void) | null = null;

  get current(): Program {
    return PROGRAMS[this.stutterT > 0 && this.stutter >= 0 ? this.stutter : this.primary];
  }

  get label(): string {
    const p = this.current;
    return `PRG ${p.id} ${p.name}`;
  }

  private choose(chaos: number, avoid: number): number {
    const pool: number[] = [];
    for (let i = 0; i < PROGRAMS.length; i++) {
      if (i !== avoid && PROGRAMS[i].minChaos <= chaos + 0.05) pool.push(i);
    }
    return pool.length ? pick(pool) : 0;
  }

  /** Force an immediate switch (phase changes, smashes). */
  jump(chaos: number): void {
    this.secondary = this.primary;
    this.primary = this.choose(chaos, this.primary);
    this.beats = 0;
    this.sinceSwitch = 0;
    this.onSwitch?.(PROGRAMS[this.primary]);
  }

  onKick(chaos: number): void {
    this.beats++;
    const hold = chaos < 0.25 ? 16 : chaos < 0.45 ? 8 : chaos < 0.65 ? 4 : chaos < 0.82 ? 2 : 1;
    if (this.beats >= hold) this.jump(chaos);
  }

  onHat(chaos: number): void {
    if (chaos > 0.68 && chance((chaos - 0.68) * 0.9)) {
      this.stutter = this.choose(chaos, this.primary);
      this.stutterT = rand(0.03, 0.09);
    }
  }

  update(dt: number, chaos: number): ProgramParams {
    this.stutterT -= dt;
    this.sinceSwitch += dt;
    const main = this.current;
    const layer = chaos > 0.6 ? clamp((chaos - 0.6) * 2.4) : 0;
    const sec = PROGRAMS[this.secondary];
    const out = this.out;
    for (const k of Object.keys(BASE) as (keyof ProgramParams)[]) {
      const mv = value(main, k);
      if (layer <= 0) {
        out[k] = mv;
        continue;
      }
      const sv = value(sec, k);
      if (DISCRETE.includes(k)) {
        out[k] = mv !== BASE[k] || layer < 0.5 ? mv : sv;
      } else {
        out[k] = Math.max(mv, sv * layer);
      }
    }
    return out;
  }
}
