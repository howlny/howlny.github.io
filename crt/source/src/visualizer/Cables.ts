import { FX } from "./FX";
import { glowSprite } from "./palette";
import { chance, clamp, lerp, noise1, rand } from "./math";
import { randomCableColor } from "./modules/spec";
import type { JackRef, Rack } from "./Rack";
import type { AudioFeatures } from "./types";

type CableState = "live" | "snapped" | "seeking" | "falling";

const STEP = 1 / 60;
const GRAVITY = 1700;

class Cable {
  readonly n: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly px: Float32Array;
  readonly py: Float32Array;
  a: JackRef | null;
  b: JackRef | null;
  readonly color: string;
  readonly width: number;
  segLen: number;
  targetSegLen: number;
  state: CableState = "live";
  timer = 0;
  seekEnd: 0 | 1 = 1;
  seekTo: JackRef | null = null;
  seekFromX = 0;
  seekFromY = 0;
  seekT = 0;
  seekDur = 0.45;
  pulses: { t: number; speed: number; dir: 1 | -1 }[] = [];
  shock = 0;
  dead = false;

  constructor(n: number, segLen: number, color: string, width: number, a: JackRef | null, b: JackRef | null) {
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.segLen = segLen;
    this.targetSegLen = segLen;
    this.color = color;
    this.width = width;
    this.a = a;
    this.b = b;
  }
}

function jackKey(r: JackRef): string {
  return `${r.m.id}:${r.i}`;
}

function refValid(r: JackRef | null): r is JackRef {
  return !!r && r.m.state !== "dead";
}

export class CableSystem {
  cables: Cable[] = [];
  maxSegs = 18;
  maxCables = 50;
  private occupied = new Set<string>();
  private acc = 0;
  onPlug: ((x: number, y: number, color: string) => void) | null = null;

  constructor(
    private readonly rack: Rack,
    private readonly fx: FX,
  ) {}

  clear(): void {
    this.cables = [];
    this.occupied.clear();
  }

  get liveCount(): number {
    let n = 0;
    for (const c of this.cables) if (c.state === "live" || c.state === "seeking") n++;
    return n;
  }

  private freeJacks(): JackRef[] {
    return this.rack.jacks().filter(j => !this.occupied.has(jackKey(j)));
  }

  /** Patch a new cable between two free jacks. With `animate`, one plug is thrown across the rack. */
  spawn(animate: boolean): boolean {
    if (this.cables.length >= this.maxCables) return false;
    const free = this.freeJacks();
    if (free.length < 2) return false;
    const maxD = Math.max(this.rack.W, this.rack.H) * 0.55;
    const minD = this.rack.hpPx * 3;
    for (let attempt = 0; attempt < 14; attempt++) {
      const a = free[Math.floor(Math.random() * free.length)];
      const b = free[Math.floor(Math.random() * free.length)];
      if (a === b || (a.m === b.m && !chance(0.1))) continue;
      const pa = a.m.jackWorld(a.i);
      const pb = b.m.jackWorld(b.i);
      const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (d < minD || d > maxD) continue;
      this.create(a, b, pa.x, pa.y, pb.x, pb.y, d, animate);
      return true;
    }
    return false;
  }

  private create(a: JackRef, b: JackRef, ax: number, ay: number, bx: number, by: number, d: number, animate: boolean): void {
    const rowH = this.rack.rowH;
    const total = d * rand(1.08, 1.45) + rowH * rand(0.25, 0.7);
    const n = Math.round(clamp(total / (rowH * 0.09), 8, this.maxSegs));
    const segLen = total / (n - 1);
    const width = rowH * 0.028 * rand(0.85, 1.25);
    const c = new Cable(n, segLen, randomCableColor(), Math.max(3, width), a, animate ? null : b);
    const sag = Math.sqrt(Math.max(0, total * total - d * d)) * 0.45;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = animate ? ax + rand(-2, 2) : lerp(ax, bx, t);
      const y = animate ? ay + rand(-2, 2) : lerp(ay, by, t) + Math.sin(Math.PI * t) * sag;
      c.x[i] = c.px[i] = x;
      c.y[i] = c.py[i] = y;
    }
    this.occupied.add(jackKey(a));
    this.occupied.add(jackKey(b));
    if (animate) {
      c.state = "seeking";
      c.seekEnd = 1;
      c.seekTo = b;
      c.seekFromX = ax;
      c.seekFromY = ay;
      c.seekT = 0;
      c.seekDur = rand(0.3, 0.6);
    }
    this.cables.push(c);
  }

  private release(r: JackRef | null): void {
    if (r) this.occupied.delete(jackKey(r));
  }

  /** Rip one end of a cable out of its jack. */
  snap(c: Cable, preferEnd?: 0 | 1): void {
    if (c.state !== "live") return;
    let end: 0 | 1 = preferEnd ?? (chance(0.5) ? 0 : 1);
    if (preferEnd === undefined) {
      if (c.a && !c.a.m.attached) end = 0;
      else if (c.b && !c.b.m.attached) end = 1;
    }
    const ref = end === 0 ? c.a : c.b;
    if (!ref) return;
    const idx = end === 0 ? 0 : c.n - 1;
    this.release(ref);
    if (end === 0) c.a = null;
    else c.b = null;
    c.state = "snapped";
    c.seekEnd = end;
    c.timer = rand(1.2, 3.4);
    c.shock = 1;
    c.px[idx] -= rand(-1, 1) * 45;
    c.py[idx] -= rand(15, 50);
    this.fx.sparkBurst(c.x[idx], c.y[idx], 40, 900, 0, -1, Math.PI * 2);
    this.fx.flash(c.x[idx], c.y[idx], this.rack.rowH * 0.5, "#9FF7FF", 0.15);
  }

  snapRandom(): boolean {
    const live = this.cables.filter(c => c.state === "live");
    if (!live.length) return false;
    this.snap(live[Math.floor(Math.random() * live.length)]);
    return true;
  }

  /** Let a cable fall out completely (used when the scene relaxes). */
  drop(c: Cable): void {
    this.release(c.a);
    this.release(c.b);
    c.a = null;
    c.b = null;
    c.state = "falling";
  }

  dropRandom(): void {
    const live = this.cables.filter(c => c.state === "live");
    if (live.length) this.drop(live[Math.floor(Math.random() * live.length)]);
  }

  pulse(count: number): void {
    const live = this.cables.filter(c => c.state === "live");
    for (let i = 0; i < count && live.length; i++) {
      const c = live[Math.floor(Math.random() * live.length)];
      if (c.pulses.length < 3) c.pulses.push({ t: 0, speed: rand(0.9, 2.4), dir: chance(0.5) ? 1 : -1 });
    }
  }

  electrify(amount: number): void {
    for (const c of this.cables) if (chance(amount)) c.shock = Math.max(c.shock, rand(0.5, 1));
  }

  /** Free ends of snapped cables, for arcing. */
  liveEnds(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const c of this.cables) {
      if (c.state !== "snapped") continue;
      const idx = c.seekEnd === 0 ? 0 : c.n - 1;
      out.push({ x: c.x[idx], y: c.y[idx] });
    }
    return out;
  }

  update(dt: number, f: AudioFeatures, chaos: number, time: number): void {
    const H = this.rack.H;
    const kickImpulse = f.kick ? (5 + chaos * 22) * f.beatPulse : 0;
    const wind = noise1(time * 0.7, 9) * (f.mid * 600 + chaos * 350);
    const jitter = f.high * chaos * 1.6;

    for (const c of this.cables) {
      // Invalidate ends attached to destroyed modules.
      if (c.a && !refValid(c.a)) {
        if (c.state === "live") this.snap(c, 0);
        else {
          this.release(c.a);
          c.a = null;
        }
      }
      if (c.b && !refValid(c.b)) {
        if (c.state === "live") this.snap(c, 1);
        else {
          this.release(c.b);
          c.b = null;
        }
      }
      if (c.state === "snapped" && !c.a && !c.b) this.drop(c);

      // Audio forces
      const n = c.n;
      for (let i = 1; i < n - 1; i++) {
        const prof = Math.sin((Math.PI * i) / (n - 1));
        if (kickImpulse) c.py[i] += prof * kickImpulse * rand(0.5, 1.2);
        c.x[i] += wind * prof * dt * dt + (jitter ? rand(-jitter, jitter) : 0);
      }

      c.segLen += (c.targetSegLen - c.segLen) * Math.min(1, dt * 2);
      c.shock = Math.max(0, c.shock - dt * 1.5);

      // State machine
      if (c.state === "snapped") {
        c.timer -= dt;
        const idx = c.seekEnd === 0 ? 0 : n - 1;
        if (chance(0.55)) this.fx.sparkBurst(c.x[idx], c.y[idx], 2, 380, 0, 1, Math.PI * 2);
        if (c.timer <= 0) {
          const free = this.freeJacks();
          if (free.length && chance(0.7)) {
            const target = free[Math.floor(Math.random() * free.length)];
            const tp = target.m.jackWorld(target.i);
            const other = c.seekEnd === 0 ? c.b : c.a;
            const op = other ? other.m.jackWorld(other.i) : { x: c.x[idx], y: c.y[idx] };
            const d = Math.hypot(tp.x - op.x, tp.y - op.y);
            c.targetSegLen = (d * rand(1.08, 1.4) + this.rack.rowH * 0.35) / (n - 1);
            c.seekTo = target;
            c.seekFromX = c.x[idx];
            c.seekFromY = c.y[idx];
            c.seekT = 0;
            c.seekDur = rand(0.35, 0.7);
            c.state = "seeking";
            this.occupied.add(jackKey(target));
          } else {
            this.drop(c);
          }
        }
      } else if (c.state === "seeking") {
        if (!refValid(c.seekTo) || c.seekTo.m.state === "falling") {
          this.release(c.seekTo);
          c.seekTo = null;
          this.drop(c);
        } else {
          c.seekT += dt / c.seekDur;
          if (c.seekT >= 1) {
            if (c.seekEnd === 0) c.a = c.seekTo;
            else c.b = c.seekTo;
            const p = c.seekTo.m.jackWorld(c.seekTo.i);
            c.seekTo = null;
            c.state = "live";
            this.fx.sparkBurst(p.x, p.y, 16, 500, 0, -1, Math.PI * 2);
            this.onPlug?.(p.x, p.y, c.color);
          }
        }
      } else if (c.state === "live" && c.a && c.b) {
        // Over-stretched (module tore away) → rip the plug out.
        const pa = c.a.m.jackWorld(c.a.i);
        const pb = c.b.m.jackWorld(c.b.i);
        const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (d > c.segLen * (n - 1) * 1.6) this.snap(c);
      } else if (c.state === "falling") {
        let allBelow = true;
        for (let i = 0; i < n; i++) if (c.y[i] < H + 60) allBelow = false;
        if (allBelow) c.dead = true;
      }

      for (const p of c.pulses) p.t += p.speed * dt;
      c.pulses = c.pulses.filter(p => p.t < 1);
    }

    // Fixed-step physics
    this.acc = Math.min(this.acc + dt, STEP * 3);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      for (const c of this.cables) this.step(c);
    }
    this.cables = this.cables.filter(c => !c.dead);
  }

  private endTarget(c: Cable, end: 0 | 1): { x: number; y: number } | null {
    const ref = end === 0 ? c.a : c.b;
    if (ref) return ref.m.jackWorld(ref.i);
    if (c.state === "seeking" && c.seekEnd === end && c.seekTo) {
      const tp = c.seekTo.m.jackWorld(c.seekTo.i);
      const t = clamp(c.seekT);
      const e = 1 - Math.pow(1 - t, 3);
      const lift = Math.sin(Math.PI * t) * this.rack.rowH * 0.6;
      return { x: lerp(c.seekFromX, tp.x, e), y: lerp(c.seekFromY, tp.y, e) - lift };
    }
    return null;
  }

  private step(c: Cable): void {
    const n = c.n;
    const g = GRAVITY * STEP * STEP;
    const pa = this.endTarget(c, 0);
    const pb = this.endTarget(c, 1);
    for (let i = 0; i < n; i++) {
      if ((i === 0 && pa) || (i === n - 1 && pb)) continue;
      const vx = (c.x[i] - c.px[i]) * 0.985;
      const vy = (c.y[i] - c.py[i]) * 0.985;
      c.px[i] = c.x[i];
      c.py[i] = c.y[i];
      c.x[i] += vx;
      c.y[i] += vy + g;
    }
    for (let iter = 0; iter < 5; iter++) {
      if (pa) {
        c.x[0] = c.px[0] = pa.x;
        c.y[0] = c.py[0] = pa.y;
      }
      if (pb) {
        c.x[n - 1] = c.px[n - 1] = pb.x;
        c.y[n - 1] = c.py[n - 1] = pb.y;
      }
      for (let i = 0; i < n - 1; i++) {
        const dx = c.x[i + 1] - c.x[i];
        const dy = c.y[i + 1] - c.y[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const diff = (d - c.segLen) / d;
        const pinA = i === 0 && !!pa;
        const pinB = i + 1 === n - 1 && !!pb;
        if (pinA && pinB) continue;
        if (pinA) {
          c.x[i + 1] -= dx * diff;
          c.y[i + 1] -= dy * diff;
        } else if (pinB) {
          c.x[i] += dx * diff;
          c.y[i] += dy * diff;
        } else {
          c.x[i] += dx * diff * 0.5;
          c.y[i] += dy * diff * 0.5;
          c.x[i + 1] -= dx * diff * 0.5;
          c.y[i + 1] -= dy * diff * 0.5;
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const c of this.cables) {
      const n = c.n;
      const path = new Path2D();
      path.moveTo(c.x[0], c.y[0]);
      for (let i = 1; i < n - 1; i++) {
        const mx = (c.x[i] + c.x[i + 1]) / 2;
        const my = (c.y[i] + c.y[i + 1]) / 2;
        path.quadraticCurveTo(c.x[i], c.y[i], mx, my);
      }
      path.lineTo(c.x[n - 1], c.y[n - 1]);

      ctx.save();
      ctx.translate(3, 7);
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineWidth = c.width + 2;
      ctx.stroke(path);
      ctx.restore();

      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.width;
      ctx.stroke(path);

      ctx.save();
      ctx.translate(-c.width * 0.18, -c.width * 0.22);
      ctx.strokeStyle = "rgba(255,255,255,0.33)";
      ctx.lineWidth = c.width * 0.28;
      ctx.stroke(path);
      ctx.restore();

      if (c.shock > 0.02) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = c.shock * 0.45;
        ctx.strokeStyle = c.color;
        ctx.lineWidth = c.width * 3.2;
        ctx.stroke(path);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      this.drawPlug(ctx, c.x[0], c.y[0], c);
      this.drawPlug(ctx, c.x[n - 1], c.y[n - 1], c);
    }

    // Signal pulses travelling down the wires
    ctx.globalCompositeOperation = "lighter";
    for (const c of this.cables) {
      for (const p of c.pulses) {
        const t = p.dir === 1 ? p.t : 1 - p.t;
        const fi = t * (c.n - 1);
        const i = Math.min(c.n - 2, Math.floor(fi));
        const fr = fi - i;
        const x = lerp(c.x[i], c.x[i + 1], fr);
        const y = lerp(c.y[i], c.y[i + 1], fr);
        const r = c.width * 5;
        ctx.drawImage(glowSprite(c.color), x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
  }

  private drawPlug(ctx: CanvasRenderingContext2D, x: number, y: number, c: Cable): void {
    const r = c.width * 1.35;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.arc(x + 2, y + 4, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1c1f";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = r * 0.38;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}
