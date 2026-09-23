import type { MemoryProvenanceResponse } from "@funes-vault/shared";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { render } from "../../../test/render";
import { MemoryProvenancePanel } from "./MemoryProvenancePanel";

it("keeps the audit trail reachable with a readable label instead of a raw id", () => {
  const provenance: MemoryProvenanceResponse = {
    memoryId: "memory",
    entries: [
      {
        id: "entry",
        type: "CREATED",
        actorType: "USER",
        actorId: "owner",
        sourceType: "MANUAL",
        sourceClientId: null,
        sourceUri: null,
        suggestionId: null,
        jobRunId: null,
        auditEventId: "audit-private-id",
        memoryRequestId: null,
        reason: null,
        evidence: "Owner entered this memory",
        confidence: 1,
        metadata: {},
        createdAt: "2026-09-23T12:00:00Z",
        subjects: [
          {
            type: "AUDIT_EVENT",
            id: "audit-private-id",
            role: "AUDIT_EVENT",
            label: "audit-private-id",
            metadata: {},
            memoryStatus: null,
            memorySensitivity: null
          }
        ]
      }
    ]
  };
  render(<MemoryProvenancePanel isLoading={false} provenance={provenance} />);
  expect(
    screen.getByRole("link", { name: /Audit event/ }).getAttribute("href")
  ).toBe("/settings/audit?eventId=audit-private-id");
  expect(screen.queryByText("audit-private-id")).toBeNull();
  expect(screen.getByText("Owner entered this memory")).toBeTruthy();
});
