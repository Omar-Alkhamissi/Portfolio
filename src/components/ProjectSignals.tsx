import { motion } from "framer-motion";
import { projectSignals, type ProjectSignalTone } from "../data/projectSignals";

const toneStyles: Record<
  ProjectSignalTone,
  {
    icon: string;
    value: string;
    rail: string;
  }
> = {
  sky: {
    icon: "border-accent/30 bg-accent/10 text-accent",
    value: "text-accent",
    rail: "from-accent/70",
  },
  emerald: {
    icon: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    value: "text-emerald-200",
    rail: "from-emerald-300/70",
  },
  amber: {
    icon: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    value: "text-amber-200",
    rail: "from-amber-300/70",
  },
  violet: {
    icon: "border-violet-300/25 bg-violet-300/10 text-violet-200",
    value: "text-violet-200",
    rail: "from-violet-300/70",
  },
};

export function ProjectSignals() {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {projectSignals.map((signal, index) => {
        const Icon = signal.icon;
        const tone = toneStyles[signal.tone];

        return (
          <motion.article
            key={signal.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              duration: 0.45,
              ease: "easeOut",
              delay: index * 0.04,
            }}
            className="relative min-h-[196px] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
          >
            <div
              aria-hidden="true"
              className={[
                "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent",
                tone.rail,
              ].join(" ")}
            />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  {signal.label}
                </p>
                <p
                  className={[
                    "mt-2 font-mono text-sm font-medium",
                    tone.value,
                  ].join(" ")}
                >
                  {signal.value}
                </p>
              </div>
              <span
                className={[
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                  tone.icon,
                ].join(" ")}
              >
                <Icon size={18} aria-hidden="true" />
              </span>
            </div>
            <h3 className="mt-5 text-base font-medium leading-snug text-zinc-100">
              {signal.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {signal.description}
            </p>
          </motion.article>
        );
      })}
    </div>
  );
}
