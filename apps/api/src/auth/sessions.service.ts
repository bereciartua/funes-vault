import { type AuthUser, authUserSchema } from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { sessionCookieName } from "./auth.constants.js";
import { readCookie } from "./cookies.js";
import { hashSessionToken } from "./session.js";

/**
 * Resolves an unexpired opaque session token to its owner and a validated public profile.
 * Credential hashes stay inside the session boundary. This service is read-only.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSessionFromCookieHeader(header: string | undefined) {
    const token = readCookie(header, sessionCookieName);
    if (!token) {
      return null;
    }
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true }
    });
    if (!session || session.expiresAt <= new Date()) {
      return null;
    }

    return {
      user: authUserSchema.parse(session.user),
      sessionId: session.id,
      token
    };
  }

  async resolveFromCookieHeader(
    header: string | undefined
  ): Promise<AuthUser | null> {
    return (await this.resolveSessionFromCookieHeader(header))?.user ?? null;
  }
}
