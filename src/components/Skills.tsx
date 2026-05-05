import { SectionHeading } from "./SectionHeading";
import { SolarSystem } from "./SolarSystem";

export function Skills() {
  return (
    <section id="skills" className="scroll-mt-20 pt-12 pb-14 sm:pt-16 sm:pb-20">
      <div className="section">
        <SectionHeading
          id="skills-heading"
          eyebrow="02 / Skills"
          title="A solar system of tools, languages, and frameworks."
          description="Each ring is a category. Each planet is a skill."
        />
      </div>

      <div className="mt-8 px-3 sm:mt-10 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-[1280px]">
          <SolarSystem />
        </div>
      </div>
    </section>
  );
}
