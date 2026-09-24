import { clientSchema } from "@funes-vault/shared";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { FunesRequest } from "../auth/auth.types.js";
import { OAuthTokensService } from "../oauth/oauth-tokens.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requiredClientScopeKey } from "./client-scope.decorator.js";
import { hashToken } from "./client-token.js";
import { toClientResponse } from "./clients.service.js";

/** Authenticates client bearer tokens and attaches their owner to the request. Enforces token scopes; domain services enforce app permissions. */
@Injectable()
export class ClientAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauthTokens: OAuthTokensService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FunesRequest>();
    const token = this.readBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("Missing client token");
    }

    const client = await this.prisma.client.client.findFirst({
      where: { tokenHash: hashToken(token) }
    });

    if (client) {
      request.clientTokenType = "static";
    } else {
      // Not a static client token: try OAuth access tokens issued to MCP
      // connectors, which resolve to the same per-user client grant.
      const verified = await this.oauthTokens.verifyAccessToken(token);

      if (!verified) {
        throw new UnauthorizedException("Invalid client token");
      }

      request.clientTokenType = "oauth";
      request.oauthScopes = verified.token.scopes;
      this.assertScopeAllowed(context, verified.token.scopes);

      await this.attachClient(request, verified.client.id);

      return true;
    }

    await this.attachClient(request, client.id);

    return true;
  }

  private async attachClient(request: FunesRequest, clientId: string) {
    const client = await this.prisma.client.client.update({
      where: { id: clientId },
      data: { lastUsedAt: new Date() },
      include: { _count: { select: { policies: true } } }
    });

    request.client = clientSchema.parse(toClientResponse(client));
    request.clientUserId = client.userId;
  }

  private assertScopeAllowed(context: ExecutionContext, scopes: string[]) {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      requiredClientScopeKey,
      [context.getHandler(), context.getClass()]
    );

    if (required && !scopes.includes(required)) {
      throw new ForbiddenException(
        `Token is missing the required scope: ${required}`
      );
    }
  }

  private readBearerToken(header: string | undefined) {
    if (!header?.startsWith("Bearer ")) {
      return null;
    }

    return header.slice("Bearer ".length).trim() || null;
  }
}
