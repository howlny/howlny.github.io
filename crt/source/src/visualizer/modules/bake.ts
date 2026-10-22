import { FONT_MONO, LED_COLORS, hexToRgba } from "../palette";
import { TAU, rand } from "../math";
import type { ModuleSpec, Rect } from "./spec";

const SCREEN_GLASS: Record<ModuleSpec["screenTint"], string> = {
  green: "#04120A",
  amber: "#140802",
  blue: "#030A16",
  red: "#160304",
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700): void {
  let s = size;
  g.font = `${weight} ${s}px ${FONT_MONO}`;
  while (s > 5 && g.measureText(text).width > maxW) {
    s -= 0.5;
    g.font = `${weight} ${s}px ${FONT_MONO}`;
  }
}

function drawScrew(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, "#f1f1f1");
  grad.addColorStop(0.6, "#9a9ca0");
  grad.addColorStop(1, "#4a4c50");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = Math.max(0.6, r * 0.25);
  const a = rand(0, Math.PI);
  for (const off of [0, Math.PI / 2]) {
    g.beginPath();
    g.moveTo(x + Math.cos(a + off) * r * 0.65, y + Math.sin(a + off) * r * 0.65);
    g.lineTo(x - Math.cos(a + off) * r * 0.65, y - Math.sin(a + off) * r * 0.65);
    g.stroke();
  }
}

function drawJack(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  // Hex nut
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  const grad = g.createLinearGradient(x - r, y - r, x + r, y + r);
  grad.addColorStop(0, "#e6e7ea");
  grad.addColorStop(0.5, "#9b9ea4");
  grad.addColorStop(1, "#4b4e54");
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.lineWidth = 0.7;
  g.stroke();
  // Barrel
  g.fillStyle = "#2b2d31";
  g.beginPath();
  g.arc(x, y, r * 0.62, 0, TAU);
  g.fill();
  g.fillStyle = "#020203";
  g.beginPath();
  g.arc(x, y, r * 0.38, 0, TAU);
  g.fill();
}

function drawKnobBody(g: CanvasRenderingContext2D, x: number, y: number, r: number, big: boolean, cap: string, ink: string): void {
  // Scale ticks
  g.strokeStyle = ink;
  g.lineWidth = Math.max(0.6, r * 0.06);
  const ticks = big ? 21 : 11;
  for (let i = 0; i < ticks; i++) {
    const a = -Math.PI * 1.25 + (i / (ticks - 1)) * Math.PI * 1.5;
    const r0 = r * 1.18;
    const r1 = r * (i % 5 === 0 ? 1.42 : 1.3);
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    g.stroke();
  }
  // Shadow
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.beginPath();
  g.arc(x + r * 0.08, y + r * 0.14, r * 1.02, 0, TAU);
  g.fill();
  // Skirt
  const skirt = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  skirt.addColorStop(0, big ? "#4a4c52" : "#3b3d42");
  skirt.addColorStop(1, "#0c0d0f");
  g.fillStyle = skirt;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  if (big) {
    // Knurled edge
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 0.8;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
      g.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98);
      g.stroke();
    }
  }
  // Cap
  const capGrad = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r * 0.75);
  capGrad.addColorStop(0, hexToRgba("#ffffff", 0.35));
  capGrad.addColorStop(0.25, cap);
  capGrad.addColorStop(1, cap);
  g.fillStyle = capGrad;
  g.beginPath();
  g.arc(x, y, r * (big ? 0.66 : 0.72), 0, TAU);
  g.fill();
}

function drawScreenBezel(g: CanvasRenderingContext2D, s: Rect, round: boolean, tint: ModuleSpec["screenTint"]): void {
  const glass = SCREEN_GLASS[tint];
  g.fillStyle = "#050506";
  if (round) {
    g.beginPath();
    g.arc(s.x + s.w / 2, s.y + s.h / 2, s.w / 2 + 2.5, 0, TAU);
    g.fill();
    g.fillStyle = glass;
    g.beginPath();
    g.arc(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.06)";
    g.lineWidth = 0.6;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.arc(s.x + s.w / 2, s.y + s.h / 2, (s.w / 2) * (i / 4), 0, TAU);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(s.x, s.y + s.h / 2);
    g.lineTo(s.x + s.w, s.y + s.h / 2);
    g.moveTo(s.x + s.w / 2, s.y);
    g.lineTo(s.x + s.w / 2, s.y + s.h);
    g.stroke();
    return;
  }
  roundRect(g, s.x - 2.5, s.y - 2.5, s.w + 5, s.h + 5, 3);
  g.fill();
  g.fillStyle = glass;
  g.fillRect(s.x, s.y, s.w, s.h);
  g.strokeStyle = "rgba(255,255,255,0.055)";
  g.lineWidth = 0.6;
  const gx = 8;
  const gy = 6;
  for (let i = 1; i < gx; i++) {
    const x = s.x + (s.w / gx) * i;
    g.beginPath();
    g.moveTo(x, s.y);
    g.lineTo(x, s.y + s.h);
    g.stroke();
  }
  for (let i = 1; i < gy; i++) {
    const y = s.y + (s.h / gy) * i;
    g.beginPath();
    g.moveTo(s.x, y);
    g.lineTo(s.x + s.w, y);
    g.stroke();
  }
}

function drawStripes(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "#0B0C0E";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#FFD400";
  const sw = Math.max(6, w * 0.45);
  for (let i = -h; i < w + h; i += sw * 2) {
    g.beginPath();
    g.moveTo(x + i, y);
    g.lineTo(x + i + sw, y);
    g.lineTo(x + i + sw - h, y + h);
    g.lineTo(x + i - h, y + h);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** Renders the static faceplate of a module to an offscreen canvas at `scale` device pixels per CSS px. */
export function bakePanel(spec: ModuleSpec, w: number, h: number, scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * scale));
  c.height = Math.max(1, Math.ceil(h * scale));
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  const t = spec.theme;
  const hpPx = w / spec.hp;

  // Base plate
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, t.base);
  base.addColorStop(1, t.base2);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  if (t.brushed) {
    for (let i = 0; i < h; i += 1.3) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${rand(0.01, 0.06)})` : `rgba(0,0,0,${rand(0.01, 0.07)})`;
      g.fillRect(0, i, w, rand(0.4, 1));
    }
  } else {
    for (let i = 0; i < (w * h) / 60; i++) {
      g.fillStyle = `rgba(0,0,0,${rand(0.03, 0.1)})`;
      g.fillRect(rand(0, w), rand(0, h), 1, 1);
    }
  }

  // Bevel
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.fillRect(0, 0, 1, h);
  g.fillRect(0, 0, w, 1);
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(w - 1.2, 0, 1.2, h);
  g.fillRect(0, h - 1.2, w, 1.2);

  // Decor
  if (spec.decor === "stripes") {
    drawStripes(g, hpPx * 0.4, h * 0.2, w - hpPx * 0.8, h * 0.6);
    g.fillStyle = t.ink;
    g.font = `900 ${Math.max(8, w * 0.5)}px ${FONT_MONO}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
  } else if (spec.decor === "vents") {
    g.fillStyle = "rgba(0,0,0,0.75)";
    const vw = Math.max(2, w - hpPx * 1.4);
    for (let y = h * 0.2; y < h * 0.78; y += Math.max(5, h * 0.03)) {
      roundRect(g, (w - vw) / 2, y, vw, Math.max(2, h * 0.014), 2);
      g.fill();
    }
  }

  // Label
  g.fillStyle = t.ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (spec.label) {
    fitText(g, spec.label, w - hpPx * 0.9, Math.max(7, Math.min(15, hpPx * 1.25)), 800);
    g.fillText(spec.label, w / 2, h * 0.072);
  }
  if (spec.hp >= 6) {
    g.fillStyle = t.inkDim;
    fitText(g, spec.sub, w - hpPx, Math.max(5, Math.min(8, hpPx * 0.6)), 500);
    g.fillText(spec.sub, w / 2, h * 0.1);
  }
  // Accent rule under the label
  g.fillStyle = t.accent;
  g.fillRect(hpPx * 0.6, h * 0.118, w - hpPx * 1.2, Math.max(1, h * 0.004));

  // Screens
  if (spec.screen) drawScreenBezel(g, spec.screen, spec.round, spec.screenTint);
  if (spec.digits) {
    const d = spec.digits;
    roundRect(g, d.x - 2, d.y - 2, d.w + 4, d.h + 4, 2);
    g.fillStyle = "#050506";
    g.fill();
    g.fillStyle = "#120304";
    g.fillRect(d.x, d.y, d.w, d.h);
  }
  if (spec.matrix) {
    const m = spec.matrix;
    g.fillStyle = "#050506";
    g.fillRect(m.x - 2, m.y - 2, m.w + 4, m.h + 4);
    const cw = m.w / m.cols;
    const ch = m.h / m.rows;
    g.fillStyle = "#1a0a14";
    for (let cx = 0; cx < m.cols; cx++) {
      for (let cy = 0; cy < m.rows; cy++) {
        g.fillRect(m.x + cx * cw + cw * 0.15, m.y + cy * ch + ch * 0.15, cw * 0.7, ch * 0.7);
      }
    }
  }

  // Fader slots
  for (const f of spec.faders) {
    g.strokeStyle = t.inkDim;
    g.lineWidth = 0.6;
    for (let i = 0; i <= 10; i++) {
      const y = f.y + (f.h / 10) * i;
      g.beginPath();
      g.moveTo(f.x - f.w * 0.9, y);
      g.lineTo(f.x - f.w * 0.3, y);
      g.stroke();
    }
    roundRect(g, f.x + f.w * 0.3, f.y, f.w * 0.4, f.h, f.w * 0.2);
    g.fillStyle = "#050506";
    g.fill();
  }

  // LED ladders
  for (const l of spec.ladders) {
    g.fillStyle = "#050506";
    g.fillRect(l.x - 1.5, l.y - 1.5, l.w + 3, l.h + 3);
    const cell = l.h / l.n;
    for (let i = 0; i < l.n; i++) {
      g.fillStyle = "#1c1d20";
      g.fillRect(l.x, l.y + i * cell + cell * 0.15, l.w, cell * 0.7);
    }
  }

  // LED sockets
  for (const led of [...spec.leds, ...spec.steps.map(s => ({ ...s, color: "red" as const }))]) {
    g.fillStyle = "#050506";
    g.beginPath();
    g.arc(led.x, led.y, led.r * 1.45, 0, TAU);
    g.fill();
    g.fillStyle = hexToRgba(LED_COLORS[led.color], 0.18);
    g.beginPath();
    g.arc(led.x, led.y, led.r, 0, TAU);
    g.fill();
  }

  // Knob bodies and labels
  for (const k of spec.knobs) {
    drawKnobBody(g, k.x, k.y, k.r, k.big, k.cap, t.inkDim);
    if (k.r > 6) {
      g.fillStyle = t.ink;
      fitText(g, k.label, k.r * 3, Math.max(5, Math.min(8, k.r * 0.55)), 600);
      g.fillText(k.label, k.x, k.y - k.r * 1.65);
    }
  }

  // Jacks, with inverted output plates and printed traces
  for (const j of spec.jacks) {
    if (j.output) {
      roundRect(g, j.x - j.r * 1.45, j.y - j.r * 2.6, j.r * 2.9, j.r * 3.9, 2);
      g.fillStyle = t.ink;
      g.fill();
    }
    g.fillStyle = j.output ? t.base : t.ink;
    if (j.r > 4) {
      fitText(g, j.label, j.r * 2.8, Math.max(5, Math.min(7.5, j.r * 0.75)), 700);
      g.fillStyle = j.output ? t.base : t.ink;
      g.fillText(j.label, j.x, j.y - j.r * 1.75);
    }
    drawJack(g, j.x, j.y, j.r);
  }

  // Screws last so they sit on top
  for (const s of spec.screws) drawScrew(g, s.x, s.y, Math.max(2, Math.min(hpPx * 0.42, 6)));

  return c;
}

export { roundRect };
