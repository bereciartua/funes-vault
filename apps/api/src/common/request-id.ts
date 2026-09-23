import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

/** @internal */
const requestIdHeader = "x-request-id";

const inboundRequestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

type RequestWithId = Request & { requestId?: string };

export function getRequestId(request: unknown): string | undefined {
  return typeof request === "object" && request !== null
    ? (request as RequestWithId).requestId
    : undefined;
}

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
) {
  const inbound = request.headers[requestIdHeader];
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
  const requestId =
    candidate && inboundRequestIdPattern.test(candidate)
      ? candidate
      : randomUUID();

  (request as RequestWithId).requestId = requestId;
  response.setHeader(requestIdHeader, requestId);
  next();
}
