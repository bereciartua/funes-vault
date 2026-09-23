import { MemorySensitivity } from "@funes-vault/db";
import { z } from "zod";

// Single catalog of every environment variable the API reads. Two layers:
//
// - `validateEnvironment()` runs once at bootstrap with the strict schema
//   and fails fast (listing the offending variables) on typos such as a
//   misspelled sensitivity level or a malformed URL.
// - `apiEnv()` is the lazy, tolerant read used at call sites. It never
//   throws on enum-ish values, so domain helpers keep their documented
//   fallback behavior and tests can exercise it.

const flag = z
  .stringbool({ truthy: ["true", "1", "yes"], falsy: ["false", "0", "no"] })
  .optional();

export const apiEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z
    .url()
    .default("http://localhost:4000/auth/google/callback"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  LOG_FORMAT: z.string().optional(),
  LOG_LEVELS: z.string().optional(),
  BULL_BOARD_ENABLED: flag,
  JOB_WORKER_ENABLED: flag,
  WORKER_HEARTBEAT_FILE: z.string().default("/tmp/funes-vault-worker-ready"),
  CONSOLIDATION_CRON: z.string().default("0 3 * * *"),
  OPENAI_API_KEY: z.string().optional(),
  TYPESAFE_API_KEY: z.string().optional(),
  MEMORY_EXTRACTION_SYSTEM: z.enum(["system_1", "system_2"]).optional(),
  MEMORY_CONSOLIDATION_SYSTEM: z.enum(["system_1", "system_2"]).optional(),
  MEMORY_EXTRACTION_LLM_MODEL: z.string().optional(),
  MEMORY_CONSOLIDATION_LLM_MODEL: z.string().optional(),
  MEMORY_NORMALIZATION_LLM_MODEL: z.string().optional(),
  MEMORY_EXTRACTION_JEV_MODEL: z.string().default("jev-1.13.0"),
  MEMORY_CONSOLIDATION_JEV_MODEL: z.string().default("jev-1.13.0"),
  MEMORY_EXTRACTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(300000)
    .default(15000),
  MEMORY_CONSOLIDATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(300000)
    .default(60000),
  MEMORY_EXTRACTION_WRITE_MODE: z.enum(["policy", "review"]).default("policy"),
  MEMORY_CONSOLIDATION_APPLY_MODE: z
    .enum(["user_setting", "review"])
    .default("user_setting"),
  MEMORY_CONSOLIDATION_MAX_SENSITIVITY: z
    .enum(MemorySensitivity)
    .default("INTERNAL"),
  // Deadline for non-streaming OpenAI calls (chat answers, titles,
  // consolidation decisions, embeddings). Streaming chat is bounded by the
  // client's own abort signal instead.
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  OPENAI_CHAT_MODEL: z.string().default("gpt-5.5"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-2"),
  OPENAI_REALTIME_VOICE: z.string().default("cedar"),
  OPENAI_REALTIME_TRANSCRIPTION_MODEL: z
    .string()
    .default("gpt-4o-mini-transcribe"),
  EMBEDDINGS_MAX_SENSITIVITY: z.string().optional(),
  VOICE_MAX_SENSITIVITY: z.string().optional(),
  MCP_CONNECTOR_MAX_SENSITIVITY: z.string().optional(),
  OAUTH_ISSUER_URL: z.string().optional(),
  OAUTH_MCP_RESOURCE_URL: z.string().optional(),
  VOICE_MAX_SESSION_SECONDS: z.coerce.number().int().positive().default(600),
  VOICE_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(90),
  VOICE_DAILY_SESSION_CAP: z.coerce.number().int().positive().default(20),
  OAUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  OAUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  OAUTH_MAX_PENDING_REGISTRATIONS: z.coerce.number().int().positive().optional()
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

const sensitivityLevel = z.enum(MemorySensitivity).optional();

const strictBootSchema = apiEnvSchema
  .extend({
    DATABASE_URL: z.url().optional(),
    REDIS_URL: z.url().optional(),
    EMBEDDINGS_MAX_SENSITIVITY: sensitivityLevel,
    VOICE_MAX_SENSITIVITY: sensitivityLevel,
    MCP_CONNECTOR_MAX_SENSITIVITY: sensitivityLevel,
    OAUTH_ISSUER_URL: z.url().optional(),
    OAUTH_MCP_RESOURCE_URL: z.url().optional()
  })
  .check((ctx) => {
    if (
      ctx.value.NODE_ENV === "production" &&
      new URL(ctx.value.APP_URL).protocol !== "https:"
    ) {
      ctx.issues.push({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL must use HTTPS in production",
        input: ctx.value.APP_URL
      });
    }
    for (const task of ["EXTRACTION", "CONSOLIDATION"] as const) {
      const system = ctx.value[`MEMORY_${task}_SYSTEM`];
      const missing =
        system === "system_1" && !ctx.value.TYPESAFE_API_KEY
          ? "TYPESAFE_API_KEY"
          : system &&
              (system === "system_2" || task === "EXTRACTION") &&
              !ctx.value.OPENAI_API_KEY
            ? "OPENAI_API_KEY"
            : null;
      if (missing) {
        ctx.issues.push({
          code: "custom",
          path: [`MEMORY_${task}_SYSTEM`],
          message: `${missing} is required for the selected task`,
          input: system
        });
      }
    }
    const redirect = new URL(ctx.value.GOOGLE_REDIRECT_URI);
    if (
      redirect.pathname !== "/auth/google/callback" ||
      redirect.search ||
      redirect.hash ||
      redirect.username ||
      redirect.password ||
      (redirect.protocol !== "https:" &&
        !(
          ctx.value.NODE_ENV !== "production" &&
          redirect.protocol === "http:" &&
          redirect.hostname === "localhost"
        ))
    ) {
      ctx.issues.push({
        code: "custom",
        message:
          "Use HTTPS (or HTTP localhost in development) with /auth/google/callback and no query or fragment",
        path: ["GOOGLE_REDIRECT_URI"],
        input: ctx.value.GOOGLE_REDIRECT_URI
      });
    }
    if (
      ctx.value.NODE_ENV === "production" &&
      (!ctx.value.GOOGLE_CLIENT_ID || !ctx.value.GOOGLE_CLIENT_SECRET)
    ) {
      ctx.issues.push({
        code: "custom",
        message: "Google sign-in credentials are required in production",
        path: ["GOOGLE_CLIENT_ID"],
        input: ctx.value.GOOGLE_CLIENT_ID
      });
    }
    if (ctx.value.NODE_ENV === "production" && !ctx.value.DATABASE_URL) {
      ctx.issues.push({
        code: "custom",
        message: "DATABASE_URL is required in production",
        path: ["DATABASE_URL"],
        input: ctx.value.DATABASE_URL
      });
    }
  });

// Docker composes often set variables to empty strings; treat those as
// unset so defaults apply.
function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[1].trim() !== ""
    )
  );
}

let validatedEnvironment: ApiEnv | undefined;

export function apiEnv(): ApiEnv {
  return validatedEnvironment ?? apiEnvSchema.parse(definedEnv(process.env));
}

/** @internal Reset bootstrap memoization between tests that change the environment. */
export function resetEnvironmentForTests() {
  validatedEnvironment = undefined;
}

export function validateEnvironment() {
  const result = strictBootSchema.safeParse(definedEnv(process.env));

  if (!result.success) {
    const details = Object.entries(z.flattenError(result.error).fieldErrors)
      .map(([name, messages]) => `  ${name}: ${messages?.join("; ")}`)
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  validatedEnvironment = result.data;
}
