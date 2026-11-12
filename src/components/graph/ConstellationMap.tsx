import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useMotionOff } from "../../lib/motion";
import {
  announceGraphDragPerformance,
  useAdaptivePerformanceProfile,
  usePerformanceDiagnosticFlags,
} from "../../lib/performance";
import { CLUSTERS, type ClusterKey, type ProjectGraphData } from "../../lib/projectGraphData";
import { setSkillFocus } from "../../lib/skillFocus";
import {
  computeLayout,
  createSimulation,
  stepSimulation,
  type LayoutArea,
  type Simulation,
} from "../../lib/projectGraphLayout";
import {
  easeEnter,
  easeLeave,
  easeStay,
  planRetrace,
  planSpawn,
  playDash,
  playPulse,
  playRetrace,
  playSignal,
  playSpawn,
  type Point,
  type SpawnPlan,
  type Timeline,
} from "./mapMotion";

type Box = { x1: number; y1: number; x2: number; y2: number };
type View = { zoom: number; panX: number; panY: number };
type DrawPhase = "hidden" | "spawning" | "done";
type LabelSpot = { x: number; y: number; anchor: "start" | "end" | "middle" };
type ClusterLabel = { key: ClusterKey; name: string; x: number; y: number; box: Box };
type DragState =
  | { kind: "star"; index: number; pointerId: number; startX: number; startY: number; moved: boolean }
  | { kind: "pan"; pointerId: number; startX: number; startY: number; panX: number; panY: number; moved: boolean };

// The signal on select: links draw out from `star` after `delay` ms.
type Signal = { id: number; star: number; delay: number };
// A spark travels from one star to a linked one, in fitted (pre-view) space.
type Spark = { id: number; from: Point; to: Point };
// A star whose links are drawing in, or retracting, on hover or deselect.
type Fading = { id: number; star: number };

type ConstellationMapProps = {
  graph: ProjectGraphData;
  selected: number | null;
  hovered: number | null;
  /** Constellation pointed at in the catalogue; the others dim. */
  clusterFocus: ClusterKey | null;
  /** The skill chosen in the Skills section, or null. */
  skill: string | null;
  /** Indices of the projects that use `skill`; null when no skill is focused. */
  skillMatches: ReadonlySet<number> | null;
  onSelect: (index: number | null) => void;
  onHover: (index: number | null) => void;
};

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 1.25;
const ZOOM_ALL_LABELS = 1.4;
const DRAG_THRESHOLD = 4;
const IDLE_LABELS = 7;
const RADIUS_MIN = 3;
const RADIUS_MAX = 9;
const MOBILE_RADIUS_SCALE = 0.75;
const STAR_GAP = 44;
const NAME_ROOM = 16;
const LABEL_CHAR_WIDTH = 6.2;
const LABEL_HEIGHT = 12;
const LABEL_OFFSET = 5;
const NAME_CHAR_WIDTH = 7.2;
const EDGE_OPACITY_SAME = 0.2;
const EDGE_OPACITY_CROSS = 0.08;
const EDGE_OPACITY_HOVER = 0.55;
const ENTER = "cubic-bezier(0.05, 0.7, 0.1, 1)";
const STAY = "cubic-bezier(0.2, 0, 0, 1)";
// Signal, spark and slew.
const SIGNAL_LINK_MS = 320;
const SIGNAL_GAP_MS = 40;
const PACKET_MS = 380;
const BEAT_MS = 260;
const BEAT_PEAK = 1.35;
const RIPPLE_MS = 520;
const RIPPLE_GROW = 22;
const RIPPLE_OPACITY = 0.7;
const SPIKE_MS = 240;
const RETRACT_MS = 180;
const SPARK_MS = 400;
// Hover links draw out and retract; the index re-traces a constellation.
const HOVER_DRAW_MS = 160;
const HOVER_RETRACT_MS = 120;
const RETRACE_LINK_MS = 90;
// Idle life: one pulse at a time along a random link.
const IDLE_GAP_MIN_MS = 2200;
const IDLE_GAP_MAX_MS = 4500;
const PULSE_MIN_MS = 600;
const PULSE_MAX_MS = 900;
const PULSE_BEAT_MS = 240;
const PULSE_BEAT_PEAK = 1.15;
const PULSE_OPACITY = 0.9;
const SLEW_MS = 450;
const SLEW_INSET = 12;
// Skill focus: rings draw in left to right.
const RING_MS = 220;
const RING_GAP_MS = 40;
const RING_GROW = 5;
const SKILL_DIM = 0.2;
const SKILL_EDGE_OPACITY = 0.6;
const HOVER_SCALE = 1.2;
const HOVER_MS = 150;
const COOL_ALPHA = 0.005;
const DRAG_ALPHA = 0.25;
const IDENTITY_VIEW: View = { zoom: 1, panX: 0, panY: 0 };
// The zoom buttons sit in the bottom-left corner; labels keep clear of them.
// Box: 12px inset + three 32px buttons with 8px gaps + 12px margin.
const BUTTONS_BOX = { width: 12 + 112 + 12, height: 12 + 32 + 12 };
// Star centres also keep a full star radius plus fit drift clear of the box.
const BUTTONS_KEEP_OUT = { width: BUTTONS_BOX.width + RADIUS_MAX + 8, height: BUTTONS_BOX.height + RADIUS_MAX + 8 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const intersects = (a: Box, b: Box) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

const fraction = (value: number) => value - Math.floor(value);

// A hover link sits over its resting line; this keeps the two together at the
// old hover brightness.
const overlayOpacity = (base: number) =>
  base >= EDGE_OPACITY_HOVER ? EDGE_OPACITY_HOVER : 1 - (1 - EDGE_OPACITY_HOVER) / (1 - base);

// Keyframes for the twinkle, skill rings, spikes and the spark. Transforms
// on SVG groups scale around the group's own origin, which is the star centre.
// Spawn-in, signal, hover links and idle pulses run on rAF (see mapMotion.ts).
const MAP_KEYFRAMES = `
@keyframes cm-twinkle { 0%, 100% { opacity: 1; } 50% { opacity: 0.72; } }
@keyframes cm-ring { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
@keyframes cm-spike { from { transform: scale(0); } to { transform: scale(1); } }
@keyframes cm-spark {
  from { transform: translate(var(--spark-from-x), var(--spark-from-y)); }
  to { transform: translate(var(--spark-to-x), var(--spark-to-y)); }
}
`;

function useIsMobile() {
  const query = "(max-width: 639px)";
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}

// Right, left, above, below: the order a label tries its spots in.
function labelSpots(point: Point, radius: number, width: number) {
  const gap = radius + LABEL_OFFSET;
  const spots: { spot: LabelSpot; box: Box }[] = [
    {
      spot: { x: gap, y: 4, anchor: "start" },
      box: { x1: point.x + gap, y1: point.y - 8, x2: point.x + gap + width, y2: point.y + 4 },
    },
    {
      spot: { x: -gap, y: 4, anchor: "end" },
      box: { x1: point.x - gap - width, y1: point.y - 8, x2: point.x - gap, y2: point.y + 4 },
    },
    {
      spot: { x: 0, y: -gap - 2, anchor: "middle" },
      box: { x1: point.x - width / 2, y1: point.y - gap - LABEL_HEIGHT, x2: point.x + width / 2, y2: point.y - gap },
    },
    {
      spot: { x: 0, y: gap + 10, anchor: "middle" },
      box: { x1: point.x - width / 2, y1: point.y + gap, x2: point.x + width / 2, y2: point.y + gap + LABEL_HEIGHT },
    },
  ];
  return spots;
}

export function ConstellationMap({
  graph,
  selected,
  hovered,
  clusterFocus,
  skill,
  skillMatches,
  onSelect,
  onHover,
}: ConstellationMapProps) {
  const { nodes, edges, neighbours } = graph;
  const descriptionId = useId();
  const motionOff = useMotionOff();
  const profile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const stillMode = motionOff || diagnostics.staticMode;
  const stillModeRef = useRef(stillMode);
  stillModeRef.current = stillMode;
  const isMobile = useIsMobile();

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const measured = size.width > 0 && size.height > 0;
  const pad = isMobile ? 24 : 48;

  // The layout runs in the map's own pixel space, once per map size.
  const area = useMemo<LayoutArea>(
    () => ({
      width: size.width,
      height: size.height,
      pad,
      padTop: NAME_ROOM,
      gap: STAR_GAP,
      // From 640px up the buttons overlay the map, so their corner stays free.
      keepOut: isMobile ? undefined : BUTTONS_KEEP_OUT,
    }),
    [isMobile, pad, size.height, size.width],
  );
  const layoutCache = useRef(new Map<string, Point[]>());
  const baseLayout = useMemo<Point[]>(() => {
    if (!measured) return [];
    const key = `${area.width}x${area.height}x${area.pad}`;
    const cached = layoutCache.current.get(key);
    if (cached) return cached;
    const layout = computeLayout(nodes, edges, area);
    layoutCache.current.set(key, layout);
    return layout;
  }, [area, edges, measured, nodes]);

  const [positions, setPositions] = useState<Point[]>(baseLayout);
  const [view, setView] = useState<View>(IDENTITY_VIEW);
  const [phase, setPhase] = useState<DrawPhase>(stillMode ? "done" : "hidden");
  const [focusRing, setFocusRing] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  // True from the start of a star drag until the simulation cools.
  const [settling, setSettling] = useState(false);

  const simRef = useRef<Simulation | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const draggingRef = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    setPositions(baseLayout);
    simRef.current = null;
  }, [baseLayout]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const rect = frame.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      const win: Window = window;
      win.addEventListener("resize", measure);
      return () => win.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Fit the bounding box of the resting layout to the frame with padding;
  // zoom and pan sit on top of this.
  const fit = useMemo(() => {
    if (baseLayout.length === 0) return { scale: 1, offsetX: 0, offsetY: 0 };
    const xs = baseLayout.map((point) => point.x);
    const ys = baseLayout.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(Math.max(...xs) - minX, 1);
    const spanY = Math.max(Math.max(...ys) - minY, 1);
    const innerW = Math.max(size.width - pad * 2, 40);
    const innerH = Math.max(size.height - pad * 2 - NAME_ROOM, 40);
    const rawScale = Math.min(innerW / spanX, innerH / spanY);
    const finite = [minX, minY, spanX, spanY, rawScale].every(Number.isFinite);
    if (!finite || rawScale <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
    const scale = rawScale;
    return {
      scale,
      offsetX: pad + (innerW - spanX * scale) / 2 - minX * scale,
      offsetY: pad + NAME_ROOM + (innerH - spanY * scale) / 2 - minY * scale,
    };
  }, [baseLayout, pad, size.height, size.width]);

  const screen = useMemo(
    () =>
      positions.map((point) => ({
        x: (point.x * fit.scale + fit.offsetX) * view.zoom + view.panX,
        y: (point.y * fit.scale + fit.offsetY) * view.zoom + view.panY,
      })),
    [fit, positions, view],
  );
  // Draw nothing until the map is measured and every position is a real number.
  const ready =
    measured &&
    screen.length === nodes.length &&
    screen.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      const current = viewRef.current;
      return {
        x: ((sx - current.panX) / current.zoom - fit.offsetX) / fit.scale,
        y: ((sy - current.panY) / current.zoom - fit.offsetY) / fit.scale,
      };
    },
    [fit],
  );

  const radii = useMemo(() => {
    const counts = nodes.map((node) => node.linkCount);
    const min = Math.min(...counts);
    const span = Math.max(Math.max(...counts) - min, 1);
    const scale = isMobile ? MOBILE_RADIUS_SCALE : 1;
    return counts.map(
      (count) => (RADIUS_MIN + ((count - min) / span) * (RADIUS_MAX - RADIUS_MIN)) * scale,
    );
  }, [isMobile, nodes]);

  const byRank = useMemo(
    () =>
      [...nodes]
        .sort((a, b) => b.linkCount - a.linkCount || b.strength - a.strength || a.index - b.index)
        .map((node) => node.index),
    [nodes],
  );

  const neighbourSets = useMemo(
    () => neighbours.map((list) => new Set(list.map((link) => link.index))),
    [neighbours],
  );

  const focusSet = useMemo(() => {
    const set = new Set<number>();
    for (const index of [hovered, selected]) {
      if (index === null) continue;
      set.add(index);
      neighbourSets[index].forEach((other) => set.add(other));
    }
    return set;
  }, [hovered, neighbourSets, selected]);

  const hasFocus = focusSet.size > 0;
  const skillActive = skill !== null && skillMatches !== null;
  const matchCount = skillMatches?.size ?? 0;
  const showAllLabels = view.zoom >= ZOOM_ALL_LABELS;

  // Labels wanted this frame, most important first.
  const wantedLabels = useMemo(() => {
    const wanted: number[] = [];
    const add = (index: number | null) => {
      if (index !== null && !wanted.includes(index)) wanted.push(index);
    };
    add(selected);
    add(hovered);
    for (const index of byRank) {
      if (showAllLabels || focusSet.has(index) || skillMatches?.has(index)) add(index);
      else if (!hasFocus && !skillActive && !isMobile && wanted.length < IDLE_LABELS) add(index);
    }
    return wanted;
  }, [byRank, focusSet, hasFocus, hovered, isMobile, selected, showAllLabels, skillActive, skillMatches]);

  // Rings around the skill's stars draw in left to right, by resting position.
  const ringOrder = useMemo(() => {
    const order = new Map<number, number>();
    if (!skillMatches) return order;
    [...skillMatches]
      .sort((a, b) => (baseLayout[a]?.x ?? 0) - (baseLayout[b]?.x ?? 0) || a - b)
      .forEach((index, rank) => order.set(index, rank));
    return order;
  }, [baseLayout, skillMatches]);

  // Constellation names sit just above the top-most star of their cluster.
  const clusterLabels = useMemo<ClusterLabel[]>(() => {
    if (screen.length === 0) return [];
    const labels: ClusterLabel[] = [];
    for (const cluster of CLUSTERS) {
      const members = nodes.filter((node) => node.cluster === cluster.key).map((node) => node.index);
      if (members.length === 0) continue;
      const top = members.reduce((best, index) => (screen[index].y < screen[best].y ? index : best));
      const centreX = members.reduce((sum, index) => sum + screen[index].x, 0) / members.length;
      const width = cluster.name.length * NAME_CHAR_WIDTH;
      const x = clamp(centreX, width / 2 + 4, Math.max(size.width - width / 2 - 4, width / 2 + 4));
      const y = screen[top].y - radii[top] - 10;
      labels.push({
        key: cluster.key,
        name: cluster.name,
        x,
        y,
        box: { x1: x - width / 2, y1: y - 12, x2: x + width / 2, y2: y + 3 },
      });
    }
    return labels;
  }, [nodes, radii, screen, size.width]);

  // Label placement: each wanted label takes the first spot (right, left,
  // above, below) that clears other labels, stars, names and the buttons.
  // Frozen while a dragged graph settles so labels do not flicker.
  const placementRef = useRef(new Map<number, LabelSpot>());
  const placement = useMemo(() => {
    if (settling) return placementRef.current;
    const result = new Map<number, LabelSpot>();
    if (screen.length === 0) return result;
    const obstacles: Box[] = clusterLabels.map((label) => label.box);
    if (!isMobile) {
      obstacles.push({ x1: 0, y1: size.height - BUTTONS_BOX.height, x2: BUTTONS_BOX.width, y2: size.height });
    }
    const starBoxes = screen.map((point, index) => {
      const r = radii[index] + 2;
      return { x1: point.x - r, y1: point.y - r, x2: point.x + r, y2: point.y + r };
    });
    const placed: Box[] = [];
    for (const index of wantedLabels) {
      const width = nodes[index].id.length * LABEL_CHAR_WIDTH;
      const spots = labelSpots(screen[index], radii[index], width);
      const fits = spots.find(({ box }) => {
        if (box.x1 < 2 || box.y1 < 2 || box.x2 > size.width - 2 || box.y2 > size.height - 2) return false;
        if (placed.some((other) => intersects(box, other))) return false;
        if (obstacles.some((other) => intersects(box, other))) return false;
        return !starBoxes.some((other, otherIndex) => otherIndex !== index && intersects(box, other));
      });
      if (fits) {
        result.set(index, fits.spot);
        placed.push(fits.box);
      } else if (index === hovered || index === selected) {
        const inside =
          spots.find(({ box }) => box.x1 >= 2 && box.x2 <= size.width - 2) ?? spots[0];
        result.set(index, inside.spot);
        placed.push(inside.box);
      }
    }
    placementRef.current = result;
    return result;
  }, [clusterLabels, hovered, isMobile, nodes, radii, screen, selected, settling, size.height, size.width, wantedLabels]);

  // Spawn-in schedule. Constellations go in reading order (rows top to
  // bottom, then left to right); inside one, the stars light up along a
  // breadth-first walk from the most-linked star. Links between
  // constellations shoot across once all six are in, shortest first.
  const spawnPlan = useMemo<SpawnPlan>(() => {
    if (baseLayout.length !== nodes.length) {
      return planSpawn(nodes, edges, CLUSTERS.map((cluster) => cluster.key), () => 0);
    }
    const ys = baseLayout.map((point) => point.y);
    const minY = Math.min(...ys);
    const spanY = Math.max(Math.max(...ys) - minY, 1);
    const groups = CLUSTERS.map((cluster) => {
      const members = nodes.filter((node) => node.cluster === cluster.key).map((node) => node.index);
      const cx = members.reduce((sum, index) => sum + baseLayout[index].x, 0) / Math.max(members.length, 1);
      const cy = members.reduce((sum, index) => sum + baseLayout[index].y, 0) / Math.max(members.length, 1);
      const row = clamp(Math.floor(((cy - minY) / spanY) * 3), 0, 2);
      return { key: cluster.key, members, cx, row };
    })
      .filter((group) => group.members.length > 0)
      .sort((a, b) => a.row - b.row || a.cx - b.cx);
    const length = (edgeIndex: number) => {
      const a = baseLayout[edges[edgeIndex].source];
      const b = baseLayout[edges[edgeIndex].target];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    return planSpawn(nodes, edges, groups.map((group) => group.key), length);
  }, [baseLayout, edges, nodes]);

  // Each star twinkles with its own period (3 to 7 s) and phase.
  const twinkle = useMemo(
    () =>
      nodes.map((_, index) => {
        const period = 3 + fraction(Math.sin((index + 1) * 12.9898) * 43758.5453) * 4;
        const offset = fraction(Math.sin((index + 1) * 78.233) * 12345.6789);
        return { period, delay: -offset * period };
      }),
    [nodes],
  );

  // Twinkling only runs while the map is on screen.
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Spawn-in, once, when the map first enters view.
  useEffect(() => {
    if (stillMode) {
      setPhase("done");
      return;
    }
    const frame = frameRef.current;
    if (!frame || !("IntersectionObserver" in window)) {
      setPhase("done");
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setPhase((current) => (current === "hidden" ? "spawning" : current));
      },
      { threshold: 0.25 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
    // Runs once on mount on purpose: the spawn-in never replays.
  }, []);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // Any touch on the map during the spawn-in jumps to the resting state.
  const finishSpawn = useCallback(() => {
    if (phaseRef.current !== "done") setPhase("done");
  }, []);
  useEffect(() => {
    if (phaseRef.current === "spawning") setPhase("done");
  }, [hovered, selected, clusterFocus, skill]);

  // Live positions and sizes for the rAF timelines.
  const radiiRef = useRef(radii);
  radiiRef.current = radii;
  const spawnPlanRef = useRef(spawnPlan);
  spawnPlanRef.current = spawnPlan;

  // Signal on select, spark on follow, slew to an off-screen star.
  const [signal, setSignal] = useState<Signal | null>(null);
  const [spark, setSpark] = useState<Spark | null>(null);
  const [fading, setFading] = useState<Fading | null>(null);
  const motionIdRef = useRef(0);
  const timersRef = useRef(new Set<number>());
  const slewRef = useRef<number | null>(null);
  const prevSelectedRef = useRef<number | null>(selected);
  const screenRef = useRef<Point[]>(screen);
  screenRef.current = screen;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const neighbourSetsRef = useRef(neighbourSets);
  neighbourSetsRef.current = neighbourSets;
  // A star's position in fitted space (before zoom and pan), read right now.
  const fittedRef = useRef<(index: number) => Point | null>(() => null);
  fittedRef.current = (index: number) => {
    const point = positions[index];
    if (!point) return null;
    const x = point.x * fit.scale + fit.offsetX;
    const y = point.y * fit.scale + fit.offsetY;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };

  const later = useCallback((callback: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, ms);
    timersRef.current.add(timer);
  }, []);

  const cancelSlew = useCallback(() => {
    if (slewRef.current !== null) {
      window.cancelAnimationFrame(slewRef.current);
      slewRef.current = null;
    }
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      cancelSlew();
    };
  }, [cancelSlew]);

  // Paused or reduced motion mid-animation: finish everything at once.
  useEffect(() => {
    if (!stillMode) return;
    setPhase("done");
    setSignal(null);
    setSpark(null);
    setFading(null);
  }, [stillMode]);

  // Glide the pan so a star outside the view sits near the centre. Zoom stays.
  const slewTo = useCallback(
    (index: number) => {
      const point = screenRef.current[index];
      const { width, height } = sizeRef.current;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || width === 0) return;
      const visible =
        point.x >= SLEW_INSET &&
        point.x <= width - SLEW_INSET &&
        point.y >= SLEW_INSET &&
        point.y <= height - SLEW_INSET;
      if (visible) return;
      cancelSlew();
      const start = viewRef.current;
      const dx = width / 2 - point.x;
      const dy = height / 2 - point.y;
      if (stillModeRef.current) {
        setView({ zoom: start.zoom, panX: start.panX + dx, panY: start.panY + dy });
        return;
      }
      const began = performance.now();
      const tick = (now: number) => {
        const progress = clamp((now - began) / SLEW_MS, 0, 1);
        const eased = easeStay(progress);
        setView({ zoom: start.zoom, panX: start.panX + dx * eased, panY: start.panY + dy * eased });
        slewRef.current = progress < 1 ? window.requestAnimationFrame(tick) : null;
      };
      slewRef.current = window.requestAnimationFrame(tick);
    },
    [cancelSlew],
  );

  // Reads star positions once, when the selection changes.
  useEffect(() => {
    const previous = prevSelectedRef.current;
    prevSelectedRef.current = selected;
    if (previous === selected) return;
    const id = (motionIdRef.current += 1);
    // The old gold links retract into their star; with motion off they just go.
    setFading(previous !== null && !stillModeRef.current ? { id, star: previous } : null);
    if (selected === null) {
      setSignal(null);
      setSpark(null);
      return;
    }
    slewTo(selected);
    if (stillModeRef.current) {
      setSignal(null);
      setSpark(null);
      return;
    }
    const from = previous !== null && neighbourSetsRef.current[previous]?.has(selected)
      ? fittedRef.current(previous)
      : null;
    const to = fittedRef.current(selected);
    if (from && to) {
      setSpark({ id, from, to });
      later(() => setSpark((current) => (current?.id === id ? null : current)), SPARK_MS);
      setSignal({ id, star: selected, delay: SPARK_MS });
    } else {
      setSpark(null);
      setSignal({ id, star: selected, delay: 0 });
    }
  }, [later, selected, slewTo]);

  // The rAF timelines below live in mapMotion.ts. Each one is cancelled when
  // its effect re-runs or the map unmounts.
  const readScreen = useCallback(() => screenRef.current, []);
  const readRadius = useCallback((index: number) => radiiRef.current[index] ?? RADIUS_MIN, []);
  const overlayLines = (group: string) => [
    ...(svgRef.current?.querySelectorAll<SVGElement>(`[${group}] line`) ?? []),
  ];

  const spawnRun = phase === "spawning" && ready;
  useEffect(() => {
    const svg = svgRef.current;
    if (!spawnRun || !svg) return;
    const timeline = playSpawn(svg, spawnPlanRef.current, readScreen, readRadius, () =>
      setPhase((current) => (current === "spawning" ? "done" : current)),
    );
    return () => timeline.cancel();
  }, [readRadius, readScreen, spawnRun]);

  // Hover: the hovered star's links draw out from it and retract after.
  const hoverAnimated = !stillMode && phase === "done";
  const [hoverIn, setHoverIn] = useState<Fading | null>(null);
  const [hoverOut, setHoverOut] = useState<Fading | null>(null);
  const hoverInRef = useRef<Fading | null>(null);
  const hoverInTimelineRef = useRef<Timeline | null>(null);
  useEffect(() => {
    if (!hoverAnimated) {
      hoverInRef.current = null;
      setHoverIn(null);
      setHoverOut(null);
      return;
    }
    const current = hoverInRef.current;
    if (current?.star === hovered) return;
    if (current) setHoverOut({ id: (motionIdRef.current += 1), star: current.star });
    const next = hovered === null ? null : { id: (motionIdRef.current += 1), star: hovered };
    hoverInRef.current = next;
    setHoverIn(next);
  }, [hoverAnimated, hovered]);
  useEffect(() => {
    if (!hoverIn) return;
    const timeline = playDash(overlayLines("data-hover-in"), 1, 0, HOVER_DRAW_MS, easeEnter);
    hoverInTimelineRef.current = timeline;
    return () => {
      timeline.cancel();
      hoverInTimelineRef.current = null;
    };
    // overlayLines reads the DOM; the timeline restarts only for a new hover.
  }, [hoverIn]);
  useEffect(() => {
    if (!hoverOut) return;
    const { id } = hoverOut;
    const timeline = playDash(overlayLines("data-hover-out"), 0, 1, HOVER_RETRACT_MS, easeLeave, () =>
      setHoverOut((current) => (current?.id === id ? null : current)),
    );
    return () => timeline.cancel();
  }, [hoverOut]);
  // A drag shows the hover links at once and drops any retracting ones.
  const settleHover = useCallback(() => {
    hoverInTimelineRef.current?.cancel();
    hoverInTimelineRef.current = null;
    svgRef.current
      ?.querySelectorAll("[data-hover-in] line")
      .forEach((line) => line.setAttribute("stroke-dashoffset", "0"));
    setHoverOut(null);
  }, []);

  // Deselect: the gold links retract into their star.
  useEffect(() => {
    if (!fading) return;
    const { id } = fading;
    const timeline = playDash(overlayLines("data-fading"), 0, 1, RETRACT_MS, easeLeave, () =>
      setFading((current) => (current?.id === id ? null : current)),
    );
    return () => timeline.cancel();
  }, [fading]);

  // Select: gold links, packets, neighbour beats and one ripple.
  useEffect(() => {
    const svg = svgRef.current;
    if (!signal || !svg || stillModeRef.current) return;
    const timeline = playSignal(svg, {
      star: signal.star,
      neighbours: neighbours[signal.star].map((link) => link.index),
      delay: signal.delay,
      linkMs: SIGNAL_LINK_MS,
      gapMs: SIGNAL_GAP_MS,
      packetMs: PACKET_MS,
      beatMs: BEAT_MS,
      beatPeak: BEAT_PEAK,
      rippleMs: RIPPLE_MS,
      rippleGrow: RIPPLE_GROW,
      rippleOpacity: RIPPLE_OPACITY,
      screen: readScreen,
      radius: readRadius,
    });
    return () => timeline.cancel();
  }, [neighbours, readRadius, readScreen, signal]);

  // Index hover: re-trace the highlighted constellation's links.
  const retraceOn = clusterFocus !== null && !stillMode && phase === "done" && ready && !settling;
  useEffect(() => {
    const svg = svgRef.current;
    if (!retraceOn || clusterFocus === null || !svg) return;
    const timeline = playRetrace(svg, planRetrace(nodes, edges, clusterFocus, RETRACE_LINK_MS));
    return () => timeline.cancel();
  }, [clusterFocus, edges, nodes, retraceOn]);

  // Idle life: now and then one pulse runs along a random link.
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const idleOn =
    !stillMode &&
    phase === "done" &&
    ready &&
    profile.quality !== "lite" &&
    inView &&
    pageVisible &&
    hovered === null &&
    selected === null &&
    !skillActive &&
    clusterFocus === null &&
    !settling &&
    !panning &&
    edges.length > 0;
  useEffect(() => {
    if (!idleOn) return;
    let timer = 0;
    let timeline: Timeline | null = null;
    const schedule = () => {
      const wait = IDLE_GAP_MIN_MS + Math.random() * (IDLE_GAP_MAX_MS - IDLE_GAP_MIN_MS);
      timer = window.setTimeout(fire, wait);
    };
    const fire = () => {
      const svg = svgRef.current;
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const flip = Math.random() < 0.5;
      const from = flip ? edge.target : edge.source;
      const to = flip ? edge.source : edge.target;
      const a = screenRef.current[from];
      const b = screenRef.current[to];
      if (!svg || !a || !b) {
        schedule();
        return;
      }
      const { width, height } = sizeRef.current;
      const reach = Math.max(Math.hypot(width, height) / 2, 1);
      const share = clamp(Math.hypot(b.x - a.x, b.y - a.y) / reach, 0, 1);
      timeline = playPulse(
        svg,
        {
          from,
          to,
          duration: PULSE_MIN_MS + (PULSE_MAX_MS - PULSE_MIN_MS) * share,
          beatMs: PULSE_BEAT_MS,
          beatPeak: PULSE_BEAT_PEAK,
          opacity: PULSE_OPACITY,
          screen: readScreen,
        },
        () => {
          timeline = null;
          schedule();
        },
      );
      if (!timeline) schedule();
    };
    schedule();
    return () => {
      window.clearTimeout(timer);
      timeline?.cancel();
    };
  }, [edges, idleOn, readScreen]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Runs the simulation on rAF only until it cools, capped at the profile fps.
  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const minFrameMs = 1000 / Math.max(profile.graph.maxFps, 1);
    let last = 0;
    const tick = (time: number) => {
      const sim = simRef.current;
      if (!sim) {
        rafRef.current = null;
        setSettling(false);
        return;
      }
      if (time - last >= minFrameMs - 1) {
        last = time;
        stepSimulation(sim);
        setPositions(sim.points.map((point) => ({ x: point.x, y: point.y })));
      }
      if (sim.alpha < COOL_ALPHA && !draggingRef.current) {
        rafRef.current = null;
        setSettling(false);
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
  }, [profile.graph.maxFps]);

  useEffect(
    () => () => {
      stopLoop();
      if (draggingRef.current) announceGraphDragPerformance(false);
    },
    [stopLoop],
  );

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    cancelSlew();
    setView((current) => {
      const zoom = clamp(current.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const ratio = zoom / current.zoom;
      return { zoom, panX: sx - (sx - current.panX) * ratio, panY: sy - (sy - current.panY) * ratio };
    });
  }, [cancelSlew]);

  // Wheel zooms around the pointer and never scrolls the page: a capture,
  // non-passive listener on window so it wins before the page scrolls.
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const frame = wrapperRef.current;
      const svg = svgRef.current;
      const target = event.target;
      if (!frame || !svg || !(target instanceof Node) || !frame.contains(target)) return;
      // Ctrl or Cmd plus wheel (and trackpad pinch) is the browser's page zoom: leave it alone.
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      finishSpawn();
      const rect = svg.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    const options: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("wheel", handleWheel, options);
    return () => window.removeEventListener("wheel", handleWheel, options);
  }, [finishSpawn, zoomAt]);

  const endDrag = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setPanning(false);
      if (svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
      if (drag.kind === "star") {
        if (drag.moved) {
          draggingRef.current = false;
          announceGraphDragPerformance(false);
          const point = simRef.current?.points[drag.index];
          if (point) {
            point.fx = null;
            point.fy = null;
          }
          if (rafRef.current === null) setSettling(false);
        } else if (!cancelled) {
          onSelect(drag.index === selected ? null : drag.index);
        }
      } else if (!drag.moved && !cancelled) {
        onSelect(null);
      }
    },
    [onSelect, selected],
  );

  const handleStarPointerDown = (index: number, event: ReactPointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    finishSpawn();
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "star",
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const handleBackgroundPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    finishSpawn();
    cancelSlew();
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: viewRef.current.panX,
      panY: viewRef.current.panY,
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    if (drag.kind === "pan") {
      if (!drag.moved) setPanning(true);
      drag.moved = true;
      setView((current) => ({ ...current, panX: drag.panX + dx, panY: drag.panY + dy }));
      return;
    }

    const world = toWorld(event.clientX, event.clientY);
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return;
    if (!drag.moved) {
      drag.moved = true;
      draggingRef.current = true;
      // A drag cancels any running signal, spark, slew, retract or hover draw.
      // Idle pulses and the re-trace stop through `settling`.
      cancelSlew();
      setSignal(null);
      setSpark(null);
      setFading(null);
      settleHover();
      setSettling(true);
      announceGraphDragPerformance(true);
      if (!simRef.current) simRef.current = createSimulation(nodes, edges, area, positions);
    }
    const sim = simRef.current;
    if (!sim) return;
    const point = sim.points[drag.index];
    point.fx = world.x;
    point.fy = world.y;
    point.x = world.x;
    point.y = world.y;

    if (stillMode) {
      // No reheat: only the dragged star moves.
      setPositions(sim.points.map((p) => ({ x: p.x, y: p.y })));
      return;
    }
    sim.alpha = Math.max(sim.alpha, DRAG_ALPHA);
    startLoop();
  };

  const resetView = () => {
    cancelSlew();
    stopLoop();
    simRef.current = null;
    setSettling(false);
    setView(IDENTITY_VIEW);
    setPositions(baseLayout);
  };

  const zoomFromCentre = (factor: number) => zoomAt(factor, size.width / 2, size.height / 2);

  const handleStarKeyDown = (index: number, event: ReactKeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(index === selected ? null : index);
    } else if (event.key === "Escape") {
      onSelect(null);
    }
  };

  // Before and during the spawn-in everything renders hidden; the spawn
  // timeline writes values straight to the elements, and "done" hands the
  // resting values back to React.
  const unlit = phase !== "done";
  const twinkleOn =
    !stillMode && profile.quality !== "lite" && phase === "done" && inView && !settling && !panning;
  // Signal order: the selected star's links, strongest first.
  const signalLinks = signal !== null && signal.star === selected ? neighbours[signal.star] : null;
  const restingEdgeOpacity = (a: number, b: number) => {
    if (skillActive && skillMatches !== null && skillMatches.has(a) && skillMatches.has(b)) return SKILL_EDGE_OPACITY;
    return nodes[a].cluster === nodes[b].cluster ? EDGE_OPACITY_SAME : EDGE_OPACITY_CROSS;
  };
  // Hover links over the resting lines, drawn out from (or back into) a star.
  // A link of the selected star is already bright, so it gets none.
  const hoverOverlay = (state: Fading | null, attr: string, offset: number) =>
    state !== null &&
    state.star !== selected && (
      <g {...{ [attr]: "" }}>
        {neighbours[state.star]
          .filter((link) => link.index !== selected)
          .map((link) => (
            <line
              key={`${state.id}-${link.index}`}
              x1={screen[state.star].x}
              y1={screen[state.star].y}
              x2={screen[link.index].x}
              y2={screen[link.index].y}
              className="stroke-fg"
              strokeWidth={1}
              strokeOpacity={overlayOpacity(restingEdgeOpacity(state.star, link.index))}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={offset}
            />
          ))}
      </g>
    );

  return (
    <div
      ref={wrapperRef}
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // First Escape drops the selection; with none left it drops the skill.
        if (selected === null && skillActive) setSkillFocus(null);
        else onSelect(null);
      }}
    >
      <style>{MAP_KEYFRAMES}</style>
      {/* Always reserves its height, so nothing jumps when a skill is focused. */}
      <div className="mb-2 flex h-8 items-center gap-4" aria-live="polite">
        {skillActive && (
          <>
            <p className="min-w-0 truncate text-[16px] text-fg">
              {matchCount} {matchCount === 1 ? "project uses" : "projects use"} {skill}
            </p>
            <button type="button" className="toggle shrink-0" onClick={() => setSkillFocus(null)}>
              Clear
            </button>
          </>
        )}
      </div>
      <div ref={frameRef} className="h-[460px] lg:h-[clamp(420px,70vh,680px)]">
      <p id={descriptionId} className="sr-only">
        Use Tab to move between projects and Enter to open a project note. Escape clears the selection.
      </p>
      <svg
        ref={svgRef}
        role="group"
        aria-label="Project constellation map"
        aria-describedby={descriptionId}
        className={panning ? "block h-full w-full cursor-grabbing select-none" : "block h-full w-full cursor-grab select-none"}
        viewBox={measured ? `0 0 ${size.width} ${size.height}` : undefined}
        style={{ touchAction: "pan-y" }}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
      >
        {ready && (
          <>
            <g aria-hidden="true">
              {clusterLabels.map((label) => (
                <text
                  key={label.key}
                  data-cluster-name={label.key}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  className="pointer-events-none fill-fg-faint text-[14px]"
                  style={{
                    opacity: unlit ? 0 : clusterFocus && clusterFocus !== label.key ? 0.2 : 1,
                    transition: unlit ? "none" : `opacity ${HOVER_MS}ms ${STAY}`,
                  }}
                >
                  {label.name}
                </text>
              ))}
            </g>

            <g aria-hidden="true" className="pointer-events-none">
              {edges.map((edge, edgeIndex) => {
                // Each line runs from the star it is drawn from in the spawn-in.
                const from = spawnPlan.edgeFrom[edgeIndex] ?? edge.source;
                const to = from === edge.source ? edge.target : edge.source;
                const a = screen[from];
                const b = screen[to];
                const litBySelect = selected !== null && (edge.source === selected || edge.target === selected);
                const litByHover = hovered !== null && (edge.source === hovered || edge.target === hovered);
                const lit = litBySelect || litByHover;
                // With motion on, a hover link draws over the line instead (hoverOverlay).
                const bright = litBySelect || (litByHover && !hoverAnimated);
                const sameCluster = nodes[edge.source].cluster === nodes[edge.target].cluster;
                let opacity = 1;
                if (
                  clusterFocus &&
                  (nodes[edge.source].cluster !== clusterFocus || nodes[edge.target].cluster !== clusterFocus)
                ) {
                  opacity = 0.2;
                }
                if (hasFocus && !lit) opacity = Math.min(opacity, 0.3);
                const skillLink =
                  skillActive && skillMatches.has(edge.source) && skillMatches.has(edge.target);
                if (skillActive && !skillLink) opacity = Math.min(opacity, SKILL_DIM);
                return (
                  <line
                    key={`${edge.source}-${edge.target}`}
                    data-edge={edgeIndex}
                    data-from={from}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={skillLink && !bright ? "stroke-star" : "stroke-fg"}
                    strokeWidth={1}
                    strokeOpacity={
                      bright
                        ? EDGE_OPACITY_HOVER
                        : skillLink
                          ? SKILL_EDGE_OPACITY
                          : sameCluster
                            ? EDGE_OPACITY_SAME
                            : EDGE_OPACITY_CROSS
                    }
                    pathLength={unlit ? 1 : undefined}
                    strokeDasharray={unlit ? 1 : undefined}
                    strokeDashoffset={unlit ? 1 : undefined}
                    style={{ opacity, transition: unlit ? "none" : `opacity ${HOVER_MS}ms ${STAY}` }}
                  />
                );
              })}
            </g>

            {/* Spawn-in heads ride the growing links; rings mark each constellation's first star. */}
            {phase === "spawning" && (
              <g aria-hidden="true" className="pointer-events-none">
                {spawnPlan.rings.map((index) => (
                  <circle
                    key={`ring-${index}`}
                    data-spawn-ring={index}
                    r={radii[index]}
                    fill="none"
                    className="stroke-fg"
                    strokeWidth={1}
                    style={{ opacity: 0 }}
                  />
                ))}
                {spawnPlan.links
                  .filter((link) => link.head)
                  .map((link) => (
                    <circle
                      key={`head-${link.edge}`}
                      data-spawn-head={link.edge}
                      r={1.8}
                      className="fill-fg"
                      style={{ opacity: 0 }}
                    />
                  ))}
              </g>
            )}

            <g aria-hidden="true" className="pointer-events-none">
              {hoverOverlay(hoverOut, "data-hover-out", 0)}
              {hoverOverlay(hoverIn, "data-hover-in", 1)}
              {phase === "done" && !stillMode && (
                <circle data-idle-pulse="" r={1.6} className="fill-fg" style={{ opacity: 0 }} />
              )}
            </g>

            {/* The selected star's links, in the accent. They draw outward on select, with a
                packet riding each one and a ripple from the star, and retract on deselect. */}
            <g aria-hidden="true" className="pointer-events-none">
              {fading !== null && fading.star !== selected && (
                <g data-fading="">
                  {neighbours[fading.star].map((link) => (
                    <line
                      key={`fade-${fading.id}-${link.index}`}
                      x1={screen[fading.star].x}
                      y1={screen[fading.star].y}
                      x2={screen[link.index].x}
                      y2={screen[link.index].y}
                      className="stroke-star"
                      strokeWidth={1.25}
                      strokeOpacity={0.9}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={0}
                    />
                  ))}
                </g>
              )}
              {selected !== null &&
                neighbours[selected].map((link) => {
                  const animated = signalLinks !== null;
                  return (
                    <line
                      key={`sel-${animated ? signal!.id : "still"}-${link.index}`}
                      data-gold={animated ? link.index : undefined}
                      x1={screen[selected].x}
                      y1={screen[selected].y}
                      x2={screen[link.index].x}
                      y2={screen[link.index].y}
                      className="stroke-star"
                      strokeWidth={1.25}
                      strokeOpacity={0.9}
                      pathLength={animated ? 1 : undefined}
                      strokeDasharray={animated ? 1 : undefined}
                      strokeDashoffset={animated ? 1 : undefined}
                    />
                  );
                })}
              {signalLinks !== null && (
                <>
                  {signalLinks.map((link) => (
                    <circle
                      key={`packet-${signal!.id}-${link.index}`}
                      data-packet={link.index}
                      r={2}
                      className="fill-star"
                      style={{ opacity: 0 }}
                    />
                  ))}
                  <circle
                    key={`ripple-${signal!.id}`}
                    data-ripple=""
                    fill="none"
                    className="stroke-star"
                    strokeWidth={1}
                    style={{ opacity: 0 }}
                  />
                </>
              )}
            </g>

            {nodes.map((node) => {
              const index = node.index;
              const point = screen[index];
              const radius = radii[index];
              const isSelected = selected === index;
              const isHovered = hovered === index;
              const inFocus = focusSet.has(index);
              let opacity = unlit ? 0 : 1;
              let dimmed = false;
              if (clusterFocus && node.cluster !== clusterFocus) {
                opacity = Math.min(opacity, 0.2);
                dimmed = true;
              }
              const skillMatch = skillActive && skillMatches.has(index);
              if (hasFocus && !inFocus && !skillMatch) {
                opacity = Math.min(opacity, 0.3);
                dimmed = true;
              }
              if (skillActive && !skillMatch && !isSelected && !isHovered) {
                opacity = Math.min(opacity, SKILL_DIM);
                dimmed = true;
              }
              const spot = placement.get(index);
              const labelShown = spot !== undefined && wantedLabels.includes(index);
              const labelSpot = spot ?? { x: radius + LABEL_OFFSET, y: 4, anchor: "start" as const };
              const spike = Math.max(radius * 3, 14);
              const scale = unlit ? 0 : isHovered && !stillMode ? HOVER_SCALE : 1;
              const twinkles = twinkleOn && !dimmed && !isHovered && !isSelected;
              const spikeGrows = isSelected && signalLinks !== null;
              return (
                <g
                  key={node.id}
                  data-star={index}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.id}, ${node.linkCount} linked projects`}
                  aria-pressed={isSelected}
                  transform={`translate(${point.x} ${point.y})`}
                  className="cursor-pointer outline-none"
                  style={{
                    opacity,
                    transition: unlit ? "none" : `opacity ${HOVER_MS}ms ${STAY}`,
                    touchAction: "none",
                  }}
                  onPointerDown={(event) => handleStarPointerDown(index, event)}
                  onPointerEnter={() => onHover(index)}
                  onPointerLeave={() => onHover(null)}
                  onFocus={(event) => {
                    onHover(index);
                    if (event.currentTarget.matches(":focus-visible")) setFocusRing(index);
                  }}
                  onBlur={() => {
                    onHover(null);
                    setFocusRing(null);
                  }}
                  onKeyDown={(event) => handleStarKeyDown(index, event)}
                >
                  <circle r={Math.max(radius + 8, 14)} fill="transparent" />
                  <g
                    data-star-scale={index}
                    style={{
                      transform: `scale(${scale})`,
                      transition: unlit ? "none" : `transform ${HOVER_MS}ms ${STAY}`,
                    }}
                  >
                    {/* Beats on select and from idle pulses are written here by rAF. */}
                    <g data-star-beat={index}>
                      {isSelected && (
                        <g
                          key={spikeGrows ? `spike-${signal!.id}` : "spike"}
                          aria-hidden="true"
                          style={
                            spikeGrows
                              ? { animation: `cm-spike ${SPIKE_MS}ms ${ENTER} ${signal!.delay}ms both` }
                              : undefined
                          }
                        >
                          <line x1={-spike} y1={0} x2={spike} y2={0} className="stroke-star" strokeWidth={1} strokeOpacity={0.9} />
                          <line x1={0} y1={-spike} x2={0} y2={spike} className="stroke-star" strokeWidth={1} strokeOpacity={0.9} />
                        </g>
                      )}
                      <circle
                        r={radius}
                        className={isSelected ? "fill-star" : "fill-fg"}
                        style={
                          twinkles
                            ? {
                                animation: `cm-twinkle ${twinkle[index].period.toFixed(2)}s ease-in-out ${twinkle[
                                  index
                                ].delay.toFixed(2)}s infinite`,
                              }
                            : undefined
                        }
                      />
                    </g>
                  </g>
                  {skillMatch && (
                    <g
                      key={`ring-${skill}`}
                      aria-hidden="true"
                      className="pointer-events-none"
                      style={
                        stillMode
                          ? undefined
                          : {
                              animation: `cm-ring ${RING_MS}ms ${ENTER} ${
                                (ringOrder.get(index) ?? 0) * RING_GAP_MS
                              }ms both`,
                            }
                      }
                    >
                      <circle r={radius + RING_GROW} fill="none" className="stroke-star" strokeWidth={1} />
                    </g>
                  )}
                  {focusRing === index && (
                    <circle r={radius + 5} fill="none" className="stroke-star" strokeWidth={2} />
                  )}
                  <text
                    x={labelSpot.x}
                    y={labelSpot.y}
                    textAnchor={labelSpot.anchor}
                    aria-hidden="true"
                    className={
                      isSelected || isHovered
                        ? "pointer-events-none fill-fg text-[12px]"
                        : "pointer-events-none fill-fg-muted text-[12px]"
                    }
                    style={{ opacity: labelShown ? 1 : 0, transition: `opacity ${HOVER_MS}ms ${STAY}` }}
                  >
                    {node.id}
                  </text>
                </g>
              );
            })}

            {/* The spark rides in fitted space under the view transform, so a pan or slew carries it. */}
            {spark !== null && (
              <g
                aria-hidden="true"
                className="pointer-events-none"
                transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}
              >
                <circle
                  key={spark.id}
                  r={2.5 / view.zoom}
                  className="fill-star"
                  style={
                    {
                      "--spark-from-x": `${spark.from.x}px`,
                      "--spark-from-y": `${spark.from.y}px`,
                      "--spark-to-x": `${spark.to.x}px`,
                      "--spark-to-y": `${spark.to.y}px`,
                      animation: `cm-spark ${SPARK_MS}ms ${STAY} both`,
                    } as CSSProperties
                  }
                />
              </g>
            )}
          </>
        )}
      </svg>
      </div>

      {/* Below 640px the buttons sit in a row under the map; above, in its bottom-left corner. */}
      <div className="mt-3 flex justify-end gap-2 sm:absolute sm:bottom-3 sm:left-3 sm:mt-0 sm:justify-start">
        <MapButton label="Zoom in" onClick={() => zoomFromCentre(ZOOM_STEP)}>
          <ZoomIn size={16} strokeWidth={1.5} aria-hidden="true" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomFromCentre(1 / ZOOM_STEP)}>
          <ZoomOut size={16} strokeWidth={1.5} aria-hidden="true" />
        </MapButton>
        <MapButton label="Reset view and positions" onClick={resetView}>
          <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
        </MapButton>
      </div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-[6px] border border-line bg-surface text-fg-muted transition-[color,transform] duration-150 ease-out hover:text-fg active:scale-[0.97]"
    >
      {children}
    </button>
  );
}
