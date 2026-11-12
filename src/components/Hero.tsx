import { motion } from "framer-motion";
import { Github, Linkedin } from "lucide-react";
import { site } from "../data/site";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE_OUT },
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

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function Hero() {
  return (
    <section
      id="top"
      className="scroll-mt-20 pt-[120px] md:pt-[160px]"
      aria-labelledby="hero-heading"
    >
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="section"
      >
        <motion.p
          variants={item}
          className="flex flex-wrap gap-x-4 text-14 text-fg-muted"
        >
          <span>{site.location}</span>
          <span>Available for opportunities</span>
        </motion.p>

        <motion.h1
          id="hero-heading"
          variants={item}
          className="mt-6 text-[clamp(44px,7vw,88px)] font-light leading-[1.02] tracking-hero text-fg"
        >
          {site.name}
        </motion.h1>

        <motion.p
          variants={item}
          className="mt-4 text-21 font-medium text-fg md:text-28"
        >
          {sentenceCase(site.title)}
        </motion.p>

        <motion.div variants={item} className="mt-8 max-w-[60ch] space-y-4">
          <p className="text-16 text-fg">{site.subtitle}</p>
          <p className="text-16 text-fg-muted">{site.intro}</p>
        </motion.div>

        <motion.div
          variants={item}
          className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4"
        >
          <a href={site.links.resume} download {...noFill} className="btn-primary">
            Download resume
          </a>
          <a
            href={site.links.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub profile"
            {...noFill}
            className="link inline-flex items-center gap-2 text-14"
          >
            <Github size={16} strokeWidth={1.5} aria-hidden="true" />
            GitHub
          </a>
          <a
            href={site.links.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn profile"
            {...noFill}
            className="link inline-flex items-center gap-2 text-14"
          >
            <Linkedin size={16} strokeWidth={1.5} aria-hidden="true" />
            LinkedIn
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
