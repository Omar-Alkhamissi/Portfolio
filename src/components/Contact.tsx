import { motion } from "framer-motion";
import { Download, Github, Linkedin, Mail } from "lucide-react";
import { site } from "../data/site";

const noFill = {
  "data-lpignore": "true",
  "data-1p-ignore": "",
  "data-bwignore": "true",
  "data-dashlane-ignore": "true",
  "data-form-type": "other",
  autoComplete: "off",
} as const;

export function Contact() {
  return (
    <section
      id="contact"
      className="scroll-mt-20 py-24 sm:py-32"
      aria-labelledby="contact-heading"
    >
      <div className="section">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="glass relative overflow-hidden p-8 sm:p-12 lg:p-16"
        >
          {/* Decorative glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[80%] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
          />

          <div className="relative">
            <span className="eyebrow">
              <span className="h-px w-6 bg-accent/60" />
              05 / Contact
            </span>
            <h2
              id="contact-heading"
              className="mt-4 text-3xl font-semibold tracking-tight text-gradient sm:text-4xl"
            >
              Let's build something.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400">
              I'm open to internships, junior roles, and collaboration on
              interesting projects. Reach out via email or any of the links
              below — happy to chat.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${site.email}`}
                {...noFill}
                className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-ink-950 transition-all hover:bg-zinc-100 hover:shadow-glow"
              >
                <Mail size={16} aria-hidden="true" />
                {site.email}
              </a>
              <a
                href={site.links.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub profile"
                {...noFill}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
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
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <Linkedin size={16} aria-hidden="true" />
                LinkedIn
              </a>
              <a
                href={site.links.resume}
                download
                {...noFill}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <Download size={16} aria-hidden="true" />
                Resume
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
