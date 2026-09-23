import type { MemoryExtractionRunStatus } from "@funes-vault/db";
import type { MemoryProcessingResult } from "@funes-vault/shared";
/** Retain the lowercase processing-result wire contract while Prisma enums follow database conventions. */
export function processingStatus(
  status: MemoryExtractionRunStatus
): MemoryProcessingResult["status"] {
  return status.toLowerCase() as MemoryProcessingResult["status"];
}
