import { SectionHeading } from "./SectionHeading";
import { SolarSystem } from "./SolarSystem";

export function Skills() {
  return (
    <section id="skills" className="scroll-mt-20 py-24 sm:py-32">
      <div className="section">
        <SectionHeading
          id="skills-heading"
          eyebrow="02 / Skills"
          title="A solar system of tools, languages, and frameworks."
          description="Each ring is a category. Each planet is a skill. Hover to focus, click a chip to filter."
        />

        <div className="mt-12">
          <SolarSystem />
        </div>
      </div>
    </section>
  );
}
