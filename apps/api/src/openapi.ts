import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/** Shared by the running API and deterministic documentation export. */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Funes Vault API")
    .setDescription(
      "Privacy-first personal memory API for users, LLM clients, and MCP integrations."
    )
    .setVersion("1.1.0")
    .addCookieAuth(
      "funes_vault_session",
      {
        type: "apiKey",
        in: "cookie",
        name: "funes_vault_session",
        description: "HTTP-only session cookie established by Google sign-in."
      },
      "funes_vault_session"
    )
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description:
          "Client bearer token returned at client creation or rotation."
      },
      "client_bearer"
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}
