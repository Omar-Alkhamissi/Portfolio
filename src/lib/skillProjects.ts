import { projects } from "../data/projects";
import { skillGroups } from "../data/skills";

/**
 * Which skills.ts item each project tech or relation string counts as.
 * Patterns run on one string at a time. They are anchored on purpose:
 * when in doubt a skill is left out, so a count never claims more than the data says.
 */
const SKILL_PATTERNS: Record<string, RegExp[]> = {
  // Languages
  "C#": [/^C#/i],
  "C++": [/^C\+\+/i],
  Java: [/^Java\b/i],
  JS: [/^JS$/i, /^JavaScript\b/i],
  TS: [/^TS$/i, /^TypeScript\b/i],
  // Plain SQL, its dialects and the SQL relations. Never "SQL Server", "SQLite" or "PostgreSQL" alone.
  SQL: [/^SQL$/i, /^SQL\s*\//i, /^SQL Procedures$/i, /\bT-SQL\b/i, /\bPLpgSQL\b/i],
  HTML: [/^HTML\b/i],
  CSS: [/^CSS\b/i],

  // Frontend
  React: [/^React\b(?!\s+Native)/i],
  "Vue 3": [/^Vue\b/i],
  Quasar: [/^Quasar\b/i],
  MUI: [/^MUI\b/i],
  Tailwind: [/^Tailwind/i],
  Vite: [/^Vite\b/i],

  // Backend
  "ASP.NET": [/^ASP\.NET/i],
  "Node/Express": [/^Node(\.js)?$/i, /^Express\b/i],
  "REST APIs": [/^REST\b/i],
  gRPC: [/^gRPC\b/i],
  Protobuf: [/^Protobuf\b/i, /^Protocol Buffers\b/i],
  "Socket.IO": [/^Socket\.IO\b/i],
  Swagger: [/^Swagger\b/i, /^OpenAPI\b/i],

  // Databases. Only the tech list names MongoDB: the relation "MongoDB / NoSQL" is also used by a Firestore project.
  "SQL Server": [/^SQL Server\b/i],
  PostgreSQL: [/^PostgreSQL\b/i],
  SQLite: [/^SQLite\b/i],
  MongoDB: [/^MongoDB$/i],
  Mongoose: [/^Mongoose\b/i],
  Firestore: [/^Firestore\b/i],
  "EF Core": [/^EF Core\b/i, /^Entity Framework\b/i],

  // Mobile
  RN: [/^React Native\b/i],
  Expo: [/^Expo\b/i],
  Firebase: [/^Firebase\b/i],
  "Android APK": [/^Android APK\b/i],
  "Local-First": [/^Local-First\b/i],

  // Security / Pay
  JWT: [/^JWT\b/i],
  bcrypt: [/^bcrypt/i],
  PBKDF2: [/^PBKDF2\b/i],
  Stripe: [/^Stripe\b/i],

  // Testing / DevOps
  Jest: [/^Jest$/i],
  Supertest: [/^Supertest\b/i],
  xUnit: [/^xUnit\b/i],
  "Google Test": [/^Google Test\b/i, /^GoogleTest\b/i],
  "GitHub Actions": [/^GitHub Actions\b/i],

  // Architecture
  OOP: [/^OOP$/i],
  "GoF Patterns": [/^Design Patterns$/i, /^GoF\b/i],
  MVC: [/^MVC$/i],
  Observer: [/^Observer$/i],
  "N-tier": [/^N-tier\b/i],
  Repository: [/^Repository$/i],
  Async: [/^Async\b/i],

  // Algorithms / DS
  "Algorithm Design": [/^Algorithms$/i],
  "Data Structures": [/\bData Structures$/i],
  Parsing: [/\bParsing\b/i],
  Recursion: [/^Recursion$/i],
  "Statistical Analysis": [/^Statistics$/i, /^Statistical Analysis$/i],
};

const allSkills: string[] = skillGroups.flatMap((group) => group.items);

function matchSkills(text: string): string[] {
  return allSkills.filter((skill) =>
    (SKILL_PATTERNS[skill] ?? []).some((pattern) => pattern.test(text.trim())),
  );
}

const skillsByTech = new Map<string, string[]>();
const skillsByTitle = new Map<string, string[]>();
const titlesBySkill = new Map<string, string[]>();

for (const skill of allSkills) {
  titlesBySkill.set(skill, []);
}

for (const project of projects) {
  const found = new Set<string>();
  for (const text of [...project.tech, ...project.relations]) {
    for (const skill of matchSkills(text)) {
      found.add(skill);
    }
  }
  const ordered = allSkills.filter((skill) => found.has(skill));
  skillsByTitle.set(project.title, ordered);
  for (const skill of ordered) {
    titlesBySkill.get(skill)?.push(project.title);
  }
  for (const text of project.tech) {
    if (!skillsByTech.has(text)) skillsByTech.set(text, matchSkills(text));
  }
}

/** Titles of every project whose tech or relations include the skill. */
export function projectTitlesForSkill(skill: string): string[] {
  return [...(titlesBySkill.get(skill) ?? [])];
}

export function skillProjectCount(skill: string): number {
  return titlesBySkill.get(skill)?.length ?? 0;
}

/** The skills.ts items one project tech string counts as (for example "React 18" gives "React"). */
export function skillsForTech(tech: string): string[] {
  const known = skillsByTech.get(tech);
  return [...(known ?? matchSkills(tech))];
}

export function skillsForProject(title: string): string[] {
  return [...(skillsByTitle.get(title) ?? [])];
}
