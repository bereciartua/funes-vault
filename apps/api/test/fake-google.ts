import { UnauthorizedException } from "@nestjs/common";

import {
  type GoogleFlow,
  GoogleProvider
} from "../src/auth/google.provider.js";
import { apiEnv } from "../src/config.js";

// Test-only identity provider. No production configuration selects this class.
export class FakeGoogleProvider extends GoogleProvider {
  override async authorizationUrl(flow: GoogleFlow) {
    const url = new URL("/test-google", apiEnv().GOOGLE_REDIRECT_URI);
    url.searchParams.set("state", flow.state);

    return Promise.resolve(url.href);
  }

  override async exchange(url: URL) {
    if (url.searchParams.has("error")) {
      throw new UnauthorizedException();
    }
    const code = url.searchParams.get("code");
    if (!code?.startsWith("test-")) {
      throw new UnauthorizedException();
    }
    const email = code.slice(5);

    return Promise.resolve({
      subject: `test-${email}`,
      email,
      displayName: "Test User"
    });
  }
}
