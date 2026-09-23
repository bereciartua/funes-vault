import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";

import type { FunesRequest } from "../auth/auth.types.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ClientAuthGuard } from "../clients/client-auth.guard.js";

// Quick capture is reachable from two directions: the PWA (session cookie)
// and OS shortcuts (registered client bearer token). A bearer header selects
// client auth; otherwise the session cookie is required.
/** Selects bearer or browser authentication and checks the queued capture owner against the current browser session before accepting a write. */
@Injectable()
export class CaptureAuthGuard implements CanActivate {
  constructor(
    private readonly clientAuth: ClientAuthGuard,
    private readonly sessionAuth: SessionAuthGuard
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FunesRequest>();

    if (request.headers.authorization) {
      return this.clientAuth.canActivate(context);
    }

    const authenticated = await this.sessionAuth.canActivate(context);
    const expectedOwner = request.headers["x-funes-owner-id"];
    if (expectedOwner && expectedOwner !== request.user?.id) {
      throw new ForbiddenException(
        "Capture belongs to another signed-in account"
      );
    }

    return authenticated;
  }
}

export function captureActor(request: FunesRequest) {
  if (request.client && request.clientUserId) {
    return {
      userId: request.clientUserId,
      clientId: request.client.id
    };
  }

  if (request.user) {
    return {
      userId: request.user.id,
      clientId: null
    };
  }

  throw new Error("Capture request is missing an authenticated actor");
}
