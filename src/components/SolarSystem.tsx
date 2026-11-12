import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { skillGroups } from "../data/skills";
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
 * - Pointing at a group (ring planet or list row) stops the system and
 *   labels that group's planets.
 * - One rAF loop writes transforms straight to SVG refs.
 */

// Square box that just fits the outer ring; labels overflow the SVG instead of padding it.
const VIEWBOX = 490;
const CENTER = VIEWBOX / 2;
const SUN_RADIUS = 6;
const RING_INNER = 46;
const RING_STEP = 24;
const PERIOD_INNER_S = 60;
const PLANET_RADIUS = 3;
const PLANET_RADIUS_ACTIVE = 5;
const HIT_RADIUS = 12;
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
// Time scale eases to its target with this time constant (about 400ms to settle).
const TIME_SCALE_TAU_S = 0.13;

type Planet = {
  key: string;
  groupId: string;
  groupTitle: string;
  skill: string;
  ringRadius: number;
  phase: number;
  period: number;
};

function ringRadiusFor(groupIndex: number) {
  return RING_INNER + groupIndex * RING_STEP;
}

function buildPlanets(): Planet[] {
  const out: Planet[] = [];
  skillGroups.forEach((group, gi) => {
    const ringRadius = ringRadiusFor(gi);
    const period = PERIOD_INNER_S * Math.pow(ringRadius / RING_INNER, 1.5);
    const ringPhase = -Math.PI / 2 + gi * 0.7;
    group.items.forEach((skill, si) => {
      out.push({
        key: `${group.id}::${skill}`,
        groupId: group.id,
        groupTitle: group.title,
        skill,
        ringRadius,
        phase: ringPhase + (si / group.items.length) * Math.PI * 2,
        period,
      });
    });
  });
  return out;
}

export function SolarSystem() {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [labelUnits, setLabelUnits] = useState(14);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const orreryRef = useRef<HTMLDivElement | null>(null);
  const planetRefs = useRef<Map<string, SVGGElement>>(new Map());
  const labelRefs = useRef<Map<string, SVGTextElement>>(new Map());
  const activeRef = useRef<string | null>(null);
  const timeRef = useRef(0);
  const timeScaleRef = useRef(1);
  const labelUnitsRef = useRef(labelUnits);
  // How far labels may overflow the SVG on each side, in viewBox units.
  const bleedRef = useRef({ left: 16, right: 16 });
  const touchRef = useRef(false);

  const inView = useInView(rootRef, { amount: 0.1 });
  const shouldReduceMotion = useReducedMotion();
  const performanceProfile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const motionStill = Boolean(shouldReduceMotion || diagnostics.staticMode);
  const planets = useMemo(buildPlanets, []);

  const activate = useCallback((groupId: string, skill: string | null = null) => {
    activeRef.current = groupId;
    setActiveGroup(groupId);
    setActiveSkill(skill);
  }, []);

  const deactivate = useCallback((groupId: string) => {
    if (activeRef.current !== groupId) {
      return;
    }
    activeRef.current = null;
    setActiveGroup(null);
    setActiveSkill(null);
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

  // Writes planet transforms, and label positions for the active group only.
  const paint = useCallback(() => {
    const time = timeRef.current;
    const active = activeRef.current;
    const fontUnits = labelUnitsRef.current;
    const bleed = bleedRef.current;

    for (const planet of planets) {
      const angle = planet.phase + (time / planet.period) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = CENTER + planet.ringRadius * cos;
      const y = CENTER + planet.ringRadius * sin;
      planetRefs.current
        .get(planet.key)
        ?.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);

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

  // Keep label text near 12px on screen whatever the orrery width.
  useEffect(() => {
    const element = orreryRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width <= 0) {
        return;
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
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Place planets and labels whenever the active group or label size changes.
  useEffect(() => {
    paint();
  }, [paint, activeGroup, labelUnits]);

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
      timeRef.current += deltaSeconds * next;

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
    motionStill && property === "transform" ? "none" : `${property} ${ms}ms ${EASE}`;

  const rowHandlers = (groupId: string) => ({
    onPointerDown: (event: PointerEvent) => {
      touchRef.current = event.pointerType === "touch";
    },
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        activate(groupId);
      }
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        deactivate(groupId);
      }
    },
    onKeyDown: () => {
      touchRef.current = false;
    },
    onFocus: () => {
      if (!touchRef.current) {
        activate(groupId);
      }
    },
    onBlur: () => {
      if (!touchRef.current) {
        deactivate(groupId);
      }
    },
    onClick: () => {
      if (touchRef.current) {
        toggle(groupId);
      }
    },
  });

  return (
    <div
      ref={rootRef}
      className="grid lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-16"
    >
      <div className="pb-8 lg:sticky lg:top-24 lg:self-start lg:pb-0">
      <div
        ref={orreryRef}
        className="aspect-square w-full max-w-[340px] lg:max-w-[496px]"
      >
        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="h-full w-full overflow-visible"
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
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{
                opacity: activeGroup === group.id ? 0.5 : 0.14,
                transition: transition("opacity"),
              }}
            />
          ))}

          <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS} className="fill-star" />

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
                  .map((planet) => {
                    const angle = planet.phase;
                    const x = CENTER + planet.ringRadius * Math.cos(angle);
                    const y = CENTER + planet.ringRadius * Math.sin(angle);
                    return (
                      <g
                        key={planet.key}
                        ref={(element) => {
                          if (element) {
                            planetRefs.current.set(planet.key, element);
                          } else {
                            planetRefs.current.delete(planet.key);
                          }
                        }}
                        transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
                        onPointerEnter={(event) => {
                          if (event.pointerType !== "touch") {
                            activate(group.id, planet.skill);
                          }
                        }}
                        onPointerLeave={(event) => {
                          if (event.pointerType !== "touch") {
                            deactivate(group.id);
                          }
                        }}
                        onClick={(event) => {
                          if ((event.nativeEvent as globalThis.PointerEvent).pointerType === "touch") {
                            toggle(group.id);
                          }
                        }}
                      >
                        <title>{`${planet.skill}, ${planet.groupTitle}`}</title>
                        <circle r={HIT_RADIUS} className="fill-transparent" />
                        <circle
                          r={PLANET_RADIUS}
                          className="fill-fg"
                          style={{
                            transform: `scale(${groupActive ? PLANET_RADIUS_ACTIVE / PLANET_RADIUS : 1})`,
                            transition: transition("transform"),
                          }}
                        />
                      </g>
                    );
                  })}
              </g>
            );
          })}

          <g pointerEvents="none">
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
      </div>
      </div>

      <ul className="m-0 flex list-none flex-col gap-5 p-0">
        {skillGroups.map((group) => (
          <li
            key={group.id}
            tabIndex={0}
            className="rounded-[6px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-star"
            {...rowHandlers(group.id)}
          >
            <h3 className="m-0 text-[16px] font-medium leading-6 text-fg">{group.title}</h3>
            <p className="m-0 text-[14px] leading-6 text-fg-muted">
              {group.items.map((skill, index) => (
                <span key={skill}>
                  {index > 0 ? " · " : null}
                  <span
                    className={
                      activeGroup === group.id && activeSkill === skill
                        ? "font-medium text-fg"
                        : undefined
                    }
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
