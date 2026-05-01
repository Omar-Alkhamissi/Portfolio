import { motion } from "framer-motion";
import { skillGroups } from "../data/skills";
import { SectionHeading } from "./SectionHeading";

export function Skills() {
  return (
    <section id="skills" className="scroll-mt-20 py-24 sm:py-32">
      <div className="section">
        <SectionHeading
          id="skills-heading"
          eyebrow="02 / Skills"
          title="Tools, languages, and frameworks."
          description="A snapshot of the technologies I use most often across coursework and personal projects."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {skillGroups.map((group, i) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.5,
                ease: "easeOut",
                delay: i * 0.05,
              }}
              className="glass glass-hover p-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium tracking-tight text-zinc-100">
                  {group.title}
                </h3>
                <div className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-accent">
                  <group.icon size={15} />
                </div>
              </div>

              <ul className="mt-5 flex flex-wrap gap-1.5">
                {group.items.map((s) => (
                  <li key={s} className="badge">
                    {s}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
