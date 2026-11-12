import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { SectionHeading } from "./SectionHeading";

const SOLAR_FORCE_MOUNT_DELAY_MS = 1200;
const LazySolarSystem = lazy(() =>
  import("./SolarSystem").then((module) => ({ default: module.SolarSystem })),
);

// Reserves roughly the final height so the page does not jump when the orrery mounts.
function SolarSystemPlaceholder() {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-16"
      aria-hidden="true"
    >
      <div className="min-w-0 pb-8 lg:pb-0">
        <div className="mb-3 h-[22px]" />
        <div className="aspect-[100/57] w-full max-w-[340px] lg:max-w-[496px]" />
      </div>
      <div className="flex flex-col gap-5">
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="h-[88px] lg:h-[60px]" />
        ))}
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
      className="scroll-mt-20"
      aria-label="Skills"
    >
      <div className="section">
        <SectionHeading
          title="Skills"
          description="Each orbit is one group of skills. Point at a group to pause the system and label its planets."
        />

        <div className="mt-6 lg:mt-10">
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
