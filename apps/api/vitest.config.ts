import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 80,
        lines: 80,
        "src/auth/**": {
          statements: 90,
          branches: 85,
          functions: 85,
          lines: 90
        },
        "src/oauth/**": {
          statements: 85,
          branches: 70,
          functions: 90,
          lines: 85
        },
        "src/policies/**": {
          statements: 80,
          branches: 65,
          functions: 80,
          lines: 80
        },
        "src/memory-requests/**": {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90
        },
        "src/audit-trail/**": {
          statements: 80,
          branches: 65,
          functions: 80,
          lines: 80
        }
      },
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.ts",
        "src/**/*.dto.ts",
        "src/**/*.module.ts",
        "src/main.ts",
        "src/worker.ts"
      ],
      reporter: ["text", "json-summary", "lcov", "html"]
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.spec.ts", "test/privacy/**/*.spec.ts"]
        }
      },
      {
        test: {
          name: "e2e",
          testNamePattern: /^(?!.*privacy:)/,
          include: ["test/**/*.e2e.spec.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000
        }
      },
      {
        test: {
          name: "privacy-e2e",
          include: ["test/**/*.e2e.spec.ts"],
          testNamePattern: /privacy:/,
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000
        }
      }
    ]
  }
});
