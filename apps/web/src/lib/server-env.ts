import { z } from "zod";
const httpUrl = z.url({ protocol: /^https?$/ });
const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PUBLIC_API_URL: httpUrl.optional(),
  NEXT_PUBLIC_API_URL: httpUrl.optional()
});
/** Read only on the server: PUBLIC_API_URL remains configurable in prebuilt images. */
export function serverEnv(
  env: Record<string, string | undefined> = process.env
) {
  const parsed = environmentSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    apiUrl:
      parsed.PUBLIC_API_URL ??
      parsed.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000"
  };
}
