export { sensitivities } from "../../lib/domain/sensitivity";
import { type Memory } from "@funes-vault/shared";
export const memoryKinds: Memory["kind"][] = [
  "FACT",
  "PREFERENCE",
  "INSTRUCTION",
  "GOAL",
  "PROJECT_CONTEXT",
  "RELATIONSHIP",
  "CONSTRAINT",
  "EVENT",
  "SUMMARY"
];
export const statuses: Memory["status"][] = [
  "ACTIVE",
  "ARCHIVED",
  "SUGGESTED",
  "EXPIRED",
  "DELETED"
];
export const reviewStates: Memory["reviewState"][] = [
  "PENDING",
  "APPROVED",
  "REJECTED"
];
export const sourceTypes: Memory["source"]["type"][] = [
  "MANUAL",
  "IMPORT",
  "CHAT",
  "CLIENT_SUGGESTION",
  "CONSOLIDATION",
  "API",
  "DERIVED"
];
export const VAULT_MEMORY_PAGE_LIMIT = 10;
export const vaultFilterPanelId = "vault-advanced-filters";
