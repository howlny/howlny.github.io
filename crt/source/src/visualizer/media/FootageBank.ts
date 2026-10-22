import { FOOTAGE_ATLASES } from "./footageManifest";
import { isCanvasSafe } from "./assets";

export interface FootageCell {
  label: string;
  source: string;
  tone: "bright" | "dark";
  motion: "high" | "medium" | "low";
}

export interface FootageAtlas {
  url: string;
  orientation: "landscape" | "portrait";
  duration: number;
  fps: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  cells: FootageCell[];
}

interface Slot {
  atlas: number;
  video: HTMLVideoElement;
  frames: number;
  /** CORS check of the decoded video: unknown until its first frame, then fixed. */
  safe?: boolean;
}

/**
 * Plays the HOWL footage atlases (each video is a grid of shots). Only two decoders run at
 * once: the atlas on screen and the next one, already playing, so a cut is instant.
 */
class FootageBank {
  readonly atlases: FootageAtlas[] = FOOTAGE_ATLASES;
  private slots: Slot[] = [];
  private cur = -1;
  private nxt = -1;
  cell = 0;
  /** Increments whenever the visible video presents a new frame (texture upload gate). */
  serial = 0;
  private offline = false;
  private started = false;
  private portrait = false;

  get available(): boolean {
    return this.atlases.length > 0;
  }

  /** The current atlas video when it has a decodable frame. */
  get video(): HTMLVideoElement | null {
    const s = this.slots.find(sl => sl.atlas === this.cur);
    if (!s || s.video.readyState < 2 || s.video.videoWidth === 0) return null;
    if (s.safe === undefined) {
      s.safe = isCanvasSafe(s.video);
      if (!s.safe) console.warn("[HOWL] footage not CORS-readable; skipping", this.atlases[s.atlas].url);
    }
    return s.safe ? s.video : null;
  }

  get atlas(): FootageAtlas | null {
    return this.cur >= 0 ? this.atlases[this.cur] : null;
  }

  get cellCount(): number {
    const a = this.atlas;
    return a ? a.cols * a.rows : 1;
  }

  /** Begin buffering (safe to call before any user gesture; videos are muted). */
  start(): void {
    if (this.started || !this.available) return;
    this.started = true;
    const pool = this.pool();
    this.cur = pool[Math.floor(Math.random() * pool.length)];
    this.nxt = this.pickOther(this.cur);
    this.ensure(this.cur);
    this.ensure(this.nxt);
  }

  /** Release every decoder (visualizer unmount). A later start() begins buffering again. */
  stop(): void {
    for (const s of [...this.slots]) this.free(s);
    this.slots = [];
    this.started = false;
    this.cur = -1;
    this.nxt = -1;
  }
  /** Re-kick playback from a user gesture (iOS low-power mode blocks muted autoplay). */
  unlock(): void {
    if (!this.started) this.start();
    for (const s of this.slots) if (s.video.paused && !this.offline) void s.video.play().catch(() => undefined);
  }

  /** Prefer atlases shot for the screen's orientation (takes effect at the next atlas switch). */
  prefer(portrait: boolean): void {
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    if (!this.started) return;
    const want = portrait ? "portrait" : "landscape";
    if (this.atlases[this.cur]?.orientation === want && this.atlases[this.nxt]?.orientation === want) return;
    const pool = this.pool();
    const next = pool.find(i => i !== this.cur) ?? pool[0];
    if (next === undefined || next === this.nxt) return;
    const old = this.slots.find(s => s.atlas === this.nxt);
    if (old) this.free(old);
    this.nxt = next;
    this.ensure(next);
  }

  /** Atlas indices matching the preferred orientation (all of them if none match). */
  private pool(): number[] {
    const want = this.portrait ? "portrait" : "landscape";
    const idx = this.atlases.map((a, i) => (a.orientation === want ? i : -1)).filter(i => i >= 0);
    return idx.length ? idx : this.atlases.map((_, i) => i);
  }

  private pickOther(i: number): number {
    const pool = this.pool().filter(j => j !== i);
    if (!pool.length) return i;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private free(slot: Slot): void {
    this.slots = this.slots.filter(s => s !== slot);
    slot.video.pause();
    slot.video.removeAttribute("src");
    slot.video.load();
  }

  private ensure(atlas: number): void {
    if (atlas < 0 || this.slots.some(s => s.atlas === atlas)) return;
    const v = document.createElement("video");
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.disablePictureInPicture = true;
    // Same as images: keeps the video canvas-readable if it is served from another origin.
    v.crossOrigin = "anonymous";
    v.src = this.atlases[atlas].url;
    const slot: Slot = { atlas, video: v, frames: 0 };
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    if (rvfc) {
      const tick = (): void => {
        slot.frames++;
        if (slot.atlas === this.cur) this.serial++;
        if (this.slots.includes(slot)) rvfc.call(v, tick);
      };
      rvfc.call(v, tick);
    } else {
      slot.frames = -1; // unknown: upload every frame
    }
    // Start somewhere different each time so repeated atlases don't line up.
    v.addEventListener(
      "loadedmetadata",
      () => {
        if (!this.offline && Number.isFinite(v.duration) && v.duration > 1) v.currentTime = Math.random() * v.duration * 0.8;
      },
      { once: true },
    );
    if (!this.offline) void v.play().catch(() => undefined);
    this.slots.push(slot);
  }

  /** True when the frame on screen may have changed since `serial` was read. */
  get frameUnknown(): boolean {
    const s = this.slots.find(sl => sl.atlas === this.cur);
    return !!s && s.frames < 0;
  }

  /** Hard cut to another shot inside the current atlas. */
  cutCell(): number {
    const n = this.cellCount;
    if (n > 1) {
      let c = this.cell;
      while (c === this.cell) c = Math.floor(Math.random() * n);
      this.cell = c;
    }
    return this.cell;
  }

  /** Cut to the pre-buffered atlas (if it can show a frame) and start buffering another. */
  switchAtlas(): boolean {
    if (this.atlases.length < 2) return false;
    const next = this.slots.find(s => s.atlas === this.nxt);
    if (!next || next.video.readyState < 2) return false;
    const old = this.cur;
    this.cur = this.nxt;
    this.cell = Math.floor(Math.random() * this.cellCount);
    this.nxt = this.pickOther(this.cur);
    // Free the old decoder.
    const os = this.slots.find(s => s.atlas === old);
    if (os && old !== this.nxt) this.free(os);
    this.ensure(this.nxt);
    this.serial++;
    return true;
  }

  /** Atlas-pixel rectangle of a cell (cover-cropped to the target aspect). */
  cellRect(cell: number, aspect: number): [number, number, number, number] {
    const a = this.atlas;
    const v = this.video;
    if (!a || !v) return [0, 0, 1, 1];
    const cw = v.videoWidth / a.cols;
    const ch = v.videoHeight / a.rows;
    const c = cell % a.cols;
    const r = Math.floor(cell / a.cols) % a.rows;
    let sw = cw;
    let sh = ch;
    if (cw / ch > aspect) sw = ch * aspect;
    else sh = cw / aspect;
    return [c * cw + (cw - sw) / 2, r * ch + (ch - sh) / 2, sw, sh];
  }

  /** Draw a shot into a 2D context, cover-fitted to the rectangle. */
  drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell = this.cell): boolean {
    const v = this.video;
    if (!v || w < 1 || h < 1) return false;
    const [sx, sy, sw, sh] = this.cellRect(cell, w / h);
    ctx.drawImage(v, sx, sy, sw, sh, x, y, w, h);
    return true;
  }

  // ---------- Offline (frame-stepped) rendering ----------

  /** Pause everything; frames are then positioned explicitly with seekTo(). */
  setOffline(on: boolean): void {
    this.offline = on;
    if (on) {
      this.start();
      for (const s of this.slots) s.video.pause();
    }
  }

  /** Wait until the current and next atlases can be seeked. */
  async waitReady(timeoutMs = 15000): Promise<void> {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      const all = this.slots.length > 0 && this.slots.every(s => s.video.readyState >= 2);
      if (all) return;
      await new Promise(r => setTimeout(r, 50));
    }
  }

  /** Position every live decoder at time t (looping) and wait for the frames. */
  async seekTo(t: number): Promise<void> {
    await Promise.all(
      this.slots.map(
        s =>
          new Promise<void>(resolve => {
            const v = s.video;
            const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : this.atlases[s.atlas].duration;
            const target = (t + s.atlas * 1.37) % Math.max(0.5, d - 0.05);
            if (Math.abs(v.currentTime - target) < 0.001 || v.readyState < 1) return resolve();
            const done = (): void => {
              v.removeEventListener("seeked", done);
              clearTimeout(timer);
              resolve();
            };
            const timer = setTimeout(done, 1500);
            v.addEventListener("seeked", done);
            v.currentTime = target;
          }),
      ),
    );
    this.serial++;
  }
}

export const footage = new FootageBank();
