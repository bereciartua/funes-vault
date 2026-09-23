import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import { apiEnv } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthService } from "./auth.service.js";
import { GoogleProvider } from "./google.provider.js";
import { createSessionToken, hashSessionToken } from "./session.js";

export const loginAttemptCookie = "funes_google_flow";
export const loginAttemptTtlMs = 10 * 60_000;

// Only explicit app paths or a well-formed MCP consent continuation are allowed.
export function loginReturnTo(value: unknown) {
  if (value === undefined) {
    return "/vault";
  }
  if (typeof value !== "string") {
    throw new BadRequestException("Invalid return path.");
  }
  const url = new URL(value, "http://local.invalid");
  if (
    url.origin !== "http://local.invalid" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    url.hash
  ) {
    throw new BadRequestException("Invalid return path.");
  }
  if (url.pathname === "/oauth/consent") {
    if (
      !url.searchParams.get("request") ||
      !url.searchParams.get("nonce") ||
      [...url.searchParams.keys()].some(
        (k) => !["request", "nonce"].includes(k)
      )
    ) {
      throw new BadRequestException("Invalid consent path.");
    }
  } else if (
    !/^\/(overview|vault|chat(?:\/[a-zA-Z0-9_-]+)?|inbox|settings\/[a-z-]+)$/.test(
      url.pathname
    ) ||
    url.search
  ) {
    throw new BadRequestException("Invalid return path.");
  }

  return url.pathname + url.search;
}

/**
 * Creates browser-bound Google login attempts and exchanges a single-use callback for a vault
 * session. Verifies state, nonce, issuer and identity subject; it never links accounts by email
 * or retains Google tokens. It writes no audit events.
 */
@Injectable()
export class GoogleLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: GoogleProvider,
    private readonly auth: AuthService
  ) {}

  async start(returnTo: unknown, sessionId?: string) {
    const target = sessionId ? "/settings/data" : loginReturnTo(returnTo);
    const flow = {
      state: createSessionToken(),
      nonce: createSessionToken(),
      codeVerifier: createSessionToken()
    };
    const browserToken = createSessionToken();
    const url = await this.provider.authorizationUrl(flow);
    await this.prisma.client.loginAttempt.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    await this.prisma.client.loginAttempt.create({
      data: {
        stateHash: hashSessionToken(flow.state),
        browserHash: hashSessionToken(browserToken),
        nonce: flow.nonce,
        codeVerifier: flow.codeVerifier,
        returnTo: target,
        sessionId,
        expiresAt: new Date(Date.now() + loginAttemptTtlMs)
      }
    });

    return { url, browserToken };
  }

  async finish(
    query: string,
    browserToken: string | null,
    sessionToken: string | null
  ) {
    const url = new URL(apiEnv().GOOGLE_REDIRECT_URI);
    url.search = query;
    const state = url.searchParams.get("state");
    if (
      !state ||
      !browserToken ||
      url.searchParams.getAll("state").length !== 1
    ) {
      throw new UnauthorizedException("Invalid sign-in attempt.");
    }
    const attempt = await this.prisma.client.loginAttempt.findUnique({
      where: { stateHash: hashSessionToken(state) }
    });
    if (
      !attempt ||
      attempt.expiresAt <= new Date() ||
      attempt.browserHash !== hashSessionToken(browserToken)
    ) {
      throw new UnauthorizedException(
        "Sign-in expired or started in another browser."
      );
    }
    // Consume before exchange: replay and concurrent callbacks fail closed.
    const consumed = await this.prisma.client.loginAttempt.deleteMany({
      where: { stateHash: attempt.stateHash, expiresAt: { gt: new Date() } }
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException("Sign-in already used.");
    }
    try {
      const identity = await this.provider.exchange(url, {
        state,
        nonce: attempt.nonce,
        codeVerifier: attempt.codeVerifier
      });
      if (attempt.sessionId) {
        const session = sessionToken
          ? await this.prisma.client.session.findUnique({
              where: { tokenHash: hashSessionToken(sessionToken) }
            })
          : null;
        if (!session || session.id !== attempt.sessionId) {
          throw new UnauthorizedException(
            "Your session changed. Start verification again."
          );
        }
        await this.auth.verifyDeletion(session.id, identity);

        return {
          redirect: new URL("/settings/data?verified=1", apiEnv().APP_URL).href
        };
      }
      const result = await this.auth.signInWithGoogle(identity);
      const base = attempt.returnTo.startsWith("/oauth/consent?")
        ? apiEnv().GOOGLE_REDIRECT_URI
        : apiEnv().APP_URL;

      return {
        token: result.token,
        redirect: new URL(attempt.returnTo, base).href
      };
    } catch {
      return {
        redirect: new URL(
          attempt.sessionId
            ? "/settings/data?authError=google"
            : "/?authError=google",
          apiEnv().APP_URL
        ).href
      };
    }
  }
}
