import { motion } from "framer-motion";
import {
  ArrowRight,
  Download,
  Github,
  Linkedin,
  MapPin,
} from "lucide-react";
import { site } from "../data/site";

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

const noFill = {
  "data-lpignore": "true",
  "data-1p-ignore": "",
  "data-bwignore": "true",
  "data-dashlane-ignore": "true",
  "data-form-type": "other",
  autoComplete: "off",
} as const;

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28"
      aria-labelledby="hero-heading"
    >
      {/* Decorative grid + glow */}
      <div className="grid-overlay pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

      <div className="section">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col items-start"
        >
          {/* Status pill */}
          <motion.div variants={item} className="mb-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Available for opportunities
            </span>
          </motion.div>

          {/* Eyebrow */}
          <motion.div variants={item} className="mb-4">
            <span className="font-mono text-sm text-accent">
              <span className="opacity-60">~$</span> whoami
            </span>
          </motion.div>

          {/* Name */}
          <motion.h1
            id="hero-heading"
            variants={item}
            className="text-balance text-5xl font-semibold tracking-tight text-gradient sm:text-6xl lg:text-7xl"
          >
            {site.name}
          </motion.h1>

          {/* Title line */}
          <motion.p
            variants={item}
            className="mt-4 font-mono text-base text-zinc-300 sm:text-lg"
          >
            <span className="text-accent">&gt;</span> {site.title}
            <span className="ml-1 inline-block h-4 w-2 translate-y-[2px] animate-pulse bg-accent" />
          </motion.p>

          {/* Subtitle */}
          <motion.p
            variants={item}
            className="mt-6 max-w-2xl text-balance text-lg leading-relaxed text-zinc-400 sm:text-xl"
          >
            {site.subtitle}
          </motion.p>

          {/* Intro paragraph */}
          <motion.p
            variants={item}
            className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-500"
          >
            {site.intro}
          </motion.p>

          {/* Meta row */}
          <motion.div
            variants={item}
            className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-zinc-500"
          >
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={13} className="text-accent/70" aria-hidden="true" />
              {site.location}
            </span>
            <span className="hidden h-3 w-px bg-white/10 sm:block" />
            <span>Computer Programming &amp; Analysis @ Fanshawe College</span>
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            variants={item}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <a
              href="#projects"
              {...noFill}
              className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-ink-950 transition-all hover:bg-zinc-100 hover:shadow-glow"
            >
              View Projects
              <ArrowRight
                size={16}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>
            <a
              href={site.links.resume}
              download
              {...noFill}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <Download size={16} aria-hidden="true" />
              Download Resume
            </a>
            <a
              href={site.links.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub profile"
              {...noFill}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              <Github size={16} aria-hidden="true" />
              GitHub
            </a>
            <a
              href={site.links.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn profile"
              {...noFill}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              <Linkedin size={16} aria-hidden="true" />
              LinkedIn
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
