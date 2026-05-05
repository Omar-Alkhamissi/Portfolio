import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Github,
  MousePointer2,
  Pin,
} from "lucide-react";
import { projects, type Project } from "../data/projects";

type ClusterKey = "web" | "dotnet" | "systems" | "data" | "other";
type LabelPlacement = "left" | "right" | "top" | "bottom";
type PreviewMode = "hovered" | "pinned" | "idle";

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
};

const VIEWBOX_W = 1000;
const VIEWBOX_H = 700;
const CENTER_X = VIEWBOX_W / 2;
const CENTER_Y = VIEWBOX_H / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const NODE_RADIUS = 24;
const LABEL_GAP = 10;

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
  "c#": 0.7,
  grpc: 1.3,
  protobuf: 0.95,
  swagger: 0.45,
  quasar: 0.55,
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

const CLUSTER_CENTERS: Record<ClusterKey, { x: number; y: number }> = {
  web: { x: 250, y: 210 },
  dotnet: { x: 745, y: 220 },
  systems: { x: 295, y: 520 },
  data: { x: 760, y: 510 },
  other: { x: 520, y: 105 },
};

const CLUSTER_ANGLE_OFFSETS: Record<ClusterKey, number> = {
  web: -1.2,
  dotnet: -0.25,
  systems: 2.25,
  data: 0.7,
  other: -1.8,
};

const weightOf = (tech: string) => TECH_WEIGHT[tech] ?? 0.4;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateLabelWidth(title: string) {
  return clamp(68 + title.length * 2.55, 92, 150);
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
  if (lower === "sql server") return ["sql server"];
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
  if (lower === "stored procedures") return ["stored procedures"];
  if (lower === "t-sql") return ["t-sql", "sql server"];
  if (lower === "csvhelper") return ["csvhelper"];
  if (lower === "mui 7" || lower === "mui") return ["mui"];
  if (lower === "socket.io") return ["socketio"];
  if (lower === "jwt") return ["jwt"];
  if (lower === "stripe") return ["stripe"];

  return [lower];
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

  if (
    /(react|node\.js|express|socket\.io|mongodb|firebase|firestore|expo|mui)/.test(
      tech,
    )
  ) {
    return "web";
  }

  if (/(asp\.net|c#|\.net|ef core|grpc|csvhelper|quasar|xunit|swagger)/.test(tech)) {
    return "dotnet";
  }

  if (/(c\+\+|stl|raii|shared_ptr|templates|recursive parsing)/.test(tech)) {
    return "systems";
  }

  if (/(sql server|t-sql|stored procedures)/.test(tech)) {
    return "data";
  }

  return "other";
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

  const expandedTech = items.map((project) =>
    Array.from(new Set(project.tech.flatMap((tech) => expandTechTags(tech)))),
  );
  const techFrequency = new Map<string, number>();

  for (const tags of expandedTech) {
    for (const tech of tags) {
      techFrequency.set(tech, (techFrequency.get(tech) ?? 0) + 1);
    }
  }

  const candidateEdges: Edge[] = [];

  for (let i = 0; i < items.length; i++) {
    const aTech = new Set(expandedTech[i]);

    for (let j = i + 1; j < items.length; j++) {
      const shared = expandedTech[j].filter((tech) => aTech.has(tech));

      if (shared.length > 0) {
        const weight = scoreSharedTech(shared, techFrequency);
        const meaningfulShared = shared.filter((tech) => weightOf(tech) >= 0.5);

        if (weight < 0.42 || meaningfulShared.length === 0) {
          continue;
        }

        candidateEdges.push({
          source: items[i].title,
          target: items[j].title,
          weight,
          shared,
        });
      }
    }
  }

  const byNode = new Map<string, Edge[]>();

  for (const edge of candidateEdges) {
    const sourceList = byNode.get(edge.source) ?? [];
    sourceList.push(edge);
    byNode.set(edge.source, sourceList);

    const targetList = byNode.get(edge.target) ?? [];
    targetList.push(edge);
    byNode.set(edge.target, targetList);
  }

  const retained = new Set<string>();

  for (const edge of candidateEdges) {
    const meaningfulShared = edge.shared.filter(
      (tech) => weightOf(tech) >= 0.7,
    ).length;

    if (edge.weight >= 0.95 || meaningfulShared >= 2) {
      retained.add(`${edge.source}--${edge.target}`);
    }
  }

  for (const node of nodes) {
    const strongest = (byNode.get(node.id) ?? [])
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2);

    for (const edge of strongest) {
      retained.add(`${edge.source}--${edge.target}`);
    }
  }

  const edges = candidateEdges.filter((edge) =>
    retained.has(`${edge.source}--${edge.target}`),
  );

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
          clusterNodes.length === 1 ? 0 : 14 + Math.sqrt(index + 0.45) * 56;
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
  const repulsion = 11500;
  const damping = 0.82;
  const homePull = 0.035;
  const centerPull = 0.004;

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

        const minDistance = 78 + (a.labelWidth + b.labelWidth) * 0.18;
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
      const desiredLength = 205 - Math.min(edge.weight, 3) * 34;
      const springK = 0.013 + Math.min(edge.weight, 3) * 0.012;
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

function getLabelStyle(node: Node) {
  const placement = getLabelPlacement(node);

  if (placement === "right") {
    return {
      left: `${NODE_RADIUS + LABEL_GAP}px`,
      top: "0px",
      transform: "translateY(-50%)",
      textAlign: "left" as const,
      width: `${node.labelWidth}px`,
    };
  }

  if (placement === "left") {
    return {
      left: `${-(NODE_RADIUS + LABEL_GAP + node.labelWidth)}px`,
      top: "0px",
      transform: "translateY(-50%)",
      textAlign: "right" as const,
      width: `${node.labelWidth}px`,
    };
  }

  if (placement === "top") {
    return {
      left: "0px",
      top: `${-(NODE_RADIUS + LABEL_GAP + node.labelHeight)}px`,
      transform: "translateX(-50%)",
      textAlign: "center" as const,
      width: `${node.labelWidth}px`,
    };
  }

  return {
    left: "0px",
    top: `${NODE_RADIUS + LABEL_GAP}px`,
    transform: "translateX(-50%)",
    textAlign: "center" as const,
    width: `${node.labelWidth}px`,
  };
}

export function ProjectGraph() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [lastViewedId, setLastViewedId] = useState<string>(projects[0].title);

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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-center gap-4 font-mono text-[11px] text-zinc-500 lg:justify-start">
          <span className="inline-flex items-center gap-2">
            <span className="grid h-4 w-4 place-items-center rounded-md border border-accent/40 bg-accent/10 text-accent">
              <MousePointer2 size={9} />
            </span>
            Hover a node
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="grid h-4 w-4 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-300">
              <Pin size={9} />
            </span>
            Click to pin
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-px w-6 bg-accent/40" />
            Shared technology
          </span>
        </div>

        <div className="glass relative overflow-hidden p-3 sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(125,211,252,0.06),transparent_38%)]" />
          <div className="grid-overlay pointer-events-none absolute inset-0 opacity-50" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.03] to-transparent" />

          <div
            className="relative aspect-[10/7] w-full"
            onMouseLeave={() => setHoveredId(null)}
          >
            <svg
              viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              {edges.map((edge) => {
                const source = nodeById.get(edge.source)!;
                const target = nodeById.get(edge.target)!;
                const highlight = isEdgeHighlighted(edge);
                const idleWidth = Math.min(0.55 + edge.weight * 0.24, 1.45);
                const activeWidth = Math.min(0.95 + edge.weight * 0.42, 2.35);

                return (
                  <motion.line
                    key={`${edge.source}--${edge.target}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="rgb(125 211 252)"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{
                      pathLength: 1,
                      opacity: activeId ? (highlight ? 0.72 : 0.12) : 0.34,
                      strokeWidth: activeId
                        ? (highlight ? activeWidth : 0.55)
                        : idleWidth,
                    }}
                    transition={{
                      pathLength: { duration: 0.7, ease: "easeOut" },
                      opacity: { duration: 0.22, ease: "easeOut" },
                      strokeWidth: {
                        type: "spring",
                        stiffness: 240,
                        damping: 28,
                      },
                    }}
                  />
                );
              })}
            </svg>

            <div className="absolute inset-0">
              {nodes.map((node) => {
                const Icon = node.project.icon;
                const focused = activeId === node.id;
                const dim = !isHighlighted(node.id);
                const xPct = (node.x / VIEWBOX_W) * 100;
                const yPct = (node.y / VIEWBOX_H) * 100;

                return (
                  <motion.button
                    key={node.id}
                    type="button"
                    initial={{ opacity: 0, scale: 0.82 }}
                    animate={{
                      opacity: dim ? 0.34 : 1,
                      scale: focused ? 1.065 : 1,
                    }}
                    transition={{
                      opacity: { duration: 0.2, ease: "easeOut" },
                      scale: {
                        type: "spring",
                        stiffness: 320,
                        damping: 24,
                        mass: 0.8,
                      },
                    }}
                    style={{
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      transform: "translate(-50%, -50%)",
                      zIndex: focused ? 30 : dim ? 5 : 15,
                    }}
                    className="absolute h-0 w-0 appearance-none border-0 bg-transparent p-0 cursor-pointer"
                    onMouseEnter={() => setHoveredId(node.id)}
                    onFocus={() => setHoveredId(node.id)}
                    onBlur={() => setHoveredId(null)}
                    onClick={() =>
                      setPinnedId((current) => (current === node.id ? null : node.id))
                    }
                    aria-pressed={pinnedId === node.id}
                    aria-label={`Preview ${node.id}`}
                  >
                    {focused && (
                      <motion.span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 top-0 h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 rounded-[1.4rem] bg-accent/15 blur-md"
                        initial={{ opacity: 0.22, scale: 0.98 }}
                        animate={{ opacity: [0.22, 0.38, 0.22], scale: [1, 1.16, 1] }}
                        transition={{
                          duration: 2.2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                    )}

                    <span
                      className={[
                        "absolute left-0 top-0 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border transition-all duration-300 ease-out",
                        focused
                          ? "border-accent/70 bg-accent/15 text-accent shadow-[0_0_22px_rgba(125,211,252,0.4)]"
                          : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]",
                      ].join(" ")}
                    >
                      <Icon size={16} aria-hidden="true" />
                    </span>

                    <span
                      style={getLabelStyle(node)}
                      className={[
                        "pointer-events-none absolute px-1.5 pt-1 font-mono text-[10px] leading-[1.1] tracking-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)] transition-colors duration-300 ease-out",
                        focused
                          ? "text-zinc-100"
                          : dim
                            ? "text-zinc-600"
                            : "text-zinc-400",
                      ].join(" ")}
                    >
                      {node.project.title}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start" aria-live="polite">
        <PreviewCard project={previewProject} mode={previewMode} />
      </aside>
    </div>
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
      className="glass flex h-full flex-col p-6"
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

      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight tracking-tight text-zinc-100">
            {project.title}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">{project.blurb}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-zinc-300">
        {project.description}
      </p>

      <ul className="mt-4 space-y-2">
        {project.bullets.slice(0, 2).map((b) => (
          <li
            key={b}
            className="flex gap-2 text-[12.5px] leading-relaxed text-zinc-400"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 inline-block h-px w-2.5 shrink-0 bg-accent/60"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <ul className="mt-4 flex flex-wrap gap-1">
        {project.tech.slice(0, 6).map((t) => (
          <li key={t} className="badge text-[10px]">
            {t}
          </li>
        ))}
        {project.tech.length > 6 && (
          <li className="badge text-[10px] text-zinc-500">
            +{project.tech.length - 6}
          </li>
        )}
      </ul>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
        <a
          href={project.github}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        >
          <Github size={12} aria-hidden="true" /> GitHub
        </a>
        {project.liveDemo && (
          <a
            href={project.liveDemo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent hover:border-accent/60 hover:bg-accent/15"
          >
            <ExternalLink size={12} aria-hidden="true" /> Live
          </a>
        )}
      </div>
    </motion.div>
  );
}
