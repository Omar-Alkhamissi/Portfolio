import { useEffect, useRef, useState } from "react";
import { workPrinciples } from "../data/site";
import { useMotionOff } from "../lib/motion";
import { SectionHeading } from "./SectionHeading";

/** Lit fraction of each moon, in the order of workPrinciples. */
const PHASES = [0, 0.25, 0.5, 1];

const GROW_MS = 900;
const STAGGER_MS = 150;

/** Path that covers the unlit part of the moon. The lit side is the right. */
function shadowPath(k: number): string {
  const rx = 40 * Math.abs(1 - 2 * k);
  const sweep = k < 0.5 ? 0 : 1;
  return `M 50 10 A 40 40 0 0 0 50 90 A ${rx} 40 0 0 ${sweep} 50 10 Z`;
}

type MoonProps = {
  d: string;
  pathRef: (node: SVGPathElement | null) => void;
};

function Moon({ d, pathRef }: MoonProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className="relative h-16 w-16 shrink-0 sm:h-[88px] sm:w-[88px]"
    >
      <circle
        cx="50"
        cy="50"
        r="40"
        fillOpacity="0.9"
        className="fill-fg transition-[fill-opacity] duration-150 group-hover:[fill-opacity:1]"
      />
      <circle cx="62" cy="38" r="7" fillOpacity="0.35" className="fill-fg-muted" />
      <circle cx="45" cy="60" r="10" fillOpacity="0.35" className="fill-fg-muted" />
      <circle cx="66" cy="66" r="5" fillOpacity="0.35" className="fill-fg-muted" />
      <circle cx="38" cy="36" r="5" fillOpacity="0.35" className="fill-fg-muted" />
      <path ref={pathRef} d={d} className="fill-surface" />
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        className="stroke-fg-faint transition-[stroke] duration-150 group-hover:stroke-star"
      />
    </svg>
  );
}

export function WorkPhases() {
  const motionOff = useMotionOff();
  const listRef = useRef<HTMLUListElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [started, setStarted] = useState(false);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (motionOff) {
      setPlayed(true);
      return;
    }
    const list = listRef.current;
    if (!list || played) return;

    let frame = 0;

    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const elapsed = now - t0;
        PHASES.forEach((target, i) => {
          const p = Math.min(Math.max((elapsed - i * STAGGER_MS) / GROW_MS, 0), 1);
          const eased = 1 - (1 - p) ** 3;
          pathRefs.current[i]?.setAttribute("d", shadowPath(target * eased));
        });
        if (elapsed < GROW_MS + (PHASES.length - 1) * STAGGER_MS) {
          frame = requestAnimationFrame(tick);
        } else {
          PHASES.forEach((target, i) => {
            pathRefs.current[i]?.setAttribute("d", shadowPath(target));
          });
          setPlayed(true);
        }
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        setStarted(true);
        run();
      },
      { threshold: 0.35 },
    );
    observer.observe(list);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [motionOff, played]);

  const final = motionOff || played;
  const lineDrawn = final || started;

  return (
    <section id="about" className="scroll-mt-20" aria-label="How I like to work">
      <div className="section">
        <SectionHeading title="How I like to work" />

        <ul
          ref={listRef}
          className="relative mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
        >
          <span
            aria-hidden="true"
            className="absolute left-[44px] right-[calc(25%-1.875rem-44px)] top-[44px] hidden h-px origin-left bg-line lg:block"
            style={{
              transform: lineDrawn ? "scaleX(1)" : "scaleX(0)",
              transition: motionOff
                ? "none"
                : `transform ${GROW_MS}ms cubic-bezier(0.05, 0.7, 0.1, 1)`,
            }}
          />
          {workPrinciples.map((item, i) => (
            <li key={item.title} className="group flex items-start gap-5 sm:block">
              <Moon
                d={shadowPath(final ? PHASES[i] : 0)}
                pathRef={(node) => {
                  pathRefs.current[i] = node;
                }}
              />
              <div>
                <h3 className="text-16 font-medium text-fg sm:mt-6">{item.title}</h3>
                <p className="mt-1 text-16 text-fg-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
