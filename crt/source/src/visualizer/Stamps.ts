import { FONT_STENCIL, HAZARD } from "./palette";
import { pick, rand } from "./math";

interface Stamp {
  text: string;
  x: number;
  y: number;
  rot: number;
  size: number;
  life: number;
  max: number;
  style: "tape" | "outline" | "red";
}

export const STAMP_WORDS = [
  "HOWL",
  "HOWL",
  "SIGNAL",
  "RAW",
  "INSTINCTIVE",
  "IMPOSSIBLE TO IGNORE",
  "CONTROLLED EXPLOSION",
  "JOIN THE SIGNAL",
  "SUNSHINE",
  "OUT NOW",
  "NYC",
  "TRANSMIT",
  "OVERLOAD",
  "FAULT",
  "BREACH",
  "SIGNAL LOST",
];

let tapePattern: CanvasPattern | null = null;

function getTape(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (tapePattern) return tapePattern;
  const c = document.createElement("canvas");
  c.width = c.height = 40;
  const g = c.getContext("2d")!;
  g.fillStyle = "#FFD400";
  g.fillRect(0, 0, 40, 40);
  g.fillStyle = "#0B0C0E";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(20, 0);
  g.lineTo(0, 20);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(40, 0);
  g.lineTo(40, 20);
  g.lineTo(20, 40);
  g.lineTo(0, 40);
  g.closePath();
  g.fill();
  tapePattern = ctx.createPattern(c, "repeat");
  return tapePattern;
}

export class Stamps {
  list: Stamp[] = [];

  slam(text: string, W: number, H: number, big = false): void {
    if (this.list.length > 4) this.list.shift();
    const base = Math.min(W, H);
    const size = big ? base * rand(0.16, 0.22) : base * rand(0.07, 0.13);
    const max = big ? 1.1 : rand(0.35, 0.7);
    this.list.push({
      text,
      x: big ? W * rand(0.3, 0.7) : W * rand(0.15, 0.85),
      y: big ? H * rand(0.35, 0.65) : H * rand(0.15, 0.85),
      rot: rand(-0.25, 0.25),
      size,
      life: max,
      max,
      style: pick(["tape", "outline", "red", "tape"] as const),
    });
  }

  update(dt: number): void {
    for (const s of this.list) s.life -= dt;
    this.list = this.list.filter(s => s.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.list) {
      const age = s.max - s.life;
      const punch = 1 + Math.max(0, 1 - age / 0.07) * 0.8;
      const fade = Math.min(1, s.life / 0.12);
      ctx.save();
      ctx.translate(s.x + rand(-2, 2), s.y + rand(-2, 2));
      ctx.rotate(s.rot);
      ctx.scale(punch, punch);
      ctx.globalAlpha = fade;
      ctx.font = `400 ${s.size}px ${FONT_STENCIL}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(s.text).width;
      const bandH = s.size * 1.05;
      if (s.style === "tape") {
        const tape = getTape(ctx);
        ctx.fillStyle = tape ?? "#FFD400";
        ctx.fillRect(-tw / 2 - s.size * 0.5, -bandH / 2, tw + s.size, bandH);
        ctx.fillStyle = "#0B0C0E";
        ctx.fillRect(-tw / 2 - s.size * 0.25, -bandH * 0.36, tw + s.size * 0.5, bandH * 0.72);
        ctx.fillStyle = "#FFD400";
        ctx.fillText(s.text, 0, s.size * 0.04);
      } else if (s.style === "red") {
        ctx.fillStyle = "#D7261E";
        ctx.fillRect(-tw / 2 - s.size * 0.3, -bandH / 2, tw + s.size * 0.6, bandH);
        ctx.fillStyle = "#F4F2EC";
        ctx.fillText(s.text, 0, s.size * 0.04);
      } else {
        ctx.lineWidth = Math.max(2, s.size * 0.06);
        ctx.strokeStyle = "#0B0C0E";
        ctx.strokeText(s.text, 0, s.size * 0.04);
        ctx.fillStyle = HAZARD;
        ctx.fillText(s.text, 0, s.size * 0.04);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
