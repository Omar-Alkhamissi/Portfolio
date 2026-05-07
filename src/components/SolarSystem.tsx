import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Atom,
  BadgeCheck,
  Binary,
  Blocks,
  Boxes,
  Braces,
  Coffee,
  Database,
  FileCode2,
  FileJson2,
  Flame,
  FlaskConical,
  GitBranch,
  Globe,
  LayoutGrid,
  Network,
  PanelsTopLeft,
  Puzzle,
  Radio,
  Route,
  Server,
  ShieldCheck,
  Smartphone,
  SplitSquareVertical,
  SquareCode,
  Table2,
  TimerReset,
  Waypoints,
  Wind,
  Workflow,
  Zap,
} from "lucide-react";
import { skillGroups, type SkillGroup } from "../data/skills";
import {
  useAdaptivePerformanceProfile,
  usePerformanceDiagnosticFlags,
} from "../lib/performance";

/**
 * Solar System view of skills.
 *
 * - Each SkillGroup becomes an orbital ring at a unique radius.
 * - Skills are planets distributed evenly around their ring.
 * - Each ring rotates at a different speed (Kepler-style — outer = slower).
 * - Clicking a category filter highlights/dims the others.
 *
 * The whole thing is one SVG so it's resolution-independent and accessible.
 */

const VIEWBOX = 1180;
const CENTER = VIEWBOX / 2;

// Per-ring radii — packed within viewBox, plenty of breathing room
const RING_BASE = 118;
const RING_STEP = 50;

// Outer rings still move slower, but the cadence is fast enough to be visible.
const periodFor = (i: number) => 18 + i * 8;
const directionFor = (i: number) => (i % 2 === 0 ? 1 : -1);

const GROUP_ACCENTS: Record<string, string> = {
  languages: "#7dd3fc",
  frontend: "#34d399",
  backend: "#60a5fa",
  databases: "#fbbf24",
  mobile: "#fde047",
  security: "#fb7185",
  testing: "#22c55e",
  architecture: "#a78bfa",
  algorithms: "#f34b7d",
};

const SKILL_ICONS: Record<string, LucideIcon> = {
  "C#": Braces,
  "C++": Binary,
  Java: Coffee,
  JS: FileJson2,
  TS: SquareCode,
  SQL: Database,
  HTML: FileCode2,
  CSS: Wind,
  React: Atom,
  "Vue 3": PanelsTopLeft,
  Quasar: PanelsTopLeft,
  MUI: LayoutGrid,
  Tailwind: Wind,
  Vite: Zap,
  "ASP.NET": Server,
  "Node/Express": Network,
  "REST APIs": Waypoints,
  gRPC: Workflow,
  Protobuf: Braces,
  "Socket.IO": Radio,
  Swagger: BadgeCheck,
  "SQL Server": Table2,
  PostgreSQL: Table2,
  SQLite: Database,
  MongoDB: Database,
  Mongoose: Boxes,
  Firestore: Flame,
  "EF Core": Boxes,
  RN: Smartphone,
  Expo: Smartphone,
  Firebase: Flame,
  "Android APK": Smartphone,
  "Local-First": Database,
  JWT: ShieldCheck,
  bcrypt: ShieldCheck,
  PBKDF2: ShieldCheck,
  Stripe: BadgeCheck,
  Jest: FlaskConical,
  Supertest: FlaskConical,
  xUnit: BadgeCheck,
  "Google Test": FlaskConical,
  "GitHub Actions": GitBranch,
  OOP: Blocks,
  "GoF Patterns": Puzzle,
  MVC: SplitSquareVertical,
  Observer: Radio,
  "N-tier": Workflow,
  Repository: Boxes,
  Async: TimerReset,
  "Algorithm Design": Binary,
  "Data Structures": Blocks,
  Parsing: Route,
  Recursion: GitBranch,
  "Statistical Analysis": Binary,
};

type PlanetPosition = {
  group: SkillGroup;
  groupIndex: number;
  ringRadius: number;
  rotationPeriod: number;
  skill: string;
  skillIndex: number;
  total: number;
};

function startAngleFor(groupIndex: number) {
  return -Math.PI / 2 + groupIndex * 0.42;
}

function buildPositions(groups: SkillGroup[]): PlanetPosition[] {
  const out: PlanetPosition[] = [];
  groups.forEach((group, gi) => {
    const ringRadius = RING_BASE + gi * RING_STEP;
    const rotationPeriod = periodFor(gi);
    group.items.forEach((skill, si) => {
      out.push({
        group,
        groupIndex: gi,
        ringRadius,
        rotationPeriod,
        skill,
        skillIndex: si,
        total: group.items.length,
      });
    });
  });
  return out;
}

function planetKey(position: PlanetPosition) {
  return `${position.group.id}::${position.skill}`;
}

function planetPositionAt(position: PlanetPosition, orbitTime: number) {
  const direction = directionFor(position.groupIndex);
  const orbitAngle =
    startAngleFor(position.groupIndex) +
    (position.skillIndex / position.total) * Math.PI * 2 +
    direction * ((orbitTime / position.rotationPeriod) * Math.PI * 2);
  const cx = CENTER + position.ringRadius * Math.cos(orbitAngle);
  const cy = CENTER + position.ringRadius * Math.sin(orbitAngle);
  const labelRadius = position.ringRadius + 36;
  const labelX = CENTER + labelRadius * Math.cos(orbitAngle);
  const labelY = CENTER + labelRadius * Math.sin(orbitAngle) + 4;

  return {
    cx,
    cy,
    labelOffsetX: labelX - cx,
    labelOffsetY: labelY - cy,
  };
}

export function SolarSystem() {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [systemEntered, setSystemEntered] = useState(false);
  const [scrollArmed, setScrollArmed] = useState(false);
  const systemRef = useRef<HTMLDivElement | null>(null);
  const planetRefs = useRef<Map<string, SVGGElement>>(new Map());
  const labelRefs = useRef<Map<string, SVGTextElement>>(new Map());
  const systemInView = useInView(systemRef, {
    amount: 0.28,
    margin: "-8% 0px -12% 0px",
  });
  const shouldReduceMotion = useReducedMotion();
  const performanceProfile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const orbitMotionReduced = Boolean(shouldReduceMotion || diagnostics.staticMode);
  const positions = useMemo(() => buildPositions(skillGroups), []);

  useEffect(() => {
    if (scrollArmed) {
      return;
    }

    const armSolarEntry = () => setScrollArmed(true);

    window.addEventListener("scroll", armSolarEntry, {
      once: true,
      passive: true,
    });
    window.addEventListener("wheel", armSolarEntry, {
      once: true,
      passive: true,
    });
    window.addEventListener("touchmove", armSolarEntry, {
      once: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", armSolarEntry);
      window.removeEventListener("wheel", armSolarEntry);
      window.removeEventListener("touchmove", armSolarEntry);
    };
  }, [scrollArmed]);

  useEffect(() => {
    if (!systemEntered && scrollArmed && systemInView) {
      setSystemEntered(true);
    }
  }, [scrollArmed, systemEntered, systemInView]);

  useEffect(() => {
    if (!systemEntered || diagnostics.staticMode) {
      return;
    }

    let frame = 0;
    let lastTick = 0;
    let lastPaint = 0;
    let orbitTime = 0;
    const minFrameMs = 1000 / performanceProfile.skills.maxFps;
    const paintThresholdMs = Math.max(0, minFrameMs - 1);

    const updateOrbit = () => {
      for (const position of positions) {
        const key = planetKey(position);
        const visual = planetRefs.current.get(key);
        const label = labelRefs.current.get(key);

        if (!visual && !label) {
          continue;
        }

        const next = planetPositionAt(position, orbitTime);
        visual?.setAttribute(
          "transform",
          `translate(${next.cx.toFixed(2)} ${next.cy.toFixed(2)})`,
        );
        label?.setAttribute("x", next.labelOffsetX.toFixed(2));
        label?.setAttribute("y", next.labelOffsetY.toFixed(2));
      }
    };

    const tick = (now: number) => {
      if (!lastTick) {
        lastTick = now;
        lastPaint = now;
        updateOrbit();
        frame = window.requestAnimationFrame(tick);
        return;
      }

      const deltaSeconds = Math.min(Math.max((now - lastTick) / 1000, 0), 0.08);
      lastTick = now;
      orbitTime += deltaSeconds * (orbitMotionReduced ? 0.25 : 1);

      if (now - lastPaint >= paintThresholdMs) {
        lastPaint = now;
        updateOrbit();
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [
    performanceProfile.skills.maxFps,
    diagnostics.staticMode,
    orbitMotionReduced,
    positions,
    systemEntered,
  ]);

  return (
    <motion.div
      ref={systemRef}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative"
    >
      {/* Category filter chips above the system */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setActiveGroup(null)}
          className={[
            "rounded-full border px-4 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors",
            activeGroup === null
              ? "border-accent/60 bg-accent/15 text-accent"
              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
          ].join(" ")}
        >
          All
        </button>
        {skillGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() =>
              setActiveGroup((cur) => (cur === g.id ? null : g.id))
            }
            className={[
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors",
              activeGroup === g.id
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            <g.icon size={13} aria-hidden="true" />
            {g.title}
          </button>
        ))}
      </div>

      {/* The system itself */}
      <div
        className="relative mx-auto aspect-square w-full max-w-[1180px]"
      >
        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="h-full w-full"
          aria-label="Skills shown as a solar system"
          role="img"
        >
          <defs>
            <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.9" />
              <stop offset="40%" stopColor="#38BDF8" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="planet-grad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#E0F2FE" />
              <stop offset="60%" stopColor="#7DD3FC" />
              <stop offset="100%" stopColor="#0369A1" />
            </radialGradient>
            <filter id="planet-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
            <filter id="ring-haze" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation={performanceProfile.skills.ringHazeBlur} />
            </filter>
          </defs>

          {/* Ambient outer glow */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={446}
            fill="url(#core-glow)"
            opacity={performanceProfile.skills.ambientGlowOpacity}
          />

          {/* Orbit rings */}
          {skillGroups.map((g, i) => {
            const r = RING_BASE + i * RING_STEP;
            const isActive = activeGroup === null || activeGroup === g.id;
            const accent = GROUP_ACCENTS[g.id] ?? "#7dd3fc";
            return (
              <g key={g.id}>
                <motion.circle
                  cx={CENTER}
                  cy={CENTER}
                  initial={{ r: 0, opacity: 0 }}
                  animate={{
                    r: systemEntered ? r : 0,
                    opacity: systemEntered
                      ? isActive
                        ? orbitMotionReduced
                          ? 0.18
                          : [0.13, 0.24, 0.15]
                        : 0.04
                      : 0,
                  }}
                  transition={{
                    r: {
                      duration: orbitMotionReduced ? 0.01 : 0.9,
                      delay: orbitMotionReduced ? 0 : i * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    },
                    opacity: {
                      duration: orbitMotionReduced ? 0.01 : 5.2 + i * 0.35,
                      repeat: orbitMotionReduced ? 0 : Infinity,
                      ease: "easeInOut",
                    },
                  }}
                  fill="none"
                  stroke={accent}
                  strokeWidth={24 * performanceProfile.skills.ringHazeStrokeScale}
                  filter="url(#ring-haze)"
                />
                <motion.circle
                  cx={CENTER}
                  cy={CENTER}
                  initial={{ r: 0, opacity: 0 }}
                  animate={{
                    r: systemEntered ? r : 0,
                    opacity: systemEntered ? (isActive ? 1 : 0.35) : 0,
                  }}
                  transition={{
                    r: {
                      duration: orbitMotionReduced ? 0.01 : 0.9,
                      delay: orbitMotionReduced ? 0 : i * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    },
                    opacity: { duration: 0.25, ease: "easeOut" },
                  }}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1}
                  strokeOpacity={isActive ? 0.42 : 0.12}
                />
              </g>
            );
          })}

          {/* Rotating ring groups — each orbits at its own speed */}
          {skillGroups.map((g, gi) => {
            const isActive = activeGroup === null || activeGroup === g.id;
            const accent = GROUP_ACCENTS[g.id] ?? "#7dd3fc";
            return (
              <g
                key={g.id}
                style={{
                  opacity: isActive ? 1 : 0.18,
                  transition: "opacity 300ms ease",
                }}
              >
                {positions
                  .filter((p) => p.group.id === g.id)
                  .map((p) => {
                    const initial = planetPositionAt(p, 0);
                    const Icon = SKILL_ICONS[p.skill] ?? Globe;
                    const key = planetKey(p);
                    return (
                      <g
                        key={key}
                        ref={(element) => {
                          if (element) {
                            planetRefs.current.set(key, element);
                          } else {
                            planetRefs.current.delete(key);
                          }
                        }}
                        opacity={systemEntered ? 1 : 0}
                        transform={`translate(${initial.cx} ${initial.cy})`}
                        style={{
                          transition: orbitMotionReduced
                            ? "none"
                            : `opacity 360ms ease ${0.18 + gi * 0.07 + p.skillIndex * 0.018}s`,
                        }}
                      >
                        <title>{`${p.skill} — ${g.title}`}</title>
                        <g pointerEvents="none">
                          <circle
                            cx={0}
                            cy={0}
                            r={20}
                            fill={accent}
                            opacity={0.1}
                          />
                          <circle
                            cx={0}
                            cy={0}
                            r={17}
                            fill="rgba(9, 14, 23, 0.92)"
                            stroke="rgba(255,255,255,0.12)"
                            strokeWidth={1}
                          />
                          <Icon
                            x={-9.5}
                            y={-9.5}
                            width={19}
                            height={19}
                            color="#dbeafe"
                            strokeWidth={2}
                          />
                          <text
                            ref={(element) => {
                              if (element) {
                                labelRefs.current.set(key, element);
                              } else {
                                labelRefs.current.delete(key);
                              }
                            }}
                            x={initial.labelOffsetX}
                            y={initial.labelOffsetY}
                            textAnchor="middle"
                            className="fill-zinc-300 font-mono"
                            fontSize="11"
                            opacity={0.76}
                          >
                            {p.skill}
                          </text>
                        </g>
                      </g>
                    );
                  })}
              </g>
            );
          })}

          {/* Core star — represents the developer core */}
          <motion.g
            initial={{ opacity: 0, scale: 0.65 }}
            animate={{
              opacity: systemEntered ? 1 : 0,
              scale: orbitMotionReduced ? 1 : systemEntered ? [1, 1.05, 1] : 0.65,
            }}
            transition={{
              opacity: { duration: orbitMotionReduced ? 0.01 : 0.35 },
              scale: {
                duration: orbitMotionReduced ? 0.01 : 4,
                repeat: orbitMotionReduced ? 0 : Infinity,
                ease: "easeInOut",
              },
            }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          >
            <circle
              cx={CENTER}
              cy={CENTER}
              r={70}
              fill="url(#core-glow)"
              opacity={0.9}
            />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={38}
              fill="#0B0D12"
              stroke="rgba(125,211,252,0.6)"
              strokeWidth={1.5}
            />
            <SquareCode
              x={CENTER - 14}
              y={CENTER - 14}
              width={28}
              height={28}
              color="#7dd3fc"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </motion.g>
        </svg>

      </div>
    </motion.div>
  );
}
