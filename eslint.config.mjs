import globals from "globals";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// The API gets type-aware linting (async-heavy NestJS code where an
// un-awaited promise is the classic silent bug). Other workspaces keep the
// faster syntax-only recommended set until they opt in.
const apiTypeCheckedConfigs = [
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        { ignoreVoid: true }
      ],
      "@typescript-eslint/no-misused-promises": "error"
    }
  }
].map((config) => ({
  ...config,
  files: [
    "apps/api/src/**/*.ts",
    "apps/api/test/**/*.ts",
    "packages/*/src/**/*.ts"
  ]
}));

// Specs build partial mocks with `as never` casts; the unsafe-* family
// flags every touch of those. The promise-safety rules stay on.
const apiSpecRelaxations = {
  files: ["apps/api/src/**/*.spec.ts", "apps/api/test/**/*.ts"],
  rules: {
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/require-await": "off"
  }
};

export default [
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/dist-e2e/**",
      "**/node_modules/**",
      "packages/db/src/generated/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      curly: ["error", "all"],
      "lines-between-class-members": [
        "error",
        "always",
        { exceptAfterSingleLine: true }
      ],
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "return" }
      ],
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error"
    }
  },
  ...tseslint.configs.recommended,
  ...apiTypeCheckedConfigs,
  apiSpecRelaxations,
  {
    files: ["apps/api/src/**/*.ts"],
    ignores: ["apps/api/src/audit-trail/**", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-enum-comparison": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(create|createMany|createManyAndReturn|upsert)$/][callee.object.property.name='auditEvent']",
          message:
            "Write audit events through AuditTrailService so subjects are recorded."
        }
      ]
    }
  },
  {
    files: ["packages/*/src/**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["packages/*/tsconfig.test.json"]
      }
    },
    rules: apiSpecRelaxations.rules
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooksPlugin
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "jsx-a11y": jsxA11yPlugin
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...jsxA11yPlugin.configs.recommended.rules,
      "@next/next/no-html-link-for-pages": "off",
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: ["CheckboxField", "SelectField", "SwitchField"]
        }
      ]
    }
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  }
];
