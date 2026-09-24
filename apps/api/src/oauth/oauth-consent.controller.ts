import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Req,
  Res
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";

import { SessionsService } from "../auth/sessions.service.js";
import { apiEnv } from "../config.js";
import {
  renderConsentPage,
  renderErrorPage,
  renderLoginPage
} from "./oauth-consent.html.js";
import { OAuthGrantsService } from "./oauth-grants.service.js";

const consentQuerySchema = z.object({
  request: z.string().trim().min(1),
  nonce: z.string().trim().min(1)
});

const decisionBodySchema = consentQuerySchema.extend({
  decision: z.enum(["approve", "deny"])
});

// This HTML boundary uses safeParse directly so malformed input renders an HTML error.
// Consent uses the canonical API origin, sharing Google and web session cookies.
@ApiExcludeController()
@Controller("oauth/consent")
export class OAuthConsentController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly grantsService: OAuthGrantsService
  ) {}

  @Get()
  async showConsent(
    @Query() rawQuery: unknown,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const parsed = consentQuerySchema.safeParse(rawQuery);

    if (!parsed.success) {
      this.sendHtml(res, 400, renderErrorPage("Malformed consent link."));

      return;
    }

    const canonical = new URL(apiEnv().GOOGLE_REDIRECT_URI);
    if (req.get("host") !== canonical.host) {
      canonical.pathname = "/oauth/consent";
      canonical.search = new URLSearchParams(parsed.data).toString();
      res.set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer"
      });
      res.redirect(303, canonical.href);

      return;
    }

    try {
      const user = await this.currentUser(req);
      const context = await this.grantsService.getConsentContext(
        parsed.data.request,
        user?.id
      );

      if (!user) {
        this.sendHtml(
          res,
          200,
          renderLoginPage({
            requestId: parsed.data.request,
            nonce: parsed.data.nonce
          })
        );

        return;
      }

      this.sendHtml(
        res,
        200,
        renderConsentPage({
          context,
          nonce: parsed.data.nonce,
          userEmail: user.email
        }),
        context.redirectOrigin
      );
    } catch (error) {
      this.sendFlowError(res, error);
    }
  }

  @Post("decision")
  async decide(
    @Body() rawBody: unknown,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const parsed = decisionBodySchema.safeParse(rawBody);

    if (!parsed.success) {
      this.sendHtml(res, 400, renderErrorPage("Malformed consent decision."));

      return;
    }

    const user = await this.currentUser(req);

    if (!user) {
      this.sendHtml(
        res,
        401,
        renderLoginPage({
          requestId: parsed.data.request,
          nonce: parsed.data.nonce,
          error: "Your session expired. Sign in again to continue."
        })
      );

      return;
    }

    try {
      const decision =
        parsed.data.decision === "approve"
          ? await this.grantsService.approve({
              userId: user.id,
              requestId: parsed.data.request,
              nonce: parsed.data.nonce
            })
          : await this.grantsService.deny({
              userId: user.id,
              requestId: parsed.data.request,
              nonce: parsed.data.nonce
            });

      res.redirect(303, decision.redirectUrl);
    } catch (error) {
      this.sendFlowError(res, error);
    }
  }

  private currentUser(req: Request) {
    return this.sessions.resolveFromCookieHeader(req.headers.cookie);
  }

  private sendHtml(
    res: Response,
    status: number,
    html: string,
    redirectOrigin?: string
  ) {
    res
      .status(status)
      .set({
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'${redirectOrigin ? ` ${redirectOrigin}` : ""}`
      })
      .send(html);
  }

  private sendFlowError(res: Response, error: unknown) {
    const message =
      error instanceof HttpException
        ? error.message
        : "Something went wrong handling this authorization request.";
    const status = error instanceof HttpException ? error.getStatus() : 500;

    this.sendHtml(res, status, renderErrorPage(message, status !== 403));
  }
}
