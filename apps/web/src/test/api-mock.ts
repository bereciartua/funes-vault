import { vi } from "vitest";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

type MockRoute = {
  method?: string;
  path: string | RegExp;
  response:
    | unknown
    | ((request: {
        url: URL;
        body: unknown;
        signal?: AbortSignal | null;
      }) => unknown | Promise<unknown>);
  status?: number;
};

/** A strict route table: an unexpected request fails with its method and URL. */
export function installApiMock(routes: MockRoute[]) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const route = routes.find(
        (route) =>
          (route.method ?? "GET") === method &&
          (typeof route.path === "string"
            ? route.path === url.pathname
            : route.path.test(url.pathname + url.search))
      );
      if (!route) {
        throw new Error(
          `Unexpected API request: ${method} ${url.pathname}${url.search}`
        );
      }
      const body: unknown =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const response =
        typeof route.response === "function"
          ? await route.response({ url, body, signal: init?.signal })
          : route.response;

      return response instanceof Response
        ? response
        : jsonResponse(response, route.status);
    }
  );
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}
