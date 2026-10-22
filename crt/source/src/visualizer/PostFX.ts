import { COMP_FRAG, COMP_VEC4, type CompParams } from "./CompFX";

/** Every parameter of the CRT / video-synth pass. Packed into a vec4 array for the shader. */
export interface PostParams {
  time: number;
  chaos: number;
  rgb: number;
  tear: number;
  block: number;
  noise: number;
  feedback: number;
  flash: number;
  flashColor: [number, number, number];
  invert: number;
  warp: number;
  scan: number;
  mirror: number;
  kaleido: number;
  segments: number;
  wobble: number;
  wobbleFreq: number;
  /** Mosaic block size in render pixels (≤ 1 = off). */
  pixel: number;
  /** Quantization levels (≤ 1.5 = off). */
  poster: number;
  colorize: number;
  palette: number;
  solar: number;
  edge: number;
  thermal: number;
  osc: number;
  oscFreq: number;
  fbZoom: number;
  fbRot: number;
  fbHue: number;
  /** Vertical-hold roll offset 0..1. */
  roll: number;
  skew: number;
  scramble: number;
  yuv: number;
  /** Aperture-grille shadow mask strength. */
  mask: number;
  bloom: number;
  snow: number;
  zoom: number;
  kick: number;
  strobe: number;
  dropout: number;
  /** Interlace field parity (0/1). */
  field: number;
  /** Position of the rolling refresh band (0..1, may overshoot). */
  bandY: number;
  /** Quality level 0..3 (gates the costlier taps). */
  quality: number;
  /** 1 when the V-hold roll is engaged. */
  rollOn: number;
  /** Master VHS amount: chroma bleed/delay, ghosting, colour noise, jitter, head-switch noise. */
  tape: number;
  /** Tracking-error band strength and its vertical position (0..1). */
  track: number;
  trackY: number;
  /** Horizontal pixel streaks. */
  streak: number;
  /** Macroblock datamosh corruption. */
  macro: number;
  /** Channel swap/dropout mode (0 = off, 1..3). */
  chan: number;
  /** Vertical frame jump offset (0..1). */
  vjump: number;
  /** Interlace combing. */
  comb: number;
  /** Tape wrinkle warp. */
  wrinkle: number;
  /** White tape dropouts. */
  drops: number;
  /** Punch-through: 0..1 blend toward the clean composite (footage cut landing readable). */
  clean: number;
}

// 14 vec4 + uRes = 15 uniform vectors, inside the WebGL1 minimum of 16.
const VEC4_COUNT = 15;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform vec4 uV[${VEC4_COUNT}];

#define TIME uV[0].x
#define CHAOS uV[0].y
#define RGB uV[0].z
#define TEAR uV[0].w
#define BLOCK uV[1].x
#define NOISE uV[1].y
#define FEEDBACK uV[1].z
#define FLASH uV[1].w
#define FLASHCOL uV[2].xyz
#define INVERT uV[2].w
#define WARP uV[3].x
#define SCAN uV[3].y
#define MIRROR uV[3].z
#define KALEIDO uV[3].w
#define SEGMENTS uV[4].x
#define WOBBLE uV[4].y
#define WOBBLE_F uV[4].z
#define PIXEL uV[4].w
#define POSTER uV[5].x
#define COLORIZE uV[5].y
#define PALETTE uV[5].z
#define SOLAR uV[5].w
#define EDGE uV[6].x
#define THERMAL uV[6].y
#define OSC uV[6].z
#define OSC_F uV[6].w
#define FB_ZOOM uV[7].x
#define FB_ROT uV[7].y
#define FB_HUE uV[7].z
#define ROLL uV[7].w
#define SKEW uV[8].x
#define SCRAMBLE uV[8].y
#define YUV uV[8].z
#define MASK uV[8].w
#define BLOOM uV[9].x
#define SNOW uV[9].y
#define ZOOM uV[9].z
#define KICK uV[9].w
#define STROBE uV[10].x
#define DROPOUT uV[10].y
#define FIELD uV[10].z
#define BAND_Y uV[10].w
#define QUALITY uV[11].x
#define ROLLON uV[11].y
#define TAPE uV[11].z
#define TRACK uV[11].w
#define TRACK_Y uV[12].x
#define STREAK uV[12].y
#define MACRO uV[12].z
#define CHAN uV[12].w
#define VJUMP uV[13].x
#define COMB uV[13].y
#define WRINKLE uV[13].z
#define DROPS uV[13].w
#define CLEAN uV[14].x

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 scene(vec2 uv) { return texture2D(uScene, uv).rgb; }

// Cosine palette; k selects one of several ramps.
vec3 pal(float t, float k) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67) + vec3(k * 0.13, k * 0.29, k * 0.41)));
}

// Thermal false color: black, blue, magenta, red, yellow, white.
vec3 thermal(float t) {
  vec3 c = mix(vec3(0.0, 0.0, 0.08), vec3(0.1, 0.0, 0.85), smoothstep(0.0, 0.2, t));
  c = mix(c, vec3(0.9, 0.0, 0.7), smoothstep(0.2, 0.4, t));
  c = mix(c, vec3(1.0, 0.15, 0.0), smoothstep(0.4, 0.6, t));
  c = mix(c, vec3(1.0, 0.85, 0.0), smoothstep(0.6, 0.8, t));
  return mix(c, vec3(1.0), smoothstep(0.8, 1.0, t));
}

vec3 rgb2yiq(vec3 c) {
  return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
}
vec3 yiq2rgb(vec3 c) {
  return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z);
}
// Rotate chroma around the luma axis (YUV phase).
vec3 hueRot(vec3 c, float a) {
  vec3 y = rgb2yiq(c);
  float s = sin(a);
  float co = cos(a);
  return yiq2rgb(vec3(y.x, y.y * co - y.z * s, y.y * s + y.z * co));
}

void main() {
  vec2 c0 = vUv - 0.5;
  float r2 = dot(c0, c0);
  // CRT tube curvature.
  vec2 tube = 0.5 + c0 * (1.0 + WARP * r2 + WARP * 0.6 * r2 * r2);
  vec2 uv = tube;
  // Punch zoom on kicks.
  uv = 0.5 + (uv - 0.5) / (1.0 + ZOOM);

  // Vertical hold roll / frame jump with a black sync bar.
  float rollBar = 1.0;
  if (ROLLON > 0.5 || VJUMP > 0.001) {
    uv.y = fract(uv.y + ROLL * ROLLON + VJUMP);
    rollBar = smoothstep(0.0, 0.035, uv.y) * (1.0 - smoothstep(0.965, 1.0, uv.y));
  }
  float tq = floor(TIME * 30.0);
  // ~480 visible "tape lines", independent of the canvas resolution.
  float lineH = max(1.0, uRes.y / 480.0);
  float tline = floor(gl_FragCoord.y / lineH);

  // Horizontal sync skew.
  if (SKEW > 0.0) {
    float line = floor(uv.y * 240.0);
    uv.x += SKEW * (sin(uv.y * 5.0 + TIME * 3.0) * 0.04 + (hash(vec2(line, tq)) - 0.5) * 0.015 + uv.y * 0.05 * sin(TIME * 1.3));
  }

  // --- VHS tape transport -------------------------------------------------------------
  // Per-line jitter.
  uv.x += (hash(vec2(tline, tq)) - 0.5) * 0.003 * TAPE * (1.0 + KICK * 2.5);
  // Head-switching noise along the bottom edge of the picture.
  float hsw = (1.0 - smoothstep(0.0, 0.028 + TAPE * 0.022, tube.y)) * TAPE;
  uv.x += hsw * (0.03 + 0.07 * hash(vec2(tline, tq + 2.0)));
  // Tracking-error band: lines torn sideways inside a rolling band.
  float tb = TRACK * (1.0 - smoothstep(0.0, 0.035 + TRACK * 0.09, abs(tube.y - TRACK_Y)));
  uv.x += tb * ((hash(vec2(tline * 0.5, tq + 4.0)) - 0.35) * 0.22);
  // Tape wrinkle: a sharp wavy kink travelling down the frame.
  float wy = tube.y - fract(TIME * 0.23 + 0.5);
  float wk = WRINKLE * exp(-wy * wy * 900.0);
  uv.x += sin(gl_FragCoord.y * 0.7 + TIME * 70.0) * 0.02 * wk;
  uv.y += wk * 0.012 * sin(TIME * 90.0);
  // Interlace combing: odd and even fields pull apart.
  if (COMB > 0.0) uv.x += (mod(tline, 2.0) < 1.0 ? 1.0 : -1.0) * COMB * 0.006;
  // Horizontal pixel streaks: the line smears its last pixel to the edge.
  if (STREAK > 0.0) {
    float sl = floor(gl_FragCoord.y / (lineH * 2.0));
    float sq = floor(TIME * 30.0);
    if (hash(vec2(sl, sq + 11.0)) < STREAK * 0.14) {
      float sx = hash(vec2(sl, sq + 3.0)) * 0.9;
      if (uv.x > sx) uv.x = sx;
    }
  }

  // Wobbulator / elastic warp.
  if (WOBBLE > 0.0) {
    uv.x += sin(uv.y * WOBBLE_F + TIME * 7.0) * 0.035 * WOBBLE;
    uv.y += sin(uv.x * WOBBLE_F * 0.6 - TIME * 4.0) * 0.018 * WOBBLE;
  }
  // Horizontal tearing bands.
  float bands = 18.0 + floor(hash(vec2(tq, 3.1)) * 50.0);
  float band = floor(uv.y * bands);
  if (hash(vec2(band, tq)) < TEAR) {
    uv.x += (hash(vec2(band, tq + 7.0)) - 0.5) * 0.35 * TEAR;
  }
  // Line scramble: chunks of lines swapped around the frame.
  if (SCRAMBLE > 0.0) {
    float lines = 48.0;
    float ln = floor(uv.y * lines);
    float sq = floor(TIME * 24.0);
    float h = hash(vec2(ln, sq));
    if (h < SCRAMBLE * 0.45) {
      uv.y = (floor(hash(vec2(ln + 3.0, sq)) * lines) + fract(uv.y * lines)) / lines;
      uv.x += (hash(vec2(ln, sq + 5.0)) - 0.5) * 0.25 * SCRAMBLE;
    }
  }
  // Block corruption.
  vec2 grid = vec2(18.0, 10.0);
  vec2 blk = floor(uv * grid);
  float bq = floor(TIME * 14.0);
  if (hash(blk + bq) < BLOCK * 0.2) {
    uv = (blk + 0.5) / grid + (vec2(hash(blk + 1.7 + bq), hash(blk + 9.2 + bq)) - 0.5) * 0.35 * BLOCK + (uv - (blk + 0.5) / grid);
  }
  // Macroblock datamosh: clustered blocks smear one row vertically, shifted from elsewhere.
  float mbHit = 0.0;
  vec2 mbId = vec2(0.0);
  if (MACRO > 0.0) {
    float mbs = max(8.0, floor(uRes.y / 30.0));
    mbId = floor(gl_FragCoord.xy / mbs);
    float mq = floor(TIME * 15.0);
    vec2 cl = floor(mbId / 4.0);
    if (hash(cl + mq * 0.73) < MACRO * 0.5 && hash(mbId + mq) < 0.45 + MACRO * 0.45) {
      mbHit = 1.0;
      vec2 off = (vec2(hash(cl + 2.3 + mq), hash(cl + 7.1 + mq)) - 0.5) * 0.18;
      vec2 origin = (mbId * mbs) / uRes;
      uv = vec2(uv.x, origin.y) + off;
    }
  }
  // Mirrors.
  if (MIRROR > 0.5) {
    if (MIRROR < 1.5 || MIRROR > 2.5) uv.x = 0.5 - abs(uv.x - 0.5);
    if (MIRROR > 1.5) uv.y = 0.5 - abs(uv.y - 0.5);
  }
  // Kaleidoscope.
  if (KALEIDO > 0.0) {
    float aspect = uRes.x / uRes.y;
    vec2 p = uv - 0.5;
    p.x *= aspect;
    float a = atan(p.y, p.x) + TIME * 0.4;
    float r = length(p);
    float seg = 6.28318 / max(SEGMENTS, 2.0);
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    vec2 k = vec2(cos(a), sin(a)) * r;
    k.x /= aspect;
    uv = mix(uv, k + 0.5, KALEIDO);
  }
  // Mosaic.
  if (PIXEL > 1.0) {
    vec2 bs = PIXEL / uRes;
    uv = (floor(uv / bs) + 0.5) * bs;
  }

  // Sample with chromatic split.
  vec2 dir = c0 * RGB * 2.0 + vec2(RGB * 0.6, 0.0);
  vec3 col = vec3(texture2D(uScene, uv + dir).r, texture2D(uScene, uv).g, texture2D(uScene, uv - dir).b);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);

  // VHS chroma: low-bandwidth, delayed colour with streaky noise, plus a luma ghost.
  if (TAPE > 0.0 && QUALITY > 0.5) {
    vec2 bs = vec2(0.004 * TAPE, 0.0);
    vec2 cd = vec2(-0.0035 * TAPE, 0.0);
    vec2 iq = (rgb2yiq(scene(uv + cd - bs)).yz + rgb2yiq(scene(uv + cd)).yz * 2.0 + rgb2yiq(scene(uv + cd + bs)).yz) * 0.25;
    vec3 yq = rgb2yiq(col);
    yq.x += luma(scene(uv - vec2(0.014 + 0.012 * TAPE, 0.0))) * 0.13 * TAPE;
    iq += (vec2(hash(vec2(floor(gl_FragCoord.x / 7.0), tline + tq)), hash(vec2(floor(gl_FragCoord.x / 9.0), tline - tq))) - 0.5) * 0.09 * TAPE;
    col = yiq2rgb(vec3(yq.x, iq * (1.0 + 0.2 * TAPE)));
  }
  if (mbHit > 0.5) {
    // Corrupted blocks: crushed colour, or the previous frame stuck in place.
    if (FEEDBACK > 0.0 && hash(mbId + 3.3) < 0.45) col = texture2D(uPrev, vUv).rgb;
    else col = floor(col * 4.0 + 0.5) / 4.0 * vec3(0.85, 1.2, 0.95);
  }
  float l = luma(col);

  // Video-synth processing.
  if (EDGE > 0.0 && QUALITY > 0.5) {
    vec2 px = 1.5 / uRes;
    float e = abs(luma(scene(uv + vec2(px.x, 0.0))) - luma(scene(uv - vec2(px.x, 0.0))))
            + abs(luma(scene(uv + vec2(0.0, px.y))) - luma(scene(uv - vec2(0.0, px.y))));
    col = mix(col, pal(l + TIME * 0.2, PALETTE) * e * 4.0, EDGE);
  }
  if (YUV > 0.0) col = hueRot(col, YUV * (TIME * 2.0 + uv.y * 6.0 + KICK * 3.0));
  if (POSTER > 1.5) col = floor(col * POSTER + 0.5) / POSTER;
  if (THERMAL > 0.0) col = mix(col, thermal(l), THERMAL);
  if (COLORIZE > 0.0) col = mix(col, pal(l * 1.6 + TIME * 0.07, PALETTE) * (0.25 + l * 1.3), COLORIZE);
  if (SOLAR > 0.0) col = mix(col, 1.0 - abs(1.0 - 2.0 * col), SOLAR);

  // Video oscillator patterns keyed into the dark parts of the picture.
  if (OSC > 0.0) {
    float o1 = sin(vUv.y * OSC_F + TIME * 6.0 + sin(vUv.x * OSC_F * 0.21 + TIME * 1.7) * 2.5);
    float o2 = sin(vUv.x * OSC_F * 0.55 - TIME * 4.3 + KICK * 4.0);
    float pat = step(0.0, o1 * o2);
    vec3 oc = pal(vUv.x * 0.7 + vUv.y * 0.4 + TIME * 0.25, PALETTE + 2.0);
    float key = 1.0 - smoothstep(0.06, 0.28, l);
    col = mix(col, oc * pat, OSC * key);
  }

  // Video feedback with zoom, rotation and hue drift.
  if (FEEDBACK > 0.0) {
    vec2 fp = vUv - 0.5;
    float ca = cos(FB_ROT);
    float sa = sin(FB_ROT);
    fp = mat2(ca, -sa, sa, ca) * fp * (1.0 - FB_ZOOM);
    vec3 prev = texture2D(uPrev, fp + 0.5).rgb;
    if (FB_HUE != 0.0) prev = hueRot(prev, FB_HUE);
    col = max(col, prev * FEEDBACK);
  }

  // Phosphor bloom.
  if (BLOOM > 0.0 && QUALITY > 1.5) {
    vec2 bp = 6.0 / uRes;
    vec3 b = max(scene(uv + vec2(bp.x, 0.0)) - 0.55, 0.0);
    b += max(scene(uv - vec2(bp.x, 0.0)) - 0.55, 0.0);
    b += max(scene(uv + vec2(0.0, bp.y)) - 0.55, 0.0);
    b += max(scene(uv - vec2(0.0, bp.y)) - 0.55, 0.0);
    b += max(scene(uv + bp * 1.6) - 0.55, 0.0);
    b += max(scene(uv - bp * 1.6) - 0.55, 0.0);
    col += b * BLOOM * 0.45;
  }

  col += FLASHCOL * FLASH;
  col = mix(col, vec3(1.0) - col, INVERT);

  // Channel swap / dropout.
  if (CHAN > 0.5) {
    if (CHAN < 1.5) col = col.brg;
    else if (CHAN < 2.5) col = col.gbr;
    else col = vec3(0.0, col.g, col.b * 1.2);
  }
  // Tape grade: lifted blacks, slight flicker.
  col = col * (1.0 - 0.07 * TAPE) + vec3(0.02, 0.026, 0.034) * TAPE;
  col *= 1.0 - TAPE * 0.09 * hash(vec2(tq, 9.1));

  // Punch-through: on a footage cut the clean composite (same tube and kick zoom) shows
  // through the program and tape damage, so the shot reads before the glitch closes back over it.
  if (CLEAN > 0.001) {
    vec2 cuv = 0.5 + (tube - 0.5) / (1.0 + ZOOM);
    col = mix(col, scene(cuv) * 1.06, CLEAN);
  }

  // CRT: aperture grille and beam-width scanlines.
  float m = mod(gl_FragCoord.x, 3.0);
  vec3 mask = m < 1.0 ? vec3(1.0, 0.3, 0.3) : (m < 2.0 ? vec3(0.3, 1.0, 0.3) : vec3(0.3, 0.3, 1.0));
  col *= mix(vec3(1.0), mask * 1.7, MASK);
  float sl = 0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159 + FIELD * 3.14159);
  col *= 1.0 - SCAN * sl * (1.0 - clamp(l, 0.0, 1.0) * 0.5);
  // Rolling refresh band.
  float bd = (vUv.y - BAND_Y) * 9.0;
  col *= 1.0 + 0.18 * exp(-bd * bd);

  // Snow, grain and signal dropouts.
  float n = hash(gl_FragCoord.xy + fract(TIME * 7.0) * 500.0);
  // Static has horizontal grain, like an untuned analog channel.
  float sn = hash(vec2(floor(gl_FragCoord.x / (2.0 * lineH)), tline) + fract(TIME * 7.0) * 500.0);
  col = mix(col, vec3(sn), SNOW);
  col += (n - 0.5) * NOISE;
  // Head-switch and tracking noise.
  col = mix(col, vec3(sn * 0.9), hsw * 0.55);
  if (tb > 0.0) {
    float nl = step(0.5, hash(vec2(tline * 1.3, tq)));
    float seg = hash(vec2(floor(gl_FragCoord.x / (3.0 + 20.0 * hash(vec2(tline, tq + 8.0)))), tline + tq));
    col = mix(col, vec3(seg * 1.15), tb * nl * 0.85);
  }
  // White tape dropouts with comet tails.
  if (DROPS > 0.0) {
    float dl = floor(gl_FragCoord.y / (lineH * 1.5));
    float dq = floor(TIME * 20.0);
    if (hash(vec2(dl, dq + 41.0)) < DROPS * 0.012) {
      float sx = hash(vec2(dl, dq + 5.0));
      float len = 0.02 + 0.22 * hash(vec2(dl, dq + 9.0));
      float d = (vUv.x - sx) / len;
      if (d > 0.0 && d < 1.0) col = mix(col, vec3(1.0), (1.0 - d) * 0.95);
    }
  }
  if (DROPOUT > 0.0) {
    float dl = hash(vec2(floor(gl_FragCoord.y / 2.0), tq));
    if (dl < DROPOUT * 0.05) col = mix(col, vec3(hash(gl_FragCoord.xy * 0.37 + TIME)), 0.85);
  }
  col *= rollBar;
  col = mix(col, vec3(1.0), STROBE);

  // Tube vignette and rounded glass edge.
  vec2 e2 = tube * (1.0 - tube);
  float vig = clamp(pow(max(e2.x * e2.y * 18.0, 0.0), 0.3), 0.0, 1.0);
  if (tube.x < 0.0 || tube.x > 1.0 || tube.y < 0.0 || tube.y > 1.0) vig = 0.0;
  gl_FragColor = vec4(col * vig, 1.0);
}
`;

/** Full-screen WebGL pass: CRT tube, video-synth programs, feedback, glitch and grain. */
export class PostFX {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private locV: WebGLUniformLocation | null;
  private locRes: WebGLUniformLocation | null;
  private sceneTex: WebGLTexture;
  private prevTex: WebGLTexture;
  private vals = new Float32Array(VEC4_COUNT * 4);
  // Footage / logo compositing pass (rendered into compTex before the CRT pass).
  private compProg: WebGLProgram | null = null;
  private compLocC: WebGLUniformLocation | null = null;
  private compLocRes: WebGLUniformLocation | null = null;
  private compVals = new Float32Array(COMP_VEC4 * 4);
  private fbo: WebGLFramebuffer | null = null;
  private compTex: WebGLTexture;
  private footTex: WebGLTexture;
  private brandTex: WebGLTexture;
  private footVideo: HTMLVideoElement | null = null;
  private footSerial = -1;
  private footOK = false;
  private w = 1;
  private h = 1;
  private hasPrev = false;
  private checkErrors = true;
  /** Largest render dimension supported by both textures and the viewport. */
  readonly maxSize: number;
  lost = false;

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    const maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
    const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null;
    this.maxSize = Math.max(256, Math.min(maxTex, vp ? Math.min(vp[0], vp[1]) : maxTex, 8192));
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(gl.getUniformLocation(prog, "uScene"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "uPrev"), 1);
    this.locV = gl.getUniformLocation(prog, "uV");
    this.locRes = gl.getUniformLocation(prog, "uRes");

    this.sceneTex = this.makeTex();
    this.prevTex = this.makeTex();
    this.compTex = this.makeTex();
    this.footTex = this.makeTex();
    this.brandTex = this.makeTex();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // The compositing pass is optional: without it the rack still runs through the CRT pass.
    try {
      const cfs = this.compile(gl.FRAGMENT_SHADER, COMP_FRAG);
      const cp = gl.createProgram()!;
      gl.attachShader(cp, vs);
      gl.attachShader(cp, cfs);
      gl.bindAttribLocation(cp, 0, "aPos");
      gl.linkProgram(cp);
      if (!gl.getProgramParameter(cp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(cp) ?? "link failed");
      gl.useProgram(cp);
      gl.uniform1i(gl.getUniformLocation(cp, "uScene"), 0);
      gl.uniform1i(gl.getUniformLocation(cp, "uFoot"), 2);
      gl.uniform1i(gl.getUniformLocation(cp, "uBrand"), 3);
      this.compLocC = gl.getUniformLocation(cp, "uC");
      this.compLocRes = gl.getUniformLocation(cp, "uRes");
      this.compProg = cp;
      this.fbo = gl.createFramebuffer();
      gl.useProgram(prog);
    } catch (e) {
      console.warn("[HOWL] footage pass unavailable", e);
      this.compProg = null;
      gl.useProgram(prog);
    }

    canvas.addEventListener("webglcontextlost", e => {
      e.preventDefault();
      this.lost = true;
    });
  }

  static create(canvas: HTMLCanvasElement): PostFX | null {
    try {
      const gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      }) as WebGLRenderingContext | null;
      if (!gl) return null;
      return new PostFX(canvas, gl);
    } catch {
      return null;
    }
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "compile failed");
    return s;
  }

  private makeTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
    return t;
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, Math.min(this.maxSize, w));
    this.h = Math.max(1, Math.min(this.maxSize, h));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.hasPrev = false;
    this.checkErrors = true;
    if (this.compProg && this.fbo) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.compTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, this.w, this.h, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.compTex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn("[HOWL] footage framebuffer incomplete; footage pass disabled");
        this.compProg = null;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  /** True when footage and logos can be composited on the GPU. */
  get canComposite(): boolean {
    return !!this.compProg && !this.lost;
  }

  /** Upload the brand texture (logos + glyph ramp). */
  setBrand(c: HTMLCanvasElement): void {
    if (this.lost) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.brandTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, c);
    } catch (err) {
      console.warn("[HOWL] brand texture not uploadable", err);
    }
  }

  private packComp(c: CompParams, hasFoot: number): Float32Array {
    const v = this.compVals;
    const list = [
      c.time, c.mix, c.mode, c.cell,
      c.cols, c.rows, c.cellAspect, hasFoot,
      c.logo, c.logoKind, c.logoScale, c.logoX,
      c.logoY, c.zoom, c.key, c.param,
      c.kick, c.hat, c.snare, c.level,
      c.sweepPos, c.sweepAmt, c.grade, c.seed,
      c.punch, 0, 0, 0,
    ];
    for (let i = 0; i < list.length; i++) v[i] = Number.isFinite(list[i]) ? list[i] : 0;
    return v;
  }

  private pack(p: PostParams): Float32Array {
    const v = this.vals;
    const fc = p.flashColor;
    const list = [
      p.time, p.chaos, p.rgb, p.tear,
      p.block, p.noise, this.hasPrev ? p.feedback : 0, p.flash,
      fc[0], fc[1], fc[2], p.invert,
      p.warp, p.scan, p.mirror, p.kaleido,
      p.segments, p.wobble, p.wobbleFreq, p.pixel,
      p.poster, p.colorize, p.palette, p.solar,
      p.edge, p.thermal, p.osc, p.oscFreq,
      p.fbZoom, p.fbRot, p.fbHue, p.roll,
      p.skew, p.scramble, p.yuv, p.mask,
      p.bloom, p.snow, p.zoom, p.kick,
      p.strobe, p.dropout, p.field, p.bandY,
      p.quality, p.rollOn, p.tape, p.track,
      p.trackY, p.streak, p.macro, p.chan,
      p.vjump, p.comb, p.wrinkle, p.drops,
      p.clean, 0, 0, 0,
    ];
    for (let i = 0; i < list.length; i++) v[i] = Number.isFinite(list[i]) ? list[i] : 0;
    return v;
  }

  render(
    scene: HTMLCanvasElement,
    p: PostParams,
    c: CompParams | null = null,
    video: HTMLVideoElement | null = null,
    serial = 0,
    frameUnknown = false,
  ): void {
    if (this.lost) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, scene);
    } catch (err) {
      // A tainted scene canvas can never be uploaded again: show the 2D picture instead of
      // failing every frame.
      console.warn("[HOWL] scene canvas not uploadable; using the 2D picture", err);
      this.lost = true;
      return;
    }

    let src = this.sceneTex;
    if (this.compProg && this.fbo && c && (c.mix > 0.002 || c.logo > 0.002 || c.sweepAmt > 0)) {
      let has = 0;
      if (video && c.hasFoot > 0) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.footTex);
        // Only upload when the video has presented a new frame.
        if (video !== this.footVideo || serial !== this.footSerial || frameUnknown) {
          try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
            this.footVideo = video;
            this.footSerial = serial;
            this.footOK = true;
          } catch {
            this.footOK = false;
          }
        }
        has = this.footOK ? 1 : 0;
      }
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.brandTex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.useProgram(this.compProg);
      gl.uniform2f(this.compLocRes, this.w, this.h);
      gl.uniform4fv(this.compLocC, this.packComp(c, has));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      src = this.compTex;
    }

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.prevTex);

    gl.uniform2f(this.locRes, this.w, this.h);
    gl.uniform4fv(this.locV, this.pack(p));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Keep this frame for next frame's feedback.
    if (p.feedback > 0.001) {
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, this.w, this.h, 0);
      this.hasPrev = true;
    } else {
      this.hasPrev = false;
    }

    // After (re)allocation, verify the GPU accepted the buffers; otherwise fall back to 2D.
    if (this.checkErrors) {
      this.checkErrors = false;
      if (gl.getError() !== gl.NO_ERROR) this.lost = true;
    }
  }
}
