import index from "./index.html";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_HOST = process.env.GITHUB_HOST ?? "github.com";
const GITHUB_OWNER = process.env.GITHUB_OWNER!;
const PROJECT_NUMBER = Number(process.env.GITHUB_PROJECT_NUMBER!);
const WORKLOAD_FIELD = process.env.WORKLOAD_FIELD_NAME ?? "Workload";
const STATUS_FIELD = process.env.STATUS_FIELD_NAME ?? "Status";
const DONE_VALUE = process.env.DONE_STATUS_VALUE ?? "Done";
const OWNER_TYPE = (process.env.GITHUB_OWNER_TYPE ?? "organization").toLowerCase();
const SPRINT_FIELD = process.env.SPRINT_FIELD_NAME ?? "Sprint";
const SPRINT_NAME = process.env.SPRINT_NAME;
const SPRINT_START = process.env.SPRINT_START!;
const SPRINT_END = process.env.SPRINT_END!;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !PROJECT_NUMBER || !SPRINT_START || !SPRINT_END) {
  console.error("Missing required .env variables. See .env.example");
  process.exit(1);
}

const GRAPHQL_URL =
  GITHUB_HOST === "github.com"
    ? "https://api.github.com/graphql"
    : `https://${GITHUB_HOST}/api/graphql`;

interface ProjectItem {
  title: string;
  workload: number;
  status: string;
  sprint: string | null;
  closedAt: string | null;
}

async function graphql(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
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
        ${OWNER_TYPE === "user" ? "user" : "organization"}(login: $owner) {
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
      { owner: GITHUB_OWNER, number: PROJECT_NUMBER, cursor }
    );

    const ownerData = OWNER_TYPE === "user" ? data.user : data.organization;
    const project = ownerData.projectV2;
    if (!project) throw new Error(`Project #${PROJECT_NUMBER} not found for ${GITHUB_OWNER}`);

    const page = project.items;
    for (const node of page.nodes) {
      const content = node.content;
      if (!content?.title) continue;

      let workload = 0;
      let status = "";
      let sprint: string | null = null;

      for (const fv of node.fieldValues.nodes) {
        if (fv.field?.name === WORKLOAD_FIELD && fv.number != null) {
          workload = fv.number;
        }
        if (fv.field?.name === STATUS_FIELD && fv.name) {
          status = fv.name;
        }
        if (fv.field?.name === SPRINT_FIELD && fv.title) {
          sprint = fv.title;
        }
      }

      // Filter by sprint if configured
      if (SPRINT_NAME && sprint !== SPRINT_NAME) continue;

      items.push({
        title: content.title,
        workload,
        status,
        sprint,
        closedAt: content.closedAt ?? null,
      });
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  return items;
}

function buildBurndownData(items: ProjectItem[]) {
  const start = new Date(SPRINT_START);
  const end = new Date(SPRINT_END);
  const totalWorkload = items.reduce((sum, i) => sum + i.workload, 0);

  // Build list of dates in the sprint
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }

  // Group completed workload by date
  const completedByDate = new Map<string, number>();
  for (const item of items) {
    if (item.status === DONE_VALUE && item.closedAt) {
      const date = item.closedAt.split("T")[0];
      completedByDate.set(date, (completedByDate.get(date) ?? 0) + item.workload);
    }
  }

  // Calculate actual burndown
  const actual: (number | null)[] = [];
  let remaining = totalWorkload;
  const today = new Date().toISOString().split("T")[0];

  for (const date of dates) {
    remaining -= completedByDate.get(date) ?? 0;
    if (date <= today) {
      actual.push(remaining);
    } else {
      actual.push(null);
    }
  }

  // Ideal burndown (linear from total to 0)
  const ideal = dates.map((_, i) => totalWorkload - (totalWorkload * i) / (dates.length - 1));

  return { dates, actual, ideal, totalWorkload };
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
