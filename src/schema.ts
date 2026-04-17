import * as v from "valibot";

export const EnvSchema = v.pipe(
  v.object({
    // Required
    GITHUB_TOKEN: v.string(),
    GITHUB_OWNER: v.string(),
    GITHUB_PROJECT_NUMBER: v.pipe(v.string(), v.transform(Number), v.number()),
    SPRINT_START: v.pipe(
      v.string(),
      v.isoDate(),
      v.transform((d) => new Date(d)),
    ),
    SPRINT_END: v.pipe(
      v.string(),
      v.isoDate(),
      v.transform((d) => new Date(d)),
    ),

    GITHUB_HOST: v.optional(v.string(), "github.com"),
    GITHUB_OWNER_TYPE: v.pipe(
      v.optional(v.string(), "organization"),
      v.transform((s) => s.toLowerCase()),
      v.union([v.literal("user"), v.literal("organization")]),
    ),

    WORKLOAD_FIELD_NAME: v.optional(v.string(), "Workload"),
    STATUS_FIELD_NAME: v.optional(v.string(), "Status"),
    DONE_STATUS_VALUE: v.optional(v.string(), "Done"),
    PRIORITY_FIELD_NAME: v.optional(v.string(), "Priority"),
    SPRINT_FIELD_NAME: v.optional(v.string(), "Sprint"),
    END_DATE_FIELD_NAME: v.optional(v.string(), "End date"),

    SPRINT_NAME: v.optional(v.string()),

    PORT: v.pipe(v.optional(v.string(), "3000"), v.transform(Number), v.number()),
  }),
  v.transform(
    ({
      GITHUB_TOKEN,
      GITHUB_HOST,
      GITHUB_OWNER,
      GITHUB_PROJECT_NUMBER,
      GITHUB_OWNER_TYPE,
      WORKLOAD_FIELD_NAME,
      STATUS_FIELD_NAME,
      DONE_STATUS_VALUE,
      PRIORITY_FIELD_NAME,
      SPRINT_FIELD_NAME,
      END_DATE_FIELD_NAME,
      SPRINT_NAME,
      SPRINT_START,
      SPRINT_END,
      PORT,
      ...v
    }) => ({
      github: {
        token: GITHUB_TOKEN,
        host: GITHUB_HOST,
        owner: GITHUB_OWNER,
        projectNumber: GITHUB_PROJECT_NUMBER,
        ownerType: GITHUB_OWNER_TYPE,
      },
      fields: {
        workload: WORKLOAD_FIELD_NAME,
        status: STATUS_FIELD_NAME,
        doneStatus: DONE_STATUS_VALUE,
        priority: PRIORITY_FIELD_NAME,
        sprint: SPRINT_FIELD_NAME,
        endDate: END_DATE_FIELD_NAME,
      },
      timeRange: {
        start: SPRINT_START,
        end: SPRINT_END,
      },
      sprintName: SPRINT_NAME,
      port: PORT,
      ...v,
    }),
  ),
);

export type Env = v.InferOutput<typeof EnvSchema>;

const FieldValueNodeSchema = v.looseObject({
  number: v.optional(v.nullable(v.number())),
  name: v.optional(v.string()),
  title: v.optional(v.string()),
  date: v.optional(v.nullable(v.string())),
  field: v.optional(v.object({ name: v.string() })),
});

export function createProjectItemNodeSchema(fields: Env["fields"]) {
  return v.pipe(
    v.object({
      fieldValues: v.object({
        nodes: v.array(FieldValueNodeSchema),
      }),
      content: v.nullable(
        v.looseObject({
          title: v.optional(v.string()),
        }),
      ),
    }),
    v.transform((node) => {
      if (!node.content?.title) return null;

      let workload = 0;
      let status = "";
      let priority = "Low";
      let sprint: string | null = null;
      let completedAt: string | null = null;

      for (const fv of node.fieldValues.nodes) {
        if (fv.field?.name === fields.workload && fv.number != null) workload = fv.number;
        if (fv.field?.name === fields.status && fv.name) status = fv.name;
        if (fv.field?.name === fields.priority && fv.name) priority = fv.name;
        if (fv.field?.name === fields.sprint && fv.title) sprint = fv.title;
        if (fv.field?.name === fields.endDate && fv.date) completedAt = fv.date;
      }

      return {
        title: node.content.title,
        workload,
        status,
        priority,
        sprint,
        completedAt,
      };
    }),
  );
}

export type ProjectItemNodeSchema = ReturnType<typeof createProjectItemNodeSchema>;
export type ProjectItem = NonNullable<v.InferOutput<ProjectItemNodeSchema>>;

export interface BurndownPoint {
  date: string;
  High: number;
  Medium: number;
  Low: number;
  ideal: number;
  isFuture: boolean;
}
