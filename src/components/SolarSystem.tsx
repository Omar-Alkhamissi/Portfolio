import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useInView } from "framer-motion";
import { skillGroups } from "../data/skills";
import { useMotionOff } from "../lib/motion";
import { MotionToggle } from "./MotionToggle";
import {
  useAdaptivePerformanceProfile,
  usePerformanceDiagnosticFlags,
} from "../lib/performance";

/**
 * Skills as an orrery.
 *
 * - Each skill group is one orbit ring, each skill one planet on it.
 * - All rings turn the same way. Period follows Kepler's third law:
 *   period = 60s * (r / rInner)^1.5.
 * - At rest the orrery is seen at an angle. Pointing at a group (ring planet or
 *   list row) stops the system, swings it face-on and labels that group's planets.
 * - Planets trail a short arc behind them; the tail follows how fast the system turns.
 * - One rAF loop writes transforms straight to SVG refs.
 */

// Square box that just fits the outer ring; labels overflow the SVG instead of padding it.
const VIEWBOX = 490;
const CENTER = VIEWBOX / 2;
const SUN_RADIUS = 6;
const SUN_PERCENT = ((SUN_RADIUS * 2) / VIEWBOX) * 100;
const RING_INNER = 46;
const RING_STEP = 24;
const PERIOD_INNER_S = 60;
const PLANET_RADIUS = 3;
const PLANET_RADIUS_ACTIVE = 5;
const HIT_RADIUS = 12;
const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_ENTER = "cubic-bezier(0.05, 0.7, 0.1, 1)";
// Time scale eases to its target with this time constant (about 400ms to settle).
const TIME_SCALE_TAU_S = 0.13;

// Tilt: seen at an angle at rest, face-on while a group is active.
const TILT_DEG = 58;
const TILT_MS = 500;
const PERSPECTIVE_PX = 1000;
// Space kept around the tilted disc; the box grows to the full square when face-on.
const TILTED_MARGIN_PX = 8;
const FAR_OPACITY_DROP = 0.45;

// Comet tails: four arc segments behind each planet.
const TAIL_OPACITIES = [0.5, 0.3, 0.16, 0.07];
const TAIL_MIN_DEG = 8;
const TAIL_MAX_DEG = 40;
const TAIL_DEG_PER_DEG_S = 40 / 6; // inner ring turns 6 deg/s and gets the longest tail

// Ignition entrance.
const RING_DRAW_MS = 500;
const RING_STAGGER_MS = 60;
const PLANET_IN_MS = 250;
const SUN_IN_MS = 500;
const RAMP_DELAY_MS = 600;
const RAMP_MS = 1200;

type Planet = {
  key: string;
  groupId: string;
  groupTitle: string;
  groupIndex: number;
  skill: string;
  ringRadius: number;
  phase: number;
  period: number;
  tailDeg: number;
};

function ringRadiusFor(groupIndex: number) {
  return RING_INNER + groupIndex * RING_STEP;
}

const OUTER_RING_RADIUS = ringRadiusFor(skillGroups.length - 1);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = x;
    for (let i = 0; i < 20; i += 1) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-4) break;
      if (value < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sampleY(t);
  };
}

const easeMove = cubicBezier(0.2, 0, 0, 1);

function buildPlanets(): Planet[] {
  const out: Planet[] = [];
  skillGroups.forEach((group, gi) => {
    const ringRadius = ringRadiusFor(gi);
    const period = PERIOD_INNER_S * Math.pow(ringRadius / RING_INNER, 1.5);
    const degPerSecond = 360 / period;
    const tailDeg = clamp(degPerSecond * TAIL_DEG_PER_DEG_S, TAIL_MIN_DEG, TAIL_MAX_DEG);
    const ringPhase = -Math.PI / 2 + gi * 0.7;
    group.items.forEach((skill, si) => {
      out.push({
        key: `${group.id}::${skill}`,
        groupId: group.id,
        groupTitle: group.title,
        groupIndex: gi,
        skill,
        ringRadius,
        phase: ringPhase + (si / group.items.length) * Math.PI * 2,
        period,
        tailDeg,
      });
    });
  });
  return out;
}

// Path of one tail segment in the planet's rotating frame (planet sits at angle 0).
function tailSegmentPath(radius: number, tailDeg: number, index: number) {
  const segment = (tailDeg / TAIL_OPACITIES.length) * (Math.PI / 180);
  const from = -(index + 1) * segment;
  const to = -index * segment;
  const x1 = radius * Math.cos(from);
  const y1 = radius * Math.sin(from);
  const x2 = radius * Math.cos(to);
  const y2 = radius * Math.sin(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function SolarSystem() {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [labelUnits, setLabelUnits] = useState(14);
  const [ignited, setIgnited] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const orreryRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sunRef = useRef<HTMLSpanElement | null>(null);
  const widthRef = useRef(0);
  const labelLayerRef = useRef<SVGGElement | null>(null);
  const rayRef = useRef<SVGLineElement | null>(null);
  const planetRefs = useRef<Map<string, SVGGElement>>(new Map());
  const labelRefs = useRef<Map<string, SVGTextElement>>(new Map());
  const activeRef = useRef<string | null>(null);
  const sourceRef = useRef<"list" | "orrery">("list");
  const rayKeyRef = useRef<string | null>(null);
  const timeRef = useRef(0);
  const timeScaleRef = useRef(1);
  const tiltRef = useRef(TILT_DEG);
  const tiltFrameRef = useRef(0);
  const tailLevelRef = useRef(-1);
  // null = ignition not started yet (orbits held still); a time = ramp start.
  const igniteStartRef = useRef<number | null>(null);
  const depthOnRef = useRef(true);
  const labelUnitsRef = useRef(labelUnits);
  // How far labels may overflow the SVG on each side, in viewBox units.
  const bleedRef = useRef({ left: 16, right: 16 });
  // True after a press that should pin (touch, or any pointer below lg); false after a key.
  const touchRef = useRef(false);
  // At lg and wider the list sits beside the orrery and hover activates groups.
  const wideRef = useRef(false);

  const inView = useInView(rootRef, { amount: 0.1 });
  const motionOff = useMotionOff();
  const performanceProfile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const motionStill = motionOff || diagnostics.staticMode;
  const entered = ignited || motionStill;
  const planets = useMemo(buildPlanets, []);
  const px = labelUnits / 12; // viewBox units per screen pixel

  depthOnRef.current = performanceProfile.quality !== "lite";

  const rayKey = activeGroup && activeSkill ? `${activeGroup}::${activeSkill}` : null;
  rayKeyRef.current = rayKey;

  const activate = useCallback(
    (groupId: string, skill: string | null = null, source: "list" | "orrery" = "list") => {
      activeRef.current = groupId;
      sourceRef.current = source;
      setActiveGroup(groupId);
      setActiveSkill(skill);
    },
    [],
  );

  const deactivate = useCallback((groupId: string) => {
    if (activeRef.current !== groupId) {
      return;
    }
    activeRef.current = null;
    setActiveGroup(null);
    setActiveSkill(null);
  }, []);

  const clearSkill = useCallback((skill: string) => {
    setActiveSkill((current) => (current === skill ? null : current));
  }, []);

  const toggle = useCallback(
    (groupId: string) => {
      if (activeRef.current === groupId) {
        deactivate(groupId);
      } else {
        activate(groupId);
      }
    },
    [activate, deactivate],
  );

  // Writes planet transforms (with depth fade), the light ray end, and label positions for
  // the active group only.
  const paint = useCallback(() => {
    const time = timeRef.current;
    const active = activeRef.current;
    const fontUnits = labelUnitsRef.current;
    const bleed = bleedRef.current;
    const tiltFactor = tiltRef.current / TILT_DEG;
    const depthOn = depthOnRef.current;
    const rayKeyNow = rayKeyRef.current;

    for (const planet of planets) {
      const angle = planet.phase + (time / planet.period) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const element = planetRefs.current.get(planet.key);
      if (element) {
        element.setAttribute(
          "transform",
          `translate(${CENTER} ${CENTER}) rotate(${((angle * 180) / Math.PI).toFixed(2)})`,
        );
        if (depthOn) {
          // Tilting away from the viewer puts the top of the picture (negative sin) far away.
          const far = smoothstep(-0.25, 0.5, -sin);
          element.setAttribute("opacity", (1 - FAR_OPACITY_DROP * tiltFactor * far).toFixed(3));
        } else {
          element.removeAttribute("opacity");
        }
      }

      if (planet.key === rayKeyNow && rayRef.current) {
        rayRef.current.setAttribute("x2", (CENTER + planet.ringRadius * cos).toFixed(2));
        rayRef.current.setAttribute("y2", (CENTER + planet.ringRadius * sin).toFixed(2));
      }

      if (planet.groupId !== active) {
        continue;
      }
      const label = labelRefs.current.get(planet.key);
      if (!label) {
        continue;
      }
      const labelRadius =
        planet.ringRadius + PLANET_RADIUS_ACTIVE + 6 + Math.abs(sin) * fontUnits * 0.5;
      let lx = CENTER + labelRadius * cos;
      const ly = CENTER + labelRadius * sin;
      const width = planet.skill.length * fontUnits * 0.56;
      let anchor: "start" | "middle" | "end" = "middle";
      if (cos > 0.3) {
        anchor = "start";
        lx = Math.min(lx, VIEWBOX + bleed.right - width);
      } else if (cos < -0.3) {
        anchor = "end";
        lx = Math.max(lx, -bleed.left + width);
      } else {
        lx = Math.min(
          Math.max(lx, -bleed.left + width / 2),
          VIEWBOX + bleed.right - width / 2,
        );
      }
      label.setAttribute("x", lx.toFixed(2));
      label.setAttribute("y", ly.toFixed(2));
      label.setAttribute("text-anchor", anchor);
    }
  }, [planets]);

  // Applies the current tilt to the svg, fades labels in only when nearly face-on, and sizes
  // the box to the disc: the tilted ring is shorter and its near edge reaches further.
  const applyTilt = useCallback(() => {
    const tilt = tiltRef.current;
    if (svgRef.current) {
      svgRef.current.style.transform = `perspective(${PERSPECTIVE_PX}px) rotateX(${tilt.toFixed(2)}deg)`;
    }
    if (labelLayerRef.current) {
      labelLayerRef.current.style.opacity = String(clamp(1 - tilt / 30, 0, 1));
    }

    const width = widthRef.current;
    const box = orreryRef.current;
    if (width <= 0 || !box) {
      return;
    }
    const rad = (tilt * Math.PI) / 180;
    const radius = (OUTER_RING_RADIUS / VIEWBOX) * width;
    const far = (radius * Math.cos(rad)) / (1 + (radius * Math.sin(rad)) / PERSPECTIVE_PX);
    const near = (radius * Math.cos(rad)) / (1 - (radius * Math.sin(rad)) / PERSPECTIVE_PX);
    const faceOn = 1 - tilt / TILT_DEG;
    const faceOnMargin = (width - 2 * radius) / 2;
    const margin = TILTED_MARGIN_PX + (faceOnMargin - TILTED_MARGIN_PX) * faceOn;
    const centerY = far + margin;
    box.style.height = `${(far + near + 2 * margin).toFixed(2)}px`;
    if (svgRef.current) {
      svgRef.current.style.top = `${(centerY - width / 2).toFixed(2)}px`;
    }
    if (sunRef.current) {
      sunRef.current.style.top = `${centerY.toFixed(2)}px`;
    }
  }, []);

  const moveTilt = useCallback(
    (target: number, instant: boolean) => {
      window.cancelAnimationFrame(tiltFrameRef.current);
      const from = tiltRef.current;
      if (instant || from === target) {
        tiltRef.current = target;
        applyTilt();
        paint();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = clamp((now - start) / TILT_MS, 0, 1);
        tiltRef.current = from + (target - from) * easeMove(t);
        applyTilt();
        paint();
        if (t < 1) {
          tiltFrameRef.current = window.requestAnimationFrame(step);
        }
      };
      tiltFrameRef.current = window.requestAnimationFrame(step);
    },
    [applyTilt, paint],
  );

  // Keep label text near 12px on screen whatever the orrery width.
  useLayoutEffect(() => {
    const element = orreryRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width <= 0) {
        return;
      }
      if (width !== widthRef.current) {
        widthRef.current = width;
        applyTilt();
      }
      const next = Math.min(26, Math.max(12, (12 * VIEWBOX) / width));
      labelUnitsRef.current = next;
      // Stay inside the page padding on mobile; use the free column space on desktop.
      const wide = width > 400;
      const unitsPerPx = VIEWBOX / width;
      bleedRef.current = {
        left: (wide ? 28 : 16) * unitsPerPx,
        right: (wide ? 100 : 16) * unitsPerPx,
      };
      setLabelUnits(next);
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [applyTilt]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Track the lg breakpoint. Crossing it drops any active group so no hover state is left pinned.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    wideRef.current = query.matches;
    const onChange = () => {
      wideRef.current = query.matches;
      if (activeRef.current) {
        deactivate(activeRef.current);
      }
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [deactivate]);

  // Below lg a pinned group also clears on Escape, wherever focus is.
  useEffect(() => {
    if (!activeGroup) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !wideRef.current && activeRef.current) {
        deactivate(activeRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeGroup, deactivate]);

  // Ignition fires once, when the orrery first scrolls into view.
  useEffect(() => {
    if (ignited) {
      return;
    }
    const element = orreryRef.current;
    if (motionStill || !element || !("IntersectionObserver" in window)) {
      igniteStartRef.current = -1e9;
      setIgnited(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          igniteStartRef.current = performance.now();
          setIgnited(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ignited, motionStill]);

  // Swing to face-on while a group is active, back to the tilted view otherwise.
  useLayoutEffect(() => {
    moveTilt(activeGroup ? 0 : TILT_DEG, motionStill);
    return () => window.cancelAnimationFrame(tiltFrameRef.current);
  }, [activeGroup, motionStill, moveTilt]);

  // Place planets and labels whenever the active group, ray or label size changes.
  useEffect(() => {
    paint();
  }, [paint, activeGroup, labelUnits, rayKey]);

  useEffect(() => {
    if (motionStill || !inView || !pageVisible) {
      return;
    }

    let frame = 0;
    let lastTick = 0;
    let lastPaint = 0;
    let paintedTime = timeRef.current;
    const minFrameMs = 1000 / performanceProfile.skills.maxFps;
    const paintThresholdMs = Math.max(0, minFrameMs - 1);

    const rampAt = (now: number) => {
      const start = igniteStartRef.current;
      if (start === null) {
        return 0;
      }
      const r = clamp((now - start - RAMP_DELAY_MS) / RAMP_MS, 0, 1);
      return r * r * (3 - 2 * r);
    };

    const tick = (now: number) => {
      if (!lastTick) {
        lastTick = now;
        lastPaint = now;
        frame = window.requestAnimationFrame(tick);
        return;
      }

      const deltaSeconds = Math.min(Math.max((now - lastTick) / 1000, 0), 0.08);
      lastTick = now;

      const target = activeRef.current ? 0 : 1;
      const current = timeScaleRef.current;
      let next = current + (target - current) * (1 - Math.exp(-deltaSeconds / TIME_SCALE_TAU_S));
      if (Math.abs(target - next) < 0.002) {
        next = target;
      }
      timeScaleRef.current = next;
      const speed = next * rampAt(now);
      timeRef.current += deltaSeconds * speed;

      // Tails follow the speed: gone when the system stops, back when it moves.
      const lastLevel = tailLevelRef.current;
      if (
        speed !== lastLevel &&
        (Math.abs(speed - lastLevel) > 0.01 || speed === 0 || speed === 1)
      ) {
        tailLevelRef.current = speed;
        svgRef.current?.style.setProperty("--tail", speed.toFixed(2));
      }

      if (timeRef.current !== paintedTime && now - lastPaint >= paintThresholdMs) {
        lastPaint = now;
        paintedTime = timeRef.current;
        paint();
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [inView, motionStill, pageVisible, paint, performanceProfile.skills.maxFps]);

  const transition = (property: string, ms = 150) =>
    motionStill && property === "transform" ? "none" : `${property} ${ms}ms ${EASE_MOVE}`;

  const rowHandlers = (groupId: string) => ({
    onPointerDown: (event: PointerEvent) => {
      touchRef.current = event.pointerType === "touch" || !wideRef.current;
    },
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "touch" && wideRef.current) {
        activate(groupId);
      }
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType !== "touch" && wideRef.current) {
        deactivate(groupId);
      }
    },
    // Focusing a row activates the group and aims the ray at its first skill.
    onFocus: () => {
      if (!touchRef.current) {
        const group = skillGroups.find((item) => item.id === groupId);
        activate(groupId, group?.items[0] ?? null);
      }
    },
    onBlur: () => {
      if (!touchRef.current) {
        deactivate(groupId);
      }
    },
    // Arrow keys move the ray from skill to skill inside the focused row; Escape clears it.
    onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => {
      touchRef.current = false;
      if (event.target !== event.currentTarget) {
        return;
      }
      const group = skillGroups.find((item) => item.id === groupId);
      if (!group) {
        return;
      }
      if (event.key === "Escape") {
        setActiveSkill(null);
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      event.preventDefault();
      const count = group.items.length;
      const current = activeSkill ? group.items.indexOf(activeSkill) : -1;
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = current < 0 ? (step > 0 ? 0 : count - 1) : (current + step + count) % count;
      activate(groupId, group.items[next]);
    },
    onClick: () => {
      if (touchRef.current) {
        toggle(groupId);
      }
    },
  });

  const skillHandlers = (groupId: string, skill: string) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "touch" && wideRef.current) {
        activate(groupId, skill);
      }
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType !== "touch" && wideRef.current) {
        clearSkill(skill);
      }
    },
  });

  const rayPlanet = rayKey ? planets.find((planet) => planet.key === rayKey) : undefined;
  const rayAngle = rayPlanet ? rayPlanet.phase + (timeRef.current / rayPlanet.period) * Math.PI * 2 : 0;

  return (
    <div
      ref={rootRef}
      className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-16"
    >
      <style>{`@keyframes orrery-ray { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }`}</style>
      {/* Clipped sideways below lg: the perspective makes the near edge wider than the box. */}
      <div className="min-w-0 overflow-x-clip pb-8 lg:sticky lg:top-24 lg:self-start lg:overflow-x-visible lg:pb-0">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <MotionToggle showHelp />
      </div>
      <div
        ref={orreryRef}
        className="relative aspect-[100/57] w-full max-w-[340px] lg:max-w-[496px]"
        onPointerLeave={(event) => {
          if (
            event.pointerType !== "touch" &&
            wideRef.current &&
            sourceRef.current === "orrery" &&
            activeRef.current
          ) {
            deactivate(activeRef.current);
          }
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="absolute left-0 aspect-square h-auto w-full overflow-visible"
          style={{ transform: `perspective(${PERSPECTIVE_PX}px) rotateX(${TILT_DEG}deg)` }}
          role="img"
          aria-label="Skills drawn as a solar system with nine orbits, one for each group of skills"
        >
          {skillGroups.map((group, gi) => (
            <circle
              key={group.id}
              cx={CENTER}
              cy={CENTER}
              r={ringRadiusFor(gi)}
              fill="none"
              className="stroke-fg"
              strokeWidth={px}
              pathLength={1}
              strokeDasharray={1}
              style={{
                strokeDashoffset: entered ? 0 : 1,
                opacity: activeGroup === group.id ? 0.5 : 0.14,
                transition: motionStill
                  ? transition("opacity")
                  : `stroke-dashoffset ${RING_DRAW_MS}ms ${EASE_ENTER} ${gi * RING_STAGGER_MS}ms, ${transition("opacity")}`,
              }}
            />
          ))}

          {rayPlanet ? (
            <line
              key={rayPlanet.key}
              ref={rayRef}
              x1={CENTER}
              y1={CENTER}
              x2={CENTER + rayPlanet.ringRadius * Math.cos(rayAngle)}
              y2={CENTER + rayPlanet.ringRadius * Math.sin(rayAngle)}
              className="stroke-star"
              strokeWidth={px}
              pathLength={1}
              strokeDasharray={1}
              pointerEvents="none"
              style={{
                animation: motionStill ? "none" : `orrery-ray 200ms ${EASE_ENTER} both`,
              }}
            />
          ) : null}

          {skillGroups.map((group, gi) => {
            const groupActive = activeGroup === group.id;
            const dimmed = activeGroup !== null && !groupActive;
            const planetDelay = gi * RING_STAGGER_MS + RING_DRAW_MS;
            return (
              <g
                key={group.id}
                style={{ opacity: dimmed ? 0.35 : 1, transition: transition("opacity") }}
              >
                {planets
                  .filter((planet) => planet.groupId === group.id)
                  .map((planet) => (
                    <g
                      key={planet.key}
                      ref={(element) => {
                        if (element) {
                          planetRefs.current.set(planet.key, element);
                        } else {
                          planetRefs.current.delete(planet.key);
                        }
                      }}
                      transform={`translate(${CENTER} ${CENTER}) rotate(${((planet.phase * 180) / Math.PI).toFixed(2)})`}
                    >
                      {motionStill ? null : (
                        <g style={{ opacity: "var(--tail, 0)" }} pointerEvents="none">
                          {TAIL_OPACITIES.map((opacity, index) => (
                            <path
                              key={index}
                              d={tailSegmentPath(planet.ringRadius, planet.tailDeg, index)}
                              fill="none"
                              className="stroke-fg"
                              strokeWidth={px * 1.5}
                              opacity={opacity}
                            />
                          ))}
                        </g>
                      )}
                      <g
                        transform={`translate(${planet.ringRadius} 0)`}
                        pointerEvents={entered ? undefined : "none"}
                        onPointerEnter={(event) => {
                          if (event.pointerType !== "touch" && wideRef.current) {
                            activate(group.id, planet.skill, "orrery");
                          }
                        }}
                        onPointerLeave={(event) => {
                          if (event.pointerType !== "touch" && wideRef.current) {
                            clearSkill(planet.skill);
                          }
                        }}
                        onClick={(event) => {
                          if (
                            !wideRef.current ||
                            (event.nativeEvent as globalThis.PointerEvent).pointerType === "touch"
                          ) {
                            toggle(group.id);
                          }
                        }}
                      >
                        <title>{`${planet.skill}, ${planet.groupTitle}`}</title>
                        <circle r={HIT_RADIUS} className="fill-transparent" />
                        <g
                          style={{
                            opacity: entered ? 1 : 0,
                            transform: `scale(${entered ? 1 : 0.6})`,
                            transition: motionStill
                              ? "none"
                              : `opacity ${PLANET_IN_MS}ms ${EASE_ENTER} ${planetDelay}ms, transform ${PLANET_IN_MS}ms ${EASE_ENTER} ${planetDelay}ms`,
                          }}
                        >
                          <circle
                            r={PLANET_RADIUS}
                            className={rayKey === planet.key ? "fill-star" : "fill-fg"}
                            style={{
                              transform: `scale(${groupActive ? PLANET_RADIUS_ACTIVE / PLANET_RADIUS : 1})`,
                              transition: transition("transform"),
                            }}
                          />
                        </g>
                      </g>
                    </g>
                  ))}
              </g>
            );
          })}

          <g ref={labelLayerRef} pointerEvents="none" style={{ opacity: 0 }}>
            {planets.map((planet) => (
              <text
                key={planet.key}
                ref={(element) => {
                  if (element) {
                    labelRefs.current.set(planet.key, element);
                  } else {
                    labelRefs.current.delete(planet.key);
                  }
                }}
                x={CENTER}
                y={CENTER}
                dominantBaseline="central"
                fontSize={labelUnits}
                className="fill-fg stroke-space font-sans"
                strokeWidth={3}
                strokeLinejoin="round"
                paintOrder="stroke"
                aria-hidden="true"
                style={{
                  opacity: activeGroup === planet.groupId ? 1 : 0,
                  transition: transition("opacity"),
                }}
              >
                {planet.skill}
              </text>
            ))}
          </g>
        </svg>

        {/* The sun stays round: it is not part of the tilted svg. */}
        <span
          ref={sunRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-star"
          style={{
            width: `${SUN_PERCENT}%`,
            height: `${SUN_PERCENT}%`,
            transform: `translate(-50%, -50%) scale(${entered ? 1 : 0.6})`,
            transition: motionStill ? "none" : `transform ${SUN_IN_MS}ms ${EASE_ENTER}`,
          }}
        />
      </div>
      </div>

      <ul className="m-0 flex list-none flex-col gap-5 p-0">
        {skillGroups.map((group) => (
          <li
            key={group.id}
            tabIndex={0}
            aria-label={`${group.title}: ${group.items.join(", ")}`}
            className="rounded-[6px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-star"
            {...rowHandlers(group.id)}
          >
            <h3 className="m-0 text-[16px] font-medium leading-6 text-fg">{group.title}</h3>
            <p className="m-0 text-[14px] leading-6 text-fg-muted">
              {group.items.map((skill, index) => (
                <span key={skill}>
                  {index > 0 ? ", " : null}
                  <span
                    className={
                      activeGroup === group.id && activeSkill === skill
                        ? "font-medium text-fg"
                        : undefined
                    }
                    {...skillHandlers(group.id, skill)}
                  >
                    {skill}
                  </span>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
