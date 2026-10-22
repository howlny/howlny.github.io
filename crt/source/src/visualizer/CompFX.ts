import { BRAND_V } from "./media/brandAtlas";

/** Per-frame inputs of the footage / logo compositing pass. */
export interface CompParams {
  time: number;
  /** Footage opacity 0..1. */
  mix: number;
  /** Footage mode index (see FOOT_MODES in Director.ts). 0 = rack only. */
  mode: number;
  cell: number;
  cols: number;
  rows: number;
  /** Width / height of one atlas cell. */
  cellAspect: number;
  hasFoot: number;
  /** HOWL logo flash 0..1. */
  logo: number;
  /** 0 = concentric-ring logo, 1 = brush logo. */
  logoKind: number;
  /** Logo width as a fraction of the screen width. */
  logoScale: number;
  logoX: number;
  logoY: number;
  /** Footage punch-in zoom. */
  zoom: number;
  /** Luma key / threshold level. */
  key: number;
  /** Mode-specific parameter (tiles, strips, lines, cell size). */
  param: number;
  kick: number;
  hat: number;
  snare: number;
  level: number;
  sweepPos: number;
  sweepAmt: number;
  /** 0 natural, 1 teal, 2 signal green, 3 hard B/W, 4 red. */
  grade: number;
  /** Changes on hits to reshuffle tiles and strips. */
  seed: number;
  /** Footage cut punch-through: 0..1 blend toward the plain graded shot. */
  punch: number;
}

export const COMP_VEC4 = 7;

export const COMP_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uFoot;
uniform sampler2D uBrand;
uniform vec2 uRes;
uniform vec4 uC[${COMP_VEC4}];

#define TIME uC[0].x
#define MIX uC[0].y
#define MODE uC[0].z
#define CELL uC[0].w
#define COLS uC[1].x
#define ROWS uC[1].y
#define CASPECT uC[1].z
#define HASFOOT uC[1].w
#define LOGO uC[2].x
#define LOGO_KIND uC[2].y
#define LOGO_SCALE uC[2].z
#define LOGO_X uC[2].w
#define LOGO_Y uC[3].x
#define FZOOM uC[3].y
#define KEY uC[3].z
#define PARAM uC[3].w
#define KICK uC[4].x
#define HAT uC[4].y
#define SNARE uC[4].z
#define LEVEL uC[4].w
#define SWEEP_POS uC[5].x
#define SWEEP_AMT uC[5].y
#define GRADE uC[5].z
#define SEED uC[5].w
#define PUNCH uC[6].x

const vec3 SIGNAL = vec3(0.04, 1.0, 0.6);
const float RING_ASPECT = ${(BRAND_V.ringAspect).toFixed(4)};
const float BRUSH_ASPECT = ${(BRAND_V.brushAspect).toFixed(4)};
const vec2 RING_V = vec2(${BRAND_V.ring[0].toFixed(5)}, ${BRAND_V.ring[1].toFixed(5)});
const vec2 BRUSH_V = vec2(${BRAND_V.brush[0].toFixed(5)}, ${BRAND_V.brush[1].toFixed(5)});
const vec2 GLYPH_V = vec2(${BRAND_V.glyph[0].toFixed(5)}, ${BRAND_V.glyph[1].toFixed(5)});

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Texture coordinates of point f (0..1, y up) inside an atlas cell.
vec2 cellUV(float cell, vec2 f) {
  f = clamp(f, 0.003, 0.997);
  float c = mod(cell, COLS);
  float r = mod(floor(cell / COLS), ROWS);
  return vec2((c + f.x) / COLS, (ROWS - 1.0 - r + f.y) / ROWS);
}
vec3 foot(float cell, vec2 f) { return texture2D(uFoot, cellUV(cell, f)).rgb; }

// Cover-fit a viewport point into a shot, for a viewport of the given aspect.
vec2 cover(vec2 uv, float aspect) {
  vec2 f = uv - 0.5;
  if (aspect > CASPECT) f.y *= CASPECT / aspect;
  else f.x *= aspect / CASPECT;
  return f / (1.0 + FZOOM) + 0.5;
}

vec3 grade(vec3 c) {
  float l = luma(c);
  // Natural: punchier contrast with a soft shoulder so highlights don't blow out downstream.
  if (GRADE < 0.5) {
    vec3 g = clamp((c - 0.5) * 1.18 + 0.47, 0.0, 1.0);
    return g * (1.0 - 0.28 * g);
  }
  if (GRADE < 1.5) return mix(c, vec3(l * 0.5, l * 0.88, l * 1.18), 0.7);
  if (GRADE < 2.5) return SIGNAL * pow(l, 1.15) * 1.3;
  if (GRADE < 3.5) return vec3(smoothstep(0.22, 0.75, l) * 0.88);
  return vec3(1.0, 0.15, 0.1) * pow(l, 1.05) * 1.35;
}
vec3 ink() { return GRADE < 0.5 ? vec3(0.95) : grade(vec3(1.0)); }

float logoA(vec2 uv, float scale) {
  float aspect = uRes.x / uRes.y;
  bool ring = LOGO_KIND < 0.5;
  float la = ring ? RING_ASPECT : BRUSH_ASPECT;
  vec2 size = vec2(scale, scale * aspect / la);
  vec2 lu = (uv - vec2(LOGO_X, LOGO_Y)) / size + 0.5;
  if (lu.x < 0.0 || lu.x > 1.0 || lu.y < 0.0 || lu.y > 1.0) return 0.0;
  vec2 vr = ring ? RING_V : BRUSH_V;
  return texture2D(uBrand, vec2(lu.x, mix(vr.x, vr.y, lu.y))).r;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec3 sc = texture2D(uScene, uv).rgb;
  // A light passing over the rack.
  if (SWEEP_AMT > 0.0) {
    float d = (uv.x + (1.0 - uv.y) * 0.35 - SWEEP_POS) * 6.0;
    sc += sc * SWEEP_AMT * exp(-d * d) * 1.8;
  }
  vec3 col = sc;
  float n = max(PARAM, 1.0);
  float cells = COLS * ROWS;

  if (HASFOOT > 0.5 && MIX > 0.001 && MODE > 0.5) {
    vec3 fc = vec3(0.0);
    float cov = 1.0;
    if (MODE < 1.5) {
      // FEED: the shot, full frame.
      fc = grade(foot(CELL, cover(uv, aspect)));
    } else if (MODE < 2.5) {
      // KEY: the rack shows through the shadows.
      fc = grade(foot(CELL, cover(uv, aspect)));
      cov = smoothstep(KEY, KEY + 0.18, luma(fc));
    } else if (MODE < 3.5) {
      // MASK: footage inside the HOWL letters, a signal-green rim around them.
      float a = logoA(uv, LOGO_SCALE);
      vec2 px = vec2(3.0 / uRes.x, 3.0 / uRes.y);
      float ab = (logoA(uv + vec2(px.x, 0.0), LOGO_SCALE) + logoA(uv - vec2(px.x, 0.0), LOGO_SCALE)
                + logoA(uv + vec2(0.0, px.y), LOGO_SCALE) + logoA(uv - vec2(0.0, px.y), LOGO_SCALE)) * 0.25;
      float rim = clamp(abs(ab - a) * 3.0, 0.0, 1.0);
      fc = grade(foot(CELL, cover(uv, aspect))) * 1.15;
      cov = a;
      col = sc * (1.0 - 0.6 * MIX);
      col += SIGNAL * rim * (0.5 + KICK) * MIX;
    } else if (MODE < 4.5) {
      // MIRROR: two shots side by side, reflected through the centre lines.
      float side = step(0.5, uv.x);
      vec2 f = vec2(fract(uv.x * 2.0), 0.5 + abs(uv.y - 0.5));
      if (side > 0.5) f.x = 1.0 - f.x;
      f = cover(f, aspect * 0.5);
      float c = side < 0.5 ? CELL : mod(CELL + 1.0 + floor(SEED), cells);
      vec2 b = vec2(2.5 / uRes.x, 0.0);
      fc = grade((foot(c, f + b) + foot(c, f - b)) * 0.5);
      fc += vec3(0.85, 0.95, 1.0) * exp(-abs(uv.x - 0.5) * 90.0) * 0.4;
    } else if (MODE < 5.5) {
      // GRID: surveillance wall.
      vec2 t = floor(uv * n);
      vec2 f = fract(uv * n);
      float idx = t.x + t.y * n;
      float c = mod(idx + floor(SEED), cells);
      fc = grade(foot(c, cover(f, aspect)));
      vec2 e = min(f, 1.0 - f) * uRes / n;
      fc = mix(fc, SIGNAL * 0.8, 1.0 - smoothstep(0.8, 2.2, min(e.x, e.y)));
      float live = 1.0 - step(0.5, abs(idx - mod(floor(SEED * 7.0), n * n)));
      fc *= 0.72 + 0.5 * live;
    } else if (MODE < 6.5) {
      // STRIPS: vertical slats of different shots sliding on the beat.
      float s = floor(uv.x * n);
      float c = mod(s + floor(SEED), cells);
      float off = (hash(vec2(s, floor(SEED))) - 0.5) * 0.45 * (0.35 + KICK);
      fc = grade(foot(c, cover(vec2(uv.x, uv.y + off), aspect)));
      cov = step(0.035, fract(uv.x * n));
    } else if (MODE < 7.5) {
      // RUTT: scan lines displaced by brightness (Rutt/Etra).
      float lines = n;
      float L = floor(uv.y * lines);
      float best = 0.0;
      vec3 lc = vec3(0.0);
      for (int k = -2; k <= 1; k++) {
        float ly = (L + float(k) + 0.5) / lines;
        vec3 s = foot(CELL, cover(vec2(uv.x, ly), aspect));
        float lum = luma(s);
        float yy = ly + lum * (0.05 + KICK * 0.07);
        float d = abs(uv.y - yy) * uRes.y;
        float w = 1.0 - smoothstep(0.5, 1.6 + lum * 1.8, d);
        if (w > best) {
          best = w;
          lc = s;
        }
      }
      fc = mix(ink(), vec3(1.0), luma(lc)) * (0.35 + luma(lc) * 1.3);
      cov = best;
    } else if (MODE < 8.5) {
      // HALFTONE: rotated dot screen.
      float cs = n;
      float a = 0.785;
      vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * gl_FragCoord.xy / cs;
      vec2 cid = floor(q) + 0.5;
      vec2 centre = mat2(cos(a), -sin(a), sin(a), cos(a)) * (cid * cs);
      float l = luma(foot(CELL, cover(centre / uRes, aspect)));
      float r = sqrt(clamp(l * 1.2, 0.0, 1.0)) * 0.62;
      float dd = length(fract(q) - 0.5);
      float dt = 1.0 - smoothstep(r - 0.07, r + 0.07, dd);
      fc = ink() * dt;
      cov = 0.88;
    } else if (MODE < 9.5) {
      // ASCII: brightness to glyphs.
      float cs = n;
      vec2 cid = floor(gl_FragCoord.xy / cs);
      vec2 f = fract(gl_FragCoord.xy / cs);
      vec3 s = foot(CELL, cover((cid + 0.5) * cs / uRes, aspect));
      float l = clamp(luma(s) * 1.3, 0.0, 0.999);
      float gi = floor(l * 16.0);
      float g = texture2D(uBrand, vec2((gi + f.x) / 16.0, mix(GLYPH_V.x, GLYPH_V.y, f.y))).r;
      fc = (GRADE < 0.5 ? clamp(s * 1.6, 0.0, 1.0) : ink()) * g;
      cov = 0.92;
    } else if (MODE < 10.5) {
      // NEON: edge-detected shot glowing signal green.
      vec2 f = cover(uv, aspect);
      vec2 px = 2.0 / uRes;
      float e = abs(luma(foot(CELL, f + vec2(px.x, 0.0))) - luma(foot(CELL, f - vec2(px.x, 0.0))))
              + abs(luma(foot(CELL, f + vec2(0.0, px.y))) - luma(foot(CELL, f - vec2(0.0, px.y))));
      vec3 edgeCol = GRADE < 0.5 ? SIGNAL : ink();
      fc = edgeCol * e * 5.0 + vec3(pow(clamp(e * 2.5, 0.0, 1.0), 3.0)) + grade(foot(CELL, f)) * 0.12;
      cov = clamp(e * 7.0 + 0.25, 0.0, 1.0);
    } else if (MODE < 11.5) {
      // MELT: bright pixels drip down the frame.
      vec2 f = cover(uv, aspect);
      vec3 best = foot(CELL, f);
      float bl = luma(best);
      float colh = hash(vec2(floor(gl_FragCoord.x / 3.0), floor(SEED)));
      for (int k = 1; k <= 5; k++) {
        vec3 s = foot(CELL, f + vec2(0.0, float(k) * 0.03 * (0.4 + KICK) * colh));
        float sl = luma(s);
        if (sl > bl) {
          best = s;
          bl = sl;
        }
      }
      fc = grade(best);
    } else if (MODE < 12.5) {
      // XEROX: hard dithered threshold.
      vec3 s = foot(CELL, cover(uv, aspect));
      float h = hash(floor(gl_FragCoord.xy / 2.0) + floor(TIME * 12.0));
      float k = step(KEY + (h - 0.5) * 0.25, luma(s));
      fc = ink() * k;
      cov = k + (1.0 - k) * 0.6;
    } else {
      // SLICE: horizontal bands of shots cut into the rack.
      float s = floor(uv.y * n);
      float on = step(0.45, hash(vec2(s, floor(SEED))));
      float off = (hash(vec2(s + 7.0, floor(SEED))) - 0.5) * 0.3;
      fc = grade(foot(mod(CELL + s, cells), cover(vec2(uv.x + off, uv.y), aspect)));
      cov = on;
    }
    col = mix(col, fc, clamp(MIX * cov, 0.0, 1.0));
    // Cut punch-through: the plain shot lands first, then the mode's treatment takes over.
    // Gentler in the HOWL-letters mask, where the logo shape is the point.
    float pk = PUNCH * (MODE > 2.5 && MODE < 3.5 ? 0.35 : 1.0);
    if (pk > 0.001) col = mix(col, grade(foot(CELL, cover(uv, aspect))) * 1.05, pk);
  }

  // The HOWL logo slammed over everything.
  if (LOGO > 0.001 && (MODE < 2.5 || MODE > 3.5)) {
    float a = logoA(uv, LOGO_SCALE);
    vec2 px = vec2(9.0 / uRes.x, 9.0 / uRes.y);
    float g = (logoA(uv + vec2(px.x, 0.0), LOGO_SCALE) + logoA(uv - vec2(px.x, 0.0), LOGO_SCALE)
             + logoA(uv + vec2(0.0, px.y), LOGO_SCALE) + logoA(uv - vec2(0.0, px.y), LOGO_SCALE)) * 0.25;
    col = mix(col, col * 0.35, g * LOGO * 0.6);
    col = mix(col, vec3(1.0), a * LOGO);
    col += SIGNAL * max(g - a, 0.0) * LOGO * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
