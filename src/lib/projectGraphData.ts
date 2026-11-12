import type { Project } from "../data/projects";

// Pure graph data for the project constellation map: cluster classification
// and edge derivation (shared tech weights plus relation tags, capped per node).
// Ported from the previous ProjectGraph so the same clusters and links survive.

export type ClusterKey = "web" | "enterprise" | "data" | "systems" | "patterns" | "java";

export const CLUSTERS: { key: ClusterKey; name: string }[] = [
  { key: "web", name: "Web and mobile" },
  { key: "enterprise", name: ".NET services" },
  { key: "java", name: "Java" },
  { key: "systems", name: "C++ systems" },
  { key: "patterns", name: "Design patterns" },
  { key: "data", name: "Data and SQL" },
];

export const CLUSTER_NAME: Record<ClusterKey, string> = Object.fromEntries(
  CLUSTERS.map((cluster) => [cluster.key, cluster.name]),
) as Record<ClusterKey, string>;

export type GraphNode = {
  id: string;
  index: number;
  project: Project;
  cluster: ClusterKey;
  /** Number of links. */
  linkCount: number;
  /** Sum of link weights. */
  strength: number;
};

export type GraphEdge = {
  source: number;
  target: number;
  weight: number;
  /** Short human reason, e.g. "React, MongoDB". */
  reason: string;
};

export type GraphNeighbour = {
  index: number;
  weight: number;
  reason: string;
};

export type ProjectGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Neighbours of each node, strongest first. */
  neighbours: GraphNeighbour[][];
};

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
  "ef core": 1.05,
  "sql server": 0.95,
  grpc: 1.3,
  protobuf: 0.95,
  swagger: 0.45,
  quasar: 0.55,
  jest: 0.55,
  xunit: 0.55,
  sqlite: 0.75,
  postgresql: 0.85,
  plpgsql: 0.82,
  swing: 0.45,
  unity: 0.65,
  xpath: 0.48,
  xml: 0.35,
  "json schema": 0.55,
  templates: 0.35,
  raii: 0.35,
  shared_ptr: 0.35,
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

// Display names for the connectable tech tags. Relation tags keep the
// casing they have in the data file.
const TECH_LABEL: Record<string, string> = {
  react: "React",
  "react native": "React Native",
  node: "Node.js",
  express: "Express",
  mongodb: "MongoDB",
  mui: "MUI",
  "vue 3": "Vue 3",
  quasar: "Quasar",
  firebase: "Firebase",
  firestore: "Firestore",
  expo: "Expo",
  "asp.net core": "ASP.NET Core",
  "ef core": "EF Core",
  "sql server": "SQL Server",
  grpc: "gRPC",
  protobuf: "Protobuf",
  swagger: "Swagger",
  socketio: "Socket.IO",
  jwt: "JWT",
  stripe: "Stripe",
  jest: "Jest",
  xunit: "xUnit",
  sqlite: "SQLite",
  postgresql: "PostgreSQL",
  plpgsql: "PL/pgSQL",
  swing: "Swing",
  unity: "Unity",
  xpath: "XPath",
  xml: "XML",
  "json schema": "JSON Schema",
  "stored procedures": "Stored procedures",
  "t-sql": "T-SQL",
  csvhelper: "CsvHelper",
  "recursive parsing": "Recursive parsing",
  "design patterns": "Design patterns",
  observer: "Observer",
  mvc: "MVC",
  templates: "Templates",
  raii: "RAII",
  shared_ptr: "shared_ptr",
};

const CONNECTABLE_TECH_TAGS = new Set(Object.keys(TECH_LABEL));

const MAX_EDGES_PER_NODE = 5;
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

// Hand-picked links that the tag overlap alone misses.
const CURATED_GROUPS: { label: string; members: string[] }[] = [
  {
    label: "Pure SQL design",
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
    members: [
      "Customer Incentive Management System",
      "Student Loan Repayment Calculator",
      "Enigma Machine Simulator",
    ],
  },
  {
    label: "C++ systems",
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
    members: ["Coffee Shop POS", "Collaborative Drawing App", "Document Factory", "Stack Evaluator"],
  },
];

const CURATED_PAIRS: { label: string; source: string; target: string; weight: number }[] = [
  { label: "Frontend SPA", source: "Fragrance E-Commerce", target: "Fast Food Ordering", weight: 1.18 },
  { label: "Frontend SPA", source: "Fragrance E-Commerce", target: "Travel Advisory Tracker", weight: 1.08 },
  { label: "Frontend SPA", source: "Fragrance E-Commerce", target: "Debug My Heart", weight: 1.05 },
  { label: "Frontend SPA", source: "Fragrance E-Commerce", target: "Real-Time Room Chat App", weight: 1.02 },
];

type Candidate = { source: number; target: number; weight: number; shared: string[] };

const weightOf = (tag: string) => TECH_WEIGHT[tag] ?? 0.4;

const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function expandTechTags(tech: string): string[] {
  const lower = tech.toLowerCase().trim();

  if (lower.startsWith("react native")) return ["react native", "react"];
  if (lower.startsWith("react ")) return ["react"];
  if (lower === "node.js") return ["node"];
  if (lower === "asp.net core 8" || lower === "asp.net core") return ["asp.net core"];
  if (lower === "sql server") return ["sql server"];
  if (lower === "stored procedures") return ["stored procedures"];
  if (lower === "t-sql") return ["t-sql", "sql server"];
  if (lower === "mui 7") return ["mui"];
  if (lower === "socket.io") return ["socketio"];
  if (lower === "xunit.net") return ["xunit"];
  if (lower === "plpgsql") return ["plpgsql", "postgresql"];
  if (lower === "xpath") return ["xpath", "xml"];

  return [lower];
}

export function classifyProject(project: Project): ClusterKey {
  const tech = project.tech.join(" ").toLowerCase();

  if (/(sql server|t-sql|stored procedures|postgresql|plpgsql|etl)/.test(tech)) return "data";
  if (/(c\+\+|stl|raii|shared_ptr|templates|recursive parsing)/.test(tech)) return "systems";
  if (/(java|swing)/.test(tech)) return "java";
  if (/(asp\.net|grpc|ef core|xunit|swagger|github actions)/.test(tech)) return "enterprise";
  if (/(design patterns|csvhelper|json schema|xpath|xml|unity)/.test(tech)) return "patterns";
  if (/(react|node\.js|express|socket\.io|mongodb|firebase|firestore|expo|mui|vue 3|quasar)/.test(tech)) {
    return "web";
  }
  return "patterns";
}

function scoreShared(shared: string[], frequency: Map<string, number>) {
  return shared.reduce((sum, tag) => sum + weightOf(tag) / Math.sqrt(frequency.get(tag) ?? 1), 0);
}

function rankShared(shared: string[], frequency: Map<string, number>) {
  const score = (tag: string) => weightOf(tag) * 1.4 + 1 / Math.sqrt(frequency.get(tag) ?? 1);
  return [...shared].sort((a, b) => score(b) - score(a));
}

function edgeLimitForTag(tag: string, frequency: Map<string, number>) {
  const members = frequency.get(tag) ?? 2;
  const configured = EDGE_LIMIT_BY_TAG[tag] ?? DEFAULT_EDGE_LIMIT_PER_TAG;
  return Math.min(Math.max(configured, 1), Math.max(1, members - 1));
}

export function buildProjectGraph(items: Project[]): ProjectGraphData {
  const labels = new Map<string, string>();
  const tagsByProject = items.map((project) => {
    const tags = new Set<string>();
    for (const relation of project.relations) {
      const tag = relation.toLowerCase();
      tags.add(tag);
      if (!labels.has(tag)) labels.set(tag, relation);
    }
    for (const tech of project.tech) {
      for (const tag of expandTechTags(tech)) {
        if (!CONNECTABLE_TECH_TAGS.has(tag)) continue;
        tags.add(tag);
        if (!labels.has(tag)) labels.set(tag, TECH_LABEL[tag]);
      }
    }
    return Array.from(tags);
  });

  const frequency = new Map<string, number>();
  for (const tags of tagsByProject) {
    for (const tag of tags) frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
  }

  const candidates: Candidate[] = [];
  const candidateByPair = new Map<string, Candidate>();
  const addCandidate = (candidate: Candidate) => {
    candidates.push(candidate);
    candidateByPair.set(pairKey(candidate.source, candidate.target), candidate);
  };

  for (let i = 0; i < items.length; i++) {
    const own = new Set(tagsByProject[i]);
    for (let j = i + 1; j < items.length; j++) {
      const shared = tagsByProject[j].filter((tag) => own.has(tag));
      if (shared.length === 0) continue;

      const weight = scoreShared(shared, frequency);
      const strong = shared.some((tag) => weightOf(tag) >= 0.85);
      const meaningful = shared.filter((tag) => weightOf(tag) >= 0.7).length >= 2;
      if (strong || meaningful || weight >= 1.15) {
        addCandidate({ source: i, target: j, weight, shared });
      }
    }
  }

  const indexByTitle = new Map(items.map((project, index) => [project.title, index]));
  const addCurated = (a: string, b: string, label: string, weight: number) => {
    const source = indexByTitle.get(a);
    const target = indexByTitle.get(b);
    if (source === undefined || target === undefined) return;
    if (candidateByPair.has(pairKey(source, target))) return;
    labels.set(label, label);
    addCandidate({ source, target, weight, shared: [label] });
  };

  for (const group of CURATED_GROUPS) {
    const present = group.members.filter((title) => indexByTitle.has(title));
    for (let i = 0; i < present.length - 1; i++) {
      addCurated(present[i], present[i + 1], group.label, 1);
    }
  }
  for (const pair of CURATED_PAIRS) {
    addCurated(pair.source, pair.target, pair.label, pair.weight);
  }

  // Greedy pick, strongest first, capped per node and per primary tag.
  const sorted = [...candidates].sort(
    (a, b) => b.weight - a.weight || a.source - b.source || a.target - b.target,
  );
  const selected = new Map<string, Candidate>();
  const perNode = new Array<number>(items.length).fill(0);
  const perTag = new Map<string, number>();

  const select = (edge: Candidate) => {
    const key = pairKey(edge.source, edge.target);
    if (selected.has(key)) return;
    selected.set(key, edge);
    perNode[edge.source] += 1;
    perNode[edge.target] += 1;
    const tag = rankShared(edge.shared, frequency)[0];
    perTag.set(tag, (perTag.get(tag) ?? 0) + 1);
  };

  for (const edge of sorted) {
    const tag = rankShared(edge.shared, frequency)[0];
    if (
      perNode[edge.source] >= MAX_EDGES_PER_NODE ||
      perNode[edge.target] >= MAX_EDGES_PER_NODE ||
      (perTag.get(tag) ?? 0) >= edgeLimitForTag(tag, frequency)
    ) {
      continue;
    }
    select(edge);
  }

  // Every project keeps at least one link: its strongest candidate, or failing
  // that its best tag overlap (same cluster first).
  const clusters = items.map(classifyProject);
  for (let i = 0; i < items.length; i++) {
    if (perNode[i] > 0) continue;
    const fallback = sorted.find((edge) => edge.source === i || edge.target === i);
    if (fallback) {
      select(fallback);
      continue;
    }
    const own = new Set(tagsByProject[i]);
    const bestFor = (sameCluster: boolean) => {
      let best: Candidate | null = null;
      for (let j = 0; j < items.length; j++) {
        if (j === i || (sameCluster && clusters[j] !== clusters[i])) continue;
        const shared = tagsByProject[j].filter((tag) => own.has(tag));
        if (shared.length === 0) continue;
        const weight = scoreShared(shared, frequency);
        if (!best || weight > best.weight) best = { source: i, target: j, weight, shared };
      }
      return best;
    };
    const best = bestFor(true) ?? bestFor(false);
    if (best) select(best);
  }

  const edges: GraphEdge[] = Array.from(selected.values()).map((edge) => ({
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
    reason: rankShared(edge.shared, frequency)
      .slice(0, 3)
      .map((tag) => labels.get(tag) ?? tag)
      .join(", "),
  }));

  const neighbours: GraphNeighbour[][] = items.map(() => []);
  for (const edge of edges) {
    neighbours[edge.source].push({ index: edge.target, weight: edge.weight, reason: edge.reason });
    neighbours[edge.target].push({ index: edge.source, weight: edge.weight, reason: edge.reason });
  }
  for (const list of neighbours) list.sort((a, b) => b.weight - a.weight);

  const nodes: GraphNode[] = items.map((project, index) => ({
    id: project.title,
    index,
    project,
    cluster: clusters[index],
    linkCount: neighbours[index].length,
    strength: neighbours[index].reduce((sum, link) => sum + link.weight, 0),
  }));

  return { nodes, edges, neighbours };
}
