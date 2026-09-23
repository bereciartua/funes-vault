import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { apiEnv } from "../config.js";
import { sessionCookieName } from "./auth.constants.js";
import type { FunesRequest } from "./auth.types.js";
import { cookieSecure, readCookie, setSessionCookie } from "./cookies.js";
import {
  GoogleLoginService,
  loginAttemptCookie,
  loginAttemptTtlMs
} from "./google-login.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

const flowCookieOptions = () => ({
  httpOnly: true,
  secure: cookieSecure(),
  sameSite: "lax" as const,
  path: "/auth/google"
});

@ApiTags("auth")
@Controller("auth/google")
export class GoogleLoginController {
  constructor(private readonly login: GoogleLoginService) {}

  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: "Sign in or create an account with Google" })
  @ApiResponse({
    status: 302,
    description:
      "Redirect to Google with a browser-bound, expiring login attempt."
  })
  @ApiQuery({
    name: "returnTo",
    required: false,
    type: String,
    example: "/vault"
  })
  @ApiBadRequestResponse({
    description: "Return destination is not an allowed app or consent path."
  })
  @ApiServiceUnavailableResponse({
    description: "Google sign-in is not configured."
  })
  @ApiTooManyRequestsResponse({ description: "Too many sign-in attempts." })
  async start(@Query("returnTo") returnTo: unknown, @Res() res: Response) {
    const result = await this.login.start(returnTo);
    res.set("Cache-Control", "no-store");
    res.cookie(loginAttemptCookie, result.browserToken, {
      ...flowCookieOptions(),
      maxAge: loginAttemptTtlMs
    });
    res.redirect(result.url);
  }

  @Get("verify-deletion")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(sessionCookieName)
  @ApiOperation({
    summary: "Verify the current Google identity before account deletion"
  })
  @ApiResponse({
    status: 302,
    description:
      "Redirect to Google, then back to data settings for explicit deletion confirmation."
  })
  @ApiUnauthorizedResponse({ description: "Missing or expired Funes session." })
  async verifyDeletion(@Req() req: FunesRequest, @Res() res: Response) {
    const result = await this.login.start(undefined, req.sessionId);
    res.set("Cache-Control", "no-store");
    res.cookie(loginAttemptCookie, result.browserToken, {
      ...flowCookieOptions(),
      maxAge: loginAttemptTtlMs
    });
    res.redirect(result.url);
  }

  @Get("callback")
  @ApiOperation({
    summary: "Complete Google sign-in and establish a Funes session"
  })
  @ApiResponse({
    status: 303,
    description: "Redirect to the vault, MCP consent, or sign-in error."
  })
  async callback(@Req() req: Request, @Res() res: Response) {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    res.clearCookie(loginAttemptCookie, flowCookieOptions());
    try {
      const query = req.originalUrl.split("?").slice(1).join("?");
      const result = await this.login.finish(
        query,
        readCookie(req.headers.cookie, loginAttemptCookie),
        readCookie(req.headers.cookie, sessionCookieName)
      );
      if (result.token) {
        setSessionCookie(res, result.token);
      }
      res.redirect(303, result.redirect);
    } catch {
      // Never put upstream errors, identity data, or authorization codes in URLs.
      res.redirect(303, new URL("/?authError=google", apiEnv().APP_URL).href);
    }
  }
}
