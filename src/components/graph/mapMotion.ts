import type { ClusterKey, GraphEdge, GraphNode } from "../../lib/projectGraphData";

// Timeline helpers for the constellation map. Each animation runs on one
// requestAnimationFrame timeline and writes straight to the SVG elements it
// finds by data attribute, so a frame never re-renders the whole map.

export type Point = { x: number; y: number };
export type Timeline = { cancel: () => void };
type Ease = (progress: number) => number;

// CSS cubic-bezier as a function of progress, for rAF work.
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const curve = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  return (progress: number) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = progress;
    for (let step = 0; step < 24; step += 1) {
      const x = curve(t, x1, x2);
      if (Math.abs(x - progress) < 1e-5) break;
      if (x < progress) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return curve(t, y1, y2);
  };
}

export const easeEnter = cubicBezier(0.05, 0.7, 0.1, 1);
export const easeLeave = cubicBezier(0.3, 0, 0.8, 0.15);
export const easeStay = cubicBezier(0.2, 0, 0, 1);

const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmt = (value: number) => String(Math.round(value * 1000) / 1000);

/** Calls `frame(elapsed)` every animation frame for `duration` ms. `onEnd(true)` on finish, `onEnd(false)` on cancel. */
export function runTimeline(
  duration: number,
  frame: (elapsed: number) => void,
  onEnd?: (finished: boolean) => void,
): Timeline {
  let raf = 0;
  let start: number | null = null;
  let live = true;
  const tick = (now: number) => {
    if (start === null) start = now;
    const elapsed = Math.min(now - start, duration);
    frame(elapsed);
    if (elapsed >= duration) {
      live = false;
      onEnd?.(true);
      return;
    }
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  return {
    cancel: () => {
      if (!live) return;
      live = false;
      window.cancelAnimationFrame(raf);
      onEnd?.(false);
    },
  };
}

// Writes an attribute or style only when its value changes.
function createWriter() {
  const cache = new WeakMap<Element, Map<string, string>>();
  const changed = (el: Element, key: string, value: string) => {
    let entry = cache.get(el);
    if (!entry) {
      entry = new Map();
      cache.set(el, entry);
    }
    if (entry.get(key) === value) return false;
    entry.set(key, value);
    return true;
  };
  return {
    attr(el: SVGElement, name: string, value: string) {
      if (changed(el, `a:${name}`, value)) el.setAttribute(name, value);
    },
    style(el: SVGElement, name: string, value: string) {
      if (!changed(el, `s:${name}`, value)) return;
      if (value === "") el.style.removeProperty(name);
      else el.style.setProperty(name, value);
    },
  };
}

/** Elements under `root` carrying `attr`, keyed by its value. */
export function collect(root: ParentNode, attr: string): Map<string, SVGElement> {
  const found = new Map<string, SVGElement>();
  root.querySelectorAll<SVGElement>(`[${attr}]`).forEach((el) => found.set(el.getAttribute(attr) ?? "", el));
  return found;
}

/** Star ignition: 0 to `peak` to 1. */
export function popScale(progress: number, peak = 1.25) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const rise = 0.55;
  return progress < rise
    ? peak * easeEnter(progress / rise)
    : peak - (peak - 1) * easeStay((progress - rise) / (1 - rise));
}

/** A beat: 1 to `peak` (at 45%) and back to 1. */
export function beatScale(progress: number, peak: number) {
  if (progress <= 0 || progress >= 1) return 1;
  return progress < 0.45
    ? 1 + (peak - 1) * easeStay(progress / 0.45)
    : peak - (peak - 1) * easeStay((progress - 0.45) / 0.55);
}

// With pathLength 1 and dasharray 1: offset 1 hides a line, 0 shows it.
// A negative offset draws from the line's far end instead.
function dashOffset(drawn: number, reverse: boolean) {
  const rest = 1 - clamp01(drawn);
  return reverse ? -rest : rest;
}

const along = (a: Point | undefined, b: Point | undefined, t: number): Point | null =>
  a && b ? { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) } : null;

// ---------------------------------------------------------------- plans

export type TraceLink = {
  edge: number;
  from: number;
  to: number;
  start: number;
  duration: number;
  head: boolean;
  cross: boolean;
};

type TraceOptions = { linkMs: number; lagMs: number; extraMs: number; rootGapMs: number; head: boolean };

/**
 * Connect-the-dots order inside one constellation: a breadth-first walk over
 * its internal links from its most-linked star. Times are relative to the
 * constellation's start. Stars not reached start their own walk.
 */
export function traceCluster(members: number[], edges: GraphEdge[], internal: number[], options: TraceOptions) {
  const degree = new Map<number, number>(members.map((index) => [index, 0]));
  const adjacency = new Map<number, { other: number; edge: number }[]>(members.map((index) => [index, []]));
  for (const edgeIndex of internal) {
    const { source, target } = edges[edgeIndex];
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
    adjacency.get(source)?.push({ other: target, edge: edgeIndex });
    adjacency.get(target)?.push({ other: source, edge: edgeIndex });
  }
  const rank = (a: number, b: number) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a - b;
  adjacency.forEach((list) => list.sort((x, y) => rank(x.other, y.other)));

  const ignite = new Map<number, number>();
  const roots: number[] = [];
  const links: TraceLink[] = [];
  const tree = new Set<number>();
  for (const candidate of [...members].sort(rank)) {
    if (ignite.has(candidate)) continue;
    ignite.set(candidate, roots.length * options.rootGapMs);
    roots.push(candidate);
    const queue = [candidate];
    for (let head = 0; head < queue.length; head += 1) {
      const star = queue[head];
      const lit = ignite.get(star) ?? 0;
      for (const { other, edge } of adjacency.get(star) ?? []) {
        if (ignite.has(other)) continue;
        const start = lit + options.lagMs;
        ignite.set(other, start + options.linkMs);
        links.push({ edge, from: star, to: other, start, duration: options.linkMs, head: options.head, cross: false });
        tree.add(edge);
        queue.push(other);
      }
    }
  }
  // Links outside the tree draw once both of their ends are lit.
  for (const edgeIndex of internal) {
    if (tree.has(edgeIndex)) continue;
    const { source, target } = edges[edgeIndex];
    const a = ignite.get(source) ?? 0;
    const b = ignite.get(target) ?? 0;
    links.push({
      edge: edgeIndex,
      from: a <= b ? source : target,
      to: a <= b ? target : source,
      start: Math.max(a, b) + options.lagMs,
      duration: options.extraMs,
      head: false,
      cross: false,
    });
  }
  links.sort((x, y) => x.start - y.start || x.edge - y.edge);
  return { ignite, roots, links };
}

const internalEdges = (nodes: GraphNode[], edges: GraphEdge[], key: ClusterKey) =>
  edges
    .map((_, index) => index)
    .filter((index) => nodes[edges[index].source].cluster === key && nodes[edges[index].target].cluster === key);

export const SPAWN = {
  clusterGapMs: 140,
  popMs: 320,
  ringMs: 420,
  nameMs: 250,
  linkMs: 220,
  linkLagMs: 80,
  extraMs: 200,
  rootGapMs: 90,
  crossMs: 380,
  crossGapMs: 35,
  settleMs: 300,
  maxMs: 2800,
};

export type SpawnPlan = {
  ignite: number[];
  rings: number[];
  links: TraceLink[];
  /** The star each line is drawn from (its x1, y1). */
  edgeFrom: number[];
  names: Map<ClusterKey, number>;
  popMs: number;
  ringMs: number;
  nameMs: number;
  settleAt: number;
  settleMs: number;
  total: number;
};

/** The whole spawn-in, scaled down in proportion if it would run past SPAWN.maxMs. */
export function planSpawn(
  nodes: GraphNode[],
  edges: GraphEdge[],
  clusterOrder: ClusterKey[],
  length: (edge: number) => number,
): SpawnPlan {
  const ignite = new Array<number>(nodes.length).fill(0);
  const edgeFrom = edges.map((edge) => edge.source);
  const links: TraceLink[] = [];
  const rings: number[] = [];
  const names = new Map<ClusterKey, number>();
  const order = new Map(clusterOrder.map((key, rank) => [key, rank]));
  let clustersEnd = 0;

  clusterOrder.forEach((key, rank) => {
    const start = rank * SPAWN.clusterGapMs;
    const members = nodes.filter((node) => node.cluster === key).map((node) => node.index);
    if (members.length === 0) return;
    const trace = traceCluster(members, edges, internalEdges(nodes, edges, key), {
      linkMs: SPAWN.linkMs,
      lagMs: SPAWN.linkLagMs,
      extraMs: SPAWN.extraMs,
      rootGapMs: SPAWN.rootGapMs,
      head: true,
    });
    trace.ignite.forEach((at, star) => {
      ignite[star] = start + at;
      clustersEnd = Math.max(clustersEnd, start + at + SPAWN.popMs);
    });
    trace.roots.forEach((root) => {
      rings.push(root);
      clustersEnd = Math.max(clustersEnd, ignite[root] + SPAWN.ringMs);
    });
    trace.links.forEach((link) => {
      links.push({ ...link, start: start + link.start });
      edgeFrom[link.edge] = link.from;
      clustersEnd = Math.max(clustersEnd, start + link.start + link.duration);
    });
    names.set(key, start);
    clustersEnd = Math.max(clustersEnd, start + SPAWN.nameMs);
  });

  // Then the links between constellations shoot across, shortest first.
  const cross = edges
    .map((_, index) => index)
    .filter((index) => nodes[edges[index].source].cluster !== nodes[edges[index].target].cluster)
    .sort((a, b) => length(a) - length(b) || a - b);
  cross.forEach((edgeIndex, rank) => {
    const { source, target } = edges[edgeIndex];
    const sourceFirst =
      (order.get(nodes[source].cluster) ?? 0) <= (order.get(nodes[target].cluster) ?? 0);
    const from = sourceFirst ? source : target;
    edgeFrom[edgeIndex] = from;
    links.push({
      edge: edgeIndex,
      from,
      to: sourceFirst ? target : source,
      start: clustersEnd + rank * SPAWN.crossGapMs,
      duration: SPAWN.crossMs,
      head: true,
      cross: true,
    });
  });
  const settleAt = cross.length > 0 ? clustersEnd + (cross.length - 1) * SPAWN.crossGapMs + SPAWN.crossMs : clustersEnd;
  const raw = settleAt + SPAWN.settleMs;
  const k = raw > SPAWN.maxMs ? SPAWN.maxMs / raw : 1;

  names.forEach((at, key) => names.set(key, at * k));
  return {
    ignite: ignite.map((at) => at * k),
    rings,
    links: links.map((link) => ({ ...link, start: link.start * k, duration: link.duration * k })),
    edgeFrom,
    names,
    popMs: SPAWN.popMs * k,
    ringMs: SPAWN.ringMs * k,
    nameMs: SPAWN.nameMs * k,
    settleAt: settleAt * k,
    settleMs: SPAWN.settleMs * k,
    total: raw * k,
  };
}

/** The quick re-trace of one constellation: same tree order, no pops. */
export function planRetrace(nodes: GraphNode[], edges: GraphEdge[], key: ClusterKey, linkMs: number) {
  const members = nodes.filter((node) => node.cluster === key).map((node) => node.index);
  return traceCluster(members, edges, internalEdges(nodes, edges, key), {
    linkMs,
    lagMs: 0,
    extraMs: linkMs,
    rootGapMs: 0,
    head: false,
  }).links;
}

// ---------------------------------------------------------------- players

const DRAW_OPACITY_SAME = 0.5;
const DRAW_OPACITY_CROSS = 0.3;
const RING_GROW = 10;
const RING_OPACITY = 0.6;

const reversed = (lines: Map<string, SVGElement>, link: TraceLink) =>
  lines.get(String(link.edge))?.getAttribute("data-from") !== String(link.from);

/** The first-view spawn-in. Stars, links, names, heads and rings all read live positions. */
export function playSpawn(
  svg: SVGSVGElement,
  plan: SpawnPlan,
  screen: () => Point[],
  radius: (index: number) => number,
  onDone: () => void,
): Timeline {
  const write = createWriter();
  const stars = collect(svg, "data-star");
  const scales = collect(svg, "data-star-scale");
  const lines = collect(svg, "data-edge");
  const heads = collect(svg, "data-spawn-head");
  const rings = collect(svg, "data-spawn-ring");
  const names = collect(svg, "data-cluster-name");
  const reverse = plan.links.map((link) => reversed(lines, link));
  const pop = Math.max(plan.popMs, 1);

  const frame = (t: number) => {
    const points = screen();
    plan.ignite.forEach((at, index) => {
      const local = t - at;
      const star = stars.get(String(index));
      const scale = scales.get(String(index));
      if (star) write.style(star, "opacity", fmt(clamp01(local / (pop * 0.35))));
      if (scale) write.style(scale, "transform", `scale(${fmt(popScale(local / pop))})`);
    });

    const settle = t >= plan.settleAt ? easeStay(clamp01((t - plan.settleAt) / Math.max(plan.settleMs, 1))) : 0;
    plan.links.forEach((link, order) => {
      const line = lines.get(String(link.edge));
      const drawn = easeStay(clamp01((t - link.start) / Math.max(link.duration, 1)));
      if (line) {
        write.attr(line, "stroke-dashoffset", fmt(dashOffset(drawn, reverse[order])));
        const bright = link.cross ? DRAW_OPACITY_CROSS : DRAW_OPACITY_SAME;
        const rest = Number.parseFloat(line.getAttribute("stroke-opacity") ?? "") || bright;
        write.style(line, "stroke-opacity", fmt(lerp(bright, rest, settle)));
      }
      if (!link.head) return;
      const head = heads.get(String(link.edge));
      if (!head) return;
      const moving = t >= link.start && t < link.start + link.duration;
      const tip = moving ? along(points[link.from], points[link.to], drawn) : null;
      if (tip) {
        write.attr(head, "cx", fmt(tip.x));
        write.attr(head, "cy", fmt(tip.y));
      }
      write.style(head, "opacity", tip ? "1" : "0");
    });

    plan.rings.forEach((index) => {
      const ring = rings.get(String(index));
      if (!ring) return;
      const progress = (t - plan.ignite[index]) / Math.max(plan.ringMs, 1);
      const point = points[index];
      if (progress <= 0 || progress >= 1 || !point) {
        write.style(ring, "opacity", "0");
        return;
      }
      write.attr(ring, "cx", fmt(point.x));
      write.attr(ring, "cy", fmt(point.y));
      write.attr(ring, "r", fmt(radius(index) + RING_GROW * easeEnter(progress)));
      write.style(ring, "opacity", fmt(RING_OPACITY * (1 - progress)));
    });

    plan.names.forEach((at, key) => {
      const name = names.get(key);
      if (name) write.style(name, "opacity", fmt(easeEnter(clamp01((t - at) / Math.max(plan.nameMs, 1)))));
    });
  };

  return runTimeline(plan.total, frame, (finished) => {
    lines.forEach((line) => line.style.removeProperty("stroke-opacity"));
    if (finished) onDone();
  });
}

/** Re-draws some base links in trace order. Leaves them fully drawn when it ends or is cancelled. */
export function playRetrace(svg: SVGSVGElement, links: TraceLink[]): Timeline {
  const write = createWriter();
  const lines = collect(svg, "data-edge");
  const items = links
    .map((link) => ({ link, line: lines.get(String(link.edge)), reverse: reversed(lines, link) }))
    .filter((item): item is { link: TraceLink; line: SVGElement; reverse: boolean } => item.line !== undefined);
  items.forEach(({ line, reverse }) => {
    line.setAttribute("pathLength", "1");
    line.setAttribute("stroke-dasharray", "1");
    line.setAttribute("stroke-dashoffset", reverse ? "-1" : "1");
  });
  const duration = items.reduce((end, { link }) => Math.max(end, link.start + link.duration), 0);
  return runTimeline(
    duration,
    (t) => {
      items.forEach(({ link, line, reverse }) => {
        const drawn = easeStay(clamp01((t - link.start) / Math.max(link.duration, 1)));
        write.attr(line, "stroke-dashoffset", fmt(dashOffset(drawn, reverse)));
      });
    },
    () => {
      items.forEach(({ line }) => {
        line.removeAttribute("pathLength");
        line.removeAttribute("stroke-dasharray");
        line.removeAttribute("stroke-dashoffset");
      });
    },
  );
}

/** Moves the dash offset of some lines from `from` to `to`. */
export function playDash(
  lines: SVGElement[],
  from: number,
  to: number,
  duration: number,
  ease: Ease,
  onDone?: () => void,
): Timeline {
  const write = createWriter();
  return runTimeline(
    duration,
    (t) => {
      const value = fmt(lerp(from, to, ease(clamp01(t / Math.max(duration, 1)))));
      lines.forEach((line) => write.attr(line, "stroke-dashoffset", value));
    },
    (finished) => {
      if (finished) onDone?.();
    },
  );
}

export type SignalOptions = {
  star: number;
  neighbours: number[];
  delay: number;
  linkMs: number;
  gapMs: number;
  packetMs: number;
  beatMs: number;
  beatPeak: number;
  rippleMs: number;
  rippleGrow: number;
  rippleOpacity: number;
  screen: () => Point[];
  radius: (index: number) => number;
};

/** The selection signal: gold links draw out, a packet rides each one and the neighbour beats on landing, plus one ripple. */
export function playSignal(svg: SVGSVGElement, options: SignalOptions): Timeline {
  const write = createWriter();
  const gold = collect(svg, "data-gold");
  const packets = collect(svg, "data-packet");
  const beats = collect(svg, "data-star-beat");
  const ripple = svg.querySelector<SVGElement>("[data-ripple]");
  const { star, neighbours, delay } = options;
  const lastLand = delay + Math.max(neighbours.length - 1, 0) * options.gapMs + options.packetMs;
  const duration = Math.max(delay + options.rippleMs, lastLand + options.beatMs);
  const touched = new Set<SVGElement>();

  const frame = (t: number) => {
    const points = options.screen();
    if (ripple) {
      const progress = (t - delay) / options.rippleMs;
      const point = points[star];
      if (progress <= 0 || progress >= 1 || !point) {
        write.style(ripple, "opacity", "0");
      } else {
        write.attr(ripple, "cx", fmt(point.x));
        write.attr(ripple, "cy", fmt(point.y));
        write.attr(ripple, "r", fmt(options.radius(star) + options.rippleGrow * easeEnter(progress)));
        write.style(ripple, "opacity", fmt(options.rippleOpacity * (1 - progress)));
      }
    }
    neighbours.forEach((other, order) => {
      const start = delay + order * options.gapMs;
      const tip = easeEnter(clamp01((t - start) / options.linkMs));
      const line = gold.get(String(other));
      if (line) write.attr(line, "stroke-dashoffset", fmt(1 - tip));
      const packet = packets.get(String(other));
      if (packet) {
        const moving = t >= start && t < start + options.packetMs;
        const ride = Math.min(easeStay(clamp01((t - start) / options.packetMs)), tip);
        const at = moving ? along(points[star], points[other], ride) : null;
        if (at) {
          write.attr(packet, "cx", fmt(at.x));
          write.attr(packet, "cy", fmt(at.y));
        }
        write.style(packet, "opacity", at ? "1" : "0");
      }
      const beat = beats.get(String(other));
      if (beat) {
        const progress = (t - start - options.packetMs) / options.beatMs;
        if (progress > 0 && progress < 1) {
          touched.add(beat);
          write.style(beat, "transform", `scale(${fmt(beatScale(progress, options.beatPeak))})`);
        } else {
          write.style(beat, "transform", "");
        }
      }
    });
  };

  return runTimeline(duration, frame, () => {
    touched.forEach((beat) => beat.style.removeProperty("transform"));
  });
}

export type PulseOptions = {
  from: number;
  to: number;
  duration: number;
  beatMs: number;
  beatPeak: number;
  opacity: number;
  screen: () => Point[];
};

/** An idle pulse travels one link; the star it reaches gives a small beat. */
export function playPulse(svg: SVGSVGElement, options: PulseOptions, onDone: () => void): Timeline | null {
  const pulse = svg.querySelector<SVGElement>("[data-idle-pulse]");
  if (!pulse) return null;
  const beat = collect(svg, "data-star-beat").get(String(options.to));
  const write = createWriter();
  const fadeMs = 80;
  return runTimeline(
    options.duration + options.beatMs,
    (t) => {
      const points = options.screen();
      const at = t < options.duration ? along(points[options.from], points[options.to], easeStay(t / options.duration)) : null;
      if (at) {
        write.attr(pulse, "cx", fmt(at.x));
        write.attr(pulse, "cy", fmt(at.y));
      }
      write.style(pulse, "opacity", at ? fmt(options.opacity * clamp01(t / fadeMs)) : "0");
      if (beat) {
        const progress = (t - options.duration) / options.beatMs;
        write.style(beat, "transform", progress > 0 && progress < 1 ? `scale(${fmt(beatScale(progress, options.beatPeak))})` : "");
      }
    },
    (finished) => {
      pulse.style.setProperty("opacity", "0");
      beat?.style.removeProperty("transform");
      if (finished) onDone();
    },
  );
}
