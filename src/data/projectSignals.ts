import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Gauge, GraduationCap, Network } from "lucide-react";

export type ProjectSignalTone = "sky" | "emerald" | "amber" | "violet";

export type ProjectSignal = {
  label: string;
  value: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: ProjectSignalTone;
};

export const projectSignals: ProjectSignal[] = [
  {
    label: "Mapped work",
    value: "30+ projects",
    title: "Breadth with structure",
    description:
      "The graph groups projects by shared stack, architecture, data, and platform choices so the range is easier to evaluate.",
    icon: Network,
    tone: "sky",
  },
  {
    label: "Evidence",
    value: "Metrics first",
    title: "Proof over adjectives",
    description:
      "Project previews surface concrete signals like test suites, service counts, data models, routes, LOC, and deployment details.",
    icon: BadgeCheck,
    tone: "emerald",
  },
  {
    label: "Performance",
    value: "Adaptive UI",
    title: "Polish that knows when to back off",
    description:
      "Visual quality responds to viewport size, device pixel ratio, reduced motion, debug flags, and active graph dragging.",
    icon: Gauge,
    tone: "amber",
  },
  {
    label: "Reviewer read",
    value: "What it proves",
    title: "A teaching layer for the portfolio",
    description:
      "The page translates coursework and builds into engineering signals: APIs, OOP, algorithms, databases, testing, and maintainability.",
    icon: GraduationCap,
    tone: "violet",
  },
];
