#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { FunesVaultApiClient, type FunesVaultMcpConfig } from "./api-client.js";
import { createFunesVaultMcpServer } from "./server.js";
export async function runStdioServer(config: FunesVaultMcpConfig = {}) {
  const server = createFunesVaultMcpServer(new FunesVaultApiClient(config), {
    appUrl: config.appUrl
  });
  await server.connect(new StdioServerTransport());
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runStdioServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
