import type { LucideIcon } from "lucide-react";
import {
  Code2,
  Layout,
  Server,
  Database,
  Cpu,
  Wrench,
} from "lucide-react";

export type SkillGroup = {
  id: string;
  title: string;
  icon: LucideIcon;
  items: string[];
};

export const skillGroups: SkillGroup[] = [
  {
    id: "languages",
    title: "Languages",
    icon: Code2,
    items: [
      "C#",
      "C++",
      "Java",
      "JavaScript",
      "TypeScript",
      "SQL",
      "HTML",
      "CSS",
    ],
  },
  {
    id: "frontend",
    title: "Frontend",
    icon: Layout,
    items: [
      "React",
      "Vue 3",
      "React Native + Expo",
      "Tailwind CSS",
      "MUI (Material UI)",
      "Vite",
    ],
  },
  {
    id: "backend",
    title: "Backend & APIs",
    icon: Server,
    items: [
      "ASP.NET Core",
      "Node.js + Express",
      "Entity Framework Core",
      "REST APIs",
      "Socket.IO",
      "gRPC + Protobuf",
      "JWT Authentication",
    ],
  },
  {
    id: "databases",
    title: "Databases",
    icon: Database,
    items: [
      "MongoDB",
      "SQL Server",
      "SQLite",
      "Firebase Firestore",
      "Database Design",
      "Normalization",
    ],
  },
  {
    id: "engineering",
    title: "Engineering",
    icon: Cpu,
    items: [
      "Object-Oriented Programming",
      "Data Structures & Algorithms",
      "Design Patterns",
      "Concurrency & Async",
      "Testing (Jest, xUnit)",
    ],
  },
  {
    id: "tools",
    title: "Tools",
    icon: Wrench,
    items: [
      "Git / GitHub",
      "GitHub Actions",
      "Visual Studio",
      "VS Code",
      "Swagger / OpenAPI",
    ],
  },
];
