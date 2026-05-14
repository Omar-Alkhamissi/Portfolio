import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Code2,
  Github,
  GitFork,
  LockKeyhole,
  Radio,
  Star,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import { projects } from "../data/projects";
import { site } from "../data/site";
import { cn } from "../lib/cn";
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

function activityColor(count: number, maxCount: number) {
  if (count <= 0) {
    return "rgba(148, 163, 184, 0.16)";
  }

  const ratio = count / Math.max(1, maxCount);

  if (ratio > 0.66) {
    return "#f472b6";
  }

  if (ratio > 0.34) {
    return "#34d399";
  }

  return "#22d3ee";
}

function monthLabelForWeek(
  weeks: ActivityDay[][],
  week: ActivityDay[],
  index: number,
) {
  const current = new Date(`${week[0]?.date}T00:00:00Z`);
  const previous = weeks[index - 1]?.[0]
    ? new Date(`${weeks[index - 1][0].date}T00:00:00Z`)
    : null;

  if (index !== 0 && previous?.getUTCMonth() === current.getUTCMonth()) {
    return "";
  }

  return new Intl.DateTimeFormat("en", { month: "short" }).format(current);
}

function ContributionGrid({ days }: { days: ActivityDay[] }) {
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );
  const gridTemplateColumns = `repeat(${weeks.length}, minmax(0, 1fr))`;
  const maxCount = Math.max(1, ...days.map((day) => day.count));
  const activeDays = days.filter((day) => day.count > 0).length;
  const totalSignals = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-950/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            GitHub contribution grid
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {activeDays} active days / {formatNumber(totalSignals)} signals
          </p>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className="h-3 w-3 rounded-[3px] border border-white/[0.04]"
              style={{
                backgroundColor: activityColor(level, 4),
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto overflow-y-hidden pb-1">
        <div
          className="mx-auto mb-1 grid w-full max-w-[780px] gap-[3px] text-[10px] text-zinc-500"
          style={{ gridTemplateColumns }}
        >
          {weeks.map((week, index) => (
            <span
              key={week[0]?.date ?? index}
              className="h-4 overflow-visible whitespace-nowrap"
            >
              {monthLabelForWeek(weeks, week, index)}
            </span>
          ))}
        </div>
        <div
          className="mx-auto grid w-full max-w-[780px] gap-[3px]"
          style={{ gridTemplateColumns }}
        >
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid gap-[3px]">
              {week.map((day) => (
                <span
                  key={day.date}
                  className="aspect-square w-full rounded-[3px] border border-white/[0.035] transition-transform hover:scale-125"
                  style={{
                    backgroundColor: activityColor(day.count, maxCount),
                    boxShadow:
                      day.count > 0
                        ? `0 0 ${Math.min(
                            16,
                            5 + day.count * 0.9,
                          )}px ${activityColor(day.count, maxCount)}55`
                        : undefined,
                  }}
                  title={`${day.date}: ${day.count} contribution signals, ${day.pushes} pushes`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityTrace({
  allTimeDays = [],
  totalContributions,
  yearDays = [],
}: {
  allTimeDays: ActivityDay[];
  totalContributions: number;
  yearDays: ActivityDay[];
}) {
  const [range, setRange] = useState<ChartRange>("all");
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  const width = 760;
  const height = 270;
  const padding = {
    bottom: 44,
    left: 70,
    right: 24,
    top: 18,
  };
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
  const safePath = path || emptyPath;
  const safeAreaPath =
    path ? areaPath : `${emptyPath} L ${width - padding.right} ${baseline} L ${padding.left} ${baseline} Z`;
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    label: formatNumber(Math.round(maxValue * ratio)),
    y: baseline - ratio * innerHeight,
  }));
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((ratio, index) => {
    const dayIndex = Math.min(
      days.length - 1,
      Math.max(0, Math.round((days.length - 1) * ratio)),
    );

    return {
      label: formatAxisDate(days[dayIndex]?.date),
      textAnchor: index === 0 ? "start" : index === 3 ? "end" : "middle",
      x: padding.left + ratio * innerWidth,
    };
  });
  const activeRangeLabel =
    CHART_RANGE_OPTIONS.find((option) => option.value === range)?.label ??
    "All time";
  const rangeSummary = [
    `${formatNumber(displayedTotal)} contributions`,
    days.length
      ? `${formatAxisDate(days[0]?.date)} to ${formatAxisDate(
          days[days.length - 1]?.date,
        )}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const rangeSelectId = "github-chart-range";
  const rangeMenuId = "github-chart-range-menu";
  const axisColor = "rgba(244,244,245,0.36)";
  const gridColor = "rgba(255,255,255,0.06)";
  const tickColor = "rgba(244,244,245,0.62)";
  const yAxisLabelX = 16;
  const yAxisLabelY = padding.top + innerHeight / 2;
  const xAxisLabelX = padding.left + innerWidth;
  const xAxisLabelY = height - 4;

  const setRangeAndClose = (nextRange: ChartRange) => {
    setRange(nextRange);
    setRangeMenuOpen(false);
    setHoveredPoint(null);
  };

  const handleChartPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!points.length) {
      setHoveredPoint(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const chartX =
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
    const ratio = Math.min(
      1,
      Math.max(0, (chartX - padding.left) / innerWidth),
    );
    const index = Math.min(
      points.length - 1,
      Math.max(0, Math.round(ratio * (points.length - 1))),
    );

    setHoveredPoint(points[index]);
  };

  const tooltipWidth = 186;
  const tooltipHeight = 58;
  const tooltipX = hoveredPoint
    ? Math.min(
        width - padding.right - tooltipWidth,
        Math.max(padding.left + 8, hoveredPoint.x + 12),
      )
    : 0;
  const tooltipY = hoveredPoint
    ? Math.max(padding.top + 8, hoveredPoint.y - tooltipHeight - 12)
    : 0;

  return (
    <div className="flex h-full min-h-[260px] flex-col rounded-2xl border border-white/[0.08] bg-ink-950/30 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Contribution curve
          </span>
          <p className="mt-1 text-xs text-zinc-500">{rangeSummary}</p>
        </div>
        <span className="sr-only" id={rangeSelectId}>
          Contribution chart range
        </span>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-labelledby={rangeSelectId}
            aria-controls={rangeMenuOpen ? rangeMenuId : undefined}
            aria-haspopup="listbox"
            aria-expanded={rangeMenuOpen}
            onClick={() => setRangeMenuOpen((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setRangeMenuOpen(false);
              }
            }}
            className="inline-flex min-w-[118px] items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 outline-none transition-colors hover:border-accent/40 hover:text-accent focus-visible:border-accent/70"
          >
            {activeRangeLabel}
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {rangeMenuOpen ? (
            <div
              id={rangeMenuId}
              role="listbox"
              aria-labelledby={rangeSelectId}
              className="absolute right-0 top-[calc(100%+0.35rem)] z-30 min-w-[150px] overflow-hidden rounded-xl border border-white/[0.1] bg-ink-950/95 p-1 shadow-[0_18px_45px_rgba(0,0,0,0.42)] backdrop-blur-xl"
            >
              {CHART_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === range}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setRangeAndClose(option.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                    option.value === range
                      ? "bg-accent/15 text-accent"
                      : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
                  )}
                >
                  {option.label}
                  {option.value === range ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`GitHub cumulative contribution curve, ${activeRangeLabel}`}
        className="min-h-56 w-full flex-1"
        preserveAspectRatio="none"
        onPointerMove={handleChartPointerMove}
        onPointerLeave={() => setHoveredPoint(null)}
      >
        <defs>
          <linearGradient id="github-signal-area" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id="github-signal-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#bae6fd" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={`${tick.label}-${tick.y.toFixed(2)}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={tick.y}
              y2={tick.y}
              stroke={gridColor}
              strokeWidth="1"
            />
            <line
              x1={padding.left - 5}
              x2={padding.left}
              y1={tick.y}
              y2={tick.y}
              stroke={axisColor}
              strokeWidth="1"
            />
            <text
              x={padding.left - 10}
              y={tick.y + 4}
              fill={tickColor}
              fontFamily="monospace"
              fontSize="12"
              textAnchor="end"
            >
              {tick.label}
            </text>
          </g>
        ))}
        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={baseline}
          stroke={axisColor}
          strokeWidth="1.5"
        />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={baseline}
          y2={baseline}
          stroke={axisColor}
          strokeWidth="1.5"
        />
        {xTicks
          .filter((tick) => tick.label)
          .map((tick) => (
            <g key={`${tick.label}-${tick.x.toFixed(1)}`}>
              <line
                x1={tick.x}
                x2={tick.x}
                y1={baseline}
                y2={baseline + 5}
                stroke={axisColor}
                strokeWidth="1"
              />
              <text
                x={tick.x}
                y={baseline + 22}
                fill={tickColor}
                fontFamily="monospace"
                fontSize="11"
                textAnchor={tick.textAnchor as "start" | "middle" | "end"}
              >
                {tick.label}
              </text>
            </g>
          ))}
        <text
          x={yAxisLabelX}
          y={yAxisLabelY}
          fill="rgba(244,244,245,0.64)"
          fontFamily="monospace"
          fontSize="11"
          textAnchor="middle"
          transform={`rotate(-90 ${yAxisLabelX} ${yAxisLabelY})`}
        >
          Contributions
        </text>
        <text
          x={xAxisLabelX}
          y={xAxisLabelY}
          fill="rgba(244,244,245,0.64)"
          fontFamily="monospace"
          fontSize="11"
          textAnchor="end"
        >
          Date
        </text>
        <path d={safeAreaPath} fill="url(#github-signal-area)" />
        <path
          d={safePath}
          fill="none"
          stroke="url(#github-signal-line)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {hoveredPoint ? (
          <g>
            <line
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={padding.top}
              y2={baseline}
              stroke="rgba(125,211,252,0.42)"
              strokeDasharray="4 5"
              strokeWidth="1.2"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="5.5"
              fill="#0f172a"
              stroke="#7dd3fc"
              strokeWidth="2.5"
            />
            <g transform={`translate(${tooltipX} ${tooltipY})`}>
              <rect
                width={tooltipWidth}
                height={tooltipHeight}
                rx="10"
                fill="rgba(8,13,20,0.94)"
                stroke="rgba(125,211,252,0.32)"
              />
              <text
                x="12"
                y="18"
                fill="#e4e4e7"
                fontFamily="monospace"
                fontSize="12"
                fontWeight="700"
              >
                {formatAxisDate(hoveredPoint.date)}
              </text>
              <text
                x="12"
                y="36"
                fill="rgba(244,244,245,0.74)"
                fontFamily="monospace"
                fontSize="11"
              >
                {formatNumber(hoveredPoint.total)} total
              </text>
              <text
                x="12"
                y="51"
                fill="rgba(125,211,252,0.92)"
                fontFamily="monospace"
                fontSize="11"
              >
                +{formatNumber(hoveredPoint.count)} that day
              </text>
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function BarList({ items }: { items: CountStat[] }) {
  const total = Math.max(
    1,
    items.reduce((sum, item) => sum + item.count, 0),
  );

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-zinc-400">
            <span>{item.label}</span>
            <span className="font-mono text-zinc-500">
              {formatNumber(item.count)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(7, (item.count / total) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PortfolioStats() {
  const localStats = useMemo(buildLocalStats, []);
  const fallbackActivityDays = useMemo(buildPortfolioActivityFallback, []);
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
      label: "Commits",
    },
    { count: githubSummary?.pullRequestContributions ?? 0, label: "PRs" },
    { count: githubSummary?.issueContributions ?? 0, label: "Issues" },
    { count: githubSummary?.reviewContributions ?? 0, label: "Reviews" },
  ].filter((item) => item.count > 0);
  const eventTypes =
    contributionMix.length > 0
      ? contributionMix
      : githubSummary?.eventTypes.length
        ? githubSummary.eventTypes
        : [
            { count: localStats.projects, label: "Projects" },
            { count: localStats.relations, label: "Relations" },
            { count: localStats.technologies, label: "Tech" },
          ];
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
  const sourceLabel =
    hasCompletePrivateSnapshot
      ? "GitHub data synced"
      : hasLimitedSnapshot
        ? "Public-only access"
        : githubStatus === "loading"
          ? "Syncing GitHub"
          : githubStatus === "cached"
            ? "Cached GitHub data"
            : githubStatus === "fallback"
              ? "Project data fallback"
              : "GitHub sync pending";
  const privateRepoLabel =
    hasCompletePrivateSnapshot && githubSummary?.privateRepos && githubSummary.privateRepos > 0
      ? `${formatNumber(githubSummary.privateRepos)} private repos`
      : hasLimitedSnapshot
        ? "private access limited"
      : "private totals pending";
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
  const signalStats = [
    {
      detail:
        hasCompletePrivateSnapshot && githubSummary?.privateRepos && githubSummary.privateRepos > 0
          ? `${formatNumber(githubSummary.publicRepos)} public + ${formatNumber(
              githubSummary.privateRepos,
            )} private`
          : hasLimitedSnapshot
            ? "public access only"
            : "private total pending",
      icon: Github,
      label: "Repos",
      value: `${formatNumber(githubSummary?.repos ?? localStats.linkedRepos)}${incompleteSuffix}`,
    },
    {
      detail:
        hasAllTimeContributionTotal
          ? "all-time contributions"
          : hasPrivateSnapshot
            ? "all-time after refresh"
            : "public total preview",
      icon: Activity,
      label: "Total contributions",
      value: `${formatNumber(totalContributionValue)}${contributionSuffix}`,
    },
    {
      detail: peakDay?.date
        ? formatAxisDate(peakDay.date)
        : "single-day high",
      icon: TrendingUp,
      label: "Best day",
      value: `${formatNumber(peakDay?.count ?? 0)}${incompleteSuffix}`,
    },
    {
      detail: "longest contribution run",
      icon: BarChart3,
      label: "Longest streak",
      value: `${formatNumber(longestStreak)}d${incompleteSuffix}`,
    },
  ];
  return (
    <section
      id="github"
      className="relative isolate scroll-mt-20 py-14 sm:py-18"
      aria-labelledby="portfolio-stats-heading"
    >
      <div className="section">
        <SectionHeading
          id="portfolio-stats-heading"
          eyebrow="04 / GitHub"
          title="Repository pulse."
          description="A live activity layer for repos, contributions, streaks, and language mix."
        />

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-10 overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.018))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:p-6"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(34,211,238,0.1),transparent_34%),linear-gradient(295deg,rgba(244,114,182,0.08),transparent_38%)]"
          />
          <div className="grid-overlay pointer-events-none absolute inset-0 opacity-35" />

          <div className="relative space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-ink-950/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6 min-[860px]:flex-row min-[860px]:items-end min-[860px]:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                  Activity source
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Public and private GitHub work, summarized as a compact
                  activity signal.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                  <Radio size={12} aria-hidden="true" />
                  {sourceLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                  <LockKeyhole size={12} aria-hidden="true" />
                  {privateRepoLabel}
                </span>
              </div>
            </div>

            <div className="github-dashboard-main">
              <div className="github-stat-rail">
                {signalStats.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{
                      duration: 0.45,
                      ease: "easeOut",
                      delay: index * 0.04,
                    }}
                    className="min-h-[124px] min-w-0 rounded-2xl border border-white/[0.08] bg-ink-950/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        {stat.label}
                      </span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-accent">
                        <stat.icon size={15} aria-hidden="true" />
                      </span>
                    </div>
                    <div className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
                      {stat.value}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                      {stat.detail}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className="github-visual-stack">
                <ContributionGrid days={activityDays} />
                <ActivityTrace
                  allTimeDays={traceDays}
                  totalContributions={totalContributionValue}
                  yearDays={activityDays}
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-2xl border border-white/[0.08] bg-ink-950/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <BarChart3 size={13} className="text-accent" aria-hidden="true" />
                  Contribution mix
                </div>
                <BarList items={eventTypes} />
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-ink-950/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <Code2 size={13} className="text-accent" aria-hidden="true" />
                  Language trace
                </div>
                <div className="flex flex-wrap gap-2">
                  {topLanguages.map((language) => (
                    <span key={language} className="badge">
                      {language}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <a
                    href={site.links.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400 transition-colors hover:text-accent"
                  >
                    <Github size={12} aria-hidden="true" />
                    View GitHub
                  </a>
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                    Updated {formatDate(githubSummary?.generatedAt ?? githubSummary?.updatedAt)}
                  </span>
                  {githubSummary && githubSummary.stars > 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                      <Star size={12} aria-hidden="true" />
                      {formatNumber(githubSummary.stars)}
                    </span>
                  ) : null}
                  {githubSummary && githubSummary.forks > 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                      <GitFork size={12} aria-hidden="true" />
                      {formatNumber(githubSummary.forks)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
