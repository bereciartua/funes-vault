import { AuditActorType } from "@funes-vault/db";
import {
  type AuthResponse,
  type DeleteAccountRequest,
  type UpdateProfileRequest
} from "@funes-vault/shared";
import { demoAccountEmail } from "@funes-vault/shared/domain";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";

import { isPrismaError } from "../common/prisma-errors.js";
import { apiEnv } from "../config.js";
import { FirstPartyAccessService } from "../first-party-access/first-party-access.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  deletionVerificationWindowMs,
  sessionDurationMs
} from "./auth.constants.js";
import type { GoogleClaims } from "./google.provider.js";
import { createSessionToken, hashSessionToken } from "./session.js";

export function toAuthResponse(user: {
  id: string;
  email: string;
  displayName: string | null;
  role: "USER" | "ADMIN" | "OWNER";
}): AuthResponse {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    }
  };
}

/**
 * Manages public profiles, logout, the development fixture and identity-confirmed deletion.
 * Calls are scoped to the session owner; deleting an account also removes its owned records.
 * First-party grant provisioning delegates client and policy audit writes to FirstPartyAccessService.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firstPartyAccess: FirstPartyAccessService
  ) {}

  async signInWithGoogle(identity: GoogleClaims) {
    const user = await this.prisma.client
      .$transaction(async (tx) => {
        const existing = await tx.googleIdentity.findUnique({
          where: { subject: identity.subject },
          include: { user: true }
        });
        if (existing) {
          return existing.user;
        }
        // Never attach an identity to an existing vault based on matching email.
        if (await tx.user.findUnique({ where: { email: identity.email } })) {
          throw new ConflictException(
            "This email belongs to another identity."
          );
        }
        const created = await tx.user.create({
          data: {
            email: identity.email,
            displayName: identity.displayName,
            googleIdentity: { create: { subject: identity.subject } }
          }
        });
        await this.firstPartyAccess.ensureWebChatAccess(created.id, {
          actorType: AuditActorType.USER,
          actorId: created.id,
          tx
        });

        return created;
      })
      .catch(async (error: unknown) => {
        // Two browsers may complete a first sign-in at once. The winning
        // transaction owns provisioning; reuse only its exact Google subject.
        if (
          error instanceof ConflictException ||
          isPrismaError(error, "P2002")
        ) {
          const concurrent = await this.prisma.client.googleIdentity.findUnique(
            {
              where: { subject: identity.subject },
              include: { user: true }
            }
          );
          if (concurrent) {
            return concurrent.user;
          }
        }
        throw error;
      });

    return this.createSession(user);
  }

  loginOptions() {
    return { demoLoginEnabled: apiEnv().NODE_ENV === "development" };
  }

  async signInWithDemo() {
    if (!this.loginOptions().demoLoginEnabled) {
      throw new NotFoundException();
    }
    const user = await this.prisma.client.user.findUnique({
      where: { email: demoAccountEmail },
      include: { googleIdentity: true }
    });
    if (!user) {
      throw new NotFoundException(
        "Demo account is missing. Run pnpm db:seed in your local development database."
      );
    }
    if (user.googleIdentity || user.role !== "USER") {
      throw new ForbiddenException(
        "Demo login is only available for the unlinked demo fixture account."
      );
    }
    await this.firstPartyAccess.ensureWebChatAccess(user.id, {
      actorType: AuditActorType.USER,
      actorId: user.id
    });

    return this.createSession(user);
  }

  private async createSession(user: Parameters<typeof toAuthResponse>[0]) {
    await this.prisma.client.session.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    const token = createSessionToken();
    await this.prisma.client.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + sessionDurationMs)
      }
    });

    return { ...toAuthResponse(user), token };
  }

  async verifyDeletion(sessionId: string, identity: GoogleClaims) {
    const session = await this.prisma.client.session.findUnique({
      where: { id: sessionId },
      include: { user: { include: { googleIdentity: true } } }
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      session.user.googleIdentity?.subject !== identity.subject
    ) {
      throw new UnauthorizedException(
        "Sign in with the Google account associated with this vault."
      );
    }
    await this.prisma.client.session.update({
      where: { id: session.id },
      data: { deletionVerifiedAt: new Date() }
    });
  }

  async getCurrentUser(userId: string) {
    return toAuthResponse(
      await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } })
    );
  }

  async updateProfile(userId: string, input: UpdateProfileRequest) {
    return toAuthResponse(
      await this.prisma.client.user.update({
        where: { id: userId },
        data: { displayName: input.displayName }
      })
    );
  }

  async deleteAccount(
    userId: string,
    sessionId: string | undefined,
    input: DeleteAccountRequest
  ) {
    void input; // Validated at the HTTP boundary.
    const session = sessionId
      ? await this.prisma.client.session.findUnique({
          where: { id: sessionId }
        })
      : null;
    if (
      !session ||
      session.userId !== userId ||
      session.expiresAt <= new Date() ||
      !session.deletionVerifiedAt ||
      session.deletionVerifiedAt.getTime() <
        Date.now() - deletionVerificationWindowMs
    ) {
      throw new ForbiddenException(
        "Verify your Google account before deleting your vault."
      );
    }
    await this.prisma.client.user.delete({ where: { id: userId } });

    return { ok: true as const };
  }

  async logout(sessionId: string | undefined) {
    if (sessionId) {
      await this.prisma.client.session.deleteMany({ where: { id: sessionId } });
    }
  }
}
