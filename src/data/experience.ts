import type { LucideIcon } from "lucide-react";
import { GraduationCap, Briefcase } from "lucide-react";

export type TimelineItem = {
  id: string;
  type: "education" | "experience";
  icon: LucideIcon;
  title: string;
  org: string;
  date: string;
  location?: string;
  bullets: string[];
};

export const timeline: TimelineItem[] = [
  {
    id: "software-development",
    type: "education",
    icon: GraduationCap,
    title: "Software Development Program",
    org: "Applied software training",
    date: "Expected 2026",
    location: "London, Ontario",
    bullets: [
      "Built a strong base in object-oriented programming, data structures, databases, and full-stack web development.",
      "Delivered hands-on projects in C++, C#, .NET, JavaScript, SQL Server, and PostgreSQL.",
      "Focused on maintainable code, practical architecture, and clear technical communication.",
    ],
  },
  {
    id: "freelance",
    type: "experience",
    icon: Briefcase,
    title: "Freelance Front-End Developer",
    org: "Independent",
    date: "Ongoing",
    bullets: [
      "Built responsive pages and improved layouts for small clients.",
      "Worked with HTML, CSS, JavaScript, and modern UI patterns to deliver clean, accessible interfaces.",
      "Communicated directly with clients to refine designs based on iterative feedback.",
    ],
  },
];
