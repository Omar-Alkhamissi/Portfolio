import { SectionHeading } from "./SectionHeading";

const pillars = [
  {
    title: "Solve the real problem",
    body: "Start with what matters and avoid adding complexity too early.",
  },
  {
    title: "Think end to end",
    body: "Frontend, API, and data choices should support one clear flow.",
  },
  {
    title: "Keep code readable",
    body: "Easy to trace, rename, test, and extend without friction.",
  },
  {
    title: "Hand off cleanly",
    body: "Another developer should be able to jump in confidently.",
  },
] as const;

export function About() {
  return (
    <section id="about" className="scroll-mt-20" aria-label="About">
      <div className="section">
        <SectionHeading
          title="How I like to work"
          description="What matters most is how I approach building: understand the problem clearly, keep the moving parts readable, and ship something practical that still feels solid a few months later."
        />

        <dl className="mt-10 grid max-w-[880px] gap-x-12 gap-y-8 sm:grid-cols-2">
          {pillars.map((p) => (
            <div key={p.title}>
              <dt className="text-16 font-medium text-fg">{p.title}</dt>
              <dd className="mt-1 text-16 text-fg-muted">{p.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
