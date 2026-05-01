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
    id: "fanshawe",
    type: "education",
    icon: GraduationCap,
    title: "Computer Programming & Analysis",
    org: "Fanshawe College",
    date: "Expected 2026",
    location: "London, Ontario",
    bullets: [
      "GPA: 3.91 — two-time Dean's List recipient.",
      "Coursework across object-oriented programming, data structures, databases, and full-stack web development.",
      "Hands-on projects in C++, C#, .NET, JavaScript, SQL Server, and PostgreSQL.",
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
