import { FONT_MONO } from "../palette";
import { LOGO_BRUSH_ASPECT, LOGO_BRUSH_URL, LOGO_RING_ASPECT, LOGO_RING_URL, loadImage } from "./assets";

// Layout of the brand texture (white on black). The texture is uploaded flipped,
// so canvas row y maps to v = 1 - y / H.
const W = 2048;
const H = 1280;
const RING_H = Math.round(W / LOGO_RING_ASPECT);
const BRUSH_Y = 560;
const BRUSH_H = Math.round(W / LOGO_BRUSH_ASPECT);
const GLYPH_Y = 1152;
const GLYPH_H = 128;
/** Dark-to-bright glyph ramp for the ASCII footage mode. */
const GLYPHS = " .,:;-~=+*xoX#%@";

export const BRAND_V = {
  ring: [1 - RING_H / H, 1] as [number, number],
  brush: [1 - (BRUSH_Y + BRUSH_H) / H, 1 - BRUSH_Y / H] as [number, number],
  glyph: [0, GLYPH_H / H] as [number, number],
  ringAspect: LOGO_RING_ASPECT,
  brushAspect: LOGO_BRUSH_ASPECT,
};

/** Loaded logo images for 2D drawing (null until loaded). */
export const brandImages: { ring: HTMLImageElement | null; brush: HTMLImageElement | null } = { ring: null, brush: null };

let pending: Promise<HTMLCanvasElement> | null = null;

/** Builds the brand texture once (after fonts are ready). */
export function buildBrandAtlas(): Promise<HTMLCanvasElement> {
  if (pending) return pending;
  pending = (async () => {
    const [ring, brush] = await Promise.all([
      loadImage(LOGO_RING_URL).catch(() => null),
      loadImage(LOGO_BRUSH_URL).catch(() => null),
    ]);
    brandImages.ring = ring;
    brandImages.brush = brush;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    if (ring) g.drawImage(ring, 0, 0, W, RING_H);
    if (brush) g.drawImage(brush, 0, BRUSH_Y, W, BRUSH_H);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 ${Math.round(GLYPH_H * 0.82)}px ${FONT_MONO}`;
    const cw = W / GLYPHS.length;
    for (let i = 0; i < GLYPHS.length; i++) g.fillText(GLYPHS[i], cw * (i + 0.5), GLYPH_Y + GLYPH_H * 0.54);
    return c;
  })();
  return pending;
}
