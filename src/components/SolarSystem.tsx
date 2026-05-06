import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
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
  Github,
  Globe,
  LayoutGrid,
  Monitor,
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
import { site } from "../data/site";

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
const RING_BASE = 164;
const RING_STEP = 76;

// Outer rings still move slower, but the cadence is fast enough to be visible.
const periodFor = (i: number) => 18 + i * 8;
const directionFor = (i: number) => (i % 2 === 0 ? 1 : -1);

const GROUP_ACCENTS: Record<string, string> = {
  languages: "#7dd3fc",
  frontend: "#34d399",
  backend: "#60a5fa",
  databases: "#fbbf24",
  engineering: "#a78bfa",
  tools: "#f472b6",
};

const SKILL_ICONS: Record<string, LucideIcon> = {
  "C#": Braces,
  "C++": Binary,
  Java: Coffee,
  JavaScript: FileJson2,
  TypeScript: SquareCode,
  SQL: Database,
  HTML: FileCode2,
  CSS: Wind,
  React: Atom,
  "Vue 3": PanelsTopLeft,
  "React Native + Expo": Smartphone,
  "Tailwind CSS": Wind,
  "MUI (Material UI)": LayoutGrid,
  Vite: Zap,
  "ASP.NET Core": Server,
  "Node.js + Express": Network,
  "Entity Framework Core": Boxes,
  "REST APIs": Waypoints,
  "Socket.IO": Radio,
  "gRPC + Protobuf": Workflow,
  "JWT Authentication": ShieldCheck,
  MongoDB: Database,
  "SQL Server": Table2,
  SQLite: Database,
  "Firebase Firestore": Flame,
  "Database Design": Boxes,
  Normalization: SplitSquareVertical,
  "Object-Oriented Programming": Blocks,
  "Data Structures & Algorithms": Route,
  "Design Patterns": Puzzle,
  "Concurrency & Async": TimerReset,
  "Testing (Jest, xUnit)": FlaskConical,
  "Git / GitHub": Github,
  "GitHub Actions": GitBranch,
  "Visual Studio": AppWindow,
  "VS Code": Monitor,
  "Swagger / OpenAPI": BadgeCheck,
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

export function SolarSystem() {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [systemEntered, setSystemEntered] = useState(false);
  const [orbitTime, setOrbitTime] = useState(0);
  const orbitStartRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const positions = useMemo(() => buildPositions(skillGroups), []);

  useEffect(() => {
    if (!systemEntered) {
      return;
    }

    let frame = 0;

    const tick = (now: number) => {
      orbitStartRef.current ??= now;
      const elapsed = (now - orbitStartRef.current) / 1000;
      setOrbitTime(shouldReduceMotion ? elapsed * 0.25 : elapsed);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [shouldReduceMotion, systemEntered]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onViewportEnter={() => setSystemEntered(true)}
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
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          {/* Ambient outer glow */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={446}
            fill="url(#core-glow)"
            opacity={0.35}
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
                        ? shouldReduceMotion
                          ? 0.18
                          : [0.13, 0.24, 0.15]
                        : 0.04
                      : 0,
                  }}
                  transition={{
                    r: {
                      duration: shouldReduceMotion ? 0.01 : 0.9,
                      delay: shouldReduceMotion ? 0 : i * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    },
                    opacity: {
                      duration: shouldReduceMotion ? 0.01 : 5.2 + i * 0.35,
                      repeat: shouldReduceMotion ? 0 : Infinity,
                      ease: "easeInOut",
                    },
                  }}
                  fill="none"
                  stroke={accent}
                  strokeWidth={24}
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
                      duration: shouldReduceMotion ? 0.01 : 0.9,
                      delay: shouldReduceMotion ? 0 : i * 0.06,
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
            const direction = directionFor(gi);
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
                    const orbitAngle =
                      startAngleFor(p.groupIndex) +
                      (p.skillIndex / p.total) * Math.PI * 2 +
                      direction * ((orbitTime / p.rotationPeriod) * Math.PI * 2);
                    const cx = CENTER + p.ringRadius * Math.cos(orbitAngle);
                    const cy = CENTER + p.ringRadius * Math.sin(orbitAngle);
                    const labelRadius = p.ringRadius + 36;
                    const labelX = CENTER + labelRadius * Math.cos(orbitAngle);
                    const labelY = CENTER + labelRadius * Math.sin(orbitAngle) + 4;
                    const labelOffsetX = labelX - cx;
                    const labelOffsetY = labelY - cy;
                    const Icon = SKILL_ICONS[p.skill] ?? Globe;
                    return (
                      <g
                        key={`${g.id}::${p.skill}`}
                        opacity={systemEntered ? 1 : 0}
                        transform={`translate(${cx} ${cy})`}
                        style={{
                          transition: shouldReduceMotion
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
                            x={labelOffsetX}
                            y={labelOffsetY}
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

          {/* Core star — represents "Me" */}
          <motion.g
            initial={{ opacity: 0, scale: 0.65 }}
            animate={{
              opacity: systemEntered ? 1 : 0,
              scale: shouldReduceMotion ? 1 : systemEntered ? [1, 1.05, 1] : 0.65,
            }}
            transition={{
              opacity: { duration: shouldReduceMotion ? 0.01 : 0.35 },
              scale: {
                duration: shouldReduceMotion ? 0.01 : 4,
                repeat: shouldReduceMotion ? 0 : Infinity,
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
            <text
              x={CENTER}
              y={CENTER + 5}
              textAnchor="middle"
              className="fill-accent font-mono"
              fontSize="20"
              fontWeight="600"
            >
              {site.initials}
            </text>
          </motion.g>
        </svg>

      </div>
    </motion.div>
  );
}
