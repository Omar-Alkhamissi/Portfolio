# Omar Alkhamissi — Portfolio

A modern, dark, glass-card portfolio built with React + TypeScript + Vite + Tailwind, deployed to GitHub Pages.

## Stack
- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3
- Framer Motion (subtle entrance + scroll animations)
- Lucide React icons
- No router, no backend, no database — pure static site

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
npm run preview   # preview the production build
```

## Where to edit content

All content lives in `src/data/`:

- `src/data/site.ts` — name, title, email, GitHub, LinkedIn, resume path, nav links
- `src/data/skills.ts` — grouped skill categories
- `src/data/projects.ts` — project cards (title, description, tech, bullets, GitHub, optional liveDemo)
- `src/data/experience.ts` — education + work + leadership timeline

Most edits are one-liners — no JSX changes needed.

## Resume

Drop your resume PDF at `public/resume.pdf`. The "Download Resume" buttons already link there.

(Your resume currently lives at https://github.com/Omar-Alkhamissi/Resume. Download `Omar Alkhamissi's Resume.pdf` from there, rename to `resume.pdf`, and place in `public/`.)

## Deploy to GitHub Pages

### 1. Set the Vite base path

Open `vite.config.ts` and set `base` based on the repo name:

- If your repo is named `<your-username>.github.io` (a user site) → `base: "/"`
- If your repo is named anything else like `portfolio` (a project site) → `base: "/portfolio/"`

The default in this project is `"/portfolio/"`.

### 2. Push to GitHub

```bash
git init
git add .
git commit -m "Initial portfolio"
git branch -M main
git remote add origin https://github.com/Omar-Alkhamissi/<repo-name>.git
git push -u origin main
```

### 3. Enable GitHub Pages

On the repo page:

1. Go to **Settings** → **Pages**
2. Under **Build and deployment** → **Source**, select **GitHub Actions**
3. That's it — pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and deploys

Your site will be live at:

- User site: `https://<your-username>.github.io/`
- Project site: `https://<your-username>.github.io/<repo-name>/`

### 4. Workflow status

Track the build under the **Actions** tab. The first deploy takes about a minute.

## File structure

```
.
├── .github/workflows/deploy.yml      GitHub Pages deploy workflow
├── public/
│   ├── favicon.svg
│   └── resume.pdf                    (you add this)
├── src/
│   ├── components/                   Section components
│   ├── data/                         All editable content
│   ├── lib/                          Small utilities
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── tsconfig*.json
└── vite.config.ts
```

## Accessibility notes
- Semantic landmarks (`header`, `main`, `footer`, `section`, `nav`)
- `aria-label`s on icon-only links
- `prefers-reduced-motion` honored
- High-contrast text on a dark background, focus styles preserved

## License
Personal portfolio — feel free to fork and adapt for your own use.
