import type { UpdateMemoryRequest } from "@funes-vault/shared";

export const memoryContentFields = [
  "kind",
  "title",
  "body",
  "categoryKeys",
  "sensitivity",
  "confidence",
  "expiresAt"
] as const satisfies readonly (keyof UpdateMemoryRequest)[];
export const memorySourceFields = [
  "sourceType",
  "sourceUri",
  "sourceMetadata"
] as const satisfies readonly (keyof UpdateMemoryRequest)[];
export const memoryStatusFields = [
  "status",
  "reviewState"
] as const satisfies readonly (keyof UpdateMemoryRequest)[];
