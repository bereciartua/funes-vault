import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { FunesVaultApiClient, type FunesVaultMcpApi } from "./api-client.js";
import {
  createToolDefinitions,
  type FunesVaultMcpServerOptions
} from "./tools.js";
const { version } = z
  .object({ version: z.string() })
  .parse(
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    )
  );
export function createFunesVaultMcpServer(
  api: FunesVaultMcpApi = new FunesVaultApiClient(),
  options: FunesVaultMcpServerOptions = {}
) {
  const server = new McpServer({ name: "funes-vault", version });
  for (const tool of createToolDefinitions(api, options)) {
    server.registerTool<z.ZodType, z.ZodType>(
      tool.name,
      tool.config,
      tool.handler
    );
  }

  return server;
}
