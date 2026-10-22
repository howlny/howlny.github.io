import { footage } from "../media/FootageBank";
import { TAU, clamp } from "../math";
import { FONT_MONO, LED_COLORS, glowSprite } from "../palette";
import type { AudioFeatures } from "../types";
import type { RackModule } from "../modules/RackModule";
import { gridCells } from "./photoPanel";
import type { PhotoScreen } from "./types";

function glow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, a: number): void {
  if (a < 0.02) return;
  ctx.globalAlpha = clamp(a);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Blit a region of the module's lit-light layer back over the switched-off panel. */
function relight(ctx: CanvasRenderingContext2D, m: RackModule, x: number, y: number, w: number, h: number, a: number): void {
  const lit = m.photoLit;
  if (!lit || a < 0.03) return;
  const k = lit.width / m.w;
  ctx.globalAlpha = clamp(a);
  ctx.drawImage(lit, x * k, y * k, w * k, h * k, x, y, w, h);
  ctx.globalAlpha = 1;
}

const SCREEN_INK: Record<PhotoScreen["kind"], string> = {
  lcd: "#63CFFF",
  crt: "#5DFF8E",
  video: "#FFFFFF",
  oled: "#F4F6F5",
  scope: "#7DFF9A",
};

function trace(ctx: CanvasRenderingContext2D, wf: Float32Array, x: number, y: number, w: number, h: number, amp: number, color: string): void {
  const n = 80;
  const stride = Math.max(1, Math.floor(wf.length / n));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const px = x + (i / (n - 1)) * w;
    const py = y + h / 2 - wf[i * stride] * h * amp;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = Math.max(2, h * 0.035);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(0.8, h * 0.01);
  ctx.stroke();
}

function drawScreen(ctx: CanvasRenderingContext2D, m: RackModule, s: PhotoScreen, f: AudioFeatures, chaos: number, time: number): void {
  const x = s.x * m.w;
  const y = s.y * m.h;
  const w = s.w * m.w;
  const h = s.h * m.h;
  const ink = SCREEN_INK[s.kind];
  ctx.save();
  ctx.beginPath();
  if (s.round) ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, TAU);
  else ctx.rect(x, y, w, h);
  ctx.clip();
  switch (s.kind) {
    case "video": {
      // The DIGITAL FX screen plays HOWL footage; hits cut to another shot.
      const cell = (m.id + (f.kick ? 1 : 0) + Math.floor(time * (0.5 + chaos * 3))) % Math.max(1, footage.cellCount);
      if (!footage.drawCell(ctx, x, y, w, h, cell)) {
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.4})`;
          ctx.fillRect(x + Math.random() * w, y + Math.random() * h, w * 0.2, 1);
        }
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(10,255,153,${0.05 + f.kickEnv * 0.25})`;
      ctx.fillRect(x, y, w, h);
      break;
    }
    case "crt": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const R = Math.min(w, h) * 0.42;
      const wf = f.waveform;
      ctx.globalCompositeOperation = "lighter";
      if (chaos > 0.45 && Math.floor(time * 0.7 + m.id) % 2 === 0) {
        ctx.beginPath();
        for (let i = 0; i < 90; i++) {
          const a = wf[(i * 9) % wf.length];
          const b = wf[(i * 9 + 41) % wf.length];
          if (i === 0) ctx.moveTo(cx + a * R * 1.6, cy + b * R * 1.6);
          else ctx.lineTo(cx + a * R * 1.6, cy + b * R * 1.6);
        }
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1, h * 0.012);
        ctx.stroke();
      } else trace(ctx, wf, x, y, w, h, 0.4 + f.level * 0.4, ink);
      glow(ctx, "#2BFF77", cx, cy, R * 1.4, 0.12 + f.level * 0.35);
      break;
    }
    case "lcd":
    case "scope": {
      trace(ctx, f.waveform, x + w * 0.04, y, w * 0.92, h * (s.kind === "lcd" ? 0.8 : 1), 0.38 + f.level * 0.3, ink);
      if (s.kind === "lcd") {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = ink;
        ctx.font = `500 ${Math.max(6, h * 0.075)}px ${FONT_MONO}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(`${f.bpm > 0 ? Math.round(f.bpm) : "---"} BPM`, x + w * 0.06, y + h * 0.93);
        ctx.fillText("HOWL", x + w * 0.62, y + h * 0.93);
      }
      break;
    }
    case "oled": {
      // Granular display: spectrum bars and live readouts.
      const bars = 48;
      const bw = w / bars;
      ctx.fillStyle = ink;
      for (let i = 0; i < bars; i++) {
        const v = f.spectrum[Math.floor((i / bars) * f.spectrum.length * 0.6)] ?? 0;
        const bh = (0.05 + v) * h * 0.22;
        ctx.fillRect(x + i * bw + bw * 0.2, y + h * 0.26 - bh, bw * 0.6, bh * 2);
      }
      const fs = Math.max(6, h * 0.085);
      ctx.font = `500 ${fs}px ${FONT_MONO}`;
      ctx.textBaseline = "alphabetic";
      const rows: [string, string][] = [
        ["SIGNAL", f.silent ? "LOST" : "LIVE"],
        ["Tempo", f.bpm > 0 ? `${Math.round(f.bpm)} bpm` : "---"],
        ["Level", f.level.toFixed(2)],
        ["Chaos", chaos.toFixed(2)],
        ["Feed", "CAM_01"],
      ];
      rows.forEach(([k, v], i) => {
        const yy = y + h * 0.56 + i * fs * 1.25;
        ctx.textAlign = "left";
        ctx.fillText(k, x + w * 0.06, yy);
        ctx.textAlign = "right";
        ctx.fillText(v, x + w * 0.94, yy);
      });
      ctx.textAlign = "left";
      break;
    }
  }
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

export function drawPhotoDynamics(ctx: CanvasRenderingContext2D, m: RackModule, f: AudioFeatures, chaos: number, time: number): void {
  const spec = m.spec;
  const data = m.photo!.data;

  // Per-instance grime so repeated modules don't read as copies.
  if (m.shade > 0.01) {
    ctx.fillStyle = `rgba(0,0,0,${m.shade})`;
    ctx.fillRect(0, 0, m.w, m.h);
  }

  for (const s of data.screens) drawScreen(ctx, m, s, f, chaos, time);

  // LEDs and meters come back on from the photo's own lit lenses.
  for (const l of spec.leds) {
    if (l.value < 0.04) continue;
    const R = l.r * 2;
    relight(ctx, m, l.x - R, l.y - R, R * 2, R * 2, l.value);
    ctx.globalCompositeOperation = "lighter";
    glow(ctx, LED_COLORS[l.color], l.x, l.y, l.r * 6, l.value * 0.75);
    ctx.globalCompositeOperation = "source-over";
  }

  for (const g of data.grids) {
    const cells = gridCells(g, m.w, m.h);
    if (g.kind === "steps") {
      const n = cells.length;
      for (let i = 0; i < n; i++) {
        const c = cells[i];
        const d = (m.seqStep - i + n) % n;
        let a = d === 0 ? 1 : d === 1 ? 0.35 : d === 2 ? 0.12 : 0;
        if (chaos > 0.6 && f.kickEnv > 0.7) a = Math.max(a, 0.7);
        if (a <= 0) continue;
        const R = Math.max(c.hw, c.hh) * 1.35;
        relight(ctx, m, c.x - R, c.y - R, R * 2, R * 2, a);
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, "#FF3B2E", c.x, c.y, R * 3.2, a * 0.6);
        ctx.globalCompositeOperation = "source-over";
      }
    } else if (g.kind === "pads") {
      const n = cells.length;
      const step = m.beatCount % n;
      const tq = Math.floor(time * 12);
      for (let i = 0; i < n; i++) {
        const c = cells[i];
        let a = i === step ? 1 : 0;
        if (f.hatEnv > 0.25 && hash(i + tq * 17 + m.id) < 0.2 + chaos * 0.3) a = Math.max(a, 0.8);
        if (f.snareEnv > 0.5 && (i % 4 === 1 || i % 4 === 2)) a = Math.max(a, f.snareEnv * 0.8);
        if (a <= 0) continue;
        const ex = c.hw * 1.35;
        const ey = c.hh * 1.35;
        relight(ctx, m, c.x - ex, c.y - ey, ex * 2, ey * 2, a);
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, "#4DFFC3", c.x, c.y, Math.max(ex, ey) * 2.6, a * 0.45);
        ctx.globalCompositeOperation = "source-over";
      }
    } else {
      // SEQUENT matrix as a live spectrum: columns are bands, peaks burn red.
      const tq = Math.floor(time * 10);
      ctx.globalCompositeOperation = "lighter";
      for (let col = 0; col < g.cols; col++) {
        const lvl = Math.round(clamp(f.bands[col % 8] * 1.2) * g.rows);
        for (let row = 0; row < g.rows; row++) {
          const c = cells[row * g.cols + col];
          const fromBottom = g.rows - 1 - row;
          let on = fromBottom < lvl;
          const peak = on && fromBottom === lvl - 1;
          if (!on && f.hat && hash(col * 31 + row * 7 + tq + m.id) < 0.08 + chaos * 0.12) on = true;
          if (!on) continue;
          const red = peak || fromBottom >= g.rows - 2 || hash(col + row * 13 + m.id) < 0.25;
          const color = red ? "#FF2E3A" : "#F2F4F3";
          ctx.fillStyle = color;
          ctx.fillRect(c.x - c.hw, c.y - c.hh, c.hw * 2, c.hh * 2);
          glow(ctx, color, c.x, c.y, Math.max(c.hw, c.hh) * 2.8, 0.45);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }
}
