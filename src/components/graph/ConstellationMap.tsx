import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  announceGraphDragPerformance,
  useAdaptivePerformanceProfile,
  usePerformanceDiagnosticFlags,
} from "../../lib/performance";
import { CLUSTERS, type ClusterKey, type ProjectGraphData } from "../../lib/projectGraphData";
import {
  computeLayout,
  createSimulation,
  stepSimulation,
  type LayoutArea,
  type Simulation,
} from "../../lib/projectGraphLayout";

type Point = { x: number; y: number };
type Box = { x1: number; y1: number; x2: number; y2: number };
type View = { zoom: number; panX: number; panY: number };
type DrawPhase = "hidden" | "drawing" | "done";
type LabelSpot = { x: number; y: number; anchor: "start" | "end" | "middle" };
type ClusterLabel = { key: ClusterKey; name: string; x: number; y: number; box: Box };
type DragState =
  | { kind: "star"; index: number; pointerId: number; startX: number; startY: number; moved: boolean }
  | { kind: "pan"; pointerId: number; startX: number; startY: number; panX: number; panY: number; moved: boolean };

type ConstellationMapProps = {
  graph: ProjectGraphData;
  selected: number | null;
  hovered: number | null;
  filter: ClusterKey | null;
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
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const STAR_FADE_MS = 400;
const STAR_STAGGER_MS = 260;
const LINE_DRAW_MS = 600;
const LINE_DELAY_MS = 420;
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
  filter,
  onSelect,
  onHover,
}: ConstellationMapProps) {
  const { nodes, edges, neighbours } = graph;
  const descriptionId = useId();
  const reduceMotion = useReducedMotion() ?? false;
  const profile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const stillMode = reduceMotion || diagnostics.staticMode;
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
      if (showAllLabels || focusSet.has(index)) add(index);
      else if (!hasFocus && !isMobile && wanted.length < IDLE_LABELS) add(index);
    }
    return wanted;
  }, [byRank, focusSet, hasFocus, hovered, isMobile, selected, showAllLabels]);

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

  // Draw-in stagger runs outward from the centre of the resting layout.
  const drawDelay = useMemo(() => {
    if (baseLayout.length === 0) return [];
    const cx = baseLayout.reduce((sum, point) => sum + point.x, 0) / baseLayout.length;
    const cy = baseLayout.reduce((sum, point) => sum + point.y, 0) / baseLayout.length;
    const order = baseLayout
      .map((point, index) => ({ index, distance: Math.hypot(point.x - cx, point.y - cy) }))
      .sort((a, b) => a.distance - b.distance);
    const delays = new Array<number>(baseLayout.length).fill(0);
    order.forEach((item, rank) => {
      delays[item.index] = (rank / Math.max(order.length - 1, 1)) * STAR_STAGGER_MS;
    });
    return delays;
  }, [baseLayout]);

  // Draw-in, once, when the map first enters view.
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
    let raf = 0;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        raf = window.requestAnimationFrame(() => setPhase("drawing"));
        timer = window.setTimeout(() => setPhase("done"), LINE_DELAY_MS + STAR_STAGGER_MS + LINE_DRAW_MS + 80);
      },
      { threshold: 0.25 },
    );
    observer.observe(frame);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // Runs once on mount on purpose: the draw-in never replays.
  }, []);

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
    setView((current) => {
      const zoom = clamp(current.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const ratio = zoom / current.zoom;
      return { zoom, panX: sx - (sx - current.panX) * ratio, panY: sy - (sy - current.panY) * ratio };
    });
  }, []);

  // Wheel zooms around the pointer and never scrolls the page: a capture,
  // non-passive listener on window so it wins before the page scrolls.
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const frame = wrapperRef.current;
      const svg = svgRef.current;
      const target = event.target;
      if (!frame || !svg || !(target instanceof Node) || !frame.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = svg.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    const options: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("wheel", handleWheel, options);
    return () => window.removeEventListener("wheel", handleWheel, options);
  }, [zoomAt]);

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

  const transition = (delay: number) =>
    phase === "drawing" ? `opacity ${STAR_FADE_MS}ms ${EASE} ${delay}ms` : `opacity 150ms ${EASE}`;
  // Draw nothing until the map is measured and every position is a real number.
  const ready =
    measured &&
    screen.length === nodes.length &&
    screen.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  return (
    <div
      ref={wrapperRef}
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") onSelect(null);
      }}
    >
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
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  className="pointer-events-none fill-fg-faint text-[14px]"
                  style={{
                    opacity: phase === "hidden" ? 0 : filter && filter !== label.key ? 0.2 : 1,
                    transition: transition(0),
                  }}
                >
                  {label.name}
                </text>
              ))}
            </g>

            <g aria-hidden="true" className="pointer-events-none">
              {edges.map((edge) => {
                const a = screen[edge.source];
                const b = screen[edge.target];
                const lit = [hovered, selected].some(
                  (index) => index !== null && (edge.source === index || edge.target === index),
                );
                const sameCluster = nodes[edge.source].cluster === nodes[edge.target].cluster;
                let opacity = 1;
                if (filter && (nodes[edge.source].cluster !== filter || nodes[edge.target].cluster !== filter)) {
                  opacity = 0.2;
                }
                if (hasFocus && !lit) opacity = Math.min(opacity, 0.3);
                const drawing = phase !== "done";
                return (
                  <line
                    key={`${edge.source}-${edge.target}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={lit ? "stroke-star" : "stroke-fg"}
                    strokeWidth={lit ? 1.25 : 1}
                    strokeOpacity={lit ? 0.9 : sameCluster ? EDGE_OPACITY_SAME : EDGE_OPACITY_CROSS}
                    pathLength={drawing ? 1 : undefined}
                    strokeDasharray={drawing ? 1 : undefined}
                    strokeDashoffset={drawing ? (phase === "hidden" ? 1 : 0) : undefined}
                    style={{
                      opacity,
                      transition:
                        phase === "drawing"
                          ? `stroke-dashoffset ${LINE_DRAW_MS}ms ${EASE} ${LINE_DELAY_MS + STAR_STAGGER_MS * 0.5}ms`
                          : `opacity 150ms ${EASE}`,
                    }}
                  />
                );
              })}
            </g>

            {nodes.map((node) => {
              const index = node.index;
              const point = screen[index];
              const radius = radii[index];
              const isSelected = selected === index;
              const inFocus = focusSet.has(index);
              let opacity = phase === "hidden" ? 0 : 1;
              if (filter && node.cluster !== filter) opacity = Math.min(opacity, 0.2);
              if (hasFocus && !inFocus) opacity = Math.min(opacity, 0.3);
              const spot = placement.get(index);
              const labelShown = spot !== undefined && wantedLabels.includes(index);
              const labelSpot = spot ?? { x: radius + LABEL_OFFSET, y: 4, anchor: "start" as const };
              const spike = Math.max(radius * 3, 14);
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.id}, ${node.linkCount} linked projects`}
                  aria-pressed={isSelected}
                  transform={`translate(${point.x} ${point.y})`}
                  className="cursor-pointer outline-none"
                  style={{ opacity, transition: transition(drawDelay[index] ?? 0), touchAction: "none" }}
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
                  {isSelected && (
                    <>
                      <line
                        x1={-spike}
                        y1={0}
                        x2={spike}
                        y2={0}
                        className="stroke-star"
                        strokeWidth={1}
                        strokeOpacity={0.9}
                        aria-hidden="true"
                      />
                      <line
                        x1={0}
                        y1={-spike}
                        x2={0}
                        y2={spike}
                        className="stroke-star"
                        strokeWidth={1}
                        strokeOpacity={0.9}
                        aria-hidden="true"
                      />
                    </>
                  )}
                  <circle r={radius} className={isSelected ? "fill-star" : "fill-fg"} />
                  {focusRing === index && (
                    <circle r={radius + 5} fill="none" className="stroke-star" strokeWidth={2} />
                  )}
                  <text
                    x={labelSpot.x}
                    y={labelSpot.y}
                    textAnchor={labelSpot.anchor}
                    aria-hidden="true"
                    className={
                      isSelected || hovered === index
                        ? "pointer-events-none fill-fg text-[12px]"
                        : "pointer-events-none fill-fg-muted text-[12px]"
                    }
                    style={{ opacity: labelShown ? 1 : 0, transition: `opacity 150ms ${EASE}` }}
                  >
                    {node.id}
                  </text>
                </g>
              );
            })}
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
