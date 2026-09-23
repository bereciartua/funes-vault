import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  // Vitest's experimental OXC transform does not yet cover our JSX test transform.
  oxc: false,
  test: {
    // Cap jsdom processes so browser and API checks can run together on CI runners.
    maxWorkers: 4,
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 61,
        branches: 56,
        functions: 58,
        lines: 62,
        "src/features/chat/**": {
          statements: 61,
          branches: 56,
          functions: 58,
          lines: 62
        },
        "src/features/memories/**": {
          statements: 61,
          branches: 56,
          functions: 58,
          lines: 62
        },
        "src/lib/api/{api-context,use-api,query-keys}.{ts,tsx}": {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90
        },
        "src/shell/use-session.ts": {
          statements: 85,
          branches: 75,
          functions: 75,
          lines: 85
        },
        "src/features/settings/requests/{DisclosureReviews,use-disclosure-reviews}.{ts,tsx}":
          { statements: 85, branches: 80, functions: 80, lines: 85 }
      },
      reporter: ["text", "json-summary", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/test/**"]
    },
    projects: [
      {
        extends: true,
        test: {
          name: "pure",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/features/pwa/theme-preference.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: [
            "src/**/*.test.tsx",
            "src/features/pwa/theme-preference.test.ts"
          ]
        }
      }
    ]
  }
});
