import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { mcpJsonConfigFor } from "../../../lib/mcp-config";
import { renderToStaticMarkup } from "../../../test/render";
import {
  claudeCodeCommandFor,
  ConnectAgentGuideView,
  connectorAddressFromMetadata,
  isPrivateConnectorAddress,
  mcpAddressFor
} from "./ConnectAgentGuide";

describe("connectorAddressFromMetadata", () => {
  it("reads the resource URL from protected resource metadata", () => {
    expect(
      connectorAddressFromMetadata({
        resource: "https://connect.example.com/mcp",
        authorization_servers: ["https://connect.example.com/"]
      })
    ).toBe("https://connect.example.com/mcp");
  });

  it("rejects missing or malformed metadata", () => {
    expect(connectorAddressFromMetadata(null)).toBeNull();
    expect(connectorAddressFromMetadata({})).toBeNull();
    expect(connectorAddressFromMetadata({ resource: 42 })).toBeNull();
    expect(connectorAddressFromMetadata({ resource: "not a url" })).toBeNull();
  });
});

describe("isPrivateConnectorAddress", () => {
  it("treats localhost and plain http as private", () => {
    expect(isPrivateConnectorAddress("http://localhost:4000/mcp")).toBe(true);
    expect(isPrivateConnectorAddress("https://127.0.0.1/mcp")).toBe(true);
    expect(isPrivateConnectorAddress("http://vault.example.com/mcp")).toBe(
      true
    );
  });

  it("treats public https addresses as connector-ready", () => {
    expect(isPrivateConnectorAddress("https://connect.example.com/mcp")).toBe(
      false
    );
  });
});

describe("mcpAddressFor", () => {
  it("reuses a public connector address for local tools", () => {
    expect(
      mcpAddressFor(
        "https://vault-api.example.com",
        "https://connect.example.com/mcp"
      )
    ).toBe("https://connect.example.com/mcp");
  });

  it("derives the sidecar address from the API origin otherwise", () => {
    expect(mcpAddressFor("http://192.168.1.50:4000", null)).toBe(
      "http://192.168.1.50:4100/mcp"
    );
    expect(
      mcpAddressFor("http://localhost:4000", "http://localhost:4000/mcp")
    ).toBe("http://localhost:4100/mcp");
  });

  it("falls back to a placeholder for unparsable API URLs", () => {
    expect(mcpAddressFor("not a url", null)).toBe(
      "http://your-vault-host:4100/mcp"
    );
  });
});

describe("ConnectAgentGuideView", () => {
  function render(connectorAddress: string | null) {
    return renderToStaticMarkup(
      createElement(ConnectAgentGuideView, {
        connectorAddress,
        mcpAddress: mcpAddressFor("http://localhost:4000", connectorAddress)
      })
    );
  }

  it("shows the copyable connector address when the vault is published", () => {
    const html = render("https://connect.example.com/mcp");

    expect(html).toContain("Your connector address");
    expect(html).toContain("https://connect.example.com/mcp");
    expect(html).toContain("Add custom connector");
    expect(html).not.toContain("not published for assistant apps");
  });

  it("explains when the vault is not publicly reachable for connectors", () => {
    const html = render("http://localhost:4000/mcp");

    expect(html).toContain("not published for assistant apps");
    expect(html).not.toContain("Your connector address");
  });

  it("includes copyable tool setup commands with the MCP address", () => {
    const command = claudeCodeCommandFor("http://localhost:4100/mcp");
    const config = mcpJsonConfigFor("http://localhost:4100/mcp");
    const html = render(null);

    expect(command).toContain("claude mcp add --transport http funes-vault");
    expect(config).toContain('"url": "http://localhost:4100/mcp"');
    expect(html).toContain("Claude Code command");
    expect(html).toContain("shown only once");
  });
});
