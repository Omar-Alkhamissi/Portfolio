import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ExternalLink,
  Github,
  MousePointer2,
  Pin,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { projects, type Project } from "../data/projects";
import {
  announceGraphDragPerformance,
  useAdaptivePerformanceProfile,
  usePerformanceDiagnosticFlags,
  usePerformanceDebugState,
  type AdaptivePerformanceProfile,
} from "../lib/performance";

type ClusterKey = "web" | "enterprise" | "patterns" | "systems" | "data" | "java";
type LabelPlacement = "left" | "right" | "top" | "bottom";
type PreviewMode = "hovered" | "pinned" | "idle";
type ProjectFocus = "web" | "mobile" | "backend" | "data" | "systems" | "patterns" | "java";

type Node = {
  id: string;
  project: Project;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
  cluster: ClusterKey;
  homeX: number;
  homeY: number;
  labelWidth: number;
  labelHeight: number;
};

type Edge = {
  source: string;
  target: string;
  weight: number;
  shared: string[];
  color: string;
};

type TubeSegment = {
  edge: Edge;
  startId: string;
  endId: string;
};

type ClusterFlow = {
  id: string;
  cluster: ClusterKey;
  delay: number;
  routes: TubeSegment[][];
};

type FlowEdgeCandidate = {
  edge: Edge;
  source: Node;
  target: Node;
  score: number;
  key: string;
};

type ArrivalPing = {
  token: number;
  color: string;
};

type NodeArrival = {
  nodeId: string;
  color: string;
};

type WaveNodeReservation = {
  flowId: string;
  segmentKey: string;
  updatedAt: number;
};

type WaveDynamicSegmentState = {
  slotKey: string;
  cycleNumber: number;
  activeIndex: number;
  segment: TubeSegment;
};

type LivePosition = { x: number; y: number };

type EdgeEndpoints = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type EdgeLineRefs = {
  glow: SVGLineElement | null;
  soft: SVGLineElement | null;
  core: SVGLineElement | null;
};

type GraphPerfMetric = {
  frameMs: number;
  relationCalcMs: number;
};

type GraphFloatSeed = {
  phaseX: number;
  phaseY: number;
  phaseOrbit: number;
  speedX: number;
  speedY: number;
  ampX: number;
  ampY: number;
};

type GraphViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

type DragTugEdge = {
  source: string;
  target: string;
  weight: number;
};

type DragInfluenceGraph = {
  influenceById: Map<string, number>;
  depthById: Map<string, number>;
  tugEdges: DragTugEdge[];
};

type GraphDragState = {
  nodeId: string;
  pointerId: number;
  // Pointer coordinates at drag start, in graph coordinate units.
  startSvgX: number;
  startSvgY: number;
  moved: boolean;
  currentDx: number;
  currentDy: number;
  velocityById: Map<string, LivePosition>;
  lastTugAt: number | null;
  pending: Map<string, LivePosition> | null;
  inverseCtm: DOMMatrix | null;
  influenceById: Map<string, number>;
  depthById: Map<string, number>;
  tugEdges: DragTugEdge[];
  startPositions: Map<string, LivePosition>;
  startFloatOffsets: Map<string, LivePosition>;
};

type GraphPanState = {
  pointerId: number;
  startSvgX: number;
  startSvgY: number;
  startPanX: number;
  startPanY: number;
  moved: boolean;
  inverseCtm: DOMMatrix | null;
};

type GraphPerfMetrics = {
  waveFrameMs: number;
  relationCalcMs: number;
  waveSamples: number;
  pointer:
    | {
        nodeId: string;
        clientX: number;
        clientY: number;
        svgX: number;
        svgY: number;
      }
    | null;
};

type GraphDebugSnapshot = {
  fps: number;
  frameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  jankPercent: number;
  waveFrameMs: number;
  relationCalcMs: number;
  visualViewportScale: number;
  graphRect:
    | {
        width: number;
        height: number;
      }
    | null;
  pointer: GraphPerfMetrics["pointer"];
};

const VIEWBOX_W = 1320;
const VIEWBOX_H = 860;
const CENTER_X = VIEWBOX_W / 2;
const CENTER_Y = VIEWBOX_H / 2;
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const NODE_RADIUS = 27;
const LINE_GAP = NODE_RADIUS + 3;
const LABEL_GAP = 12;
const EDGE_NODE_CLEARANCE = NODE_RADIUS + 24;
const EDGE_FOOTPRINT_CLEARANCE = 8;

// ─── Animation tuning ────────────────────────────────────────────────────────
// Wave (pressure / "water in a vein") — fallback duration of one segment
// traversal. Normal motion uses length-based timing below.
const WAVE_SEGMENT_DURATION = 1.55;
const WAVE_SEGMENT_DURATION_REDUCED = 3.6;
const WAVE_UNITS_PER_SECOND = 142;
const WAVE_MIN_SEGMENT_DURATION = 0.92;
const WAVE_MAX_SEGMENT_DURATION = 2.55;
// Asymmetric liquid profile in viewBox units. Pixel-based lengths keep short
// relations from collapsing into blocky square pulses.
const WAVE_CORE_LENGTH = 2.8;
const WAVE_FRONT_LENGTH = 22;
const WAVE_TAIL_LENGTH = 42;
const WAVE_WAKE_LENGTH = 64;
const WAVE_WAKE_OPACITY = 0.055;
const WAVE_COLOR_BLEND_DISTANCE = 0.2;
const WAVE_COLOR_BLEND_STRENGTH = 0.74;
// Fade the pulse as it enters/leaves a badge so the head never flashes on the
// next relation before the badge ping finishes.
const WAVE_NODE_ABSORB_DISTANCE = 0.12;
const WAVE_RESERVATION_STALE_MS = 1800;
// Blend factor between pure linear motion (0) and a full pendulum / smoothstep
// (1). At 0 the wave reverses direction instantaneously at terminals. At 1
// it slows to a stop and accelerates back, but the middle of each traversal
// goes 1.5× faster to preserve total time. 0.18 keeps the average velocity
// essentially identical to linear — the wave doesn't feel slower — but the
// velocity reversal at terminals is graceful instead of a hard flip.
const WAVE_BOUNCE_EASE = 0.18;
// Peak opacity of the brightest stop in the gradient (0–1).
const WAVE_PEAK_OPACITY = 0.84;
// Stroke width range for the active wave line.
const WAVE_STROKE_BASE = 4.2;
const WAVE_STROKE_PEAK = 9.8;
const WAVE_STROKE_TAPER_MIN = 0.1;
const WAVE_SHORT_SEGMENT_STROKE_SCALE = 0.68;
const WAVE_CHANNEL_STROKE_BASE = 0.65;
const WAVE_CHANNEL_STROKE_PEAK = 3.4;
// Ambient channel glow under the wave path. Kept low so inactive lines are
// not drowned out — set to 0 to fully match inactive edge brightness.
const WAVE_CHANNEL_OPACITY = 0.018;
// Badge ping — a short internal confirmation when the pressure wave reaches
// the project badge. Clipped to the badge face, so it reads as a ping without
// an outer ripple ring.
const BADGE_PING_DURATION = 1.08;
const BADGE_PING_DURATION_REDUCED = 0.72;
const BADGE_PING_FACE_OPACITY = 0.54;
const BADGE_PING_TIMES = [0, 0.08, 0.18, 0.32, 0.46, 0.58, 0.72, 0.86, 1];
const BADGE_POP_TIMES = [0, 0.16, 0.38, 0.68, 1];
const BADGE_POP_RADIUS = 1.05;
const BADGE_POP_STROKE = 0.44;
// Used for small hover/focus glow and the internal badge ping.
const BLOOM_EASE_EXPO_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const BLOOM_EASE_SLOW_IN_OUT: [number, number, number, number] = [0.45, 0, 0.2, 1];
// Drag — how many viewport units the pointer must travel before a drag is
// detected. Below this threshold we treat pointer-up as a click (pin toggle).
const DRAG_THRESHOLD = 4;
// Ambient graph drift. This is intentionally a visual layer, not a topology
// relayout: links, waves, and drag all read the same live coordinates.
const GRAPH_FLOAT_CLUSTER_X = 4.4;
const GRAPH_FLOAT_CLUSTER_Y = 3.8;
const GRAPH_FLOAT_NODE_X = 8.8;
const GRAPH_FLOAT_NODE_Y = 7.2;
const GRAPH_FLOAT_ORBIT = 2.4;
const GRAPH_FLOAT_MIN_SPEED = 0.32;
const GRAPH_FLOAT_MAX_SPEED = 0.62;
const GRAPH_ZOOM_MIN = 0.45;
const GRAPH_ZOOM_MAX = 1.85;
const GRAPH_ZOOM_STEP = 0.18;
const GRAPH_PAN_OVERSCROLL = 1.25;
const GRAPH_NODE_DRAG_OVERSCROLL = Math.max(VIEWBOX_W, VIEWBOX_H) * 4;
const GRAPH_FILTER_MARGIN = GRAPH_NODE_DRAG_OVERSCROLL + 180;
const DRAG_TUG_MAX_DEPTH = 3;
const DRAG_TUG_DIRECT_PULL = 0.68;
const DRAG_TUG_DECAY = 0.46;
const DRAG_TUG_MIN_PULL = 0.075;
const DRAG_TUG_FLOAT_SCALE = 0.58;
const DRAG_TUG_ANCHOR_SPRING = 8.5;
const DRAG_TUG_EDGE_SPRING = 74;
const DRAG_TUG_EDGE_DAMPING = 1.4;
const DRAG_TUG_DAMPING_BASE = 5.9;
const DRAG_TUG_DAMPING_DEPTH = 0.95;
const DRAG_TUG_MASS_BASE = 0.86;
const DRAG_TUG_MASS_DEPTH = 0.34;
const DRAG_TUG_MASS_JITTER = 0.42;
const DRAG_TUG_MAX_DT = 0.045;
const DRAG_TUG_MAX_VELOCITY = 1200;

const TECH_WEIGHT: Record<string, number> = {
  react: 1.2,
  "react native": 1.05,
  node: 1.1,
  express: 1.05,
  mongodb: 1.2,
  mui: 0.7,
  socketio: 1.2,
  jwt: 0.35,
  stripe: 0.5,
  firebase: 0.95,
  firestore: 0.95,
  expo: 0.7,
  "asp.net core": 1.15,
  ".net": 0.45,
  ".net 8": 0.55,
  ".net 9": 0.55,
  "ef core": 1.05,
  "sql server": 0.95,
  sql: 1.02,
  "relational data": 1.1,
  "database systems": 0.9,
  "data modeling": 0.78,
  "backend api": 0.72,
  "frontend app": 0.68,
  "mobile app": 0.9,
  "csharp ecosystem": 0.78,
  "javascript ecosystem": 0.76,
  "java ecosystem": 0.78,
  "oop architecture": 0.72,
  "systems programming": 0.82,
  "compiler pipeline": 0.9,
  "real-time systems": 0.85,
  "c#": 0.7,
  grpc: 1.3,
  protobuf: 0.95,
  swagger: 0.45,
  quasar: 0.55,
  "github actions": 0.5,
  jest: 0.55,
  xunit: 0.55,
  sqlite: 0.75,
  postgresql: 0.85,
  plpgsql: 0.82,
  java: 0.9,
  swing: 0.45,
  unity: 0.65,
  xpath: 0.48,
  xml: 0.35,
  "json schema": 0.55,
  "c++": 1.05,
  stl: 0.55,
  templates: 0.35,
  raii: 0.35,
  shared_ptr: 0.35,
  oop: 0.18,
  observer: 0.15,
  mvc: 0.15,
  "recursive parsing": 0.4,
  "stored procedures": 0.85,
  "t-sql": 0.85,
  csvhelper: 0.65,
  "full-stack": 1.35,
  "frontend spa": 1.05,
  "backend apis": 1.25,
  "external apis": 1.2,
  database: 1.0,
  "sql / relational db": 1.12,
  "mongodb / nosql": 1.2,
  authentication: 1.15,
  payments: 1.25,
  testing: 1.1,
  "real-time": 1.28,
  mobile: 1.3,
  "cloud / deployment": 1.0,
  "local storage": 0.92,
  "data processing": 1.08,
  algorithms: 1.12,
  "custom data structures": 1.18,
  "design patterns": 1.15,
  "desktop gui": 1.0,
  "grpc / microservices": 1.32,
  "file uploads": 0.95,
  "reporting / pdf": 1.02,
  "admin dashboard": 1.0,
  "sql procedures": 1.15,
  "parsing / compilers": 1.25,
  "document generation": 1.05,
  "game development": 0.92,
};

type EdgeColorFamily = {
  label: string;
  color: string;
  tags: string[];
};

const EDGE_TAG_COLORS: Record<string, string> = {
  react: "#61dafb",
  "react native": "#00d8ff",
  node: "#68a063",
  express: "#94a3b8",
  mongodb: "#13aa52",
  mui: "#007fff",
  "vue 3": "#41b883",
  quasar: "#1976d2",
  firebase: "#facc15",
  firestore: "#f59e0b",
  expo: "#eab308",
  socketio: "#a3e635",
  grpc: "#38bdf8",
  protobuf: "#0ea5e9",
  swagger: "#84cc16",
  jwt: "#fb7185",
  stripe: "#635bff",
  "asp.net core": "#512bd4",
  ".net": "#8b5cf6",
  ".net 8": "#7c3aed",
  ".net 9": "#a855f7",
  "ef core": "#14b8a6",
  "c#": "#178600",
  xunit: "#22c55e",
  "github actions": "#2088ff",
  sql: "#ef4444",
  "sql server": "#dc2626",
  "t-sql": "#f97316",
  "stored procedures": "#f59e0b",
  postgresql: "#336791",
  plpgsql: "#3f7fbf",
  sqlite: "#0f80cc",
  "c++": "#f34b7d",
  stl: "#fb7185",
  templates: "#ec4899",
  raii: "#db2777",
  shared_ptr: "#be185d",
  "recursive parsing": "#38bdf8",
  "data structures": "#fb923c",
  java: "#b07219",
  swing: "#d97706",
  oop: "#c084fc",
  observer: "#d8b4fe",
  mvc: "#f0abfc",
  "design patterns": "#a78bfa",
  csvhelper: "#14b8a6",
  xpath: "#f97316",
  xml: "#fb923c",
  "json schema": "#facc15",
  unity: "#e5e7eb",
  "frontend app": "#38bdf8",
  "backend api": "#60a5fa",
  "mobile app": "#facc15",
  "javascript ecosystem": "#f1e05a",
  "csharp ecosystem": "#22c55e",
  "java ecosystem": "#b07219",
  "relational data": "#ef4444",
  "database systems": "#dc2626",
  "data modeling": "#f97316",
  "oop architecture": "#c084fc",
  "systems programming": "#f34b7d",
  "compiler pipeline": "#f43f5e",
  "real-time systems": "#a3e635",
  "full-stack": "#61dafb",
  "frontend spa": "#38bdf8",
  "backend apis": "#60a5fa",
  "external apis": "#a3e635",
  database: "#ef4444",
  "sql / relational db": "#ef4444",
  "mongodb / nosql": "#13aa52",
  authentication: "#fb7185",
  payments: "#635bff",
  testing: "#22c55e",
  "real-time": "#a3e635",
  mobile: "#facc15",
  "cloud / deployment": "#38bdf8",
  "local storage": "#f59e0b",
  "data processing": "#14b8a6",
  algorithms: "#f34b7d",
  "custom data structures": "#fb923c",
  "desktop gui": "#d97706",
  "grpc / microservices": "#38bdf8",
  "file uploads": "#f472b6",
  "reporting / pdf": "#fbbf24",
  "admin dashboard": "#c084fc",
  "sql procedures": "#f97316",
  "parsing / compilers": "#f43f5e",
  "document generation": "#a78bfa",
  "game development": "#e5e7eb",
};

const EDGE_COLOR_FAMILIES: EdgeColorFamily[] = [
  {
    label: "Full-Stack",
    color: "#61dafb",
    tags: ["full-stack", "frontend spa", "react", "vue 3", "quasar", "mui"],
  },
  {
    label: "Backend APIs",
    color: "#60a5fa",
    tags: [
      "backend apis",
      "grpc / microservices",
      "grpc",
      "protobuf",
      "socketio",
      "swagger",
      "node",
      "express",
      "asp.net core",
    ],
  },
  {
    label: "External APIs",
    color: "#a3e635",
    tags: ["external apis", "real-time", "real-time systems"],
  },
  {
    label: "Database",
    color: "#ef4444",
    tags: [
      "database",
      "sql",
      "sql server",
      "t-sql",
      "stored procedures",
      "sql procedures",
      "postgresql",
      "plpgsql",
      "sqlite",
      "mongodb / nosql",
      "mongodb",
      "relational data",
      "database systems",
      "data modeling",
      "etl",
    ],
  },
  {
    label: "Security / Pay",
    color: "#fb7185",
    tags: ["authentication", "payments", "jwt", "stripe"],
  },
  {
    label: "Mobile",
    color: "#facc15",
    tags: [
      "mobile",
      "react native",
      "expo",
      "firebase",
      "firestore",
      "cloud / deployment",
      "local storage",
      "mobile app",
    ],
  },
  {
    label: "Algorithms",
    color: "#f34b7d",
    tags: [
      "algorithms",
      "custom data structures",
      "parsing / compilers",
      "data processing",
      "c++",
      "stl",
      "templates",
      "raii",
      "shared_ptr",
      "systems programming",
      "compiler pipeline",
      "recursive parsing",
      "data structures",
    ],
  },
  {
    label: "Architecture",
    color: "#c084fc",
    tags: [
      "design patterns",
      "desktop gui",
      "document generation",
      "reporting / pdf",
      "admin dashboard",
      "file uploads",
      "game development",
      "oop",
      "oop architecture",
      "observer",
      "mvc",
    ],
  },
  {
    label: "Testing",
    color: "#22c55e",
    tags: ["testing", "jest", "xunit", "github actions"],
  },
];

const INFERRED_COLOR_TAGS = new Set([
  "frontend app",
  "backend api",
  "mobile app",
  "javascript ecosystem",
  "csharp ecosystem",
  "java ecosystem",
  "relational data",
  "database systems",
  "data modeling",
  "oop architecture",
  "systems programming",
  "compiler pipeline",
  "real-time systems",
]);

const GENERIC_COLOR_TAGS = new Set([
  ".net",
  ".net 8",
  ".net 9",
  "sql",
  "oop",
  "frontend app",
  "backend api",
  "javascript ecosystem",
  "csharp ecosystem",
  "java ecosystem",
  "relational data",
  "database systems",
  "data modeling",
  "oop architecture",
  "systems programming",
  "compiler pipeline",
  "real-time systems",
]);

const DEFAULT_EDGE_COLORS = [
  "#7dd3fc",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
];

const EDGE_LEGEND = [
  EDGE_COLOR_FAMILIES[0],
  EDGE_COLOR_FAMILIES[2],
  EDGE_COLOR_FAMILIES[1],
  EDGE_COLOR_FAMILIES[3],
  EDGE_COLOR_FAMILIES[4],
  EDGE_COLOR_FAMILIES[5],
  EDGE_COLOR_FAMILIES[6],
  EDGE_COLOR_FAMILIES[7],
  EDGE_COLOR_FAMILIES[8],
];

const CLUSTER_CENTERS: Record<ClusterKey, { x: number; y: number }> = {
  web: { x: 255, y: 240 },
  enterprise: { x: 655, y: 235 },
  java: { x: 1070, y: 225 },
  systems: { x: 300, y: 650 },
  patterns: { x: 685, y: 645 },
  data: { x: 1060, y: 585 },
};

const CLUSTER_ORDER: ClusterKey[] = [
  "web",
  "enterprise",
  "data",
  "systems",
  "patterns",
  "java",
];

const CLUSTER_ANGLE_OFFSETS: Record<ClusterKey, number> = {
  web: -1.15,
  enterprise: -0.2,
  java: -1.1,
  systems: 2.3,
  patterns: 1.1,
  data: 0.4,
};

const PROJECT_POSITION_OVERRIDES: Record<string, LivePosition> = {
  "Groceries Mobile App": { x: 210, y: 97 },
  "Real-Time Room Chat App": { x: 99, y: 213 },
  "Bookshelf Mobile App": { x: 159, y: 399 },
  "Travel Advisory Tracker": { x: 334, y: 202 },
  "Debug My Heart": { x: 289, y: 361 },
  "Fragrance E-Commerce": { x: 410, y: 86 },
  "Wordle gRPC Microservices": { x: 512, y: 391 },
  "Fast Food Ordering": { x: 743, y: 171 },
  "Employee Helpdesk Portal": { x: 989, y: 347 },
  "Enigma Machine Simulator": { x: 888, y: 134 },
  "Customer Incentive Management System": { x: 1125, y: 148 },
  "Student Loan Repayment Calculator": { x: 1150, y: 365 },
  "2D Parallax Arcade Game": { x: 1242, y: 461 },
  "Drone Management System": { x: 1131, y: 463 },
  "Employee Management System": { x: 1209, y: 579 },
  "Family Genealogy Database": { x: 1070, y: 745 },
  "Data Warehouse ETL Pipeline": { x: 897, y: 655 },
  "Order Management System": { x: 888, y: 468 },
  "Document Factory": { x: 817, y: 619 },
  "Global Economics Reporter": { x: 849, y: 752 },
  "Coffee Shop POS": { x: 710, y: 795 },
  "Collaborative Drawing App": { x: 588, y: 680 },
  "Stack Evaluator": { x: 582, y: 797 },
  "Canadian Cities Analyzer": { x: 625, y: 526 },
  "Course Grade Tracker": { x: 488, y: 691 },
  "Patient Diagnosis Classifier": { x: 345, y: 689 },
  "Expression Evaluator": { x: 197, y: 730 },
  "Triage Priority Queue": { x: 132, y: 627 },
  "Khronos Calendar Library": { x: 220, y: 498 },
  "Newcomb-Benford Data Analyzer": { x: 408, y: 580 },
  "Stoichiometry Library": { x: 409, y: 435 },
};

const weightOf = (tech: string) => TECH_WEIGHT[tech] ?? 0.4;

function hashString(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function edgePairKey(a: string, b: string) {
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

const TAG_TO_FAMILY_COLOR: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const family of EDGE_COLOR_FAMILIES) {
    for (const tag of family.tags) {
      if (!map[tag]) map[tag] = family.color;
    }
  }
  return map;
})();

function edgeColorForShared(shared: string[], frequency: Map<string, number>) {
  const rankedTags = shared
    .map((tech, index) => {
      const rarity = 1 / Math.sqrt(frequency.get(tech) ?? 1);
      const specificity = GENERIC_COLOR_TAGS.has(tech) ? 0 : 1.4;
      const score = specificity + weightOf(tech) * 1.55 + rarity;

      return { tag: tech, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const ranked of rankedTags) {
    const familyColor = TAG_TO_FAMILY_COLOR[ranked.tag];
    if (familyColor) return familyColor;
  }

  for (const ranked of rankedTags) {
    const tagColor = EDGE_TAG_COLORS[ranked.tag];
    if (tagColor) return tagColor;
  }

  const fallbackIndex = hashString(shared.join("|")) % DEFAULT_EDGE_COLORS.length;
  return DEFAULT_EDGE_COLORS[fallbackIndex];
}

function fallbackEdgeColor(source: string, target: string) {
  const fallbackIndex = hashString(`${source}--${target}`) % DEFAULT_EDGE_COLORS.length;
  return DEFAULT_EDGE_COLORS[fallbackIndex];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createGraphFloatSeed(key: string): GraphFloatSeed {
  const random = seededRandom(hashString(`project-graph-float:${key}`));

  return {
    phaseX: random() * TAU,
    phaseY: random() * TAU,
    phaseOrbit: random() * TAU,
    speedX:
      GRAPH_FLOAT_MIN_SPEED +
      random() * (GRAPH_FLOAT_MAX_SPEED - GRAPH_FLOAT_MIN_SPEED),
    speedY:
      GRAPH_FLOAT_MIN_SPEED +
      random() * (GRAPH_FLOAT_MAX_SPEED - GRAPH_FLOAT_MIN_SPEED),
    ampX: 0.74 + random() * 0.52,
    ampY: 0.74 + random() * 0.52,
  };
}

function graphFloatScaleFor(quality: AdaptivePerformanceProfile["quality"]) {
  if (quality === "lite") {
    return 0.58;
  }

  if (quality === "balanced") {
    return 0.78;
  }

  return 1;
}

function clampGraphViewport(viewport: GraphViewport): GraphViewport {
  const zoom = clamp(viewport.zoom, GRAPH_ZOOM_MIN, GRAPH_ZOOM_MAX);
  const scaledWidth = VIEWBOX_W * zoom;
  const scaledHeight = VIEWBOX_H * zoom;
  const overscrollX = VIEWBOX_W * GRAPH_PAN_OVERSCROLL;
  const overscrollY = VIEWBOX_H * GRAPH_PAN_OVERSCROLL;

  return {
    zoom,
    panX: clamp(viewport.panX, -scaledWidth - overscrollX, VIEWBOX_W + overscrollX),
    panY: clamp(viewport.panY, -scaledHeight - overscrollY, VIEWBOX_H + overscrollY),
  };
}

function zoomGraphViewportAt(
  viewport: GraphViewport,
  nextZoom: number,
  focus: LivePosition = { x: CENTER_X, y: CENTER_Y },
) {
  const zoom = clamp(nextZoom, GRAPH_ZOOM_MIN, GRAPH_ZOOM_MAX);
  const graphX = (focus.x - viewport.panX) / viewport.zoom;
  const graphY = (focus.y - viewport.panY) / viewport.zoom;

  return clampGraphViewport({
    zoom,
    panX: focus.x - graphX * zoom,
    panY: focus.y - graphY * zoom,
  });
}

function graphViewportTransform(viewport: GraphViewport) {
  return `translate(${viewport.panX.toFixed(2)} ${viewport.panY.toFixed(2)}) scale(${viewport.zoom.toFixed(3)})`;
}

function dragTugJitterFor(nodeId: string) {
  return (hashString(`project-graph-drag-tug:${nodeId}`) % 1000) / 1000;
}

type RgbColor = { r: number; g: number; b: number };

function parseColor(color: string): RgbColor | null {
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hex) {
    const raw = hex[1];
    const expanded = raw.length === 3
      ? raw.split("").map((char) => char + char).join("")
      : raw;

    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i,
  );

  if (!rgb) {
    return null;
  }

  return {
    r: clamp(Number(rgb[1]), 0, 255),
    g: clamp(Number(rgb[2]), 0, 255),
    b: clamp(Number(rgb[3]), 0, 255),
  };
}

function formatRgb(color: RgbColor) {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

function mixColors(from: string, to: string, amount: number) {
  const fromColor = parseColor(from);
  const toColor = parseColor(to);

  if (!fromColor || !toColor) {
    return amount < 0.5 ? from : to;
  }

  const t = clamp01(amount);
  return formatRgb({
    r: fromColor.r + (toColor.r - fromColor.r) * t,
    g: fromColor.g + (toColor.g - fromColor.g) * t,
    b: fromColor.b + (toColor.b - fromColor.b) * t,
  });
}

function seededRandom(seed: number) {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(
  items: T[],
  scoreOf: (item: T) => number,
  random = Math.random,
) {
  if (items.length === 0) {
    return undefined;
  }

  const weighted = items.map((item) => ({
    item,
    weight: Math.max(0.1, scoreOf(item)),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;

  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.item;
    }
  }

  return weighted[weighted.length - 1].item;
}

function estimateLabelWidth(title: string) {
  return clamp(82 + title.length * 2.7, 108, 182);
}

function estimateLabelHeight(title: string, width: number) {
  const approxLines = clamp(Math.ceil((title.length * 7) / width), 1, 2);
  return approxLines === 1 ? 22 : 32;
}

const CONNECTABLE_TECH_TAGS = new Set([
  "react",
  "react native",
  "node",
  "express",
  "mongodb",
  "mui",
  "vue 3",
  "quasar",
  "firebase",
  "firestore",
  "expo",
  "asp.net core",
  "ef core",
  "sql server",
  "grpc",
  "protobuf",
  "swagger",
  "socketio",
  "jwt",
  "stripe",
  "jest",
  "xunit",
  "sqlite",
  "postgresql",
  "plpgsql",
  "swing",
  "unity",
  "xpath",
  "xml",
  "json schema",
  "stored procedures",
  "t-sql",
  "csvhelper",
  "recursive parsing",
  "design patterns",
  "observer",
  "mvc",
  "templates",
  "raii",
  "shared_ptr",
]);

function relationTag(value: string) {
  return value.toLowerCase().trim();
}

function isConnectableTechTag(tag: string) {
  return CONNECTABLE_TECH_TAGS.has(tag);
}

function expandTechTags(tech: string): string[] {
  const lower = tech.toLowerCase().trim();

  if (lower.startsWith("react native")) return ["react native", "react"];
  if (lower.startsWith("react ")) return ["react"];
  if (lower === "node.js") return ["node"];
  if (lower === "express") return ["express"];
  if (lower === "mongodb") return ["mongodb"];
  if (lower === "firebase") return ["firebase"];
  if (lower === "firestore") return ["firestore"];
  if (lower === "expo") return ["expo"];
  if (lower === "asp.net core 8") return ["asp.net core", ".net", ".net 8"];
  if (lower === "asp.net core") return ["asp.net core", ".net"];
  if (lower === "c# .net 8") return ["c#", ".net", ".net 8"];
  if (lower === "c# .net 9") return ["c#", ".net", ".net 9"];
  if (lower.startsWith("c# .net")) return ["c#", ".net"];
  if (lower === "ef core") return ["ef core", ".net"];
  if (lower === "sql") return ["sql", "relational data"];
  if (lower === "sql server") {
    return ["sql server", "sql", "relational data", "database systems"];
  }
  if (lower === "grpc") return ["grpc", ".net"];
  if (lower === "protobuf") return ["protobuf"];
  if (lower === "swagger") return ["swagger"];
  if (lower === "quasar") return ["quasar"];
  if (lower.startsWith("c++")) return ["c++"];
  if (lower === "stl") return ["stl"];
  if (lower === "templates") return ["templates"];
  if (lower === "raii") return ["raii"];
  if (lower === "shared_ptr") return ["shared_ptr"];
  if (lower === "oop") return ["oop"];
  if (lower === "design patterns") return ["design patterns"];
  if (lower === "observer") return ["observer"];
  if (lower === "mvc") return ["mvc"];
  if (lower === "recursive parsing") return ["recursive parsing"];
  if (lower === "stored procedures") {
    return ["stored procedures", "sql", "relational data", "database systems"];
  }
  if (lower === "t-sql") {
    return ["t-sql", "sql server", "sql", "relational data", "database systems"];
  }
  if (lower === "csvhelper") return ["csvhelper"];
  if (lower === "mui 7" || lower === "mui") return ["mui"];
  if (lower === "socket.io") return ["socketio"];
  if (lower === "jwt") return ["jwt"];
  if (lower === "stripe") return ["stripe"];
  if (lower === "github actions") return ["github actions"];
  if (lower === "jest") return ["jest"];
  if (lower === "xunit" || lower === "xunit.net") return ["xunit", ".net"];
  if (lower === "sqlite") return ["sqlite"];
  if (lower === "postgresql") {
    return ["postgresql", "sql", "relational data", "database systems"];
  }
  if (lower === "plpgsql") {
    return ["plpgsql", "postgresql", "sql", "relational data", "database systems"];
  }
  if (lower === "java") return ["java"];
  if (lower === "swing") return ["swing", "java"];
  if (lower === "unity") return ["unity", "c#"];
  if (lower === "xpath") return ["xpath", "xml"];
  if (lower === "xml") return ["xml"];
  if (lower === "json schema") return ["json schema"];

  return [lower];
}

function inferRelationshipTags(project: Project): string[] {
  return project.relations.map(relationTag);
}

function scoreSharedTech(shared: string[], frequency: Map<string, number>) {
  return shared.reduce((sum, tech) => {
    const freq = frequency.get(tech) ?? 1;
    const rarity = 1 / Math.sqrt(freq);
    return sum + weightOf(tech) * rarity;
  }, 0);
}

const MAX_SELECTED_EDGES_PER_NODE = 5;
const DEFAULT_EDGE_LIMIT_PER_TAG = 5;
const EDGE_LIMIT_BY_TAG: Record<string, number> = {
  "full-stack": 6,
  "frontend spa": 4,
  "backend apis": 7,
  "external apis": 3,
  database: 6,
  "sql / relational db": 7,
  "mongodb / nosql": 4,
  authentication: 4,
  payments: 2,
  testing: 5,
  "real-time": 4,
  mobile: 4,
  "data processing": 7,
  algorithms: 8,
  "custom data structures": 5,
  "design patterns": 6,
  "desktop gui": 4,
  "grpc / microservices": 2,
  "reporting / pdf": 3,
  "admin dashboard": 3,
  "sql procedures": 5,
  "parsing / compilers": 4,
  "document generation": 2,
  "game development": 2,
};

function primarySharedTag(shared: string[], frequency: Map<string, number>) {
  return [...shared]
    .sort((a, b) => {
      const aRarity = 1 / Math.sqrt(frequency.get(a) ?? 1);
      const bRarity = 1 / Math.sqrt(frequency.get(b) ?? 1);
      return (
        weightOf(b) * 1.4 + bRarity -
        (weightOf(a) * 1.4 + aRarity)
      );
    })[0];
}

function edgeLimitForTag(tag: string, frequency: Map<string, number>) {
  const memberCount = frequency.get(tag) ?? 2;
  const configured = EDGE_LIMIT_BY_TAG[tag] ?? DEFAULT_EDGE_LIMIT_PER_TAG;
  return clamp(configured, 1, Math.max(1, memberCount - 1));
}

function selectReadableEdges(
  candidates: Edge[],
  items: Project[],
  frequency: Map<string, number>,
) {
  const selected: Edge[] = [];
  const selectedKeys = new Set<string>();
  const edgesByNode = new Map<string, number>();
  const edgesByTag = new Map<string, number>();
  const sorted = [...candidates].sort(
    (a, b) =>
      b.weight - a.weight ||
      a.source.localeCompare(b.source) ||
      a.target.localeCompare(b.target),
  );

  const addEdge = (edge: Edge) => {
    const key = edgePairKey(edge.source, edge.target);
    if (selectedKeys.has(key)) return false;

    selected.push(edge);
    selectedKeys.add(key);
    edgesByNode.set(edge.source, (edgesByNode.get(edge.source) ?? 0) + 1);
    edgesByNode.set(edge.target, (edgesByNode.get(edge.target) ?? 0) + 1);

    const tag = primarySharedTag(edge.shared, frequency);
    edgesByTag.set(tag, (edgesByTag.get(tag) ?? 0) + 1);
    return true;
  };

  for (const edge of sorted) {
    const sourceCount = edgesByNode.get(edge.source) ?? 0;
    const targetCount = edgesByNode.get(edge.target) ?? 0;
    const tag = primarySharedTag(edge.shared, frequency);
    const tagCount = edgesByTag.get(tag) ?? 0;

    if (
      sourceCount >= MAX_SELECTED_EDGES_PER_NODE ||
      targetCount >= MAX_SELECTED_EDGES_PER_NODE ||
      tagCount >= edgeLimitForTag(tag, frequency)
    ) {
      continue;
    }

    addEdge(edge);
  }

  for (const project of items) {
    if ((edgesByNode.get(project.title) ?? 0) > 0) continue;

    const fallback = sorted.find(
      (edge) => edge.source === project.title || edge.target === project.title,
    );

    if (fallback) {
      addEdge(fallback);
    }
  }

  return selected;
}

function classifyProject(project: Project): ClusterKey {
  const tech = project.tech.join(" ").toLowerCase();

  if (/(sql server|t-sql|stored procedures|postgresql|plpgsql|etl)/.test(tech)) {
    return "data";
  }

  if (/(c\+\+|stl|raii|shared_ptr|templates|recursive parsing)/.test(tech)) {
    return "systems";
  }

  if (/(java|swing)/.test(tech)) {
    return "java";
  }

  if (/(asp\.net|grpc|ef core|xunit|swagger|github actions)/.test(tech)) {
    return "enterprise";
  }

  if (/(design patterns|csvhelper|json schema|xpath|xml|unity)/.test(tech)) {
    return "patterns";
  }

  if (
    /(react|node\.js|express|socket\.io|mongodb|firebase|firestore|expo|mui|vue 3|quasar)/.test(
      tech,
    )
  ) {
    return "web";
  }

  return "patterns";
}

function getLabelPlacement(_node: Pick<Node, "x" | "y">): LabelPlacement {
  return "bottom";
}

function getFootprintBox(node: Node) {
  const placement = getLabelPlacement(node);
  const iconBox = {
    left: node.x - NODE_RADIUS,
    top: node.y - NODE_RADIUS,
    right: node.x + NODE_RADIUS,
    bottom: node.y + NODE_RADIUS,
  };

  let labelBox = {
    left: node.x - node.labelWidth / 2,
    top: node.y - node.labelHeight / 2,
    right: node.x + node.labelWidth / 2,
    bottom: node.y + node.labelHeight / 2,
  };

  if (placement === "right") {
    labelBox = {
      left: node.x + NODE_RADIUS + LABEL_GAP,
      top: node.y - node.labelHeight / 2,
      right: node.x + NODE_RADIUS + LABEL_GAP + node.labelWidth,
      bottom: node.y + node.labelHeight / 2,
    };
  } else if (placement === "left") {
    labelBox = {
      left: node.x - NODE_RADIUS - LABEL_GAP - node.labelWidth,
      top: node.y - node.labelHeight / 2,
      right: node.x - NODE_RADIUS - LABEL_GAP,
      bottom: node.y + node.labelHeight / 2,
    };
  } else if (placement === "top") {
    labelBox = {
      left: node.x - node.labelWidth / 2,
      top: node.y - NODE_RADIUS - LABEL_GAP - node.labelHeight,
      right: node.x + node.labelWidth / 2,
      bottom: node.y - NODE_RADIUS - LABEL_GAP,
    };
  } else {
    labelBox = {
      left: node.x - node.labelWidth / 2,
      top: node.y + NODE_RADIUS + LABEL_GAP,
      right: node.x + node.labelWidth / 2,
      bottom: node.y + NODE_RADIUS + LABEL_GAP + node.labelHeight,
    };
  }

  return {
    left: Math.min(iconBox.left, labelBox.left),
    top: Math.min(iconBox.top, labelBox.top),
    right: Math.max(iconBox.right, labelBox.right),
    bottom: Math.max(iconBox.bottom, labelBox.bottom),
  };
}

function expandBox(box: ReturnType<typeof getFootprintBox>, padding: number) {
  return {
    left: box.left - padding,
    top: box.top - padding,
    right: box.right + padding,
    bottom: box.bottom + padding,
  };
}

function isPointInBox(point: LivePosition, box: ReturnType<typeof getFootprintBox>) {
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

function segmentIntersectsBox(
  start: LivePosition,
  end: LivePosition,
  box: ReturnType<typeof getFootprintBox>,
) {
  if (isPointInBox(start, box) || isPointInBox(end, box)) {
    return true;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let tMin = 0;
  let tMax = 1;

  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 0.0001) {
      return q >= 0;
    }

    const t = q / p;
    if (p < 0) {
      if (t > tMax) return false;
      if (t > tMin) tMin = t;
    } else {
      if (t < tMin) return false;
      if (t < tMax) tMax = t;
    }

    return true;
  };

  return (
    clip(-dx, start.x - box.left) &&
    clip(dx, box.right - start.x) &&
    clip(-dy, start.y - box.top) &&
    clip(dy, box.bottom - start.y)
  );
}

function closestPointOnSegment(
  point: LivePosition,
  start: LivePosition,
  end: LivePosition,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy || 1;
  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq,
    0,
    1,
  );

  return {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
}

function getNodeViewportBounds(
  node: Pick<Node, "x" | "y" | "labelWidth" | "labelHeight">,
  overscroll = 0,
) {
  const placement = getLabelPlacement(node);
  const extraLeft =
    placement === "left" ? node.labelWidth + NODE_RADIUS + LABEL_GAP : NODE_RADIUS + 20;
  const extraRight =
    placement === "right" ? node.labelWidth + NODE_RADIUS + LABEL_GAP : NODE_RADIUS + 20;
  const extraTop =
    placement === "top" ? node.labelHeight + NODE_RADIUS + LABEL_GAP : NODE_RADIUS + 20;
  const extraBottom =
    placement === "bottom"
      ? node.labelHeight + NODE_RADIUS + LABEL_GAP
      : NODE_RADIUS + 20;

  return {
    minX: extraLeft - overscroll,
    maxX: VIEWBOX_W - extraRight + overscroll,
    minY: extraTop - overscroll,
    maxY: VIEWBOX_H - extraBottom + overscroll,
  };
}

function clampPositionToNodeBounds(
  node: Node,
  position: LivePosition,
  overscroll = 0,
): LivePosition {
  const bounds = getNodeViewportBounds(node, overscroll);

  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY),
  };
}

function graphFloatOffsetForNode(
  nodeSeed: GraphFloatSeed,
  clusterSeed: GraphFloatSeed,
  seconds: number,
  scale: number,
): LivePosition {
  const clusterX =
    Math.cos(seconds * clusterSeed.speedX + clusterSeed.phaseX) *
    GRAPH_FLOAT_CLUSTER_X *
    clusterSeed.ampX;
  const clusterY =
    Math.sin(seconds * clusterSeed.speedY + clusterSeed.phaseY) *
    GRAPH_FLOAT_CLUSTER_Y *
    clusterSeed.ampY;
  const orbit = seconds * nodeSeed.speedY * 0.72 + nodeSeed.phaseOrbit;
  const nodeX =
    Math.cos(seconds * nodeSeed.speedX + nodeSeed.phaseX) *
      GRAPH_FLOAT_NODE_X *
      nodeSeed.ampX +
    Math.cos(orbit) * GRAPH_FLOAT_ORBIT;
  const nodeY =
    Math.sin(seconds * nodeSeed.speedY + nodeSeed.phaseY) *
      GRAPH_FLOAT_NODE_Y *
      nodeSeed.ampY +
    Math.sin(orbit) * GRAPH_FLOAT_ORBIT;

  return {
    x: (clusterX + nodeX) * scale,
    y: (clusterY + nodeY) * scale,
  };
}

function graphFloatOffsetForNodeAt(
  node: Node | undefined,
  nodeSeed: GraphFloatSeed | undefined,
  clusterSeed: GraphFloatSeed | undefined,
  seconds: number,
  scale: number,
) {
  if (!node || !nodeSeed || !clusterSeed || scale <= 0) {
    return { x: 0, y: 0 };
  }

  return graphFloatOffsetForNode(nodeSeed, clusterSeed, seconds, scale);
}

function positionWithoutFloat(
  node: Node,
  position: LivePosition,
  nodeSeed: GraphFloatSeed | undefined,
  clusterSeed: GraphFloatSeed | undefined,
  seconds: number,
  scale: number,
  overscroll = 0,
) {
  const offset = graphFloatOffsetForNodeAt(
    node,
    nodeSeed,
    clusterSeed,
    seconds,
    scale,
  );

  return clampPositionToNodeBounds(
    node,
    {
      x: position.x - offset.x,
      y: position.y - offset.y,
    },
    overscroll,
  );
}

function floatingPositionForNode(
  node: Node,
  nodeSeed: GraphFloatSeed,
  clusterSeed: GraphFloatSeed,
  seconds: number,
  scale: number,
  overscroll = 0,
): LivePosition {
  const offset = graphFloatOffsetForNode(nodeSeed, clusterSeed, seconds, scale);

  return clampPositionToNodeBounds(
    node,
    {
      x: node.x + offset.x,
      y: node.y + offset.y,
    },
    overscroll,
  );
}

function clampNodeToViewport(node: Node) {
  const clamped = clampPositionToNodeBounds(node, node);
  node.x = clamped.x;
  node.y = clamped.y;
}

function buildGraph(items: Project[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = items.map((project) => {
    const labelWidth = estimateLabelWidth(project.title);

    return {
      id: project.title,
      project,
      x: CENTER_X,
      y: CENTER_Y,
      vx: 0,
      vy: 0,
      degree: 0,
      cluster: classifyProject(project),
      homeX: CENTER_X,
      homeY: CENTER_Y,
      labelWidth,
      labelHeight: estimateLabelHeight(project.title, labelWidth),
    };
  });

  const directTech = items.map((project) =>
    Array.from(
      new Set([
        ...project.relations.map(relationTag),
        ...project.tech
          .flatMap((tech) => expandTechTags(tech))
          .filter(isConnectableTechTag),
      ]),
    ),
  );
  const relationshipTech = items.map((project) => inferRelationshipTags(project));
  const directColorTech = directTech.map((tags) =>
    tags.filter((tech) => !INFERRED_COLOR_TAGS.has(tech)),
  );
  const expandedTech = items.map((_, index) =>
    Array.from(
      new Set([
        ...directTech[index],
        ...relationshipTech[index],
      ]),
    ),
  );
  const techFrequency = new Map<string, number>();

  for (const tags of expandedTech) {
    for (const tech of tags) {
      techFrequency.set(tech, (techFrequency.get(tech) ?? 0) + 1);
    }
  }

  const candidateEdges: Edge[] = [];
  const candidateByPair = new Map<string, Edge>();
  for (let i = 0; i < items.length; i++) {
    const aDirectTech = new Set(directTech[i]);
    const aColorTech = new Set(directColorTech[i]);

    for (let j = i + 1; j < items.length; j++) {
      const directShared = directTech[j].filter((tech) => aDirectTech.has(tech));

      if (directShared.length === 0) {
        continue;
      }

      const directColorShared = directColorTech[j].filter((tech) =>
        aColorTech.has(tech),
      );
      const concreteShared =
        directColorShared.length > 0
          ? directColorShared
          : directShared.filter((tech) => !INFERRED_COLOR_TAGS.has(tech));

      const weight = scoreSharedTech(directShared, techFrequency);
      const strongShared = directShared.filter((tech) => weightOf(tech) >= 0.85);
      const meaningfulShared = directShared.filter((tech) => weightOf(tech) >= 0.7);

      const passes =
        strongShared.length >= 1 ||
        meaningfulShared.length >= 2 ||
        weight >= 1.15;

      if (!passes) {
        continue;
      }

      const edge: Edge = {
        source: items[i].title,
        target: items[j].title,
        weight,
        shared: directShared,
        color:
          concreteShared.length > 0
            ? edgeColorForShared(concreteShared, techFrequency)
            : fallbackEdgeColor(items[i].title, items[j].title),
      };

      candidateEdges.push(edge);
      candidateByPair.set(edgePairKey(edge.source, edge.target), edge);
    }
  }

  const CURATED_GROUPS: { label: string; members: string[]; color: string }[] = [
    {
      label: "Pure SQL design",
      color: "#ef4444",
      members: [
        "Order Management System",
        "Data Warehouse ETL Pipeline",
        "Drone Management System",
        "Employee Management System",
        "Family Genealogy Database",
      ],
    },
    {
      label: "Java OOP",
      color: "#b07219",
      members: [
        "Customer Incentive Management System",
        "Student Loan Repayment Calculator",
        "Enigma Machine Simulator",
      ],
    },
    {
      label: "C++ systems",
      color: "#f34b7d",
      members: [
        "Expression Evaluator",
        "Newcomb-Benford Data Analyzer",
        "Khronos Calendar Library",
        "Patient Diagnosis Classifier",
        "Triage Priority Queue",
      ],
    },
    {
      label: "GoF design patterns",
      color: "#c084fc",
      members: [
        "Coffee Shop POS",
        "Collaborative Drawing App",
        "Document Factory",
        "Stack Evaluator",
      ],
    },
  ];

  const titleSet = new Set(items.map((p) => p.title));
  const curatedEdges: Edge[] = [];

  for (const group of CURATED_GROUPS) {
    const present = group.members.filter((m) => titleSet.has(m));
    for (let i = 0; i < present.length - 1; i++) {
      const key = edgePairKey(present[i], present[i + 1]);
      if (candidateByPair.has(key)) continue;
      const edge: Edge = {
        source: present[i],
        target: present[i + 1],
        weight: 1.0,
        shared: [group.label],
        color: group.color,
      };
      curatedEdges.push(edge);
      candidateByPair.set(key, edge);
    }
  }

  const CURATED_PAIRS: {
    label: string;
    source: string;
    target: string;
    color: string;
    weight: number;
  }[] = [
    {
      label: "Frontend SPA",
      source: "Fragrance E-Commerce",
      target: "Fast Food Ordering",
      color: "#61dafb",
      weight: 1.18,
    },
    {
      label: "Frontend SPA",
      source: "Fragrance E-Commerce",
      target: "Travel Advisory Tracker",
      color: "#61dafb",
      weight: 1.08,
    },
    {
      label: "Frontend SPA",
      source: "Fragrance E-Commerce",
      target: "Debug My Heart",
      color: "#61dafb",
      weight: 1.05,
    },
    {
      label: "Frontend SPA",
      source: "Fragrance E-Commerce",
      target: "Real-Time Room Chat App",
      color: "#61dafb",
      weight: 1.02,
    },
  ];

  for (const pair of CURATED_PAIRS) {
    if (!titleSet.has(pair.source) || !titleSet.has(pair.target)) continue;

    const key = edgePairKey(pair.source, pair.target);
    if (candidateByPair.has(key)) continue;

    const edge: Edge = {
      source: pair.source,
      target: pair.target,
      weight: pair.weight,
      shared: [pair.label],
      color: pair.color,
    };

    curatedEdges.push(edge);
    candidateByPair.set(key, edge);
  }

  let edges: Edge[] = selectReadableEdges(
    [...candidateEdges, ...curatedEdges],
    items,
    techFrequency,
  );

  const edgesByNode = new Map<string, Edge[]>();
  for (const edge of edges) {
    (edgesByNode.get(edge.source) ?? edgesByNode.set(edge.source, []).get(edge.source)!).push(edge);
    (edgesByNode.get(edge.target) ?? edgesByNode.set(edge.target, []).get(edge.target)!).push(edge);
  }

  const titleToCluster = new Map(nodes.map((n) => [n.id, n.cluster]));
  const titleToIndex = new Map(items.map((p, idx) => [p.title, idx]));

  const findBestNeighbor = (
    node: Node,
    aDirect: Set<string>,
    sameClusterOnly: boolean,
  ) => {
    let best: { other: Project; weight: number; shared: string[] } | null = null;
    for (const other of items) {
      if (other.title === node.id) continue;
      if (sameClusterOnly && titleToCluster.get(other.title) !== node.cluster) continue;
      const oDirect = directTech[titleToIndex.get(other.title)!];
      const shared = oDirect.filter((tech) => aDirect.has(tech));
      if (shared.length === 0) continue;
      const w = scoreSharedTech(shared, techFrequency);
      if (!best || w > best.weight) best = { other, weight: w, shared };
    }
    return best;
  };

  for (const node of nodes) {
    if ((edgesByNode.get(node.id) ?? []).length > 0) continue;

    const aDirect = new Set(directTech[titleToIndex.get(node.id)!]);
    const best =
      findBestNeighbor(node, aDirect, true) ??
      findBestNeighbor(node, aDirect, false);

    if (best) {
      const key = edgePairKey(node.id, best.other.title);
      if (!candidateByPair.has(key)) {
        const concrete = best.shared.filter((tech) => !INFERRED_COLOR_TAGS.has(tech));
        const edge: Edge = {
          source: node.id,
          target: best.other.title,
          weight: best.weight,
          shared: best.shared,
          color:
            concrete.length > 0
              ? edgeColorForShared(concrete, techFrequency)
              : fallbackEdgeColor(node.id, best.other.title),
        };
        edges.push(edge);
        candidateByPair.set(key, edge);
      }
    }
  }

  const uniqueEdgesByPair = new Map<string, Edge>();
  for (const edge of edges) {
    const key = edgePairKey(edge.source, edge.target);
    const existing = uniqueEdgesByPair.get(key);

    if (!existing || edge.weight > existing.weight) {
      uniqueEdgesByPair.set(key, edge);
    }
  }

  edges = Array.from(uniqueEdgesByPair.values());

  for (const edge of edges) {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);

    if (sourceNode) sourceNode.degree += edge.weight;
    if (targetNode) targetNode.degree += edge.weight;
  }

  const grouped = new Map<ClusterKey, Node[]>();

  for (const node of nodes) {
    const list = grouped.get(node.cluster) ?? [];
    list.push(node);
    grouped.set(node.cluster, list);
  }

  for (const [cluster, clusterNodes] of grouped) {
    const center = CLUSTER_CENTERS[cluster];
    const angleOffset = CLUSTER_ANGLE_OFFSETS[cluster];

    clusterNodes
      .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
      .forEach((node, index) => {
        const radius =
          clusterNodes.length === 1 ? 0 : 26 + Math.sqrt(index + 0.6) * 70;
        const angle = angleOffset + GOLDEN_ANGLE * index;

        node.homeX = center.x + Math.cos(angle) * radius;
        node.homeY = center.y + Math.sin(angle) * radius;
        node.x = node.homeX;
        node.y = node.homeY;
        clampNodeToViewport(node);
      });
  }

  return { nodes, edges };
}

function resolveFootprintOverlaps(nodes: Node[], iterations = 150) {
  for (let tick = 0; tick < iterations; tick++) {
    let moved = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const boxA = getFootprintBox(a);
        const boxB = getFootprintBox(b);
        const overlapX =
          Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
        const overlapY =
          Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);

        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }

        moved = true;

        const dx = a.x - b.x || (i % 2 === 0 ? 1 : -1);
        const dy = a.y - b.y || (j % 2 === 0 ? 1 : -1);

        if (overlapX < overlapY) {
          const push = (overlapX + 12) * 0.5;
          const direction = Math.sign(dx) || 1;
          a.x += direction * push;
          b.x -= direction * push;
        } else {
          const push = (overlapY + 12) * 0.5;
          const direction = Math.sign(dy) || 1;
          a.y += direction * push;
          b.y -= direction * push;
        }

        clampNodeToViewport(a);
        clampNodeToViewport(b);
      }
    }

    if (!moved) {
      break;
    }

    for (const node of nodes) {
      node.x += (node.homeX - node.x) * 0.08;
      node.y += (node.homeY - node.y) * 0.08;
      clampNodeToViewport(node);
    }
  }
}

function resolveEdgeNodeOverlaps(
  nodes: Node[],
  edges: Edge[],
  iterations = 100,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (let tick = 0; tick < iterations; tick++) {
    let moved = false;

    for (const edge of edges) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);

      if (!source || !target) {
        continue;
      }

      const endpoints = getEdgeEndpoints(source, target);
      const start = { x: endpoints.x1, y: endpoints.y1 };
      const end = { x: endpoints.x2, y: endpoints.y2 };

      for (const node of nodes) {
        if (node.id === edge.source || node.id === edge.target) {
          continue;
        }

        const footprint = expandBox(
          getFootprintBox(node),
          EDGE_FOOTPRINT_CLEARANCE,
        );

        if (!segmentIntersectsBox(start, end, footprint)) {
          continue;
        }

        const closest = closestPointOnSegment(node, start, end);
        let dx = node.x - closest.x;
        let dy = node.y - closest.y;
        let distance = Math.hypot(dx, dy);

        if (distance < 0.01) {
          const edgeDx = end.x - start.x;
          const edgeDy = end.y - start.y;
          dx = -edgeDy || 1;
          dy = edgeDx || 0;
          distance = Math.hypot(dx, dy) || 1;
        }

        const nx = dx / distance;
        const ny = dy / distance;
        const push =
          distance < EDGE_NODE_CLEARANCE
            ? (EDGE_NODE_CLEARANCE - distance) * 0.22 + 5
            : 6;

        node.x += nx * push;
        node.y += ny * push;
        node.homeX = node.x;
        node.homeY = node.y;
        node.vx = 0;
        node.vy = 0;
        clampNodeToViewport(node);
        moved = true;
      }
    }

    if (!moved) {
      break;
    }

    if (tick % 8 === 7) {
      resolveFootprintOverlaps(nodes, 12);
    }
  }
}

function runLayout(nodes: Node[], edges: Edge[], ticks = 220) {
  const idToIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const repulsion = 14200;
  const damping = 0.83;
  const homePull = 0.03;
  const centerPull = 0.0025;

  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const force = repulsion / distSq;
        a.vx += nx * force;
        a.vy += ny * force;
        b.vx -= nx * force;
        b.vy -= ny * force;

        const minDistance = 86 + (a.labelWidth + b.labelWidth) * 0.2;
        const collision = minDistance - dist;

        if (collision > 0) {
          const push = collision * 0.028;
          a.vx += nx * push;
          a.vy += ny * push;
          b.vx -= nx * push;
          b.vy -= ny * push;
        }
      }
    }

    for (const edge of edges) {
      const a = nodes[idToIndex.get(edge.source)!];
      const b = nodes[idToIndex.get(edge.target)!];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const nx = dx / dist;
      const ny = dy / dist;
      const desiredLength = 235 - Math.min(edge.weight, 3) * 36;
      const springK = 0.012 + Math.min(edge.weight, 3) * 0.011;
      const displacement = dist - desiredLength;

      a.vx += nx * displacement * springK;
      a.vy += ny * displacement * springK;
      b.vx -= nx * displacement * springK;
      b.vy -= ny * displacement * springK;
    }

    for (const node of nodes) {
      node.vx += (node.homeX - node.x) * homePull;
      node.vy += (node.homeY - node.y) * homePull;
      node.vx += (CENTER_X - node.x) * centerPull;
      node.vy += (CENTER_Y - node.y) * centerPull;
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
      clampNodeToViewport(node);
    }
  }

  resolveFootprintOverlaps(nodes);
}

function applyProjectPositionOverrides(nodes: Node[]) {
  for (const node of nodes) {
    const override = PROJECT_POSITION_OVERRIDES[node.id];

    if (!override) {
      continue;
    }

    node.x = override.x;
    node.y = override.y;
    node.homeX = override.x;
    node.homeY = override.y;
    node.vx = 0;
    node.vy = 0;
    clampNodeToViewport(node);
  }
}

function distanceBetween(source: LivePosition, target: LivePosition) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function waveSegmentDurationFor(
  source: LivePosition,
  target: LivePosition,
  reduced: boolean,
) {
  if (reduced) {
    return WAVE_SEGMENT_DURATION_REDUCED;
  }

  const travelDistance = Math.max(70, distanceBetween(source, target) - LINE_GAP * 2);
  return clamp(
    travelDistance / WAVE_UNITS_PER_SECOND,
    WAVE_MIN_SEGMENT_DURATION,
    WAVE_MAX_SEGMENT_DURATION,
  );
}

function getEdgeEndpoints(source: LivePosition, target: LivePosition): EdgeEndpoints {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;

  return {
    x1: source.x + nx * LINE_GAP,
    y1: source.y + ny * LINE_GAP,
    x2: target.x - nx * LINE_GAP,
    y2: target.y - ny * LINE_GAP,
  };
}

function setLineEndpoints(
  element: SVGLineElement | null,
  endpoints: EdgeEndpoints,
) {
  setSvgAttr(element, "x1", endpoints.x1);
  setSvgAttr(element, "y1", endpoints.y1);
  setSvgAttr(element, "x2", endpoints.x2);
  setSvgAttr(element, "y2", endpoints.y2);
}

function toSvgId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function splitLabel(title: string) {
  if (title.length <= 18) {
    return [title];
  }

  const words = title.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > 18 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length <= 2) {
    return lines;
  }

  return [lines[0], lines.slice(1).join(" ")];
}

function clearTextSelection() {
  window.getSelection()?.removeAllRanges();
}

function projectFocus(project: Project): ProjectFocus {
  const text = `${project.title} ${project.blurb} ${project.tech.join(" ")}`.toLowerCase();

  if (/(react native|expo|mobile|apk)/.test(text)) return "mobile";
  if (/(sql|database|postgres|warehouse|etl|payroll|genealogy)/.test(text)) return "data";
  if (/(c\+\+|compiler|parser|decision tree|calendar|priority queue)/.test(text)) {
    return "systems";
  }
  if (/(java|swing)/.test(text)) return "java";
  if (/(design patterns|factory|strategy|observer|memento|unity)/.test(text)) {
    return "patterns";
  }
  if (/(api|backend|server|asp\.net|node|express|grpc)/.test(text)) return "backend";
  return "web";
}

function whyProjectMatters(project: Project) {
  const focus = projectFocus(project);

  const copy: Record<ProjectFocus, string> = {
    web: "It shows complete product thinking: interface, data flow, persistence, and user-facing polish working together instead of living as separate demos.",
    mobile:
      "It proves the app can leave the browser and handle device constraints like navigation, local persistence, cloud sync, and installable builds.",
    backend:
      "It demonstrates service design, data access, authentication, and API boundaries that are close to the work expected in real application teams.",
    data: "It makes the data model the product: relationships, constraints, reporting, and persistence are designed so the system can answer useful questions reliably.",
    systems:
      "It highlights fundamentals that transfer across stacks: algorithms, memory-aware design, parsing, testing, and clear low-level control.",
    patterns:
      "It shows that the architecture is intentional, with patterns used to separate responsibilities rather than decorate the code.",
    java: "It rounds out the portfolio with object-oriented Java work, domain modeling, and interface-driven structure outside the web stack.",
  };

  return copy[focus];
}

export function ProjectGraph() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [lastViewedId, setLastViewedId] = useState<string>(projects[0].title);
  const [arrivalPingById, setArrivalPingById] = useState<Map<string, ArrivalPing>>(
    () => new Map(),
  );
  // Drag overrides for project nodes. Sparse — only contains entries for
  // nodes the user has manually moved.
  const [draggedPositions, setDraggedPositions] = useState<Map<string, LivePosition>>(
    () => new Map(),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPerfActive, setDragPerfActive] = useState(false);
  const [graphPanning, setGraphPanning] = useState(false);
  const [graphViewport, setGraphViewport] = useState<GraphViewport>(() =>
    clampGraphViewport({ zoom: 1, panX: 0, panY: 0 }),
  );
  const arrivalPingTimers = useRef<Map<string, number>>(new Map());
  const shouldReduceMotion = useReducedMotion();
  const performanceProfile = useAdaptivePerformanceProfile();
  const diagnostics = usePerformanceDiagnosticFlags();
  const prefersReducedMotion = Boolean(shouldReduceMotion);
  const graphMotionPaused = Boolean(diagnostics.staticMode || dragPerfActive);
  const graphMotionReduced = graphMotionPaused;
  const graphFloatEnabled = Boolean(
    !diagnostics.staticMode && !prefersReducedMotion,
  );
  const graphFloatScale = graphFloatEnabled
    ? graphFloatScaleFor(performanceProfile.quality)
    : 0;
  const debugState = usePerformanceDebugState();
  const graphDebugEnabled = debugState.enabled;
  const graphQuality = useMemo(
    () =>
      diagnostics.disableGraphFilters || dragPerfActive
        ? {
            ...performanceProfile.graph,
            edgeGlowBlur: 0.1,
            signalGlowBlur: 0.1,
            nodeGlowBlur: 0.1,
            glowOpacityScale: 0.26,
            glowStrokeScale: 0.42,
            waveIntensityScale: 0.7,
            useFilteredEdgeGlow: false,
            useFilteredWaveGlow: false,
            useBlendMode: false,
          }
        : performanceProfile.graph,
    [diagnostics.disableGraphFilters, dragPerfActive, performanceProfile.graph],
  );
  // Ref consumed by GraphTubeFlow rAF loop so the wave reads up-to-the-frame
  // node coordinates without forcing the flow component to re-render.
  const livePositionsRef = useRef<Map<string, LivePosition>>(new Map());
  const nodeVisualRefs = useRef<Map<string, SVGGElement>>(new Map());
  const edgeLineRefs = useRef<Map<string, EdgeLineRefs>>(new Map());
  const waveReservationsRef = useRef<Map<string, WaveNodeReservation>>(new Map());
  const graphFrameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graphViewportRef = useRef<GraphViewport>(graphViewport);
  const perfMetricsRef = useRef<GraphPerfMetrics>({
    waveFrameMs: 0,
    relationCalcMs: 0,
    waveSamples: 0,
    pointer: null,
  });
  const [debugSnapshot, setDebugSnapshot] = useState<GraphDebugSnapshot>({
    fps: 0,
    frameMs: 0,
    p95FrameMs: 0,
    maxFrameMs: 0,
    jankPercent: 0,
    waveFrameMs: 0,
    relationCalcMs: 0,
    visualViewportScale: 1,
    graphRect: null,
    pointer: null,
  });
  graphViewportRef.current = graphViewport;
  // ─── Drag system ──────────────────────────────────────────────────────────
  // Pointer events drive one live coordinate source. During active drag we
  // write directly to the SVG node groups and relation-line attributes, then
  // commit the tugged coordinates to React state for the settled render.
  const dragStateRef = useRef<GraphDragState | null>(null);
  const graphPanStateRef = useRef<GraphPanState | null>(null);

  const { nodes, edges } = useMemo(() => {
    const graph = buildGraph(projects);
    runLayout(graph.nodes, graph.edges);
    resolveFootprintOverlaps(graph.nodes, 80);
    resolveEdgeNodeOverlaps(graph.nodes, graph.edges);
    resolveFootprintOverlaps(graph.nodes, 60);
    applyProjectPositionOverrides(graph.nodes);
    return graph;
  }, []);

  // Combine the static layout with any drag overrides into a stable array
  // that the renderer reads from. Nodes themselves are immutable layout
  // anchors; positions are derived state.
  const liveNodes = useMemo(
    () =>
      nodes.map((node) => {
        const override = draggedPositions.get(node.id);
        return override
          ? { ...node, x: override.x, y: override.y }
          : node;
      }),
    [nodes, draggedPositions],
  );
  const nodeFloatSeeds = useMemo(
    () => new Map(nodes.map((node) => [node.id, createGraphFloatSeed(node.id)])),
    [nodes],
  );
  const clusterFloatSeeds = useMemo(
    () =>
      new Map<ClusterKey, GraphFloatSeed>(
        CLUSTER_ORDER.map((cluster) => [
          cluster,
          createGraphFloatSeed(`cluster:${cluster}`),
        ]),
      ),
    [],
  );

  // Keep the ref in sync so rAF readers always see the latest positions.
  // While a pointer drag is active, preserve the directly-written coordinate
  // because React may render before the coalesced state commit lands. While
  // floating, preserve the last visual coordinate so hover/focus renders do
  // not briefly snap nodes back to their static anchors.
  {
    const previous = livePositionsRef.current;
    const activeDrag = dragStateRef.current;
    const activeDragInfluences = activeDrag?.moved
      ? activeDrag.influenceById
      : null;
    const fresh = new Map<string, LivePosition>();
    for (const node of liveNodes) {
      const liveDragPosition =
        activeDragInfluences?.has(node.id) ? previous.get(node.id) : null;
      const preservedFloatPosition =
        graphFloatEnabled ? previous.get(node.id) : null;
      fresh.set(
        node.id,
        liveDragPosition ?? preservedFloatPosition ?? { x: node.x, y: node.y },
      );
    }
    livePositionsRef.current = fresh;
  }

  useEffect(() => {
    const activeId = hoveredId ?? pinnedId;

    if (activeId) {
      setLastViewedId(activeId);
    }
  }, [hoveredId, pinnedId]);

  const setGraphDragPerfMode = useCallback((active: boolean) => {
    setDragPerfActive(active);
    announceGraphDragPerformance(active);
  }, []);

  useEffect(
    () => () => {
      for (const timer of arrivalPingTimers.current.values()) {
        window.clearTimeout(timer);
      }
      announceGraphDragPerformance(false);
    },
    [],
  );

  const handleTubeArrival = useCallback((arrival: NodeArrival) => {
    const token = window.performance.now();

    setArrivalPingById((current) => {
      const next = new Map(current);
      next.set(arrival.nodeId, {
        token,
        color: arrival.color,
      });
      return next;
    });

    const existingTimer = arrivalPingTimers.current.get(arrival.nodeId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      setArrivalPingById((current) => {
        const activePing = current.get(arrival.nodeId);

        if (!activePing || activePing.token !== token) {
          return current;
        }

        const next = new Map(current);
        next.delete(arrival.nodeId);
        return next;
      });
      arrivalPingTimers.current.delete(arrival.nodeId);
    }, BADGE_PING_DURATION * 1000 + 140);

    arrivalPingTimers.current.set(arrival.nodeId, timer);
  }, []);

  const recordGraphFrameMetric = useCallback(
    ({ frameMs, relationCalcMs }: GraphPerfMetric) => {
      if (!graphDebugEnabled) {
        return;
      }

      const metrics = perfMetricsRef.current;
      const weight = metrics.waveSamples === 0 ? 1 : 0.12;
      metrics.waveFrameMs =
        metrics.waveFrameMs * (1 - weight) + frameMs * weight;
      metrics.relationCalcMs =
        metrics.relationCalcMs * (1 - weight) + relationCalcMs * weight;
      metrics.waveSamples += 1;
    },
    [graphDebugEnabled],
  );

  useEffect(() => {
    if (!graphDebugEnabled) {
      return;
    }

    let frame = 0;
    let last = performance.now();
    let lastReport = last;
    let frames = 0;
    let frameSamples: number[] = [];

    const tick = (now: number) => {
      frames += 1;
      const frameMs = now - last;
      last = now;
      frameSamples.push(frameMs);

      if (now - lastReport >= 250) {
        const elapsed = now - lastReport;
        const metrics = perfMetricsRef.current;
        const sortedSamples = [...frameSamples].sort((a, b) => a - b);
        const p95Index = Math.max(0, Math.ceil(sortedSamples.length * 0.95) - 1);
        const p95FrameMs = sortedSamples[p95Index] ?? frameMs;
        const maxFrameMs = sortedSamples[sortedSamples.length - 1] ?? frameMs;
        const jankyFrames = frameSamples.filter((sample) => sample > 24).length;
        const graphRect = svgRef.current?.getBoundingClientRect() ?? null;
        setDebugSnapshot({
          fps: (frames * 1000) / elapsed,
          frameMs,
          p95FrameMs,
          maxFrameMs,
          jankPercent: frameSamples.length
            ? (jankyFrames / frameSamples.length) * 100
            : 0,
          waveFrameMs: metrics.waveFrameMs,
          relationCalcMs: metrics.relationCalcMs,
          visualViewportScale: window.visualViewport?.scale ?? 1,
          graphRect: graphRect
            ? {
                width: graphRect.width,
                height: graphRect.height,
              }
            : null,
          pointer: metrics.pointer,
        });
        frames = 0;
        lastReport = now;
        frameSamples = [];
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [graphDebugEnabled]);

  const activeId = hoveredId ?? pinnedId;

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const node of nodes) {
      map.set(node.id, new Set());
    }

    for (const edge of edges) {
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    }

    return map;
  }, [nodes, edges]);

  const edgesByNode = useMemo(() => {
    const map = new Map<string, Edge[]>();

    for (const node of nodes) {
      map.set(node.id, []);
    }

    for (const edge of edges) {
      map.get(edge.source)?.push(edge);
      map.get(edge.target)?.push(edge);
    }

    return map;
  }, [nodes, edges]);

  const previewProject =
    liveNodes.find((node) => node.id === (activeId ?? lastViewedId))?.project ??
    projects[0];

  const previewMode: PreviewMode = hoveredId
    ? "hovered"
    : pinnedId
      ? "pinned"
      : "idle";

  const isHighlighted = (nodeId: string) => {
    if (!activeId) {
      return true;
    }

    if (nodeId === activeId) {
      return true;
    }

    return adjacency.get(activeId)?.has(nodeId) ?? false;
  };

  const isEdgeHighlighted = (edge: Edge) =>
    !activeId || edge.source === activeId || edge.target === activeId;

  // Topology-only map — used by route/cluster computation. Kept stable through
  // drag so the wave route never re-derives.
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  // Live map — used by edge rendering and node rendering so endpoints follow
  // dragged positions.
  const liveNodeById = useMemo(
    () => new Map(liveNodes.map((node) => [node.id, node])),
    [liveNodes],
  );
  const waveSegmentOptionsByStartId = useMemo(() => {
    const map = new Map<string, TubeSegment[]>();

    for (const edge of edges) {
      const sourceOptions = map.get(edge.source) ?? [];
      sourceOptions.push({
        edge,
        startId: edge.source,
        endId: edge.target,
      });
      map.set(edge.source, sourceOptions);

      const targetOptions = map.get(edge.target) ?? [];
      targetOptions.push({
        edge,
        startId: edge.target,
        endId: edge.source,
      });
      map.set(edge.target, targetOptions);
    }

    for (const options of map.values()) {
      options.sort(
        (a, b) =>
          b.edge.weight - a.edge.weight ||
          a.endId.localeCompare(b.endId),
      );
    }

    return map;
  }, [edges]);
  const nodeAccentById = useMemo(() => {
    const ranked = new Map<string, { color: string; score: number }>();

    for (const edge of edges) {
      const score = edge.weight;

      for (const nodeId of [edge.source, edge.target]) {
        const current = ranked.get(nodeId);

        if (!current || score > current.score) {
          ranked.set(nodeId, { color: edge.color, score });
        }
      }
    }

    return new Map(
      Array.from(ranked.entries()).map(([nodeId, value]) => [nodeId, value.color]),
    );
  }, [edges]);
  const activeAccentById = useMemo(() => {
    const ranked = new Map<string, { color: string; score: number }>();

    if (!activeId) {
      return new Map<string, string>();
    }

    for (const edge of edges) {
      if (edge.source !== activeId && edge.target !== activeId) {
        continue;
      }

      const otherId = edge.source === activeId ? edge.target : edge.source;
      const score = edge.weight;

      for (const nodeId of [activeId, otherId]) {
        const current = ranked.get(nodeId);

        if (!current || score > current.score) {
          ranked.set(nodeId, { color: edge.color, score });
        }
      }
    }

    return new Map(
      Array.from(ranked.entries()).map(([nodeId, value]) => [nodeId, value.color]),
    );
  }, [activeId, edges]);
  const screenToSvgViewport = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const drag = dragStateRef.current;
    const pan = graphPanStateRef.current;
    let inverseCtm = drag?.inverseCtm ?? pan?.inverseCtm ?? null;
    if (!inverseCtm) {
      const ctm = svg.getScreenCTM();
      if (!ctm) {
        return null;
      }
      inverseCtm = ctm.inverse();
      if (drag) {
        drag.inverseCtm = inverseCtm;
      }
      if (pan) {
        pan.inverseCtm = inverseCtm;
      }
    }

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(inverseCtm);
    return { x: transformed.x, y: transformed.y };
  }, []);

  const svgViewportToGraph = useCallback((position: LivePosition) => {
    const viewport = graphViewportRef.current;

    return {
      x: (position.x - viewport.panX) / viewport.zoom,
      y: (position.y - viewport.panY) / viewport.zoom,
    };
  }, []);

  const screenToGraph = useCallback(
    (clientX: number, clientY: number) => {
      const position = screenToSvgViewport(clientX, clientY);
      return position ? svgViewportToGraph(position) : null;
    },
    [screenToSvgViewport, svgViewportToGraph],
  );

  const zoomGraph = useCallback(
    (direction: 1 | -1) => {
      setGraphViewport((current) =>
        zoomGraphViewportAt(
          current,
          current.zoom * (1 + direction * GRAPH_ZOOM_STEP),
        ),
      );
    },
    [],
  );

  const resetGraphZoom = useCallback(() => {
    setGraphViewport(clampGraphViewport({ zoom: 1, panX: 0, panY: 0 }));
  }, []);

  const handleGraphWheel = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      const focus = screenToSvgViewport(clientX, clientY);
      if (!focus) {
        return;
      }

      const zoomMultiplier = Math.exp(-deltaY * 0.0012);
      setGraphViewport((current) =>
        zoomGraphViewportAt(current, current.zoom * zoomMultiplier, focus),
      );
    },
    [screenToSvgViewport],
  );

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const graphFrame = graphFrameRef.current;
      const target = event.target;
      if (!graphFrame || !(target instanceof Node) || !graphFrame.contains(target)) {
        return;
      }

      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      event.preventDefault();
      event.stopPropagation();
      handleGraphWheel(event.clientX, event.clientY, event.deltaY);

      const restorePageScroll = () => {
        const scrollElement = document.scrollingElement;
        if (scrollElement) {
          scrollElement.scrollLeft = scrollX;
          scrollElement.scrollTop = scrollY;
          return;
        }

        if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
          window.scrollTo(scrollX, scrollY);
        }
      };

      window.requestAnimationFrame(restorePageScroll);
      window.setTimeout(restorePageScroll, 0);
      window.setTimeout(restorePageScroll, 80);
    };
    const wheelOptions: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };

    window.addEventListener("wheel", handleWheel, wheelOptions);

    return () => {
      window.removeEventListener("wheel", handleWheel, wheelOptions);
    };
  }, [handleGraphWheel]);

  const handleGraphPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0 || (event.pointerType === "mouse" && event.buttons !== 1)) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-project-graph-node='true']")) {
        return;
      }

      const start = screenToSvgViewport(event.clientX, event.clientY);
      if (!start) {
        return;
      }

      const ctm = svgRef.current?.getScreenCTM() ?? null;
      const viewport = graphViewportRef.current;

      event.currentTarget.setPointerCapture(event.pointerId);
      graphPanStateRef.current = {
        pointerId: event.pointerId,
        startSvgX: start.x,
        startSvgY: start.y,
        startPanX: viewport.panX,
        startPanY: viewport.panY,
        moved: false,
        inverseCtm: ctm ? ctm.inverse() : null,
      };
      setGraphPanning(true);
      event.preventDefault();
    },
    [screenToSvgViewport],
  );

  const handleGraphPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const pan = graphPanStateRef.current;
      if (!pan || pan.pointerId !== event.pointerId) {
        return;
      }

      const current = screenToSvgViewport(event.clientX, event.clientY);
      if (!current) {
        return;
      }

      const dx = current.x - pan.startSvgX;
      const dy = current.y - pan.startSvgY;

      if (!pan.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }

      pan.moved = true;
      event.preventDefault();
      setGraphViewport(() =>
        clampGraphViewport({
          zoom: graphViewportRef.current.zoom,
          panX: pan.startPanX + dx,
          panY: pan.startPanY + dy,
        }),
      );
    },
    [screenToSvgViewport],
  );

  const finishGraphPan = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const pan = graphPanStateRef.current;
      if (!pan || pan.pointerId !== event.pointerId) {
        return;
      }

      try {
        event.currentTarget.releasePointerCapture(pan.pointerId);
      } catch {
        // pointer capture may already be released — safe to ignore.
      }

      if (pan.moved) {
        event.preventDefault();
      }

      graphPanStateRef.current = null;
      setGraphPanning(false);
    },
    [],
  );

  const buildDragInfluenceMap = useCallback(
    (rootId: string): DragInfluenceGraph => {
      const influenceById = new Map<string, number>([[rootId, 1]]);
      const depthById = new Map<string, number>([[rootId, 0]]);
      const queue: Array<{ nodeId: string; depth: number; influence: number }> = [
        { nodeId: rootId, depth: 0, influence: 1 },
      ];

      while (queue.length > 0) {
        const current = queue.shift()!;

        if (current.depth >= DRAG_TUG_MAX_DEPTH) {
          continue;
        }

        const depthPull =
          current.depth === 0 ? DRAG_TUG_DIRECT_PULL : DRAG_TUG_DECAY;

        for (const edge of edgesByNode.get(current.nodeId) ?? []) {
          const otherId =
            edge.source === current.nodeId ? edge.target : edge.source;
          const edgePull = clamp(
            0.78 + Math.min(edge.weight, 3) * 0.09,
            0.82,
            1.06,
          );
          const nextInfluence = current.influence * depthPull * edgePull;
          const existingInfluence = influenceById.get(otherId) ?? 0;

          if (
            nextInfluence <= existingInfluence ||
            nextInfluence < DRAG_TUG_MIN_PULL
          ) {
            continue;
          }

          influenceById.set(otherId, nextInfluence);
          depthById.set(otherId, current.depth + 1);
          queue.push({
            nodeId: otherId,
            depth: current.depth + 1,
            influence: nextInfluence,
          });
        }
      }

      const tugEdges: DragTugEdge[] = [];
      const seenEdgeKeys = new Set<string>();

      for (const nodeId of influenceById.keys()) {
        for (const edge of edgesByNode.get(nodeId) ?? []) {
          if (!influenceById.has(edge.source) || !influenceById.has(edge.target)) {
            continue;
          }

          const edgeKey = edgePairKey(edge.source, edge.target);
          if (seenEdgeKeys.has(edgeKey)) {
            continue;
          }

          seenEdgeKeys.add(edgeKey);
          tugEdges.push({
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
          });
        }
      }

      return { influenceById, depthById, tugEdges };
    },
    [edgesByNode],
  );

  const floatOffsetForNodeId = useCallback(
    (nodeId: string, seconds: number) => {
      const node = liveNodeById.get(nodeId) ?? nodeById.get(nodeId);
      const nodeSeed = nodeFloatSeeds.get(nodeId);
      const clusterSeed = node ? clusterFloatSeeds.get(node.cluster) : undefined;

      return graphFloatOffsetForNodeAt(
        node,
        nodeSeed,
        clusterSeed,
        seconds,
        graphFloatScale,
      );
    },
    [clusterFloatSeeds, graphFloatScale, liveNodeById, nodeById, nodeFloatSeeds],
  );

  const commitDragPositions = useCallback(
    (positions: Map<string, LivePosition>) => {
      setDraggedPositions((current) => {
        const next = new Map(current);

        for (const [nodeId, position] of positions) {
          next.set(nodeId, position);
        }

        return next;
      });
    },
    [],
  );

  const setNodeVisualRef = useCallback((nodeId: string, element: SVGGElement | null) => {
    if (element) {
      nodeVisualRefs.current.set(nodeId, element);
    } else {
      nodeVisualRefs.current.delete(nodeId);
    }
  }, []);

  const setEdgeLineRef = useCallback(
    (edgeId: string, layer: keyof EdgeLineRefs, element: SVGLineElement | null) => {
      const refs =
        edgeLineRefs.current.get(edgeId) ??
        {
          glow: null,
          soft: null,
          core: null,
        };

      refs[layer] = element;

      if (refs.glow || refs.soft || refs.core) {
        edgeLineRefs.current.set(edgeId, refs);
      } else {
        edgeLineRefs.current.delete(edgeId);
      }
    },
    [],
  );

  const syncNodeVisualPosition = useCallback(
    (nodeId: string, position: LivePosition) => {
      const nodeElement = nodeVisualRefs.current.get(nodeId);
      if (!nodeElement) {
        return;
      }

      setSvgAttr(
        nodeElement,
        "transform",
        `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})`,
      );
    },
    [],
  );

  const syncAllEdges = useCallback(
    (positions: Map<string, LivePosition>) => {
      for (const edge of edges) {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);

        if (!source || !target) {
          continue;
        }

        const endpoints = getEdgeEndpoints(source, target);
        const refs = edgeLineRefs.current.get(edgePairKey(edge.source, edge.target));

        if (!refs) {
          continue;
        }

        setLineEndpoints(refs.glow, endpoints);
        setLineEndpoints(refs.soft, endpoints);
        setLineEndpoints(refs.core, endpoints);
      }
    },
    [edges],
  );

  const syncGraphVisuals = useCallback(
    (positions: Map<string, LivePosition>) => {
      for (const [nodeId, position] of positions) {
        syncNodeVisualPosition(nodeId, position);
      }

      syncAllEdges(positions);
    },
    [syncAllEdges, syncNodeVisualPosition],
  );

  const applyLiveDragPositions = useCallback(
    (positions: Map<string, LivePosition>) => {
      const next = new Map(livePositionsRef.current);

      for (const [nodeId, position] of positions) {
        next.set(nodeId, position);
        syncNodeVisualPosition(nodeId, position);
      }

      livePositionsRef.current = next;
      syncAllEdges(next);
    },
    [syncAllEdges, syncNodeVisualPosition],
  );

  const computeDragTugPositions = useCallback(
    (drag: GraphDragState, seconds: number) => {
      const positions = new Map<string, LivePosition>();
      const dt = clamp(
        drag.lastTugAt === null ? 1 / 60 : seconds - drag.lastTugAt,
        1 / 240,
        DRAG_TUG_MAX_DT,
      );
      drag.lastTugAt = seconds;

      const rootNode = liveNodeById.get(drag.nodeId) ?? nodeById.get(drag.nodeId);
      const rootStart = drag.startPositions.get(drag.nodeId);

      if (!rootNode || !rootStart) {
        drag.pending = positions;
        return positions;
      }

      const previousRoot =
        drag.pending?.get(drag.nodeId) ??
        livePositionsRef.current.get(drag.nodeId) ??
        rootStart;
      const rootTarget = clampPositionToNodeBounds(
        rootNode,
        {
          x: rootStart.x + drag.currentDx,
          y: rootStart.y + drag.currentDy,
        },
        GRAPH_NODE_DRAG_OVERSCROLL,
      );
      let rootVx = (rootTarget.x - previousRoot.x) / dt;
      let rootVy = (rootTarget.y - previousRoot.y) / dt;
      const rootVelocityLength = Math.hypot(rootVx, rootVy);

      if (rootVelocityLength > DRAG_TUG_MAX_VELOCITY) {
        const scale = DRAG_TUG_MAX_VELOCITY / rootVelocityLength;
        rootVx *= scale;
        rootVy *= scale;
      }

      positions.set(drag.nodeId, rootTarget);
      drag.velocityById.set(drag.nodeId, { x: rootVx, y: rootVy });
      const velocitySnapshot = new Map(drag.velocityById);

      const currentById = new Map<string, LivePosition>([
        [drag.nodeId, rootTarget],
      ]);

      for (const nodeId of drag.influenceById.keys()) {
        if (nodeId === drag.nodeId) {
          continue;
        }

        const start = drag.startPositions.get(nodeId);

        if (!start) {
          continue;
        }

        currentById.set(
          nodeId,
          drag.pending?.get(nodeId) ??
            livePositionsRef.current.get(nodeId) ??
            start,
        );
      }

      for (const [nodeId, influence] of drag.influenceById) {
        if (nodeId === drag.nodeId) {
          continue;
        }

        const node = liveNodeById.get(nodeId) ?? nodeById.get(nodeId);
        const start = drag.startPositions.get(nodeId);
        const current = currentById.get(nodeId);

        if (!node || !start || !current) {
          continue;
        }

        const depth = drag.depthById.get(nodeId) ?? DRAG_TUG_MAX_DEPTH;
        const startFloat = drag.startFloatOffsets.get(nodeId) ?? { x: 0, y: 0 };
        const currentFloat = floatOffsetForNodeId(nodeId, seconds);
        const floatFollow =
          DRAG_TUG_FLOAT_SCALE * Math.max(0.28, 1 - influence * 0.45);
        const anchorTarget = clampPositionToNodeBounds(
          node,
          {
            x:
              start.x +
              drag.currentDx * influence * 0.16 +
              (currentFloat.x - startFloat.x) * floatFollow,
            y:
              start.y +
              drag.currentDy * influence * 0.16 +
              (currentFloat.y - startFloat.y) * floatFollow,
          },
          GRAPH_NODE_DRAG_OVERSCROLL,
        );
        const velocity = velocitySnapshot.get(nodeId) ?? { x: 0, y: 0 };
        const anchorSpring =
          DRAG_TUG_ANCHOR_SPRING * (0.42 + influence * 0.58);
        let forceX = (anchorTarget.x - current.x) * anchorSpring;
        let forceY = (anchorTarget.y - current.y) * anchorSpring;

        for (const edge of drag.tugEdges) {
          if (edge.source !== nodeId && edge.target !== nodeId) {
            continue;
          }

          const otherId = edge.source === nodeId ? edge.target : edge.source;
          const otherPosition = currentById.get(otherId);
          const otherStart = drag.startPositions.get(otherId);

          if (!otherPosition || !otherStart) {
            continue;
          }

          const otherInfluence = drag.influenceById.get(otherId) ?? 0;
          const edgeInfluence = Math.max(influence, otherInfluence);
          const edgeStrength =
            DRAG_TUG_EDGE_SPRING *
            (0.58 + Math.min(edge.weight, 3) * 0.14) *
            Math.max(0.18, edgeInfluence) *
            (1 / (1 + depth * 0.16));
          const targetFromEdge = {
            x: otherPosition.x - (otherStart.x - start.x),
            y: otherPosition.y - (otherStart.y - start.y),
          };

          forceX += (targetFromEdge.x - current.x) * edgeStrength;
          forceY += (targetFromEdge.y - current.y) * edgeStrength;

          const otherVelocity = velocitySnapshot.get(otherId) ?? { x: 0, y: 0 };
          const relativeDamping =
            DRAG_TUG_EDGE_DAMPING * Math.max(0.16, edgeInfluence);

          forceX += (otherVelocity.x - velocity.x) * relativeDamping;
          forceY += (otherVelocity.y - velocity.y) * relativeDamping;
        }

        const jitter = dragTugJitterFor(nodeId);
        const mass =
          DRAG_TUG_MASS_BASE +
          depth * DRAG_TUG_MASS_DEPTH +
          jitter * DRAG_TUG_MASS_JITTER +
          (1 - influence) * 0.24;
        const damping =
          DRAG_TUG_DAMPING_BASE +
          depth * DRAG_TUG_DAMPING_DEPTH +
          (1 - influence) * 0.72;
        const decay = Math.exp(-damping * dt);
        let nextVx = (velocity.x + (forceX / mass) * dt) * decay;
        let nextVy = (velocity.y + (forceY / mass) * dt) * decay;
        const velocityLength = Math.hypot(nextVx, nextVy);

        if (velocityLength > DRAG_TUG_MAX_VELOCITY) {
          const scale = DRAG_TUG_MAX_VELOCITY / velocityLength;
          nextVx *= scale;
          nextVy *= scale;
        }

        const proposedPosition = {
          x: current.x + nextVx * dt,
          y: current.y + nextVy * dt,
        };
        const nextPosition = clampPositionToNodeBounds(
          node,
          proposedPosition,
          GRAPH_NODE_DRAG_OVERSCROLL,
        );

        if (nextPosition.x !== proposedPosition.x) {
          nextVx = 0;
        }

        if (nextPosition.y !== proposedPosition.y) {
          nextVy = 0;
        }

        drag.velocityById.set(nodeId, { x: nextVx, y: nextVy });
        positions.set(nodeId, nextPosition);
      }

      drag.pending = positions;
      return positions;
    },
    [floatOffsetForNodeId, liveNodeById, nodeById],
  );

  useEffect(() => {
    if (!graphFloatEnabled) {
      const previous = livePositionsRef.current;
      const activeDrag = dragStateRef.current;
      const activeDragInfluences = activeDrag?.moved
        ? activeDrag.influenceById
        : null;
      const anchored = new Map<string, LivePosition>();

      for (const node of liveNodes) {
        const dragPosition =
          activeDragInfluences?.has(node.id) ? previous.get(node.id) : null;
        anchored.set(
          node.id,
          dragPosition ?? { x: node.x, y: node.y },
        );
      }

      livePositionsRef.current = anchored;
      syncGraphVisuals(anchored);
      return;
    }

    let frame = 0;
    let lastFrame = 0;
    let mounted = true;
    const minFrameMs = 1000 / Math.max(1, graphQuality.maxFps);

    const draw = (time: number) => {
      if (!mounted) {
        return;
      }

      if (lastFrame && time - lastFrame < minFrameMs) {
        frame = window.requestAnimationFrame(draw);
        return;
      }

      lastFrame = time;
      const seconds = time / 1000;
      const previous = livePositionsRef.current;
      const activeDrag = dragStateRef.current;
      const tugPositions =
        activeDrag && activeDrag.moved
          ? computeDragTugPositions(activeDrag, seconds)
          : null;
      const next = new Map<string, LivePosition>();

      for (const node of liveNodes) {
        const dragPosition = tugPositions?.get(node.id);
        const preservedDragPosition =
          activeDrag?.moved && activeDrag.influenceById.has(node.id)
            ? previous.get(node.id)
            : null;

        if (dragPosition) {
          next.set(node.id, dragPosition);
          continue;
        }

        if (preservedDragPosition) {
          next.set(node.id, preservedDragPosition);
          continue;
        }

        const nodeSeed = nodeFloatSeeds.get(node.id);
        const clusterSeed = clusterFloatSeeds.get(node.cluster);

        next.set(
          node.id,
          nodeSeed && clusterSeed
            ? floatingPositionForNode(
                node,
                nodeSeed,
                clusterSeed,
                seconds,
                graphFloatScale,
                draggedPositions.has(node.id) ? GRAPH_NODE_DRAG_OVERSCROLL : 0,
              )
            : { x: node.x, y: node.y },
        );
      }

      livePositionsRef.current = next;
      syncGraphVisuals(next);
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);

    return () => {
      mounted = false;
      window.cancelAnimationFrame(frame);
    };
  }, [
    clusterFloatSeeds,
    computeDragTugPositions,
    draggedPositions,
    graphFloatEnabled,
    graphFloatScale,
    graphQuality.maxFps,
    liveNodes,
    nodeFloatSeeds,
    syncGraphVisuals,
  ]);

  const handleNodePointerDown = useCallback(
    (event: React.PointerEvent<SVGGElement>, node: Node) => {
      // Only respond to primary button / single-finger touch / pen.
      if (event.button !== 0 && event.pointerType === "mouse") {
        return;
      }

      event.stopPropagation();
      const start = screenToGraph(event.clientX, event.clientY);
      if (!start) {
        return;
      }

      event.preventDefault();
      clearTextSelection();
      // Capture the pointer so we keep getting events even if the cursor
      // leaves the node.
      event.currentTarget.setPointerCapture(event.pointerId);
      // Cache an inverse CTM for fast pointer→SVG conversion during drag.
      const ctm = svgRef.current?.getScreenCTM() ?? null;
      const { influenceById, depthById, tugEdges } =
        buildDragInfluenceMap(node.id);
      const startPositions = new Map<string, LivePosition>();
      const startFloatOffsets = new Map<string, LivePosition>();
      const seconds = window.performance.now() / 1000;

      for (const nodeId of influenceById.keys()) {
        const influencedNode = liveNodeById.get(nodeId) ?? nodeById.get(nodeId);

        if (!influencedNode) {
          continue;
        }

        startPositions.set(
          nodeId,
          livePositionsRef.current.get(nodeId) ?? influencedNode,
        );
        startFloatOffsets.set(nodeId, floatOffsetForNodeId(nodeId, seconds));
      }

      dragStateRef.current = {
        nodeId: node.id,
        pointerId: event.pointerId,
        startSvgX: start.x,
        startSvgY: start.y,
        moved: false,
        currentDx: 0,
        currentDy: 0,
        velocityById: new Map(),
        lastTugAt: null,
        pending: null,
        inverseCtm: ctm ? ctm.inverse() : null,
        influenceById,
        depthById,
        tugEdges,
        startPositions,
        startFloatOffsets,
      };
      perfMetricsRef.current.pointer = {
        nodeId: node.id,
        clientX: event.clientX,
        clientY: event.clientY,
        svgX: start.x,
        svgY: start.y,
      };
    },
    [
      buildDragInfluenceMap,
      floatOffsetForNodeId,
      liveNodeById,
      nodeById,
      screenToGraph,
      setGraphDragPerfMode,
    ],
  );

  const handleNodePointerMove = useCallback(
    (event: React.PointerEvent<SVGGElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const current = screenToGraph(event.clientX, event.clientY);
      if (!current) {
        return;
      }
      perfMetricsRef.current.pointer = {
        nodeId: drag.nodeId,
        clientX: event.clientX,
        clientY: event.clientY,
        svgX: current.x,
        svgY: current.y,
      };

      const dx = current.x - drag.startSvgX;
      const dy = current.y - drag.startSvgY;
      drag.currentDx = dx;
      drag.currentDy = dy;

      if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        drag.moved = true;
        setGraphDragPerfMode(true);
        clearTextSelection();
        if (draggingId !== drag.nodeId) {
          setDraggingId(drag.nodeId);
        }
      }

      if (!drag.moved) {
        return;
      }

      event.preventDefault();
      const nextPositions = computeDragTugPositions(
        drag,
        window.performance.now() / 1000,
      );

      // Move the rendered SVG immediately. React state is committed on
      // pointer-up so a render cannot reset the graph to an older frame while
      // the pointer is still moving.
      applyLiveDragPositions(nextPositions);
      drag.pending = nextPositions;
    },
    [
      applyLiveDragPositions,
      computeDragTugPositions,
      draggingId,
      screenToGraph,
      setGraphDragPerfMode,
    ],
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<SVGGElement>): { wasDrag: boolean } => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return { wasDrag: false };
      }

      const wasDrag = drag.moved;
      if (wasDrag) {
        // Commit the final tugged coordinates after the drag ends.
        const seconds = window.performance.now() / 1000;
        const finalPositions =
          drag.pending ?? computeDragTugPositions(drag, seconds);
        const committedPositions = new Map<string, LivePosition>();

        for (const [nodeId, position] of finalPositions) {
          const node = liveNodeById.get(nodeId) ?? nodeById.get(nodeId);

          if (!node) {
            continue;
          }

          committedPositions.set(
            nodeId,
            positionWithoutFloat(
              node,
              position,
              nodeFloatSeeds.get(nodeId),
              clusterFloatSeeds.get(node.cluster),
              seconds,
              graphFloatScale,
              GRAPH_NODE_DRAG_OVERSCROLL,
            ),
          );
        }

        applyLiveDragPositions(finalPositions);
        commitDragPositions(committedPositions);
        drag.pending = null;
      }

      try {
        event.currentTarget.releasePointerCapture(drag.pointerId);
      } catch {
        // pointer capture may already be released — safe to ignore.
      }
      dragStateRef.current = null;
      setGraphDragPerfMode(false);
      perfMetricsRef.current.pointer = null;
      if (draggingId) {
        setDraggingId(null);
      }
      return { wasDrag };
    },
    [
      applyLiveDragPositions,
      clusterFloatSeeds,
      commitDragPositions,
      computeDragTugPositions,
      draggingId,
      graphFloatScale,
      liveNodeById,
      nodeById,
      nodeFloatSeeds,
      setGraphDragPerfMode,
    ],
  );

  const clusterFlows = useMemo(() => {
    const allGraphCandidates = edges
      .map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);

        if (!source || !target) {
          return null;
        }

        return {
          edge,
          source,
          target,
          score: edge.weight,
          key: edgePairKey(edge.source, edge.target),
        };
      })
      .filter((item): item is FlowEdgeCandidate => item !== null);

    const allGraphAdjacency = new Map<string, FlowEdgeCandidate[]>();
    for (const item of allGraphCandidates) {
      const sourceList = allGraphAdjacency.get(item.source.id) ?? [];
      sourceList.push(item);
      allGraphAdjacency.set(item.source.id, sourceList);

      const targetList = allGraphAdjacency.get(item.target.id) ?? [];
      targetList.push(item);
      allGraphAdjacency.set(item.target.id, targetList);
    }

    for (const connected of allGraphAdjacency.values()) {
      connected.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    }

    return CLUSTER_ORDER.flatMap((cluster, index) => {
      const seedEdges = allGraphCandidates
        .map((item) => {
          const touchesCluster =
            item.source.cluster === cluster || item.target.cluster === cluster;

          if (!touchesCluster) {
            return null;
          }

          const isInternal =
            item.source.cluster === cluster && item.target.cluster === cluster;

          return {
            ...item,
            score: item.edge.weight + (isInternal ? 3 : 0),
          };
        })
        .filter((item): item is FlowEdgeCandidate => item !== null)
        .sort((a, b) => b.score - a.score);

      if (seedEdges.length === 0) {
        return [];
      }

      // Seed each flow from its cluster, then let it see nearby graph edges.
      // Without this expanded navigation set, a project can look connected on
      // screen while the pulse only knows the edge it came from, causing a
      // false "dead end" bounce.
      const navigationEdgeKeys = new Set(seedEdges.map((item) => item.key));
      let frontierNodes = new Set<string>();
      for (const item of seedEdges) {
        frontierNodes.add(item.source.id);
        frontierNodes.add(item.target.id);
      }

      for (let depth = 0; depth < 2; depth++) {
        const nextFrontier = new Set<string>();

        for (const item of allGraphCandidates) {
          if (
            navigationEdgeKeys.has(item.key) ||
            (!frontierNodes.has(item.source.id) &&
              !frontierNodes.has(item.target.id))
          ) {
            continue;
          }

          navigationEdgeKeys.add(item.key);
          nextFrontier.add(item.source.id);
          nextFrontier.add(item.target.id);
        }

        frontierNodes = nextFrontier;
        if (frontierNodes.size === 0) {
          break;
        }
      }

      const seedEdgeKeys = new Set(seedEdges.map((item) => item.key));
      const rankedEdges = allGraphCandidates
        .filter((item) => navigationEdgeKeys.has(item.key))
        .map((item) => {
          const isInternal =
            item.source.cluster === cluster && item.target.cluster === cluster;
          const touchesCluster =
            item.source.cluster === cluster || item.target.cluster === cluster;
          const isSeed = seedEdgeKeys.has(item.key);

          return {
            ...item,
            score:
              item.edge.weight +
              (isSeed ? 4 : 0) +
              (isInternal ? 3 : 0) +
              (touchesCluster ? 1.4 : 0),
          };
        })
        .sort((a, b) => b.score - a.score);

      const adjacency = new Map<string, FlowEdgeCandidate[]>();

      for (const item of rankedEdges) {
        const sourceList = adjacency.get(item.source.id) ?? [];
        sourceList.push(item);
        adjacency.set(item.source.id, sourceList);

        const targetList = adjacency.get(item.target.id) ?? [];
        targetList.push(item);
        adjacency.set(item.target.id, targetList);
      }

      for (const connected of adjacency.values()) {
        connected.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
      }

      const unvisitedComponentEdges = new Set(rankedEdges.map((item) => item.key));
      const components: FlowEdgeCandidate[][] = [];

      for (const seedEdge of rankedEdges) {
        if (!unvisitedComponentEdges.has(seedEdge.key)) {
          continue;
        }

        const componentKeys = new Set<string>();
        const nodeQueue = [seedEdge.source.id, seedEdge.target.id];
        const seenNodes = new Set<string>();

        unvisitedComponentEdges.delete(seedEdge.key);
        componentKeys.add(seedEdge.key);

        while (nodeQueue.length > 0) {
          const nodeId = nodeQueue.shift()!;

          if (seenNodes.has(nodeId)) {
            continue;
          }

          seenNodes.add(nodeId);

          for (const item of adjacency.get(nodeId) ?? []) {
            if (!unvisitedComponentEdges.has(item.key)) {
              continue;
            }

            unvisitedComponentEdges.delete(item.key);
            componentKeys.add(item.key);
            nodeQueue.push(item.source.id, item.target.id);
          }
        }

        components.push(rankedEdges.filter((item) => componentKeys.has(item.key)));
      }

      const routes = components
        .map((componentEdges, componentIndex) => {
          const componentKeys = new Set(componentEdges.map((item) => item.key));
          const edgeVisits = new Map(componentEdges.map((item) => [item.key, 0]));
          const reachedNodes = new Set<string>();
          const random = seededRandom(
            hashString(`${cluster}:${componentIndex}:${componentEdges.map((item) => item.key).join("|")}`),
          );
          const componentNodes = new Map<string, Node>();

          for (const item of componentEdges) {
            componentNodes.set(item.source.id, item.source);
            componentNodes.set(item.target.id, item.target);
          }

          const startCandidates = [...componentNodes.values()].sort((a, b) => {
            const degreeA = (adjacency.get(a.id) ?? []).filter((item) =>
              componentKeys.has(item.key),
            ).length;
            const degreeB = (adjacency.get(b.id) ?? []).filter((item) =>
              componentKeys.has(item.key),
            ).length;

            return (
              degreeB - degreeA ||
              (b.cluster === cluster ? 1 : 0) - (a.cluster === cluster ? 1 : 0) ||
              a.id.localeCompare(b.id)
            );
          });
          let current = startCandidates[0];

          if (!current) {
            return [];
          }

          const route: TubeSegment[] = [];
          let previousEdgeKey = "";
          const targetSteps = clamp(componentEdges.length * 10, 24, 96);

          for (let step = 0; step < targetSteps; step++) {
            const connected = (adjacency.get(current.id) ?? []).filter((item) =>
              componentKeys.has(item.key),
            );
            const visibleConnected = allGraphAdjacency.get(current.id) ?? [];

            if (connected.length === 0 && visibleConnected.length === 0) {
              break;
            }

            // Backtrack only at a true visual dead end. Component-local routes
            // keep each flow coherent, but if a node has another visible graph
            // relation outside this component, use that before returning along
            // the edge the wave just came from.
            const forwardOptions =
              connected.length > 1
                ? connected.filter((item) => item.key !== previousEdgeKey)
                : connected;
            const visibleForwardOptions = visibleConnected.filter(
              (item) => item.key !== previousEdgeKey,
            );
            const options =
              forwardOptions.length > 0
                ? forwardOptions
                : visibleForwardOptions.length > 0
                  ? visibleForwardOptions
                  : connected.length > 0
                    ? connected
                    : visibleConnected;
            const minVisits = Math.min(
              ...options.map((item) => edgeVisits.get(item.key) ?? 0),
            );
            const leastVisited = options.filter(
              (item) => (edgeVisits.get(item.key) ?? 0) === minVisits,
            );
            const freshNodeOptions = leastVisited.filter((item) => {
              const other = item.source.id === current.id ? item.target : item.source;
              return !reachedNodes.has(other.id);
            });
            const candidatePool =
              freshNodeOptions.length > 0 ? freshNodeOptions : leastVisited;
            const chosen = pickWeighted(
              candidatePool,
              (item) => {
                const other =
                  item.source.id === current.id ? item.target : item.source;
                const clusterBonus =
                  other.cluster === cluster || current.cluster === cluster ? 3 : 0;
                const freshNodeBonus = reachedNodes.has(other.id) ? 0 : 5;
                const visitPenalty = (edgeVisits.get(item.key) ?? 0) * 4;

                return item.score + clusterBonus + freshNodeBonus - visitPenalty;
              },
              random,
            );

            if (!chosen) {
              break;
            }

            const start = current;
            const end = chosen.source.id === start.id ? chosen.target : chosen.source;

            route.push({
              edge: chosen.edge,
              startId: start.id,
              endId: end.id,
            });

            edgeVisits.set(chosen.key, (edgeVisits.get(chosen.key) ?? 0) + 1);
            reachedNodes.add(start.id);
            reachedNodes.add(end.id);
            previousEdgeKey = chosen.key;
            current = end;
          }

          return route;
        })
        .filter((route) => route.length > 0);

      if (routes.length === 0) {
        return [];
      }

      return [{
        id: cluster,
        cluster,
        delay: index * 0.24,
        routes,
      }];
    });
  }, [edges, nodeById]);
  const renderedFlowCount =
    diagnostics.disableWaves || dragPerfActive ? 0 : clusterFlows.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto max-w-[1280px] select-none"
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[11px] text-zinc-500 xl:justify-start">
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="grid h-4 w-4 place-items-center rounded-md border border-accent/40 bg-accent/10 text-accent">
            <MousePointer2 size={9} />
          </span>
          Hover a node
        </span>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="grid h-4 w-4 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-300">
            <Pin size={9} />
          </span>
          Click to pin
        </span>
        {EDGE_LEGEND.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-2 whitespace-nowrap text-zinc-400"
          >
            <span
              className="h-1.5 w-6 rounded-full shadow-[0_0_12px_currentColor]"
              style={{
                backgroundColor: item.color,
                color: item.color,
              }}
            />
            {item.label}
          </span>
        ))}
      </div>

      <div
        className={[
          diagnostics.disableGraphGlass
            || dragPerfActive
            ? "relative overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/45"
            : "glass relative overflow-hidden",
          "p-3 sm:p-5 md:p-6",
        ].join(" ")}
      >
        {!diagnostics.disableGraphGlass && !dragPerfActive && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(125,211,252,0.06),transparent_32%)]" />
        )}
        <div
          className={[
            "grid-overlay pointer-events-none absolute inset-0",
            diagnostics.disableGraphGlass || dragPerfActive ? "opacity-25" : "opacity-50",
          ].join(" ")}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.03] to-transparent" />

        <motion.div
          ref={graphFrameRef}
          className="relative isolate aspect-[16/10] w-full"
          onMouseLeave={() => setHoveredId(null)}
          initial={false}
          style={{
            contain: "layout paint style",
            overscrollBehavior: "contain",
            transform: "translateZ(0)",
          }}
        >
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-lg border border-white/10 bg-ink-950/70 p-1 font-mono text-[10px] text-zinc-300 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md sm:right-3 sm:top-3">
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-accent/40 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => zoomGraph(-1)}
            >
              <ZoomOut size={14} aria-hidden="true" />
            </button>
            <span className="min-w-10 text-center text-[10px] tabular-nums text-zinc-400">
              {Math.round(graphViewport.zoom * 100)}%
            </span>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-accent/40 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              aria-label="Reset zoom"
              title="Reset zoom"
              onClick={resetGraphZoom}
            >
              <RotateCcw size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-accent/40 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => zoomGraph(1)}
            >
              <ZoomIn size={14} aria-hidden="true" />
            </button>
          </div>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            aria-label="Project graph"
            role="img"
            onPointerDown={handleGraphPointerDown}
            onPointerMove={handleGraphPointerMove}
            onPointerUp={finishGraphPan}
            onPointerCancel={finishGraphPan}
            style={{
              cursor: graphPanning ? "grabbing" : "grab",
              touchAction: draggingId || graphPanning ? "none" : "pan-y",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            <defs>
              <filter
                id="project-edge-glow"
                x={-GRAPH_FILTER_MARGIN}
                y={-GRAPH_FILTER_MARGIN}
                width={VIEWBOX_W + GRAPH_FILTER_MARGIN * 2}
                height={VIEWBOX_H + GRAPH_FILTER_MARGIN * 2}
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation={graphQuality.edgeGlowBlur} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter
                id="project-signal-glow"
                x={-GRAPH_FILTER_MARGIN}
                y={-GRAPH_FILTER_MARGIN}
                width={VIEWBOX_W + GRAPH_FILTER_MARGIN * 2}
                height={VIEWBOX_H + GRAPH_FILTER_MARGIN * 2}
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation={graphQuality.signalGlowBlur} result="signalBlur" />
                <feMerge>
                  <feMergeNode in="signalBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter
                id="project-node-glow"
                x="-90%"
                y="-90%"
                width="280%"
                height="280%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation={graphQuality.nodeGlowBlur} result="nodeBlur" />
                <feMerge>
                  <feMergeNode in="nodeBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect
              x={0}
              y={0}
              width={VIEWBOX_W}
              height={VIEWBOX_H}
              fill="transparent"
              pointerEvents="all"
              aria-hidden="true"
            />
            <g transform={graphViewportTransform(graphViewport)}>
            {edges.map((edge) => {
              const source =
                livePositionsRef.current.get(edge.source) ??
                liveNodeById.get(edge.source)!;
              const target =
                livePositionsRef.current.get(edge.target) ??
                liveNodeById.get(edge.target)!;
              const endpoints = getEdgeEndpoints(source, target);
              const highlight = isEdgeHighlighted(edge);
              const edgeId = edgePairKey(edge.source, edge.target);
              const visualWeight = Math.max(edge.weight, 1.35);
              const idleWidth = Math.min(1.08 + visualWeight * 0.22, 1.9);
              const activeWidth = Math.min(1.35 + visualWeight * 0.34, 2.5);
              const idleOpacity = 0.56;
              const activeOpacity = highlight ? 0.74 : 0.12;
              const glowOpacity = (activeId
                ? highlight
                  ? 0.36
                  : 0.04
                : 0.34) * graphQuality.glowOpacityScale;
              const glowStrokeWidth = (activeId
                ? (highlight ? activeWidth + 5.5 : 2.1)
                : idleWidth + 4.8) * graphQuality.glowStrokeScale;
              const softOpacity =
                (activeId ? (highlight ? 0.32 : 0.035) : 0.25) *
                graphQuality.glowOpacityScale;
              const softStrokeWidth = (activeId
                ? (highlight ? activeWidth + 2.7 : 1.2)
                : idleWidth + 2.4) * graphQuality.glowStrokeScale;
              const coreOpacity = activeId ? activeOpacity : idleOpacity;
              const coreStrokeWidth = activeId
                ? (highlight ? activeWidth : 0.55)
                : idleWidth;

              return (
                <g key={edgeId} pointerEvents="none">
                  <motion.line
                    initial={false}
                    ref={(element) => setEdgeLineRef(edgeId, "glow", element)}
                    x1={endpoints.x1}
                    y1={endpoints.y1}
                    x2={endpoints.x2}
                    y2={endpoints.y2}
                    stroke={edge.color}
                    opacity={glowOpacity}
                    strokeWidth={glowStrokeWidth}
                    strokeLinecap="round"
                    filter={graphQuality.useFilteredEdgeGlow ? "url(#project-edge-glow)" : undefined}
                    animate={{
                      opacity: glowOpacity,
                      strokeWidth: glowStrokeWidth,
                    }}
                    transition={{
                      opacity: { duration: graphMotionReduced ? 0.01 : 0.22, ease: "easeOut" },
                      strokeWidth: {
                        type: "spring",
                        stiffness: 240,
                        damping: graphMotionReduced ? 1000 : 28,
                      },
                    }}
                  />
                  <motion.line
                    initial={false}
                    ref={(element) => setEdgeLineRef(edgeId, "soft", element)}
                    x1={endpoints.x1}
                    y1={endpoints.y1}
                    x2={endpoints.x2}
                    y2={endpoints.y2}
                    stroke={edge.color}
                    opacity={softOpacity}
                    strokeWidth={softStrokeWidth}
                    strokeLinecap="round"
                    animate={{
                      opacity: softOpacity,
                      strokeWidth: softStrokeWidth,
                    }}
                    transition={{
                      opacity: { duration: graphMotionReduced ? 0.01 : 0.22, ease: "easeOut" },
                      strokeWidth: {
                        type: "spring",
                        stiffness: 240,
                        damping: graphMotionReduced ? 1000 : 28,
                      },
                    }}
                  />
                  <motion.line
                    initial={false}
                    ref={(element) => setEdgeLineRef(edgeId, "core", element)}
                    x1={endpoints.x1}
                    y1={endpoints.y1}
                    x2={endpoints.x2}
                    y2={endpoints.y2}
                    stroke={edge.color}
                    opacity={coreOpacity}
                    strokeWidth={coreStrokeWidth}
                    strokeLinecap="round"
                    animate={{
                      opacity: coreOpacity,
                      strokeWidth: coreStrokeWidth,
                    }}
                    transition={{
                      opacity: { duration: graphMotionReduced ? 0.01 : 0.22, ease: "easeOut" },
                      strokeWidth: {
                        type: "spring",
                        stiffness: 240,
                        damping: graphMotionReduced ? 1000 : 28,
                      },
                    }}
                  />
                </g>
              );
            })}
            {!diagnostics.disableWaves && !dragPerfActive && clusterFlows.map((flow) => {
              const hasHighlightedSegment = flow.routes.some((route) =>
                route.some((segment) => isEdgeHighlighted(segment.edge)),
              );
              const opacityPeak = activeId && !hasHighlightedSegment ? 0.52 : 1;

              return (
                <GraphTubeFlow
                  key={flow.id}
                  flow={flow}
                  opacityPeak={opacityPeak}
                  shouldReduceMotion={prefersReducedMotion}
                  onNodeArrive={handleTubeArrival}
                  nodeAccentById={nodeAccentById}
                  livePositionsRef={livePositionsRef}
                  waveReservationsRef={waveReservationsRef}
                  segmentOptionsByStartId={waveSegmentOptionsByStartId}
                  graphQuality={graphQuality}
                  onFrameMetric={recordGraphFrameMetric}
                />
              );
            })}
            {liveNodes.map((node) => {
              const Icon = node.project.icon;
              const focused = activeId === node.id;
              const arrivalPing = arrivalPingById.get(node.id);
              const dim = !isHighlighted(node.id);
              const labelLines = splitLabel(node.project.title);
              const accentColor =
                activeAccentById.get(node.id) ??
                nodeAccentById.get(node.id) ??
                "#7dd3fc";
              const pingColor = arrivalPing?.color ?? accentColor;
              const glowColor = accentColor;
              const glowActive = focused;
              const safeNodeId = toSvgId(node.id);
              const pingClipId = `project-node-ping-clip-${safeNodeId}`;
              const isDraggingThis = draggingId === node.id;
              const receiveActive = Boolean(arrivalPing) && !graphMotionPaused;
              const badgeFillOpacity = glowActive ? 0.22 : 1;
              const badgeStroke = glowActive
                ? glowColor
                : dim
                  ? "rgba(255,255,255,0.08)"
                  : accentColor;
              const badgeStrokeOpacity = glowActive ? 0.88 : dim ? 1 : 0.42;
              const badgeStrokeWidth = glowActive ? 2 : 1;
              const visualPosition =
                livePositionsRef.current.get(node.id) ?? node;

              return (
                <motion.g
                  key={node.id}
                  initial={false}
                  ref={(element) => setNodeVisualRef(node.id, element)}
                  data-project-graph-node="true"
                  role="button"
                  tabIndex={0}
                  transform={`translate(${visualPosition.x}, ${visualPosition.y})`}
                  animate={{
                    opacity: dim ? 0.32 : 1,
                  }}
                  transition={{
                    opacity: {
                      duration: graphMotionReduced ? 0.01 : 0.2,
                      ease: "easeOut",
                    },
                  }}
                  style={{
                    cursor: isDraggingThis ? "grabbing" : "grab",
                    outline: "none",
                    touchAction: "none",
                    willChange: isDraggingThis ? "transform" : "auto",
                  }}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={(event) => {
                    const { wasDrag } = finishDrag(event);
                    if (!wasDrag) {
                      setPinnedId((current) =>
                        current === node.id ? null : node.id,
                      );
                    }
                  }}
                  onPointerCancel={(event) => {
                    finishDrag(event);
                  }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => {
                    if (!dragStateRef.current) {
                      setHoveredId((current) =>
                        current === node.id ? null : current,
                      );
                    }
                  }}
                  onFocus={() => setHoveredId(node.id)}
                  onBlur={() => setHoveredId(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setPinnedId((current) =>
                        current === node.id ? null : node.id,
                      );
                    }
                  }}
                  aria-pressed={pinnedId === node.id}
                  aria-label={`Preview ${node.id}`}
                >
                  {/*
                    All node visuals live at local 0,0. The parent motion.g
                    is the pointer-captured element and the only translated
                    group, so the drag target and rendered badge are identical.
                  */}
                  <g>
                    <defs>
                      <clipPath id={pingClipId}>
                        <circle cx={0} cy={0} r={NODE_RADIUS - 0.6} />
                      </clipPath>
                    </defs>
                    <circle
                      cx={0}
                      cy={0}
                      r={NODE_RADIUS + 14}
                      fill="transparent"
                      pointerEvents="all"
                    />
                    <rect
                      x={-node.labelWidth / 2 - 8}
                      y={NODE_RADIUS + 8}
                      width={node.labelWidth + 16}
                      height={labelLines.length > 1 ? 46 : 30}
                      rx={6}
                      fill="transparent"
                      pointerEvents="all"
                    />
                    <motion.circle
                      aria-hidden="true"
                      cx={0}
                      cy={0}
                      r={NODE_RADIUS + 18}
                      fill={glowColor}
                      filter={graphQuality.useFilteredEdgeGlow ? "url(#project-node-glow)" : undefined}
                      initial={false}
                      animate={{
                        opacity: glowActive ? 0.16 * graphQuality.glowOpacityScale : 0,
                      }}
                      transition={{
                        duration: graphMotionReduced ? 0.01 : 0.55,
                        ease: BLOOM_EASE_EXPO_OUT,
                      }}
                    />
                    <motion.circle
                      aria-hidden="true"
                      cx={0}
                      cy={0}
                      r={NODE_RADIUS + 8}
                      fill={glowColor}
                      initial={false}
                      animate={{
                        opacity: glowActive ? 0.08 * graphQuality.glowOpacityScale : 0,
                      }}
                      transition={{
                        duration: graphMotionReduced ? 0.01 : 0.55,
                        ease: BLOOM_EASE_EXPO_OUT,
                      }}
                    />

                    <motion.circle
                      cx={0}
                      cy={0}
                      r={NODE_RADIUS}
                      fill={glowActive ? glowColor : "rgba(255,255,255,0.045)"}
                      initial={false}
                      animate={{
                        r: receiveActive
                          ? [
                              NODE_RADIUS,
                              NODE_RADIUS + BADGE_POP_RADIUS * 0.58,
                              NODE_RADIUS + BADGE_POP_RADIUS,
                              NODE_RADIUS + BADGE_POP_RADIUS * 0.28,
                              NODE_RADIUS,
                            ]
                          : NODE_RADIUS,
                        fillOpacity: receiveActive
                          ? [
                              badgeFillOpacity,
                              Math.max(0.22, badgeFillOpacity * 0.92),
                              Math.max(0.26, badgeFillOpacity * 0.98),
                              badgeFillOpacity,
                            ]
                          : badgeFillOpacity,
                        stroke: badgeStroke,
                        strokeOpacity: receiveActive
                          ? [
                              badgeStrokeOpacity,
                              Math.max(0.72, badgeStrokeOpacity),
                              Math.max(0.82, badgeStrokeOpacity),
                              badgeStrokeOpacity,
                            ]
                          : badgeStrokeOpacity,
                        strokeWidth: receiveActive
                          ? [
                              badgeStrokeWidth,
                              badgeStrokeWidth + BADGE_POP_STROKE * 0.44,
                              badgeStrokeWidth + BADGE_POP_STROKE,
                              badgeStrokeWidth + BADGE_POP_STROKE * 0.22,
                              badgeStrokeWidth,
                            ]
                          : badgeStrokeWidth,
                      }}
                      transition={{
                        duration: graphMotionReduced ? 0.01 : 1.15,
                        ease: BLOOM_EASE_SLOW_IN_OUT,
                        r: receiveActive
                          ? {
                              duration: BADGE_PING_DURATION,
                              times: BADGE_POP_TIMES,
                              ease: "linear",
                            }
                          : undefined,
                        fillOpacity: receiveActive
                          ? {
                              duration: BADGE_PING_DURATION,
                              times: [0, 0.32, 0.62, 1],
                              ease: "linear",
                            }
                          : undefined,
                        strokeOpacity: receiveActive
                          ? {
                              duration: BADGE_PING_DURATION,
                              times: [0, 0.3, 0.62, 1],
                              ease: "linear",
                            }
                          : undefined,
                        strokeWidth: receiveActive
                          ? {
                              duration: BADGE_PING_DURATION,
                              times: BADGE_POP_TIMES,
                              ease: "linear",
                            }
                          : undefined,
                      }}
                    />
                    {arrivalPing && (
                      <BadgePing
                        key={`${node.id}-ping-${arrivalPing.token}`}
                        color={pingColor}
                        clipPathId={pingClipId}
                        shouldReduceMotion={prefersReducedMotion}
                      />
                    )}
                    <Icon
                      x={-8.75}
                      y={-8.75}
                      width={17.5}
                      height={17.5}
                      color={focused ? accentColor : "#d4d4d8"}
                      strokeWidth={2}
                      aria-hidden="true"
                      pointerEvents="none"
                    />
                    <text
                      x={0}
                      y={NODE_RADIUS + 20}
                      textAnchor="middle"
                      className={[
                        "pointer-events-none fill-current font-mono drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)] transition-colors duration-300",
                        focused
                          ? "text-zinc-100"
                          : dim
                            ? "text-zinc-600"
                            : "text-zinc-400",
                      ].join(" ")}
                      fontSize={12}
                      fontWeight={focused ? 700 : 500}
                    >
                      {labelLines.map((line, lineIndex) => (
                        <tspan
                          key={line}
                          x={0}
                          dy={lineIndex === 0 ? 0 : 14}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                </motion.g>
              );
            })}
            </g>
          </svg>
        </motion.div>
        {graphDebugEnabled && (
          <GraphPerformanceOverlay
            profile={performanceProfile}
            debugState={debugState}
            snapshot={debugSnapshot}
            nodeCount={nodes.length}
            edgeCount={edges.length}
            flowCount={renderedFlowCount}
            pingCount={arrivalPingById.size}
            diagnostics={diagnostics}
            dragPerfActive={dragPerfActive}
          />
        )}
      </div>

      <div className="mt-5" aria-live="polite">
        <PreviewCard project={previewProject} mode={previewMode} />
      </div>
    </motion.div>
  );
}

function GraphPerformanceOverlay({
  profile,
  debugState,
  snapshot,
  nodeCount,
  edgeCount,
  flowCount,
  pingCount,
  diagnostics,
  dragPerfActive,
}: {
  profile: AdaptivePerformanceProfile;
  debugState: ReturnType<typeof usePerformanceDebugState>;
  snapshot: GraphDebugSnapshot;
  nodeCount: number;
  edgeCount: number;
  flowCount: number;
  pingCount: number;
  diagnostics: ReturnType<typeof usePerformanceDiagnosticFlags>;
  dragPerfActive: boolean;
}) {
  const animatedElementCount = edgeCount * 3 + flowCount * 3 + pingCount * 3;
  const pointer = snapshot.pointer;

  return (
    <div
      data-performance-debug="project-graph"
      className="pointer-events-none absolute right-4 top-4 z-10 w-[260px] rounded-lg border border-accent/25 bg-ink-950/85 p-3 font-mono text-[10px] leading-relaxed text-zinc-300 shadow-[0_0_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
    >
      <div className="mb-1 flex items-center justify-between text-accent">
        <span>Perf Debug</span>
        <span>
          {profile.quality}
          {profile.qualitySource !== "auto" ? "*" : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>DPR</span>
        <span className="text-right">{profile.dpr.toFixed(2)}</span>
        <span>Viewport</span>
        <span className="text-right">
          {profile.viewportWidth}x{profile.viewportHeight}
        </span>
        <span>Pixels</span>
        <span className="text-right">{(profile.pixelArea / 1_000_000).toFixed(1)}M</span>
        <span>FPS</span>
        <span className="text-right">{snapshot.fps.toFixed(0)}</span>
        <span>Frame</span>
        <span className="text-right">{snapshot.frameMs.toFixed(1)}ms</span>
        <span>P95 / max</span>
        <span className="text-right">
          {snapshot.p95FrameMs.toFixed(1)} / {snapshot.maxFrameMs.toFixed(1)}ms
        </span>
        <span>Jank &gt;24ms</span>
        <span className="text-right">{snapshot.jankPercent.toFixed(0)}%</span>
        <span>Wave work</span>
        <span className="text-right">{snapshot.waveFrameMs.toFixed(2)}ms</span>
        <span>Path recalc</span>
        <span className="text-right">{snapshot.relationCalcMs.toFixed(2)}ms</span>
        <span>Graph rect</span>
        <span className="text-right">
          {snapshot.graphRect
            ? `${snapshot.graphRect.width.toFixed(0)}x${snapshot.graphRect.height.toFixed(0)}`
            : "-"}
        </span>
        <span>VV scale</span>
        <span className="text-right">{snapshot.visualViewportScale.toFixed(2)}</span>
        <span>Nodes / edges</span>
        <span className="text-right">
          {nodeCount} / {edgeCount}
        </span>
        <span>Animated elems</span>
        <span className="text-right">{animatedElementCount}</span>
        <span>Flows / pings</span>
        <span className="text-right">
          {flowCount} / {pingCount}
        </span>
        <span>Debug source</span>
        <span className="text-right">{debugState.source}</span>
        <span>Quality source</span>
        <span className="text-right">{profile.qualitySource}</span>
        <span>Diag flags</span>
        <span className="text-right">
          {[
            diagnostics.staticMode ? "static" : "",
            dragPerfActive ? "drag-perf" : "",
            diagnostics.disableBackground ? "bg-off" : "",
            diagnostics.disableGraphFilters ? "flat" : "",
            diagnostics.disableWaves ? "waves-off" : "",
            diagnostics.disableGraphGlass ? "glass-off" : "",
          ].filter(Boolean).join(", ") || "none"}
        </span>
      </div>
      {pointer && (
        <div className="mt-2 border-t border-white/10 pt-2 text-zinc-400">
          <div>{pointer.nodeId}</div>
          <div>
            client {pointer.clientX.toFixed(0)}, {pointer.clientY.toFixed(0)}
          </div>
          <div>
            graph {pointer.svgX.toFixed(1)}, {pointer.svgY.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
}

const svgAttrCache = new WeakMap<SVGElement, Map<string, string>>();

function formatSvgAttr(name: string, value: number | string) {
  if (typeof value !== "number") {
    return value;
  }

  if (name === "opacity" || name === "stop-opacity") {
    return value.toFixed(3);
  }

  return value.toFixed(2);
}

function setSvgAttr(
  element: SVGElement | null,
  name: string,
  value: number | string,
) {
  if (!element) {
    return;
  }

  const nextValue = formatSvgAttr(name, value);
  let cache = svgAttrCache.get(element);

  if (!cache) {
    cache = new Map();
    svgAttrCache.set(element, cache);
  }

  if (cache.get(name) === nextValue) {
    return;
  }

  cache.set(name, nextValue);
  element.setAttribute(name, nextValue);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function waveSegmentKey(segment: Pick<TubeSegment, "startId" | "endId">) {
  return `${segment.startId}->${segment.endId}`;
}

function cleanWaveReservations(
  reservations: Map<string, WaveNodeReservation>,
  time: number,
) {
  for (const [nodeId, reservation] of reservations) {
    if (time - reservation.updatedAt > WAVE_RESERVATION_STALE_MS) {
      reservations.delete(nodeId);
    }
  }
}

function releaseWaveReservation(
  reservations: Map<string, WaveNodeReservation>,
  flowId: string,
) {
  for (const [nodeId, reservation] of reservations) {
    if (reservation.flowId === flowId) {
      reservations.delete(nodeId);
    }
  }
}

function waveTargetIsReserved(
  reservations: Map<string, WaveNodeReservation>,
  nodeId: string,
  flowId: string,
) {
  const reservation = reservations.get(nodeId);
  return Boolean(reservation && reservation.flowId !== flowId);
}

function reserveWaveTarget(
  reservations: Map<string, WaveNodeReservation>,
  flowId: string,
  segment: TubeSegment,
  time: number,
) {
  releaseWaveReservation(reservations, flowId);
  reservations.set(segment.endId, {
    flowId,
    segmentKey: waveSegmentKey(segment),
    updatedAt: time,
  });
}

function chooseWaveSegment(
  flowId: string,
  plannedSegment: TubeSegment,
  startId: string,
  previousNodeId: string | null,
  segmentOptionsByStartId: Map<string, TubeSegment[]>,
  reservations: Map<string, WaveNodeReservation>,
) {
  const options = segmentOptionsByStartId.get(startId) ?? [];

  if (options.length === 0) {
    return plannedSegment;
  }

  const plannedFromStart =
    plannedSegment.startId === startId
      ? plannedSegment
      : options.find((option) => option.endId === plannedSegment.endId);
  const plannedBlocked = plannedFromStart
    ? waveTargetIsReserved(reservations, plannedFromStart.endId, flowId)
    : true;

  if (plannedFromStart && !plannedBlocked) {
    return plannedFromStart;
  }

  const unreserved = options.filter(
    (option) => !waveTargetIsReserved(reservations, option.endId, flowId),
  );
  const candidatePool = unreserved.length > 0 ? unreserved : options;
  const forwardOptions =
    previousNodeId && candidatePool.length > 1
      ? candidatePool.filter((option) => option.endId !== previousNodeId)
      : candidatePool;
  const finalPool = forwardOptions.length > 0 ? forwardOptions : candidatePool;

  return finalPool[0] ?? plannedFromStart ?? plannedSegment;
}

// Smoothstep: cubic ease that yields a soft, organic edge. Used for the
// envelope of the pressure wave near segment boundaries.
function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function smootherstep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Liquid profile: compact rounded head, softer tail, and a faint residual wake.
// The asymmetry makes the pulse feel like pressure moving through a vein rather
// than a symmetric laser dot.
function waveProfile(
  position: number,
  center: number,
  visibleLineLength: number,
) {
  const delta = (position - center) * visibleLineLength;
  const dist = Math.abs(delta);

  if (dist <= WAVE_CORE_LENGTH) {
    return 1;
  }

  if (delta > 0) {
    if (dist >= WAVE_FRONT_LENGTH) {
      return 0;
    }

    const t =
      (dist - WAVE_CORE_LENGTH) /
      Math.max(WAVE_FRONT_LENGTH - WAVE_CORE_LENGTH, 1e-4);
    return 1 - smootherstep(t);
  }

  if (dist < WAVE_TAIL_LENGTH) {
    const t =
      (dist - WAVE_CORE_LENGTH) /
      Math.max(WAVE_TAIL_LENGTH - WAVE_CORE_LENGTH, 1e-4);
    return WAVE_WAKE_OPACITY + (1 - WAVE_WAKE_OPACITY) * (1 - smootherstep(t));
  }

  if (dist < WAVE_WAKE_LENGTH) {
    const t =
      (dist - WAVE_TAIL_LENGTH) /
      Math.max(WAVE_WAKE_LENGTH - WAVE_TAIL_LENGTH, 1e-4);
    return WAVE_WAKE_OPACITY * (1 - smootherstep(t));
  }

  return 0;
}

function setStop(
  element: SVGStopElement | null,
  opacity: number,
  color: string,
) {
  setSvgAttr(element, "stop-opacity", clamp01(opacity));
  setSvgAttr(element, "stop-color", color);
}

// One reusable active wave per cluster. The route can be long, but only one
// relation is visible at a time, so we update these refs in place instead of
// rendering hidden SVG nodes for every future segment.
type TubeFlowRefs = {
  tube: SVGLineElement | null;
  channel: SVGLineElement | null;
  gradient: SVGLinearGradientElement | null;
  stops: (SVGStopElement | null)[];
};

type TubeFlowTiming = {
  segmentDurations: number[];
  slotDurations: number[];
  routeDurations: number[];
  traversalDuration: number;
};

// Fixed offsets used for the gradient stops. Long relation lines need a denser
// grid so the compact wave never falls between samples and appears to flicker.
// Attribute caching below keeps the extra stops from rewriting unchanged values.
const STOP_OFFSETS = Array.from({ length: 51 }, (_, index) => index / 50);

function GraphTubeFlow({
  flow,
  opacityPeak,
  shouldReduceMotion,
  onNodeArrive,
  nodeAccentById,
  livePositionsRef,
  waveReservationsRef,
  segmentOptionsByStartId,
  graphQuality,
  onFrameMetric,
}: {
  flow: ClusterFlow;
  opacityPeak: number;
  shouldReduceMotion: boolean | null;
  onNodeArrive: (arrival: NodeArrival) => void;
  nodeAccentById: Map<string, string>;
  livePositionsRef: React.MutableRefObject<Map<string, LivePosition>>;
  waveReservationsRef: React.MutableRefObject<Map<string, WaveNodeReservation>>;
  segmentOptionsByStartId: Map<string, TubeSegment[]>;
  graphQuality: AdaptivePerformanceProfile["graph"];
  onFrameMetric: (metric: GraphPerfMetric) => void;
}) {
  const reduced = Boolean(shouldReduceMotion);
  const segmentDuration = reduced
    ? WAVE_SEGMENT_DURATION_REDUCED
    : WAVE_SEGMENT_DURATION;
  const nodeHoldDuration = reduced ? BADGE_PING_DURATION_REDUCED : BADGE_PING_DURATION;
  const intensity = reduced ? 0.55 : 1;
  const gradientId = `project-tube-pressure-${flow.id}`;
  const routes = flow.routes;
  const segments = useMemo(() => routes.flat(), [routes]);
  const routeStartByIndex = useMemo(() => {
    let nextStart = 0;

    return routes.map((route) => {
      const start = nextStart;
      nextStart += route.length;
      return start;
    });
  }, [routes]);
  const flowRefs = useRef<TubeFlowRefs>({
    tube: null,
    channel: null,
    gradient: null,
    stops: Array(STOP_OFFSETS.length).fill(null),
  });
  const timingRef = useRef<TubeFlowTiming | null>(null);

  // Track the latest opacity peak / intensity so we can pick them up inside
  // the rAF loop without restarting it.
  const opacityPeakRef = useRef(opacityPeak);
  const intensityRef = useRef(intensity);
  const onArriveRef = useRef(onNodeArrive);
  const nodeAccentByIdRef = useRef(nodeAccentById);
  const frameMetricRef = useRef(onFrameMetric);
  opacityPeakRef.current = opacityPeak;
  intensityRef.current = intensity;
  onArriveRef.current = onNodeArrive;
  nodeAccentByIdRef.current = nodeAccentById;
  frameMetricRef.current = onFrameMetric;

  useEffect(() => {
    let frame = 0;
    let mounted = true;
    let lastArrivalKey = "";
    let phaseOffsetSeconds: number | null = null;
    let dynamicSegmentState: WaveDynamicSegmentState | null = null;
    timingRef.current = null;

    const draw = (time: number) => {
      if (!mounted) {
        return;
      }

      if (segments.length === 0 || routes.length === 0) {
        return;
      }

      const frameStart = window.performance.now();
      const peakOpacity = opacityPeakRef.current;
      const waveIntensity = intensityRef.current;
      const elapsedSeconds = Math.max(0, time / 1000 - flow.delay);
      const positions = livePositionsRef.current;
      let timing = timingRef.current;
      let relationCalcMs = 0;

      if (!timing) {
        const relationCalcStart = window.performance.now();
        const segmentDurations = segments.map((segment) => {
          const start = positions.get(segment.startId);
          const end = positions.get(segment.endId);

          return start && end
            ? waveSegmentDurationFor(start, end, reduced)
            : segmentDuration;
        });
        const slotDurations = segmentDurations.map(
          (duration) => duration + nodeHoldDuration,
        );
        const routeDurations = routes.map((route, routeIndex) => {
          const routeStart = routeStartByIndex[routeIndex] ?? 0;

          return route.reduce(
            (sum, _segment, segmentIndex) =>
              sum + (slotDurations[routeStart + segmentIndex] ?? segmentDuration),
            0,
          );
        });
        const traversalDuration = Math.max(
          0.01,
          routeDurations.reduce((sum, duration) => sum + duration, 0),
        );

        timing = {
          segmentDurations,
          slotDurations,
          routeDurations,
          traversalDuration,
        };
        timingRef.current = timing;
        if (phaseOffsetSeconds === null) {
          const startIndex = Math.floor(Math.random() * segments.length);
          phaseOffsetSeconds = slotDurations
            .slice(0, startIndex)
            .reduce((sum, duration) => sum + duration, 0);
        }
        relationCalcMs = window.performance.now() - relationCalcStart;
      }

      const {
        segmentDurations,
        slotDurations,
        routeDurations,
        traversalDuration,
      } = timing;
      // ─── Route progression ───────────────────────────────────────────────
      // The wave travels one relation, dwells on the reached badge for the
      // ping duration, then moves to the next explicit route segment. The route
      // builder already inserts real backtrack segments only at dead ends, so
      // the renderer should not globally reverse the whole path.
      const cycleDuration = traversalDuration;
      const offsetElapsed = elapsedSeconds + (phaseOffsetSeconds ?? 0);
      const cycleNumber = Math.floor(offsetElapsed / cycleDuration);
      const cyclePos = positiveModulo(offsetElapsed, cycleDuration);
      const traversalPos = cyclePos;
      let routeIndex = 0;
      let routePos = traversalPos;

      for (let index = 0; index < routes.length; index++) {
        const duration = routeDurations[index] ?? segmentDuration;
        if (routePos < duration || index === routes.length - 1) {
          routeIndex = index;
          break;
        }
        routePos -= duration;
      }

      const activeRoute = routes[routeIndex];
      const routeStartIndex = routeStartByIndex[routeIndex] ?? 0;
      let slotIndex = activeRoute.length - 1;
      let slotElapsed = routePos;

      for (let index = 0; index < activeRoute.length; index++) {
        const duration = slotDurations[routeStartIndex + index] ?? segmentDuration;

        if (slotElapsed < duration || index === activeRoute.length - 1) {
          slotIndex = index;
          break;
        }

        slotElapsed -= duration;
      }

      const activeIndex = routeStartIndex + slotIndex;
      const activeSegmentDuration = segmentDurations[activeIndex] ?? segmentDuration;
      const isNodeHold = slotElapsed >= activeSegmentDuration;
      const linearLocalT = clamp01(slotElapsed / activeSegmentDuration);
      const easedLocalT = WAVE_BOUNCE_EASE > 0
        ? smoothstep(linearLocalT) * WAVE_BOUNCE_EASE +
          linearLocalT * (1 - WAVE_BOUNCE_EASE)
        : linearLocalT;
      const localProgress = isNodeHold ? 1 : easedLocalT;
      const plannedSegment = segments[activeIndex];

      if (!plannedSegment) {
        frameMetricRef.current({
          frameMs: window.performance.now() - frameStart,
          relationCalcMs,
        });
        frame = window.requestAnimationFrame(draw);
        return;
      }

      cleanWaveReservations(waveReservationsRef.current, time);

      const slotKey = `${cycleNumber}:${activeIndex}`;
      if (!dynamicSegmentState || dynamicSegmentState.slotKey !== slotKey) {
        const previousDynamicSegment = dynamicSegmentState?.segment ?? null;
        const previousRouteSegment = activeRoute[slotIndex - 1] ?? null;
        const isSequentialSlot = Boolean(
          previousDynamicSegment &&
            dynamicSegmentState?.cycleNumber === cycleNumber &&
            dynamicSegmentState.activeIndex + 1 === activeIndex,
        );
        const startId = isSequentialSlot
          ? previousDynamicSegment!.endId
          : plannedSegment.startId;
        const previousNodeId = isSequentialSlot
          ? previousDynamicSegment!.startId
          : previousRouteSegment?.endId === plannedSegment.startId
            ? previousRouteSegment.startId
            : null;
        const segment = chooseWaveSegment(
          flow.id,
          plannedSegment,
          startId,
          previousNodeId,
          segmentOptionsByStartId,
          waveReservationsRef.current,
        );

        dynamicSegmentState = {
          slotKey,
          cycleNumber,
          activeIndex,
          segment,
        };
      }

      const seg = dynamicSegmentState.segment;
      reserveWaveTarget(waveReservationsRef.current, flow.id, seg, time);

      // Arrival ping fires at the explicit segment destination. Backtracking
      // segments are stored with reversed start/end ids, so they naturally ping
      // the node the wave really returns to.
      const arrivalThreshold = isNodeHold;
      const arrivalNodeId = seg.endId;
      const arrivalKey = `${cycleNumber}-${activeIndex}-${waveSegmentKey(seg)}`;
      if (arrivalThreshold && arrivalKey !== lastArrivalKey) {
        lastArrivalKey = arrivalKey;
        onArriveRef.current({
          nodeId: arrivalNodeId,
          color: nodeAccentByIdRef.current.get(arrivalNodeId) ?? seg.edge.color,
        });
      }

      const refs = flowRefs.current;
      const startNode = positions.get(seg.startId);
      const endNode = positions.get(seg.endId);

      if (!startNode || !endNode) {
        releaseWaveReservation(waveReservationsRef.current, flow.id);
        for (const stop of refs.stops) {
          setSvgAttr(stop, "stop-opacity", 0);
        }
        setSvgAttr(refs.tube, "opacity", 0);
        setSvgAttr(refs.channel, "opacity", 0);
        frameMetricRef.current({
          frameMs: window.performance.now() - frameStart,
          relationCalcMs,
        });
        frame = window.requestAnimationFrame(draw);
        return;
      }

      const endpoints = getEdgeEndpoints(startNode, endNode);

      // Update the single active wave line in place so dragging a node carries
      // the visible pressure wave without re-rendering hidden route segments.
      setLineEndpoints(refs.tube, endpoints);
      setLineEndpoints(refs.channel, endpoints);
      setSvgAttr(refs.gradient, "x1", endpoints.x1);
      setSvgAttr(refs.gradient, "y1", endpoints.y1);
      setSvgAttr(refs.gradient, "x2", endpoints.x2);
      setSvgAttr(refs.gradient, "y2", endpoints.y2);
      setSvgAttr(refs.tube, "data-wave-target", seg.endId);
      setSvgAttr(refs.channel, "data-wave-target", seg.endId);

      const center = localProgress;
      const visible = center >= 0 && center <= 1;

      if (!visible) {
        for (const stop of refs.stops) {
          setSvgAttr(stop, "stop-opacity", 0);
        }
        setSvgAttr(refs.tube, "opacity", 0);
        setSvgAttr(refs.channel, "opacity", 0);
      } else {
        const distanceFromDeparture = localProgress;
        const distanceToArrival = 1 - localProgress;
        const departureFade = smootherstep(
          distanceFromDeparture / WAVE_NODE_ABSORB_DISTANCE,
        );
        const arrivalFade = smootherstep(
          distanceToArrival / WAVE_NODE_ABSORB_DISTANCE,
        );
        const activeEndpointFade = isNodeHold ? 0 : departureFade * arrivalFade;
        const midpointTaper = Math.sin(Math.PI * clamp01(localProgress));
        const sizeEnvelope =
          Math.pow(activeEndpointFade, 0.68) *
          Math.pow(Math.max(0, midpointTaper), 1.05);
        const taperedSize =
          WAVE_STROKE_TAPER_MIN +
          (1 - WAVE_STROKE_TAPER_MIN) * sizeEnvelope;
        const visibleLineLength = Math.max(
          1,
          distanceBetween(startNode, endNode) - LINE_GAP * 2,
        );
        const shortLineStrokeScale = clamp(
          visibleLineLength / 130,
          WAVE_SHORT_SEGMENT_STROKE_SCALE,
          1,
        );
        const baseColor = seg.edge.color;
        const sourceColor = nodeAccentByIdRef.current.get(seg.startId) ?? baseColor;
        const targetColor = nodeAccentByIdRef.current.get(seg.endId) ?? baseColor;
        const departureColorBlend =
          (1 - smootherstep(distanceFromDeparture / WAVE_COLOR_BLEND_DISTANCE)) *
          WAVE_COLOR_BLEND_STRENGTH;
        const arrivalColorBlend =
          smootherstep(
            (WAVE_COLOR_BLEND_DISTANCE - distanceToArrival) /
              WAVE_COLOR_BLEND_DISTANCE,
          ) * WAVE_COLOR_BLEND_STRENGTH;
        const releaseColor = mixColors(baseColor, sourceColor, departureColorBlend);
        const color = mixColors(releaseColor, targetColor, arrivalColorBlend);
        const peak =
          peakOpacity * WAVE_PEAK_OPACITY * waveIntensity * activeEndpointFade;
        const tubeOpacity =
          peakOpacity * 0.72 * waveIntensity * activeEndpointFade;
        const tubeWidth = WAVE_STROKE_PEAK * shortLineStrokeScale * taperedSize;
        const channelWidth =
          WAVE_CHANNEL_STROKE_BASE +
          (WAVE_CHANNEL_STROKE_PEAK - WAVE_CHANNEL_STROKE_BASE) *
            shortLineStrokeScale *
            taperedSize;

        setSvgAttr(refs.tube, "opacity", tubeOpacity);
        setSvgAttr(refs.tube, "stroke-width", tubeWidth);
        setSvgAttr(refs.channel, "stroke-width", channelWidth);
        setSvgAttr(
          refs.channel,
          "opacity",
          peakOpacity * WAVE_CHANNEL_OPACITY * activeEndpointFade,
        );
        setSvgAttr(refs.channel, "stroke", color);

        for (let s = 0; s < STOP_OFFSETS.length; s++) {
          const offset = STOP_OFFSETS[s];
          const profile = waveProfile(offset, center, visibleLineLength);
          setStop(refs.stops[s], peak * profile, color);
        }
      }

      frameMetricRef.current({
        frameMs: window.performance.now() - frameStart,
        relationCalcMs,
      });
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);

    return () => {
      mounted = false;
      releaseWaveReservation(waveReservationsRef.current, flow.id);
      window.cancelAnimationFrame(frame);
    };
  }, [
    flow.delay,
    flow.id,
    livePositionsRef,
    nodeHoldDuration,
    reduced,
    routeStartByIndex,
    routes,
    segmentDuration,
    segmentOptionsByStartId,
    segments,
    waveReservationsRef,
  ]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <g
      data-graph-tube-bulge="true"
      pointerEvents="none"
      style={graphQuality.useBlendMode ? { mixBlendMode: "screen" } : undefined}
    >
      <defs>
        <linearGradient
          id={gradientId}
          ref={(el) => {
            flowRefs.current.gradient = el;
          }}
          gradientUnits="userSpaceOnUse"
        >
          {STOP_OFFSETS.map((offset, s) => (
            <stop
              key={s}
              ref={(el) => {
                flowRefs.current.stops[s] = el;
              }}
              offset={`${offset * 100}%`}
              stopColor={segments[0]?.edge.color ?? "#7dd3fc"}
              stopOpacity="0"
            />
          ))}
        </linearGradient>
      </defs>
      <line
        ref={(el) => {
          flowRefs.current.channel = el;
        }}
        stroke={segments[0]?.edge.color ?? "#7dd3fc"}
        strokeWidth={3.2}
        strokeLinecap="round"
        opacity={0}
        filter={graphQuality.useFilteredWaveGlow ? "url(#project-signal-glow)" : undefined}
      />
      <line
        ref={(el) => {
          flowRefs.current.tube = el;
        }}
        stroke={`url(#${gradientId})`}
        strokeWidth={WAVE_STROKE_BASE}
        strokeLinecap="round"
        opacity={0}
        filter={graphQuality.useFilteredWaveGlow ? "url(#project-signal-glow)" : undefined}
      />
    </g>
  );
}

function BadgePing({
  color,
  clipPathId,
  shouldReduceMotion,
}: {
  color: string;
  clipPathId: string;
  shouldReduceMotion: boolean | null;
}) {
  return (
    <g clipPath={`url(#${clipPathId})`} pointerEvents="none" aria-hidden="true">
      <motion.circle
        cx={0}
        cy={0}
        r={NODE_RADIUS}
        fill={color}
        initial={{ opacity: 0 }}
        animate={
          shouldReduceMotion
            ? { opacity: BADGE_PING_FACE_OPACITY * 0.5 }
            : {
                opacity: [
                  0,
                  BADGE_PING_FACE_OPACITY * 0.02,
                  BADGE_PING_FACE_OPACITY * 0.08,
                  BADGE_PING_FACE_OPACITY * 0.24,
                  BADGE_PING_FACE_OPACITY * 0.52,
                  BADGE_PING_FACE_OPACITY,
                  BADGE_PING_FACE_OPACITY * 0.62,
                  BADGE_PING_FACE_OPACITY * 0.24,
                  0,
                ],
              }
        }
        transition={{
          duration: shouldReduceMotion
            ? BADGE_PING_DURATION_REDUCED
            : BADGE_PING_DURATION,
          times: shouldReduceMotion ? undefined : BADGE_PING_TIMES,
          ease: "linear",
        }}
      />
    </g>
  );
}

function PreviewCard({
  project,
  mode,
}: {
  project: Project;
  mode: PreviewMode;
}) {
  const Icon = project.icon;
  const badgeStyles =
    mode === "hovered"
      ? "border-accent/40 bg-accent/10 text-accent"
      : mode === "pinned"
        ? "border-white/15 bg-white/[0.05] text-zinc-200"
        : "border-white/10 bg-white/[0.04] text-zinc-500";

  const badgeDotStyles =
    mode === "hovered"
      ? "bg-accent animate-pulse"
      : mode === "pinned"
        ? "bg-zinc-300"
        : "bg-zinc-600";

  const badgeLabel =
    mode === "hovered" ? "Hovering" : mode === "pinned" ? "Pinned" : "Last viewed";
  const metricItems = project.metrics.slice(0, 6);
  const relationItems = project.relations.slice(0, 8);

  return (
    <motion.div
      key={project.title}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="glass p-6 sm:p-7"
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors",
            badgeStyles,
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={["h-1.5 w-1.5 rounded-full", badgeDotStyles].join(" ")}
          />
          {badgeLabel}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] lg:items-start">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Icon size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-tight tracking-tight text-zinc-100">
                {project.title}
              </h3>
              <p className="mt-1 text-sm font-medium text-zinc-300">
                {project.blurb}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.72fr)]">
            <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
                Project Summary
              </p>
              <p className="mt-2 text-[14px] leading-7 text-zinc-300">
                {project.description}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
                Why It Matters
              </p>
              <p className="mt-2 text-[13px] leading-6 text-zinc-400">
                {whyProjectMatters(project)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
              Key Features
            </p>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {project.bullets.slice(0, 4).map((b) => (
                <li
                  key={b}
                  className="flex gap-2.5 text-[13px] leading-6 text-zinc-400"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2.5 inline-block h-px w-3 shrink-0 bg-accent/60"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lg:border-l lg:border-white/[0.06] lg:pl-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Main Technologies
          </p>

          <ul className="mt-3 flex flex-wrap gap-1.5">
            {project.tech.slice(0, 8).map((t) => (
              <li key={t} className="badge text-[10px]">
                {t}
              </li>
            ))}
            {project.tech.length > 8 && (
              <li className="badge text-[10px] text-zinc-500">
                +{project.tech.length - 8}
              </li>
            )}
          </ul>

          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
              Engineering Signals
            </p>
            <ul className="mt-3 grid gap-2">
              {metricItems.map((metric) => (
                <li
                  key={metric}
                  className="flex gap-2 text-[12px] leading-5 text-zinc-400"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-accent/70"
                  />
                  <span>{metric}</span>
                </li>
              ))}
            </ul>
          </div>

          {relationItems.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Relation Tags
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {relationItems.map((relation) => (
                  <li
                    key={relation}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-400"
                  >
                    {relation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
            <a
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              <Github size={12} aria-hidden="true" /> GitHub
            </a>
            {project.liveDemo && (
              <a
                href={project.liveDemo}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:border-accent/60 hover:bg-accent/15"
              >
                <ExternalLink size={12} aria-hidden="true" /> Live
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
