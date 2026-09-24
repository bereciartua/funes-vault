import type {
  MemorySensitivity,
  OAuthRegistrationStatus,
  PolicyOperation
} from "@funes-vault/db";

export type ConsentContext = {
  requestId: string;
  clientName: string;
  clientUri: string | null;
  logoUri: string | null;
  redirectHost: string;
  redirectOrigin: string;
  scopes: string[];
  registrationStatus: OAuthRegistrationStatus;
  maxSensitivity: MemorySensitivity;
  operations: PolicyOperation[];
  createsPermissions: boolean;
  recreating: boolean;
  addedOperations: PolicyOperation[];
  allowedCategories: string[];
  deniedCategories: string[];
  requiresConfirmation: boolean;
  expiresAt: string | null;
};
