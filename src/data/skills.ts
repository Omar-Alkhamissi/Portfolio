import type { LucideIcon } from "lucide-react";
import {
  Binary,
  Blocks,
  Code2,
  Database,
  FlaskConical,
  Layout,
  Server,
  ShieldCheck,
  Smartphone,
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
    items: ["C#", "C++", "Java", "JS", "TS", "SQL", "HTML", "CSS"],
  },
  {
    id: "frontend",
    title: "Frontend",
    icon: Layout,
    items: ["React", "Vue 3", "Quasar", "MUI", "Tailwind", "Vite"],
  },
  {
    id: "backend",
    title: "Backend",
    icon: Server,
    items: [
      "ASP.NET",
      "Node/Express",
      "REST APIs",
      "gRPC",
      "Protobuf",
      "Socket.IO",
      "Swagger",
    ],
  },
  {
    id: "databases",
    title: "Databases",
    icon: Database,
    items: [
      "SQL Server",
      "PostgreSQL",
      "SQLite",
      "MongoDB",
      "Mongoose",
      "Firestore",
      "EF Core",
    ],
  },
  {
    id: "mobile",
    title: "Mobile",
    icon: Smartphone,
    items: ["RN", "Expo", "Firebase", "Android APK", "Local-First"],
  },
  {
    id: "security",
    title: "Security / Pay",
    icon: ShieldCheck,
    items: ["JWT", "bcrypt", "PBKDF2", "Stripe"],
  },
  {
    id: "testing",
    title: "Testing / DevOps",
    icon: FlaskConical,
    items: ["Jest", "Supertest", "xUnit", "Google Test", "GitHub Actions"],
  },
  {
    id: "architecture",
    title: "Architecture",
    icon: Blocks,
    items: ["OOP", "GoF Patterns", "MVC", "Observer", "N-tier", "Repository", "Async"],
  },
  {
    id: "algorithms",
    title: "Algorithms / DS",
    icon: Binary,
    items: [
      "Algorithm Design",
      "Data Structures",
      "Parsing",
      "Recursion",
      "Statistical Analysis",
    ],
  },
];
