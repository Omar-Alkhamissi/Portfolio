import { useEffect, useRef } from "react";
import {
  GRAPH_DRAG_PERFORMANCE_EVENT,
  useAdaptivePerformanceProfile,
  usePerformanceDiagnosticFlags,
} from "../lib/performance";
import { getMotionOff, useMotionOff } from "../lib/motion";

/**
 * Animated background: a painted nebula band with a three-layer starfield.
 *
 * Implementation notes:
 * - The nebula is rendered once (and on resize) from seeded, domain-warped
 *   value noise at half resolution, in idle time, into two fixed canvases
 *   behind the star canvas. Each reaches 140px past every viewport edge.
 * - Layer A is the main nebula. Layer B is a fainter, finer wisp layer (not on
 *   lite). CSS keyframes (transform only, see index.css) drift them in opposite
 *   directions, so the compositor does the work and no JavaScript runs per frame.
 * - Each star depth layer is pre-rendered to its own offscreen canvas that tiles
 *   in both directions (a star near an edge is also painted on the opposite
 *   edge). Parallax and drift are just a wrapped offset per layer, and the
 *   composite draws the layer up to four times (the 2 by 2 wrap).
 * - The stars drift along the nebula band's diagonal, 3, 6 and 10 px/s for the
 *   far, middle and near layers. While drift runs the composite loop is capped
 *   at 30fps (full) or 20fps (balanced); only compositing runs, never a
 *   re-render. On lite the stars stay still and only twinkle (12fps or less).
 * - Without drift the composite is redrawn only on scroll, resize or a slow
 *   twinkle tick (12fps or less) for about 4 percent of the stars.
 * - Motion off (the site motion switch): fully static, no drift. Hidden
 *   tab: twinkle and drift paused. The offsets are kept and resume from there.
 * - Graph drag: twinkle and drift paused so the graph gets the frame budget.
 * - A rare meteor (every 18 to 40 seconds) is drawn on the star composite pass
 *   for the 500 to 700 ms it lives. Never on lite, hidden, paused or dragging.
 */

const NEBULA_SEED = 1931;
const STAR_SEED = 7027;

const PARALLAX = {
  nebula: 0.04,
  layers: [0.06, 0.09, 0.12],
} as const;

// Star drift in CSS px/s per depth layer (far, middle, near).
const DRIFT_PX_PER_S = [3, 6, 10] as const;
const DRIFT_MAX_DT_MS = 100;
const DRIFT_FPS_FULL = 30;
const DRIFT_FPS_BALANCED = 20;
const STAR_OFFSET_REPORT_MS = 1000;

const TWINKLE_SHARE = 0.04;
const TWINKLE_MIN_INTERVAL_MS = 1000 / 12;
const NEBULA_FADE_MS = 700;
const NEBULA_RESIZE_DEBOUNCE_MS = 250;
// The nebula layers reach this far past every viewport edge so they can drift.
const NEBULA_OVERSCAN_PX = 140;
const METEOR_MIN_GAP_MS = 18000;
const METEOR_MAX_GAP_MS = 40000;

type Meteor = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  travel: number;
  length: number;
  start: number;
  duration: number;
};

// Star colours (canvas only): mostly white, a few warm, a few blue.
const STAR_WHITE = "#F4F6FA";
const STAR_WARM = "#FFE3B8";
const STAR_BLUE = "#CFDDFF";

type StarLayerSpec = {
  share: number;
  minR: number;
  maxR: number;
  minA: number;
  maxA: number;
};

const LAYER_SPECS: StarLayerSpec[] = [
  { share: 0.52, minR: 0.5, maxR: 0.75, minA: 0.32, maxA: 0.6 },
  { share: 0.31, minR: 0.6, maxR: 1.0, minA: 0.45, maxA: 0.8 },
  { share: 0.17, minR: 0.8, maxR: 1.4, minA: 0.65, maxA: 1 },
];

type Twinkler = {
  layer: number;
  x: number;
  y: number;
  r: number;
  a: number;
  color: string;
  phase: number;
  rate: number;
};

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// nebula:start
type NebulaSpec = { seed: number; freq: number; peakAlpha: number };

// Layer A is the nebula as it always looked. Layer B is a fainter, finer wisp
// layer on the same band that slides against it while it drifts.
const NEBULA_SPEC: NebulaSpec = { seed: NEBULA_SEED, freq: 1, peakAlpha: 0.38 };
const WISP_SPEC: NebulaSpec = { seed: NEBULA_SEED + 4099, freq: 1.6, peakAlpha: 0.14 };

// Nebula colour ramp (canvas only): dim edge, main body, cooler bright core.
const DEEP = [0x0b, 0x1e, 0x45] as const; // #0B1E45
const BRIGHT = [0x12, 0x3a, 0x7a] as const; // #123A7A
const CORE = [0x2a, 0x5f, 0xa8] as const; // #2A5FA8

function hash2(ix: number, iy: number, seed: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number, octaves: number, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(fx, fy, seed + i * 101);
    norm += amp;
    amp *= gain;
    // Rotate a little each octave so lattice lines do not stack up.
    const nx = fx * 1.6 - fy * 1.2;
    const ny = fx * 1.2 + fy * 1.6;
    fx = nx + 17.3;
    fy = ny + 9.1;
  }
  return sum / norm;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * The band axis runs from the lower left to the upper right of the first
 * viewport, like the Milky Way crossing a sky chart.
 */
function makeBandAxis(width: number, height: number) {
  const x0 = -0.1 * width;
  const y0 = 0.98 * height;
  const x1 = 1.1 * width;
  const y1 = 0.08 * height;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  return {
    halfWidth: Math.max(160, 0.16 * Math.hypot(width, height)),
    distance: (x: number, y: number) => (x - x0) * nx + (y - y0) * ny,
  };
}

/** 0..1, 1 on the band's spine. Used to place more stars inside the band. */
function makeBand(width: number, height: number) {
  const axis = makeBandAxis(width, height);
  return (x: number, y: number) => {
    const t = axis.distance(x, y) / axis.halfWidth;
    return Math.exp(-t * t);
  };
}

/**
 * Paints the nebula into RGBA pixels at 1/scale resolution.
 * Domain-warped fbm (two warp passes) gives filaments and curls, a soft
 * noise-modulated mask confines it to the band, and thin ridged dust lanes
 * take out at most 35 percent of local density.
 */
function nebulaPixels(
  viewWidth: number,
  viewportHeight: number,
  overscan: number,
  extra: number,
  scale: number,
  octaves: number,
  alphaScale: number,
  spec: NebulaSpec,
) {
  const { seed, freq, peakAlpha } = spec;
  // Pixel (0, 0) sits at (-overscan, -overscan) in viewport coordinates, so the
  // viewport part of the picture is the same as it was before the overscan.
  const width = viewWidth + 2 * overscan;
  const fullHeight = viewportHeight + 2 * overscan + extra;
  const w = Math.max(1, Math.ceil(width / scale));
  const h = Math.max(1, Math.ceil(fullHeight / scale));
  const axis = makeBandAxis(viewWidth, viewportHeight);

  // The warp field and band width are low frequency, so compute them on a
  // coarse grid and interpolate.
  const grid = 4;
  const gw = Math.ceil(w / grid) + 2;
  const gh = Math.ceil(h / grid) + 2;
  const warpX = new Float32Array(gw * gh);
  const warpY = new Float32Array(gw * gh);
  const widthMod = new Float32Array(gw * gh);
  const warpPx = 300;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = gx * grid * scale - overscan;
      const y = gy * grid * scale - overscan;
      const ux = (x * freq) / 650;
      const uy = (y * freq) / 650;
      const qx = fbm(ux, uy, seed + 1, 3);
      const qy = fbm(ux + 5.2, uy + 1.3, seed + 2, 3);
      const rx = fbm(ux + 4 * qx + 1.7, uy + 4 * qy + 9.2, seed + 3, 3);
      const ry = fbm(ux + 4 * qx + 8.3, uy + 4 * qy + 2.8, seed + 4, 3);
      const k = gy * gw + gx;
      warpX[k] = (rx - 0.5) * warpPx;
      warpY[k] = (ry - 0.5) * warpPx;
      widthMod[k] = fbm(x / 1400, y / 1400, seed + 5, 2);
    }
  }

  const density = new Float32Array(w * h);
  for (let py = 0; py < h; py++) {
    const y = py * scale - overscan;
    const gyf = py / grid;
    const gy0 = Math.floor(gyf);
    const ty = gyf - gy0;
    for (let px = 0; px < w; px++) {
      const x = px * scale - overscan;
      const gxf = px / grid;
      const gx0 = Math.floor(gxf);
      const tx = gxf - gx0;
      const k00 = gy0 * gw + gx0;
      const k10 = k00 + 1;
      const k01 = k00 + gw;
      const k11 = k01 + 1;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const wx = warpX[k00] * w00 + warpX[k10] * w10 + warpX[k01] * w01 + warpX[k11] * w11;
      const wy = warpY[k00] * w00 + warpY[k10] * w10 + warpY[k01] * w01 + warpY[k11] * w11;
      const wm = widthMod[k00] * w00 + widthMod[k10] * w10 + widthMod[k01] * w01 + widthMod[k11] * w11;

      const halfWidth = axis.halfWidth * (0.7 + 0.6 * wm);
      const t = Math.abs(axis.distance(x + wx * 0.5, y + wy * 0.5)) / halfWidth;
      // Outside the band there is nothing to paint; skip the noise.
      if (t >= 1.15) continue;
      const mask = 1 - smoothstep(0.1, 1.15, t);

      const sx = x + wx;
      const sy = y + wy;
      const c = fbm((sx * freq) / 300, (sy * freq) / 300, seed, octaves, 0.58);
      // Body plus the thin contour ridges of the warped field (filaments).
      const ridge = 1 - Math.abs(2 * c - 1);
      // Fine ridged noise along the warped flow reads as wisps and fibres.
      const fn = fbm((sx * freq) / 110 - 7, (sy * freq) / 110 + 3, seed + 17, 3);
      const fibre = Math.pow(1 - Math.abs(2 * fn - 1), 3);
      const body = smoothstep(0.22, 0.8, c);
      let cloud =
        0.18 +
        0.5 * body +
        0.22 * body * fibre +
        0.1 * Math.pow(ridge, 8);

      const dn = fbm((sx * freq) / 150 + 40, (sy * freq) / 150 - 12, seed + 31, 3);
      const lane = smoothstep(0.82, 0.98, 1 - Math.abs(2 * dn - 1));
      cloud *= 1 - 0.35 * lane;

      density[py * w + px] = cloud * mask;
    }
  }

  // Normalise against the densest pixels so the ramp and alpha are stable.
  const bins = 1024;
  const hist = new Uint32Array(bins);
  let counted = 0;
  for (let i = 0; i < density.length; i++) {
    const d = density[i];
    if (d <= 0.02) continue;
    hist[Math.min(bins - 1, Math.floor(d * bins))]++;
    counted++;
  }
  const percentile = (p: number) => {
    let seen = 0;
    const target = counted * p;
    for (let i = 0; i < bins; i++) {
      seen += hist[i];
      if (seen >= target) return (i + 1) / bins;
    }
    return 1;
  };
  const top = Math.max(0.05, percentile(0.995));
  const coreStart = Math.min(0.95, percentile(0.9) / top);

  const data = new Uint8ClampedArray(w * h * 4);
  const peak = peakAlpha * alphaScale * 255;
  let dither = (seed * 2654435761) >>> 0 || 1;
  const nextDither = () => {
    dither ^= dither << 13;
    dither ^= dither >>> 17;
    dither ^= dither << 5;
    dither >>>= 0;
    return (dither / 4294967296) * 2 - 1;
  };

  for (let i = 0; i < density.length; i++) {
    const d = Math.min(1, density[i] / top);
    let r: number;
    let g: number;
    let b: number;
    if (d < coreStart) {
      const m = smoothstep(0, coreStart, d);
      r = DEEP[0] + (BRIGHT[0] - DEEP[0]) * m;
      g = DEEP[1] + (BRIGHT[1] - DEEP[1]) * m;
      b = DEEP[2] + (BRIGHT[2] - DEEP[2]) * m;
    } else {
      const m = smoothstep(coreStart, 1, d);
      r = BRIGHT[0] + (CORE[0] - BRIGHT[0]) * m;
      g = BRIGHT[1] + (CORE[1] - BRIGHT[1]) * m;
      b = BRIGHT[2] + (CORE[2] - BRIGHT[2]) * m;
    }
    const o = i * 4;
    // One level of noise breaks up 8-bit banding without visible grain.
    data[o] = Math.round(r + nextDither());
    data[o + 1] = Math.round(g + nextDither());
    data[o + 2] = Math.round(b + nextDither());
    data[o + 3] = d <= 0 ? 0 : Math.round(peak * Math.pow(d, 1.1) + nextDither());
  }

  return { data, w, h };
}
// nebula:end

/**
 * Renders one nebula layer straight into its on-screen canvas at 1/scale
 * resolution. The canvas is resized and filled in the same task, so the old
 * picture is never seen blank.
 */
function paintNebulaLayer(
  target: HTMLCanvasElement,
  viewWidth: number,
  viewHeight: number,
  overscan: number,
  extra: number,
  scale: number,
  octaves: number,
  alphaScale: number,
  spec: NebulaSpec,
) {
  const { data, w, h } = nebulaPixels(
    viewWidth,
    viewHeight,
    overscan,
    extra,
    scale,
    octaves,
    alphaScale,
    spec,
  );
  target.width = w;
  target.height = h;
  target.style.left = `${-overscan}px`;
  target.style.top = `${-overscan}px`;
  target.style.width = `${viewWidth + 2 * overscan}px`;
  target.style.height = `${viewHeight + 2 * overscan + extra}px`;
  target.style.transformOrigin = `${overscan + viewWidth / 2}px ${overscan + viewHeight / 2}px`;
  const octx = target.getContext("2d");
  if (!octx) return;
  const image = octx.createImageData(w, h);
  image.data.set(data);
  octx.putImageData(image, 0, 0);
}

/** cubic-bezier(0.23, 1, 0.32, 1), the site's easing, solved for y at x. */
function easeOut(x: number) {
  const x1 = 0.23;
  const y1 = 1;
  const x2 = 0.32;
  const y2 = 1;
  const bez = (t: number, a: number, b: number) =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, y1, y2);
}

/** Positions to draw a disc of radius r at p so a tile of the given size wraps. */
function edgeCopies(p: number, r: number, size: number) {
  const copies = [p];
  if (p < r) copies.push(p + size);
  else if (p > size - r) copies.push(p - size);
  return copies;
}

function pickStarColor(rand: () => number) {
  const roll = rand();
  if (roll < 0.09) return STAR_WARM;
  if (roll < 0.19) return STAR_BLUE;
  return STAR_WHITE;
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nebulaWrapRef = useRef<HTMLDivElement | null>(null);
  const nebulaARef = useRef<HTMLCanvasElement | null>(null);
  const nebulaBRef = useRef<HTMLCanvasElement | null>(null);
  const performanceProfile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const graphDragRef = useRef(false);
  const graphDragListenerRef = useRef<(() => void) | null>(null);
  const motionOff = useMotionOff();
  const motionListenerRef = useRef<(() => void) | null>(null);

  // Tell the running canvas effect when the motion switch changes.
  useEffect(() => {
    motionListenerRef.current?.();
  }, [motionOff]);

  useEffect(() => {
    const onGraphDrag = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      graphDragRef.current = Boolean(detail?.active);
      graphDragListenerRef.current?.();
    };

    window.addEventListener(GRAPH_DRAG_PERFORMANCE_EVENT, onGraphDrag);
    return () => {
      window.removeEventListener(GRAPH_DRAG_PERFORMANCE_EVENT, onGraphDrag);
    };
  }, []);

  const disabled = diagnostics.disableBackground;

  useEffect(() => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const quality = performanceProfile.background;
    const lite = quality.maxDpr <= 1;
    // Layer B is skipped on lite, so hide any copy a heavier profile painted.
    if (lite && nebulaBRef.current) nebulaBRef.current.dataset.ready = "false";
    const nebulaScale = lite ? 3 : 2;
    const nebulaOctaves = lite ? 5 : 6;

    let reduceMotion = getMotionOff();

    let dpr = 1;
    let width = 0;
    let height = 0;
    // The nebula keeps the viewport size it was painted for, so an old one can
    // be drawn scaled while a new one is rendered after a resize.
    let nebula: {
      viewWidth: number;
      viewHeight: number;
      extra: number;
    } | null = null;
    let layers: HTMLCanvasElement[] = [];
    let twinklers: Twinkler[] = [];
    let meteor: Meteor | null = null;
    // Star tile size in CSS px (the star canvas size), and the drift state:
    // one wrapped offset per layer, a unit direction along the band, and the
    // last drift frame time (0 while drift is stopped).
    let tileW = 0;
    let tileH = 0;
    const driftX = [0, 0, 0];
    const driftY = [0, 0, 0];
    let driftUx = 1;
    let driftUy = 0;
    let driftLast = 0;
    let offsetReportedAt = 0;
    const driftFrameMs =
      1000 / (performanceProfile.quality === "full" ? DRIFT_FPS_FULL : DRIFT_FPS_BALANCED);
    const wrapMod = (value: number, size: number) =>
      size > 0 ? ((value % size) + size) % size : 0;

    const requiredNebulaExtra = () =>
      Math.ceil(
        Math.max(
          height * 0.6,
          (document.documentElement.scrollHeight - height) * PARALLAX.nebula + 80,
        ),
      );

    // Overscan is a whole number of nebula pixels so the half-scale grid lines up.
    const overscan = Math.ceil(NEBULA_OVERSCAN_PX / nebulaScale) * nebulaScale;

    const paintLayer = (
      target: HTMLCanvasElement | null,
      view: { viewWidth: number; viewHeight: number; extra: number },
      spec: NebulaSpec,
    ) => {
      if (!target) return;
      paintNebulaLayer(
        target,
        view.viewWidth,
        view.viewHeight,
        overscan,
        view.extra,
        nebulaScale,
        nebulaOctaves,
        quality.blobAlphaScale,
        spec,
      );
      // CSS fades the layer in (opacity) the first time it has pixels.
      target.dataset.ready = "true";
    };

    // The drift runs along the band and across it; keyframes read these two
    // unit vectors from the wrapper.
    const setDriftAxis = () => {
      const wrap = nebulaWrapRef.current;
      if (!wrap) return;
      const dx = 1.2 * width;
      const dy = -0.9 * height;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      wrap.style.setProperty("--nb-ux", ux.toFixed(4));
      wrap.style.setProperty("--nb-uy", uy.toFixed(4));
      wrap.style.setProperty("--nb-vx", (-uy).toFixed(4));
      wrap.style.setProperty("--nb-vy", ux.toFixed(4));
    };

    const buildStars = () => {
      const rand = mulberry32(STAR_SEED);
      const band = makeBand(width, height);
      const total = Math.min(
        Math.floor(((width * height) / quality.starAreaDivisor) * 2.2),
        Math.floor(quality.starCap * 2.2),
      );

      layers = [];
      twinklers = [];
      LAYER_SPECS.forEach((spec, layerIndex) => {
        const layer = document.createElement("canvas");
        layer.width = Math.floor(width * dpr);
        layer.height = Math.floor(height * dpr);
        const lctx = layer.getContext("2d");
        layers.push(layer);
        if (!lctx) return;
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const count = Math.round(total * spec.share);
        let placed = 0;
        let guard = 0;
        while (placed < count && guard < count * 12) {
          guard++;
          const x = rand() * tileW;
          const y = rand() * tileH;
          // Denser inside the band, still present everywhere.
          const keep = 0.3 + 0.7 * band(x, y);
          if (rand() > keep) continue;
          placed++;

          const r = spec.minR + rand() * (spec.maxR - spec.minR);
          const a = spec.minA + rand() * (spec.maxA - spec.minA);
          const color = pickStarColor(rand);

          if (rand() < TWINKLE_SHARE) {
            twinklers.push({
              layer: layerIndex,
              x,
              y,
              r,
              a,
              color,
              phase: rand() * Math.PI * 2,
              // Slow: one full cycle every 3 to 7 seconds.
              rate: (Math.PI * 2) / (3000 + rand() * 4000),
            });
            continue;
          }

          lctx.globalAlpha = a;
          lctx.fillStyle = color;
          // A star near an edge is also painted on the opposite edge so the
          // layer tiles with no seam.
          const xs = edgeCopies(x, r, tileW);
          const ys = edgeCopies(y, r, tileH);
          for (const cx of xs) {
            for (const cy of ys) {
              lctx.beginPath();
              lctx.arc(cx, cy, r, 0, Math.PI * 2);
              lctx.fill();
            }
          }
        }
      });
    };

    const sizeCanvas = () => {
      dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      tileW = canvas.width / dpr;
      tileH = canvas.height / dpr;
      // Drift runs along the nebula band's diagonal (the same axis as setDriftAxis).
      const dx = 1.2 * width;
      const dy = -0.9 * height;
      const len = Math.hypot(dx, dy) || 1;
      driftUx = dx / len;
      driftUy = dy / len;
      // Keep the running offsets valid for the new tile size.
      for (let i = 0; i < driftX.length; i++) {
        driftX[i] = wrapMod(driftX[i], tileW);
        driftY[i] = wrapMod(driftY[i], tileH);
      }
    };

    // Drift runs on full and balanced only, and under the same rules as twinkle.
    const driftActive = () =>
      !lite && !reduceMotion && !document.hidden && !graphDragRef.current && layers.length > 0;

    const advanceDrift = (now: number) => {
      if (driftLast === 0) {
        driftLast = now;
        return;
      }
      const dt = Math.min(DRIFT_MAX_DT_MS, Math.max(0, now - driftLast));
      driftLast = now;
      for (let i = 0; i < driftX.length; i++) {
        const step = (DRIFT_PX_PER_S[i] * dt) / 1000;
        driftX[i] = wrapMod(driftX[i] + driftUx * step, tileW);
        driftY[i] = wrapMod(driftY[i] + driftUy * step, tileH);
      }
    };

    let needsNextFrame = false;
    const draw = (now: number) => {
      needsNextFrame = false;
      const scrollY = reduceMotion ? 0 : window.scrollY;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Stars only: the canvas stays transparent so the nebula layers show through.
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Nebula parallax is one transform on the wrapper around both layers.
      const wrap = nebulaWrapRef.current;
      if (wrap) {
        const offset = nebula ? Math.min(scrollY * PARALLAX.nebula, nebula.extra) : 0;
        wrap.style.transform = `translate3d(0, ${-offset}px, 0)`;
      }

      if (driftActive()) advanceDrift(now);

      // Each layer tiles in both directions: draw it at its wrapped offset and
      // at the copies one tile before, so the 2 by 2 wrap covers the canvas.
      const pixelW = canvas.width;
      const pixelH = canvas.height;
      layers.forEach((layer, index) => {
        const shiftX = wrapMod(driftX[index] * dpr, pixelW);
        const shiftY = wrapMod((driftY[index] - scrollY * PARALLAX.layers[index]) * dpr, pixelH);
        const xs = shiftX === 0 ? [0] : [shiftX - pixelW, shiftX];
        const ys = shiftY === 0 ? [0] : [shiftY - pixelH, shiftY];
        for (const x of xs) {
          for (const y of ys) ctx.drawImage(layer, x, y);
        }
      });

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const star of twinklers) {
        const x = wrapMod(star.x + driftX[star.layer], tileW);
        const y = wrapMod(
          star.y + driftY[star.layer] - scrollY * PARALLAX.layers[star.layer],
          tileH,
        );
        const wave = reduceMotion ? 1 : 0.55 + 0.45 * Math.sin(now * star.rate + star.phase);
        ctx.globalAlpha = star.a * wave;
        ctx.fillStyle = star.color;
        for (const cx of edgeCopies(x, star.r, tileW)) {
          for (const cy of edgeCopies(y, star.r, tileH)) {
            ctx.beginPath();
            ctx.arc(cx, cy, star.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;

      // Debug value for browser checks: the far layer's drift offset, about once a second.
      if (now - offsetReportedAt >= STAR_OFFSET_REPORT_MS) {
        offsetReportedAt = now;
        canvas.dataset.starOffset = `${driftX[0].toFixed(1)},${driftY[0].toFixed(1)}`;
      }

      if (meteor) {
        const m = meteor;
        const t = (now - m.start) / m.duration;
        if (t >= 1 || reduceMotion) {
          meteor = null;
        } else {
          // Quick fade in, long fade out. The head moves, the tail trails it.
          const alpha = Math.min(t / 0.15, 1) * Math.min((1 - t) / 0.45, 1);
          const moved = m.travel * easeOut(Math.max(0, t));
          const hx = m.x + m.dx * moved;
          const hy = m.y + m.dy * moved;
          const tx = hx - m.dx * m.length;
          const ty = hy - m.dy * m.length;
          const gradient = ctx.createLinearGradient(tx, ty, hx, hy);
          gradient.addColorStop(0, "rgba(244, 246, 250, 0)");
          gradient.addColorStop(1, "rgba(244, 246, 250, 1)");
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1;
          ctx.lineCap = "butt";
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          ctx.globalAlpha = 1;
          needsNextFrame = true;
        }
      }
    };

    // One composite loop. A requested draw (scroll, resize, twinkle, meteor start)
    // runs on the next frame. While drift or a meteor runs it keeps going, and
    // the drift frames are capped by driftFrameMs. Nothing is re-rendered.
    let frameId = 0;
    let lastFrameAt = 0;
    let forced = false;
    const scheduleFrame = () => {
      if (frameId) return;
      frameId = requestAnimationFrame((now) => {
        frameId = 0;
        const due = forced || needsNextFrame || now - lastFrameAt >= driftFrameMs - 2;
        if (due) {
          forced = false;
          lastFrameAt = now;
          draw(now);
        }
        const drifting = driftActive();
        if (!drifting) driftLast = 0;
        // Keep going only while a meteor is flying or the stars drift.
        if (needsNextFrame || drifting) scheduleFrame();
      });
    };
    const requestDraw = () => {
      forced = true;
      scheduleFrame();
    };

    // The nebula takes a few hundred ms to paint, so it never runs during
    // load or a resize: it waits for idle time and then fades in once.
    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let nebulaDebounce = 0;
    let nebulaIdle = 0;
    let nebulaFallback = 0;
    const cancelNebula = () => {
      window.clearTimeout(nebulaDebounce);
      window.clearTimeout(nebulaFallback);
      if (nebulaIdle && idle.cancelIdleCallback) idle.cancelIdleCallback(nebulaIdle);
      nebulaDebounce = 0;
      nebulaFallback = 0;
      nebulaIdle = 0;
    };
    const queueIdle = (task: () => void) => {
      if (idle.requestIdleCallback) {
        nebulaIdle = idle.requestIdleCallback(task, { timeout: 600 });
      } else {
        nebulaFallback = window.setTimeout(task, 120);
      }
    };
    // Layer B is painted in its own idle slot after layer A, and never on lite.
    const paintWisp = (view: { viewWidth: number; viewHeight: number; extra: number }) => {
      nebulaIdle = 0;
      nebulaFallback = 0;
      paintLayer(nebulaBRef.current, view, WISP_SPEC);
    };
    const paintNebula = () => {
      nebulaIdle = 0;
      nebulaFallback = 0;
      const view = { viewWidth: width, viewHeight: height, extra: requiredNebulaExtra() };
      nebula = view;
      setDriftAxis();
      paintLayer(nebulaARef.current, view, NEBULA_SPEC);
      requestDraw();
      if (!lite) queueIdle(() => paintWisp(view));
    };
    const scheduleNebula = (debounceMs: number) => {
      cancelNebula();
      const queue = () => {
        nebulaDebounce = 0;
        queueIdle(paintNebula);
      };
      if (debounceMs > 0) nebulaDebounce = window.setTimeout(queue, debounceMs);
      else queue();
    };

    let twinkleTimer = 0;
    const stopTwinkle = () => {
      window.clearInterval(twinkleTimer);
      twinkleTimer = 0;
    };
    // One rare meteor at a time. The timer only exists while a meteor is allowed.
    let meteorTimer = 0;
    const meteorAllowed = () =>
      !lite && !reduceMotion && !document.hidden && !graphDragRef.current;
    const stopMeteor = () => {
      window.clearTimeout(meteorTimer);
      meteorTimer = 0;
      if (meteor) {
        meteor = null;
        requestDraw();
      }
    };
    const spawnMeteor = (now: number) => {
      const length = 120 + Math.random() * 100;
      // Shallow diagonal: 12 to 28 degrees below the horizontal, either way.
      const angle = ((12 + Math.random() * 16) * Math.PI) / 180;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const travel = 260 + Math.random() * 220;
      meteor = {
        x: width * (0.15 + Math.random() * 0.7),
        y: height * (0.05 + Math.random() * 0.5),
        dx: Math.cos(angle) * dir,
        dy: Math.sin(angle),
        travel,
        length,
        start: now,
        duration: 500 + Math.random() * 200,
      };
      requestDraw();
    };
    const scheduleMeteor = () => {
      const gap = METEOR_MIN_GAP_MS + Math.random() * (METEOR_MAX_GAP_MS - METEOR_MIN_GAP_MS);
      meteorTimer = window.setTimeout(() => {
        meteorTimer = 0;
        if (!meteorAllowed()) return;
        spawnMeteor(performance.now());
        scheduleMeteor();
      }, gap);
    };
    const syncMeteor = () => {
      if (!meteorAllowed()) {
        if (meteorTimer || meteor) stopMeteor();
      } else if (!meteorTimer) {
        scheduleMeteor();
      }
    };

    const syncTwinkle = () => {
      // The compositor drift pauses with the tab and during a graph drag.
      const wrap = nebulaWrapRef.current;
      if (wrap) wrap.dataset.paused = document.hidden || graphDragRef.current ? "true" : "false";
      // While the stars drift, the composite loop already redraws the twinklers.
      const drifting = driftActive();
      if (drifting) {
        scheduleFrame();
      } else {
        driftLast = 0;
      }
      const shouldRun =
        !reduceMotion &&
        !document.hidden &&
        !graphDragRef.current &&
        twinklers.length > 0 &&
        !drifting;
      if (shouldRun && !twinkleTimer) {
        twinkleTimer = window.setInterval(
          requestDraw,
          Math.max(TWINKLE_MIN_INTERVAL_MS, quality.frameMs),
        );
      } else if (!shouldRun && twinkleTimer) {
        stopTwinkle();
      }
      syncMeteor();
    };

    const rebuildStars = () => {
      sizeCanvas();
      buildStars();
      syncTwinkle();
      requestDraw();
    };
    // Debug value for browser checks, so it exists before the first report.
    canvas.dataset.starOffset = "0.0,0.0";
    rebuildStars();
    scheduleNebula(0);

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(rebuildStars, 160);
      // The old nebula stays on screen, scaled, until the new one is ready.
      scheduleNebula(NEBULA_RESIZE_DEBOUNCE_MS);
    };

    // Lazy sections grow the page later; extend the nebula only when needed.
    const pageObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (!nebula || requiredNebulaExtra() <= nebula.extra + 40) return;
            scheduleNebula(400);
          });
    pageObserver?.observe(document.body);

    const onScroll = () => {
      if (!reduceMotion) requestDraw();
    };

    const onVisibility = () => {
      syncTwinkle();
      if (!document.hidden) requestDraw();
    };

    // Re-reads the one motion switch.
    const applyMotionState = () => {
      // The drift itself follows html[data-motion] in CSS, so it switches live.
      reduceMotion = getMotionOff();
      syncTwinkle();
      requestDraw();
    };

    graphDragListenerRef.current = syncTwinkle;
    motionListenerRef.current = applyMotionState;
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
      stopTwinkle();
      window.clearTimeout(meteorTimer);
      window.clearTimeout(resizeTimer);
      cancelNebula();
      pageObserver?.disconnect();
      graphDragListenerRef.current = null;
      motionListenerRef.current = null;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [performanceProfile.background, disabled]);

  if (disabled) {
    return null;
  }

  // The nebula sits behind the star canvas in its own fixed layers, so the
  // browser compositor moves it. The wrapper takes the scroll parallax and the
  // two layers take the CSS drift (see index.css).
  const layerStyle = {
    transition: `opacity ${NEBULA_FADE_MS}ms cubic-bezier(0.23, 1, 0.32, 1)`,
  };

  return (
    <>
      <div
        ref={nebulaWrapRef}
        aria-hidden="true"
        data-nebula-wrap=""
        data-paused="false"
        className="nebula-wrap pointer-events-none fixed inset-0 -z-10"
      >
        <canvas
          ref={nebulaARef}
          aria-hidden="true"
          data-nebula-layer="a"
          data-ready="false"
          style={layerStyle}
          className="nebula-layer nebula-layer-a pointer-events-none"
        />
        <canvas
          ref={nebulaBRef}
          aria-hidden="true"
          data-nebula-layer="b"
          data-ready="false"
          style={layerStyle}
          className="nebula-layer nebula-layer-b pointer-events-none"
        />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      />
    </>
  );
}
