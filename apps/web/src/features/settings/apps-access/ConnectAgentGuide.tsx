import { useState } from "react";
import { z } from "zod";

import { Button } from "../../../components/ui/button";
import {
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger
} from "../../../components/ui/tabs";
import { useApiUrl } from "../../../lib/api/api-context";
import { useApiQuery } from "../../../lib/api/use-api";
import { mcpJsonConfigFor } from "../../../lib/mcp-config";

// The API advertises the public MCP address in its RFC 9728 protected
// resource metadata; that document is the source of truth for the address
// assistant apps need, so the guide shows real deployment values instead of
// placeholders whenever it can.
export function connectorAddressFromMetadata(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("resource" in value)) {
    return null;
  }

  const resource = value.resource;

  if (typeof resource !== "string") {
    return null;
  }

  try {
    return new URL(resource).href;
  } catch {
    return null;
  }
}

// Assistant apps (Claude, ChatGPT) can only reach public HTTPS addresses.
// A localhost or plain-http address means the vault has not been published
// for connectors yet, so the guide should say so instead of letting the
// user paste an address that cannot work.
export function isPrivateConnectorAddress(address: string): boolean {
  let url: URL;

  try {
    url = new URL(address);
  } catch {
    return true;
  }

  return (
    url.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

// Local MCP tools can use the public connector address when one exists;
// otherwise the MCP service listens next to the API on port 4100.
export function mcpAddressFor(
  apiUrl: string,
  connectorAddress: string | null
): string {
  if (connectorAddress && !isPrivateConnectorAddress(connectorAddress)) {
    return connectorAddress;
  }

  try {
    const api = new URL(apiUrl);

    return `${api.protocol}//${api.hostname}:4100/mcp`;
  } catch {
    return "http://your-vault-host:4100/mcp";
  }
}

export function claudeCodeCommandFor(mcpAddress: string) {
  return [
    "claude mcp add --transport http funes-vault",
    mcpAddress,
    '--header "Authorization: Bearer PASTE_YOUR_APP_TOKEN"'
  ].join(" ");
}

// navigator.clipboard only exists in secure contexts; plain-http LAN
// deployments (see the Portainer path in the deployment guide) need the
// legacy selection fallback.
async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);

    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!(await copyText(value))) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="token-box">
      <div className="token-box-heading">
        <strong>{label}</strong>
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <code>{value}</code>
    </div>
  );
}

type ConnectAgentGuideViewProps = {
  connectorAddress: string | null;
  defaultOpen?: boolean;
  mcpAddress: string;
};

export function ConnectAgentGuideView({
  connectorAddress,
  defaultOpen = false,
  mcpAddress
}: ConnectAgentGuideViewProps) {
  const connectorIsPrivate =
    connectorAddress !== null && isPrivateConnectorAddress(connectorAddress);

  return (
    <details className="connect-guide" open={defaultOpen || undefined}>
      <summary>How do I connect Claude, ChatGPT, or a coding agent?</summary>
      <p className="muted">
        A connected app never browses your vault. It asks for memories for a
        declared purpose and receives only what its policy allows, anything it
        wants to remember follows its saving policy, and every disclosure is
        recorded in the audit log. You can cut any app off from the list below
        at any moment.
      </p>
      <TabsRoot defaultValue="assistants">
        <TabsList
          className="connect-guide-tabs"
          aria-label="Ways to connect an app"
        >
          <TabsTrigger value="assistants" variant="settings">
            Claude &amp; ChatGPT apps
          </TabsTrigger>
          <TabsTrigger value="tools" variant="settings">
            Coding agents &amp; MCP tools
          </TabsTrigger>
        </TabsList>

        {/* forceMount keeps both panels in the DOM (Radix hides the inactive
            one), so the guide is fully server-renderable and searchable. */}
        <TabsContent
          forceMount
          value="assistants"
          className="connect-guide-tab"
        >
          <p>
            Assistant apps connect through a secure sign-in, the same way you
            would connect a calendar or email account — no tokens to copy. This
            works from a phone too.
          </p>
          {connectorAddress && !connectorIsPrivate ? (
            <CopyBlock
              label="Your connector address"
              value={connectorAddress}
            />
          ) : null}
          {connectorIsPrivate ? (
            <p className="risk-note" data-tone="risk">
              This vault is not published for assistant apps yet — it currently
              advertises {connectorAddress}, which only works on this machine or
              network. Whoever runs the vault needs to set up connector exposure
              first (see &quot;Public MCP Connector Exposure&quot; in the
              deployment guide).
            </p>
          ) : null}
          {connectorAddress === null ? (
            <p className="muted">
              Could not read this vault&apos;s connector address right now. It
              is normally <code>https://your-vault-host/mcp</code>.
            </p>
          ) : null}
          <ol className="connect-guide-steps">
            <li>
              In the assistant app, find the connectors setting. In Claude:
              Settings → Connectors → <strong>Add custom connector</strong>,
              then paste the connector address above.
            </li>
            <li>
              The app opens your vault&apos;s approval page. Sign in with your
              Funes Vault account if asked.
            </li>
            <li>
              Review what the app is requesting and choose{" "}
              <strong>Approve</strong>. Connectors can only ever request two
              things: reading policy-filtered memories and suggesting new ones
              for your review.
            </li>
            <li>
              Done. The app appears in the list below with an{" "}
              <strong>OAuth connector</strong> badge, and you can tighten its
              policy there whenever you like.
            </li>
          </ol>
          <p className="muted">
            To disconnect an assistant, delete its entry below or set its trust
            to blocked — its access ends immediately, and the cutoff is audited.
          </p>
        </TabsContent>

        <TabsContent forceMount value="tools" className="connect-guide-tab">
          <p>
            For MCP-compatible tools you run yourself — Claude Code, IDE agents,
            scripts. These use an app token instead of a sign-in.
          </p>
          <ol className="connect-guide-steps">
            <li>
              Create an entry for the tool here: <strong>New</strong>, give it a
              recognizable name, and save. Copy the token — it is shown only
              once.
            </li>
            <li>
              Give it a policy: which operations it may use (read, suggest), up
              to which sensitivity, and which categories. Without a policy the
              tool gets nothing.
            </li>
            <li>
              Point the tool at your vault&apos;s MCP address with the token.
              For Claude Code, run the command below.
            </li>
          </ol>
          <CopyBlock label="MCP address" value={mcpAddress} />
          <CopyBlock
            label="Claude Code command"
            value={claudeCodeCommandFor(mcpAddress)}
          />
          <CopyBlock
            label="Config for other MCP apps"
            value={mcpJsonConfigFor(mcpAddress)}
          />
          <p className="muted">
            Treat the token like a password. If it leaks, open the app below and
            rotate the token; the old one stops working immediately.
          </p>
        </TabsContent>
      </TabsRoot>
    </details>
  );
}

export function ConnectAgentGuide({
  defaultOpen = false
}: {
  defaultOpen?: boolean;
}) {
  const apiUrl = useApiUrl();
  const metadata = useApiQuery({
    key: ["connector-metadata"],
    path: "/.well-known/oauth-protected-resource",
    schema: z.object({ resource: z.url() })
  });
  const connectorAddress = metadata.data?.resource ?? null;

  return (
    <ConnectAgentGuideView
      connectorAddress={connectorAddress}
      defaultOpen={defaultOpen}
      mcpAddress={mcpAddressFor(apiUrl, connectorAddress)}
    />
  );
}
