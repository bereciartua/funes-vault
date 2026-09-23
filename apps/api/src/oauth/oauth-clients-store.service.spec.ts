import { OAuthRegistrationStatus } from "@funes-vault/db";
import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { OAuthClientsStoreService } from "./oauth-clients-store.service.js";

function createRegistrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "registration_1",
    clientId: "oauth_client_1",
    name: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    scope: null,
    clientUri: null,
    logoUri: null,
    contacts: [],
    status: OAuthRegistrationStatus.PENDING,
    metadata: {},
    createdAt: new Date("2026-07-04T00:00:00.000Z"),
    updatedAt: new Date("2026-07-04T00:00:00.000Z"),
    ...overrides
  };
}

async function createStore(input: {
  registration?: ReturnType<typeof createRegistrationRow> | null;
  pendingCount?: number;
}) {
  const prisma = {
    client: {
      oAuthClientRegistration: {
        findUnique: vi.fn().mockResolvedValue(input.registration ?? null),
        count: vi.fn().mockResolvedValue(input.pendingCount ?? 0),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
          createRegistrationRow(data)
        )
      }
    }
  };

  return {
    store: await createService(OAuthClientsStoreService, [
      { provide: PrismaService, useValue: prisma }
    ]),
    prisma
  };
}

describe("privacy: OAuthClientsStoreService.getClient", () => {
  it("returns registered clients without any secret", async () => {
    const { store } = await createStore({
      registration: createRegistrationRow()
    });

    const client = await store.getClient("oauth_client_1");

    expect(client?.client_id).toBe("oauth_client_1");
    expect(client?.token_endpoint_auth_method).toBe("none");
    expect(client).not.toHaveProperty("client_secret");
  });

  it("hides blocked registrations entirely", async () => {
    const { store } = await createStore({
      registration: createRegistrationRow({
        status: OAuthRegistrationStatus.BLOCKED
      })
    });

    await expect(store.getClient("oauth_client_1")).resolves.toBeUndefined();
  });
});

describe("privacy: OAuthClientsStoreService.registerClient", () => {
  const metadata = {
    client_id: "generated_id",
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "client_secret_post",
    client_secret: "should-never-persist"
  };

  it("persists registrations as approval-pending public clients", async () => {
    const { store, prisma } = await createStore({});

    const registered = await store.registerClient(metadata);

    const created = prisma.client.oAuthClientRegistration.create.mock
      .calls[0]?.[0].data as Record<string, unknown>;
    expect(created.status).toBe(OAuthRegistrationStatus.PENDING);
    expect(created.tokenEndpointAuthMethod).toBe("none");
    expect(JSON.stringify(created)).not.toContain("should-never-persist");
    expect(registered.token_endpoint_auth_method).toBe("none");
  });

  it("rejects non-https redirect URIs except loopback", async () => {
    const { store } = await createStore({});

    await expect(
      store.registerClient({
        ...metadata,
        redirect_uris: ["http://evil.example/callback"]
      })
    ).rejects.toThrow("redirect_uris");

    await expect(
      store.registerClient({
        ...metadata,
        redirect_uris: ["http://127.0.0.1:8976/callback"]
      })
    ).resolves.toBeTruthy();
  });

  it("caps the number of approval-pending registrations", async () => {
    const { store } = await createStore({ pendingCount: 50 });

    await expect(store.registerClient(metadata as never)).rejects.toThrow(
      "temporarily unavailable"
    );
  });
});
