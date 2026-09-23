import {
  type OAuthClientRegistration,
  OAuthRegistrationStatus
} from "@funes-vault/db";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { oauthMaxPendingRegistrations } from "./oauth.config.js";

function toClientInformation(
  registration: OAuthClientRegistration
): OAuthClientInformationFull {
  return {
    client_id: registration.clientId,
    client_id_issued_at: Math.floor(registration.createdAt.getTime() / 1000),
    client_name: registration.name,
    redirect_uris: registration.redirectUris,
    token_endpoint_auth_method: registration.tokenEndpointAuthMethod,
    grant_types: registration.grantTypes,
    response_types: ["code"],
    scope: registration.scope ?? undefined,
    client_uri: registration.clientUri ?? undefined,
    logo_uri: registration.logoUri ?? undefined,
    contacts:
      registration.contacts.length > 0 ? registration.contacts : undefined
  };
}

function isAllowedRedirectUri(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol === "https:") {
    return true;
  }

  // Loopback redirects support native clients per RFC 8252.
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

/**
 * Owns public connector metadata registration.
 * Tenant boundary: registrations are public metadata; user grants are created separately.
 * Audit: registration logging only; never stores a client secret.
 */
@Injectable()
export class OAuthClientsStoreService implements OAuthRegisteredClientsStore {
  private readonly logger = new Logger(OAuthClientsStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getClient(clientId: string) {
    const registration =
      await this.prisma.client.oAuthClientRegistration.findUnique({
        where: { clientId }
      });

    if (
      !registration ||
      registration.status === OAuthRegistrationStatus.BLOCKED
    ) {
      return undefined;
    }

    return toClientInformation(registration);
  }

  async registerClient(
    client: OAuthClientInformationFull
  ): Promise<OAuthClientInformationFull> {
    if (!client.redirect_uris.every(isAllowedRedirectUri)) {
      throw new InvalidClientMetadataError(
        "redirect_uris must use https or a loopback http address"
      );
    }

    const pending = await this.prisma.client.oAuthClientRegistration.count({
      where: { status: OAuthRegistrationStatus.PENDING }
    });

    if (pending >= oauthMaxPendingRegistrations()) {
      throw new InvalidClientMetadataError(
        "Registration is temporarily unavailable"
      );
    }

    const name =
      client.client_name?.trim() ||
      `MCP connector ${client.client_id.slice(0, 8)}`;

    const registration =
      await this.prisma.client.oAuthClientRegistration.create({
        data: {
          clientId: client.client_id,
          name,
          redirectUris: client.redirect_uris,
          // Every dynamically registered client is a public client using
          // PKCE. Forcing "none" here means no client secret ever exists, so
          // there is no plaintext credential to store.
          tokenEndpointAuthMethod: "none",
          grantTypes: ["authorization_code", "refresh_token"],
          scope: client.scope ?? null,
          clientUri: client.client_uri ?? null,
          logoUri: client.logo_uri ?? null,
          contacts: client.contacts ?? [],
          status: OAuthRegistrationStatus.PENDING,
          metadata: {
            softwareId: client.software_id ?? null,
            softwareVersion: client.software_version ?? null
          }
        }
      });

    this.logger.log(
      `OAuth client registered pending approval: ${registration.clientId} (${registration.name})`
    );

    return toClientInformation(registration);
  }
}
