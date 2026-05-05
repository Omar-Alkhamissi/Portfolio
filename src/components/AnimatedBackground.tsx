import { useEffect, useRef } from "react";

/**
 * Animated background — a parallax starfield with a slow drifting nebula
 * and a subtle interactive vignette that follows the cursor.
 *
 * Implementation notes:
 * - One <canvas> element, sized to viewport with devicePixelRatio scaling.
 * - Stars are stored in a flat typed array (Float32Array) for cache locality.
 * - Animation runs in a single requestAnimationFrame loop.
 * - Honors `prefers-reduced-motion` by rendering a single static frame.
 * - Pauses when the tab is hidden to save CPU.
 */
export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Star field — three depth layers for parallax.
    // Each star: [x, y, baseRadius, twinklePhase, layer]
    const STAR_COUNT = Math.min(
      Math.floor((width * height) / 9000),
      260 // hard cap for low-end devices
    );
    const stars = new Float32Array(STAR_COUNT * 5);
    const seed = (i: number) => {
      const layer = i % 3; // 0 = far, 1 = mid, 2 = near
      stars[i * 5 + 0] = Math.random() * width;
      stars[i * 5 + 1] = Math.random() * height;
      stars[i * 5 + 2] = 0.3 + Math.random() * (layer === 2 ? 1.6 : 0.9);
      stars[i * 5 + 3] = Math.random() * Math.PI * 2;
      stars[i * 5 + 4] = layer;
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

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current.x = e.clientX / window.innerWidth;
      pointerRef.current.y = e.clientY / window.innerHeight;
    };

    let frameId = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 16.6667, 2); // delta in 60fps frames, clamp
      last = now;

      // Clear with translucent ink to leave subtle motion trails on near-layer stars
      ctx.fillStyle = "rgba(8, 9, 12, 1)";
      ctx.fillRect(0, 0, width, height);

      // Nebula blobs
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
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

      // Pointer parallax — shift stars subtly toward cursor
      const px = (pointerRef.current.x - 0.5) * 16;
      const py = (pointerRef.current.y - 0.5) * 16;

      // Stars
      for (let i = 0; i < STAR_COUNT; i++) {
        const idx = i * 5;
        const layer = stars[idx + 4];
        const parX = px * (layer + 1) * 0.5;
        const parY = py * (layer + 1) * 0.5;
        stars[idx + 3] += 0.012 * dt; // twinkle phase
        const twinkle = 0.55 + 0.45 * Math.sin(stars[idx + 3]);
        const r = stars[idx + 2] * twinkle;
        const alpha = 0.35 + 0.55 * (layer / 2) * twinkle;
        ctx.beginPath();
        ctx.fillStyle = `rgba(190, 220, 255, ${alpha})`;
        ctx.arc(stars[idx] + parX, stars[idx + 1] + parY, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cursor halo
      ctx.save();
      const hx = pointerRef.current.x * width;
      const hy = pointerRef.current.y * height;
      const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, 220);
      halo.addColorStop(0, "rgba(125, 211, 252, 0.07)");
      halo.addColorStop(1, "rgba(125, 211, 252, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      if (!reduceMotion && !document.hidden) {
        frameId = requestAnimationFrame(draw);
      }
    };

    if (reduceMotion) {
      // Render one frame so the field still feels textured.
      draw(performance.now());
    } else {
      frameId = requestAnimationFrame(draw);
    }

    const onVisibility = () => {
      if (!document.hidden && !reduceMotion) {
        last = performance.now();
        frameId = requestAnimationFrame(draw);
      } else {
        cancelAnimationFrame(frameId);
      }
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

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
