import { SectionHeading } from "./SectionHeading";
import { ProjectGraph } from "./ProjectGraph";

export function Projects() {
  return (
    <section id="projects" className="scroll-mt-20 py-24 sm:py-32">
      <div className="section">
        <SectionHeading
          id="projects-heading"
          eyebrow="03 / Selected Work"
          title="A graph of projects, linked by shared technology."
          description="Each node is a project. Lines connect projects that share at least one technology. Hover or tap a node to trace its links and load the details panel."
        />

        <div className="mt-12">
          <ProjectGraph />
        </div>
      </div>
    </section>
  );
}
