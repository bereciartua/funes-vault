import {
  ClientTrustLevel,
  MemorySensitivity,
  PolicyOperation,
  type Prisma
} from "@funes-vault/db";
import { oauthScopeRead, oauthScopeSuggest } from "@funes-vault/shared";
import { ForbiddenException } from "@nestjs/common";

import { apiEnv } from "../config.js";

const connectorSensitivityValues = Object.values(MemorySensitivity);

// Third-party connectors get a conservative default disclosure ceiling; the
// user can raise or lower it afterwards in Apps & access like any policy.
export function defaultConnectorMaxSensitivity(): MemorySensitivity {
  const configured = apiEnv().MCP_CONNECTOR_MAX_SENSITIVITY;

  if (
    configured &&
    connectorSensitivityValues.includes(configured as MemorySensitivity)
  ) {
    return configured as MemorySensitivity;
  }

  return MemorySensitivity.INTERNAL;
}

export function scopesToOperations(scopes: string[]): PolicyOperation[] {
  const operations: PolicyOperation[] = [];

  if (scopes.includes(oauthScopeRead)) {
    operations.push(PolicyOperation.READ);
  }

  if (scopes.includes(oauthScopeSuggest)) {
    operations.push(PolicyOperation.SUGGEST);
  }

  return operations;
}

export function resultingOperations(
  existing: PolicyOperation[],
  scopes: string[]
) {
  return [...new Set([...existing, ...scopesToOperations(scopes)])];
}
export async function consentClient(
  db: Pick<Prisma.TransactionClient, "client">,
  userId: string,
  registrationId: string
) {
  const client = await db.client.findFirst({
    where: { userId, oauthRegistrationId: registrationId },
    include: {
      policies: { include: { allowedCategories: true, deniedCategories: true } }
    }
  });
  if (client?.trustLevel === ClientTrustLevel.BLOCKED) {
    throw new ForbiddenException(
      "This app is blocked. Unblock it in Apps & access before reconnecting."
    );
  }

  return client;
}
