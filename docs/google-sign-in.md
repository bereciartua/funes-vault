# Google-only sign-in

Funes uses Google OpenID Connect for website and MCP consent login. Production has no password, registration, or demo sign-in. Local development also offers the seeded demo account. First sign-in creates a vault and the default Web Chat access policy; subsequent sign-ins use Google's stable `sub`, never email matching. Google receives the authentication request and returns basic identity information; no vault memories are sent to Google for sign-in. Only `openid email profile` scopes are requested. Google access/refresh tokens are not stored.

## Local development

For everyday local work, follow the README setup, run `pnpm db:seed`, then `pnpm dev`. Choose **Sign in → Use demo account** to open `demo@funes-vault.local` with its existing fixture data. No password, Google credentials, or internet access is needed; the local web app, API, and Postgres must still be running. AI features still require their configured provider. Repeated demo logins preserve edits; reseeding resets the fixture data.

The API dev script sets `NODE_ENV=development`. `GET /auth/options` advertises demo availability, and `POST /auth/demo` independently requires exactly that environment value; production, test, staging, and unset modes return 404. No user selection is accepted. Missing fixtures produce a seed instruction, and linked Google identities or elevated demo roles are rejected. The session uses the normal HTTP-only cookie and hashed database token. Never expose the development API publicly or use it against a production database. Demo account deletion through Google verification is unavailable; use local seed/reset tooling for disposable fixtures.

To test real Google sign-in:

1. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), create/select a development project, configure branding/audience, and create an OAuth client of type **Web application**. If the audience configuration requires test users, add your Google account.
2. Register the exact authorized redirect URI `http://localhost:4000/auth/google/callback`. HTTP localhost is supported. No tunnel, public server, or local TLS certificate is needed on the same computer. A JavaScript origin is not required for this server redirect flow.
3. Copy `.env.example` to `.env`, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Keep `GOOGLE_REDIRECT_URI` at the localhost default, or update both it and Google's registration if changing the API port. Never put the secret in a `NEXT_PUBLIC_` variable or commit `.env`.
4. Run the normal install, Docker dependencies, Prisma generation/migration, and `pnpm dev` commands in the README. Seed only when you want synthetic fixtures/shared categories. Your Google identity creates a separate empty vault.
5. Open `http://localhost:3000`, choose **Sign in → Continue with Google**, and select your account. New logins need internet access. Existing Funes sessions survive normal app restarts; deleting the database removes them and the next sign-in creates a new vault.

Missing Google configuration returns HTTP 503 from `/auth/google`; development demo login remains available. If Google reports `redirect_uri_mismatch`, compare the full scheme, host, port, and path. Use `localhost` consistently rather than mixing it with `127.0.0.1`. Phone testing needs a reachable HTTPS development origin and a separately registered callback.

## Deployment

Use a separate production Google project/client and register `https://<API_DOMAIN>/auth/google/callback`. Set all three `GOOGLE_*` values in `.env.production` or the Portainer stack environment. Production startup requires Google credentials and an HTTPS callback. The browser-facing API URL and callback must share an origin so host-only session cookies work. Keep the website and API on the same site (for example `vault.example.com` and `vault-api.example.com`) with the existing SameSite=Lax cookies.

MCP clients still authorize against the connector domain. `/oauth/consent` on that domain redirects to the canonical API origin, where Google login and consent share the website's session. The API proxy must expose `/oauth/consent*` alongside `/auth/*`; the supplied Caddyfile does. The provider callback returns to that exact consent request, and grant approval then returns to the MCP client's registered redirect URI. No cross-domain session transfer or shared-domain cookie is used.

Configure Google's production branding/audience and any Google-required verification before opening signup. Any Google identity with a verified email can create a vault under the current open-signup policy. Funes authorization roles remain server-owned and default to USER.

## Account deletion

Settings → Data links to **Verify Google account**. This starts a fresh browser-bound Google authorization round trip and requires the same Google subject and the same unexpired Funes session. Google may reuse its own signed-in session; this is a fresh identity check, not a guarantee of a new password/MFA challenge. The callback only marks the current session as verified and returns to settings. Within five minutes, type DELETE and confirm the destructive action. The server checks verification independently of URL/UI state. Other sessions and identities cannot use it. Deletion cascades to the Google identity and Funes sessions.

## Security and tests

`openid-client` performs authorization-code exchange, PKCE, state/nonce and ID-token validation, including signature verification. Login attempts expire after ten minutes, are bound to an HTTP-only browser cookie, and are consumed atomically before exchange. State and browser token values are hashed in Postgres; the ephemeral PKCE verifier and expected nonce live only in the expiring attempt. Return destinations are limited to app routes and well-formed MCP consent paths. Logs omit URL queries and redirect headers to avoid capturing codes/nonces. Account email collisions fail closed instead of linking an existing vault.

API E2E tests replace `GoogleProvider` using Nest dependency injection. Playwright starts `apps/api/test/web-server.ts` through a separate compilation output, with a test-only provider selection page. That executable requires `NODE_ENV=test` and a database name ending `_test`, and is excluded from production builds and Docker build context. Production has no fake-provider flag or test-login route. Provider protocol tests use signed synthetic ID tokens and intercepted HTTP responses, without live Google credentials.

The pre-release Prisma migration drops password credentials and invalidates old sessions; it does not migrate/link old identities. Use a disposable database for tests and reset obsolete local fixtures as needed. No existing vault is automatically claimed based on its email.

The separate `pnpm test:e2e:demo` browser suite starts the real API in development mode with no Google credentials, blocks external browser requests, and verifies seeded data and session persistence. Run it against a migrated and seeded disposable database, separately from the regular suite. API tests also reject demo login in every non-development mode.
