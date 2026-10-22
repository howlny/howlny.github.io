// Copies a fresh build (dist/) into the site root one level up, which is what GitHub Pages serves.
// The media folder is left alone: the root media/ is already the source of truth.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const site = join(here, "..", "..");

if (!existsSync(join(dist, "index.html"))) {
  console.error("[publish-site] dist/index.html not found: run `npm run build` first.");
  process.exit(1);
}
rmSync(join(site, "assets"), { recursive: true, force: true });
cpSync(join(dist, "assets"), join(site, "assets"), { recursive: true });
for (const f of ["index.html", "favicon.png", "apple-touch-icon.png"]) {
  cpSync(join(dist, f), join(site, f));
}
console.log("[publish-site] site root updated: commit and push to deploy.");
