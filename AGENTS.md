# Repository Guidelines

## Project Overview

This repository is Omar Alkhamissi's portfolio site: a React 18 + TypeScript single-page app built with Vite 5, Tailwind CSS, Framer Motion, and Lucide React icons. It presents profile content, skills, projects, experience, contact links, a resume PDF, and custom interactive visualizations.

The production build is deployed to GitHub Pages from `main`. Vite is configured with `base: "/Portfolio/"`, so keep asset URLs and route assumptions compatible with that subpath.

## Important Paths

- `src/App.tsx` composes the page sections and global background.
- `src/main.tsx` mounts React and resets initial scroll position unless a hash is present.
- `src/components/` contains section components and the interactive visual systems.
- `src/components/ProjectGraph.tsx` is the largest and most performance-sensitive component; it builds the project relationship graph from `src/data/projects.ts`.
- `src/components/ProjectSignals.tsx` renders the lightweight reviewer/instructor evidence cards from `src/data/projectSignals.ts`.
- `src/components/SolarSystem.tsx` renders the animated skills visualization from `src/data/skills.ts`.
- `src/components/AnimatedBackground.tsx` owns the canvas starfield/nebula background.
- `src/data/` is the main content layer for site metadata, project data, skills, and timeline entries.
- `src/lib/performance.ts` centralizes adaptive quality profiles, debug flags, and graph/background coordination events.
- `public/` contains static assets, including `Omar_Alkhamissi_Resume.pdf` and `favicon.svg`.
- `.github/workflows/deploy.yml` builds and deploys `dist` to GitHub Pages.

## Development Commands

- `npm install` installs dependencies for local development.
- `npm run dev` starts the Vite dev server.
- `npm run dev:lan` starts Vite on `0.0.0.0:5173` with a strict port.
- `npm run build` runs `tsc -b` and `vite build`.
- `npm run preview` previews the production build.
- `npm run preview:lan` previews on `0.0.0.0:4173` with a strict port.
- `npm run lint` is a TypeScript no-emit check via `tsc -b --noEmit`; there is no separate ESLint config in this repo.

The GitHub Pages workflow uses Node 20, `npm ci`, and `npm run build`.

## Testing And Validation

- There are no dedicated unit or integration test files in this repository.
- Use `npm run lint` for type-level validation after TypeScript changes.
- Use `npm run build` before handoff when changes touch source, Tailwind classes, assets, Vite config, or deployment assumptions.
- For visual or interaction changes, run the app locally and inspect the relevant sections at desktop and mobile widths. Pay special attention to the project graph, skills solar system, contact buttons, and fixed navbar behavior.
- Useful browser query/localStorage toggles live in `src/lib/performance.ts`: `quality`/`perfQuality`, `debugPerf=1`, `static`, `noBg`, `flatGraph`, `noWaves`, and `noGlass`.

## Coding Conventions

- Use TypeScript, React function components, and named exports for components/data helpers.
- Follow the existing two-space indentation, double-quoted imports/strings, and semicolon style.
- Prefer Tailwind utilities and the shared component-layer classes in `src/index.css` (`section`, `glass`, `glass-hover`, `eyebrow`, `text-gradient`, `badge`, `bg-grid`, `grid-overlay`).
- Use `cn` from `src/lib/cn.ts` for conditional class strings when it keeps markup readable.
- Use Lucide React icons for UI and data-driven icon fields.
- Keep user-visible content in `src/data/*` when it is portfolio data rather than component structure.
- When enriching project previews, prefer CareerForge-backed logistics/evidence stats such as dates, scope, tests, services, files, and roles over vague promotional copy.
- Preserve accessibility attributes already used in the app, including section labels, `aria-hidden` for decorative elements, button labels, and external-link `rel="noopener noreferrer"`.
- Avoid adding dependencies unless the existing React/Vite/Tailwind/Framer Motion stack cannot reasonably handle the task.

## Architecture Notes

- `src/App.tsx` renders a single-page, hash-anchor portfolio with sections in this order: hero/about, skills, projects, experience, contact, footer.
- `src/data/site.ts` is the single source of truth for name, title, intro, location, email, links, and nav anchors.
- `src/data/projects.ts` defines project records and relation tags. `ProjectGraph.tsx` derives clusters, edges, weights, colors, preview cards, and relationship animation from this data.
- Project preview cards may include structured `stats` fields for CareerForge-backed logistics and claim framing.
- `src/data/skills.ts` defines grouped skills and icons. `SolarSystem.tsx` maps each group to an orbit ring and each skill to a moving planet label.
- Performance behavior is intentionally adaptive. `useAdaptivePerformanceProfile`, `usePerformanceDiagnosticFlags`, and graph drag events coordinate frame rates, filters, background rendering, and static/debug modes.
- Heavy visual components use `requestAnimationFrame`, SVG refs, canvas drawing, `IntersectionObserver`, and reduced-motion checks. When editing them, preserve cleanup paths for timers, animation frames, observers, event listeners, and media queries.
- `Projects.tsx` lazy-loads and delays mounting `ProjectGraph` until near viewport entry or a timeout, which helps initial page load.
- `Skills.tsx` lazy-loads and delays mounting `SolarSystem`; keep a lightweight placeholder fallback for this section.
- The app is static; there is no backend, database, server-side rendering, or runtime environment variable contract in the current code.

## Working Notes For Codex

- Do not casually rewrite `ProjectGraph.tsx`; it is large, tuned, and tightly coupled to project data shape and performance profiles.
- Preserve viewport-aware `React.lazy`/`Suspense` loading for heavy visuals unless replacing it with an equal or better performance strategy.
- Keep `vite.config.ts` base path aligned with GitHub Pages (`/Portfolio/`) unless the deployment target changes.
- Do not edit `public/Omar_Alkhamissi_Resume.pdf` unless the user explicitly asks to update the resume asset.
- Generated/local artifacts such as `node_modules/`, `dist/`, `*.tsbuildinfo`, browser profile folders, and log files should not be treated as source.
- The repo currently has a local `.codex/` directory; treat it as local Codex configuration unless the user asks to modify it.
- If changing animation, SVG, or canvas code, validate with an actual browser run in addition to TypeScript/build checks whenever possible.
