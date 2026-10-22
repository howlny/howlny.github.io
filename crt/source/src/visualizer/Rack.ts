import { FX } from "./FX";
import { chance, clamp, rand, randInt } from "./math";
import { drawModuleDynamics } from "./modules/draw";
import { photoBank } from "./photo/PhotoBank";
import { drawPhotoDynamics } from "./photo/drawPhoto";
import { clearPhotoCache } from "./photo/photoPanel";
import { RackModule } from "./modules/RackModule";
import { TYPE_HP, randomHp, randomType, type ModuleType } from "./modules/spec";
import type { AudioFeatures } from "./types";

export interface Slot {
  row: number;
  x: number;
  w: number;
  hp: number;
  /** Module currently seated in the slot (null = hole). */
  module: RackModule | null;
  /** Module still physically associated with the slot (e.g. hanging loose from it). */
  occupant: RackModule | null;
  holeTimer: number;
  seed: number;
}

export interface Row {
  y: number;
  h: number;
  offset: number;
  vel: number;
}

export interface JackRef {
  m: RackModule;
  i: number;
}

export class Rack {
  W = 0;
  H = 0;
  rowH = 0;
  hpPx = 0;
  gap = 0;
  panelScale = 1;
  rows: Row[] = [];
  slots: Slot[] = [];
  modules: RackModule[] = [];
  onSlam: ((m: RackModule) => void) | null = null;
  private bg: HTMLCanvasElement | null = null;
  private bgScale = 1;

  constructor(private readonly fx: FX) {}

  layout(W: number, H: number, panelScale: number): void {
    this.W = W;
    this.H = H;
    this.panelScale = panelScale;
    const portrait = H > W;
    const target = clamp(H / (portrait ? 4.2 : 3.6), 150, 330);
    const rowCount = Math.max(2, Math.round(H / target));
    const gap = Math.max(3, H * 0.006);
    const rowH = (H - gap * (rowCount + 1)) / rowCount;
    this.gap = gap;
    this.rowH = rowH;
    this.hpPx = (rowH * 5.08) / 128.5;
    this.rows = [];
    this.slots = [];
    this.modules = [];
    clearPhotoCache();
    const photo = photoBank.ready;

    for (let r = 0; r < rowCount; r++) {
      const y = gap + r * (rowH + gap);
      this.rows.push({ y, h: rowH, offset: 0, vel: 0 });
      let x = -rand(0, 3) * this.hpPx;
      while (x < W) {
        if (chance(0.05)) {
          x += randInt(1, 3) * this.hpPx;
          continue;
        }
        let m: RackModule;
        let hp: number;
        let w: number;
        if (photo) {
          // Real HOWL rack modules, at their photographed proportions.
          const ref = photoBank.pick();
          w = rowH * ref.data.aspect;
          hp = Math.max(2, Math.round(w / this.hpPx));
          m = new RackModule("photo", hp, x, y, w, rowH, r, panelScale, ref);
        } else {
          const type = randomType();
          hp = randomHp(type);
          w = hp * this.hpPx;
          m = new RackModule(type, hp, x, y, w, rowH, r, panelScale);
        }
        this.slots.push({ row: r, x, w, hp, module: m, occupant: m, holeTimer: 0, seed: Math.random() * 100 });
        this.modules.push(m);
        x += w;
      }
    }
    this.bakeBackground();
  }

  private bakeBackground(): void {
    const s = Math.min(this.panelScale, 1.5);
    this.bgScale = s;
    const c = document.createElement("canvas");
    c.width = Math.ceil(this.W * s);
    c.height = Math.ceil(this.H * s);
    const g = c.getContext("2d")!;
    g.scale(s, s);
    // Case interior
    g.fillStyle = "#060607";
    g.fillRect(0, 0, this.W, this.H);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(255,255,255,${rand(0.005, 0.02)})`;
      g.fillRect(rand(0, this.W), rand(0, this.H), rand(1, 3), rand(10, 80));
    }
    const railH = this.rowH * 0.055;
    for (const row of this.rows) {
      // Back-of-case busboard glimpses
      g.fillStyle = "#0c1a10";
      g.fillRect(0, row.y + row.h * 0.35, this.W, row.h * 0.12);
      g.fillStyle = "rgba(255,255,255,0.05)";
      for (let x = rand(0, 60); x < this.W; x += rand(40, 140)) {
        g.fillRect(x, row.y + row.h * 0.37, rand(10, 30), row.h * 0.08);
      }
      for (const ry of [row.y, row.y + row.h - railH]) {
        const rail = photoBank.rail;
        if (rail) {
          // Photographed rail strip, tiled.
          const tw = rail.width * (railH / rail.height) * 2.2;
          for (let x = -rand(0, tw); x < this.W; x += tw) g.drawImage(rail, x, ry - railH * 0.6, tw, railH * 2.2);
          continue;
        }
        const grad = g.createLinearGradient(0, ry, 0, ry + railH);
        grad.addColorStop(0, "#d9dbdf");
        grad.addColorStop(0.45, "#8d9096");
        grad.addColorStop(1, "#3f4247");
        g.fillStyle = grad;
        g.fillRect(0, ry, this.W, railH);
        g.fillStyle = "rgba(0,0,0,0.65)";
        g.fillRect(0, ry + railH * 0.42, this.W, railH * 0.18);
        for (let x = 0; x < this.W; x += this.hpPx) {
          g.beginPath();
          g.arc(x, ry + railH * 0.5, railH * 0.16, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    this.bg = c;
  }

  slotOf(m: RackModule): Slot | undefined {
    return this.slots.find(s => s.occupant === m || s.module === m);
  }

  private openHole(slot: Slot, chaos: number): void {
    slot.module = null;
    // Calm music rebuilds fast; a meltdown leaves the rack gutted for a while.
    slot.holeTimer = rand(2, 5) * (0.6 + chaos * 1.1);
  }

  loosen(m: RackModule, chaos: number, wx?: number, wy?: number): boolean {
    if (!m.attached) return false;
    const slot = this.slotOf(m);
    const local = wx !== undefined && wy !== undefined ? m.worldToLocal(wx, wy) : undefined;
    m.loosen(rand(2, 5), local?.x, local?.y);
    if (slot) this.openHole(slot, chaos);
    const p = m.localToWorld(m.w / 2, 0);
    this.fx.sparkBurst(p.x, p.y, 30, 700, 0, -1, Math.PI * 1.6);
    this.fx.flash(p.x, p.y, this.rowH * 0.5, "#FFB36B", 0.18);
    return true;
  }

  explode(m: RackModule, chaos: number, power = 1): void {
    if (!m.present) return;
    const c = m.localToWorld(m.w / 2, m.h / 2);
    const ox = c.x + rand(-m.w * 0.3, m.w * 0.3);
    const oy = c.y + rand(-m.h * 0.3, m.h * 0.3);
    this.fx.shatter(m, ox, oy, power);
    this.fx.sparkBurst(c.x, c.y, Math.round(80 * power), 1100 * power, 0, -1, Math.PI * 2);
    this.fx.smokePuff(c.x, c.y, 6, this.rowH * 0.22);
    this.fx.ring(c.x, c.y, "#FF5A1F", 1200 * power);
    this.fx.ring(c.x, c.y, "#FFFFFF", 700 * power);
    this.fx.flash(c.x, c.y, this.rowH * 1.4 * power, "#FFB36B", 0.35);
    const slot = this.slotOf(m);
    if (slot) {
      if (slot.module === m) this.openHole(slot, chaos);
      slot.occupant = null;
    }
    m.kill();
    // Heat up neighbours: chain reactions are a feature.
    for (const n of this.modules) {
      if (n === m || !n.present) continue;
      const nc = n.localToWorld(n.w / 2, n.h / 2);
      const d = Math.hypot(nc.x - c.x, nc.y - c.y);
      if (d < this.rowH * 1.3) {
        n.heat = Math.min(1, n.heat + 0.6);
        n.jitterX += rand(-12, 12);
        n.jitterY += rand(-12, 12);
        if (n.attached) n.addCracks(rand(0, n.w), rand(0, n.h));
      }
    }
  }

  moduleAt(x: number, y: number): RackModule | undefined {
    for (let i = this.modules.length - 1; i >= 0; i--) {
      const m = this.modules[i];
      if (m.present && m.state !== "falling" && m.contains(x, y)) return m;
    }
    return undefined;
  }

  randomModule(filter: (m: RackModule) => boolean): RackModule | undefined {
    const list = this.modules.filter(filter);
    return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
  }

  get destroyedCount(): number {
    return this.slots.filter(s => !s.module).length;
  }

  get attachedCount(): number {
    return this.slots.filter(s => s.module?.attached).length;
  }

  jacks(): JackRef[] {
    const out: JackRef[] = [];
    for (const m of this.modules) {
      if (m.state === "dead" || m.state === "falling" || m.state === "dropping") continue;
      for (let i = 0; i < m.spec.jacks.length; i++) out.push({ m, i });
    }
    return out;
  }

  private spawnInto(slot: Slot): void {
    const row = this.rows[slot.row];
    let m: RackModule;
    if (photoBank.ready) {
      const ref = photoBank.closest(slot.w / this.rowH);
      m = new RackModule("photo", slot.hp, slot.x, row.y, slot.w, this.rowH, slot.row, this.panelScale, ref);
    } else {
      const type: ModuleType = randomType(slot.hp);
      const hp = TYPE_HP[type][0] <= slot.hp ? slot.hp : Math.max(2, slot.hp);
      m = new RackModule(type, hp, slot.x, row.y, slot.w, this.rowH, slot.row, this.panelScale);
    }
    m.startDrop(row.y + this.rowH + rand(20, 260));
    slot.module = m;
    slot.occupant = m;
    this.modules.push(m);
  }

  update(dt: number, f: AudioFeatures, chaos: number, time: number): void {
    for (const row of this.rows) {
      const acc = -140 * row.offset - 9 * row.vel;
      row.vel += acc * dt;
      row.offset += row.vel * dt;
    }
    if (f.kick && chaos > 0.55 && chance(0.25 * chaos)) {
      const row = this.rows[Math.floor(Math.random() * this.rows.length)];
      row.vel += rand(-1, 1) * 350 * chaos;
    }

    for (const m of this.modules) {
      m.rowOffset = m.attached ? this.rows[m.row]?.offset ?? 0 : 0;
      const slammed = m.update(dt, f, chaos, time, this.H);
      if (slammed) this.onSlam?.(m);
      if (m.state === "loose" && m.looseTimer <= 0) {
        m.release();
        const slot = this.slotOf(m);
        if (slot && slot.occupant === m) slot.occupant = null;
      }
    }
    this.modules = this.modules.filter(m => m.state !== "dead");

    for (const slot of this.slots) {
      if (slot.occupant && (slot.occupant.state === "dead" || slot.occupant.state === "falling")) slot.occupant = null;
      if (slot.module) continue;
      slot.holeTimer -= dt * (chaos > 0.8 ? 0.45 : 1);
      if (slot.holeTimer <= 0 && !slot.occupant) {
        this.spawnInto(slot);
        continue;
      }
      // Live wiring inside the hole spits sparks.
      if (chance(dt * (0.6 + chaos * 4 + f.beatPulse * 3))) {
        const row = this.rows[slot.row];
        const x = slot.x + slot.w * rand(0.15, 0.85);
        const y = row.y + this.rowH * rand(0.4, 0.85);
        this.fx.sparkBurst(x, y, randInt(4, 14), 450, 0, -1, Math.PI * 1.4);
        if (chance(0.25 + chaos * 0.4)) {
          this.fx.arc(slot.x + slot.w * rand(0, 1), row.y + this.rowH * rand(0.1, 0.4), x, y, "#7FF6FF");
        }
      }
    }
  }

  drawBackground(ctx: CanvasRenderingContext2D): void {
    if (this.bg) ctx.drawImage(this.bg, 0, 0, this.W, this.H);
    void this.bgScale;
  }

  drawHoles(ctx: CanvasRenderingContext2D, f: AudioFeatures, time: number): void {
    for (const slot of this.slots) {
      if (slot.module) continue;
      const row = this.rows[slot.row];
      const x = slot.x;
      const y = row.y;
      const w = slot.w;
      const h = this.rowH;
      // Cavity
      ctx.fillStyle = "#020202";
      ctx.fillRect(x, y + h * 0.055, w, h * 0.89);
      // Exposed PCB
      ctx.fillStyle = "#0b3a1c";
      ctx.fillRect(x + w * 0.1, y + h * 0.2, w * 0.8, h * 0.62);
      ctx.fillStyle = "#14532a";
      for (let i = 0; i < 5; i++) {
        const py = y + h * (0.25 + i * 0.11);
        ctx.fillRect(x + w * 0.12, py, w * 0.76, 1);
      }
      ctx.fillStyle = "#111";
      ctx.fillRect(x + w * 0.25, y + h * 0.35, w * 0.3, h * 0.08);
      ctx.fillRect(x + w * 0.45, y + h * 0.58, w * 0.35, h * 0.06);
      // Burn glow
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,80,20,${0.08 + f.beatPulse * 0.2 + Math.random() * 0.06})`;
      ctx.fillRect(x, y + h * 0.055, w, h * 0.89);
      ctx.globalCompositeOperation = "source-over";
      // Dangling ribbon cable
      const rw = Math.min(w * 0.45, this.hpPx * 4);
      const sx = x + w * 0.3;
      const sy = y + h * 0.12;
      const sway = Math.sin(time * 2.2 + slot.seed) * w * 0.25 + f.bass * w * 0.2 * Math.sin(time * 9 + slot.seed);
      const ex = sx + sway;
      const ey = y + h * (0.7 + 0.05 * Math.sin(time * 1.3 + slot.seed));
      ctx.lineCap = "butt";
      ctx.strokeStyle = "#8f9092";
      ctx.lineWidth = rw;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx - sway * 0.3, (sy + ey) / 2, ex, ey);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = rw * 0.08;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + (i * rw) / 5, sy);
        ctx.quadraticCurveTo(sx - sway * 0.3 + (i * rw) / 5, (sy + ey) / 2, ex + (i * rw) / 5, ey);
        ctx.stroke();
      }
      ctx.strokeStyle = "#C21E1E";
      ctx.lineWidth = rw * 0.12;
      ctx.beginPath();
      ctx.moveTo(sx - rw * 0.44, sy);
      ctx.quadraticCurveTo(sx - sway * 0.3 - rw * 0.44, (sy + ey) / 2, ex - rw * 0.44, ey);
      ctx.stroke();
      ctx.fillStyle = "#121212";
      ctx.fillRect(ex - rw * 0.6, ey, rw * 1.2, Math.max(4, rw * 0.5));
    }
  }

  drawModules(ctx: CanvasRenderingContext2D, f: AudioFeatures, chaos: number, time: number): void {
    // Seated modules first, then everything that has broken free on top.
    for (const m of this.modules) if (m.state === "alive") this.drawModule(ctx, m, f, chaos, time);
    for (const m of this.modules) if (m.state === "dropping") this.drawModule(ctx, m, f, chaos, time);
    for (const m of this.modules) if (m.state === "loose") this.drawModule(ctx, m, f, chaos, time);
    for (const m of this.modules) if (m.state === "falling") this.drawModule(ctx, m, f, chaos, time);
  }

  private drawModule(ctx: CanvasRenderingContext2D, m: RackModule, f: AudioFeatures, chaos: number, time: number): void {
    const diag = m.w + m.h;
    if (m.ay - diag > this.H || m.ay + diag < 0) return;
    ctx.save();
    ctx.translate(m.ax, m.ay);
    if (m.angle) ctx.rotate(m.angle);
    ctx.translate(-m.alx, -m.aly);
    if (!m.attached || m.state === "dropping") {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(8, 12, m.w, m.h);
    }
    ctx.drawImage(m.panel, 0, 0, m.w, m.h);
    if (m.photo) {
      drawPhotoDynamics(ctx, m, f, chaos, time);
      this.drawDamage(ctx, m, f);
    } else drawModuleDynamics(ctx, m, f, chaos, time);
    ctx.restore();
  }

  /** Cracks and heat glow for photographed modules (procedural ones draw their own). */
  private drawDamage(ctx: CanvasRenderingContext2D, m: RackModule, f: AudioFeatures): void {
    for (const c of m.cracks) {
      ctx.beginPath();
      ctx.moveTo(c.pts[0], c.pts[1]);
      for (let i = 2; i < c.pts.length; i += 2) ctx.lineTo(c.pts[i], c.pts[i + 1]);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    if (m.heat > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,70,20,${m.heat * (0.12 + f.beatPulse * 0.15)})`;
      ctx.fillRect(0, 0, m.w, m.h);
      ctx.globalCompositeOperation = "source-over";
    }
  }
}
