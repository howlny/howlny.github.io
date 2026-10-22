import { chance, clamp, damp, rand, randInt, transformPoint, type Vec2 } from "../math";
import type { AudioFeatures } from "../types";
import { bakePanel } from "./bake";
import { bakePhoto, buildPhotoSpec } from "../photo/photoPanel";
import type { PhotoRef } from "../photo/types";
import { buildSpec, type ModuleSpec, type ModuleType } from "./spec";

export type ModuleState = "dropping" | "alive" | "loose" | "falling" | "dead";

export interface Crack {
  pts: number[];
}

let nextId = 1;

export class RackModule {
  readonly id = nextId++;
  readonly spec: ModuleSpec;
  readonly panel: HTMLCanvasElement;
  readonly panelScale: number;
  /** Set for photographed HOWL modules. */
  readonly photo: PhotoRef | null;
  /** Lit-light layer for photographed modules (LEDs, pads, buttons as photographed). */
  readonly photoLit: HTMLCanvasElement | null = null;
  /** Per-instance darkening so repeats of the same photo read differently. */
  readonly shade: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly row: number;

  state: ModuleState = "alive";

  // World transform: world = anchor + R(angle) · (local - localAnchor)
  ax = 0;
  ay = 0;
  alx = 0;
  aly = 0;
  angle = 0;

  // Loose pendulum
  private pivotX = 0;
  private pivotY = 0;
  private restAngle = 0;
  private pivotLen = 1;
  angVel = 0;
  looseTimer = 0;

  // Falling
  vx = 0;
  vy = 0;
  spinVel = 0;

  // Dropping in
  dropY = 0;
  private dropVel = 0;
  landed = false;

  jitterX = 0;
  jitterY = 0;
  rowOffset = 0;
  heat = 0;
  cracks: Crack[] = [];

  // Display state
  seqStep = 0;
  lfoPhase = Math.random() * 10;
  radarAngle = Math.random() * 6;
  blips: { x: number; y: number; life: number }[] = [];
  envT = 10;
  blink = 0;
  beatCount = 0;
  private sinceStep = 0;

  constructor(
    type: ModuleType,
    hp: number,
    x: number,
    y: number,
    w: number,
    h: number,
    row: number,
    panelScale: number,
    photo: PhotoRef | null = null,
  ) {
    this.panelScale = panelScale;
    this.photo = photo;
    this.shade = photo ? Math.random() * Math.random() * 0.22 : 0;
    if (photo) {
      this.spec = buildPhotoSpec(photo, w, h);
      const baked = bakePhoto(photo, this.spec, w, h, panelScale);
      this.panel = baked.panel;
      this.photoLit = baked.lit;
    } else {
      this.spec = buildSpec(type, hp, w, h);
      this.panel = bakePanel(this.spec, w, h, panelScale);
    }
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.row = row;
    this.syncTransform();
  }

  get attached(): boolean {
    return this.state === "alive" || this.state === "dropping";
  }

  get present(): boolean {
    return this.state !== "dead";
  }

  startDrop(height: number): void {
    this.state = "dropping";
    this.dropY = -height;
    this.dropVel = rand(200, 600);
    this.landed = false;
  }

  /** Knock the module off one screw so it swings like a pendulum. */
  loosen(impulse: number, impactLx?: number, impactLy?: number): void {
    if (this.state !== "alive" && this.state !== "dropping") return;
    this.addCracks(impactLx ?? rand(0, this.w), impactLy ?? rand(0, this.h));
    const screws = this.spec.screws.filter(s => s.y < this.h / 2);
    const leftScrew = screws.reduce((a, b) => (a.x < b.x ? a : b), screws[0]);
    const rightScrew = screws.reduce((a, b) => (a.x > b.x ? a : b), screws[0]);
    const pivot = screws.length > 1 && chance(0.5) ? rightScrew : leftScrew;
    this.pivotX = pivot.x;
    this.pivotY = pivot.y;
    const dx = this.w / 2 - pivot.x;
    const dy = this.h / 2 - pivot.y;
    this.pivotLen = Math.max(20, Math.hypot(dx, dy));
    this.restAngle = Math.PI / 2 - Math.atan2(dy, dx);
    this.angle = 0;
    this.angVel = (this.restAngle >= 0 ? 1 : -1) * impulse;
    this.state = "loose";
    this.looseTimer = rand(3.5, 9);
    this.dropY = 0;
    this.heat = Math.min(1, this.heat + 0.5);
  }

  /** Detach completely and tumble off screen. */
  release(): void {
    if (this.state === "falling" || this.state === "dead") return;
    const com = this.localToWorld(this.w / 2, this.h / 2);
    if (this.state === "loose") {
      const rx = com.x - this.ax;
      const ry = com.y - this.ay;
      this.vx = -this.angVel * ry + rand(-60, 60);
      this.vy = this.angVel * rx - rand(50, 250);
      this.spinVel = this.angVel * 0.6;
    } else {
      this.vx = rand(-200, 200);
      this.vy = rand(-500, -150);
      this.spinVel = rand(-4, 4);
    }
    this.ax = com.x;
    this.ay = com.y;
    this.alx = this.w / 2;
    this.aly = this.h / 2;
    this.state = "falling";
  }

  kill(): void {
    this.state = "dead";
  }

  addCracks(lx: number, ly: number): void {
    if (this.cracks.length > 6) return;
    const branches = randInt(2, 4);
    for (let b = 0; b < branches; b++) {
      const pts = [lx, ly];
      let x = lx;
      let y = ly;
      let a = rand(0, Math.PI * 2);
      const segs = randInt(3, 6);
      for (let i = 0; i < segs; i++) {
        a += rand(-0.7, 0.7);
        const len = rand(this.w * 0.08, this.w * 0.25);
        x = clamp(x + Math.cos(a) * len, 0, this.w);
        y = clamp(y + Math.sin(a) * len, 0, this.h);
        pts.push(x, y);
      }
      this.cracks.push({ pts });
    }
  }

  localToWorld(lx: number, ly: number): Vec2 {
    return transformPoint(lx - this.alx, ly - this.aly, this.ax, this.ay, this.angle);
  }

  worldToLocal(wx: number, wy: number): Vec2 {
    const dx = wx - this.ax;
    const dy = wy - this.ay;
    const c = Math.cos(-this.angle);
    const s = Math.sin(-this.angle);
    return { x: dx * c - dy * s + this.alx, y: dx * s + dy * c + this.aly };
  }

  contains(wx: number, wy: number): boolean {
    const p = this.worldToLocal(wx, wy);
    return p.x >= 0 && p.y >= 0 && p.x <= this.w && p.y <= this.h;
  }

  jackWorld(i: number): Vec2 {
    const j = this.spec.jacks[i];
    return this.localToWorld(j.x, j.y);
  }

  private syncTransform(): void {
    if (this.state === "alive" || this.state === "dropping") {
      this.ax = this.x + this.jitterX + this.rowOffset;
      this.ay = this.y + this.jitterY + this.dropY;
      this.alx = 0;
      this.aly = 0;
      this.angle = 0;
    } else if (this.state === "loose") {
      this.ax = this.x + this.pivotX + this.jitterX * 0.3;
      this.ay = this.y + this.pivotY + this.jitterY * 0.3;
      this.alx = this.pivotX;
      this.aly = this.pivotY;
    }
  }

  /** Returns true on the frame a dropping module slams into the rails. */
  update(dt: number, f: AudioFeatures, chaos: number, time: number, screenH: number): boolean {
    let slammed = false;
    const spec = this.spec;

    // Physical state
    if (this.state === "dropping") {
      this.dropVel += 3200 * dt;
      this.dropY += this.dropVel * dt;
      if (this.dropY >= 0) {
        this.dropY = 0;
        if (!this.landed) {
          slammed = true;
          this.landed = true;
        }
        if (this.dropVel > 350) this.dropVel = -this.dropVel * 0.18;
        else {
          this.dropVel = 0;
          this.state = "alive";
        }
      }
    } else if (this.state === "loose") {
      const k = 2400 / this.pivotLen;
      this.angVel += -k * Math.sin(this.angle - this.restAngle) * dt;
      this.angVel *= Math.exp(-dt * 0.9);
      if (f.kick) this.angVel += rand(-1, 1) * (1.5 + chaos * 4) * f.beatPulse;
      this.angle += this.angVel * dt;
      this.looseTimer -= dt * (0.6 + chaos);
    } else if (this.state === "falling") {
      this.vy += 2600 * dt;
      this.ax += this.vx * dt;
      this.ay += this.vy * dt;
      this.angle += this.spinVel * dt;
      if (this.ay - Math.max(this.w, this.h) > screenH + 40) this.kill();
    }

    // Jitter from the music (attached modules rattle in their rails)
    const rattle = (f.beatPulse * 1.6 + f.high * 0.6) * (0.25 + chaos * 1.6);
    this.jitterX += (rand(-1, 1) * rattle - this.jitterX) * damp(30, dt);
    this.jitterY += (rand(-1, 1) * rattle - this.jitterY) * damp(30, dt);
    this.syncTransform();

    this.heat = Math.max(0, this.heat - dt * 0.08);

    // Controls follow the bands
    for (const k of spec.knobs) {
      const target = clamp(k.offset + f.bands[k.band] * k.range);
      k.value += (target - k.value) * damp(14, dt);
      if (f.onset && chaos > 0.45 && chance(0.12 * chaos)) k.spin += rand(-1, 1) * 9 * chaos;
      k.spin *= Math.exp(-dt * 3);
    }
    for (const fd of spec.faders) {
      fd.value += (f.bands[fd.band] - fd.value) * damp(f.bands[fd.band] > fd.value ? 30 : 8, dt);
    }
    this.blink += dt * (f.bpm > 0 ? f.bpm / 60 : 2);
    for (const l of spec.leds) {
      let v = 0;
      switch (l.mode) {
        case "beat":
          v = f.beatPulse;
          break;
        case "hat":
          v = f.hat ? 1 : l.value * Math.exp(-dt * 14);
          break;
        case "onset":
          v = f.hitPulse;
          break;
        case "band":
          v = f.bands[l.band];
          break;
        case "blink":
          v = Math.floor(this.blink * 2 + l.band) % 2 === 0 ? 0.9 : 0.05;
          break;
        case "ladder":
          v = f.bands[l.band] * 1.25 > (l.rank ?? 0) ? 1 : 0.02;
          break;
      }
      l.value = v;
    }

    // Sequencer steps on kicks (or keeps walking if the music has no clear kick)
    this.sinceStep += dt;
    if (spec.steps.length) {
      if (f.kick || (this.sinceStep > 0.45 && f.level > 0.15)) {
        this.seqStep = (this.seqStep + 1) % spec.steps.length;
        this.sinceStep = 0;
      }
    }
    if (f.kick) this.beatCount = (this.beatCount + 1) % 1000;

    this.lfoPhase += dt * (1 + f.mid * 8 + chaos * 6);
    this.radarAngle += dt * (1.4 + chaos * 4 + f.beatPulse * 3);
    if (spec.type === "radar" && f.onset) {
      const r = spec.screen ? spec.screen.w / 2 : 10;
      const a = rand(0, Math.PI * 2);
      const d = rand(0.15, 0.95) * r;
      this.blips.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, life: 1 });
    }
    for (const b of this.blips) b.life -= dt * 0.8;
    this.blips = this.blips.filter(b => b.life > 0);
    this.envT = f.onset ? 0 : this.envT + dt;
    void time;
    return slammed;
  }
}
