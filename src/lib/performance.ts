import { useEffect, useState } from "react";

export type PerformanceQuality = "full" | "balanced" | "lite";

export type AdaptivePerformanceProfile = {
  quality: PerformanceQuality;
  qualitySource: "auto" | "query" | "localStorage";
  dpr: number;
  viewportWidth: number;
  viewportHeight: number;
  cssArea: number;
  pixelArea: number;
  graph: {
    maxFps: number;
    edgeGlowBlur: number;
    signalGlowBlur: number;
    nodeGlowBlur: number;
    glowOpacityScale: number;
    glowStrokeScale: number;
    waveIntensityScale: number;
    useFilteredEdgeGlow: boolean;
    useFilteredWaveGlow: boolean;
    useBlendMode: boolean;
  };
  skills: {
    maxFps: number;
    ringHazeBlur: number;
    ringHazeStrokeScale: number;
    ambientGlowOpacity: number;
  };
  background: {
    maxDpr: number;
    frameMs: number;
    starAreaDivisor: number;
    starCap: number;
    blobRadiusScale: number;
    blobAlphaScale: number;
  };
};

export type PerformanceDebugState = {
  enabled: boolean;
  source: "query" | "localStorage" | "global" | "off";
};

export type PerformanceDiagnosticFlags = {
  staticMode: boolean;
  disableBackground: boolean;
  disableGraphFilters: boolean;
  disableWaves: boolean;
  disableGraphGlass: boolean;
};

const DEBUG_STORAGE_KEY = "portfolio:debugPerf";
const QUALITY_STORAGE_KEY = "portfolio:perfQuality";
const DIAGNOSTIC_STORAGE_PREFIX = "portfolio:perf:";
export const GRAPH_DRAG_PERFORMANCE_EVENT = "portfolio:graph-drag-performance";

function isPerformanceQuality(value: string | null): value is PerformanceQuality {
  return value === "full" || value === "balanced" || value === "lite";
}

function qualityOverride() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const queryValue = params.get("quality") ?? params.get("perfQuality");
  if (isPerformanceQuality(queryValue)) {
    return { quality: queryValue, source: "query" as const };
  }

  const storedValue = window.localStorage.getItem(QUALITY_STORAGE_KEY);
  if (isPerformanceQuality(storedValue)) {
    return { quality: storedValue, source: "localStorage" as const };
  }

  return null;
}

function viewportSnapshot() {
  if (typeof window === "undefined") {
    return {
      dpr: 1,
      viewportWidth: 1280,
      viewportHeight: 800,
    };
  }

  return {
    dpr: window.devicePixelRatio || 1,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

export function getAdaptivePerformanceProfile(): AdaptivePerformanceProfile {
  const { dpr, viewportWidth, viewportHeight } = viewportSnapshot();
  const cssArea = viewportWidth * viewportHeight;
  const pixelArea = cssArea * dpr * dpr;

  let quality: PerformanceQuality = "full";
  let qualitySource: AdaptivePerformanceProfile["qualitySource"] = "auto";

  if (pixelArea >= 9_000_000 || cssArea >= 5_000_000 || dpr >= 2.75) {
    quality = "lite";
  } else if (pixelArea >= 6_000_000 || cssArea >= 3_000_000 || dpr >= 2.5) {
    quality = "balanced";
  }

  const override = qualityOverride();
  if (override) {
    quality = override.quality;
    qualitySource = override.source;
  }

  const graphProfiles: Record<PerformanceQuality, AdaptivePerformanceProfile["graph"]> = {
    full: {
      maxFps: 240,
      edgeGlowBlur: 3.2,
      signalGlowBlur: 2.8,
      nodeGlowBlur: 7,
      glowOpacityScale: 1,
      glowStrokeScale: 1,
      waveIntensityScale: 1,
      useFilteredEdgeGlow: true,
      useFilteredWaveGlow: true,
      useBlendMode: true,
    },
    balanced: {
      maxFps: 165,
      edgeGlowBlur: 2.1,
      signalGlowBlur: 1.9,
      nodeGlowBlur: 4.8,
      glowOpacityScale: 0.78,
      glowStrokeScale: 0.82,
      waveIntensityScale: 0.9,
      useFilteredEdgeGlow: true,
      useFilteredWaveGlow: false,
      useBlendMode: true,
    },
    lite: {
      maxFps: 120,
      edgeGlowBlur: 1.2,
      signalGlowBlur: 1.1,
      nodeGlowBlur: 3,
      glowOpacityScale: 0.58,
      glowStrokeScale: 0.64,
      waveIntensityScale: 0.78,
      useFilteredEdgeGlow: false,
      useFilteredWaveGlow: false,
      useBlendMode: false,
    },
  };

  const skillProfiles: Record<PerformanceQuality, AdaptivePerformanceProfile["skills"]> = {
    full: {
      maxFps: 120,
      ringHazeBlur: 10,
      ringHazeStrokeScale: 1,
      ambientGlowOpacity: 0.35,
    },
    balanced: {
      maxFps: 90,
      ringHazeBlur: 6,
      ringHazeStrokeScale: 0.76,
      ambientGlowOpacity: 0.26,
    },
    lite: {
      maxFps: 60,
      ringHazeBlur: 3,
      ringHazeStrokeScale: 0.5,
      ambientGlowOpacity: 0.18,
    },
  };

  const backgroundProfiles: Record<
    PerformanceQuality,
    AdaptivePerformanceProfile["background"]
  > = {
    full: {
      maxDpr: 1.5,
      frameMs: 1000 / 30,
      starAreaDivisor: 9000,
      starCap: 260,
      blobRadiusScale: 1,
      blobAlphaScale: 1,
    },
    balanced: {
      maxDpr: 1.25,
      frameMs: 1000 / 24,
      starAreaDivisor: 11_500,
      starCap: 210,
      blobRadiusScale: 0.86,
      blobAlphaScale: 0.82,
    },
    lite: {
      maxDpr: 1,
      frameMs: 1000 / 20,
      starAreaDivisor: 15_000,
      starCap: 155,
      blobRadiusScale: 0.72,
      blobAlphaScale: 0.62,
    },
  };

  return {
    quality,
    qualitySource,
    dpr,
    viewportWidth,
    viewportHeight,
    cssArea,
    pixelArea,
    graph: graphProfiles[quality],
    skills: skillProfiles[quality],
    background: backgroundProfiles[quality],
  };
}

function profileSectionEqual<T extends Record<string, number | boolean>>(
  left: T,
  right: T,
) {
  const leftKeys = Object.keys(left) as Array<keyof T>;
  const rightKeys = Object.keys(right) as Array<keyof T>;

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

function performanceProfilesEqual(
  left: AdaptivePerformanceProfile,
  right: AdaptivePerformanceProfile,
) {
  return (
    left.quality === right.quality &&
    left.qualitySource === right.qualitySource &&
    left.dpr === right.dpr &&
    left.viewportWidth === right.viewportWidth &&
    left.viewportHeight === right.viewportHeight &&
    left.cssArea === right.cssArea &&
    left.pixelArea === right.pixelArea &&
    profileSectionEqual(left.graph, right.graph) &&
    profileSectionEqual(left.skills, right.skills) &&
    profileSectionEqual(left.background, right.background)
  );
}

export function useAdaptivePerformanceProfile() {
  const [profile, setProfile] = useState(getAdaptivePerformanceProfile);

  useEffect(() => {
    let frame = 0;
    const dprQuery = window.matchMedia?.(
      `(resolution: ${window.devicePixelRatio || 1}dppx)`,
    );

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setProfile((current) => {
          const next = getAdaptivePerformanceProfile();
          return performanceProfilesEqual(current, next) ? current : next;
        });
      });
    };

    window.addEventListener("resize", update);
    window.addEventListener("focus", update);
    window.visualViewport?.addEventListener("resize", update);
    dprQuery?.addEventListener?.("change", update);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("focus", update);
      window.visualViewport?.removeEventListener("resize", update);
      dprQuery?.removeEventListener?.("change", update);
    };
  }, []);

  return profile;
}

export function getPerformanceDebugState(): PerformanceDebugState {
  if (typeof window === "undefined") {
    return { enabled: false, source: "off" };
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("debugPerf") === "1") {
    return { enabled: true, source: "query" };
  }

  if (window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1") {
    return { enabled: true, source: "localStorage" };
  }

  const debugGlobal = window as Window & {
    __PORTFOLIO_DEBUG_PERF__?: boolean;
  };
  if (debugGlobal.__PORTFOLIO_DEBUG_PERF__) {
    return { enabled: true, source: "global" };
  }

  return { enabled: false, source: "off" };
}

export function usePerformanceDebugState() {
  const [debugState, setDebugState] = useState(getPerformanceDebugState);

  useEffect(() => {
    const update = () => setDebugState(getPerformanceDebugState());

    window.addEventListener("storage", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return debugState;
}

function flagFromParams(
  params: URLSearchParams,
  enabledNames: string[],
  disabledNames: string[] = [],
) {
  for (const name of enabledNames) {
    if (params.get(name) === "1" || params.get(name) === "true") {
      return true;
    }
  }

  for (const name of disabledNames) {
    if (params.get(name) === "off" || params.get(name) === "0") {
      return true;
    }
  }

  return false;
}

export function getPerformanceDiagnosticFlags(): PerformanceDiagnosticFlags {
  if (typeof window === "undefined") {
    return {
      staticMode: false,
      disableBackground: false,
      disableGraphFilters: false,
      disableWaves: false,
      disableGraphGlass: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const stored = (key: string) =>
    window.localStorage.getItem(`${DIAGNOSTIC_STORAGE_PREFIX}${key}`) === "1";
  const staticMode =
    flagFromParams(params, ["static", "staticMode", "pauseMotion", "noMotion"]) ||
    stored("static");

  return {
    staticMode,
    disableBackground:
      staticMode ||
      flagFromParams(params, ["noBg", "disableBackground"], ["perfBg"]) ||
      stored("noBg"),
    disableGraphFilters:
      staticMode ||
      flagFromParams(params, ["flatGraph", "disableGraphFilters"], ["perfFilters"]) ||
      stored("flatGraph"),
    disableWaves:
      staticMode ||
      flagFromParams(params, ["noWaves", "disableWaves"], ["perfWaves"]) ||
      stored("noWaves"),
    disableGraphGlass:
      staticMode ||
      flagFromParams(params, ["noGlass", "disableGraphGlass"], ["perfGlass"]) ||
      stored("noGlass"),
  };
}

export function usePerformanceDiagnosticFlags() {
  const [flags, setFlags] = useState(getPerformanceDiagnosticFlags);

  useEffect(() => {
    const update = () => setFlags(getPerformanceDiagnosticFlags());

    window.addEventListener("storage", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return flags;
}

export function announceGraphDragPerformance(active: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(GRAPH_DRAG_PERFORMANCE_EVENT, {
      detail: { active },
    }),
  );
}
