import { timeline } from "../data/experience";
import { SectionHeading } from "./SectionHeading";

const typeLabel: Record<string, string> = {
  education: "Education",
  experience: "Experience",
  leadership: "Leadership",
};

export function Experience() {
  return (
    <section id="experience" className="scroll-mt-20" aria-label="Experience">
      <div className="section">
        <SectionHeading
          title="Education, work, and leadership"
          description="Where I'm studying, what I've built for clients, and how I'm involved on campus."
        />

        <ol className="mt-10 divide-y divide-line">
          {timeline.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 py-8 first:pt-0 last:pb-0 md:grid-cols-[160px_1fr] md:gap-10"
            >
              <p className="text-14 text-fg-muted tabular-nums">
                {item.date}
                <span className="block text-12 text-fg-faint">
                  {typeLabel[item.type]}
                </span>
              </p>

              <div className="max-w-[68ch]">
                <h3 className="text-21 font-medium text-fg">{item.title}</h3>
                <p className="mt-1 flex flex-wrap gap-x-4 text-14 text-fg-muted">
                  <span>{item.org}</span>
                  {item.location && <span>{item.location}</span>}
                </p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-16 text-fg-muted marker:text-fg-faint">
                  {item.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
