import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { SectionHeading } from "./SectionHeading";

const SOLAR_FORCE_MOUNT_DELAY_MS = 1200;
const LazySolarSystem = lazy(() =>
  import("./SolarSystem").then((module) => ({ default: module.SolarSystem })),
);

function SolarSystemPlaceholder() {
  return (
    <div className="relative mx-auto w-full max-w-[1180px]" aria-hidden="true">
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        {Array.from({ length: 8 }, (_, index) => (
          <span
            key={index}
            className="h-8 w-24 rounded-full border border-white/[0.07] bg-white/[0.025]"
          />
        ))}
      </div>
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.015]">
        <div className="grid-overlay pointer-events-none absolute inset-0 opacity-35" />
        <div className="absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/10 bg-accent/[0.035]" />
        <div className="absolute left-1/2 top-1/2 h-[66%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.045]" />
        <div className="absolute left-1/2 top-1/2 h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.035]" />
      </div>
    </div>
  );
}

export function Skills() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [shouldMountSystem, setShouldMountSystem] = useState(false);

  useEffect(() => {
    const forceMountTimer = window.setTimeout(() => {
      setShouldMountSystem(true);
    }, SOLAR_FORCE_MOUNT_DELAY_MS);

    return () => {
      window.clearTimeout(forceMountTimer);
    };
  }, []);

  useEffect(() => {
    if (shouldMountSystem) {
      return;
    }

    const section = sectionRef.current;
    if (!section || !("IntersectionObserver" in window)) {
      setShouldMountSystem(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldMountSystem(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "700px 0px",
        threshold: 0,
      },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [shouldMountSystem]);

  return (
    <section
      ref={sectionRef}
      id="skills"
      className="scroll-mt-20 pt-12 pb-14 sm:pt-16 sm:pb-20"
      aria-labelledby="skills-heading"
    >
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
          {shouldMountSystem ? (
            <Suspense fallback={<SolarSystemPlaceholder />}>
              <LazySolarSystem />
            </Suspense>
          ) : (
            <SolarSystemPlaceholder />
          )}
        </div>
      </div>
    </section>
  );
}
