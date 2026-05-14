import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ACTIVITY_DAY_COUNT = 371;
const DAY_MS = 1000 * 60 * 60 * 24;
const EVENT_LABELS = {
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

function loadLocalEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2]
      .replace(/^['"]|['"]$/g, "")
      .trim();
  }
}

loadLocalEnvFile(resolve(".env.local"));

const username = process.env.GITHUB_STATS_USER || "Omar-Alkhamissi";
const token = process.env.GH_STATS_TOKEN;

if (!token) {
  console.log("GH_STATS_TOKEN is not set; skipping private GitHub stats snapshot.");
  process.exit(0);
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "omar-portfolio-github-stats",
  "X-GitHub-Api-Version": "2022-11-28",
};

function buildEmptyActivityDays() {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Array.from({ length: ACTIVITY_DAY_COUNT }, (_, index) => {
    const date = new Date(today - (ACTIVITY_DAY_COUNT - 1 - index) * DAY_MS);

    return {
      commits: 0,
      count: 0,
      date: date.toISOString().slice(0, 10),
      events: 0,
      pushes: 0,
    };
  });
}

function buildActivityDay(date, count) {
  return {
    commits: count,
    count,
    date,
    events: 0,
    pushes: 0,
  };
}

function utcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

async function githubJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }

  return response.json();
}

async function githubGraphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    body: JSON.stringify({ query, variables }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "omar-portfolio-github-stats",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: GitHub GraphQL`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data;
}

async function paginate(url) {
  const items = [];
  let nextUrl = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${nextUrl}`);
    }

    items.push(...(await response.json()));
    const link = response.headers.get("link") || "";
    const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch?.[1] ?? "";
  }

  return items;
}

function collectCalendarCounts(calendar, from, to) {
  const counts = new Map();
  const fromKey = from.toISOString().slice(0, 10);
  const toKey = to.toISOString().slice(0, 10);

  for (const week of calendar?.weeks ?? []) {
    for (const day of week.contributionDays ?? []) {
      if (day.date >= fromKey && day.date <= toKey) {
        counts.set(day.date, day.contributionCount || 0);
      }
    }
  }

  return counts;
}

function eventLabel(type) {
  return EVENT_LABELS[type] || "Other";
}

function buildEventTypeStats(events) {
  const counts = new Map();

  for (const event of events) {
    const label = eventLabel(event.type);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ count, label }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 4);
}

async function getContributionCalendarSlice(from, to) {
  const query = `
    query PortfolioContributionSlice($from: DateTime!, $to: DateTime!) {
      viewer {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;
  const data = await githubGraphql(query, {
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const calendar = data.viewer?.contributionsCollection?.contributionCalendar;

  return {
    counts: collectCalendarCounts(calendar, from, to),
    totalContributions: calendar?.totalContributions ?? 0,
  };
}

async function getAllTimeContributionData(accountCreatedAt, now) {
  const counts = new Map();
  let totalContributions = 0;
  let cursor = utcDay(new Date(accountCreatedAt));
  const finalInstant = now;
  const finalDay = utcDay(now);

  while (cursor <= finalDay) {
    const sliceEnd = new Date(
      Math.min(cursor.getTime() + 365 * DAY_MS - 1, finalInstant.getTime()),
    );
    const slice = await getContributionCalendarSlice(cursor, sliceEnd);

    totalContributions += slice.totalContributions;
    for (const [date, count] of slice.counts) {
      counts.set(date, (counts.get(date) || 0) + count);
    }

    cursor = new Date(utcDay(sliceEnd).getTime() + DAY_MS);
  }

  return {
    counts,
    days: [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => buildActivityDay(date, count)),
    totalContributions,
  };
}

function mergeActivityDays(events, contributionCountsByDate) {
  const days = buildEmptyActivityDays();
  const dayByDate = new Map(days.map((day) => [day.date, day]));

  for (const [date, count] of contributionCountsByDate) {
    const day = dayByDate.get(date);

    if (day) {
      day.count = count;
      day.commits = count;
    }
  }

  for (const event of events) {
    if (!event.created_at) {
      continue;
    }

    const dateKey = new Date(event.created_at).toISOString().slice(0, 10);
    const day = dayByDate.get(dateKey);

    if (!day) {
      continue;
    }

    const pushSize =
      event.type === "PushEvent"
        ? event.payload?.size ?? event.payload?.commits?.length ?? 0
        : 0;

    day.events += 1;
    day.pushes += event.type === "PushEvent" ? 1 : 0;
    day.commits += pushSize;
    day.count = Math.max(day.count, pushSize, day.events);
  }

  return days;
}

async function getContributionData() {
  const now = new Date();
  const from = new Date(now.getTime() - (ACTIVITY_DAY_COUNT - 1) * DAY_MS);
  const query = `
    query PortfolioContributions($from: DateTime!, $to: DateTime!) {
      viewer {
        createdAt
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          restrictedContributionsCount
          totalRepositoriesWithContributedCommits
          totalRepositoriesWithContributedIssues
          totalRepositoriesWithContributedPullRequests
          totalRepositoriesWithContributedPullRequestReviews
          totalRepositoryContributions
          commitContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
            }
          }
          issueContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
            }
          }
          pullRequestContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
            }
          }
          pullRequestReviewContributionsByRepository(maxRepositories: 100) {
            repository {
              nameWithOwner
            }
          }
          repositoryContributions(first: 100) {
            totalCount
            nodes {
              repository {
                nameWithOwner
              }
            }
          }
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;
  const data = await githubGraphql(query, {
    from: from.toISOString(),
    to: now.toISOString(),
  });
  const counts = new Map();
  const collection = data.viewer?.contributionsCollection;
  const calendar = collection?.contributionCalendar;
  const weeks = calendar?.weeks ?? [];
  const allTime = await getAllTimeContributionData(data.viewer?.createdAt, now);
  const repositoryNames = new Set();

  for (const week of weeks) {
    for (const day of week.contributionDays ?? []) {
      counts.set(day.date, day.contributionCount || 0);
    }
  }

  [
    ...(collection?.commitContributionsByRepository ?? []),
    ...(collection?.issueContributionsByRepository ?? []),
    ...(collection?.pullRequestContributionsByRepository ?? []),
    ...(collection?.pullRequestReviewContributionsByRepository ?? []),
  ].forEach((entry) => {
    if (entry.repository?.nameWithOwner) {
      repositoryNames.add(entry.repository.nameWithOwner);
    }
  });

  (collection?.repositoryContributions?.nodes ?? []).forEach((entry) => {
    if (entry.repository?.nameWithOwner) {
      repositoryNames.add(entry.repository.nameWithOwner);
    }
  });

  const repositoryContributionFloor = Math.max(
    collection?.totalRepositoriesWithContributedCommits ?? 0,
    collection?.totalRepositoriesWithContributedIssues ?? 0,
    collection?.totalRepositoriesWithContributedPullRequests ?? 0,
    collection?.totalRepositoriesWithContributedPullRequestReviews ?? 0,
    collection?.totalRepositoryContributions ?? 0,
  );

  return {
    accountCreatedAt: data.viewer?.createdAt ?? null,
    allTimeContributionDays: allTime.days,
    allTimeContributions: allTime.totalContributions,
    commitContributions: collection?.totalCommitContributions ?? 0,
    contributedRepositories: Math.max(
      repositoryNames.size,
      collection?.repositoryContributions?.totalCount ?? 0,
      repositoryContributionFloor,
    ),
    counts,
    issueContributions: collection?.totalIssueContributions ?? 0,
    pullRequestContributions: collection?.totalPullRequestContributions ?? 0,
    restrictedContributions: collection?.restrictedContributionsCount ?? 0,
    reviewContributions: collection?.totalPullRequestReviewContributions ?? 0,
    totalContributions: calendar?.totalContributions ?? 0,
  };
}

async function getActivityEvents() {
  try {
    return await githubJson(
      `https://api.github.com/users/${username}/events?per_page=100`,
    );
  } catch {
    return githubJson(
      `https://api.github.com/users/${username}/events/public?per_page=100`,
    );
  }
}

const [viewer, repos, events, contributionData] = await Promise.all([
  githubJson("https://api.github.com/user"),
  paginate(
    "https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&per_page=100&sort=updated",
  ),
  getActivityEvents(),
  getContributionData(),
]);

if (viewer.login?.toLowerCase() !== username.toLowerCase()) {
  console.warn(
    `GH_STATS_TOKEN belongs to ${viewer.login}; expected ${username}. Continuing with authenticated viewer data.`,
  );
}

const languageCounts = new Map();
let forks = 0;
let stars = 0;
let updatedAt = viewer.updated_at || null;

for (const repo of repos) {
  forks += repo.forks_count || 0;
  stars += repo.stargazers_count || 0;

  if (repo.updated_at && (!updatedAt || repo.updated_at > updatedAt)) {
    updatedAt = repo.updated_at;
  }

  if (!repo.fork && repo.language) {
    languageCounts.set(repo.language, (languageCounts.get(repo.language) || 0) + 1);
  }
}

const activityDays = mergeActivityDays(events, contributionData.counts);
const privateRepos = repos.filter((repo) => repo.private).length;
const publicRepos = repos.length - privateRepos;
const activityEvents = activityDays.reduce((sum, day) => sum + day.count, 0);
const contributionDays = activityDays.filter((day) => day.count > 0).length;
const pushes = activityDays.reduce((sum, day) => sum + day.pushes, 0);
const tokenHasLimitedRepoAccess =
  privateRepos === 0 && contributionData.restrictedContributions > 0;
const topLanguages = [...languageCounts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 5)
  .map(([language]) => language);

const output = {
  activityDays,
  activityEvents,
  accountCreatedAt: contributionData.accountCreatedAt,
  allTimeContributionDays: contributionData.allTimeContributionDays,
  allTimeContributions: contributionData.allTimeContributions,
  commitContributions: contributionData.commitContributions,
  contributedRepositories: contributionData.contributedRepositories,
  contributionDays,
  eventTypes: buildEventTypeStats(events),
  forks,
  generatedAt: new Date().toISOString(),
  issueContributions: contributionData.issueContributions,
  privateRepos,
  publicRepos,
  pullRequestContributions: contributionData.pullRequestContributions,
  pushes,
  repos: repos.length,
  restrictedContributions: contributionData.restrictedContributions,
  reviewContributions: contributionData.reviewContributions,
  source: "private-snapshot",
  stars,
  topLanguages,
  totalContributions: contributionData.totalContributions,
  updatedAt,
};
const outputPath = resolve("public/github-stats.json");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  `Generated ${outputPath} with ${output.repos} repos (${output.privateRepos} private).`,
);

if (tokenHasLimitedRepoAccess) {
  console.warn(
    "Token access looks limited: GitHub reports restricted/private contributions, but this token can list 0 private repos. Edit or recreate the token with Repository access set to All repositories, then rerun npm run generate:github-stats.",
  );
}
