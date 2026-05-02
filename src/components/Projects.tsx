import { motion } from "framer-motion";
import { ArrowUpRight, ExternalLink, Github } from "lucide-react";
import { projects } from "../data/projects";
import { SectionHeading } from "./SectionHeading";

const noFill = {
  "data-lpignore": "true",
  "data-1p-ignore": "",
  "data-bwignore": "true",
  "data-dashlane-ignore": "true",
  "data-form-type": "other",
  autoComplete: "off",
} as const;

export function Projects() {
  return (
    <section id="projects" className="scroll-mt-20 py-24 sm:py-32">
      <div className="section">
        <SectionHeading
          id="projects-heading"
          eyebrow="03 / Selected Work"
          title="Projects I've built and shipped."
          description="A mix of coursework deep-dives and personal builds. Each one tries to solve a small, concrete problem with clean structure and readable code."
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {projects.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.55,
                ease: "easeOut",
                delay: (i % 2) * 0.06,
              }}
              className="group glass glass-hover relative flex flex-col p-7 sm:p-8"
            >
              {/* title + blurb */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-100">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-400">{p.blurb}</p>
                </div>
                <ArrowUpRight
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-zinc-600 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
                />
              </div>

              {/* description */}
              <p className="mt-5 text-sm leading-relaxed text-zinc-300">
                {p.description}
              </p>

              {/* bullets */}
              <ul className="mt-5 space-y-2">
                {p.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex gap-2.5 text-sm leading-relaxed text-zinc-400"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 inline-block h-px w-3 shrink-0 bg-accent/60"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              {/* tech badges */}
              <ul className="mt-6 flex flex-wrap gap-1.5">
                {p.tech.map((t) => (
                  <li key={t} className="badge">
                    {t}
                  </li>
                ))}
              </ul>

              {/* actions */}
              <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-5">
                <a
                  href={p.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p.title} on GitHub`}
                  {...noFill}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                >
                  <Github size={13} aria-hidden="true" />
                  GitHub
                </a>
                {p.liveDemo && (
                  <a
                    href={p.liveDemo}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${p.title} live demo`}
                    {...noFill}
                    className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent/60 hover:bg-accent/15"
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    Live Demo
                  </a>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
