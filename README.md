# Omar Alkhamissi Portfolio

This is a React and TypeScript portfolio site for presenting projects, skills, experience, and contact information. The app uses motion, custom data modules, and responsive Tailwind styling.

## Features

- Responsive portfolio layout with section navigation
- Project and skill data stored in typed modules
- Animated background and interactive project graph
- Resume asset served from `public/`
- Performance helper utilities for heavier visual components

## Tech Stack

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- Framer Motion
- Lucide React icons

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Project Structure

- `src/components/`: page sections and interactive visual components
- `src/data/`: projects, skills, site metadata, and experience data
- `src/lib/`: helpers and performance utilities
- `public/`: static assets, including the resume PDF
