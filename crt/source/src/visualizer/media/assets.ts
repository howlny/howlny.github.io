/** HOWL brand and rack media, served from the site's own media/ folder. */
export const RAIL_URL = "media/howl-rail.webp";
/** Official HOWL concentric-ring wordmark (white, 3000×810). */
export const LOGO_RING_URL = "media/howl-logo-ring.svg";
export const LOGO_RING_ASPECT = 3000 / 810;
/** Brush-cut HOWL wordmark from the campaign artwork (white, 3453×984). */
export const LOGO_BRUSH_URL = "media/howl-logo-brush.svg";
export const LOGO_BRUSH_ASPECT = 3453 / 984;
/** HOWL crosshair-rings mark (180×180). */
export const MARK_URL = "media/howl-mark.png";

let probe: CanvasRenderingContext2D | null = null;
/**
 * True when drawing `src` leaves a canvas readable. If media is ever moved to another origin,
 * anything that would taint the scene canvas must never reach it, or WebGL refuses every later
 * upload of that canvas.
 */
export function isCanvasSafe(src: CanvasImageSource): boolean {
  try {
    if (!probe) {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      probe = c.getContext("2d", { willReadFrequently: true });
    }
    if (!probe) return false;
    probe.clearRect(0, 0, 1, 1);
    probe.drawImage(src, 0, 0, 1, 1);
    probe.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Harmless for same-origin files; required if media is served from another origin with CORS.
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const done = (): void => {
      if (isCanvasSafe(img)) resolve(img);
      else reject(new Error(`image not CORS-readable: ${url}`));
    };
    img.onload = () => {
      // decode() keeps the first draw from stalling a frame.
      if (img.decode) img.decode().then(done, done);
      else done();
    };
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}
