import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { webSecurityPolicy } from "./lib/security-policy";
import { serverEnv } from "./lib/server-env";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString("base64");
  const env = serverEnv();
  const policy = webSecurityPolicy(
    nonce,
    env.apiUrl,
    env.nodeEnv !== "production"
  );
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon|icons|sw.js|manifest.webmanifest).*)"
  ]
};
