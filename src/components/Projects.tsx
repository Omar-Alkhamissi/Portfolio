import { SectionHeading } from "./SectionHeading";
import { ProjectGraph } from "./ProjectGraph";

export function Projects() {
  return (
    <section id="projects" className="scroll-mt-20 pt-14 pb-24 sm:pt-18 sm:pb-32">
      <div className="section">
        <SectionHeading
          id="projects-heading"
          eyebrow="03 / Selected Work"
          title="A graph of projects, linked by stack and concept."
          description="Each node is a project. Lines connect related work through shared technologies, architecture, data, or platform choices. Hover or tap a node to trace its links and load the details below."
        />
      </div>

      <div className="mt-10 px-3 sm:px-5 lg:px-8">
        <ProjectGraph />
      </div>
    </section>
  );
}
