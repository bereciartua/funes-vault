import type { ZodType } from "zod";

export type ApiErrorKind = "unreachable" | "http" | "invalid-response";

export class ApiError extends Error {
  readonly body: unknown;
  readonly kind: ApiErrorKind;
  readonly path: string;
  readonly status: number | null;

  constructor(input: {
    body?: unknown;
    cause?: unknown;
    kind: ApiErrorKind;
    message: string;
    path: string;
    status?: number | null;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "ApiError";
    this.body = input.body;
    this.kind = input.kind;
    this.path = input.path;
    this.status = input.status ?? null;
  }
}

type ApiFetchInput<T> = {
  apiUrl: string;
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  schema: ZodType<T>;
  signal?: AbortSignal;
};

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  if (
    typeof error.body === "object" &&
    error.body !== null &&
    "message" in error.body &&
    typeof error.body.message === "string"
  ) {
    return error.body.message;
  }

  return fallback;
}

function apiUrlFor(apiUrl: string, path: string) {
  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;

  return new URL(path.replace(/^\//, ""), base).toString();
}

function notifySessionExpired(path: string, status: number) {
  if (
    status !== 401 ||
    path.startsWith("/auth/") ||
    typeof window === "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("funes-vault:session-expired", { detail: { path } })
  );
}

function logApiFailure(error: ApiError) {
  console.error("Funes Vault API request failed", {
    kind: error.kind,
    path: error.path,
    status: error.status,
    cause: error.cause
  });
}

async function parseErrorBody(response: Response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

export async function apiFetch<T>({
  apiUrl,
  body,
  method = "GET",
  path,
  schema,
  signal
}: ApiFetchInput<T>): Promise<T> {
  let response: Response;

  try {
    response = await fetch(apiUrlFor(apiUrl, path), {
      method,
      credentials: "include",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    const apiError = new ApiError({
      cause: error,
      kind: "unreachable",
      message: "The vault API is unreachable.",
      path
    });
    logApiFailure(apiError);
    throw apiError;
  }

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    notifySessionExpired(path, response.status);
    const apiError = new ApiError({
      body: errorBody,
      kind: "http",
      message: `The vault API returned HTTP ${response.status}.`,
      path,
      status: response.status
    });
    if (!(response.status === 401 && path === "/auth/me")) {
      logApiFailure(apiError);
    }
    throw apiError;
  }

  const raw: unknown = await response.json();
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const apiError = new ApiError({
      cause: parsed.error,
      kind: "invalid-response",
      message: "The vault API returned an unexpected response.",
      path,
      status: response.status
    });
    logApiFailure(apiError);
    throw apiError;
  }

  return parsed.data;
}
