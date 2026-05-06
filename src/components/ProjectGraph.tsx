import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ExternalLink,
  Github,
  MousePointer2,
  Pin,
} from "lucide-react";
import { projects, type Project } from "../data/projects";

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
  startNodeX: number;
  startNodeY: number;
  endNodeX: number;
  endNodeY: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type ClusterFlow = {
  cluster: ClusterKey;
  delay: number;
  segments: TubeSegment[];
};

type FlowEdgeCandidate = {
  edge: Edge;
  source: Node;
  target: Node;
  score: number;
  key: string;
};

type ArrivalGlow = {
  token: number;
};

const VIEWBOX_W = 1320;
const VIEWBOX_H = 860;
const CENTER_X = VIEWBOX_W / 2;
const CENTER_Y = VIEWBOX_H / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const NODE_RADIUS = 27;
const LINE_GAP = NODE_RADIUS + 3;
const LABEL_GAP = 12;

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
  "design patterns": 0.18,
  observer: 0.15,
  mvc: 0.15,
  "recursive parsing": 0.4,
  "stored procedures": 0.85,
  "t-sql": 0.85,
  csvhelper: 0.65,
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
};

const EDGE_COLOR_FAMILIES: EdgeColorFamily[] = [
  {
    label: "Web",
    color: "#61dafb",
    tags: [
      "react",
      "node",
      "express",
      "mongodb",
      "mui",
      "vue 3",
      "quasar",
      "frontend app",
      "javascript ecosystem",
    ],
  },
  {
    label: "Mobile",
    color: "#facc15",
    tags: ["react native", "expo", "firebase", "firestore", "mobile app"],
  },
  {
    label: "APIs",
    color: "#a3e635",
    tags: ["socketio", "grpc", "protobuf", "real-time systems", "swagger", "jwt"],
  },
  {
    label: "SQL",
    color: "#ef4444",
    tags: [
      "sql",
      "sql server",
      "t-sql",
      "stored procedures",
      "postgresql",
      "plpgsql",
      "sqlite",
      "relational data",
      "database systems",
      "data modeling",
      "etl",
    ],
  },
  {
    label: "C++",
    color: "#f34b7d",
    tags: [
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
    label: "Patterns",
    color: "#c084fc",
    tags: ["oop", "oop architecture", "design patterns", "observer", "mvc"],
  },
  {
    label: "Java",
    color: "#b07219",
    tags: ["java", "swing", "java ecosystem"],
  },
  {
    label: "C# / .NET",
    color: "#7c3aed",
    tags: [
      "c#",
      ".net",
      ".net 8",
      ".net 9",
      "asp.net core",
      "ef core",
      "xunit",
      "csharp ecosystem",
    ],
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
  EDGE_COLOR_FAMILIES[7],
  EDGE_COLOR_FAMILIES[3],
  EDGE_COLOR_FAMILIES[1],
  EDGE_COLOR_FAMILIES[2],
  EDGE_COLOR_FAMILIES[5],
  EDGE_COLOR_FAMILIES[6],
  EDGE_COLOR_FAMILIES[4],
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

function estimateLabelWidth(title: string) {
  return clamp(82 + title.length * 2.7, 108, 182);
}

function estimateLabelHeight(title: string, width: number) {
  const approxLines = clamp(Math.ceil((title.length * 7) / width), 1, 2);
  return approxLines === 1 ? 22 : 32;
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
  const text = `${project.title} ${project.blurb} ${project.description} ${project.tech.join(
    " ",
  )}`.toLowerCase();
  const tags: string[] = [];

  if (/(react|vue|vite|quasar|mui|tailwind|frontend|storefront|spa)/.test(text)) {
    tags.push("frontend app");
  }

  if (/(node|express|asp\.net|api|jwt|grpc|protobuf|backend|server)/.test(text)) {
    tags.push("backend api");
  }

  if (/(react|vue|node|express|javascript|typescript|socket|vite|mui)/.test(text)) {
    tags.push("javascript ecosystem");
  }

  if (/(c#|\.net|asp\.net|ef core|xunit|unity)/.test(text)) {
    tags.push("csharp ecosystem");
  }

  if (/(java|swing)/.test(text)) {
    tags.push("java ecosystem");
  }

  if (/(sql|database|postgres|plpgsql|t-sql|stored procedure|warehouse|etl|payroll|genealogy|order management|drone management)/.test(text)) {
    tags.push("relational data", "database systems", "data modeling");
  }

  if (/(react native|expo|mobile|apk|sqlite|firebase|firestore)/.test(text)) {
    tags.push("mobile app");
  }

  if (/(oop|design pattern|mediator|observer|memento|strategy|factory|builder|decorator|state|bridge|inheritance)/.test(text)) {
    tags.push("oop architecture");
  }

  if (/(c\+\+|tokenizer|parser|rpn|compiler|decision tree|calendar|data structures)/.test(text)) {
    tags.push("systems programming");
  }

  if (/(socket|real-time|streaming|websocket|grpc)/.test(text)) {
    tags.push("real-time systems");
  }

  if (/(expression evaluator|tokenizer|parser|rpn)/.test(text)) {
    tags.push("compiler pipeline");
  }

  return tags;
}

function scoreSharedTech(shared: string[], frequency: Map<string, number>) {
  return shared.reduce((sum, tech) => {
    const freq = frequency.get(tech) ?? 1;
    const rarity = 1 / Math.sqrt(freq);
    return sum + weightOf(tech) * rarity;
  }, 0);
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

function clampNodeToViewport(node: Node) {
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

  node.x = clamp(node.x, extraLeft, VIEWBOX_W - extraRight);
  node.y = clamp(node.y, extraTop, VIEWBOX_H - extraBottom);
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
    Array.from(new Set(project.tech.flatMap((tech) => expandTechTags(tech)))),
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
        "Customer Data Storage",
        "Student Loan App",
        "Enigma Machine Simulator",
      ],
    },
    {
      label: "C++ systems",
      color: "#f34b7d",
      members: [
        "Expression Evaluator",
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
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const key = edgePairKey(present[i], present[j]);
        if (candidateByPair.has(key)) continue;
        const edge: Edge = {
          source: present[i],
          target: present[j],
          weight: 1.0,
          shared: [group.label],
          color: group.color,
        };
        curatedEdges.push(edge);
        candidateByPair.set(key, edge);
      }
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
      label: "Web frontend",
      source: "Fragrance E-Commerce",
      target: "Fast Food Ordering",
      color: "#61dafb",
      weight: 1.18,
    },
    {
      label: "Web frontend",
      source: "Fragrance E-Commerce",
      target: "Travel Advisory Aggregator",
      color: "#61dafb",
      weight: 1.08,
    },
    {
      label: "Web frontend",
      source: "Fragrance E-Commerce",
      target: "Debug My Heart",
      color: "#61dafb",
      weight: 1.05,
    },
    {
      label: "Web frontend",
      source: "Fragrance E-Commerce",
      target: "Real-Time Chat App",
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

  let edges: Edge[] = [...candidateEdges, ...curatedEdges];

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

function getEdgeEndpoints(source: Node, target: Node) {
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
  const [arrivalGlowById, setArrivalGlowById] = useState<Map<string, ArrivalGlow>>(
    () => new Map(),
  );
  const arrivalGlowTimers = useRef<Map<string, number>>(new Map());
  const shouldReduceMotion = useReducedMotion();

  const { nodes, edges } = useMemo(() => {
    const graph = buildGraph(projects);
    runLayout(graph.nodes, graph.edges);
    return graph;
  }, []);

  useEffect(() => {
    const activeId = hoveredId ?? pinnedId;

    if (activeId) {
      setLastViewedId(activeId);
    }
  }, [hoveredId, pinnedId]);

  useEffect(
    () => () => {
      for (const timer of arrivalGlowTimers.current.values()) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  const handleTubeArrival = useCallback((nodeId: string) => {
    const token = window.performance.now();

    setArrivalGlowById((current) => {
      const next = new Map(current);
      next.set(nodeId, { token });
      return next;
    });

    const existingTimer = arrivalGlowTimers.current.get(nodeId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      setArrivalGlowById((current) => {
        const activeGlow = current.get(nodeId);

        if (!activeGlow || activeGlow.token !== token) {
          return current;
        }

        const next = new Map(current);
        next.delete(nodeId);
        return next;
      });
      arrivalGlowTimers.current.delete(nodeId);
    }, 1320);

    arrivalGlowTimers.current.set(nodeId, timer);
  }, []);

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

  const previewProject =
    nodes.find((node) => node.id === (activeId ?? lastViewedId))?.project ?? projects[0];

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

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
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
  const clusterFlows = useMemo(() => {
    const claimedAnimatedEdges = new Set<string>();

    return CLUSTER_ORDER.flatMap((cluster, index) => {
      const allRankedEdges = edges
        .map((edge) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);

          if (!source || !target) {
            return null;
          }

          const touchesCluster =
            source.cluster === cluster || target.cluster === cluster;

          if (!touchesCluster) {
            return null;
          }

          const isInternal =
            source.cluster === cluster && target.cluster === cluster;

          return {
            edge,
            source,
            target,
            score: edge.weight + (isInternal ? 3 : 0),
            key: edgePairKey(edge.source, edge.target),
          };
        })
        .filter((item): item is FlowEdgeCandidate => item !== null)
        .sort((a, b) => b.score - a.score);

      const rankedEdges = allRankedEdges.filter(
        (item) => !claimedAnimatedEdges.has(item.key),
      );
      const best = rankedEdges[0];

      if (!best) {
        return [];
      }

      const adjacency = new Map<string, FlowEdgeCandidate[]>();

      for (const item of rankedEdges) {
        const sourceList = adjacency.get(item.source.id) ?? [];
        sourceList.push(item);
        adjacency.set(item.source.id, sourceList);

        const targetList = adjacency.get(item.target.id) ?? [];
        targetList.push(item);
        adjacency.set(item.target.id, targetList);
      }

      let current = best.source.cluster === cluster ? best.source : best.target;
      let previousNodeId = "";
      let previousEdgeKey = "";
      const visitedEdges = new Set<string>();
      const visitedNodeCount = new Map<string, number>([[current.id, 1]]);
      const routeLength = rankedEdges.length;
      const segments: TubeSegment[] = [];

      for (let step = 0; step < routeLength; step++) {
        const connected = adjacency.get(current.id) ?? [];
        const edgeScore = (item: FlowEdgeCandidate, from: Node) => {
          const other = item.source.id === from.id ? item.target : item.source;
          const nodeVisits = visitedNodeCount.get(other.id) ?? 0;
          const connectedBonus =
            item.source.id === from.id || item.target.id === from.id ? 4 : 0;

          return (
            item.score +
            connectedBonus +
            (nodeVisits === 0 ? 5 : -nodeVisits * 3) -
            (item.key === previousEdgeKey ? 20 : 0) -
            (other.id === previousNodeId ? 10 : 0)
          );
        };

        const connectedFresh = connected.filter(
          (item) => !visitedEdges.has(item.key) && item.key !== previousEdgeKey,
        );
        let chosen = [...connectedFresh].sort(
          (a, b) => edgeScore(b, current) - edgeScore(a, current),
        )[0];

        if (!chosen) {
          const freshGlobal = rankedEdges.filter(
            (item) => !visitedEdges.has(item.key),
          );

          chosen = [...freshGlobal].sort((a, b) => {
            const aTouches =
              a.source.id === current.id || a.target.id === current.id ? 1 : 0;
            const bTouches =
              b.source.id === current.id || b.target.id === current.id ? 1 : 0;

            return bTouches - aTouches || b.score - a.score;
          })[0];
        }

        if (!chosen) {
          break;
        }

        const connectedToCurrent =
          chosen.source.id === current.id || chosen.target.id === current.id;
        const start = connectedToCurrent
          ? current
          : chosen.source.cluster === cluster
            ? chosen.source
            : chosen.target;
        const end = chosen.source.id === start.id ? chosen.target : chosen.source;
        const endpoints = getEdgeEndpoints(start, end);

        segments.push({
          edge: chosen.edge,
          startId: start.id,
          endId: end.id,
          startNodeX: start.x,
          startNodeY: start.y,
          endNodeX: end.x,
          endNodeY: end.y,
          x1: endpoints.x1,
          y1: endpoints.y1,
          x2: endpoints.x2,
          y2: endpoints.y2,
        });

        previousNodeId = start.id;
        previousEdgeKey = chosen.key;
        visitedEdges.add(chosen.key);
        visitedNodeCount.set(end.id, (visitedNodeCount.get(end.id) ?? 0) + 1);
        current = end;
      }

      for (const segment of segments) {
        claimedAnimatedEdges.add(edgePairKey(segment.edge.source, segment.edge.target));
      }

      return segments.length > 0
        ? [
            {
              cluster,
              delay: index * 0.24,
              segments,
            },
          ]
        : [];
    });
  }, [edges, nodeById]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto max-w-[1280px]"
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

      <div className="glass relative overflow-hidden p-3 sm:p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(125,211,252,0.06),transparent_32%)]" />
        <div className="grid-overlay pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.03] to-transparent" />

        <motion.div
          className="relative aspect-[16/10] w-full"
          onMouseLeave={() => setHoveredId(null)}
          initial={false}
        >
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            aria-label="Project graph"
            role="img"
          >
            <defs>
              <filter
                id="project-edge-glow"
                x="-40%"
                y="-40%"
                width="180%"
                height="180%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter
                id="project-signal-glow"
                x="-90%"
                y="-90%"
                width="280%"
                height="280%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation="4.8" result="signalBlur" />
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
                <feGaussianBlur stdDeviation="7" result="nodeBlur" />
                <feMerge>
                  <feMergeNode in="nodeBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {edges.map((edge) => {
              const source = nodeById.get(edge.source)!;
              const target = nodeById.get(edge.target)!;
              const endpoints = getEdgeEndpoints(source, target);
              const highlight = isEdgeHighlighted(edge);
              const edgeId = edgePairKey(edge.source, edge.target);
              const visualWeight = Math.max(edge.weight, 1.35);
              const idleWidth = Math.min(1.08 + visualWeight * 0.22, 1.9);
              const activeWidth = Math.min(1.35 + visualWeight * 0.34, 2.5);
              const idleOpacity = 0.56;
              const activeOpacity = highlight ? 0.74 : 0.12;
              const glowOpacity = activeId
                ? highlight
                  ? 0.36
                  : 0.04
                : 0.34;

              return (
                <g key={edgeId} pointerEvents="none">
                  <motion.line
                    x1={endpoints.x1}
                    y1={endpoints.y1}
                    x2={endpoints.x2}
                    y2={endpoints.y2}
                    stroke={edge.color}
                    strokeLinecap="round"
                    filter="url(#project-edge-glow)"
                    animate={{
                      opacity: glowOpacity,
                      strokeWidth: activeId
                        ? (highlight ? activeWidth + 5.5 : 2.1)
                        : idleWidth + 4.8,
                    }}
                    transition={{
                      opacity: { duration: shouldReduceMotion ? 0.01 : 0.22, ease: "easeOut" },
                      strokeWidth: {
                        type: "spring",
                        stiffness: 240,
                        damping: 28,
                      },
                    }}
                  />
                  <motion.line
                    x1={endpoints.x1}
                    y1={endpoints.y1}
                    x2={endpoints.x2}
                    y2={endpoints.y2}
                    stroke={edge.color}
                    strokeLinecap="round"
                    animate={{
                      opacity: activeId ? (highlight ? 0.32 : 0.035) : 0.25,
                      strokeWidth: activeId
                        ? (highlight ? activeWidth + 2.7 : 1.2)
                        : idleWidth + 2.4,
                    }}
                    transition={{
                      opacity: { duration: 0.22, ease: "easeOut" },
                      strokeWidth: {
                        type: "spring",
                        stiffness: 240,
                        damping: 28,
                      },
                    }}
                  />
                  <motion.line
                    x1={endpoints.x1}
                    y1={endpoints.y1}
                    x2={endpoints.x2}
                    y2={endpoints.y2}
                    stroke={edge.color}
                    strokeLinecap="round"
                    animate={{
                      opacity: activeId ? activeOpacity : idleOpacity,
                      strokeWidth: activeId
                        ? (highlight ? activeWidth : 0.55)
                        : idleWidth,
                    }}
                    transition={{
                      opacity: { duration: shouldReduceMotion ? 0.01 : 0.22, ease: "easeOut" },
                      strokeWidth: {
                        type: "spring",
                        stiffness: 240,
                        damping: 28,
                      },
                    }}
                  />
                </g>
              );
            })}
            {clusterFlows.map((flow) => {
              const hasHighlightedSegment = flow.segments.some((segment) =>
                isEdgeHighlighted(segment.edge),
              );
              const opacityPeak = activeId && !hasHighlightedSegment ? 0.52 : 1;

              return (
                <GraphTubeFlow
                  key={flow.cluster}
                  flow={flow}
                  opacityPeak={opacityPeak}
                  shouldReduceMotion={shouldReduceMotion}
                  onNodeArrive={handleTubeArrival}
                />
              );
            })}
            {nodes.map((node) => {
              const Icon = node.project.icon;
              const focused = activeId === node.id;
              const arrivalGlow = arrivalGlowById.get(node.id);
              const arriving = Boolean(arrivalGlow);
              const dim = !isHighlighted(node.id);
              const labelLines = splitLabel(node.project.title);
              const labelY = node.y + NODE_RADIUS + 20;
              const accentColor =
                activeAccentById.get(node.id) ??
                nodeAccentById.get(node.id) ??
                "#7dd3fc";
              const glowColor = accentColor;
              const glowActive = focused;
              const baseGlowActive = focused || arriving;

              return (
                <motion.g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  animate={{
                    opacity: dim && !arriving ? 0.32 : 1,
                  }}
                  transition={{
                    opacity: {
                      duration: shouldReduceMotion ? 0.01 : 0.2,
                      ease: "easeOut",
                    },
                  }}
                  style={{
                    cursor: "pointer",
                    outline: "none",
                    transformOrigin: `${node.x}px ${node.y}px`,
                  }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onFocus={() => setHoveredId(node.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() =>
                    setPinnedId((current) => (current === node.id ? null : node.id))
                  }
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
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 14}
                    fill="transparent"
                    pointerEvents="all"
                  />
                  {arrivalGlow && (
                    <motion.circle
                      key={`${node.id}-arrival-outer-${arrivalGlow.token}`}
                      aria-hidden="true"
                      cx={node.x}
                      cy={node.y}
                      fill={glowColor}
                      filter="url(#project-node-glow)"
                      initial={{ opacity: 0, r: NODE_RADIUS + 15 }}
                      animate={
                        shouldReduceMotion
                          ? { opacity: 0.26, r: NODE_RADIUS + 28 }
                          : {
                              opacity: [0, 0.34, 0.24, 0],
                              r: [
                                NODE_RADIUS + 16,
                                NODE_RADIUS + 28,
                                NODE_RADIUS + 34,
                                NODE_RADIUS + 40,
                              ],
                            }
                      }
                      transition={{
                        duration: shouldReduceMotion ? 0.01 : 1.18,
                        times: shouldReduceMotion ? undefined : [0, 0.28, 0.68, 1],
                        ease: "easeInOut",
                      }}
                    />
                  )}
                  {arrivalGlow && (
                    <motion.circle
                      key={`${node.id}-arrival-core-${arrivalGlow.token}`}
                      aria-hidden="true"
                      cx={node.x}
                      cy={node.y}
                      fill={glowColor}
                      initial={{ opacity: 0, r: NODE_RADIUS + 2 }}
                      animate={
                        shouldReduceMotion
                          ? { opacity: 0.18, r: NODE_RADIUS + 12 }
                          : {
                              opacity: [0, 0.2, 0.16, 0],
                              r: [
                                NODE_RADIUS + 3,
                                NODE_RADIUS + 12,
                                NODE_RADIUS + 16,
                                NODE_RADIUS + 20,
                              ],
                            }
                      }
                      transition={{
                        duration: shouldReduceMotion ? 0.01 : 1.05,
                        times: shouldReduceMotion ? undefined : [0, 0.22, 0.64, 1],
                        ease: "easeInOut",
                      }}
                    />
                  )}
                  <motion.circle
                    aria-hidden="true"
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 24}
                    fill={glowColor}
                    filter="url(#project-node-glow)"
                    animate={{
                      opacity: baseGlowActive ? 0.32 : 0,
                    }}
                    transition={{
                      duration: shouldReduceMotion ? 0.01 : 0.55,
                      ease: "easeInOut",
                    }}
                  />
                  <motion.circle
                    aria-hidden="true"
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 14}
                    fill={glowColor}
                    animate={{
                      opacity: baseGlowActive ? 0.2 : 0,
                    }}
                    transition={{
                      duration: shouldReduceMotion ? 0.01 : 0.55,
                      ease: "easeInOut",
                    }}
                  />

                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill={glowActive ? glowColor : "rgba(255,255,255,0.045)"}
                    fillOpacity={glowActive ? 0.24 : 1}
                    stroke={glowActive ? glowColor : dim ? "rgba(255,255,255,0.08)" : accentColor}
                    strokeOpacity={glowActive ? 0.92 : dim ? 1 : 0.42}
                    strokeWidth={glowActive ? 2 : 1}
                  />
                  <Icon
                    x={node.x - 8.75}
                    y={node.y - 8.75}
                    width={17.5}
                    height={17.5}
                    color={focused ? accentColor : "#d4d4d8"}
                    strokeWidth={2}
                    aria-hidden="true"
                    pointerEvents="none"
                  />
                  <text
                    x={node.x}
                    y={labelY}
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
                        x={node.x}
                        dy={lineIndex === 0 ? 0 : 14}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </motion.g>
              );
            })}
          </svg>
        </motion.div>
      </div>

      <div className="mt-5" aria-live="polite">
        <PreviewCard project={previewProject} mode={previewMode} />
      </div>
    </motion.div>
  );
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function easeInOutSine(amount: number) {
  return 0.5 - Math.cos(Math.PI * amount) / 2;
}

function setSvgAttr(
  element: SVGElement | null,
  name: string,
  value: number | string,
) {
  if (!element) {
    return;
  }

  element.setAttribute(
    name,
    typeof value === "number" ? value.toFixed(2) : value,
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function setGradientStop(
  element: SVGStopElement | null,
  offset: number,
  opacity: number,
) {
  if (!element) {
    return;
  }

  element.setAttribute("offset", `${(clamp01(offset) * 100).toFixed(2)}%`);
  element.setAttribute("stop-opacity", clamp01(opacity).toFixed(3));
}

function GraphTubeFlow({
  flow,
  opacityPeak,
  shouldReduceMotion,
  onNodeArrive,
}: {
  flow: ClusterFlow;
  opacityPeak: number;
  shouldReduceMotion: boolean | null;
  onNodeArrive: (nodeId: string) => void;
}) {
  const reduced = Boolean(shouldReduceMotion);
  const segmentDuration = reduced ? 3.8 : 1.72;
  const intensity = reduced ? 0.55 : 1;
  const gradientId = `project-tube-pressure-${flow.cluster}`;
  const tubeRef = useRef<SVGLineElement | null>(null);
  const channelRef = useRef<SVGLineElement | null>(null);
  const gradientRef = useRef<SVGLinearGradientElement | null>(null);
  const stop0Ref = useRef<SVGStopElement | null>(null);
  const stop1Ref = useRef<SVGStopElement | null>(null);
  const stop2Ref = useRef<SVGStopElement | null>(null);
  const stop3Ref = useRef<SVGStopElement | null>(null);
  const stop4Ref = useRef<SVGStopElement | null>(null);
  const stop5Ref = useRef<SVGStopElement | null>(null);
  const stop6Ref = useRef<SVGStopElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let mounted = true;
    let lastArrivalKey = "";

    const draw = (time: number) => {
      if (!mounted) {
        return;
      }

      const segments = flow.segments;

      if (segments.length === 0) {
        return;
      }

      const elapsedSeconds = time / 1000 - flow.delay;
      const totalDuration = segmentDuration * segments.length;
      const absoluteSegmentProgress = elapsedSeconds / segmentDuration;
      const routeProgress =
        ((elapsedSeconds % totalDuration) + totalDuration) % totalDuration;
      const segmentIndex =
        Math.floor(routeProgress / segmentDuration) % segments.length;
      const localProgress = (routeProgress % segmentDuration) / segmentDuration;
      const segment = segments[segmentIndex];
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const eased = easeInOutSine(localProgress);
      const cx = lerp(segment.x1, segment.x2, eased);
      const cy = lerp(segment.y1, segment.y2, eased);
      const pressure = Math.sin(Math.PI * localProgress) * intensity;
      const center =
        Math.hypot(cx - segment.x1, cy - segment.y1) / distance;
      const spread = clamp((22 + pressure * 34) / distance, 0.045, 0.26);
      const softSpread = clamp(spread * 2.2, 0.09, 0.42);
      const shoulder = opacityPeak * (0.16 + pressure * 0.28);
      const peak = opacityPeak * (0.52 + pressure * 0.36);
      const arrivalKey = `${Math.floor(absoluteSegmentProgress)}-${segment.endId}`;

      if (localProgress > 0.86 && arrivalKey !== lastArrivalKey) {
        lastArrivalKey = arrivalKey;
        onNodeArrive(segment.endId);
      }

      setSvgAttr(gradientRef.current, "x1", segment.x1);
      setSvgAttr(gradientRef.current, "y1", segment.y1);
      setSvgAttr(gradientRef.current, "x2", segment.x2);
      setSvgAttr(gradientRef.current, "y2", segment.y2);
      setSvgAttr(channelRef.current, "x1", segment.x1);
      setSvgAttr(channelRef.current, "y1", segment.y1);
      setSvgAttr(channelRef.current, "x2", segment.x2);
      setSvgAttr(channelRef.current, "y2", segment.y2);
      setSvgAttr(channelRef.current, "stroke", segment.edge.color);
      setSvgAttr(channelRef.current, "opacity", opacityPeak * 0.075);
      setSvgAttr(tubeRef.current, "stroke-width", 5.4 + pressure * 9.8);
      setSvgAttr(tubeRef.current, "opacity", opacityPeak * (0.76 + pressure * 0.18));
      setSvgAttr(tubeRef.current, "x1", segment.x1);
      setSvgAttr(tubeRef.current, "y1", segment.y1);
      setSvgAttr(tubeRef.current, "x2", segment.x2);
      setSvgAttr(tubeRef.current, "y2", segment.y2);
      setGradientStop(stop0Ref.current, 0, 0);
      setGradientStop(stop1Ref.current, center - softSpread, 0);
      setGradientStop(stop2Ref.current, center - spread, shoulder);
      setGradientStop(stop3Ref.current, center, peak);
      setGradientStop(stop4Ref.current, center + spread, shoulder);
      setGradientStop(stop5Ref.current, center + softSpread, 0);
      setGradientStop(stop6Ref.current, 1, 0);
      setSvgAttr(stop0Ref.current, "stop-color", segment.edge.color);
      setSvgAttr(stop1Ref.current, "stop-color", segment.edge.color);
      setSvgAttr(stop2Ref.current, "stop-color", segment.edge.color);
      setSvgAttr(stop3Ref.current, "stop-color", segment.edge.color);
      setSvgAttr(stop4Ref.current, "stop-color", segment.edge.color);
      setSvgAttr(stop5Ref.current, "stop-color", segment.edge.color);
      setSvgAttr(stop6Ref.current, "stop-color", segment.edge.color);

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);

    return () => {
      mounted = false;
      window.cancelAnimationFrame(frame);
    };
  }, [
    flow,
    intensity,
    onNodeArrive,
    opacityPeak,
    segmentDuration,
  ]);
  const firstSegment = flow.segments[0];

  if (!firstSegment) {
    return null;
  }

  return (
    <g
      data-graph-tube-bulge="true"
      pointerEvents="none"
      style={{ mixBlendMode: "screen" }}
    >
      <defs>
        <linearGradient
          ref={gradientRef}
          id={gradientId}
          x1={firstSegment.x1}
          y1={firstSegment.y1}
          x2={firstSegment.x2}
          y2={firstSegment.y2}
          gradientUnits="userSpaceOnUse"
        >
          <stop ref={stop0Ref} offset="0%" stopColor={firstSegment.edge.color} stopOpacity="0" />
          <stop ref={stop1Ref} offset="0%" stopColor={firstSegment.edge.color} stopOpacity="0" />
          <stop ref={stop2Ref} offset="0%" stopColor={firstSegment.edge.color} stopOpacity="0.16" />
          <stop ref={stop3Ref} offset="0%" stopColor={firstSegment.edge.color} stopOpacity="0.52" />
          <stop ref={stop4Ref} offset="0%" stopColor={firstSegment.edge.color} stopOpacity="0.16" />
          <stop ref={stop5Ref} offset="0%" stopColor={firstSegment.edge.color} stopOpacity="0" />
          <stop ref={stop6Ref} offset="100%" stopColor={firstSegment.edge.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        ref={channelRef}
        x1={firstSegment.x1}
        y1={firstSegment.y1}
        x2={firstSegment.x2}
        y2={firstSegment.y2}
        stroke={firstSegment.edge.color}
        strokeWidth={3.2}
        strokeLinecap="round"
        opacity={opacityPeak * 0.075}
        filter="url(#project-signal-glow)"
      />
      <line
        ref={tubeRef}
        x1={firstSegment.x1}
        y1={firstSegment.y1}
        x2={firstSegment.x2}
        y2={firstSegment.y2}
        stroke={`url(#${gradientId})`}
        strokeWidth={5.4}
        strokeLinecap="round"
        opacity={opacityPeak * 0.72}
        filter="url(#project-signal-glow)"
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

          <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
              What It Does
            </p>
            <p className="mt-2 text-[13px] leading-6 text-zinc-400">
              {project.blurb}. It combines the listed stack into a focused build
              with working data flow, structure, and a clear project outcome.
            </p>
          </div>

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
