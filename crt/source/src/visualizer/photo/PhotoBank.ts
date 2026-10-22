import { RAIL_URL, loadImage } from "../media/assets";
import { RACK_STRIPS } from "./manifest";
import type { PhotoRef } from "./types";

/** Loads the photographed rack strips and hands out modules cut from them. */
class PhotoBank {
  refs: PhotoRef[] = [];
  rail: HTMLImageElement | null = null;
  ready = false;
  private loading: Promise<void> | null = null;
  private recent: number[] = [];
  private readyCbs: (() => void)[] = [];

  load(): Promise<void> {
    if (this.loading) return this.loading;
    let id = 0;
    const strips = RACK_STRIPS.map(async s => {
      const img = await loadImage(s.url);
      for (const data of s.modules) this.refs.push({ id: id++, img, stripH: s.height, data });
    });
    const rail = loadImage(RAIL_URL).then(
      img => {
        this.rail = img;
      },
      () => undefined,
    );
    this.loading = Promise.allSettled([...strips, rail]).then(() => {
      // Stable order regardless of which strip arrived first.
      this.refs.sort((a, b) => a.id - b.id);
      this.ready = this.refs.length > 0;
      if (this.ready) for (const cb of this.readyCbs.splice(0)) cb();
    });
    return this.loading;
  }

  onReady(cb: () => void): void {
    if (this.ready) cb();
    else this.readyCbs.push(cb);
  }

  /** A random module, avoiding the last few picks so neighbours rarely repeat. */
  pick(): PhotoRef {
    const n = this.refs.length;
    let r = this.refs[Math.floor(Math.random() * n)];
    for (let k = 0; k < 6 && this.recent.includes(r.id); k++) r = this.refs[Math.floor(Math.random() * n)];
    this.remember(r.id);
    return r;
  }

  /** One of the modules whose proportions best fit a slot (it is stretched to fit exactly). */
  closest(aspect: number): PhotoRef {
    const sorted = [...this.refs].sort((a, b) => Math.abs(a.data.aspect - aspect) - Math.abs(b.data.aspect - aspect));
    const pool = sorted.slice(0, 4).filter(r => Math.abs(r.data.aspect - aspect) / aspect < 0.18);
    const list = pool.length ? pool : sorted.slice(0, 1);
    const fresh = list.filter(r => !this.recent.includes(r.id));
    const r = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length || list.length))];
    this.remember(r.id);
    return r;
  }

  private remember(id: number): void {
    this.recent.push(id);
    if (this.recent.length > 8) this.recent.shift();
  }
}

export const photoBank = new PhotoBank();
