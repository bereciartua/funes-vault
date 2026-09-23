import { UserRole } from "@funes-vault/db";
import type { NextFunction, Request, Response } from "express";

import type { SessionsService } from "../auth/sessions.service.js";

// The Bull Board dashboard exposes job payloads (user ids, consolidation
// data) and mutation actions, so it sits behind the administrator/owner role check.
export function createQueueDashboardAuthMiddleware(sessions: SessionsService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const user = await sessions.resolveFromCookieHeader(
        request.headers.cookie
      );
      if (!user) {
        response.status(401).json({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid session"
        });

        return;
      }

      if (user.role !== UserRole.ADMIN && user.role !== UserRole.OWNER) {
        response.status(403).json({
          statusCode: 403,
          error: "Forbidden",
          message: "Administrator access required"
        });

        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
