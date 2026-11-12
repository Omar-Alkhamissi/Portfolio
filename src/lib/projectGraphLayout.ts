import type { ClusterKey, GraphEdge, GraphNode } from "./projectGraphData";

// A small deterministic force simulation for the constellation map.
// Link springs, pairwise repulsion, a pull toward each cluster centre and a
// collision pass that keeps a minimum distance between stars. It runs in the
// map's own pixel space, so the gap holds on screen at zoom 1. The layout runs
// once (about 300 ticks) per map size and is memoised by the caller; the same
// step function reheats the graph while a star is dragged.

export type LayoutMode = "wide" | "narrow";

export type LayoutArea = {
  width: number;
  height: number;
  /** Padding kept free around the stars, in px. */
  pad: number;
  /** Extra room above the stars for constellation names, in px. */
  padTop: number;
  /** Minimum centre distance between two stars, in px. */
  gap: number;
  /**
   * Bottom-left corner kept free of stars (the zoom buttons plus margin),
   * as a width and height in px measured from that corner.
   */
  keepOut?: { width: number; height: number };
};

export type SimPoint = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pinned position while dragged. */
  fx: number | null;
  fy: number | null;
};

export type Simulation = {
  points: SimPoint[];
  centres: { x: number; y: number }[];
  edges: GraphEdge[];
  sameCluster: boolean[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Stars may not sit left of x2 and below y1 at the same time. */
  keepOut: { x2: number; y1: number } | null;
  gap: number;
  charge: number;
  alpha: number;
};

// Cluster centres as fractions of the free area: 3 columns by 2 rows on wide
// maps, 2 columns by 3 rows on portrait maps.
const CLUSTER_SLOTS: Record<LayoutMode, Record<ClusterKey, { x: number; y: number }>> = {
  wide: {
    web: { x: 0.14, y: 0.22 },
    enterprise: { x: 0.5, y: 0.2 },
    java: { x: 0.86, y: 0.22 },
    systems: { x: 0.15, y: 0.78 },
    patterns: { x: 0.5, y: 0.8 },
    data: { x: 0.85, y: 0.78 },
  },
  narrow: {
    web: { x: 0.24, y: 0.13 },
    enterprise: { x: 0.76, y: 0.12 },
    patterns: { x: 0.24, y: 0.5 },
    java: { x: 0.76, y: 0.5 },
    systems: { x: 0.24, y: 0.87 },
    data: { x: 0.76, y: 0.87 },
  },
};

const TICKS = 300;
const ALPHA_MIN = 0.001;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / TICKS);
const VELOCITY_KEEP = 0.6;
const CHARGE = 260;
// Repulsion is scaled down on small maps so clusters do not spill onto the edges.
const CHARGE_REFERENCE_AREA = 816 * 630;
const CLUSTER_PULL = 0.09;
const LINK_STRENGTH_SAME = 0.05;
const LINK_STRENGTH_CROSS = 0.002;
const COLLISION_PASSES = 3;

export function layoutModeFor(width: number, height: number): LayoutMode {
  return width >= height * 1.1 ? "wide" : "narrow";
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a simulation. Without `start` the stars are scattered (seeded)
 * around their cluster centres; with `start` it continues from those
 * positions, which is how a drag reheats the resting layout.
 */
export function createSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  area: LayoutArea,
  start?: { x: number; y: number }[],
): Simulation {
  const random = seededRandom(20241111);
  // A zero or non-finite map size falls back to a 1x1 area so nothing divides by zero.
  const width = Number.isFinite(area.width) && area.width > 0 ? area.width : 1;
  const height = Number.isFinite(area.height) && area.height > 0 ? area.height : 1;
  const bounds = {
    minX: area.pad,
    maxX: Math.max(width - area.pad, area.pad + 1),
    minY: area.pad + area.padTop,
    maxY: Math.max(height - area.pad, area.pad + area.padTop + 1),
  };
  const slots = CLUSTER_SLOTS[layoutModeFor(width, height)];
  const centres = nodes.map((node) => ({
    x: bounds.minX + slots[node.cluster].x * (bounds.maxX - bounds.minX),
    y: bounds.minY + slots[node.cluster].y * (bounds.maxY - bounds.minY),
  }));
  const points: SimPoint[] = nodes.map((_, index) => {
    const angle = random() * Math.PI * 2;
    const radius = 10 + random() * area.gap;
    const from = start?.[index];
    const usable = from !== undefined && Number.isFinite(from.x) && Number.isFinite(from.y);
    return {
      x: usable ? from.x : centres[index].x + Math.cos(angle) * radius,
      y: usable ? from.y : centres[index].y + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    };
  });
  const sameCluster = edges.map((edge) => nodes[edge.source].cluster === nodes[edge.target].cluster);
  const charge = CHARGE * Math.min(1, (width * height) / CHARGE_REFERENCE_AREA);
  const keepOut = area.keepOut ? { x2: area.keepOut.width, y1: height - area.keepOut.height } : null;
  return { points, centres, edges, sameCluster, bounds, keepOut, gap: area.gap, charge, alpha: start ? 0 : 1 };
}

// Moves any free star out of the keep-out corner by the shorter way.
function clearKeepOut(sim: Simulation) {
  const zone = sim.keepOut;
  if (!zone) return;
  for (const point of sim.points) {
    if (point.fx !== null || point.x >= zone.x2 || point.y <= zone.y1) continue;
    if (zone.x2 - point.x < point.y - zone.y1) point.x = zone.x2;
    else point.y = zone.y1;
  }
}

function separate(sim: Simulation) {
  const { points, gap } = sim;
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (!Number.isFinite(distance) || distance >= gap) continue;
        if (distance < 0.01) {
          dx = 0.01 * (i - j);
          dy = 0.01;
          distance = Math.sqrt(dx * dx + dy * dy);
        }
        const overlap = (gap - distance) / distance;
        const aPinned = a.fx !== null;
        const bPinned = b.fx !== null;
        const aShare = aPinned ? 0 : bPinned ? 1 : 0.5;
        const bShare = bPinned ? 0 : aPinned ? 1 : 0.5;
        a.x -= dx * overlap * aShare;
        a.y -= dy * overlap * aShare;
        b.x += dx * overlap * bShare;
        b.y += dy * overlap * bShare;
      }
    }
  }
}

/** One tick. Returns false once the simulation has cooled. */
export function stepSimulation(sim: Simulation): boolean {
  const { points, centres, edges, sameCluster, bounds, gap, charge } = sim;
  const alpha = sim.alpha;
  const count = points.length;
  // Skip a tick that could only produce NaN.
  if (!Number.isFinite(alpha) || alpha <= 0) return false;
  for (const point of points) {
    if (point.fx !== null && (!Number.isFinite(point.fx) || !Number.isFinite(point.fy ?? NaN))) {
      point.fx = null;
      point.fy = null;
    }
  }

  for (let i = 0; i < count; i++) {
    const a = points[i];
    for (let j = i + 1; j < count; j++) {
      const b = points[j];
      const dx = b.x - a.x || 0.01;
      const dy = b.y - a.y;
      const d2 = Math.max(dx * dx + dy * dy, 1);
      if (!Number.isFinite(d2)) continue;
      const push = (charge * alpha) / d2;
      a.vx -= dx * push * 0.5;
      a.vy -= dy * push * 0.5;
      b.vx += dx * push * 0.5;
      b.vy += dy * push * 0.5;
    }
  }

  edges.forEach((edge, index) => {
    const a = points[edge.source];
    const b = points[edge.target];
    const dx = b.x + b.vx - a.x - a.vx;
    const dy = b.y + b.vy - a.y - a.vy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!Number.isFinite(distance) || distance === 0) return;
    const length = sameCluster[index] ? gap * 1.3 : gap * 6;
    const strength = sameCluster[index] ? LINK_STRENGTH_SAME : LINK_STRENGTH_CROSS;
    const pull = ((distance - length) / distance) * strength * alpha;
    a.vx += dx * pull;
    a.vy += dy * pull;
    b.vx -= dx * pull;
    b.vy -= dy * pull;
  });

  for (let i = 0; i < count; i++) {
    const point = points[i];
    if (point.fx !== null && point.fy !== null) {
      point.x = point.fx;
      point.y = point.fy;
      point.vx = 0;
      point.vy = 0;
      continue;
    }
    point.vx += (centres[i].x - point.x) * CLUSTER_PULL * alpha;
    point.vy += (centres[i].y - point.y) * CLUSTER_PULL * alpha;
    point.vx *= VELOCITY_KEEP;
    point.vy *= VELOCITY_KEEP;
    point.x += point.vx;
    point.y += point.vy;
  }

  separate(sim);

  points.forEach((point, index) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      point.x = centres[index].x;
      point.y = centres[index].y;
      point.vx = 0;
      point.vy = 0;
    }
    if (point.fx !== null) return;
    point.x = Math.min(bounds.maxX, Math.max(bounds.minX, point.x));
    point.y = Math.min(bounds.maxY, Math.max(bounds.minY, point.y));
  });
  clearKeepOut(sim);

  sim.alpha += (0 - sim.alpha) * ALPHA_DECAY;
  return sim.alpha >= ALPHA_MIN;
}

/** Runs the full layout once and returns resting positions in px. */
export function computeLayout(nodes: GraphNode[], edges: GraphEdge[], area: LayoutArea) {
  const sim = createSimulation(nodes, edges, area);
  for (let tick = 0; tick < TICKS; tick++) stepSimulation(sim);
  // A few extra collision passes so the minimum gap holds at rest.
  for (let pass = 0; pass < 4; pass++) {
    separate(sim);
    clearKeepOut(sim);
  }
  // Never hand back NaN: any non-finite point falls back to its cluster centre.
  return sim.points.map((point, index) =>
    Number.isFinite(point.x) && Number.isFinite(point.y)
      ? { x: point.x, y: point.y }
      : { x: sim.centres[index].x, y: sim.centres[index].y },
  );
}
