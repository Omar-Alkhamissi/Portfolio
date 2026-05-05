import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { skillGroups, type SkillGroup } from "../data/skills";
import { site } from "../data/site";

/**
 * Solar System view of skills.
 *
 * - Each SkillGroup becomes an orbital ring at a unique radius.
 * - Skills are planets distributed evenly around their ring.
 * - Each ring rotates at a different speed (Kepler-style — outer = slower).
 * - Hovering a planet pauses its ring and surfaces a tooltip.
 * - Clicking a category filter highlights/dims the others.
 *
 * The whole thing is one SVG so it's resolution-independent and accessible.
 */

const VIEWBOX = 800;
const CENTER = VIEWBOX / 2;

// Per-ring radii — packed within viewBox, plenty of breathing room
const RING_BASE = 110;
const RING_STEP = 50;

// Rotation periods in seconds. Outer rings spin slower, like real orbits.
const periodFor = (i: number) => 36 + i * 12;
const directionFor = (i: number) => (i % 2 === 0 ? "normal" : "reverse");

type PlanetPosition = {
  group: SkillGroup;
  groupIndex: number;
  ringRadius: number;
  rotationPeriod: number;
  skill: string;
  skillIndex: number;
  total: number;
};

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
  const [hovered, setHovered] = useState<string | null>(null);
  const positions = useMemo(() => buildPositions(skillGroups), []);

  return (
    <div className="relative">
      {/* Category filter chips above the system */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setActiveGroup(null)}
          className={[
            "rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
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
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
              activeGroup === g.id
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            <g.icon size={12} aria-hidden="true" />
            {g.title}
          </button>
        ))}
      </div>

      {/* The system itself */}
      <div className="relative mx-auto aspect-square w-full max-w-[640px]">
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
          </defs>

          {/* Ambient outer glow */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={300}
            fill="url(#core-glow)"
            opacity={0.35}
          />

          {/* Orbit rings */}
          {skillGroups.map((g, i) => {
            const r = RING_BASE + i * RING_STEP;
            const isActive = activeGroup === null || activeGroup === g.id;
            return (
              <circle
                key={g.id}
                cx={CENTER}
                cy={CENTER}
                r={r}
                fill="none"
                stroke="rgba(125, 211, 252, 0.18)"
                strokeWidth={1}
                strokeDasharray="2 4"
                opacity={isActive ? 1 : 0.25}
                style={{ transition: "opacity 300ms ease" }}
              />
            );
          })}

          {/* Rotating ring groups — each orbits at its own speed */}
          {skillGroups.map((g, gi) => {
            const isActive = activeGroup === null || activeGroup === g.id;
            const isPaused = hovered !== null && hovered.startsWith(`${g.id}::`);
            const animationDirection = directionFor(gi);
            return (
              <g
                key={g.id}
                style={{
                  transformOrigin: `${CENTER}px ${CENTER}px`,
                  animation: `orbit-spin ${periodFor(gi)}s linear infinite`,
                  animationDirection,
                  animationPlayState: isPaused ? "paused" : "running",
                  opacity: isActive ? 1 : 0.18,
                  transition: "opacity 300ms ease",
                }}
              >
                {positions
                  .filter((p) => p.group.id === g.id)
                  .map((p) => {
                    const angle = (p.skillIndex / p.total) * Math.PI * 2;
                    const cx = CENTER + p.ringRadius * Math.cos(angle);
                    const cy = CENTER + p.ringRadius * Math.sin(angle);
                    const id = `${g.id}::${p.skill}`;
                    const isHovered = hovered === id;
                    return (
                      <g
                        key={id}
                        onMouseEnter={() => setHovered(id)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ cursor: "pointer" }}
                        tabIndex={0}
                        onFocus={() => setHovered(id)}
                        onBlur={() => setHovered(null)}
                      >
                        <title>{`${p.skill} — ${g.title}`}</title>
                        {/* Outer halo on hover */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 18 : 9}
                          fill="rgba(125, 211, 252, 0.18)"
                          style={{ transition: "r 220ms ease" }}
                        />
                        {/* Planet body */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5.5}
                          fill="url(#planet-grad)"
                          filter="url(#planet-blur)"
                        />
                        {/* Counter-rotate the label so text stays upright */}
                        <g
                          style={{
                            transformOrigin: `${cx}px ${cy}px`,
                            animation: `counter-orbit-spin ${periodFor(
                              gi
                            )}s linear infinite`,
                            animationDirection,
                            animationPlayState: isPaused ? "paused" : "running",
                          }}
                        >
                          <text
                            x={cx}
                            y={cy - 12}
                            textAnchor="middle"
                            className="fill-zinc-300 font-mono"
                            fontSize="9"
                            opacity={isHovered ? 1 : 0.7}
                            style={{ transition: "opacity 200ms ease" }}
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
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          >
            <circle
              cx={CENTER}
              cy={CENTER}
              r={48}
              fill="url(#core-glow)"
              opacity={0.9}
            />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={26}
              fill="#0B0D12"
              stroke="rgba(125,211,252,0.6)"
              strokeWidth={1.5}
            />
            <text
              x={CENTER}
              y={CENTER + 5}
              textAnchor="middle"
              className="fill-accent font-mono"
              fontSize="14"
              fontWeight="600"
            >
              {site.initials}
            </text>
          </motion.g>
        </svg>

        {/* Hover tooltip — surfaces the focused skill name in the corner */}
        <div
          aria-live="polite"
          className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400"
        >
          {hovered ? hovered.split("::")[1] : "Hover a planet"}
        </div>
      </div>
    </div>
  );
}
