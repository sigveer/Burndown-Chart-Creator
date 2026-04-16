import index from "./index.html";
import * as v from "valibot";
import {
  EnvSchema,
  createProjectItemNodeSchema,
  type Env,
  type ProjectItem,
  type BurndownPoint,
} from "./schema";

let env: Env;
try {
  env = v.parse(EnvSchema, process.env);
} catch (e) {
  console.error("Failed to validate environment variables:");
  if (e instanceof v.ValiError) {
    console.error("Valibot error:", e.message);
    console.error("Issues:", e.issues);
  }
  process.exit(1);
}

const GRAPHQL_URL =
  env.github.host === "github.com"
    ? "https://api.github.com/graphql"
    : `https://${env.github.host}/api/graphql`;

const ProjectItemNodeSchema = createProjectItemNodeSchema(env.fields);

async function graphql(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.github.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

async function fetchProjectItems(): Promise<ProjectItem[]> {
  const items: ProjectItem[] = [];
  let cursor: string | null = null;

  while (true) {
    const data = await graphql(
      `
      query($owner: String!, $number: Int!, $cursor: String) {
        ${env.github.ownerType === "user" ? "user" : "organization"}(login: $owner) {
          projectV2(number: $number) {
            items(first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2SingleSelectField { name } }
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      title
                      field { ... on ProjectV2IterationField { name } }
                    }
                  }
                }
                content {
                  ... on Issue {
                    title
                    closedAt
                  }
                  ... on PullRequest {
                    title
                    closedAt
                  }
                }
              }
            }
          }
        }
      }
      `,
      { owner: env.github.owner, number: env.github.projectNumber, cursor },
    );

    const ownerData = env.github.ownerType === "user" ? data.user : data.organization;
    const project = ownerData.projectV2;
    if (!project)
      throw new Error(
        `Project #${env.github.projectNumber} not found for ${env.github.owner}`,
      );

    const page = project.items;
    for (const node of page.nodes) {
      const item = v.parse(ProjectItemNodeSchema, node);
      if (!item) continue;
      if (env.sprintName && item.sprint !== env.sprintName) continue;
      items.push(item);
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  return items;
}

type Priority = "High" | "Medium" | "Low";
const PRIORITIES: Priority[] = ["High", "Medium", "Low"];

function normalizePriority(p: string): Priority {
  const lower = p.toLowerCase();
  if (
    lower.includes("high") ||
    lower === "p0" ||
    lower === "urgent" ||
    lower === "critical"
  )
    return "High";
  if (lower.includes("medium") || lower === "p1" || lower === "normal")
    return "Medium";
  return "Low";
}

function buildBurndownData(items: ProjectItem[]) {
  const start = new Date(env.timeRange.start);
  const end = new Date(env.timeRange.end);
  const totalWorkload = items.reduce((sum, i) => sum + i.workload, 0);

  // Build list of dates in the sprint
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]!);
  }

  // Initial remaining workload per priority
  const remaining: Record<Priority, number> = { High: 0, Medium: 0, Low: 0 };
  for (const item of items) {
    remaining[normalizePriority(item.priority)] += item.workload;
  }

  // Group completed workload by date and priority
  const completedByDatePriority = new Map<string, Record<Priority, number>>();
  for (const item of items) {
    if (item.status === env.fields.doneStatus && item.closedAt) {
      const date = item.closedAt.split("T")[0];
      if (!completedByDatePriority.has(date)) {
        completedByDatePriority.set(date, { High: 0, Medium: 0, Low: 0 });
      }
      completedByDatePriority.get(date)![normalizePriority(item.priority)] +=
        item.workload;
    }
  }

  // Build burndown series
  const today = new Date().toISOString().split("T")[0];
  const series: BurndownPoint[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const completed = completedByDatePriority.get(date);
    if (completed) {
      for (const p of PRIORITIES) remaining[p] -= completed[p];
    }

    const ideal = totalWorkload - (totalWorkload * i) / (dates.length - 1);

    series.push({
      date,
      High: remaining.High,
      Medium: remaining.Medium,
      Low: remaining.Low,
      ideal,
      isFuture: date > today,
    });
  }

  return { series, totalWorkload };
}

Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/api/burndown": {
      async GET() {
        try {
          const items = await fetchProjectItems();
          const burndown = buildBurndownData(items);
          return Response.json({ items, burndown });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500 });
        }
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Burndown chart server running at http://localhost:3000");
