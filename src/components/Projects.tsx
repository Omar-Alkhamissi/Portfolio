import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { SectionHeading } from "./SectionHeading";

const GRAPH_FORCE_MOUNT_DELAY_MS = 1600;
const LazyProjectGraph = lazy(() =>
  import("./ProjectGraph").then((module) => ({ default: module.ProjectGraph })),
);

function GraphPlaceholder() {
  return (
    <div className="mx-auto max-w-[1280px] select-none space-y-5" aria-hidden="true">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 xl:justify-start">
        {Array.from({ length: 6 }).map((_, index) => (
          <span
            key={index}
            className="h-4 w-24 rounded-full border border-white/[0.04] bg-white/[0.025]"
          />
        ))}
      </div>

      <div className="glass relative aspect-[16/10] overflow-hidden p-3 sm:p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(125,211,252,0.06),transparent_32%)]" />
        <div className="grid-overlay pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative h-full w-full rounded-xl border border-white/[0.04] bg-white/[0.015]" />
      </div>

      <div className="glass min-h-[640px] p-6 sm:p-7">
        <div className="h-5 w-28 rounded-full border border-white/[0.05] bg-white/[0.025]" />
        <div className="mt-5 flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl border border-accent/20 bg-accent/10" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-5 w-52 max-w-full rounded bg-white/[0.04]" />
            <div className="h-4 w-80 max-w-full rounded bg-white/[0.025]" />
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]">
          <div className="h-36 rounded-xl border border-white/[0.05] bg-black/10" />
          <div className="h-36 rounded-xl border border-white/[0.05] bg-white/[0.02]" />
        </div>
        <div className="mt-4 h-32 rounded-xl border border-white/[0.05] bg-black/10" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 rounded-lg border border-white/[0.045] bg-white/[0.018]"
            />
          ))}
        </div>
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
