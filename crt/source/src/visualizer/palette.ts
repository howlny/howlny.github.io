/** HOWL palette: signal green on near-black, with hazard orange kept for sparks and heat. */
export const HAZARD = "#FF5A1F";

export const CABLE_COLORS = [
  "#FF5A1F", // hazard orange
  "#FF2E3A", // signal red
  "#FFD400", // gate yellow
  "#00E5FF", // cv cyan
  "#FF2BD6", // audio magenta
  "#8CFF2E", // clock lime
  "#F2F2EE", // white
  "#2F6BFF", // patch blue
  "#FF5A1F",
  "#FFD400",
];

export const LED_COLORS = {
  red: "#FF2E3A",
  orange: "#FF5A1F",
  yellow: "#FFD400",
  green: "#8CFF2E",
  cyan: "#00E5FF",
  white: "#FFFFFF",
  magenta: "#FF2BD6",
} as const;

export type LedColor = keyof typeof LED_COLORS;

export interface PanelTheme {
  name: string;
  base: string;
  base2: string;
  ink: string;
  inkDim: string;
  accent: string;
  brushed: boolean;
}

export const PANEL_THEMES: { item: PanelTheme; weight: number }[] = [
  {
    item: { name: "black", base: "#17191D", base2: "#0F1013", ink: "#E9E7E1", inkDim: "#8A8C90", accent: HAZARD, brushed: true },
    weight: 5,
  },
  {
    item: { name: "alu", base: "#C9CCD1", base2: "#9DA1A8", ink: "#141518", inkDim: "#4A4D52", accent: "#D7261E", brushed: true },
    weight: 4,
  },
  {
    item: { name: "gunmetal", base: "#3A3E45", base2: "#25282D", ink: "#F0EEE8", inkDim: "#9EA2A8", accent: "#FFD400", brushed: true },
    weight: 3,
  },
  {
    item: { name: "bone", base: "#E7E3D8", base2: "#CFCABD", ink: "#1A1A1A", inkDim: "#6B675E", accent: HAZARD, brushed: false },
    weight: 2,
  },
  {
    item: { name: "hazard", base: "#FF5A1F", base2: "#D9440F", ink: "#0B0C0E", inkDim: "#5A1F07", accent: "#0B0C0E", brushed: false },
    weight: 1.2,
  },
  {
    item: { name: "olive", base: "#3D4233", base2: "#2A2E22", ink: "#E8E4C9", inkDim: "#9A9877", accent: "#FFD400", brushed: false },
    weight: 1.5,
  },
  {
    item: { name: "oxide", base: "#8E1B1B", base2: "#5E1010", ink: "#F4EDE4", inkDim: "#C79A93", accent: "#FFD400", brushed: false },
    weight: 0.8,
  },
];

const glowCache = new Map<string, HTMLCanvasElement>();

/** Soft radial glow sprite (64×64) used with additive blending. */
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.12, color);
  grad.addColorStop(0.4, hexToRgba(color, 0.35));
  grad.addColorStop(1, hexToRgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

let smoke: HTMLCanvasElement | null = null;

export function smokeSprite(): HTMLCanvasElement {
  if (smoke) return smoke;
  smoke = document.createElement("canvas");
  smoke.width = smoke.height = 64;
  const g = smoke.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(60,58,55,0.55)");
  grad.addColorStop(0.5, "rgba(40,38,36,0.25)");
  grad.addColorStop(1, "rgba(20,20,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return smoke;
}

export function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(ch => ch + ch).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// HOWL type system (howlny.com): Bebas Neue headlines, IBM Plex Mono labels, Space Grotesk body.
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';
export const FONT_STENCIL = '"Bebas Neue", "Arial Narrow", Impact, sans-serif';
export const FONT_BODY = '"Space Grotesk", system-ui, sans-serif';
export const FONT_VCR = '"VT323", "IBM Plex Mono", ui-monospace, monospace';
/** HOWL signal green and its near-black ground. */
export const SIGNAL = "#0AFF99";
export const GROUND = "#050A08";
