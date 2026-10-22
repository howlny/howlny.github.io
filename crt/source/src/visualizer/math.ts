export const TAU = Math.PI * 2;

export function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential approach factor. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function rand(lo = 0, hi = 1): number {
  return lo + Math.random() * (hi - lo);
}

export function randInt(lo: number, hi: number): number {
  return Math.floor(rand(lo, hi + 1));
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function weightedPick<T>(items: readonly { item: T; weight: number }[]): T {
  let total = 0;
  for (const it of items) total += it.weight;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.item;
  }
  return items[items.length - 1].item;
}

/** Cheap 1D value noise in -1..1, smooth enough for camera shake. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i + seed * 57.13);
  const b = hash1(i + 1 + seed * 57.13);
  const t = f * f * (3 - 2 * f);
  return (a + (b - a) * t) * 2 - 1;
}

function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Rotate a local point around an origin and translate it. */
export function transformPoint(
  lx: number,
  ly: number,
  originX: number,
  originY: number,
  angle: number,
): Vec2 {
  if (angle === 0) return { x: originX + lx, y: originY + ly };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: originX + lx * c - ly * s, y: originY + lx * s + ly * c };
}
