import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import * as oidc from "openid-client";

import { apiEnv } from "../config.js";

export type GoogleClaims = {
  subject: string;
  email: string;
  displayName: string | null;
};
export type GoogleFlow = { state: string; nonce: string; codeVerifier: string };

// Fixed Google issuer. Tests replace this provider through Nest DI, never a
// production environment flag. Demo login is a separate development-only path.
/** Validates Google authorization-code responses and identity claims. Login services bind state and account ownership; this adapter does not create sessions. */
@Injectable()
export class GoogleProvider {
  private configuration?: Promise<oidc.Configuration>;

  private config() {
    const env = apiEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new ServiceUnavailableException(
        "Google sign-in is not configured."
      );
    }
    this.configuration ??= oidc
      .discovery(
        new URL("https://accounts.google.com"),
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET
      )
      .then((config) => {
        oidc.enableNonRepudiationChecks(config);

        return config;
      })
      .catch((error) => {
        this.configuration = undefined;
        throw error;
      });

    return this.configuration;
  }

  async authorizationUrl(flow: GoogleFlow) {
    return oidc.buildAuthorizationUrl(await this.config(), {
      redirect_uri: apiEnv().GOOGLE_REDIRECT_URI,
      scope: "openid email profile",
      response_type: "code",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(flow.codeVerifier),
      code_challenge_method: "S256",
      prompt: "select_account"
    }).href;
  }

  async exchange(url: URL, flow: GoogleFlow): Promise<GoogleClaims> {
    const tokens = await oidc.authorizationCodeGrant(await this.config(), url, {
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      pkceCodeVerifier: flow.codeVerifier,
      idTokenExpected: true
    });
    const claims = tokens.claims();
    if (
      !claims ||
      claims.email_verified !== true ||
      typeof claims.email !== "string" ||
      !claims.sub
    ) {
      throw new UnauthorizedException(
        "Google must provide a verified email address."
      );
    }

    return {
      subject: claims.sub,
      email: claims.email.toLowerCase(),
      displayName:
        typeof claims.name === "string" ? claims.name.slice(0, 120) : null
    };
  }
}
