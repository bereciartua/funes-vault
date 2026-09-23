import type { AuthUser } from "@funes-vault/shared";
import {
  type DeleteAccountRequest,
  deleteAccountRequestSchema,
  type UpdateProfileRequest,
  updateProfileRequestSchema
} from "@funes-vault/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { sessionCookieName } from "./auth.constants.js";
import {
  AuthResponseDto,
  DeleteAccountRequestDto,
  LoginOptionsDto,
  LogoutResponseDto,
  UpdateProfileRequestDto
} from "./auth.dto.js";
import { AuthService } from "./auth.service.js";
import type { FunesRequest } from "./auth.types.js";
import { clearSessionCookie, setSessionCookie } from "./cookies.js";
import { CurrentUser } from "./current-user.decorator.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

type CookieResponse = Parameters<typeof setSessionCookie>[0];

// Destructive account actions have a strict per-IP budget.
const credentialThrottle = { default: { ttl: 60_000, limit: 5 } };

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("options")
  @ApiOperation({ summary: "Get available sign-in options" })
  @ApiOkResponse({ type: LoginOptionsDto })
  loginOptions() {
    return this.authService.loginOptions();
  }

  @Post("demo")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: "Open the seeded demo vault (development only; otherwise 404)"
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  async demo(@Res({ passthrough: true }) response: CookieResponse) {
    const { token, ...result } = await this.authService.signInWithDemo();
    setSessionCookie(response, token);

    return result;
  }

  @UseGuards(SessionAuthGuard)
  @Post("logout")
  @ApiCookieAuth(sessionCookieName)
  @ApiOperation({ summary: "Sign out and clear the current session" })
  @ApiCreatedResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  async logout(
    @Req() request: FunesRequest,
    @Res({ passthrough: true }) response: CookieResponse
  ) {
    await this.authService.logout(request.sessionId);
    clearSessionCookie(response);

    return { ok: true };
  }

  @UseGuards(SessionAuthGuard)
  @Get("me")
  @ApiCookieAuth(sessionCookieName)
  @ApiOperation({ summary: "Get the current authenticated user" })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  getMe(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @UseGuards(SessionAuthGuard)
  @Patch("me")
  @ApiCookieAuth(sessionCookieName)
  @ApiOperation({ summary: "Update the current user's profile" })
  @ApiBody({ type: UpdateProfileRequestDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileRequestSchema))
    body: UpdateProfileRequest
  ) {
    return this.authService.updateProfile(user.id, body);
  }

  @UseGuards(SessionAuthGuard)
  @Throttle(credentialThrottle)
  @Delete("me")
  @ApiCookieAuth(sessionCookieName)
  @ApiOperation({
    summary: "Delete the current account and all of its vault data"
  })
  @ApiBody({ type: DeleteAccountRequestDto })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({
    description: "Missing or invalid session."
  })
  @ApiForbiddenResponse({
    description:
      "Verify the same Google identity in this session within five minutes before deletion."
  })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded." })
  async deleteMe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(deleteAccountRequestSchema))
    body: DeleteAccountRequest,
    @Req() request: FunesRequest,
    @Res({ passthrough: true }) response: CookieResponse
  ) {
    const result = await this.authService.deleteAccount(
      user.id,
      request.sessionId,
      body
    );
    clearSessionCookie(response);

    return result;
  }
}
