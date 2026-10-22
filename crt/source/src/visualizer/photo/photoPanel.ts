import { TAU, chance, pick, randInt } from "../math";
import { PANEL_THEMES, type LedColor } from "../palette";
import type { LedDef, ModuleSpec } from "../modules/spec";
import type { PhotoGrid, PhotoRef, PhotoScreen } from "./types";

const LED_MAP: Record<string, LedColor> = {
  red: "red",
  green: "green",
  amber: "yellow",
  orange: "orange",
  yellow: "yellow",
};

/** Builds a module spec (in local panel pixels) from a photographed module. */
export function buildPhotoSpec(ref: PhotoRef, w: number, h: number): ModuleSpec {
  const d = ref.data;
  const leds: LedDef[] = d.leds.map(l => ({
    x: l.x * w,
    y: l.y * h,
    r: Math.max(1.2, l.r * h),
    color: LED_MAP[l.color] ?? "red",
    mode: pick(["beat", "beat", "hat", "onset", "band", "blink"] as LedDef["mode"][]),
    band: randInt(0, 7),
    value: 0,
  }));
  // Vertical runs of five or more LEDs are level meters: light them bottom-up.
  const used = new Set<number>();
  let meter = 0;
  for (let i = 0; i < leds.length; i++) {
    if (used.has(i)) continue;
    const col = [i];
    for (let j = i + 1; j < leds.length; j++) {
      if (!used.has(j) && Math.abs(leds[j].x - leds[i].x) < Math.max(3, leds[i].r * 1.6)) col.push(j);
    }
    if (col.length < 5) continue;
    col.sort((a, b) => leds[b].y - leds[a].y);
    const band = [0, 1, 2, 3, 1, 0][meter++ % 6];
    col.forEach((k, rank) => {
      used.add(k);
      leds[k].mode = "ladder";
      leds[k].rank = (rank + 0.5) / col.length;
      leds[k].band = band;
    });
  }
  const steps: ModuleSpec["steps"] = [];
  for (const g of d.grids) {
    if (g.kind !== "steps") continue;
    const gx = g.x * w;
    const gw = g.w * w;
    const gy = g.y * h;
    const ch = (g.h * h) / g.rows;
    for (let r = 0; r < g.rows; r++) steps.push({ x: gx + gw / 2, y: gy + (r + 0.5) * ch, r: Math.min(gw, ch) * 0.46 });
  }
  return {
    type: "photo",
    hp: 8,
    label: "",
    sub: "",
    theme: PANEL_THEMES[0].item,
    screen: null,
    screenTint: "green",
    round: false,
    jacks: d.jacks.map(j => ({ x: j.x * w, y: j.y * h, r: Math.max(2, j.r * h), label: "", output: chance(0.5) })),
    knobs: [],
    leds,
    faders: [],
    ladders: [],
    steps,
    matrix: null,
    digits: null,
    decor: null,
    // Corner screws, where the photographed panels have them.
    screws: (() => {
      const sx = Math.min(w * 0.2, h * 0.045);
      return [
        { x: sx, y: h * 0.018 },
        { x: w - sx, y: h * 0.018 },
        { x: sx, y: h * 0.982 },
        { x: w - sx, y: h * 0.982 },
      ];
    })(),
  };
}

export interface PhotoBake {
  panel: HTMLCanvasElement;
  /** Transparent layer holding only the lit LEDs / pads / buttons from the photo. */
  lit: HTMLCanvasElement | null;
}

const cache = new Map<string, PhotoBake>();

/** Baked panels are shared by every copy of the same module at the same size. */
export function clearPhotoCache(): void {
  cache.clear();
}

const GLASS: Record<PhotoScreen["kind"], [string, string]> = {
  lcd: ["#06121f", "#020710"],
  crt: ["#0a1d12", "#020805"],
  video: ["#08080a", "#020203"],
  oled: ["#050506", "#010101"],
  scope: ["#0b1d10", "#030904"],
};

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Cells of a grid in local pixels: centre and half-size. */
export function gridCells(g: PhotoGrid, w: number, h: number): { x: number; y: number; hw: number; hh: number }[] {
  const out: { x: number; y: number; hw: number; hh: number }[] = [];
  const pw = (g.w * w) / g.cols;
  const ph = (g.h * h) / g.rows;
  const k = g.kind === "pads" ? 0.3 : g.kind === "steps" ? 0.4 : 0.34;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      out.push({ x: g.x * w + (c + 0.5) * pw, y: g.y * h + (r + 0.5) * ph, hw: pw * k, hh: Math.min(ph * k, g.kind === "steps" ? pw * k : ph) });
    }
  }
  return out;
}

export function bakePhoto(ref: PhotoRef, spec: ModuleSpec, w: number, h: number, scale: number): PhotoBake {
  const cw = Math.max(1, Math.round(w * scale));
  const chh = Math.max(1, Math.round(h * scale));
  const key = `${ref.id}|${cw}|${chh}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const d = ref.data;
  const sy = ref.stripH / h;
  const sxk = d.sw / w;
  const src = (x: number, y: number, ww: number, hh: number): [number, number, number, number] => [
    d.sx + x * sxk,
    y * sy,
    ww * sxk,
    hh * sy,
  ];

  const panel = makeCanvas(cw, chh);
  const g = panel.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(ref.img, d.sx, 0, d.sw, ref.stripH, 0, 0, cw, chh);
  g.scale(cw / w, chh / h);

  const litGrids = d.grids.filter(gr => gr.kind !== "grid");
  let lit: HTMLCanvasElement | null = null;
  if (spec.leds.length || litGrids.length) {
    lit = makeCanvas(cw, chh);
    const lg = lit.getContext("2d")!;
    lg.scale(cw / w, chh / h);
    for (const l of spec.leds) {
      const R = l.r * 2;
      lg.save();
      lg.beginPath();
      lg.arc(l.x, l.y, R, 0, TAU);
      lg.clip();
      lg.drawImage(ref.img, ...src(l.x - R, l.y - R, R * 2, R * 2), l.x - R, l.y - R, R * 2, R * 2);
      lg.restore();
    }
    for (const gr of litGrids) {
      for (const c of gridCells(gr, w, h)) {
        const ex = c.hw * 1.35;
        const ey = c.hh * 1.35;
        lg.save();
        if (gr.kind === "steps") {
          lg.beginPath();
          lg.arc(c.x, c.y, Math.max(ex, ey), 0, TAU);
        } else roundRect(lg, c.x - ex, c.y - ey, ex * 2, ey * 2, Math.min(ex, ey) * 0.3);
        lg.clip();
        lg.drawImage(ref.img, ...src(c.x - ex, c.y - ey, ex * 2, ey * 2), c.x - ex, c.y - ey, ex * 2, ey * 2);
        lg.restore();
      }
    }
  }

  // Switch the photographed lights off: dark lenses, the glow pulled back.
  for (const l of spec.leds) {
    const R = l.r * 2.1;
    const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, R);
    grad.addColorStop(0, "rgba(10,10,12,0.95)");
    grad.addColorStop(0.5, "rgba(10,10,12,0.9)");
    grad.addColorStop(1, "rgba(10,10,12,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(l.x, l.y, R, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.arc(l.x - l.r * 0.3, l.y - l.r * 0.35, Math.max(0.6, l.r * 0.28), 0, TAU);
    g.fill();
  }
  for (const gr of d.grids) {
    for (const c of gridCells(gr, w, h)) {
      if (gr.kind === "steps") {
        const R = Math.max(c.hw, c.hh);
        g.fillStyle = "rgba(14,6,6,0.82)";
        g.beginPath();
        g.arc(c.x, c.y, R * 1.25, 0, TAU);
        g.fill();
        const grad = g.createRadialGradient(c.x - R * 0.3, c.y - R * 0.3, 0, c.x, c.y, R);
        grad.addColorStop(0, "#5a2420");
        grad.addColorStop(1, "#2a0e0c");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(c.x, c.y, R, 0, TAU);
        g.fill();
      } else {
        const ex = c.hw * (gr.kind === "pads" ? 1.3 : 1.15);
        const ey = c.hh * (gr.kind === "pads" ? 1.3 : 1.15);
        g.fillStyle = "rgba(8,9,9,0.9)";
        roundRect(g, c.x - ex, c.y - ey, ex * 2, ey * 2, Math.min(ex, ey) * 0.3);
        g.fill();
        const grad = g.createLinearGradient(c.x, c.y - c.hh, c.x, c.y + c.hh);
        if (gr.kind === "pads") {
          grad.addColorStop(0, "#2c3a35");
          grad.addColorStop(1, "#18211e");
        } else {
          grad.addColorStop(0, "#4a4b4f");
          grad.addColorStop(1, "#2b2c2f");
        }
        g.fillStyle = grad;
        roundRect(g, c.x - c.hw, c.y - c.hh, c.hw * 2, c.hh * 2, Math.min(c.hw, c.hh) * 0.25);
        g.fill();
      }
    }
  }
  // Screens: power them down to dark glass (the live picture is drawn every frame).
  for (const s of d.screens) {
    const x = s.x * w;
    const y = s.y * h;
    const sw = s.w * w;
    const sh = s.h * h;
    const [c0, c1] = GLASS[s.kind];
    const grad = g.createRadialGradient(x + sw / 2, y + sh / 2, 0, x + sw / 2, y + sh / 2, Math.max(sw, sh) * 0.7);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.beginPath();
    if (s.round) g.arc(x + sw / 2, y + sh / 2, Math.min(sw, sh) / 2, 0, TAU);
    else g.rect(x, y, sw, sh);
    g.fill();
    if (s.kind === "crt" || s.kind === "scope") {
      g.save();
      g.clip();
      g.strokeStyle = "rgba(90,255,150,0.13)";
      g.lineWidth = 0.6;
      for (let i = 1; i < 10; i++) {
        g.beginPath();
        g.moveTo(x + (sw * i) / 10, y);
        g.lineTo(x + (sw * i) / 10, y + sh);
        g.stroke();
      }
      for (let i = 1; i < 8; i++) {
        g.beginPath();
        g.moveTo(x, y + (sh * i) / 8);
        g.lineTo(x + sw, y + (sh * i) / 8);
        g.stroke();
      }
      g.restore();
    }
  }
  const out = { panel, lit };
  cache.set(key, out);
  return out;
}
