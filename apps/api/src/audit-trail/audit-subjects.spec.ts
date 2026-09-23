import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType
} from "@funes-vault/db";
import { describe, expect, it } from "vitest";

import { dedupeSubjects, inferAuditSubjects } from "./audit-subjects.js";

describe("privacy: audit subjects", () => {
  it("records disclosed, denied, and request subjects independently", () => {
    const subjects = inferAuditSubjects(
      {
        userId: "owner",
        type: AuditEventType.MEMORY_DISCLOSURE,
        actorType: AuditActorType.CLIENT,
        clientId: "client",
        memoryRequestId: "request"
      },
      {
        memoryIds: ["shared"],
        denied: [{ memoryId: "private", reason: "sensitivity_ceiling" }]
      }
    );
    expect(subjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "shared",
          role: AuditSubjectRole.DISCLOSED
        }),
        expect.objectContaining({
          id: "private",
          role: AuditSubjectRole.DENIED,
          metadata: { reason: "sensitivity_ceiling" }
        }),
        expect.objectContaining({
          id: "client",
          type: AuditSubjectType.CLIENT
        }),
        expect.objectContaining({
          id: "request",
          type: AuditSubjectType.MEMORY_REQUEST
        })
      ])
    );
  });
  it("deduplicates by type, id, and role while preserving labels and combining metadata", () => {
    const subject = {
      type: AuditSubjectType.MEMORY,
      id: "memory",
      role: AuditSubjectRole.TARGET,
      label: "Original",
      metadata: { first: 1 }
    };
    expect(
      dedupeSubjects([
        subject,
        { ...subject, label: null, metadata: { second: 2 } },
        { ...subject, id: null },
        { ...subject, role: AuditSubjectRole.CANONICAL }
      ])
    ).toEqual([
      { ...subject, metadata: { first: 1, second: 2 } },
      { ...subject, role: AuditSubjectRole.CANONICAL }
    ]);
  });
  it.each([
    [AuditEventType.MEMORY_CREATED, AuditSubjectRole.CREATED],
    [AuditEventType.MEMORY_ARCHIVED, AuditSubjectRole.ARCHIVED],
    [AuditEventType.MEMORY_DELETED, AuditSubjectRole.DELETED]
  ])("maps %s to its lifecycle role", (type, role) => {
    expect(
      inferAuditSubjects(
        { userId: "owner", type, actorType: AuditActorType.USER },
        { memoryId: "memory" }
      )
    ).toEqual([{ type: AuditSubjectType.MEMORY, id: "memory", role }]);
  });
});
