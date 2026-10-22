import { LED_COLORS, glowSprite, hexToRgba } from "../palette";
import { TAU, clamp, rand } from "../math";
import type { AudioFeatures } from "../types";
import type { RackModule } from "./RackModule";
import type { ModuleSpec } from "./spec";

const TINT: Record<ModuleSpec["screenTint"], string> = {
  green: "#8CFF2E",
  amber: "#FFB000",
  blue: "#00E5FF",
  red: "#FF2E3A",
};

let noiseTiles: HTMLCanvasElement[] | null = null;

function getNoiseTiles(): HTMLCanvasElement[] {
  if (noiseTiles) return noiseTiles;
  noiseTiles = [];
  for (let t = 0; t < 3; t++) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const img = g.createImageData(64, 64);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v * 0.7;
      img.data[i + 1] = v * 0.9;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    noiseTiles.push(c);
  }
  return noiseTiles;
}

function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, alpha: number): void {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = clamp(alpha);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// 7-segment layout: a b c d e f g
const SEGMENTS: Record<string, number[]> = {
  "0": [1, 1, 1, 1, 1, 1, 0],
  "1": [0, 1, 1, 0, 0, 0, 0],
  "2": [1, 1, 0, 1, 1, 0, 1],
  "3": [1, 1, 1, 1, 0, 0, 1],
  "4": [0, 1, 1, 0, 0, 1, 1],
  "5": [1, 0, 1, 1, 0, 1, 1],
  "6": [1, 0, 1, 1, 1, 1, 1],
  "7": [1, 1, 1, 0, 0, 0, 0],
  "8": [1, 1, 1, 1, 1, 1, 1],
  "9": [1, 1, 1, 1, 0, 1, 1],
  "-": [0, 0, 0, 0, 0, 0, 1],
  E: [1, 0, 0, 1, 1, 1, 1],
  r: [0, 0, 0, 0, 1, 0, 1],
  " ": [0, 0, 0, 0, 0, 0, 0],
};

function drawDigit(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, w: number, h: number, on: string): void {
  const segs = SEGMENTS[ch] ?? SEGMENTS[" "];
  const t = Math.max(1, w * 0.16);
  const rects: [number, number, number, number][] = [
    [x + t, y, w - 2 * t, t],
    [x + w - t, y + t, t, h / 2 - t * 1.5],
    [x + w - t, y + h / 2 + t * 0.5, t, h / 2 - t * 1.5],
    [x + t, y + h - t, w - 2 * t, t],
    [x, y + h / 2 + t * 0.5, t, h / 2 - t * 1.5],
    [x, y + t, t, h / 2 - t * 1.5],
    [x + t, y + h / 2 - t / 2, w - 2 * t, t],
  ];
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = segs[i] ? on : "rgba(255,40,40,0.07)";
    const r = rects[i];
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
}

export function drawModuleDynamics(
  ctx: CanvasRenderingContext2D,
  m: RackModule,
  f: AudioFeatures,
  chaos: number,
  time: number,
): void {
  const spec = m.spec;
  const s = spec.screen;
  const tint = TINT[spec.screenTint];

  // --- Screens ---------------------------------------------------------------
  if (s) {
    ctx.save();
    ctx.beginPath();
    if (spec.round) ctx.arc(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, 0, TAU);
    else ctx.rect(s.x, s.y, s.w, s.h);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";

    switch (spec.type) {
      case "scope": {
        const wf = f.waveform;
        const xy = chaos > 0.55 && (m.id + Math.floor(time * 0.5)) % 3 === 0;
        ctx.beginPath();
        const n = 96;
        if (xy) {
          const cx = s.x + s.w / 2;
          const cy = s.y + s.h / 2;
          const R = Math.min(s.w, s.h) * 0.45;
          for (let i = 0; i < n; i++) {
            const a = wf[i * 8];
            const b = wf[(i * 8 + 37) % wf.length];
            const px = cx + a * R;
            const py = cy + b * R;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        } else {
          const amp = s.h * 0.44;
          const stride = Math.floor(wf.length / n);
          for (let i = 0; i < n; i++) {
            const px = s.x + (i / (n - 1)) * s.w;
            const py = s.y + s.h / 2 - wf[i * stride] * amp;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        }
        ctx.strokeStyle = hexToRgba(tint, 0.28);
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.strokeStyle = tint;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        break;
      }
      case "spectrum": {
        const bars = Math.max(6, Math.floor(s.w / 3.4));
        const bw = s.w / bars;
        ctx.fillStyle = tint;
        for (let i = 0; i < bars; i++) {
          const bin = Math.floor((i / bars) * 60);
          const v = f.spectrum[bin];
          const bh = v * s.h * 0.95;
          ctx.globalAlpha = 0.55 + v * 0.45;
          ctx.fillRect(s.x + i * bw + 0.5, s.y + s.h - bh, bw - 1, bh);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        for (let y = s.y; y < s.y + s.h; y += 3) ctx.fillRect(s.x, y, s.w, 1);
        break;
      }
      case "noise": {
        const tiles = getNoiseTiles();
        const tile = tiles[Math.floor(Math.random() * tiles.length)];
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = clamp(0.15 + f.level * 0.6 + f.high * 0.3);
        const sw = Math.min(64, Math.max(8, s.w / 3));
        const sh = Math.min(64, sw * (s.h / s.w));
        ctx.drawImage(tile, rand(0, 64 - sw), rand(0, 64 - sh), sw, sh, s.x, s.y, s.w, s.h);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        break;
      }
      case "env": {
        const k = spec.knobs;
        const a = 0.04 + (k[0]?.value ?? 0.3) * 0.35;
        const d = 0.05 + (k[1]?.value ?? 0.3) * 0.35;
        const sus = 0.25 + (k[2]?.value ?? 0.5) * 0.6;
        const r = 0.1 + (k[3]?.value ?? 0.4) * 0.5;
        const hold = 0.25;
        const total = a + d + hold + r;
        const X = (t: number) => s.x + 3 + (t / total) * (s.w - 6);
        const Y = (v: number) => s.y + s.h - 3 - v * (s.h - 6);
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        ctx.lineTo(X(a), Y(1));
        ctx.lineTo(X(a + d), Y(sus));
        ctx.lineTo(X(a + d + hold), Y(sus));
        ctx.lineTo(X(total), Y(0));
        ctx.strokeStyle = hexToRgba(tint, 0.3);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = tint;
        ctx.lineWidth = 1;
        ctx.stroke();
        const t = Math.min(m.envT, total);
        let v = 0;
        if (t < a) v = t / a;
        else if (t < a + d) v = 1 - (1 - sus) * ((t - a) / d);
        else if (t < a + d + hold) v = sus;
        else v = sus * (1 - (t - a - d - hold) / r);
        drawGlow(ctx, tint, X(t), Y(Math.max(0, v)), 6, 1);
        break;
      }
      case "lfo": {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const R = s.w / 2;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const x = s.x + (i / 40) * s.w;
          const y = cy + Math.sin(i * 0.35 + m.lfoPhase * 2) * R * 0.5 * (0.4 + f.mid);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexToRgba(tint, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
        const nx = cx + Math.cos(m.lfoPhase) * R * 0.85;
        const ny = cy + Math.sin(m.lfoPhase) * R * 0.85;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = tint;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        drawGlow(ctx, tint, nx, ny, 7, 1);
        break;
      }
      case "radar": {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const R = s.w / 2;
        for (let i = 0; i < 7; i++) {
          const a = m.radarAngle - i * 0.07;
          ctx.strokeStyle = hexToRgba(tint, 0.6 * (1 - i / 7));
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
          ctx.stroke();
        }
        for (const b of m.blips) drawGlow(ctx, tint, cx + b.x, cy + b.y, 5 + b.life * 4, b.life);
        break;
      }
    }
    ctx.restore();
  }

  ctx.globalCompositeOperation = "lighter";

  // --- 7-segment display -----------------------------------------------------
  if (spec.digits) {
    const d = spec.digits;
    let text: string;
    if (chaos > 0.75 && Math.random() < chaos * 0.4) {
      text = Array.from({ length: d.count }, () => "0123456789-Er"[Math.floor(Math.random() * 13)]).join("");
    } else if (spec.label === "COUNT") {
      text = String(m.beatCount).padStart(d.count, "0").slice(-d.count);
    } else {
      text = f.bpm > 1 ? String(Math.round(f.bpm)).padStart(d.count, " ").slice(-d.count) : "-".repeat(d.count);
    }
    const cw = d.w / d.count;
    const on = "#FF2E3A";
    for (let i = 0; i < d.count; i++) {
      drawDigit(ctx, text[i] ?? " ", d.x + i * cw + cw * 0.15, d.y + d.h * 0.12, cw * 0.7, d.h * 0.76, on);
    }
    drawGlow(ctx, on, d.x + d.w / 2, d.y + d.h / 2, d.w * 0.6, 0.18 + f.beatPulse * 0.25);
  }

  // --- LED matrix -----------------------------------------------------------------
  if (spec.matrix) {
    const g = spec.matrix;
    const cw = g.w / g.cols;
    const ch = g.h / g.rows;
    for (let c = 0; c < g.cols; c++) {
      const v = f.spectrum[Math.floor((c / g.cols) * 52)];
      const lit = Math.round(v * g.rows);
      for (let r = 0; r < lit; r++) {
        const t = r / g.rows;
        ctx.fillStyle = t > 0.75 ? "#FFFFFF" : t > 0.45 ? "#FF2BD6" : "#00E5FF";
        ctx.fillRect(g.x + c * cw + cw * 0.15, g.y + g.h - (r + 1) * ch + ch * 0.15, cw * 0.7, ch * 0.7);
      }
    }
    if (f.hat) {
      ctx.fillStyle = "#FFD400";
      for (let i = 0; i < 4; i++) {
        const c = Math.floor(Math.random() * g.cols);
        const r = Math.floor(Math.random() * g.rows);
        ctx.fillRect(g.x + c * cw + cw * 0.15, g.y + r * ch + ch * 0.15, cw * 0.7, ch * 0.7);
      }
    }
  }

  // --- LED ladders -------------------------------------------------------------------
  for (const l of spec.ladders) {
    const lit = Math.round(f.bands[l.band] * l.n);
    const cell = l.h / l.n;
    for (let i = 0; i < lit; i++) {
      const t = i / l.n;
      const color = t > 0.82 ? LED_COLORS.red : t > 0.6 ? LED_COLORS.yellow : LED_COLORS.green;
      ctx.fillStyle = color;
      const y = l.y + l.h - (i + 1) * cell + cell * 0.15;
      ctx.fillRect(l.x, y, l.w, cell * 0.7);
      if (i === lit - 1) drawGlow(ctx, color, l.x + l.w / 2, y + cell * 0.35, l.w * 2.2, 0.8);
    }
  }

  // --- LEDs & sequencer steps -----------------------------------------------------
  for (const l of spec.leds) {
    if (l.value < 0.04) continue;
    const color = LED_COLORS[l.color];
    ctx.fillStyle = color;
    ctx.globalAlpha = clamp(l.value);
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawGlow(ctx, color, l.x, l.y, l.r * 6, l.value * 0.9);
  }
  for (let i = 0; i < spec.steps.length; i++) {
    const st = spec.steps[i];
    const active = i === m.seqStep;
    const v = active ? 1 : (spec.knobs[i]?.value ?? 0) * 0.25;
    ctx.fillStyle = active ? "#FF5A1F" : "#FF2E3A";
    ctx.globalAlpha = v;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (active) drawGlow(ctx, "#FF5A1F", st.x, st.y, st.r * 7, 0.9);
  }

  ctx.globalCompositeOperation = "source-over";

  // --- Fader caps ---------------------------------------------------------------------
  for (const fd of spec.faders) {
    const cy = fd.y + (1 - fd.value) * fd.h;
    const cw = fd.w * 1.8;
    const chh = Math.max(4, fd.h * 0.09);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(fd.x + fd.w / 2 - cw / 2 + 1, cy - chh / 2 + 2, cw, chh);
    ctx.fillStyle = "#d9d9d6";
    ctx.fillRect(fd.x + fd.w / 2 - cw / 2, cy - chh / 2, cw, chh);
    ctx.fillStyle = "#111";
    ctx.fillRect(fd.x + fd.w / 2 - cw / 2, cy - 0.5, cw, 1);
  }

  // --- Knob pointers ------------------------------------------------------------------
  for (const k of spec.knobs) {
    const a = -Math.PI * 1.25 + k.value * Math.PI * 1.5 + k.spin;
    const light = k.cap === "#E9E7E1" || k.cap === "#FFD400";
    ctx.strokeStyle = light ? "#111" : "#F4F2EC";
    ctx.lineWidth = Math.max(1, k.r * (k.big ? 0.09 : 0.14));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(k.x + Math.cos(a) * k.r * 0.15, k.y + Math.sin(a) * k.r * 0.15);
    ctx.lineTo(k.x + Math.cos(a) * k.r * (k.big ? 0.6 : 0.66), k.y + Math.sin(a) * k.r * (k.big ? 0.6 : 0.66));
    ctx.stroke();
    if (k.big) {
      ctx.fillStyle = "#FF5A1F";
      ctx.beginPath();
      ctx.arc(k.x + Math.cos(a) * k.r * 0.86, k.y + Math.sin(a) * k.r * 0.86, k.r * 0.07, 0, TAU);
      ctx.fill();
    }
  }
  ctx.lineCap = "butt";

  // --- Damage -------------------------------------------------------------------------
  if (m.cracks.length) {
    for (const c of m.cracks) {
      ctx.beginPath();
      ctx.moveTo(c.pts[0], c.pts[1]);
      for (let i = 2; i < c.pts.length; i += 2) ctx.lineTo(c.pts[i], c.pts[i + 1]);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
  if (m.heat > 0.05) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,70,20,${m.heat * (0.12 + f.beatPulse * 0.15)})`;
    ctx.fillRect(0, 0, m.w, m.h);
    ctx.globalCompositeOperation = "source-over";
  }
}
