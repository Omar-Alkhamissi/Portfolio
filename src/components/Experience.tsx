import { motion } from "framer-motion";
import { timeline } from "../data/experience";
import { SectionHeading } from "./SectionHeading";

const typeLabel: Record<string, string> = {
  education: "Education",
  experience: "Experience",
  leadership: "Leadership",
};

export function Experience() {
  return (
    <section id="experience" className="scroll-mt-20 py-24 sm:py-32">
      <div className="section">
        <SectionHeading
          id="experience-heading"
          eyebrow="04 / Experience"
          title="Education, work, and leadership."
          description="Where I'm studying, what I've built for clients, and how I'm involved on campus."
        />

        <ol className="mt-12 relative">
          {/* Vertical timeline rail */}
          <div
            aria-hidden="true"
            className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-accent/40 via-white/10 to-transparent sm:left-[19px]"
          />

          {timeline.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.5,
                ease: "easeOut",
                delay: i * 0.06,
              }}
              className="relative pl-12 pb-10 last:pb-0 sm:pl-14"
            >
              {/* Node */}
              <div
                aria-hidden="true"
                className="absolute left-0 top-1 grid h-[31px] w-[31px] place-items-center rounded-full border border-white/10 bg-ink-900 text-accent sm:h-[39px] sm:w-[39px]"
              >
                <item.icon size={14} className="sm:hidden" />
                <item.icon size={17} className="hidden sm:block" />
              </div>

              {/* Card */}
              <div className="glass glass-hover p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
                    {typeLabel[item.type]}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {item.date}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-medium text-zinc-100">
                  {item.title}
                </h3>
                <p className="text-sm text-zinc-400">
                  {item.org}
                  {item.location && (
                    <span className="text-zinc-600"> · {item.location}</span>
                  )}
                </p>
                <ul className="mt-4 space-y-2">
                  {item.bullets.map((b) => (
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
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
