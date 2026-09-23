import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import type { Params } from "nestjs-pino";

import { getRequestId } from "./common/request-id.js";
import { apiEnv } from "./config.js";

// Select the most verbose requested Nest log level for the structured logger.
function pinoLevel() {
  const levels = apiEnv()
    .LOG_LEVELS?.split(",")
    .map((level) => level.trim());

  if (!levels || levels.length === 0) {
    return "info";
  }

  if (levels.includes("verbose")) {
    return "trace";
  }

  if (levels.includes("debug")) {
    return "debug";
  }

  if (levels.includes("log")) {
    return "info";
  }

  if (levels.includes("warn")) {
    return "warn";
  }

  return levels.includes("error") ? "error" : "info";
}

const prettyTransport = {
  target: "pino-pretty",
  options: {
    colorize: true,
    colorizeObjects: false,
    ignore: "pid,hostname,service,req,res,responseTime",
    messageFormat:
      "{msg}{if req.method} {req.method} {req.url}{end}{if res.statusCode} -> {res.statusCode}{end}{if responseTime} ({responseTime}ms){end}{if req.id} req={req.id}{end}",
    singleLine: true,
    translateTime: "SYS:HH:MM:ss.l"
  }
} as const;

// One structured access-log line per request with latency, status, and the
// request id assigned by requestIdMiddleware. Bodies are never logged (they
// can contain memory content); credential headers are redacted.
export function createLoggerOptions(): Params {
  return {
    pinoHttp: {
      level: pinoLevel(),
      base: { service: "funes-vault-api" },
      genReqId: (request: IncomingMessage) =>
        getRequestId(request) ?? randomUUID(),
      serializers: {
        req: (req: { url?: string; [key: string]: unknown }) => ({
          ...req,
          url: req.url?.split("?")[0]
        })
      },
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers.referer",
          "req.query",
          "res.headers.location",
          'res.headers["set-cookie"]'
        ],
        censor: "[redacted]"
      },
      autoLogging: {
        ignore: (request) => request.url === "/health"
      },
      transport: apiEnv().LOG_FORMAT === "json" ? undefined : prettyTransport
    }
  };
}
