/**
 * "HOWL TEST RECORD": a 60-second techno track synthesised entirely in code, so the
 * visualizer can be previewed with no microphone and no music in the room.
 *
 * 128 BPM, A minor, 32 bars:
 *   0-3   intro: kick, offbeat hats
 *   4-7   + claps, rolling bass, 16th hats
 *   8-11  + acid line opening up, open hats
 *   12-15 build: snare roll, noise riser, acid screaming, kick drops out, one-beat gap
 *   16-23 DROP 1: crash, sub boom, everything, chord stabs with ping-pong echo, ride
 *   24-27 breakdown: pad chords, filtered acid, riser + roll, two-beat silence
 *   28-31 DROP 2: everything again
 */
export const TEST_BPM = 128;
export const TEST_BARS = 32;
const SR = 44100;
const BEAT = 60 / TEST_BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const LEN = Math.ceil(TEST_BARS * BAR * SR);

/** Length of the record in seconds. */
export const TEST_SECONDS = TEST_BARS * BAR;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

/** RBJ biquad, enough for per-voice filtering. */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(type?: "lp" | "hp" | "bp", f?: number, q?: number) {
    if (type && f && q) this.set(type, f, q);
  }

  set(type: "lp" | "hp" | "bp", f: number, q: number): void {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    let b0: number;
    let b1: number;
    let b2: number;
    if (type === "lp") {
      b0 = (1 - cs) / 2;
      b1 = 1 - cs;
      b2 = (1 - cs) / 2;
    } else if (type === "hp") {
      b0 = (1 + cs) / 2;
      b1 = -(1 + cs);
      b2 = (1 + cs) / 2;
    } else {
      b0 = al;
      b1 = 0;
      b2 = -al;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - al) / a0;
  }

  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Zero-delay state-variable low-pass for the acid line (stable under fast cutoff sweeps). */
class SvfLP {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 1;
  private a2 = 0;
  private a3 = 0;

  set(f: number, q: number): void {
    const g = Math.tan((Math.PI * Math.min(f, SR * 0.45)) / SR);
    const k = 1 / q;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  run(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }
}

interface Section {
  kick: boolean;
  clap: boolean;
  /** 0 none, 1 offbeat, 2 offbeat + 16ths. */
  hats: number;
  open: boolean;
  ride: boolean;
  bass: boolean;
  /** 0 off, else level. */
  acid: number;
  stabs: boolean;
  pad: boolean;
}

function section(b: number): Section {
  const s: Section = { kick: true, clap: false, hats: 1, open: false, ride: false, bass: false, acid: 0, stabs: false, pad: false };
  if (b < 4) {
    s.hats = b < 2 ? 0 : 1;
  } else if (b < 8) {
    Object.assign(s, { clap: true, bass: true, hats: 2 });
  } else if (b < 12) {
    Object.assign(s, { clap: true, bass: true, hats: 2, open: true, acid: 0.8 });
  } else if (b < 16) {
    Object.assign(s, { kick: b < 15, clap: b < 14, bass: b < 15, hats: b < 15 ? 2 : 0, open: b < 14, acid: 1 });
  } else if (b < 24) {
    Object.assign(s, { clap: true, bass: true, hats: 2, open: true, ride: true, acid: 1, stabs: true });
  } else if (b < 28) {
    Object.assign(s, { kick: false, hats: b >= 26 ? 1 : 0, acid: b < 26 ? 0.45 : 0.7, pad: true });
  } else {
    Object.assign(s, { clap: true, bass: true, hats: 2, open: true, ride: true, acid: 1, stabs: true });
  }
  return s;
}

/** Silent gaps right before each drop: [start, end) in seconds. */
const GAPS: Array<[number, number]> = [
  [16 * BAR - BEAT, 16 * BAR],
  [28 * BAR - BEAT * 2, 28 * BAR],
];

/** Acid sequencer: semitones from A2, accents, slides and gates per 16th. */
const ACID_NOTES = [0, 0, 12, 0, 3, 0, 10, 0, 0, 7, 0, 5, 12, 0, 3, -2];
const ACID_ACC = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
const ACID_SLIDE = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const ACID_GATE = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1];
/** Bass roots per bar of the 4-bar loop: A1, A1, F1, G1. */
const BASS_ROOTS = [33, 33, 29, 31];
/** Breakdown pad chords (MIDI): Am, F, C, G. */
const PAD_CHORDS = [
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [55, 60, 64, 67],
  [55, 59, 62, 67],
];
/** Drop stab: Am9 voicing. */
const STAB = [57, 60, 64, 67, 71];

export interface TestRecord {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

let cache: TestRecord | null = null;

/** Acid cutoff automation across the arrangement (Hz) at time t seconds. */
function acidCutoff(t: number): number {
  const bf = t / BAR;
  if (bf < 12) return 260 + (bf - 8) * 180;
  if (bf < 16) return 980 + (bf - 12) * 650;
  if (bf < 24) return 1950 + 450 * Math.sin(((bf - 16) / 4) * Math.PI * 2 - Math.PI / 2);
  if (bf < 28) return 900 - (bf - 24) * 140;
  return 2100 + 1100 * Math.sin(((bf - 28) / 2) * Math.PI * 2);
}

/** Synthesise the record once (well under a second of CPU) and cache it. */
export function getTestRecord(): TestRecord {
  if (cache) return cache;
  const drums = new Float32Array(LEN);
  const dL = new Float32Array(LEN);
  const dR = new Float32Array(LEN);
  const music = new Float32Array(LEN);
  const mL = new Float32Array(LEN);
  const mR = new Float32Array(LEN);
  const stabL = new Float32Array(LEN);
  const stabR = new Float32Array(LEN);
  const fxL = new Float32Array(LEN);
  const fxR = new Float32Array(LEN);
  const duck = new Float32Array(LEN).fill(1);
  const rnd = rng(1337);

  const span = (at: number, len: number): [number, number] => {
    const s0 = Math.max(0, Math.floor(at * SR));
    return [s0, Math.min(LEN, s0 + Math.floor(len * SR))];
  };

  // ---------- Drums ----------
  const kick = (at: number, g: number) => {
    const [s0, s1] = span(at, 0.5);
    let ph = 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      const f = 46 + 150 * Math.exp(-t * 35) + 40 * Math.exp(-t * 300);
      ph += (2 * Math.PI * f) / SR;
      const body = Math.sin(ph) * Math.exp(-t * 6.5);
      const click = t < 0.005 ? (1 - t / 0.005) * rnd() * 0.5 : 0;
      drums[i] += Math.tanh((body + click) * 1.6) * 0.9 * g;
    }
    // Sidechain: everything melodic pumps off the kick.
    const s2 = Math.min(LEN, s0 + Math.floor(0.26 * SR));
    for (let i = s0; i < s2; i++) {
      const p = (i - s0) / (0.26 * SR);
      duck[i] = Math.min(duck[i], 0.2 + 0.8 * p * p * (3 - 2 * p));
    }
  };

  const clap = (at: number, g: number) => {
    const [s0, s1] = span(at, 0.3);
    const bp = new Biquad("bp", 1250, 1.1);
    const hp = new Biquad("hp", 600, 0.7);
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      // Three quick slaps then a tail.
      let env = Math.exp(-t * 18) * 0.55;
      for (const off of [0, 0.009, 0.018]) {
        const u = t - off;
        if (u >= 0 && u < 0.008) env += Math.exp(-u * 400);
      }
      const x = hp.run(bp.run(rnd())) * env * 1.4 * g;
      dL[i] += x * 0.95;
      dR[i] += x * 1.05;
    }
  };

  const snare = (at: number, g: number) => {
    const [s0, s1] = span(at, 0.2);
    const bp = new Biquad("bp", 2200, 0.8);
    let ph = 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      ph += (2 * Math.PI * (210 - 60 * t)) / SR;
      drums[i] += (bp.run(rnd()) * Math.exp(-t * 26) * 1.1 + Math.sin(ph) * Math.exp(-t * 40) * 0.35) * g;
    }
  };

  const hat = (at: number, g: number, open: boolean, pan: number) => {
    const [s0, s1] = span(at, open ? 0.28 : 0.07);
    const hp = new Biquad("hp", open ? 6500 : 8000, 0.8);
    const decay = open ? 13 : 70;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      const x = hp.run(rnd()) * Math.exp(-t * decay) * 0.42 * g;
      dL[i] += x * (1 - pan);
      dR[i] += x * (1 + pan);
    }
  };

  const RIDE_F = [205.3, 304.4, 369.6, 522.7, 540, 800];
  const ride = (at: number, g: number) => {
    const [s0, s1] = span(at, 0.6);
    const bp = new Biquad("bp", 9000, 1.4);
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      let m = 0;
      for (const f of RIDE_F) m += Math.sin(2 * Math.PI * f * 8.1 * t) > 0 ? 1 : -1;
      const x = bp.run(m * 0.18 + rnd() * 0.3) * Math.exp(-t * 6) * 0.35 * g;
      dL[i] += x * 0.7;
      dR[i] += x * 1.3;
    }
  };

  const crash = (at: number) => {
    const [s0, s1] = span(at, 2.4);
    const hpL = new Biquad("hp", 3800, 0.7);
    const hpR = new Biquad("hp", 4200, 0.7);
    const rR = rng(99);
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      const env = Math.exp(-t * 1.6) * (t < 0.003 ? t / 0.003 : 1) * 0.55;
      fxL[i] += hpL.run(rnd()) * env;
      fxR[i] += hpR.run(rR()) * env;
    }
  };

  const boom = (at: number) => {
    const [s0, s1] = span(at, 1.6);
    let ph = 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      ph += (2 * Math.PI * (30 + 40 * Math.exp(-t * 3))) / SR;
      drums[i] += Math.sin(ph) * Math.exp(-t * 2.2) * 0.75;
    }
  };

  const riser = (from: number, len: number) => {
    const [s0, s1] = span(from, len);
    const bpL = new Biquad();
    const bpR = new Biquad();
    let ph = 0;
    for (let i = s0; i < s1; i++) {
      const p = (i - s0) / (s1 - s0);
      if ((i - s0) % 32 === 0) {
        const fc = 400 * Math.pow(20, p);
        bpL.set("bp", fc, 2.5);
        bpR.set("bp", fc * 1.08, 2.5);
      }
      ph += (2 * Math.PI * (180 + p * p * 1400)) / SR;
      const g = p * p * 0.55;
      const tone = Math.sin(ph) * p * 0.12;
      fxL[i] += bpL.run(rnd()) * g + tone;
      fxR[i] += bpR.run(rnd()) * g + tone;
    }
  };

  // ---------- Bass ----------
  const bassNote = (at: number, note: number, len: number, g: number) => {
    const [s0, s1] = span(at, len);
    const lp = new Biquad();
    const f = midi(note);
    let ph = 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      if ((i - s0) % 16 === 0) lp.set("lp", 180 + 1400 * Math.exp(-t * 28), 1.6);
      ph += f / SR;
      const saw = 2 * (ph - Math.floor(ph)) - 1;
      const sub = Math.sin(2 * Math.PI * ph);
      const env = Math.min(1, t / 0.003) * Math.exp(-t * 9);
      music[i] += (lp.run(saw) * 0.55 + sub * 0.5) * env * g;
    }
  };

  // ---------- Acid ----------
  let acidPhase = 0;
  const acidFilter = new SvfLP();
  const acidBar = (b: number, level: number) => {
    const t0 = b * BAR;
    for (let st = 0; st < 16; st++) {
      if (!ACID_GATE[st]) continue;
      const at = t0 + st * STEP;
      const acc = ACID_ACC[st];
      const slideIn = st > 0 && ACID_SLIDE[st - 1] === 1;
      const len = ACID_SLIDE[st] ? STEP * 1.05 : STEP * 0.8;
      const [s0, s1] = span(at, len);
      const f1 = midi(45 + ACID_NOTES[st]);
      const f0 = slideIn ? midi(45 + ACID_NOTES[st - 1]) : f1;
      for (let i = s0; i < s1; i++) {
        const t = (i - s0) / SR;
        const f = slideIn ? f0 + (f1 - f0) * Math.min(1, t / 0.045) : f1;
        acidPhase += f / SR;
        if ((i - s0) % 8 === 0) {
          const env = Math.exp(-t * (acc ? 9 : 16));
          acidFilter.set(acidCutoff(at + t) * (1 + env * (acc ? 3.2 : 1.6)), acc ? 13 : 9);
        }
        const saw = 2 * (acidPhase - Math.floor(acidPhase)) - 1;
        const amp = Math.min(1, t / 0.002) * (slideIn ? 1 : Math.exp(-t * 5)) * (acc ? 1.25 : 0.85);
        const y = Math.tanh(acidFilter.run(saw) * 2.4) * 0.3 * amp * level;
        mL[i] += y * 0.9;
        mR[i] += y * 1.1;
      }
    }
  };

  // ---------- Chords ----------
  const stabFreqs = STAB.map(midi);
  const stab = (at: number, g: number) => {
    const [s0, s1] = span(at, 0.22);
    const lpL = new Biquad();
    const lpR = new Biquad();
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      if ((i - s0) % 16 === 0) {
        const fc = 500 + 4200 * Math.exp(-t * 22);
        lpL.set("lp", fc, 1.2);
        lpR.set("lp", fc * 1.05, 1.2);
      }
      let l = 0;
      let r = 0;
      for (const f of stabFreqs) {
        l += 2 * ((f * 0.996 * t) % 1) - 1;
        r += 2 * ((f * 1.004 * t) % 1) - 1;
      }
      const env = Math.min(1, t / 0.002) * Math.exp(-t * 14) * 0.11 * g;
      stabL[i] += lpL.run(l) * env;
      stabR[i] += lpR.run(r) * env;
    }
  };

  const padBar = (b: number, g: number) => {
    const chord = PAD_CHORDS[b % 4].map(midi);
    const len = BAR + 0.15;
    const [s0, s1] = span(b * BAR, len);
    const lpL = new Biquad();
    const lpR = new Biquad();
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      if ((i - s0) % 32 === 0) {
        const fc = 900 + 700 * Math.sin(t * 1.7 + b);
        lpL.set("lp", fc, 0.9);
        lpR.set("lp", fc * 1.1, 0.9);
      }
      const gt = i / SR;
      let l = 0;
      let r = 0;
      for (const f of chord) {
        l += 2 * ((f * 0.995 * gt) % 1) - 1 + (2 * ((f * 1.002 * gt) % 1) - 1) * 0.6;
        r += 2 * ((f * 1.005 * gt) % 1) - 1 + (2 * ((f * 0.998 * gt) % 1) - 1) * 0.6;
      }
      const env = Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (len - t) / 0.15)) * 0.05 * g;
      mL[i] += lpL.run(l) * env;
      mR[i] += lpR.run(r) * env;
    }
  };

  // ---------- Arrangement ----------
  for (let b = 0; b < TEST_BARS; b++) {
    const s = section(b);
    const t0 = b * BAR;
    for (let q = 0; q < 4; q++) {
      const at = t0 + q * BEAT;
      if (s.kick) kick(at, b < 2 ? 0.85 : 1);
      if (s.clap && (q === 1 || q === 3)) clap(at, 1);
      if (s.hats >= 1) hat(at + BEAT / 2, 1, s.open && q % 2 === 1, 0.15);
      if (s.hats >= 2) {
        hat(at + STEP, 0.38, false, -0.35);
        hat(at + STEP * 3, 0.5, false, 0.35);
      }
      if (s.ride) ride(at, q === 0 ? 1 : 0.7);
      if (s.bass) {
        const root = BASS_ROOTS[b % 4];
        for (let k = 1; k < 4; k++) bassNote(at + k * STEP, root + (k === 3 && q === 3 ? 12 : 0), STEP * 0.9, 0.62);
      }
    }
    if (s.acid > 0) acidBar(b, s.acid);
    if (s.stabs) {
      stab(t0 + BEAT * 1.5, 1);
      stab(t0 + BEAT * 3.5, 0.9);
      if (b % 2 === 1) stab(t0 + BEAT * 2.75, 0.7);
    }
    if (s.pad) padBar(b, b >= 26 ? 1.2 : 1);
  }

  // Snare rolls: build (bars 12-15) and end of breakdown (26-27), accelerating into the gaps.
  const roll = (fromBar: number, divs: number[], gapAt: number) => {
    const total = divs.reduce((a, d) => a + d, 0);
    let n = 0;
    divs.forEach((div, b) => {
      const step = BAR / div;
      for (let k = 0; k < div; k++, n++) {
        const at = (fromBar + b) * BAR + k * step;
        if (at >= gapAt - 0.01) return;
        snare(at, 0.25 + (n / total) * 0.75);
      }
    });
  };
  roll(12, [4, 8, 16, 32], GAPS[0][0]);
  roll(26, [8, 16], GAPS[1][0]);
  riser(12 * BAR, 4 * BAR - BEAT);
  riser(26 * BAR, 2 * BAR - BEAT * 2);
  for (const bar of [16, 28]) {
    crash(bar * BAR);
    boom(bar * BAR);
  }

  // Ping-pong echo on the stabs (dotted eighth).
  const d = Math.floor(STEP * 3 * SR);
  for (let i = d; i < LEN; i++) {
    stabL[i] += stabR[i - d] * 0.42;
    stabR[i] += stabL[i - d] * 0.42;
  }

  // ---------- Mix ----------
  const left = new Float32Array(LEN);
  const right = new Float32Array(LEN);
  let peak = 0;
  for (let i = 0; i < LEN; i++) {
    const du = duck[i];
    const mono = drums[i] + music[i] * du;
    const l = Math.tanh((mono + dL[i] + (mL[i] + stabL[i]) * du + fxL[i]) * 1.25);
    const r = Math.tanh((mono + dR[i] + (mR[i] + stabR[i]) * du + fxR[i]) * 1.25);
    left[i] = l;
    right[i] = r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  // Hard silence in the gaps before each drop (with 4 ms fades), then normalise.
  const fade = Math.floor(0.004 * SR);
  for (const [a, b] of GAPS) {
    const s0 = Math.floor(a * SR);
    const s1 = Math.min(LEN, Math.floor(b * SR));
    for (let i = s0 - fade; i < s1; i++) {
      const g = i < s0 ? (s0 - i) / fade : 0;
      left[i] *= g;
      right[i] *= g;
    }
  }
  const norm = 0.95 / Math.max(peak, 1e-6);
  for (let i = 0; i < LEN; i++) {
    left[i] *= norm;
    right[i] *= norm;
  }
  cache = { sampleRate: SR, left, right };
  return cache;
}

/** The record as a stereo AudioBuffer (Web Audio resamples it to the context's rate). */
export function buildTestBeat(ctx: BaseAudioContext, rec: TestRecord = getTestRecord()): AudioBuffer {
  const buffer = ctx.createBuffer(2, rec.left.length, rec.sampleRate);
  buffer.copyToChannel(rec.left as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(rec.right as Float32Array<ArrayBuffer>, 1);
  return buffer;
}
