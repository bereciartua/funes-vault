import "reflect-metadata";

import { Test } from "@nestjs/testing";
import type { Express } from "express";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { GoogleProvider } from "../src/auth/google.provider.js";
import { apiEnv } from "../src/config.js";
import { installFakeChat } from "./fake-chat.js";
import { FakeGoogleProvider } from "./fake-google.js";

// This executable lives outside the production build. It must use a test DB.
if (process.env.NODE_ENV !== "test") {
  throw new Error("The browser-test API only runs in NODE_ENV=test");
}
const database = new URL(process.env.DATABASE_URL ?? "");
if (!database.pathname.endsWith("_test")) {
  throw new Error("Browser tests require a dedicated *_test database");
}
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(GoogleProvider)
  .useClass(FakeGoogleProvider)
  .compile();
const app = moduleRef.createNestApplication();
configureApp(app);
installFakeChat(app);
const server = app.getHttpAdapter().getInstance() as Express;
server.get("/test-google", (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const url = new URL(apiEnv().GOOGLE_REDIRECT_URI);
  url.searchParams.set("state", state);
  url.searchParams.set("code", "test-browser@example.com");
  const deletionUrl = new URL(url);
  deletionUrl.searchParams.set("code", "test-deletion@example.com");
  const cancelUrl = new URL(url);
  cancelUrl.searchParams.delete("code");
  cancelUrl.searchParams.set("error", "access_denied");
  res
    .type("html")
    .send(
      `<h1>Test identity provider</h1><a href="${url.href.replaceAll("&", "&amp;")}">Choose test account</a><p><a href="${deletionUrl.href.replaceAll("&", "&amp;")}">Choose deletion test account</a></p><a href="${cancelUrl.href.replaceAll("&", "&amp;")}">Cancel</a>`
    );
});
app.enableShutdownHooks();
await app.listen(apiEnv().API_PORT, "127.0.0.1");
