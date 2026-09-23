import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";

import { hashToken as digestToken } from "@funes-vault/shared/tokens";
const maxBodyBytes = 1024 * 1024;
export function readBearerToken(req: IncomingMessage) {
  const header = readHeader(req, "authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim() || null;
}

export function readHeader(
  req: Pick<IncomingMessage, "headers">,
  name: string
) {
  const value = req.headers[name];

  return Array.isArray(value) ? value[0] : value;
}

export function hashToken(token: string) {
  return digestToken(token, "hex");
}

export function isAllowedOrigin(
  req: IncomingMessage,
  allowedOrigins: string[]
) {
  const origin = readHeader(req, "origin");

  // Non-browser MCP clients send no Origin header. Any browser Origin must be
  // explicitly allowlisted, which blocks DNS-rebinding pages by default.
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function isAllowedHost(req: IncomingMessage, allowedHosts: string[]) {
  if (allowedHosts.length === 0) {
    return true;
  }

  const host = readHeader(req, "host")?.toLowerCase();

  if (!host) {
    return false;
  }

  const hostname = host.replace(/:\d+$/, "");

  return allowedHosts.some((allowed) => {
    const normalized = allowed.toLowerCase();

    return normalized === host || normalized === hostname;
  });
}

export const invalidBody = Symbol("invalidBody");
export const oversizedBody = Symbol("oversizedBody");

export async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const rawChunk of req.iterator({ destroyOnReturn: false })) {
    const chunk: unknown = rawChunk;
    if (!(chunk instanceof Uint8Array) && typeof chunk !== "string") {
      return invalidBody;
    }
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > maxBodyBytes) {
      req.resume();

      return oversizedBody;
    }

    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return invalidBody;
  }
}

export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  code = -32000
) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null
    })
  );
}

export function parseList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parsePositiveInt(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Trust forwarded addresses only from explicitly configured immediate proxy peers. */
export function clientAddress(
  req: Pick<IncomingMessage, "headers"> & {
    socket: { remoteAddress?: string };
  },
  trustedProxies: string[]
) {
  const peer = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "unknown";
  if (!trustedProxies.includes(peer)) {
    return peer;
  }
  // Use the nearest forwarded hop: Caddy appends/overwrites this from its socket peer.
  const forwarded = readHeader(req, "x-forwarded-for")
    ?.split(",")
    .at(-1)
    ?.trim();

  return forwarded && isIP(forwarded) ? forwarded : peer;
}
