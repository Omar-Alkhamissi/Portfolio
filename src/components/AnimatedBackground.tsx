import { useEffect, useRef, useState } from "react";
import {
  GRAPH_DRAG_PERFORMANCE_EVENT,
  useAdaptivePerformanceProfile,
  usePerformanceDiagnosticFlags,
} from "../lib/performance";

/**
 * Animated background — a drifting starfield with a soft nebula wash.
 *
 * Implementation notes:
 * - One <canvas> element, sized to viewport with devicePixelRatio scaling.
 * - Stars are stored in a flat typed array (Float32Array) for cache locality.
 * - Animation runs in a single requestAnimationFrame loop.
 * - Honors `prefers-reduced-motion` by slowing motion instead of freezing it.
 * - Pauses when the tab is hidden to save CPU.
 */
export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const performanceProfile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const [graphDragActive, setGraphDragActive] = useState(false);

  useEffect(() => {
    const onGraphDrag = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setGraphDragActive(Boolean(detail?.active));
    };

    window.addEventListener(GRAPH_DRAG_PERFORMANCE_EVENT, onGraphDrag);
    return () => {
      window.removeEventListener(GRAPH_DRAG_PERFORMANCE_EVENT, onGraphDrag);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const backgroundQuality = performanceProfile.background;

    const reduceMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    let reduceMotion = reduceMotionQuery.matches;
    const motionScale = () => (reduceMotion ? 0.5 : 1);

    let dpr = Math.min(window.devicePixelRatio || 1, backgroundQuality.maxDpr);
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Star field — three depth layers for parallax.
    // Each star: [x, y, baseRadius, twinklePhase, layer, angle, speed, driftPhase, driftRate, twinkleRate]
    const STAR_COUNT = Math.min(
      Math.floor((width * height) / backgroundQuality.starAreaDivisor),
      backgroundQuality.starCap,
    );
    const STAR_SIZE = 10;
    const stars = new Float32Array(STAR_COUNT * STAR_SIZE);
    const layerSpeedRange = [
      { min: 0.08, max: 0.14 },
      { min: 0.14, max: 0.22 },
      { min: 0.22, max: 0.32 },
    ] as const;
    const seed = (i: number) => {
      const idx = i * STAR_SIZE;
      const layer = i % 3; // 0 = far, 1 = mid, 2 = near
      const speedRange = layerSpeedRange[layer];
      stars[idx + 0] = Math.random() * width;
      stars[idx + 1] = Math.random() * height;
      stars[idx + 2] = 0.42 + Math.random() * (layer === 2 ? 1.45 : 0.95);
      stars[idx + 3] = Math.random() * Math.PI * 2;
      stars[idx + 4] = layer;
      stars[idx + 5] = Math.random() * Math.PI * 2;
      stars[idx + 6] =
        speedRange.min + Math.random() * (speedRange.max - speedRange.min);
      stars[idx + 7] = Math.random() * Math.PI * 2;
      stars[idx + 8] = 0.005 + Math.random() * 0.01;
      stars[idx + 9] = 0.028 + Math.random() * 0.045;
    };
    for (let i = 0; i < STAR_COUNT; i++) seed(i);

    // Drifting nebula blobs — large radial gradients.
    type Blob = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      hue: number;
      alpha: number;
    };
    const blobs: Blob[] = [
      { x: width * 0.2, y: height * 0.3, vx: 0.04, vy: 0.02, r: 380, hue: 199, alpha: 0.18 },
      { x: width * 0.8, y: height * 0.6, vx: -0.03, vy: -0.02, r: 460, hue: 210, alpha: 0.14 },
      { x: width * 0.5, y: height * 0.85, vx: 0.02, vy: -0.03, r: 340, hue: 192, alpha: 0.12 },
    ];
    for (const blob of blobs) {
      blob.r *= backgroundQuality.blobRadiusScale;
      blob.alpha *= backgroundQuality.blobAlphaScale;
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, backgroundQuality.maxDpr);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let frameId = 0;
    let last = performance.now();
    let lastDraw = 0;

    const draw = (now: number) => {
      if (now - lastDraw < backgroundQuality.frameMs) {
        frameId = requestAnimationFrame(draw);
        return;
      }

      const dt = Math.min((now - last) / 16.6667, 2); // delta in 60fps frames, clamp
      last = now;
      lastDraw = now;

      // Leave a faint trail so the drift reads more clearly at idle.
      ctx.fillStyle = "rgba(8, 9, 12, 0.95)";
      ctx.fillRect(0, 0, width, height);

      // Nebula blobs
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        b.x += b.vx * dt * motionScale();
        b.y += b.vy * dt * motionScale();
        if (b.x < -b.r) b.x = width + b.r;
        if (b.x > width + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = height + b.r;
        if (b.y > height + b.r) b.y = -b.r;

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `hsla(${b.hue}, 80%, 65%, ${b.alpha})`);
        grad.addColorStop(0.5, `hsla(${b.hue}, 80%, 50%, ${b.alpha * 0.35})`);
        grad.addColorStop(1, "hsla(199, 80%, 50%, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
      ctx.restore();

      // Stars
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < STAR_COUNT; i++) {
        const idx = i * STAR_SIZE;
        const layer = stars[idx + 4];
        const wrapPad = 24 + layer * 10;
        stars[idx + 7] += stars[idx + 8] * dt * motionScale();
        const angle =
          stars[idx + 5] +
          Math.sin(stars[idx + 7]) * 1.05 +
          Math.cos(stars[idx + 7] * 0.47 + i * 0.31) * 0.3;
        stars[idx + 0] += Math.cos(angle) * stars[idx + 6] * dt * motionScale();
        stars[idx + 1] += Math.sin(angle) * stars[idx + 6] * dt * motionScale();
        if (stars[idx + 0] < -wrapPad) stars[idx + 0] = width + wrapPad;
        else if (stars[idx + 0] > width + wrapPad) stars[idx + 0] = -wrapPad;
        if (stars[idx + 1] < -wrapPad) stars[idx + 1] = height + wrapPad;
        else if (stars[idx + 1] > height + wrapPad) stars[idx + 1] = -wrapPad;
        stars[idx + 3] += stars[idx + 9] * dt * motionScale();
        const twinkleWave = 0.5 + 0.5 * Math.sin(stars[idx + 3]);
        const twinkle = 0.72 + twinkleWave * 0.95;
        const sparkle =
          Math.pow(0.5 + 0.5 * Math.sin(stars[idx + 3] * 0.45 + i * 0.61), 8) *
          (0.08 + layer * 0.08);
        const r = stars[idx + 2] * twinkle;
        const alpha = 0.16 + layer * 0.12 + twinkleWave * 0.38 + sparkle;
        const x = stars[idx];
        const y = stars[idx + 1];
        ctx.beginPath();
        ctx.fillStyle = `rgba(125, 211, 252, ${0.04 + alpha * 0.12})`;
        ctx.arc(x, y, r * (2.5 + layer * 0.45), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `rgba(190, 220, 255, ${alpha})`;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (!document.hidden) {
        frameId = requestAnimationFrame(draw);
      }
    };

    frameId = requestAnimationFrame(draw);

    const onVisibility = () => {
      if (!document.hidden) {
        last = performance.now();
        lastDraw = 0;
        frameId = requestAnimationFrame(draw);
      } else {
        cancelAnimationFrame(frameId);
      }
    };

    const onReduceMotionChange = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
    };

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    reduceMotionQuery.addEventListener("change", onReduceMotionChange);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotionQuery.removeEventListener("change", onReduceMotionChange);
    };
  }, [performanceProfile.background]);

  if (diagnostics.disableBackground || graphDragActive) {
    return null;
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20 h-full w-full"
      />
      {/* Static grid overlay on top of the canvas — gives architectural feel */}
      <div
        aria-hidden="true"
        className="bg-grid pointer-events-none fixed inset-0 -z-10 opacity-[0.45]"
      />
    </>
  );
}
