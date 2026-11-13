import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { useInView } from "framer-motion";
import { skillGroups } from "../data/skills";
import { cn } from "../lib/cn";
import { glideToHash } from "../lib/glide";
import { useMotionOff } from "../lib/motion";
import { setSkillFocus, useSkillFocus } from "../lib/skillFocus";
import { skillProjectCount } from "../lib/skillProjects";
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
 *   period = 40s * (r / rInner)^1.5.
 * - At rest the orrery is seen at an angle. Pointing at a group (ring planet or
 *   list row) stops the system, swings it face-on and labels that group's planets.
 * - Planets trail a short arc behind them; the tail follows how fast the system turns.
 * - One rAF loop writes transforms straight to SVG refs.
 */

// Square box that just fits the outer ring; labels overflow the SVG instead of padding it.
const VIEWBOX = 490;
const CENTER = VIEWBOX / 2;
const SUN_RADIUS = 6;
const RING_INNER = 46;
const RING_STEP = 24;
const PERIOD_INNER_S = 40;
// Planet size follows evidence: 3px with no linked project, up to 6px for the most used skill.
const PLANET_RADIUS = 3;
const PLANET_RADIUS_MAX = 6;
// Active-group growth, relative to each planet's own base radius.
const ACTIVE_SCALE = 5 / 3;
const HIT_RADIUS = 12;
const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_ENTER = "cubic-bezier(0.05, 0.7, 0.1, 1)";
// Time scale eases to its target with this time constant (about 400ms to settle).
const TIME_SCALE_TAU_S = 0.13;

// Tilt: seen at an angle at rest, face-on while a group is active.
const TILT_DEG = 52;
const TILT_MS = 500;
// Far enough that perspective barely widens the near edge of the disc.
const PERSPECTIVE_PX = 2400;
// Below lg only: space kept around the tilted disc; the box grows to the full square when
// face-on. At lg and wider the box is a fixed square and the disc sits centred in it.
const TILTED_MARGIN_PX = 8;
const FAR_OPACITY_DROP = 0.45;

// Comet tails: four arc segments behind each planet.
const TAIL_OPACITIES = [0.5, 0.3, 0.16, 0.07];
const TAIL_MIN_DEG = 8;
const TAIL_MAX_DEG = 40;
const TAIL_DEG_PER_DEG_S = 40 / 6; // inner ring turns 6 deg/s and gets the longest tail

// Entrance: one continuous flow driven by the rAF loop. The sun swells with a ripple, rings
// spread out from it, planets fly out along spirals while the spin settles from fast to normal.
const SUN_IN_MS = 700;
const RIPPLE_MAX_PX = 40;
const RING_START_MS = 150;
const RING_STAGGER_MS = 90;
const RING_GROW_MS = 900;
// A planet leaves the sun once its ring is this far through its growth.
const FLIGHT_AFTER_RING_SHARE = 0.4;
const PLANET_STAGGER_MS = 25;
const FLIGHT_MS = 1100;
const FLIGHT_FADE_SHARE = 0.15;
const FLIGHT_SCALE_FROM = 0.6;
const TAIL_FADE_FROM = 0.6;
const SPIN_START = 3.5;
const SPIN_RELAX_TAU_S = 0.25;
const ENTRANCE_SETTLE_MS = 300;
// Speed eases in over this long when motion is switched on after the entrance already ran.
const MOTION_RAMP_MS = 1200;

type Phase = "hidden" | "entering" | "rest";

type Planet = {
  key: string;
  groupId: string;
  groupTitle: string;
  groupIndex: number;
  order: number;
  skill: string;
  radius: number;
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
const easeEnter = cubicBezier(0.05, 0.7, 0.1, 1);

function ringStartMs(groupIndex: number) {
  return RING_START_MS + groupIndex * RING_STAGGER_MS;
}

function flightStartMs(groupIndex: number, order: number) {
  return (
    ringStartMs(groupIndex) + FLIGHT_AFTER_RING_SHARE * RING_GROW_MS + order * PLANET_STAGGER_MS
  );
}

// Whole entrance: the last planet lands, then the spin gets a moment to settle to normal.
const ENTRANCE_MS = Math.min(
  3200,
  Math.max(
    2800,
    Math.max(
      ...skillGroups.map(
        (group, gi) => flightStartMs(gi, Math.max(0, group.items.length - 1)) + FLIGHT_MS,
      ),
    ) + ENTRANCE_SETTLE_MS,
  ),
);

const MOST_PROJECTS = Math.max(
  1,
  ...skillGroups.flatMap((group) => group.items.map((skill) => skillProjectCount(skill))),
);

function planetRadiusFor(skill: string) {
  const share = Math.sqrt(skillProjectCount(skill) / MOST_PROJECTS);
  return PLANET_RADIUS + (PLANET_RADIUS_MAX - PLANET_RADIUS) * share;
}

function mapRef<T extends Element>(map: Map<string, T>, key: string) {
  return (element: T | null) => {
    if (element) {
      map.set(key, element);
    } else {
      map.delete(key);
    }
  };
}

function projectsLine(skill: string) {
  const count = skillProjectCount(skill);
  // Project tech lists name frameworks, not the languages under them, so a zero
  // here means "not listed", not "never used". Say nothing rather than mislead.
  if (count === 0) {
    return "";
  }
  return `${skill}: used in ${count} ${count === 1 ? "project" : "projects"}`;
}

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
        order: si,
        skill,
        radius: planetRadiusFor(skill),
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
  // A click on a planet pins its skill: it stays lit after the pointer leaves, until unpinned.
  const [pinned, setPinned] = useState<{ groupId: string; skill: string } | null>(null);
  const [labelUnits, setLabelUnits] = useState(14);
  const [ignited, setIgnited] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const orreryRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sunRef = useRef<HTMLSpanElement | null>(null);
  const sunBodyRef = useRef<HTMLSpanElement | null>(null);
  const rippleRef = useRef<SVGCircleElement | null>(null);
  const ringWrapRefs = useRef<(SVGGElement | null)[]>([]);
  const ringRefs = useRef<(SVGCircleElement | null)[]>([]);
  const widthRef = useRef(0);
  const labelLayerRef = useRef<SVGGElement | null>(null);
  const rayRef = useRef<SVGLineElement | null>(null);
  const planetRefs = useRef<Map<string, SVGGElement>>(new Map());
  // Per planet: the group that carries its orbit radius, the body (fade and scale) and the tail.
  const atRefs = useRef<Map<string, SVGGElement>>(new Map());
  const bodyRefs = useRef<Map<string, SVGGElement>>(new Map());
  const tailRefs = useRef<Map<string, SVGGElement>>(new Map());
  const labelRefs = useRef<Map<string, SVGTextElement>>(new Map());
  const activeRef = useRef<string | null>(null);
  const sourceRef = useRef<"list" | "orrery">("list");
  const activeSkillRef = useRef<string | null>(null);
  const pinnedRef = useRef<{ groupId: string; skill: string } | null>(null);
  // The planet under the mouse, so unpinning can leave it lit.
  const hoverRef = useRef<{ groupId: string; skill: string } | null>(null);
  const rayKeyRef = useRef<string | null>(null);
  const timeRef = useRef(0);
  const timeScaleRef = useRef(1);
  const tiltRef = useRef(TILT_DEG);
  const tiltFrameRef = useRef(0);
  const tailLevelRef = useRef(-1);
  // hidden: nothing drawn yet; entering: the entrance clock runs; rest: normal orrery.
  const phaseRef = useRef<Phase>("hidden");
  const entranceMsRef = useRef(0);
  // False after the phase changes, so the next paint rewrites every entrance-driven attribute.
  const restAppliedRef = useRef(false);
  // Angular speed multiplier: SPIN_START at first, settling to 1.
  const spinRef = useRef(1);
  const rampMsRef = useRef(MOTION_RAMP_MS);
  const prevStillRef = useRef<boolean | null>(null);
  const finishRef = useRef<() => void>(() => {});
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
  const focusedSkill = useSkillFocus();
  const performanceProfile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const motionStill = motionOff || diagnostics.staticMode;
  const entered = ignited || motionStill;
  const planets = useMemo(buildPlanets, []);
  const px = labelUnits / 12; // viewBox units per screen pixel

  depthOnRef.current = performanceProfile.quality !== "lite";

  const rayKey = activeGroup && activeSkill ? `${activeGroup}::${activeSkill}` : null;
  rayKeyRef.current = rayKey;
  activeSkillRef.current = activeSkill;

  const setPhase = useCallback((phase: Phase) => {
    phaseRef.current = phase;
    restAppliedRef.current = false;
    rootRef.current?.setAttribute("data-orrery-phase", phase);
  }, []);

  const activate = useCallback(
    (groupId: string, skill: string | null = null, source: "list" | "orrery" = "list") => {
      finishRef.current();
      activeRef.current = groupId;
      sourceRef.current = source;
      setActiveGroup(groupId);
      setActiveSkill(skill);
    },
    [],
  );

  // Where a hover would clear, a pinned skill comes back instead.
  const deactivate = useCallback(
    (groupId: string) => {
      if (activeRef.current !== groupId) {
        return;
      }
      const pin = pinnedRef.current;
      if (pin) {
        activate(pin.groupId, pin.skill, "orrery");
        return;
      }
      activeRef.current = null;
      setActiveGroup(null);
      setActiveSkill(null);
    },
    [activate],
  );

  const clearSkill = useCallback((skill: string) => {
    setActiveSkill((current) => {
      if (current !== skill) {
        return current;
      }
      const pin = pinnedRef.current;
      return pin && activeRef.current === pin.groupId ? pin.skill : null;
    });
  }, []);

  const pinSkill = useCallback(
    (groupId: string, skill: string) => {
      const pin = { groupId, skill };
      pinnedRef.current = pin;
      setPinned(pin);
      activate(groupId, skill, "orrery");
    },
    [activate],
  );

  // Drops the pin. A planet still under the mouse stays lit; otherwise the pinned display clears.
  const unpin = useCallback(() => {
    const pin = pinnedRef.current;
    if (!pin) {
      return;
    }
    pinnedRef.current = null;
    setPinned(null);
    const hover = hoverRef.current;
    if (hover) {
      activate(hover.groupId, hover.skill, "orrery");
    } else if (activeRef.current === pin.groupId && activeSkillRef.current === pin.skill) {
      activeRef.current = null;
      setActiveGroup(null);
      setActiveSkill(null);
    }
  }, [activate]);

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
    const phase = phaseRef.current;
    const flying = phase !== "rest";
    const ms = phase === "hidden" ? 0 : entranceMsRef.current;
    const writeParts = flying || !restAppliedRef.current;

    if (writeParts) {
      // Sun, its ripple and the rings. Rings grow from the sun's size to their own.
      const unitsPerPx = widthRef.current > 0 ? VIEWBOX / widthRef.current : 1;
      const sunUnits = SUN_RADIUS * unitsPerPx;
      const sunT = clamp(ms / SUN_IN_MS, 0, 1);
      const sunE = flying ? easeEnter(sunT) : 1;
      const sunBody = sunBodyRef.current;
      if (sunBody) {
        sunBody.style.transform = `scale(${sunE.toFixed(3)})`;
        sunBody.style.opacity = sunE.toFixed(3);
      }
      const ripple = rippleRef.current;
      if (ripple) {
        const rippleOn = flying && ms > 0 && sunT < 1;
        ripple.setAttribute(
          "r",
          (SUN_RADIUS + (RIPPLE_MAX_PX - SUN_RADIUS) * easeEnter(sunT)).toFixed(2),
        );
        ripple.setAttribute("opacity", rippleOn ? (0.5 * (1 - sunT)).toFixed(3) : "0");
      }
      skillGroups.forEach((_, gi) => {
        const finalRadius = ringRadiusFor(gi);
        const t = flying ? clamp((ms - ringStartMs(gi)) / RING_GROW_MS, 0, 1) : 1;
        const e = flying ? easeEnter(t) : 1;
        ringRefs.current[gi]?.setAttribute(
          "r",
          (sunUnits + (finalRadius - sunUnits) * e).toFixed(2),
        );
        const wrap = ringWrapRefs.current[gi];
        if (wrap) {
          if (flying) {
            wrap.setAttribute("opacity", e.toFixed(3));
          } else {
            wrap.removeAttribute("opacity");
          }
        }
      });
    }

    for (const planet of planets) {
      if (writeParts) {
        const at = atRefs.current.get(planet.key);
        const body = bodyRefs.current.get(planet.key);
        const tail = tailRefs.current.get(planet.key);
        if (flying) {
          const p = clamp((ms - flightStartMs(planet.groupIndex, planet.order)) / FLIGHT_MS, 0, 1);
          // Gentler curve for distance so the trip stays visible; the strong one only for scale.
          const e = easeEnter(p);
          const travel = 1 - (1 - p) * (1 - p);
          at?.setAttribute("transform", `translate(${(planet.ringRadius * travel).toFixed(2)} 0)`);
          body?.setAttribute("opacity", smoothstep(0, FLIGHT_FADE_SHARE, p).toFixed(3));
          body?.setAttribute(
            "transform",
            `scale(${(FLIGHT_SCALE_FROM + (1 - FLIGHT_SCALE_FROM) * e).toFixed(3)})`,
          );
          // The tail is drawn at the final radius, so it shrinks with the planet's distance.
          tail?.setAttribute("opacity", smoothstep(TAIL_FADE_FROM, 1, p).toFixed(3));
          tail?.setAttribute("transform", `scale(${Math.max(travel, 0.001).toFixed(3)})`);
        } else {
          at?.setAttribute("transform", `translate(${planet.ringRadius} 0)`);
          body?.removeAttribute("opacity");
          body?.removeAttribute("transform");
          tail?.removeAttribute("opacity");
          tail?.removeAttribute("transform");
        }
      }

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
        planet.ringRadius + planet.radius * ACTIVE_SCALE + 6 + Math.abs(sin) * fontUnits * 0.5;
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

    if (!flying) {
      restAppliedRef.current = true;
    }
  }, [planets]);

  // Ends the entrance where it stands and shows the resting orrery.
  const finishEntrance = useCallback(() => {
    if (phaseRef.current === "rest") {
      return;
    }
    entranceMsRef.current = ENTRANCE_MS;
    setPhase("rest");
    setIgnited(true);
    paint();
  }, [paint, setPhase]);
  finishRef.current = finishEntrance;

  // Applies the current tilt to the svg and fades labels in only when nearly face-on. Below lg
  // it also sizes the box to the disc: the tilted ring is shorter and its near edge reaches
  // further. At lg and wider the box is a fixed square (set by CSS) and the disc is centred.
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
    if (wideRef.current) {
      box.style.height = "";
      if (svgRef.current) {
        svgRef.current.style.top = "0px";
      }
      if (sunRef.current) {
        sunRef.current.style.top = "50%";
      }
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
      wideRef.current = window.matchMedia("(min-width: 1024px)").matches;
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
        // The box fills its column, so only the column gap (64px) is free on the right.
        right: (wide ? 56 : 16) * unitsPerPx,
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
      applyTilt();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [applyTilt, deactivate]);

  // Below lg a pinned group also clears on Escape, wherever focus is.
  useEffect(() => {
    if (!activeGroup) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !wideRef.current && activeRef.current) {
        setSkillFocus(null);
        deactivate(activeRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeGroup, deactivate]);

  // A pinned skill also unpins on Escape, wherever focus is.
  useEffect(() => {
    if (!pinned) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        unpin();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pinned, unpin]);

  // Everything starts hidden. Motion off shows the resting orrery at once; motion switched on
  // again after the entrance already ran eases the speed in instead of starting hard.
  useLayoutEffect(() => {
    const wasStill = prevStillRef.current;
    prevStillRef.current = motionStill;
    if (motionStill) {
      entranceMsRef.current = ENTRANCE_MS;
      spinRef.current = 1;
      setPhase("rest");
    } else if (wasStill === null) {
      setPhase("hidden");
    } else if (wasStill && phaseRef.current === "rest") {
      rampMsRef.current = 0;
    }
    paint();
  }, [motionStill, paint, setPhase]);

  // The entrance starts once, when enough of the orrery is on screen.
  useEffect(() => {
    if (ignited) {
      return;
    }
    const element = orreryRef.current;
    if (motionStill || !element || !("IntersectionObserver" in window)) {
      finishEntrance();
      setIgnited(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          entry.intersectionRatio >= 0.34 &&
          phaseRef.current === "hidden"
        ) {
          entranceMsRef.current = 0;
          spinRef.current = SPIN_START;
          setPhase("entering");
          setIgnited(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ignited, motionStill, finishEntrance, setPhase]);

  // A focused skill (from the map) ends the entrance too.
  useEffect(() => {
    if (focusedSkill) {
      finishEntrance();
    }
  }, [focusedSkill, finishEntrance]);

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

      // Spin: fast while the entrance runs, easing down to exactly normal; held still until it starts.
      const phase = phaseRef.current;
      if (phase === "entering") {
        entranceMsRef.current += deltaSeconds * 1000;
        const progress = clamp(entranceMsRef.current / ENTRANCE_MS, 0, 1);
        spinRef.current = 1 + (SPIN_START - 1) * (1 - smoothstep(0, 1, progress));
      } else if (spinRef.current !== 1) {
        // An entrance cut short hands its leftover spin back smoothly.
        const spin = spinRef.current + (1 - spinRef.current) * (1 - Math.exp(-deltaSeconds / SPIN_RELAX_TAU_S));
        spinRef.current = Math.abs(spin - 1) < 0.002 ? 1 : spin;
      }
      let ramp = 1;
      if (rampMsRef.current < MOTION_RAMP_MS) {
        rampMsRef.current = Math.min(MOTION_RAMP_MS, rampMsRef.current + deltaSeconds * 1000);
        ramp = smoothstep(0, 1, rampMsRef.current / MOTION_RAMP_MS);
      }
      const speed = phase === "hidden" ? 0 : next * spinRef.current * ramp;
      timeRef.current += deltaSeconds * speed;
      const finishing = phase === "entering" && entranceMsRef.current >= ENTRANCE_MS;

      // Tails follow the speed: gone when the system stops, back when it moves.
      const tailSpeed = Math.min(speed, 1);
      const lastLevel = tailLevelRef.current;
      if (
        tailSpeed !== lastLevel &&
        (Math.abs(tailSpeed - lastLevel) > 0.01 || tailSpeed === 0 || tailSpeed === 1)
      ) {
        tailLevelRef.current = tailSpeed;
        svgRef.current?.style.setProperty("--tail", tailSpeed.toFixed(2));
      }

      if (finishing) {
        // Also paints the resting state and brings the entrance to its exact end.
        finishEntrance();
        lastPaint = now;
        paintedTime = timeRef.current;
      } else if (
        (timeRef.current !== paintedTime || phase === "entering") &&
        now - lastPaint >= paintThresholdMs
      ) {
        lastPaint = now;
        paintedTime = timeRef.current;
        paint();
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [finishEntrance, inView, motionStill, pageVisible, paint, performanceProfile.skills.maxFps]);

  // Lights the skill's projects on the map and scrolls down to it. Skills with no project do nothing.
  const selectSkill = (skill: string) => {
    if (skillProjectCount(skill) === 0) {
      return false;
    }
    setSkillFocus(skill);
    glideToHash("#projects", { pushState: false });
    return true;
  };

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
        setSkillFocus(null);
        return;
      }
      if (event.key === "Enter") {
        if (activeGroup === groupId && activeSkill && group.items.includes(activeSkill)) {
          if (selectSkill(activeSkill)) {
            event.preventDefault();
          }
        }
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
    onClick: (event: MouseEvent) => {
      // Below lg the first tap only pins the group (the row handles it); a tap on a pinned group picks.
      if (wideRef.current || activeRef.current === groupId) {
        if (selectSkill(skill)) {
          event.stopPropagation();
        }
      }
    },
  });

  const rayPlanet = rayKey ? planets.find((planet) => planet.key === rayKey) : undefined;
  const rayAngle = rayPlanet ? rayPlanet.phase + (timeRef.current / rayPlanet.period) * Math.PI * 2 : 0;

  return (
    <div
      ref={rootRef}
      data-orrery-phase="hidden"
      onPointerDownCapture={finishEntrance}
      className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 lg:items-center lg:gap-16"
    >
      <style>{`@keyframes orrery-ray { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }`}</style>
      {/* Clipped sideways below lg: the perspective makes the near edge wider than the box. */}
      <div className="min-w-0 overflow-x-clip pb-8 lg:relative lg:overflow-x-visible lg:pb-0">
      {/* Above the box below lg; at lg it sits in the square's top-left corner, left empty by the circle. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 lg:pointer-events-none lg:absolute lg:left-0 lg:top-0 lg:z-10 lg:mb-0 lg:max-w-[220px] lg:flex-col lg:flex-nowrap lg:items-start lg:[&_button]:pointer-events-auto">
        <MotionToggle showHelp />
      </div>
      <div
        ref={orreryRef}
        className="relative aspect-[100/57] w-full max-w-[340px] lg:aspect-square lg:max-w-[560px]"
        onClick={unpin}
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
            <g
              key={group.id}
              ref={(element) => {
                ringWrapRefs.current[gi] = element;
              }}
            >
              <circle
                ref={(element) => {
                  ringRefs.current[gi] = element;
                }}
                cx={CENTER}
                cy={CENTER}
                r={ringRadiusFor(gi)}
                fill="none"
                className="stroke-fg"
                strokeWidth={px}
                style={{
                  opacity: activeGroup === group.id ? 0.5 : 0.14,
                  transition: transition("opacity"),
                }}
              />
            </g>
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

          {skillGroups.map((group) => {
            const groupActive = activeGroup === group.id;
            const dimmed = activeGroup !== null && !groupActive;
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
                        <g ref={mapRef(tailRefs.current, planet.key)} pointerEvents="none">
                          <g style={{ opacity: "var(--tail, 0)" }}>
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
                        </g>
                      )}
                      <g
                        ref={mapRef(atRefs.current, planet.key)}
                        transform={`translate(${planet.ringRadius} 0)`}
                        pointerEvents={entered ? undefined : "none"}
                        data-pinned={
                          pinned?.groupId === group.id && pinned.skill === planet.skill
                            ? "true"
                            : undefined
                        }
                        onPointerEnter={(event) => {
                          if (event.pointerType !== "touch" && wideRef.current) {
                            hoverRef.current = { groupId: group.id, skill: planet.skill };
                            activate(group.id, planet.skill, "orrery");
                          }
                        }}
                        onPointerLeave={(event) => {
                          hoverRef.current = null;
                          if (event.pointerType !== "touch" && wideRef.current) {
                            clearSkill(planet.skill);
                          }
                        }}
                        style={{ cursor: "pointer" }}
                        onClick={(event) => {
                          // A click pins the skill and never scrolls; the readout offers the jump.
                          event.stopPropagation();
                          const pin = pinnedRef.current;
                          if (pin && pin.groupId === group.id && pin.skill === planet.skill) {
                            unpin();
                          } else {
                            pinSkill(group.id, planet.skill);
                          }
                        }}
                      >
                        <title>{`${planet.skill}, ${planet.groupTitle}`}</title>
                        <circle r={HIT_RADIUS} className="fill-transparent" />
                        <g ref={mapRef(bodyRefs.current, planet.key)}>
                          <circle
                            r={planet.radius}
                            className={
                              rayKey === planet.key || focusedSkill === planet.skill
                                ? "fill-star"
                                : "fill-fg"
                            }
                            style={{
                              transform: `scale(${groupActive ? ACTIVE_SCALE : 1})`,
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

        {/* The sun stays round: it is not part of the tilted svg, and its size is in px because
            a percent height would follow the box height, which changes with the tilt below lg. */}
        <span
          ref={sunRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{
            width: SUN_RADIUS * 2,
            height: SUN_RADIUS * 2,
            transform: "translate(-50%, -50%)",
          }}
        >
          <span ref={sunBodyRef} className="absolute inset-0 rounded-full bg-star" />
          {/* Thin ripple that leaves the sun once while it appears. */}
          <svg
            aria-hidden="true"
            className="absolute overflow-visible"
            viewBox={`${-RIPPLE_MAX_PX} ${-RIPPLE_MAX_PX} ${RIPPLE_MAX_PX * 2} ${RIPPLE_MAX_PX * 2}`}
            style={{
              left: "50%",
              top: "50%",
              width: RIPPLE_MAX_PX * 2,
              height: RIPPLE_MAX_PX * 2,
              marginLeft: -RIPPLE_MAX_PX,
              marginTop: -RIPPLE_MAX_PX,
            }}
          >
            <circle
              ref={rippleRef}
              r={SUN_RADIUS}
              fill="none"
              className="stroke-fg"
              strokeWidth={1}
              opacity={0}
            />
          </svg>
        </span>
      </div>
      {/* One line for the aimed skill; its height is always reserved so nothing jumps. */}
      <div
        aria-live="polite"
        className="m-0 mt-3 flex h-6 items-center gap-3 whitespace-nowrap text-[14px] leading-6 text-fg-muted"
      >
        {rayKey && activeSkill ? projectsLine(activeSkill) : null}
        {pinned &&
        activeSkill === pinned.skill &&
        activeGroup === pinned.groupId &&
        skillProjectCount(pinned.skill) > 0 ? (
          <button type="button" className="link" onClick={() => selectSkill(pinned.skill)}>
            Show on the map
          </button>
        ) : null}
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
                    className={cn(
                      skillProjectCount(skill) > 0 && "cursor-pointer hover:underline",
                      activeGroup === group.id && activeSkill === skill && "font-medium text-fg",
                      focusedSkill === skill &&
                        "text-fg underline decoration-star decoration-1 underline-offset-4",
                    )}
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
