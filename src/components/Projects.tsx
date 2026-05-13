import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { SectionHeading } from "./SectionHeading";
import { ProjectSignals } from "./ProjectSignals";

const GRAPH_FORCE_MOUNT_DELAY_MS = 1600;
const LazyProjectGraph = lazy(() =>
  import("./ProjectGraph").then((module) => ({ default: module.ProjectGraph })),
);

function GraphPlaceholder() {
  return (
    <div
      className="glass relative mx-auto aspect-[16/10] max-w-[1280px] overflow-hidden p-3 sm:p-5 md:p-6"
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(125,211,252,0.06),transparent_32%)]" />
      <div className="grid-overlay pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative h-full w-full rounded-xl border border-white/[0.04] bg-white/[0.015]" />
    </div>
  );
}

export function Projects() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [shouldMountGraph, setShouldMountGraph] = useState(false);

  useEffect(() => {
    const forceMountTimer = window.setTimeout(() => {
      setShouldMountGraph(true);
    }, GRAPH_FORCE_MOUNT_DELAY_MS);

    return () => {
      window.clearTimeout(forceMountTimer);
    };
  }, []);

  useEffect(() => {
    if (shouldMountGraph) {
      return;
    }

    const section = sectionRef.current;
    if (!section || !("IntersectionObserver" in window)) {
      setShouldMountGraph(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldMountGraph(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "900px 0px",
        threshold: 0,
      },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [shouldMountGraph]);

  return (
    <section
      ref={sectionRef}
      id="projects"
      className="scroll-mt-20 pt-14 pb-24 sm:pt-18 sm:pb-32"
      aria-labelledby="projects-heading"
    >
      <div className="section">
        <SectionHeading
          id="projects-heading"
          eyebrow="03 / Selected Work"
          title="A graph of projects, linked by stack and concept."
          description="Each node is a project. Lines connect related work through shared technologies, architecture, data, or platform choices. Hover or tap a node to trace its links and load the details below."
        />
        <ProjectSignals />
      </div>

      <div className="mt-10 px-3 sm:px-5 lg:px-8">
        {shouldMountGraph ? (
          <Suspense fallback={<GraphPlaceholder />}>
            <LazyProjectGraph />
          </Suspense>
        ) : (
          <GraphPlaceholder />
        )}
      </div>
    </section>
  );
}
