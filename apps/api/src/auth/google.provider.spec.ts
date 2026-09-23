import { generateKeyPairSync, sign } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleProvider } from "./google.provider.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig"
};
const flow = {
  state: "expected-state",
  nonce: "expected-nonce",
  codeVerifier: "v".repeat(43)
};
const callback = () =>
  new URL(
    "http://localhost:4000/auth/google/callback?code=test-code&state=expected-state"
  );
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" }
  });
let claims: Record<string, unknown>;
let corruptSignature: boolean;
let tokenBody: URLSearchParams;

function idToken() {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key" })
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey);
  if (corruptSignature) {
    signature[0] = signature[0]! ^ 255;
  }

  return `${unsigned}.${signature.toString("base64url")}`;
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:4000/auth/google/callback"
  );
  corruptSignature = false;
  const now = Math.floor(Date.now() / 1000);
  claims = {
    iss: "https://accounts.google.com",
    aud: "test-client",
    sub: "subject-1",
    iat: now,
    exp: now + 3600,
    nonce: flow.nonce,
    email: "USER@example.com",
    email_verified: true,
    name: "Test User"
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (
        url === "https://accounts.google.com/.well-known/openid-configuration"
      ) {
        return json({
          issuer: "https://accounts.google.com",
          authorization_endpoint:
            "https://accounts.google.com/o/oauth2/v2/auth",
          token_endpoint: "https://oauth2.googleapis.com/token",
          jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"]
        });
      }
      if (url === "https://oauth2.googleapis.com/token") {
        if (!(init?.body instanceof URLSearchParams)) {
          throw new Error("Expected form body");
        }
        tokenBody = init.body;

        return json({
          access_token: "discard-me",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: idToken()
        });
      }
      if (url === "https://www.googleapis.com/oauth2/v3/certs") {
        return json({ keys: [jwk] });
      }
      throw new Error(`Unexpected outbound URL: ${url}`);
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("privacy: Google OpenID Connect protocol", () => {
  it("uses PKCE and minimal identity scopes and validates a signed ID token", async () => {
    const provider = new GoogleProvider();
    const url = new URL(await provider.authorizationUrl(flow));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe(flow.state);
    expect(url.searchParams.get("nonce")).toBe(flow.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(flow.codeVerifier);
    expect(url.searchParams.has("access_type")).toBe(false);
    await expect(provider.exchange(callback(), flow)).resolves.toEqual({
      subject: "subject-1",
      email: "user@example.com",
      displayName: "Test User"
    });
    expect(tokenBody.get("code_verifier")).toBe(flow.codeVerifier);
    expect(tokenBody.get("redirect_uri")).toBe(
      "http://localhost:4000/auth/google/callback"
    );
  });
  it.each([
    ["issuer", { iss: "https://attacker.example" }],
    ["audience", { aud: "another-client" }],
    ["nonce", { nonce: "another-nonce" }],
    ["expiry", { exp: 1 }],
    ["unverified email", { email_verified: false }],
    ["missing email", { email: undefined }]
  ])("rejects invalid %s", async (_name, overrides) => {
    Object.assign(claims, overrides);
    await expect(
      new GoogleProvider().exchange(callback(), flow)
    ).rejects.toThrow();
  });
  it("rejects tampered signatures", async () => {
    corruptSignature = true;
    await expect(
      new GoogleProvider().exchange(callback(), flow)
    ).rejects.toThrow();
  });
  it("rejects state mismatch and provider denial", async () => {
    const url = callback();
    url.searchParams.set("state", "wrong");
    await expect(new GoogleProvider().exchange(url, flow)).rejects.toThrow();
    url.searchParams.set("state", flow.state);
    url.searchParams.delete("code");
    url.searchParams.set("error", "access_denied");
    await expect(new GoogleProvider().exchange(url, flow)).rejects.toThrow();
  });
  it("fails clearly when local credentials are missing", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    await expect(new GoogleProvider().authorizationUrl(flow)).rejects.toThrow(
      "Google sign-in is not configured"
    );
  });
});
