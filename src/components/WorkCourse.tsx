import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { workPrinciples } from "../data/site";
import { useMotionOff } from "../lib/motion";
import { cn } from "../lib/cn";
import { SectionHeading } from "./SectionHeading";

const COUNT = workPrinciples.length;
const LAST = COUNT - 1;

const WIDE_QUERY = "(min-width: 1024px)";
/** Waypoint heights in the wide course band, px from the band top. */
const WIDE_Y = [124, 56, 104, 36];
const WIDE_START_Y = 150;
const WIDE_END_Y = 20;
/** Waypoint x positions in the narrow gutter. */
const NARROW_X = [10, 26];

const FLIGHT_MS = 2400;
const HOP_MS = 350;
const HOP_MAX_MS = 700;

type Point = { x: number; y: number };
type Leader = { x: number; y1: number; y2: number };

type Layout = {
  key: string;
  width: number;
  height: number;
  d: string;
  /** The path up to and including each waypoint, used to find its length along the course. */
  prefixes: string[];
  points: Point[];
  leaders: Leader[];
};

type Lengths = { total: number; waypoints: number[] };

type Move = {
  from: number;
  target: number;
  t0: number;
  dur: number;
  entrance: boolean;
};

type Phase = "wait" | "entrance" | "ready";

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildPath(start: Point, points: Point[], end: Point, wide: boolean) {
  const chain = [start, ...points, end];
  const segments: string[] = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const a = chain[i];
    const b = chain[i + 1];
    if (wide) {
      const mx = a.x + (b.x - a.x) / 2;
      segments.push(`C ${round(mx)} ${round(a.y)} ${round(mx)} ${round(b.y)} ${round(b.x)} ${round(b.y)}`);
    } else {
      const my = a.y + (b.y - a.y) / 2;
      segments.push(`C ${round(a.x)} ${round(my)} ${round(b.x)} ${round(my)} ${round(b.x)} ${round(b.y)}`);
    }
  }
  const head = `M ${round(start.x)} ${round(start.y)}`;
  const prefixes = points.map((_, i) => `${head} ${segments.slice(0, i + 1).join(" ")}`);
  return { d: `${head} ${segments.join(" ")}`, prefixes };
}

function measureLayout(
  box: HTMLElement,
  items: (HTMLElement | null)[],
  titles: (HTMLElement | null)[],
): Layout | null {
  if (items.some((n) => !n) || titles.some((n) => !n)) return null;
  const wide = window.matchMedia(WIDE_QUERY).matches;
  const rect = box.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const points: Point[] = [];
  const leaders: Leader[] = [];
  let start: Point;
  let end: Point;

  if (wide) {
    items.forEach((li, i) => {
      const x = li!.getBoundingClientRect().left - rect.left;
      const title = titles[i]!;
      const lineHeight = parseFloat(getComputedStyle(title).lineHeight) || 25.6;
      const bottom = title.getBoundingClientRect().top - rect.top + lineHeight;
      points.push({ x, y: WIDE_Y[i] });
      leaders.push({ x, y1: WIDE_Y[i], y2: bottom });
    });
    start = { x: -Math.min(64, Math.max(rect.left, 0)), y: WIDE_START_Y };
    end = { x: width, y: WIDE_END_Y };
  } else {
    titles.forEach((title, i) => {
      const lineHeight = parseFloat(getComputedStyle(title!).lineHeight) || 25.6;
      const y = title!.getBoundingClientRect().top - rect.top + lineHeight / 2;
      points.push({ x: NARROW_X[i % NARROW_X.length], y });
    });
    const first = points[0];
    const last = points[LAST];
    start = { x: NARROW_X[1], y: first.y - 24 };
    end = { x: NARROW_X[0], y: last.y + 40 };
  }

  const { d, prefixes } = buildPath(start, points, end, wide);
  const key = `${wide ? "w" : "n"}|${round(width)}|${round(height)}|${d}|${leaders
    .map((l) => `${round(l.x)},${round(l.y2)}`)
    .join(";")}`;
  return {
    key,
    width,
    height,
    d,
    prefixes,
    points: points.map((p) => ({ x: round(p.x), y: round(p.y) })),
    leaders: leaders.map((l) => ({ x: round(l.x), y1: l.y1, y2: round(l.y2) })),
  };
}

export function WorkCourse() {
  const motionOff = useMotionOff();
  const motionOffRef = useRef(motionOff);
  motionOffRef.current = motionOff;

  const boxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const courseRef = useRef<SVGPathElement>(null);
  const travelRef = useRef<SVGPathElement>(null);
  const probeRef = useRef<SVGCircleElement>(null);

  const phaseRef = useRef<Phase>(motionOff ? "ready" : "wait");
  const activeRef = useRef(motionOff ? LAST : -1);
  const reachedRef = useRef(motionOff ? COUNT : 0);
  const posRef = useRef(0);
  const lensRef = useRef<Lengths | null>(null);
  const moveRef = useRef<Move | null>(null);
  const frameRef = useRef(0);

  const [layout, setLayout] = useState<Layout | null>(null);
  const [reached, setReached] = useState(reachedRef.current);
  const [active, setActive] = useState(activeRef.current);

  const paint = (pos: number) => {
    const lens = lensRef.current;
    const course = courseRef.current;
    const probe = probeRef.current;
    const travel = travelRef.current;
    if (!lens || !course || !probe || !travel) return;
    posRef.current = pos;
    const pt = course.getPointAtLength(pos);
    probe.setAttribute("cx", String(pt.x));
    probe.setAttribute("cy", String(pt.y));
    travel.style.strokeDasharray = `${lens.total} ${lens.total}`;
    travel.style.strokeDashoffset = String(lens.total - pos);
    let count = 0;
    for (const at of lens.waypoints) {
      if (pos >= at - 0.01) count += 1;
    }
    if (count !== reachedRef.current) {
      reachedRef.current = count;
      setReached(count);
    }
  };

  const tick = (now: number) => {
    frameRef.current = 0;
    const move = moveRef.current;
    const lens = lensRef.current;
    if (!move || !lens) return;
    const p = clamp01((now - move.t0) / move.dur);
    const to = lens.waypoints[move.target];
    paint(move.from + (to - move.from) * easeInOutCubic(p));
    if (p < 1) {
      frameRef.current = requestAnimationFrame(tick);
      return;
    }
    moveRef.current = null;
    if (move.entrance) {
      phaseRef.current = "ready";
      activeRef.current = move.target;
      setActive(move.target);
    }
  };

  const startFrames = () => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(tick);
  };

  const stopFrames = () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  };

  const startEntrance = () => {
    const lens = lensRef.current;
    if (!lens || phaseRef.current !== "wait") return;
    phaseRef.current = "entrance";
    moveRef.current = {
      from: 0,
      target: LAST,
      t0: performance.now(),
      dur: FLIGHT_MS,
      entrance: true,
    };
    startFrames();
  };

  /** Where the probe is, counted in waypoints (2.5 is halfway between the third and fourth). */
  const waypointPosition = (pos: number, lens: Lengths): number => {
    const w = lens.waypoints;
    let j = 0;
    while (j < w.length - 2 && pos >= w[j + 1]) j += 1;
    return j + (pos - w[j]) / (w[j + 1] - w[j]);
  };

  const jumpToFinal = () => {
    stopFrames();
    const move = moveRef.current;
    moveRef.current = null;
    let target = activeRef.current;
    if (phaseRef.current !== "ready") target = LAST;
    else if (move) target = move.target;
    phaseRef.current = "ready";
    activeRef.current = target;
    setActive(target);
    const lens = lensRef.current;
    if (lens) paint(lens.waypoints[target]);
  };

  const point = (i: number) => {
    if (phaseRef.current !== "ready") return;
    const lens = lensRef.current;
    if (!lens) return;
    activeRef.current = i;
    setActive(i);
    if (motionOffRef.current) {
      stopFrames();
      moveRef.current = null;
      paint(lens.waypoints[i]);
      return;
    }
    const distance = Math.abs(i - waypointPosition(posRef.current, lens));
    if (distance < 0.001) {
      stopFrames();
      moveRef.current = null;
      paint(lens.waypoints[i]);
      return;
    }
    moveRef.current = {
      from: posRef.current,
      target: i,
      t0: performance.now(),
      dur: Math.min(HOP_MAX_MS, HOP_MS * distance),
      entrance: false,
    };
    startFrames();
  };

  // Measure the list and keep the course fitted to it.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const next = measureLayout(box, itemRefs.current, titleRefs.current);
      if (next) setLayout((prev) => (prev && prev.key === next.key ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    const media = window.matchMedia(WIDE_QUERY);
    media.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, []);

  // A new layout means a new path: find each waypoint's length along it and re-seat the probe.
  useLayoutEffect(() => {
    const course = courseRef.current;
    if (!layout || !course) return;
    const waypoints = layout.prefixes.map((prefix) => {
      course.setAttribute("d", prefix);
      return course.getTotalLength();
    });
    course.setAttribute("d", layout.d);
    const total = course.getTotalLength();
    const old = lensRef.current;
    const ratio = old && old.total > 0 ? total / old.total : 1;
    lensRef.current = { total, waypoints };

    const move = moveRef.current;
    if (move) {
      move.from *= ratio;
      paint(Math.min(posRef.current * ratio, total));
    } else if (phaseRef.current === "ready" && activeRef.current >= 0) {
      paint(waypoints[activeRef.current]);
    } else {
      paint(0);
    }
  }, [layout]);

  // Play the flight once when the list is mostly in view. Motion off skips it.
  useEffect(() => {
    if (motionOff) {
      jumpToFinal();
      return;
    }
    if (phaseRef.current !== "wait") return;
    const box = boxRef.current;
    if (!box) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        startEntrance();
      },
      { threshold: 0.35 },
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, [motionOff]);

  useEffect(() => stopFrames, []);

  return (
    <section id="about" className="scroll-mt-20" aria-label="How I like to work">
      <div className="section">
        <SectionHeading title="How I like to work" />

        <div ref={boxRef} className="relative mt-12 max-w-[60ch] lg:max-w-none">
          {layout && (
            <svg
              aria-hidden="true"
              width={layout.width}
              height={layout.height}
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
            >
              {layout.leaders.map((leader, i) => (
                <line
                  key={i}
                  x1={leader.x}
                  y1={leader.y1}
                  x2={leader.x}
                  y2={leader.y2}
                  strokeWidth={1}
                  className={cn(
                    "transition-[stroke] duration-150",
                    active === i ? "stroke-star" : "stroke-line",
                  )}
                />
              ))}
              <path
                ref={courseRef}
                d={layout.d}
                fill="none"
                strokeWidth={1}
                strokeDasharray="2 6"
                className="stroke-fg-faint"
              />
              <path
                ref={travelRef}
                d={layout.d}
                fill="none"
                strokeWidth={1.5}
                className="stroke-fg-muted"
              />
              {layout.points.map((p, i) => (
                <circle
                  key={i}
                  data-waypoint={i}
                  data-reached={i < reached ? "true" : "false"}
                  cx={p.x}
                  cy={p.y}
                  r={5}
                  strokeWidth={1.5}
                  className={i < reached ? "fill-fg stroke-fg" : "fill-space stroke-fg-faint"}
                />
              ))}
              {layout.points.map(
                (p, i) =>
                  active === i && (
                    <circle
                      key={i}
                      data-ring={i}
                      cx={p.x}
                      cy={p.y}
                      r={10}
                      fill="none"
                      strokeWidth={1.5}
                      className="stroke-star"
                    />
                  ),
              )}
              <circle ref={probeRef} data-probe="" r={4} className="fill-star" />
            </svg>
          )}

          <ul className="grid grid-cols-1 gap-y-10 lg:grid-cols-4 lg:gap-x-10 lg:gap-y-0 lg:pt-[168px]">
            {workPrinciples.map((item, i) => (
              <li
                key={item.title}
                ref={(node) => {
                  itemRefs.current[i] = node;
                }}
                onPointerEnter={() => point(i)}
                className="pl-12 lg:pl-5"
              >
                <h3
                  ref={(node) => {
                    titleRefs.current[i] = node;
                  }}
                  className="text-16 font-medium text-fg"
                >
                  {item.title}
                </h3>
                <p className="mt-1 text-16 text-fg-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
