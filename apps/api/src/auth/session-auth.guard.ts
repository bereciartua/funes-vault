import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import type { FunesRequest } from "./auth.types.js";
import { SessionsService } from "./sessions.service.js";

/** Resolves the opaque browser session and attaches its owner. Resource services remain responsible for owner-scoped database access. */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionsService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FunesRequest>();
    const session = await this.sessions.resolveSessionFromCookieHeader(
      request.headers.cookie
    );
    if (!session) {
      throw new UnauthorizedException(
        request.headers.cookie ? "Invalid session" : "Missing session"
      );
    }

    request.sessionId = session.sessionId;
    request.sessionToken = session.token;
    request.user = session.user;

    return true;
  }
}
