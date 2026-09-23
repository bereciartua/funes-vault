import type { Prisma } from "@funes-vault/db";

/** Convert JSON-safe results to database JSON, normalizing dates and undefined fields. An absent root becomes an empty object. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value === undefined ? {} : value)
  ) as Prisma.InputJsonValue;
}

export function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

export function getObjectMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
