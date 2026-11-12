import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { SectionHeading } from "./SectionHeading";

const GRAPH_FORCE_MOUNT_DELAY_MS = 1600;
const LazyProjectGraph = lazy(() =>
  import("./ProjectGraph").then((module) => ({ default: module.ProjectGraph })),
);

// Reserves the final height of the toggles, map and reading column so the
// page does not jump when the graph mounts.
function GraphPlaceholder() {
  return (
    <div className="select-none" aria-hidden="true">
      <div className="h-[22px]" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <div className="h-[460px] lg:h-[clamp(420px,70vh,680px)]" />
        <div className="h-[460px] rounded-[8px] border border-line bg-surface lg:h-[clamp(420px,70vh,680px)]" />
      </div>
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
    <section ref={sectionRef} id="projects" className="scroll-mt-20" aria-label="Projects">
      <div className="section">
        <SectionHeading
          title="Projects"
          description="Each star is a project. Lines join projects that share a stack or an idea. Select one to read its note."
        />
      </div>

      <div className="mx-auto mt-10 max-w-[1320px] px-5 sm:px-8">
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
