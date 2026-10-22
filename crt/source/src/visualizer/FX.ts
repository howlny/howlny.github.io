import { glowSprite, smokeSprite } from "./palette";
import { TAU, chance, pick, rand } from "./math";
import type { RackModule } from "./modules/RackModule";

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hot: number;
}

interface Debris {
  img: HTMLCanvasElement;
  scale: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  life: number;
}

interface Smoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  color: string;
}

interface Arc {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: string;
}

interface Flash {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: string;
}

interface Screw {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  r: number;
}

const SPARK_BUCKETS = ["#FFFFFF", "#FFE27A", "#FF9A3C", "#FF5A1F"];

export class FX {
  sparks: Spark[] = [];
  debris: Debris[] = [];
  smoke: Smoke[] = [];
  rings: Ring[] = [];
  arcs: Arc[] = [];
  flashes: Flash[] = [];
  screws: Screw[] = [];

  maxSparks = 900;
  maxDebris = 160;
  maxSmoke = 50;

  sparkBurst(x: number, y: number, count: number, speed = 600, dirX = 0, dirY = -1, spread = Math.PI): void {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= this.maxSparks) this.sparks.shift();
      const a = base + rand(-spread, spread) * 0.5;
      const v = speed * rand(0.25, 1.1);
      const max = rand(0.25, 0.9);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, hot: rand(0, 1) });
    }
  }

  smokePuff(x: number, y: number, count: number, size = 30): void {
    for (let i = 0; i < count; i++) {
      if (this.smoke.length >= this.maxSmoke) this.smoke.shift();
      const max = rand(1.2, 2.8);
      this.smoke.push({ x: x + rand(-10, 10), y: y + rand(-10, 10), vx: rand(-30, 30), vy: rand(-70, -20), r: size * rand(0.6, 1.3), life: max, max });
    }
  }

  ring(x: number, y: number, color = "#FF5A1F", speed = 900): void {
    this.rings.push({ x, y, r: 4, vr: speed, life: 0.5, max: 0.5, color });
  }

  flash(x: number, y: number, r: number, color = "#FFB36B", dur = 0.25): void {
    this.flashes.push({ x, y, r, life: dur, max: dur, color });
  }

  arc(x1: number, y1: number, x2: number, y2: number, color = "#7FF6FF", dur = rand(0.08, 0.22)): void {
    if (this.arcs.length > 24) this.arcs.shift();
    this.arcs.push({ x1, y1, x2, y2, life: dur, color });
  }

  /** Shatter a module's panel bitmap into tumbling shards. */
  shatter(m: RackModule, originX: number, originY: number, power = 1): void {
    const cols = Math.max(2, Math.min(5, Math.round(m.w / 28)));
    const rows = Math.max(3, Math.min(9, Math.round(m.h / 34)));
    const cw = m.w / cols;
    const ch = m.h / rows;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if (this.debris.length >= this.maxDebris) this.debris.shift();
        const jw = cw * rand(0.75, 1.1);
        const jh = ch * rand(0.75, 1.1);
        const lx = cx * cw + cw / 2;
        const ly = cy * ch + ch / 2;
        const p = m.localToWorld(lx, ly);
        const dx = p.x - originX;
        const dy = p.y - originY;
        const d = Math.max(20, Math.hypot(dx, dy));
        const v = rand(300, 1100) * power;
        const sx = Math.max(0, lx - jw / 2);
        const sy = Math.max(0, ly - jh / 2);
        this.debris.push({
          img: m.panel,
          scale: m.panelScale,
          sx,
          sy,
          sw: Math.max(1, Math.min(jw, m.w - sx - 0.5)),
          sh: Math.max(1, Math.min(jh, m.h - sy - 0.5)),
          x: p.x,
          y: p.y,
          vx: (dx / d) * v + rand(-150, 150),
          vy: (dy / d) * v - rand(200, 700) * power,
          a: m.angle,
          va: rand(-14, 14),
          life: 4,
        });
      }
    }
    for (const s of m.spec.screws) {
      const p = m.localToWorld(s.x, s.y);
      this.screws.push({ x: p.x, y: p.y, vx: rand(-500, 500), vy: rand(-900, -300), a: 0, va: rand(-20, 20), r: Math.max(2, (m.w / m.spec.hp) * 0.42) });
    }
  }

  update(dt: number, screenH: number): void {
    const g = 1500;
    for (const s of this.sparks) {
      s.vy += g * dt;
      s.vx *= 1 - dt * 0.8;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.y > screenH - 2 && s.vy > 0) {
        s.y = screenH - 2;
        s.vy *= -0.35;
        s.vx *= 0.6;
      }
    }
    this.sparks = this.sparks.filter(s => s.life > 0);

    for (const d of this.debris) {
      d.vy += 2200 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.a += d.va * dt;
      d.life -= dt;
    }
    this.debris = this.debris.filter(d => d.life > 0 && d.y < screenH + 200);

    for (const s of this.screws) {
      s.vy += 2400 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.a += s.va * dt;
    }
    this.screws = this.screws.filter(s => s.y < screenH + 50);

    for (const s of this.smoke) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.r += dt * 40;
      s.life -= dt;
    }
    this.smoke = this.smoke.filter(s => s.life > 0);

    for (const r of this.rings) {
      r.r += r.vr * dt;
      r.vr *= 1 - dt * 3;
      r.life -= dt;
    }
    this.rings = this.rings.filter(r => r.life > 0);

    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter(a => a.life > 0);
    for (const fl of this.flashes) fl.life -= dt;
    this.flashes = this.flashes.filter(f => f.life > 0);
  }

  /** Solid things: shards, screws, smoke (normal blending). */
  drawSolid(ctx: CanvasRenderingContext2D): void {
    for (const d of this.debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(-d.sw / 2 + 4, -d.sh / 2 + 6, d.sw, d.sh);
      ctx.drawImage(d.img, d.sx * d.scale, d.sy * d.scale, d.sw * d.scale, d.sh * d.scale, -d.sw / 2, -d.sh / 2, d.sw, d.sh);
      ctx.strokeStyle = "rgba(255,140,60,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-d.sw / 2, -d.sh / 2, d.sw, d.sh);
      ctx.restore();
    }
    for (const s of this.screws) {
      ctx.fillStyle = "#b7b9bd";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(s.a) * s.r, s.y + Math.sin(s.a) * s.r);
      ctx.lineTo(s.x - Math.cos(s.a) * s.r, s.y - Math.sin(s.a) * s.r);
      ctx.stroke();
    }
    const sm = smokeSprite();
    for (const s of this.smoke) {
      ctx.globalAlpha = Math.min(1, (s.life / s.max) * 1.2);
      ctx.drawImage(sm, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  /** Light: sparks, arcs, flashes, shockwaves (additive). */
  drawLight(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = "lighter";

    for (const fl of this.flashes) {
      const t = fl.life / fl.max;
      ctx.globalAlpha = t;
      const r = fl.r * (1.4 - t * 0.4);
      ctx.drawImage(glowSprite(fl.color), fl.x - r, fl.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    for (const r of this.rings) {
      const t = r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = t * 0.8;
      ctx.lineWidth = 2 + t * 6;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Sparks bucketed by temperature so each bucket is one stroke call.
    ctx.lineCap = "round";
    for (let b = 0; b < SPARK_BUCKETS.length; b++) {
      ctx.beginPath();
      let any = false;
      for (const s of this.sparks) {
        const t = s.life / s.max;
        const bucket = Math.min(SPARK_BUCKETS.length - 1, Math.floor((1 - t) * SPARK_BUCKETS.length * (0.6 + s.hot * 0.4)));
        if (bucket !== b) continue;
        any = true;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.022, s.y - s.vy * 0.022);
      }
      if (!any) continue;
      ctx.strokeStyle = SPARK_BUCKETS[b];
      ctx.lineWidth = b < 2 ? 1.8 : 1.3;
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    for (const a of this.arcs) this.drawArc(ctx, a);
    ctx.globalCompositeOperation = "source-over";
  }

  private drawArc(ctx: CanvasRenderingContext2D, a: Arc): void {
    const pts: number[] = [a.x1, a.y1, a.x2, a.y2];
    const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
    let disp = len * 0.25;
    for (let depth = 0; depth < 5; depth++) {
      const next: number[] = [pts[0], pts[1]];
      for (let i = 0; i < pts.length - 2; i += 2) {
        const mx = (pts[i] + pts[i + 2]) / 2 + rand(-disp, disp);
        const my = (pts[i + 1] + pts[i + 3]) / 2 + rand(-disp, disp);
        next.push(mx, my, pts[i + 2], pts[i + 3]);
      }
      pts.length = 0;
      pts.push(...next);
      disp *= 0.5;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = a.color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (chance(0.5)) {
      const r = 26;
      ctx.drawImage(glowSprite(a.color), a.x2 - r, a.y2 - r, r * 2, r * 2);
    }
  }

  clear(): void {
    this.sparks = [];
    this.debris = [];
    this.smoke = [];
    this.rings = [];
    this.arcs = [];
    this.flashes = [];
    this.screws = [];
  }

  get count(): number {
    return this.sparks.length + this.debris.length + this.smoke.length;
  }
}

export const ARC_COLORS = ["#7FF6FF", "#B98CFF", "#FFFFFF", "#8CFF2E"];
export function arcColor(): string {
  return pick(ARC_COLORS);
}
