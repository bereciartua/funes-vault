import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import manifest from "../../app/manifest";
import { shouldRegisterServiceWorker } from "./PwaRegister";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

type ServiceWorkerExports = {
  shouldCacheUrl: (url: string, origin: string) => boolean;
  matchNavigationFallback: (
    cache: {
      match: (request: Request | string) => Promise<Response | undefined>;
    },
    request: Request
  ) => Promise<Response | undefined>;
  APP_SHELL_PATHS: string[];
  SHELL_CACHE: string;
};

function loadServiceWorker(): ServiceWorkerExports {
  const source = readFileSync(join(webRoot, "public", "sw.js"), "utf8");
  const listeners: Record<string, unknown> = {};
  const self = {
    location: {
      origin: "https://vault.example.com",
      href: "https://vault.example.com/sw.js?v=test-build"
    },
    addEventListener: (type: string, handler: unknown) => {
      listeners[type] = handler;
    },
    skipWaiting: () => undefined,
    clients: { claim: () => undefined }
  };
  const factory = new Function(
    "self",
    `${source}\nreturn { shouldCacheUrl, matchNavigationFallback, APP_SHELL_PATHS, SHELL_CACHE };`
  );

  const exports = factory(self) as ServiceWorkerExports;
  expect(listeners).toHaveProperty("install");
  expect(listeners).toHaveProperty("activate");
  expect(listeners).toHaveProperty("fetch");

  return exports;
}

describe("web app manifest", () => {
  it("declares an installable standalone app with icons", () => {
    const parsed = manifest();

    expect(parsed.name).toBe("Funes Vault");
    expect(parsed.display).toBe("standalone");
    expect(parsed.start_url).toBe("/");
    expect(parsed.theme_color).toBe("#0f766e");

    const sizes = (parsed.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(
      (parsed.icons ?? []).some((icon) => icon.purpose === "maskable")
    ).toBe(true);
  });
});

describe("service worker registration", () => {
  it("registers only in secure production builds", () => {
    expect(
      shouldRegisterServiceWorker({
        hasServiceWorker: true,
        isSecureContext: true,
        nodeEnv: "production"
      })
    ).toBe(true);
    expect(
      shouldRegisterServiceWorker({
        hasServiceWorker: true,
        isSecureContext: true,
        nodeEnv: "development"
      })
    ).toBe(false);
    expect(
      shouldRegisterServiceWorker({
        hasServiceWorker: true,
        isSecureContext: false,
        nodeEnv: "production"
      })
    ).toBe(false);
    expect(
      shouldRegisterServiceWorker({
        hasServiceWorker: false,
        isSecureContext: true,
        nodeEnv: "production"
      })
    ).toBe(false);
  });
});

describe("service worker caching boundaries", () => {
  const origin = "https://vault.example.com";

  it("caches only same-origin app-shell resources", () => {
    const { shouldCacheUrl, APP_SHELL_PATHS, SHELL_CACHE } =
      loadServiceWorker();

    expect(SHELL_CACHE).toBe("funes-shell-test-build");
    expect(APP_SHELL_PATHS).toContain("/");
    expect(APP_SHELL_PATHS).toContain("/overview");
    expect(APP_SHELL_PATHS).toContain("/vault");
    expect(APP_SHELL_PATHS).toContain("/chat");
    expect(APP_SHELL_PATHS).toContain("/inbox");
    expect(APP_SHELL_PATHS).toContain("/settings/profile");
    expect(shouldCacheUrl(`${origin}/`, origin)).toBe(true);
    expect(shouldCacheUrl(`${origin}/vault`, origin)).toBe(true);
    expect(shouldCacheUrl(`${origin}/chat`, origin)).toBe(true);
    expect(shouldCacheUrl(`${origin}/settings/profile`, origin)).toBe(true);
    expect(shouldCacheUrl(`${origin}/manifest.webmanifest`, origin)).toBe(true);
    expect(shouldCacheUrl(`${origin}/_next/static/chunks/app.js`, origin)).toBe(
      true
    );
    expect(shouldCacheUrl(`${origin}/icons/icon-192.png`, origin)).toBe(true);
  });

  it("never caches API responses, memory content, or suggestion content", () => {
    const { shouldCacheUrl, APP_SHELL_PATHS } = loadServiceWorker();

    // The API is a different origin, so nothing from it is cacheable.
    const apiOrigin = "https://vault-api.example.com";
    expect(shouldCacheUrl(`${apiOrigin}/v1/memories`, origin)).toBe(false);
    expect(shouldCacheUrl(`${apiOrigin}/v1/memory-suggestions`, origin)).toBe(
      false
    );
    expect(shouldCacheUrl(`${apiOrigin}/v1/chat/session`, origin)).toBe(false);
    expect(shouldCacheUrl(`${apiOrigin}/auth/me`, origin)).toBe(false);

    // Same-origin routes outside the app-shell allowlist stay uncached too.
    expect(shouldCacheUrl(`${origin}/api/health`, origin)).toBe(false);
    expect(shouldCacheUrl(`${origin}/v1/memories`, origin)).toBe(false);
    expect(shouldCacheUrl(`${origin}/?surface=vault&memoryId=m1`, origin)).toBe(
      false
    );
    expect(shouldCacheUrl(`${origin}/vault?memoryId=m1`, origin)).toBe(false);

    // The precache list itself contains no API or content paths.
    expect(
      APP_SHELL_PATHS.every(
        (path) =>
          !path.startsWith("/v1") &&
          !path.startsWith("/auth") &&
          !path.startsWith("/api")
      )
    ).toBe(true);
  });

  it("falls back to the exact navigation shell before the root shell", async () => {
    const { matchNavigationFallback } = loadServiceWorker();
    const vaultResponse = new Response("<html>vault shell</html>");
    const rootResponse = new Response("<html>root shell</html>");
    const request = new Request(`${origin}/vault`);
    const cache = {
      match: vi.fn(async (key: Request | string) => {
        if (key instanceof Request && key.url === request.url) {
          return vaultResponse;
        }

        if (key === "/") {
          return rootResponse;
        }

        return undefined;
      })
    };

    await expect(matchNavigationFallback(cache, request)).resolves.toBe(
      vaultResponse
    );
    expect(cache.match).toHaveBeenCalledTimes(1);
  });

  it("uses the root shell when the requested navigation was not cached", async () => {
    const { matchNavigationFallback } = loadServiceWorker();
    const rootResponse = new Response("<html>root shell</html>");
    const request = new Request(`${origin}/chat/thread_1`);
    const cache = {
      match: vi.fn(async (key: Request | string) =>
        key === "/" ? rootResponse : undefined
      )
    };

    await expect(matchNavigationFallback(cache, request)).resolves.toBe(
      rootResponse
    );
    expect(cache.match).toHaveBeenNthCalledWith(1, request);
    expect(cache.match).toHaveBeenNthCalledWith(2, "/");
  });
});
