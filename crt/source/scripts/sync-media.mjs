// Mirrors ../media (the site's media folder, which GitHub Pages serves) into public/media so the
// Vite dev server and builds can use the same files without keeping two copies in the repo.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "..", "media");
const to = join(here, "..", "public", "media");

if (!existsSync(from)) {
  console.error(`[sync-media] missing ${from}: keep this project inside the site folder.`);
  process.exit(1);
}
mkdirSync(to, { recursive: true });
let copied = 0;
for (const name of readdirSync(from)) {
  const src = join(from, name);
  const dst = join(to, name);
  const s = statSync(src);
  if (!s.isFile()) continue;
  if (existsSync(dst)) {
    const d = statSync(dst);
    if (d.size === s.size && d.mtimeMs >= s.mtimeMs) continue;
  }
  copyFileSync(src, dst);
  copied++;
}
console.log(`[sync-media] ${copied} file(s) updated in public/media`);
