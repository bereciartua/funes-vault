import { serverEnv } from "../server-env";
/** PUBLIC_API_URL is the runtime alias of the build-time NEXT_PUBLIC_API_URL. */
export function resolveApiUrl(env: Record<string, string | undefined>): string {
  return serverEnv(env).apiUrl;
}
