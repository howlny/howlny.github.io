import { CABLE_COLORS, LED_COLORS, PANEL_THEMES, type LedColor, type PanelTheme } from "../palette";
import { chance, pick, rand, randInt, weightedPick } from "../math";

export type ModuleType =
  | "scope"
  | "spectrum"
  | "vco"
  | "seq"
  | "vu"
  | "mixer"
  | "noise"
  | "env"
  | "lfo"
  | "nixie"
  | "blank"
  | "matrix"
  | "radar"
  /** A photographed HOWL rack module. */
  | "photo";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface JackDef {
  x: number;
  y: number;
  r: number;
  label: string;
  output: boolean;
}

export interface KnobDef {
  x: number;
  y: number;
  r: number;
  big: boolean;
  band: number;
  offset: number;
  range: number;
  value: number;
  spin: number;
  cap: string;
  label: string;
}

export interface LedDef {
  x: number;
  y: number;
  r: number;
  color: LedColor;
  mode: "beat" | "hat" | "onset" | "band" | "blink" | "ladder";
  band: number;
  value: number;
  /** Ladder position 0..1 (bottom first) for level-meter LEDs. */
  rank?: number;
}

export interface FaderDef extends Rect {
  band: number;
  value: number;
}

export interface LadderDef extends Rect {
  n: number;
  band: number;
}

export interface GridDef extends Rect {
  cols: number;
  rows: number;
}

export interface ModuleSpec {
  type: ModuleType;
  hp: number;
  label: string;
  sub: string;
  theme: PanelTheme;
  screen: Rect | null;
  screenTint: "green" | "amber" | "blue" | "red";
  round: boolean;
  jacks: JackDef[];
  knobs: KnobDef[];
  leds: LedDef[];
  faders: FaderDef[];
  ladders: LadderDef[];
  steps: { x: number; y: number; r: number }[];
  matrix: GridDef | null;
  digits: (Rect & { count: number }) | null;
  decor: "stripes" | "vents" | null;
  screws: { x: number; y: number }[];
}

export const TYPE_HP: Record<ModuleType, number[]> = {
  scope: [10, 12, 14, 16],
  spectrum: [8, 10, 12],
  vco: [8, 10, 12],
  seq: [12, 16, 20],
  vu: [4, 6],
  mixer: [8, 10, 12],
  noise: [4, 6],
  env: [8, 10],
  lfo: [6, 8],
  nixie: [6, 8, 10],
  blank: [2, 3, 4],
  matrix: [8, 10],
  radar: [10, 12],
  photo: [8],
};

const TYPE_WEIGHTS: { item: ModuleType; weight: number }[] = [
  { item: "scope", weight: 2.2 },
  { item: "spectrum", weight: 1.6 },
  { item: "vco", weight: 2.4 },
  { item: "seq", weight: 1.3 },
  { item: "vu", weight: 1.6 },
  { item: "mixer", weight: 1.3 },
  { item: "noise", weight: 1.0 },
  { item: "env", weight: 1.2 },
  { item: "lfo", weight: 1.1 },
  { item: "nixie", weight: 1.0 },
  { item: "blank", weight: 1.1 },
  { item: "matrix", weight: 1.1 },
  { item: "radar", weight: 0.9 },
];

const NAMES: Record<ModuleType, string[]> = {
  photo: ["HOWL"],
  scope: ["SCOPE", "X-RAY", "CRT-9", "TRACE", "VOLTSCOPE"],
  spectrum: ["SPECTRA", "FFT-64", "PRISM", "BANDS"],
  vco: ["VCO", "OSC-3", "KLANG", "BRUTE", "HOWL", "GRINDER"],
  seq: ["SEQ-8", "STEPPER", "MARCH", "KLOCKWERK"],
  vu: ["VU", "LVL", "HOT"],
  mixer: ["MIX-4", "SUMMIT", "VCA-4"],
  noise: ["NOISE", "HISS", "STATIC"],
  env: ["ADSR", "ENV", "CONTOUR"],
  lfo: ["LFO", "WOBBLE", "ORBIT"],
  nixie: ["TEMPO", "BPM", "COUNT"],
  blank: ["!", "HV", "DANGER", ""],
  matrix: ["GRID", "PIXL", "MATRIX"],
  radar: ["RADAR", "SWEEP", "PING"],
};

const SUBS = ["HOWL-01", "MK II", "HV 400V", "RUIN SERIES", "TYPE 9", "NO WARRANTY", "Ø-12", "SHRED", "K-77", "FAULT LINE", "SIGNAL 004", "NYC"];
const JACK_LABELS_IN = ["IN", "CV", "FM", "SYNC", "V/OCT", "CLK", "RST", "GATE", "MOD", "X", "Y"];
const JACK_LABELS_OUT = ["OUT", "Σ", "TRIG", "EOC", "±5V", "KILL", "RUIN", "A", "B"];
const KNOB_LABELS = ["FREQ", "RES", "DRIVE", "FOLD", "RATE", "DEPTH", "TIME", "GAIN", "TONE", "SHAPE", "WARP", "MIX", "CRUSH", "PAIN", "FINE"];
const CAPS = ["#111214", "#111214", "#E9E7E1", "#FF5A1F", "#FF2E3A", "#FFD400", "#2F6BFF", "#2a2c30"];

export function randomType(maxHp = 99): ModuleType {
  const fitting = TYPE_WEIGHTS.filter(t => TYPE_HP[t.item][0] <= maxHp);
  return weightedPick(fitting.length ? fitting : TYPE_WEIGHTS);
}

export function randomHp(type: ModuleType): number {
  return pick(TYPE_HP[type]);
}

function knob(x: number, y: number, r: number, big = false): KnobDef {
  return {
    x,
    y,
    r,
    big,
    band: randInt(0, 7),
    offset: rand(0, 0.5),
    range: rand(0.4, 0.9),
    value: rand(0, 1),
    spin: 0,
    cap: big ? "#18191c" : pick(CAPS),
    label: pick(KNOB_LABELS),
  };
}

function led(x: number, y: number, r: number, mode?: LedDef["mode"]): LedDef {
  const colors = Object.keys(LED_COLORS) as LedColor[];
  return {
    x,
    y,
    r,
    color: pick(colors),
    mode: mode ?? pick(["beat", "hat", "onset", "band", "blink"] as const),
    band: randInt(0, 7),
    value: 0,
  };
}

/** Lays out a row (or two) of jacks across the bottom of the panel. */
function jackRows(spec: ModuleSpec, w: number, h: number, hpPx: number, rows: number, top = 0.8): void {
  const r = Math.max(3, hpPx * 0.72);
  const perRow = Math.max(1, Math.floor((w - hpPx) / (r * 3.3)));
  const rowGap = h * 0.085;
  for (let row = 0; row < rows; row++) {
    const y = h * top + row * rowGap;
    const count = perRow;
    const step = w / count;
    for (let i = 0; i < count; i++) {
      const output = row === rows - 1 && i === count - 1 ? true : chance(0.25);
      spec.jacks.push({
        x: step * (i + 0.5),
        y,
        r,
        output,
        label: output ? pick(JACK_LABELS_OUT) : pick(JACK_LABELS_IN),
      });
    }
  }
}

export function buildSpec(type: ModuleType, hp: number, w: number, h: number): ModuleSpec {
  const hpPx = w / hp;
  const theme = weightedPick(PANEL_THEMES);
  const spec: ModuleSpec = {
    type,
    hp,
    label: pick(NAMES[type]),
    sub: pick(SUBS),
    theme,
    screen: null,
    screenTint: pick(["green", "green", "amber", "blue", "red"] as const),
    round: false,
    jacks: [],
    knobs: [],
    leds: [],
    faders: [],
    ladders: [],
    steps: [],
    matrix: null,
    digits: null,
    decor: null,
    screws: [],
  };

  // Mounting screws on the rails.
  const sy0 = h * 0.028;
  const sy1 = h * 0.972;
  const sx0 = Math.min(hpPx * 1.4, w * 0.3);
  spec.screws.push({ x: sx0, y: sy0 }, { x: sx0, y: sy1 });
  if (hp >= 6) spec.screws.push({ x: w - sx0, y: sy0 }, { x: w - sx0, y: sy1 });

  const pad = hpPx * 0.8;
  const inner = w - pad * 2;
  const smallR = Math.max(4, Math.min(hpPx * 1.15, w * 0.16));

  switch (type) {
    case "scope": {
      const sh = Math.min(h * 0.42, inner * 1.1);
      spec.screen = { x: pad, y: h * 0.14, w: inner, h: sh };
      const ky = h * 0.14 + sh + h * 0.09;
      const n = Math.max(1, Math.min(4, Math.floor(inner / (smallR * 3))));
      for (let i = 0; i < n; i++) spec.knobs.push(knob(pad + (inner / n) * (i + 0.5), ky, smallR));
      spec.leds.push(led(w - pad - 2, h * 0.115, Math.max(1.6, hpPx * 0.28), "onset"));
      jackRows(spec, w, h, hpPx, 2);
      break;
    }
    case "spectrum": {
      spec.screen = { x: pad, y: h * 0.14, w: inner, h: h * 0.46 };
      spec.screenTint = pick(["amber", "red", "blue"] as const);
      spec.knobs.push(knob(w * 0.5, h * 0.69, smallR));
      jackRows(spec, w, h, hpPx, 1, 0.84);
      break;
    }
    case "vco": {
      const bigR = Math.min(inner * 0.42, h * 0.12);
      spec.knobs.push(knob(w * 0.5, h * 0.27, bigR, true));
      const cols = Math.max(1, Math.min(3, Math.floor(inner / (smallR * 2.9))));
      for (let row = 0; row < 2; row++) {
        for (let c = 0; c < cols; c++) {
          spec.knobs.push(knob(pad + (inner / cols) * (c + 0.5), h * (0.47 + row * 0.12), smallR * (row ? 0.85 : 1)));
        }
      }
      spec.leds.push(led(pad + 3, h * 0.13, Math.max(1.6, hpPx * 0.3), "beat"));
      spec.leds.push(led(w - pad - 3, h * 0.13, Math.max(1.6, hpPx * 0.3), "band"));
      jackRows(spec, w, h, hpPx, 2);
      break;
    }
    case "seq": {
      const steps = inner > smallR * 20 ? 8 : 4;
      const rows = steps === 8 ? 1 : 2;
      const perRow = steps / rows;
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < perRow; i++) {
          const x = pad + (inner / perRow) * (i + 0.5);
          const y = h * (0.22 + row * 0.24);
          spec.knobs.push(knob(x, y, Math.min(smallR, inner / perRow / 2.6)));
          spec.steps.push({ x, y: y + h * 0.085, r: Math.max(1.8, hpPx * 0.32) });
        }
      }
      spec.leds.push(led(w - pad, h * 0.12, Math.max(1.6, hpPx * 0.3), "beat"));
      jackRows(spec, w, h, hpPx, 2);
      break;
    }
    case "vu": {
      const n = hp >= 6 ? 3 : 2;
      const lw = Math.min(hpPx * 1.1, inner / n - 2);
      const span = inner / n;
      for (let i = 0; i < n; i++) {
        spec.ladders.push({ x: pad + span * (i + 0.5) - lw / 2, y: h * 0.15, w: lw, h: h * 0.58, n: 14, band: i === 0 ? 1 : i === 1 ? 4 : 6 });
      }
      jackRows(spec, w, h, hpPx, 1, 0.84);
      break;
    }
    case "mixer": {
      const n = Math.max(2, Math.min(4, Math.floor(inner / (hpPx * 2.2))));
      const span = inner / n;
      for (let i = 0; i < n; i++) {
        const fx = pad + span * (i + 0.5);
        spec.faders.push({ x: fx - hpPx * 0.35, y: h * 0.2, w: hpPx * 0.7, h: h * 0.46, band: randInt(0, 7), value: 0 });
        spec.leds.push(led(fx, h * 0.15, Math.max(1.6, hpPx * 0.3), "band"));
      }
      jackRows(spec, w, h, hpPx, 2);
      break;
    }
    case "noise": {
      spec.screen = { x: pad, y: h * 0.15, w: inner, h: Math.min(inner * 1.4, h * 0.3) };
      spec.screenTint = "blue";
      spec.knobs.push(knob(w * 0.5, h * 0.58, smallR));
      spec.leds.push(led(w * 0.5, h * 0.7, Math.max(1.6, hpPx * 0.3), "hat"));
      jackRows(spec, w, h, hpPx, 2);
      break;
    }
    case "env": {
      spec.screen = { x: pad, y: h * 0.14, w: inner, h: h * 0.26 };
      spec.screenTint = pick(["green", "blue", "amber"] as const);
      const cols = 2;
      for (let row = 0; row < 2; row++) {
        for (let c = 0; c < cols; c++) {
          spec.knobs.push(knob(pad + (inner / cols) * (c + 0.5), h * (0.5 + row * 0.13), smallR * 0.9));
        }
      }
      spec.leds.push(led(w - pad, h * 0.115, Math.max(1.6, hpPx * 0.3), "onset"));
      jackRows(spec, w, h, hpPx, 1, 0.84);
      break;
    }
    case "lfo": {
      const d = Math.min(inner, h * 0.3);
      spec.screen = { x: w / 2 - d / 2, y: h * 0.15, w: d, h: d };
      spec.round = true;
      spec.screenTint = pick(["green", "red", "amber"] as const);
      spec.knobs.push(knob(w * 0.5, h * 0.15 + d + h * 0.1, smallR));
      spec.leds.push(led(pad + 2, h * 0.62, Math.max(1.6, hpPx * 0.3), "blink"));
      spec.leds.push(led(w - pad - 2, h * 0.62, Math.max(1.6, hpPx * 0.3), "blink"));
      jackRows(spec, w, h, hpPx, 2);
      break;
    }
    case "nixie": {
      const count = hp >= 8 ? 3 : 2;
      spec.digits = { x: pad, y: h * 0.15, w: inner, h: Math.min(h * 0.17, (inner / count) * 1.7), count };
      spec.knobs.push(knob(w * 0.5, h * 0.48, smallR));
      spec.leds.push(led(w * 0.5, h * 0.6, Math.max(1.6, hpPx * 0.3), "beat"));
      jackRows(spec, w, h, hpPx, 2);
      break;
    }
    case "blank": {
      spec.decor = chance(0.55) ? "stripes" : "vents";
      if (chance(0.6)) spec.leds.push(led(w * 0.5, h * 0.12, Math.max(1.6, hpPx * 0.35), "blink"));
      if (chance(0.5)) jackRows(spec, w, h, hpPx, 1, 0.88);
      break;
    }
    case "matrix": {
      const cols = 8;
      const cell = inner / cols;
      const rows = Math.max(6, Math.min(14, Math.floor((h * 0.5) / cell)));
      spec.matrix = { x: pad, y: h * 0.14, w: inner, h: cell * rows, cols, rows };
      spec.knobs.push(knob(w * 0.5, h * 0.14 + cell * rows + h * 0.08, smallR));
      jackRows(spec, w, h, hpPx, 1, 0.84);
      break;
    }
    case "radar": {
      const d = Math.min(inner, h * 0.42);
      spec.screen = { x: w / 2 - d / 2, y: h * 0.14, w: d, h: d };
      spec.round = true;
      spec.screenTint = "green";
      const ky = h * 0.14 + d + h * 0.08;
      spec.knobs.push(knob(w * 0.3, ky, smallR), knob(w * 0.7, ky, smallR));
      jackRows(spec, w, h, hpPx, 1, 0.84);
      break;
    }
  }
  return spec;
}

export function randomCableColor(): string {
  return pick(CABLE_COLORS);
}
