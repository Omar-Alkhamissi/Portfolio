import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { Github } from "lucide-react";
import { projects } from "../data/projects";
import { site } from "../data/site";
import { cn } from "../lib/cn";
import { useMotionOff } from "../lib/motion";
import { SectionHeading } from "./SectionHeading";

type ActivityDay = {
  commits: number;
  count: number;
  date: string;
  events: number;
  pushes: number;
};

type CountStat = {
  count: number;
  label: string;
};

type GitHubUserResponse = {
  public_repos?: number;
  updated_at?: string;
};

type GitHubRepoResponse = {
  fork?: boolean;
  forks_count?: number;
  language?: string | null;
  stargazers_count?: number;
  updated_at?: string;
};

type GitHubEventResponse = {
  created_at?: string;
  payload?: {
    commits?: unknown[];
    size?: number;
  };
  type?: string;
};

type GitHubSummary = {
  accountCreatedAt?: string | null;
  activityDays: ActivityDay[];
  activityEvents: number;
  allTimeContributionDays?: ActivityDay[];
  allTimeContributions?: number;
  commitContributions?: number;
  contributedRepositories?: number;
  contributionDays: number;
  eventTypes: CountStat[];
  forks: number;
  generatedAt?: string;
  issueContributions?: number;
  privateRepos?: number;
  publicRepos: number;
  pullRequestContributions?: number;
  repos: number;
  reviewContributions?: number;
  restrictedContributions?: number;
  source?: "private-snapshot" | "public-api";
  stars: number;
  topLanguages: string[];
  totalContributions?: number;
  updatedAt: string | null;
  pushes: number;
};

type GitHubStatus = "loading" | "private" | "live" | "cached" | "fallback";
type ChartRange = "all" | "year" | "six-months" | "ninety-days";
type ChartPoint = {
  count: number;
  date: string;
  total: number;
  x: number;
  y: number;
};

const ACTIVITY_DAY_COUNT = 371;
const DAY_MS = 1000 * 60 * 60 * 24;
const GITHUB_CACHE_KEY = "portfolio:github-signal:v4";
const GITHUB_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const GITHUB_USERNAME = "Omar-Alkhamissi";
const CHART_RANGE_OPTIONS: Array<{ label: string; value: ChartRange }> = [
  { label: "All time", value: "all" },
  { label: "Last year", value: "year" },
  { label: "6 months", value: "six-months" },
  { label: "90 days", value: "ninety-days" },
];

const EVENT_LABELS: Record<string, string> = {
  CommitCommentEvent: "Comments",
  CreateEvent: "Create",
  DeleteEvent: "Delete",
  ForkEvent: "Fork",
  IssuesEvent: "Issues",
  PullRequestEvent: "PRs",
  PullRequestReviewEvent: "Reviews",
  PushEvent: "Pushes",
  ReleaseEvent: "Releases",
  WatchEvent: "Stars",
};

function buildLocalStats() {
  const technologies = new Set<string>();
  const relations = new Set<string>();
  const linkedRepos = new Set<string>();
  let evidenceSignals = 0;

  for (const project of projects) {
    project.tech.forEach((tech) => technologies.add(tech));
    project.relations.forEach((relation) => relations.add(relation));
    linkedRepos.add(project.github);
    evidenceSignals +=
      project.bullets.length + project.metrics.length + project.stats.length;
  }

  return {
    evidenceSignals,
    linkedRepos: linkedRepos.size,
    projects: projects.length,
    relations: relations.size,
    technologies: technologies.size,
  };
}

function buildEmptyActivityDays() {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Array.from({ length: ACTIVITY_DAY_COUNT }, (_, index) => {
    const date = new Date(
      today - (ACTIVITY_DAY_COUNT - 1 - index) * DAY_MS,
    );

    return {
      commits: 0,
      count: 0,
      date: date.toISOString().slice(0, 10),
      events: 0,
      pushes: 0,
    };
  });
}

function buildPortfolioActivityFallback() {
  const days = buildEmptyActivityDays();

  projects.forEach((project, index) => {
    const slot = (index * 11) % days.length;
    const evidenceCount =
      project.metrics.length + project.stats.length + project.bullets.length;

    days[slot] = {
      ...days[slot],
      count: Math.max(1, Math.min(8, evidenceCount)),
      events: 1,
    };
  });

  return days;
}

function buildActivityDays(events: GitHubEventResponse[]) {
  const days = buildEmptyActivityDays();
  const dayByDate = new Map(days.map((day) => [day.date, day]));

  for (const event of events) {
    if (!event.created_at) {
      continue;
    }

    const dateKey = new Date(event.created_at).toISOString().slice(0, 10);
    const day = dayByDate.get(dateKey);

    if (!day) {
      continue;
    }

    const commits =
      event.type === "PushEvent"
        ? event.payload?.size ??
          (Array.isArray(event.payload?.commits)
            ? event.payload.commits.length
            : 0)
        : 0;

    day.events += 1;
    day.pushes += event.type === "PushEvent" ? 1 : 0;
    day.commits += commits;
    day.count += Math.max(1, commits);
  }

  return days;
}

function buildEventTypeStats(events: GitHubEventResponse[]) {
  const counts = new Map<string, number>();

  for (const event of events) {
    const label = EVENT_LABELS[event.type ?? ""] ?? "Other";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ count, label }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 4);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "live browser data";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "live browser data";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatAxisDate(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function longestContributionStreak(days: ActivityDay[]) {
  let current = 0;
  let longest = 0;

  for (const day of days) {
    if (day.count > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}

function peakContributionDay(days: ActivityDay[]) {
  let peak: ActivityDay | null = null;

  for (const day of days) {
    if (!peak || day.count > peak.count) {
      peak = day;
    }
  }

  return peak;
}

function getGeneratedStatsUrl() {
  return `${import.meta.env.BASE_URL}github-stats.json`;
}

function readCachedGitHubSummary() {
  try {
    const raw = window.localStorage.getItem(GITHUB_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw) as {
      data?: GitHubSummary;
      savedAt?: number;
    };

    if (
      !cached.data ||
      !cached.savedAt ||
      Date.now() - cached.savedAt > GITHUB_CACHE_TTL_MS
    ) {
      return null;
    }

    return cached.data;
  } catch {
    return null;
  }
}

function writeCachedGitHubSummary(data: GitHubSummary) {
  try {
    window.localStorage.setItem(
      GITHUB_CACHE_KEY,
      JSON.stringify({ data, savedAt: Date.now() }),
    );
  } catch {
    // Private browsing and strict storage settings can block localStorage.
  }
}

async function fetchGeneratedGitHubSummary(signal: AbortSignal) {
  const response = await fetch(getGeneratedStatsUrl(), {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("No generated GitHub stats snapshot");
  }

  const summary = (await response.json()) as GitHubSummary;
  if (!Array.isArray(summary.activityDays) || !Number.isFinite(summary.repos)) {
    throw new Error("Invalid generated GitHub stats snapshot");
  }

  return summary;
}

async function fetchPublicGitHubSummary(
  signal: AbortSignal,
): Promise<GitHubSummary> {
  const [userResponse, reposResponse, eventsResponse] = await Promise.all([
    fetch(`https://api.github.com/users/${GITHUB_USERNAME}`, { signal }),
    fetch(
      `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100&sort=updated`,
      { signal },
    ),
    fetch(
      `https://api.github.com/users/${GITHUB_USERNAME}/events/public?per_page=100`,
      { signal },
    ),
  ]);

  if (!userResponse.ok || !reposResponse.ok || !eventsResponse.ok) {
    throw new Error("GitHub API request failed");
  }

  const user = (await userResponse.json()) as GitHubUserResponse;
  const repos = (await reposResponse.json()) as GitHubRepoResponse[];
  const events = (await eventsResponse.json()) as GitHubEventResponse[];
  const languageCounts = new Map<string, number>();
  let stars = 0;
  let forks = 0;
  let updatedAt = user.updated_at ?? null;

  for (const repo of repos) {
    stars += repo.stargazers_count ?? 0;
    forks += repo.forks_count ?? 0;

    if (repo.updated_at && (!updatedAt || repo.updated_at > updatedAt)) {
      updatedAt = repo.updated_at;
    }

    if (!repo.fork && repo.language) {
      languageCounts.set(
        repo.language,
        (languageCounts.get(repo.language) ?? 0) + 1,
      );
    }
  }

  const activityDays = buildActivityDays(events);
  const pushes = activityDays.reduce((sum, day) => sum + day.pushes, 0);
  const activityEvents = activityDays.reduce((sum, day) => sum + day.count, 0);
  const contributionDays = activityDays.filter((day) => day.count > 0).length;
  const publicRepos = user.public_repos ?? repos.length;
  const topLanguages = [...languageCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([language]) => language);

  return {
    activityDays,
    activityEvents,
    contributionDays,
    eventTypes: buildEventTypeStats(events),
    forks,
    privateRepos: 0,
    publicRepos,
    pushes,
    repos: publicRepos,
    source: "public-api",
    stars,
    topLanguages,
    updatedAt,
  };
}

const EASE_ENTER = "cubic-bezier(0.05, 0.7, 0.1, 1)";
const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";
const MORPH_POINTS = 120;
const MORPH_MS = 350;
const AXIS_FADE_MS = 150;
const SCAN_STEP_MS = 5;

function bezierEase(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    let low = 0;
    let high = 1;
    let t = x;

    for (let i = 0; i < 24; i += 1) {
      const value = sampleX(t);

      if (Math.abs(value - x) < 1e-5) break;
      if (value < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }

    return sampleY(t);
  };
}

const easeMove = bezierEase(0.2, 0, 0, 1);

/** The site motion switch is the only still path. */
function useStillMotion() {
  return useMotionOff();
}

/** True after the element first scrolls into view. Fires once. */
function useFirstView(ref: RefObject<Element>) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (seen || !element) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, seen]);

  return seen;
}

/** One shared hovered date: the heatmap and the line chart read and write it. */
type HoverState = { date: string; source: "grid" | "chart" } | null;

function createHoverStore() {
  let state: HoverState = null;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set(next: HoverState) {
      if (next?.date === state?.date && next?.source === state?.source) {
        return;
      }

      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type HoverStore = ReturnType<typeof createHoverStore>;

function useHover(store: HoverStore) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

type ShapePoint = { x: number; y: number };

function resamplePoints(points: ChartPoint[], count: number): ShapePoint[] {
  if (!points.length) {
    return [];
  }

  if (points.length === 1) {
    return Array.from({ length: count }, () => ({
      x: points[0].x,
      y: points[0].y,
    }));
  }

  const last = points.length - 1;

  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * last;
    const from = Math.floor(position);
    const to = Math.min(last, from + 1);
    const amount = position - from;

    return {
      x: points[from].x + (points[to].x - points[from].x) * amount,
      y: points[from].y + (points[to].y - points[from].y) * amount,
    };
  });
}

function lerpShape(from: ShapePoint[], to: ShapePoint[], amount: number) {
  return to.map((point, index) => {
    const start = from[index] ?? point;

    return {
      x: start.x + (point.x - start.x) * amount,
      y: start.y + (point.y - start.y) * amount,
    };
  });
}

function shapeToPath(shape: ShapePoint[]) {
  return shape
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
}

type AxisLabel = {
  anchor: "start" | "middle" | "end";
  text: string;
  x: number;
  y: number;
};

/** Axis labels crossfade when their text changes, and only then. */
function AxisLabels({
  labels,
  still,
}: {
  labels: AxisLabel[];
  still: boolean;
}) {
  const signature = labels
    .map((label) => `${label.anchor}:${label.text}`)
    .join("|");
  const latest = useRef(labels);
  const [state, setState] = useState<{
    generation: number;
    leaving: AxisLabel[] | null;
    signature: string;
  }>({ generation: 0, leaving: null, signature });

  if (state.signature !== signature) {
    setState({
      generation: state.generation + 1,
      leaving: still ? null : latest.current,
      signature,
    });
  }

  useEffect(() => {
    latest.current = labels;
  });

  useEffect(() => {
    if (!state.leaving) {
      return;
    }

    const timer = window.setTimeout(
      () => setState((current) => ({ ...current, leaving: null })),
      AXIS_FADE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [state.generation, state.leaving]);

  const renderLabels = (items: AxisLabel[]) =>
    items.map((label, index) => (
      <text
        key={index}
        x={label.x}
        y={label.y}
        className="fill-fg-faint"
        fontSize="12"
        textAnchor={label.anchor}
      >
        {label.text}
      </text>
    ));
  const animate = !still && state.generation > 0;

  return (
    <>
      {state.leaving ? (
        <g
          key={`out-${state.generation}`}
          style={{
            animation: `stats-axis-out ${AXIS_FADE_MS}ms ${EASE_MOVE} both`,
          }}
        >
          {renderLabels(state.leaving)}
        </g>
      ) : null}
      <g
        key={`in-${state.generation}`}
        style={
          animate
            ? {
                animation: `stats-axis-in ${AXIS_FADE_MS}ms ${EASE_MOVE} both`,
              }
            : undefined
        }
      >
        {renderLabels(labels)}
      </g>
    </>
  );
}

const HEAT_STEPS = [
  "bg-line",
  "bg-star/25",
  "bg-star/50",
  "bg-star/75",
  "bg-star",
];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

type HeatCell = ActivityDay | null;

function heatLevel(count: number, maxCount: number) {
  if (count <= 0) {
    return 0;
  }

  return Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4)));
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function describeDay(day: ActivityDay) {
  const noun = day.count === 1 ? "contribution" : "contributions";

  return `${day.count} ${noun} on ${formatShortDate(day.date)}`;
}

function buildWeeks(days: ActivityDay[]) {
  const firstDay = days[0]
    ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay()
    : 0;
  const cells: HeatCell[] = [
    ...Array.from({ length: Number.isNaN(firstDay) ? 0 : firstDay }, () => null),
    ...days,
  ];

  return Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
}

function monthLabels(weeks: HeatCell[][]) {
  const labels = weeks.map((week, index) => {
    const first = week.find((cell) => cell !== null);

    if (!first) {
      return "";
    }

    const current = new Date(`${first.date}T00:00:00Z`);
    const previousFirst = weeks[index - 1]?.find((cell) => cell !== null);
    const previous = previousFirst
      ? new Date(`${previousFirst.date}T00:00:00Z`)
      : null;

    if (index !== 0 && previous?.getUTCMonth() === current.getUTCMonth()) {
      return "";
    }

    return new Intl.DateTimeFormat("en", {
      month: "short",
      timeZone: "UTC",
    }).format(current);
  });

  // A partial first month sits too close to the next label, so drop it.
  if (labels.slice(1, 3).some(Boolean)) {
    labels[0] = "";
  }

  return labels;
}

function ContributionGrid({
  days,
  hoverStore,
}: {
  days: ActivityDay[];
  hoverStore: HoverStore;
}) {
  const weeks = useMemo(() => buildWeeks(days), [days]);
  const labels = useMemo(() => monthLabels(weeks), [weeks]);
  const maxCount = Math.max(1, ...days.map((day) => day.count));
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const still = useStillMotion();
  const seen = useFirstView(rootRef);
  const revealed = seen || still;
  const hover = useHover(hoverStore);
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(days.length - 1);
  const [tip, setTip] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const offset = weeks[0]?.findIndex((cell) => cell !== null) ?? 0;

  useEffect(() => {
    const scroller = scrollRef.current;

    if (scroller) {
      scroller.scrollLeft = scroller.scrollWidth;
    }
  }, [weeks.length]);

  useEffect(() => {
    setFocusIndex(days.length - 1);
  }, [days.length]);

  const showTip = (element: HTMLElement, day: ActivityDay) => {
    const rect = element.getBoundingClientRect();
    const half = 90;

    setTip({
      label: describeDay(day),
      x: Math.min(
        window.innerWidth - half - 8,
        Math.max(half + 8, rect.left + rect.width / 2),
      ),
      y: rect.top - 8,
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
    };
    const move = moves[event.key];

    if (move === undefined) {
      return;
    }

    event.preventDefault();

    const next = Math.min(days.length - 1, Math.max(0, focusIndex + move));
    setFocusIndex(next);
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.focus();
  };

  const activeDays = days.filter((day) => day.count > 0).length;
  const total = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <div ref={rootRef}>
      <p className="mb-4 text-sm text-fg-muted">
        {formatNumber(total)} contributions on {activeDays} days, across the
        last {days.length} days
      </p>
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="flex-none pt-5 text-xs text-fg-faint"
        >
          <div className="grid grid-rows-7 gap-[3px]">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={index} className="h-[11px] leading-[11px]">
                {label}
              </span>
            ))}
          </div>
        </div>
        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-2"
        >
          <div className="w-max">
            <div
              aria-hidden="true"
              className="mb-2 grid h-3 grid-flow-col auto-cols-[11px] gap-[3px] text-xs leading-3 text-fg-faint"
            >
              {labels.map((label, index) => (
                <span key={index} className="whitespace-nowrap">
                  {label}
                </span>
              ))}
            </div>
            <div
              ref={gridRef}
              role="group"
              aria-label="Contribution heatmap, one square per day. Use the arrow keys to move between days."
              className="grid grid-flow-col auto-cols-[11px] gap-[3px]"
              onKeyDown={handleKeyDown}
              onPointerLeave={() => {
                setTip(null);

                if (hoverStore.get()?.source === "grid") {
                  hoverStore.set(null);
                }
              }}
            >
              {weeks.map((week, weekIndex) => (
                <div
                  key={weekIndex}
                  className="grid grid-rows-7 gap-[3px]"
                >
                  {week.map((cell, rowIndex) => {
                    if (!cell) {
                      return <span key={rowIndex} className="h-[11px]" />;
                    }

                    const index = weekIndex * 7 + rowIndex - offset;
                    const outlined =
                      hover?.source === "chart" && hover.date === cell.date;

                    return (
                      <span
                        key={cell.date}
                        role="img"
                        aria-label={describeDay(cell)}
                        data-index={index}
                        tabIndex={index === focusIndex ? 0 : -1}
                        className={cn(
                          "relative h-[11px] w-[11px] rounded-[2px] outline-offset-2 hover:z-10 hover:scale-[1.3] focus-visible:z-10 focus-visible:scale-[1.3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-star",
                          HEAT_STEPS[heatLevel(cell.count, maxCount)],
                          outlined && "z-10 outline outline-1 outline-star",
                        )}
                        style={{
                          opacity: revealed ? 1 : 0,
                          transition: still
                            ? "none"
                            : `opacity 200ms ${EASE_ENTER} ${weekIndex * SCAN_STEP_MS}ms, transform 150ms ${EASE_MOVE}`,
                        }}
                        onPointerEnter={(event) => {
                          showTip(event.currentTarget, cell);
                          hoverStore.set({ date: cell.date, source: "grid" });
                        }}
                        onFocus={(event) => {
                          setFocusIndex(index);
                          showTip(event.currentTarget, cell);
                          hoverStore.set({ date: cell.date, source: "grid" });
                        }}
                        onBlur={() => {
                          setTip(null);

                          if (hoverStore.get()?.source === "grid") {
                            hoverStore.set(null);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mt-3 flex items-center gap-1.5 text-xs text-fg-faint"
      >
        <span>Less</span>
        {HEAT_STEPS.map((step) => (
          <span key={step} className={cn("h-[11px] w-[11px] rounded-[2px]", step)} />
        ))}
        <span>More</span>
      </div>
      {tip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[8px] border border-line bg-surface px-3 py-1.5 text-xs text-fg"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.label}
        </div>
      ) : null}
    </div>
  );
}

function ActivityTrace({
  allTimeDays = [],
  hoverStore,
  totalContributions,
  yearDays = [],
}: {
  allTimeDays: ActivityDay[];
  hoverStore: HoverStore;
  totalContributions: number;
  yearDays: ActivityDay[];
}) {
  const [range, setRange] = useState<ChartRange>("all");
  const [width, setWidth] = useState(760);
  const frameRef = useRef<HTMLDivElement>(null);
  const still = useStillMotion();
  const seen = useFirstView(frameRef);
  const drawn = seen || still;
  const hover = useHover(hoverStore);
  const rangeRef = useRef(range);
  const shapeRef = useRef<ShapePoint[]>([]);
  const [morph, setMorph] = useState<ShapePoint[] | null>(null);
  const height = 240;
  const padding = {
    bottom: 28,
    left: 44,
    right: 12,
    top: 12,
  };

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });

    observer.observe(frame);

    return () => observer.disconnect();
  }, []);

  const sourceDays = allTimeDays.length ? allTimeDays : yearDays;
  const rangeDayCount =
    range === "all"
      ? sourceDays.length
      : range === "year"
        ? 365
        : range === "six-months"
          ? 183
          : 90;
  const days =
    range === "all" ? sourceDays : sourceDays.slice(-rangeDayCount);
  const baseline = height - padding.bottom;
  const innerHeight = height - padding.top - padding.bottom;
  const innerWidth = width - padding.left - padding.right;
  let runningTotal = 0;
  const cumulativePoints = days.map((day) => {
    runningTotal += day.count;

    return runningTotal;
  });
  const displayedTotal =
    range === "all" ? Math.max(totalContributions, runningTotal) : runningTotal;
  const maxValue = Math.max(1, displayedTotal, ...cumulativePoints);
  const step = innerWidth / Math.max(1, days.length - 1);
  const points = cumulativePoints.map((value, index): ChartPoint => {
    const x = padding.left + index * step;
    const y = baseline - (value / maxValue) * innerHeight;

    return {
      count: days[index]?.count ?? 0,
      date: days[index]?.date ?? "",
      total: value,
      x,
      y,
    };
  });
  const path = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${path} L ${width - padding.right} ${baseline} L ${padding.left} ${baseline} Z`;
  const emptyPath = `M ${padding.left} ${baseline} L ${width - padding.right} ${baseline}`;
  const yTicks = [1, 0.5, 0].map((ratio) => ({
    label: formatNumber(Math.round(maxValue * ratio)),
    y: baseline - ratio * innerHeight,
  }));
  const tickRatios = width < 520 ? [0, 0.5, 1] : [0, 1 / 3, 2 / 3, 1];
  const axisLabels: AxisLabel[] = [
    ...yTicks.map(
      (tick): AxisLabel => ({
        anchor: "end",
        text: tick.label,
        x: padding.left - 8,
        y: tick.y + 4,
      }),
    ),
    ...tickRatios.flatMap((ratio, index): AxisLabel[] => {
      const dayIndex = Math.min(
        days.length - 1,
        Math.max(0, Math.round((days.length - 1) * ratio)),
      );
      const text = formatAxisDate(days[dayIndex]?.date);

      if (!text) {
        return [];
      }

      return [
        {
          anchor:
            index === 0
              ? "start"
              : index === tickRatios.length - 1
                ? "end"
                : "middle",
          text,
          x: padding.left + ratio * innerWidth,
          y: baseline + 20,
        },
      ];
    }),
  ];
  const activeRangeLabel =
    CHART_RANGE_OPTIONS.find((option) => option.value === range)?.label ??
    "All time";
  const rangeSummary = days.length
    ? `${formatNumber(displayedTotal)} contributions from ${formatAxisDate(
        days[0]?.date,
      )} to ${formatAxisDate(days[days.length - 1]?.date)}`
    : `${formatNumber(displayedTotal)} contributions`;
  const hoveredPoint = hover
    ? (points.find((point) => point.date === hover.date) ?? null)
    : null;
  const markerPoint = morph ? null : hoveredPoint;

  // Range change: morph the line from the old shape to the new one.
  // Layout effect so the old shape is on screen before the first paint.
  useLayoutEffect(() => {
    const next = resamplePoints(points, MORPH_POINTS);
    const from = shapeRef.current;
    const rangeChanged = rangeRef.current !== range;

    rangeRef.current = range;

    if (still || !rangeChanged || !from.length || !next.length) {
      shapeRef.current = next;
      setMorph(null);
      return;
    }

    setMorph(from);

    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / MORPH_MS);
      const shape =
        progress >= 1 ? next : lerpShape(from, next, easeMove(progress));

      shapeRef.current = shape;
      setMorph(progress >= 1 ? null : shape);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
    // points is derived from path; path covers range, width and data changes.
  }, [path, range, still]);

  const shownLine = morph ? shapeToPath(morph) : path;
  const shownArea =
    morph && morph.length
      ? `${shownLine} L ${morph[morph.length - 1].x.toFixed(2)} ${baseline} L ${morph[0].x.toFixed(2)} ${baseline} Z`
      : areaPath;

  const handleChartPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!points.length) {
      if (hoverStore.get()?.source === "chart") {
        hoverStore.set(null);
      }

      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const chartX = event.clientX - rect.left;
    const ratio = Math.min(
      1,
      Math.max(0, (chartX - padding.left) / innerWidth),
    );
    const index = Math.min(
      points.length - 1,
      Math.max(0, Math.round(ratio * (points.length - 1))),
    );

    hoverStore.set({ date: points[index].date, source: "chart" });
  };

  return (
    <div>
      <style>{`@keyframes stats-axis-in{from{opacity:0}to{opacity:1}}@keyframes stats-axis-out{from{opacity:1}to{opacity:0}}`}</style>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        {hoveredPoint ? (
          <p className="flex min-h-5 flex-wrap gap-x-4 text-sm tabular-nums text-fg-muted">
            <span>{formatAxisDate(hoveredPoint.date)}</span>
            <span>{formatNumber(hoveredPoint.total)} total</span>
            <span>+{formatNumber(hoveredPoint.count)} that day</span>
          </p>
        ) : (
          <p className="min-h-5 text-sm tabular-nums text-fg-muted">
            {rangeSummary}
          </p>
        )}
        <div
          role="group"
          aria-label="Contribution chart range"
          className="flex flex-none gap-4"
        >
          {CHART_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === range}
              onClick={() => {
                setRange(option.value);
                hoverStore.set(null);
              }}
              className="toggle"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={frameRef}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`GitHub cumulative contribution curve, ${activeRangeLabel}. ${rangeSummary}`}
          className="block max-w-full touch-pan-y"
          onPointerMove={handleChartPointerMove}
          onPointerLeave={() => {
            if (hoverStore.get()?.source === "chart") {
              hoverStore.set(null);
            }
          }}
        >
          {yTicks.map((tick) => (
            <line
              key={tick.y}
              x1={padding.left}
              x2={width - padding.right}
              y1={tick.y}
              y2={tick.y}
              className="stroke-line"
              strokeWidth="1"
            />
          ))}
          <AxisLabels labels={axisLabels} still={still} />
          <path
            d={path ? shownArea : emptyPath}
            className="fill-fg/[0.04]"
            style={{
              opacity: drawn ? 1 : 0,
              transition: still
                ? "none"
                : `opacity 300ms ${EASE_MOVE} 700ms`,
            }}
          />
          <path
            d={path ? shownLine : emptyPath}
            pathLength={1}
            fill="none"
            className="stroke-fg"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            style={{
              strokeDasharray: "1 2",
              strokeDashoffset: drawn ? 0 : 1,
              transition: still
                ? "none"
                : `stroke-dashoffset 700ms ${EASE_ENTER}`,
            }}
          />
          {markerPoint ? (
            <g>
              <line
                x1={markerPoint.x}
                x2={markerPoint.x}
                y1={padding.top}
                y2={baseline}
                className="stroke-line"
                strokeWidth="1"
              />
              <circle
                cx={markerPoint.x}
                cy={markerPoint.y}
                r="3.5"
                className="fill-star"
              />
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

export function PortfolioStats() {
  const localStats = useMemo(buildLocalStats, []);
  const fallbackActivityDays = useMemo(buildPortfolioActivityFallback, []);
  const hoverStore = useMemo(createHoverStore, []);
  const [githubSummary, setGithubSummary] = useState<GitHubSummary | null>(
    null,
  );
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>("loading");

  useEffect(() => {
    const cached = readCachedGitHubSummary();
    const controller = new AbortController();

    if (cached) {
      setGithubSummary(cached);
      setGithubStatus(cached.source === "private-snapshot" ? "private" : "cached");
    }

    fetchGeneratedGitHubSummary(controller.signal)
      .then((summary) => {
        writeCachedGitHubSummary(summary);
        setGithubSummary(summary);
        setGithubStatus(
          summary.source === "private-snapshot" ? "private" : "live",
        );
      })
      .catch(() =>
        fetchPublicGitHubSummary(controller.signal)
          .then((summary) => {
            writeCachedGitHubSummary(summary);
            setGithubSummary(summary);
            setGithubStatus("live");
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") {
              return;
            }

            if (!cached) {
              setGithubStatus("fallback");
            }
          }),
      );

    return () => controller.abort();
  }, []);

  const activityDays = githubSummary?.activityDays ?? fallbackActivityDays;
  const contributionMix = [
    {
      count:
        githubSummary?.commitContributions ??
        activityDays.reduce((sum, day) => sum + day.commits, 0),
      label: "commits",
    },
    {
      count: githubSummary?.pullRequestContributions ?? 0,
      label: "pull requests",
    },
    { count: githubSummary?.issueContributions ?? 0, label: "issues" },
    { count: githubSummary?.reviewContributions ?? 0, label: "reviews" },
  ].filter((item) => item.count > 0);
  const topLanguages =
    githubSummary?.topLanguages.length
      ? githubSummary.topLanguages
      : ["TypeScript", "C#", "Java", "C++", "SQL"];
  const hasPrivateSnapshot = githubSummary?.source === "private-snapshot";
  const hasLimitedSnapshot =
    hasPrivateSnapshot &&
    (githubSummary.privateRepos ?? 0) === 0 &&
    (githubSummary.restrictedContributions ?? 0) > 0;
  const hasCompletePrivateSnapshot = hasPrivateSnapshot && !hasLimitedSnapshot;
  const hasAllTimeContributionTotal =
    githubSummary?.allTimeContributions !== undefined &&
    githubSummary.allTimeContributions > 0;
  const totalContributionValue =
    githubSummary?.allTimeContributions ??
    githubSummary?.totalContributions ??
    githubSummary?.activityEvents ??
    localStats.evidenceSignals;
  const incompleteSuffix = hasCompletePrivateSnapshot ? "" : "+";
  const contributionSuffix =
    hasPrivateSnapshot && !hasAllTimeContributionTotal ? "+" : incompleteSuffix;
  const traceDays =
    githubSummary?.allTimeContributionDays?.length
      ? githubSummary.allTimeContributionDays
      : activityDays;
  const longestStreak = longestContributionStreak(traceDays);
  const peakDay = peakContributionDay(traceDays);
  const updated = githubSummary?.generatedAt ?? githubSummary?.updatedAt;
  const updatedText = updated ? formatDate(updated) : "";
  const statusText =
    githubStatus === "loading" && !githubSummary
      ? "Loading GitHub data."
      : githubStatus === "fallback"
        ? "GitHub could not be reached. These figures come from the projects on this site."
        : hasLimitedSnapshot
          ? `Snapshot from ${updatedText}. Private repository access was limited, so totals may be low.`
          : githubStatus === "private"
            ? `Snapshot from ${updatedText}, including private repositories.`
            : githubStatus === "cached"
              ? `Cached copy of GitHub data${updatedText ? `, updated ${updatedText}` : ""}.`
              : `Live from the public GitHub API${updatedText ? `, updated ${updatedText}` : ""}.`;
  const figures = [
    {
      label: "Repositories",
      value: `${formatNumber(githubSummary?.repos ?? localStats.linkedRepos)}${incompleteSuffix}`,
    },
    {
      label: "Contributions",
      value: `${formatNumber(totalContributionValue)}${contributionSuffix}`,
    },
    {
      label: "Longest streak (days)",
      value: `${formatNumber(longestStreak)}${incompleteSuffix}`,
    },
    {
      label: peakDay?.date
        ? `Most in one day, ${formatAxisDate(peakDay.date)}`
        : "Most in one day",
      value: `${formatNumber(peakDay?.count ?? 0)}${incompleteSuffix}`,
    },
  ];

  return (
    <section
      id="github"
      className="relative isolate scroll-mt-20"
      aria-label="GitHub activity"
    >
      <div className="section">
        <SectionHeading
          title="GitHub activity"
          description="Repositories, contributions, streaks and languages from my GitHub account."
        />

        <p className="mt-6 text-sm text-fg-muted">{statusText}</p>

        <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:flex sm:flex-wrap sm:gap-x-12 sm:gap-y-8">
          {figures.map((figure) => (
            <div key={figure.label}>
              <p className="text-[38px] font-light leading-[1.1] tabular-nums text-fg">
                {figure.value}
              </p>
              <p className="mt-1 text-sm text-fg-muted">{figure.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-14">
          <ContributionGrid days={activityDays} hoverStore={hoverStore} />
        </div>

        <div className="mt-14">
          <ActivityTrace
            allTimeDays={traceDays}
            hoverStore={hoverStore}
            totalContributions={totalContributionValue}
            yearDays={activityDays}
          />
        </div>

        <div className="mt-14 max-w-[680px]">
          <h3 className="mb-4 text-[21px] font-medium text-fg">Languages</h3>
          <p className="text-sm text-fg-muted">{topLanguages.join(", ")}</p>
          {contributionMix.length > 0 ? (
            <p className="mt-6 text-sm text-fg-muted">
              Contributions by type:{" "}
              {contributionMix
                .map((item) => `${formatNumber(item.count)} ${item.label}`)
                .join(", ")}
            </p>
          ) : null}
          <p className="mt-6 text-sm">
            <a
              href={site.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="link inline-flex items-center gap-2"
            >
              <Github size={16} strokeWidth={1.5} aria-hidden="true" />
              View GitHub profile
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
