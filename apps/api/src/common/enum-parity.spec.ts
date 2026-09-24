import { readFileSync } from "node:fs";

import * as db from "@funes-vault/db";
import * as shared from "@funes-vault/shared";
import { describe, expect, it } from "vitest";
const publicEnums = [
  [
    "MemoryRequestReason",
    shared.memoryRequestReasonSchema.options,
    db.MemoryRequestReason
  ],
  ["MemoryKind", shared.memoryKindSchema.options, db.MemoryKind],
  [
    "MemorySensitivity",
    shared.memorySensitivitySchema.options,
    db.MemorySensitivity
  ],
  ["MemoryStatus", shared.memoryStatusSchema.options, db.MemoryStatus],
  ["ReviewState", shared.reviewStateSchema.options, db.ReviewState],
  ["SourceType", shared.sourceTypeSchema.options, db.SourceType],
  ["ClientType", shared.clientTypeSchema.options, db.ClientType],
  [
    "ClientTrustLevel",
    shared.clientTrustLevelSchema.options,
    db.ClientTrustLevel
  ],
  ["ClientRetention", shared.clientRetentionSchema.options, db.ClientRetention],
  ["PolicyOperation", shared.policyOperationSchema.options, db.PolicyOperation],
  [
    "MemoryRequestStatus",
    shared.memoryRequestStatusSchema.options,
    db.MemoryRequestStatus
  ],
  [
    "MemorySuggestionStatus",
    shared.memorySuggestionStatusSchema.options,
    db.MemorySuggestionStatus
  ],
  ["AuditEventType", shared.auditEventTypeSchema.options, db.AuditEventType],
  ["AuditActorType", shared.auditActorTypeSchema.options, db.AuditActorType],
  [
    "MemoryProvenanceEntryType",
    shared.memoryProvenanceEntryTypeSchema.options,
    db.MemoryProvenanceEntryType
  ],
  [
    "ProvenanceSubjectType",
    shared.provenanceSubjectTypeSchema.options,
    db.ProvenanceSubjectType
  ],
  [
    "ProvenanceSubjectRole",
    shared.provenanceSubjectRoleSchema.options,
    db.ProvenanceSubjectRole
  ],
  [
    "AuditSubjectType",
    shared.auditSubjectTypeSchema.options,
    db.AuditSubjectType
  ],
  [
    "AuditSubjectRole",
    shared.auditSubjectRoleSchema.options,
    db.AuditSubjectRole
  ],
  ["JobType", shared.jobTypeSchema.options, db.JobType],
  ["JobStatus", shared.jobStatusSchema.options, db.JobStatus],
  [
    "ConsolidationMode",
    shared.consolidationModeSchema.options,
    db.ConsolidationMode
  ],
  ["UserRole", shared.authUserSchema.shape.role.options, db.UserRole]
] as const;
describe("shared database enum parity", () => {
  it.each(publicEnums)(
    "%s matches the public schema",
    (_name, options, values) => {
      expect(new Set(options)).toEqual(new Set(Object.values(values)));
    }
  );
  const schema = readFileSync(
    new URL("../../../../packages/db/prisma/schema.prisma", import.meta.url),
    "utf8"
  );
  const enums = [...schema.matchAll(/enum (\w+) \{([^}]+)\}/g)].map(
    ([, name, body]) =>
      [
        name!,
        body!
          .trim()
          .split("\n")
          .map((line) => line.trim().split(/\s+/)[0])
      ] as const
  );
  it.each(enums)(
    "%s generated enum matches the Prisma source",
    (name, expected) => {
      expect(
        Object.values(db[name as keyof typeof db] as Record<string, string>)
      ).toEqual(expected);
    }
  );
  it("explicitly accounts for every database enum including internal protocols", () => {
    const internal = [
      "ChatMessageRole",
      "OAuthRegistrationStatus",
      "OAuthTokenType",
      "MemoryExtractionRunStatus"
    ];
    expect(new Set(enums.map(([name]) => name))).toEqual(
      new Set([...publicEnums.map(([name]) => name), ...internal])
    );
  });
  it("processing status maps Prisma names to the existing public protocol", () => {
    expect(
      Object.values(db.MemoryExtractionRunStatus)
        .map((value) => value.toLowerCase())
        .sort()
    ).toEqual(
      shared.memoryProcessingResultSchema.shape.status.options
        .filter((value) => value !== "unavailable")
        .sort()
    );
  });
});
