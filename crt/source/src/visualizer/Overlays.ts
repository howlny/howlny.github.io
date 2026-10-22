import { chance, clamp, pick, rand } from "./math";
import { brandImages } from "./media/brandAtlas";
import { FONT_MONO, FONT_STENCIL, FONT_VCR, SIGNAL } from "./palette";
import type { AudioFeatures } from "./types";

/** Per-frame context passed to the overlay layer. */
export interface OverlayFrame {
  W: number;
  H: number;
  f: AudioFeatures;
  chaos: number;
  time: number;
  I: number;
  /** Full-frame flashes (bars, blue screen, strobe) allowed. */
  flashOK: boolean;
  /** Scene canvas pixels per CSS pixel (for datamosh copies). */
  scale: number;
  program: string;
  /** Active camera label and footage mode (from the director). */
  cam: string;
  feed: string;
  /** Tracking-error amount, drives the TRACKING meter. */
  track: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
  color: string | null;
  sx: number;
  sy: number;
  mode: GlobalCompositeOperation;
}
interface Sweep {
  y: number;
  v: number;
  h: number;
  color: string;
}

const SMPTE_TOP = ["#C0C0C0", "#C0C000", "#00C0C0", "#00C000", "#C000C0", "#C00000", "#0000C0"];
const SMPTE_MID = ["#0000C0", "#131313", "#C000C0", "#131313", "#00C0C0", "#131313", "#C0C0C0"];
const SMPTE_LOW = ["#00214C", "#FFFFFF", "#32006A", "#131313", "#090909", "#131313", "#1D1D1D"];
const GLITCH = ["#FF2BD6", "#00E5FF", "#FFD400", "#8CFF2E", "#FFFFFF", "#2F6BFF", "#000000"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Screen-space overlay layer in the language of stock VHS/CRT glitch footage: a VCR on-screen
 * display, interference bars, datamosh copies, colour bars, test card and blue screen.
 * Everything is fired from the fast transient envelopes and lives for tens of milliseconds.
 */
export class Overlays {
  private bars = 0;
  private barsBand = false;
  private barsY = 0;
  private blue = 0;
  private card = 0;
  private rects: Rect[] = [];
  private sweeps: Sweep[] = [];
  private scopeColor = "#00E5FF";
  /** Wall-clock time at visualizer time zero, for the OSD timestamp. */
  private readonly clockBase = Date.now();
  /** Temporary transport label (FF / PAUSE / REW) and its remaining time. */
  private transport = "";
  private transportT = 0;
  /** Channel-change flash. */
  private chT = 0;
  private chId = "01";
  private chName = "";
  private readonly date: string;

  constructor() {
    const d = new Date();
    this.date = `${MONTHS[d.getMonth()]}. ${String(d.getDate()).padStart(2, "0")} ${d.getFullYear()}`;
  }

  clear(): void {
    this.rects.length = 0;
    this.sweeps.length = 0;
  }

  kick(o: OverlayFrame, strength: number): void {
    const { H, chaos } = o;
    // Interference bars rolling down the picture.
    if (chaos > 0.22 && chance(0.4 + chaos * 0.4)) {
      this.sweeps.push({ y: -20, v: H * rand(5, 12), h: rand(8, 60) * (0.5 + strength), color: pick(["#FFFFFF", "#9FE8FF", "#FFE7B0"]) });
    }
    if (o.flashOK && chaos > 0.66 && chance(0.05 + (chaos - 0.66) * 0.35 * o.I)) {
      this.bars = rand(0.035, 0.07);
      this.barsBand = chance(0.55);
      this.barsY = rand(0.1, 0.7) * H;
    }
    if (chaos > 0.55 && chance(0.03 + chaos * 0.04)) this.card = rand(0.05, 0.09);
    if (chance(0.5)) this.scopeColor = pick(["#00E5FF", "#8CFF2E", "#FFFFFF", "#FF2BD6"]);
  }

  snare(o: OverlayFrame, strength: number): void {
    const { W, H, chaos } = o;
    // Datamosh copies and hard glitch blocks.
    const n = Math.round(1 + chaos * 6 * o.I + strength * 2);
    for (let i = 0; i < n; i++) {
      const w = rand(0.08, 0.6) * W;
      const h = rand(0.008, 0.09) * H;
      const copy = chance(0.65);
      this.rects.push({
        x: rand(-0.1, 1) * W,
        y: rand(0, 1) * H,
        w,
        h,
        t: rand(0.03, 0.11),
        color: copy ? null : pick(GLITCH),
        sx: rand(0, 1) * Math.max(1, W - w),
        sy: rand(0, 1) * Math.max(1, H - h),
        mode: copy ? "source-over" : pick(["difference", "source-over", "lighter", "exclusion"] as GlobalCompositeOperation[]),
      });
    }
    if (o.flashOK && chaos > 0.72 && chance(0.05 * o.I)) this.blue = rand(0.05, 0.1);
    if (chaos > 0.62 && this.transportT <= 0 && chance(0.04)) this.setTransport("◀◀ REW", 0.35);
  }

  hat(o: OverlayFrame): void {
    const { W, H, chaos } = o;
    if (chaos < 0.25) return;
    const n = chance(chaos) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.rects.push({
        x: 0,
        y: rand(0, 1) * H,
        w: W,
        h: rand(1, 3),
        t: rand(0.02, 0.05),
        color: pick(["#FFFFFF", "#00E5FF", "#FF2BD6"]),
        sx: 0,
        sy: 0,
        mode: "lighter",
      });
    }
  }

  /** The VCR flips channel when the video program changes. */
  programSwitch(id: string, name: string): void {
    this.chT = 0.7;
    this.chId = id;
    this.chName = name;
  }

  /** A hit after a breakdown. */
  drop(): void {
    this.setTransport("▶▶ FF ×8", 0.7);
  }

  /** The music went quiet. */
  pause(): void {
    if (this.transportT <= 0) this.setTransport("❚❚ PAUSE", 0.9);
  }

  private setTransport(label: string, t: number): void {
    this.transport = label;
    this.transportT = t;
  }

  phaseUp(o: OverlayFrame): void {
    if (o.flashOK) {
      this.bars = 0.06;
      this.barsBand = false;
    }
    this.card = 0.1;
  }

  update(dt: number, o: OverlayFrame): void {
    this.bars -= dt;
    this.blue -= dt;
    this.card -= dt;
    this.chT -= dt;
    this.transportT -= dt;
    for (let i = this.rects.length - 1; i >= 0; i--) {
      this.rects[i].t -= dt;
      if (this.rects[i].t <= 0) this.rects.splice(i, 1);
    }
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const s = this.sweeps[i];
      s.y += s.v * dt;
      if (s.y > o.H + 80) this.sweeps.splice(i, 1);
    }
    if (this.rects.length > 60) this.rects.splice(0, this.rects.length - 60);
  }

  draw(ctx: CanvasRenderingContext2D, o: OverlayFrame, src: HTMLCanvasElement): void {
    const { W, H } = o;
    ctx.save();
    this.drawScope(ctx, o);
    this.drawSweeps(ctx, o);
    this.drawRects(ctx, o, src);
    // Full-frame takeovers cut over everything for a few frames.
    if (this.card > 0) this.drawCard(ctx, W, H, o.time);
    if (this.bars > 0) this.drawBars(ctx, W, H);
    if (this.blue > 0) this.drawBlue(ctx, W, H);
    ctx.restore();
  }

  /** Giant XY (Lissajous) vector scope of the live waveform against a delayed copy of itself. */
  private drawScope(ctx: CanvasRenderingContext2D, o: OverlayFrame): void {
    const { f, chaos } = o;
    const a = clamp((chaos - 0.35) / 0.3) * (0.3 + f.level * 0.6);
    if (a <= 0.02) return;
    const wf = f.waveform;
    const R = Math.min(o.W, o.H) * 0.36 * (1 + f.kickEnv * 0.35);
    const rot = o.time * 0.3 + f.kickEnv * 0.6;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const cx = o.W / 2;
    const cy = o.H / 2;
    const lag = 192;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const k = i * 3;
      const x = wf[k % wf.length];
      const y = wf[(k + lag) % wf.length];
      const px = cx + (x * cr - y * sr) * R;
      const py = cy + (x * sr + y * cr) * R;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = this.scopeColor;
    ctx.globalAlpha = a * 0.3;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawSweeps(ctx: CanvasRenderingContext2D, o: OverlayFrame): void {
    if (!this.sweeps.length) return;
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.sweeps) {
      const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.85, s.color);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = g;
      ctx.fillRect(0, s.y, o.W, s.h);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = s.color;
      ctx.fillRect(0, s.y + s.h * 0.85, o.W, 1.5);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** Solid glitch blocks and datamosh copies of other parts of the frame. */
  private drawRects(ctx: CanvasRenderingContext2D, o: OverlayFrame, src: HTMLCanvasElement): void {
    if (!this.rects.length) return;
    const s = o.scale;
    for (const r of this.rects) {
      ctx.globalCompositeOperation = r.mode;
      if (r.color) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = r.color;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      } else {
        ctx.globalAlpha = 1;
        const sw = Math.max(1, Math.min(r.w * s, src.width - r.sx * s));
        const sh = Math.max(1, Math.min(r.h * s, src.height - r.sy * s));
        ctx.drawImage(src, r.sx * s, r.sy * s, sw, sh, r.x, r.y, r.w, r.h);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * HOWL CCTV on-screen display (after howlny.com): REC, channel + logo, camera, live
   * timestamp and tracking. Drawn on its own layer above the tape picture; `jit` (0..1)
   * shudders and splits it on hits.
   */
  drawOsd(ctx: CanvasRenderingContext2D, o: OverlayFrame, jit: number): void {
    const { W, H, chaos, time } = o;
    const fs = clamp(Math.min(W, H) * 0.034, 13, 30);
    const mx = Math.max(W * 0.055, fs * 1.4);
    const myTop = Math.max(H * 0.065, fs * 2);
    const myBot = H - Math.max(H * 0.065, fs * 1.6);
    const split = jit > 0.12 ? jit * fs * 0.2 : 0;
    const jx = jit > 0.12 ? rand(-1, 1) * jit * fs * 0.25 : 0;
    const jy = jit > 0.3 ? rand(-1, 1) * jit * fs * 0.15 : 0;
    const ls = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    const setFont = (size: number, weight = 500, fam = FONT_MONO) => {
      ctx.font = `${weight} ${size}px ${fam}`;
      ls.letterSpacing = `${Math.round(size * 0.18)}px`;
    };
    ctx.textBaseline = "top";
    const text = (str: string, x0: number, y0: number, align: CanvasTextAlign = "left", color = "#FFFFFF", size = fs, weight = 500, fam = FONT_MONO) => {
      const x = x0 + jx;
      const y = y0 + jy;
      setFont(size, weight, fam);
      ctx.textAlign = align;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(str, x + size * 0.07, y + size * 0.07);
      if (split > 0) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "#00E5FF";
        ctx.fillText(str, x - split, y);
        ctx.fillStyle = "#FF2BD6";
        ctx.fillText(str, x + split, y);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    };

    // REC (top left), with the transport state under it.
    const blinkOn = Math.floor(time * 2) % 2 === 0;
    if (blinkOn || chaos > 0.6) {
      ctx.fillStyle = "#FF3B3B";
      ctx.beginPath();
      ctx.arc(mx + fs * 0.45 + jx, myTop + fs * 0.52 + jy, fs * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
    text("REC", mx + fs * 1.25, myTop, "left", "#FFFFFF", fs, 700);
    if (this.transportT > 0) text(this.transport, mx, myTop + fs * 1.6, "left", SIGNAL, fs * 0.8);

    // HOWL ring logo + channel (top right): big flash on a program change.
    const logo = brandImages.ring;
    let ty = myTop;
    if (logo) {
      const lw = clamp(W * 0.13, 90, 220) * (this.chT > 0 ? 1.25 : 1);
      const lh = lw / (logo.naturalWidth / logo.naturalHeight || 3.7);
      if (split > 0) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(logo, W - mx - lw - split + jx, ty + jy, lw, lh);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(logo, W - mx - lw + jx, ty + jy, lw, lh);
      ty += lh + fs * 0.6;
    }
    if (this.chT > 0) {
      text(`CH ${this.chId}`, W - mx, ty, "right", "#FFFFFF", fs * 2.2, 400, FONT_STENCIL);
      text(this.chName, W - mx, ty + fs * 2.3, "right", SIGNAL, fs * 0.85);
    } else {
      text(`CH ${this.chId}`, W - mx, ty, "right", "rgba(255,255,255,0.75)", fs * 0.85);
    }

    // Camera + footage mode (bottom left), live timestamp (bottom right).
    text(`MODE: ${o.feed}`, mx, myBot - fs * 1.7, "left", "rgba(255,255,255,0.7)", fs * 0.75);
    text(`${o.cam} // NYC`, mx, myBot, "left", "#FFFFFF", fs * 0.95, 700);
    // The clock runs on visualizer time from a wall-clock base, so frame-stepped renders tick at 1 s/s.
    const d = new Date(this.clockBase + time * 1000);
    const pad = (n: number, l = 2) => String(n).padStart(l, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const frames = pad(Math.floor((time * 30) % 30));
    // Narrow screens drop the date so the clock clears the camera label.
    const narrow = W < fs * 34;
    const tsz = fs * (narrow ? 1.1 : 1.45);
    const clock = narrow ? stamp.slice(11) : stamp;
    text(`${clock}:${frames}`, W - mx, myBot - tsz * 0.45, "right", SIGNAL, tsz, 500);
    text("FEED: ACTIVE", W - mx, myBot - tsz * 0.45 - fs * 1.4, "right", "rgba(255,255,255,0.7)", fs * 0.75);

    // Tracking meter: top centre, clear of the logo and the clock. On narrow screens the
    // logo block fills the top right, so it sits under REC instead.
    if (o.track > 0.2) {
      const lvl = Math.round(clamp(o.track) * 10);
      const tx = narrow ? mx : W / 2;
      const ty0 = narrow ? myTop + fs * 3.2 : myTop;
      const al: CanvasTextAlign = narrow ? "left" : "center";
      text("TRACKING", tx, ty0, al, "#FFFFFF", fs * 0.85);
      text(`-${"■".repeat(lvl)}${"□".repeat(10 - lvl)}+`, tx, ty0 + fs * 1.3, al, "#FFFFFF", fs * 0.85);
    }
    ls.letterSpacing = "0px";
    ctx.textAlign = "left";
  }

  private drawBars(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const y0 = this.barsBand ? this.barsY : 0;
    const h = this.barsBand ? H * 0.22 : H;
    const bw = W / 7;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = SMPTE_TOP[i];
      ctx.fillRect(i * bw, y0, bw + 1, h * 0.67);
      ctx.fillStyle = SMPTE_MID[i];
      ctx.fillRect(i * bw, y0 + h * 0.67, bw + 1, h * 0.08);
      ctx.fillStyle = SMPTE_LOW[i];
      ctx.fillRect(i * bw, y0 + h * 0.75, bw + 1, h * 0.25);
    }
  }

  private drawBlue(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = "#0A1FD1";
    ctx.fillRect(0, 0, W, H);
    const fs = clamp(Math.min(W, H) * 0.07, 24, 64);
    ctx.font = `400 ${fs}px ${FONT_VCR}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("NO SIGNAL", W / 2, H / 2);
    ctx.textAlign = "left";
  }

  /** Broadcast-style test card. */
  private drawCard(ctx: CanvasRenderingContext2D, W: number, H: number, time: number): void {
    ctx.fillStyle = "#3A3A3A";
    ctx.fillRect(0, 0, W, H);
    const step = H / 12;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = (W / 2) % step; x < W; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = 0; y < H; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    const r = H * 0.42;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    ctx.clip();
    const bw = (r * 2) / 7;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = SMPTE_TOP[i];
      ctx.fillRect(W / 2 - r + i * bw, H / 2 - r * 0.55, bw + 1, r * 0.5);
    }
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? "#000" : "#FFF";
      ctx.fillRect(W / 2 - r + (i * r * 2) / 12, H / 2 + r * 0.1, (r * 2) / 12 + 1, r * 0.3);
    }
    ctx.restore();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    ctx.moveTo(W / 2 - r, H / 2);
    ctx.lineTo(W / 2 + r, H / 2);
    ctx.moveTo(W / 2, H / 2 - r);
    ctx.lineTo(W / 2, H / 2 + r);
    ctx.stroke();
    const fs = clamp(H * 0.05, 14, 40);
    ctx.font = `800 ${fs}px ${FONT_MONO}`;
    ctx.fillStyle = "#000";
    ctx.fillRect(W / 2 - fs * 3.2, H / 2 - r * 0.05 - fs, fs * 6.4, fs * 1.3);
    ctx.fillStyle = "#FFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`HOWL ${String(Math.floor(time * 30) % 100).padStart(2, "0")}`, W / 2, H / 2 - r * 0.05 - fs * 0.35);
    ctx.textAlign = "left";
  }
}
