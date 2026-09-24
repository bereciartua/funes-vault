#!/usr/bin/env node

import { FunesVaultApiClient } from "../dist/index.js";

const client = new FunesVaultApiClient();

const task =
  process.argv.slice(2).join(" ") ||
  "Help the user work on the Funes Vault repository.";

const response = await client.requestMemory({
  task,
  requestedCategories: (
    process.env.FUNES_VAULT_CATEGORIES ??
    (await client.listMemoryCategories()).items
      .map((category) => category.key)
      .join(",")
  )
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean),
  retention: "NO_STORAGE",
  thirdPartyProcessors: [],
  tokenBudget: Number(process.env.FUNES_VAULT_TOKEN_BUDGET ?? 1200)
});

console.log(JSON.stringify(response, null, 2));
