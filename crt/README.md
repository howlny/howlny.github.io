# HOWL — Signal Visualizer

A full-screen, microphone-reactive visualizer. Open the mic and the music cuts HOWL footage, fries the CRT/VHS tape and blows a photoreal Eurorack rack apart in real time. A built-in 60-second techno test record ("Test transmission") lets you try it without any music playing.

This folder is a complete static website. Everything it needs (code, fonts, footage, rack photos, logos) is stored locally in this folder; it makes no requests to any CDN, font service or third-party server.

## Deploy to GitHub Pages

1. Create a new repository on GitHub (public, or private on a plan that supports Pages).
2. Upload **the contents of this folder** to the root of the repository, keeping the folder structure (`index.html`, `assets/`, `media/`, `source/`, `.nojekyll`, …). Every file is under 5 MB, so the GitHub web uploader works; `git push` works too. The web uploader accepts at most 100 files per upload, so drag in everything except `source/` first, commit, then upload the `source/` folder in a second commit. The live site does not need `source/`, so you can also leave it out.
3. In the repository go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose branch **main** and folder **/ (root)**, then **Save**.
4. After a minute the site is live at `https://<your-user>.github.io/<repository>/`.

All asset paths are relative, so the same files work at a project URL (`/<repository>/`), at a user site (`<your-user>.github.io`) or on a custom domain.

The microphone only works on HTTPS pages, which GitHub Pages provides by default. The browser asks for microphone permission when you press **Join the signal**; audio is analysed on the device and never leaves it.

## Folder layout

| Path | What it is |
| --- | --- |
| `index.html`, `assets/` | The built site (JavaScript, CSS, self-hosted fonts, audio worker) |
| `media/` | HOWL footage atlases (MP4), rack photos (WebP), HOWL logos (SVG/PNG) |
| `favicon.png`, `apple-touch-icon.png` | Site icons |
| `.nojekyll` | Tells GitHub Pages to serve the files as-is |
| `source/` | Editable source code (React + TypeScript + Vite) |

## Editing and rebuilding

You only need this if you want to change the code. It requires Node.js 20 or newer.

```bash
cd source
npm install
npm run dev            # local dev server with hot reload (http://localhost:5173)
npm run publish-site   # type-check, build, and copy the new build into the site root
```

`publish-site` replaces `index.html` and `assets/` in the site root with the fresh build; commit and push them to update the live site. The root `media/` folder is the single copy of the footage and photos: the dev server and builds read it through `source/public/media`, which `npm run dev` / `npm run build` fill automatically and which is not committed.

The main pieces of the source are `src/visualizer/` (audio analysis, rack and cable simulation, footage director, WebGL CRT/VHS shaders), `src/components/` (start panel, HUD, control deck) and `src/pages/Home.tsx` (the full-screen page).

## Controls

| Key | Action |
| --- | --- |
| `M` | Start / stop the microphone |
| `T` | Start / stop the test record |
| `S` | Strobe / flashing effects on or off |
| `H` | Hide / show the HUD and controls |
| `F` | Fullscreen |

The control deck (sensitivity, intensity, strobe, fullscreen) appears on mouse movement or tap and hides itself while the visuals run.

## Photosensitivity warning

The visuals contain intense strobing and flashing. Turn **STROBE** off in the control deck if flashing lights affect you or your audience.

## Credits

Fonts are self-hosted from the Fontsource packages: IBM Plex Mono, Bebas Neue, Space Grotesk and VT323, all under the SIL Open Font License 1.1.
