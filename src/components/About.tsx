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

type AboutProps = {
  variant?: "section" | "panel";
};

const profileTags = ["Clarity first", "Practical scope", "Maintainable by default"];

const panelPillars = [
  {
    icon: Sparkles,
    title: "Solve the real problem",
    body: "Start with what matters and avoid adding complexity too early.",
  },
  {
    icon: Layers,
    title: "Think end to end",
    body: "Frontend, API, and data choices should support one clear flow.",
  },
  {
    icon: Cpu,
    title: "Keep code readable",
    body: "Easy to trace, rename, test, and extend without friction.",
  },
  {
    icon: ShieldCheck,
    title: "Hand off cleanly",
    body: "Another developer should be able to jump in confidently.",
  },
] as const;

export function About({ variant = "section" }: AboutProps) {
  if (variant === "panel") {
    return (
      <motion.aside
        id="about"
        aria-labelledby="about-heading"
        initial={{ opacity: 0, x: 24 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative scroll-mt-24"
      >
        <div className="relative">
          <span className="eyebrow">
            <span className="h-px w-6 bg-accent/60" />
            01 / About
          </span>
          <h2
            id="about-heading"
            className="mt-4 max-w-md text-2xl font-semibold tracking-tight text-gradient sm:text-3xl"
          >
            How I like to work.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-400 sm:text-base">
            The left side already covers the background. What matters more here is
            how I approach building: understand the problem clearly, keep the moving
            parts readable, and ship something practical that still feels solid a few
            months later.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {profileTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-center text-[10px] font-medium text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-8 grid auto-rows-fr gap-3 sm:grid-cols-2">
            {panelPillars.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{
                  duration: 0.45,
                  ease: "easeOut",
                  delay: i * 0.05,
                }}
                className="h-full rounded-2xl border border-white/[0.06] bg-black/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-accent">
                    <p.icon size={17} />
                  </div>
                  <h3 className="self-center text-sm font-medium leading-snug text-zinc-100">
                    {p.title}
                  </h3>
                  <p className="col-start-2 text-sm leading-relaxed text-zinc-400">
                    {p.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.aside>
    );
  }

  return (
    <section id="about" className="scroll-mt-20 py-24 sm:py-32">
      <div className="section">
        <SectionHeading
          id="about-heading"
          eyebrow="01 / About"
          title="A software developer building practical systems."
          description="I build across web applications, databases, object-oriented systems, and data structures. I care about clean code, maintainability, and the small details that make software feel solid."
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
