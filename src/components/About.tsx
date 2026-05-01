import { motion } from "framer-motion";
import { Sparkles, Layers, ShieldCheck, Cpu } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const pillars = [
  {
    icon: Sparkles,
    title: "Practical problem solving",
    body: "I focus on building things that actually work — solving real problems with clear, maintainable code rather than over-engineered abstractions.",
  },
  {
    icon: Layers,
    title: "Full-stack curiosity",
    body: "Comfortable across web frontends, backend services, and database design — comfortable picking up new tools when a project needs them.",
  },
  {
    icon: Cpu,
    title: "Strong fundamentals",
    body: "Object-oriented programming, data structures, and algorithms learned through hands-on coursework and personal projects in C++, Java, and C#.",
  },
  {
    icon: ShieldCheck,
    title: "Clean, readable code",
    body: "I care about code that other people can pick up and extend — clear names, consistent structure, and thoughtful organization.",
  },
];

export function About() {
  return (
    <section id="about" className="scroll-mt-20 py-24 sm:py-32">
      <div className="section">
        <SectionHeading
          id="about-heading"
          eyebrow="01 / About"
          title="A programming student building practical software."
          description="I'm a Computer Programming & Analysis student at Fanshawe College with hands-on experience across web development, databases, object-oriented programming, and data structures. I care about clean code, maintainability, and the small details that make software feel solid."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {pillars.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.5,
                ease: "easeOut",
                delay: i * 0.06,
              }}
              className="glass glass-hover p-6"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-accent">
                  <p.icon size={18} />
                </div>
                <div>
                  <h3 className="text-base font-medium text-zinc-100">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {p.body}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
