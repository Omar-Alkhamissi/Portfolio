import { motion } from "framer-motion";
import { cn } from "../lib/cn";

type SectionHeadingProps = {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
};

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  className,
}: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn("max-w-2xl", className)}
    >
      <span className="eyebrow" aria-hidden="true">
        <span className="h-px w-6 bg-accent/60" />
        {eyebrow}
      </span>
      <h2
        id={id}
        className="mt-4 text-3xl font-semibold tracking-tight text-gradient sm:text-4xl"
      >
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-zinc-400">
          {description}
        </p>
      )}
    </motion.div>
  );
}
