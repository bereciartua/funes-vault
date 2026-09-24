import type { AuditEvent, Client, Policy } from "@funes-vault/shared";
import { describe, expect, it } from "vitest";

import { pluralize } from "../text";
import { auditEventSummary } from "./audit-summary";
import { subjectDisplayLabel } from "./labels";
import {
  clientAccessSummary,
  policyRiskDescriptor,
  policyRiskFactors,
  policySummary
} from "./policy-summary";
import { sensitivityDescriptor, sensitivityMixSummary } from "./sensitivity";

const basePolicy: Policy = {
  id: "policy_1",
  clientId: "client_1",
  clientName: "Local Agent",
  allowedCategoryKeys: ["work"],
  deniedCategoryKeys: [],
  maxSensitivity: "INTERNAL",
  operations: ["READ"],
  requiresConfirmation: true,
  expiresAt: "2026-12-31T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const baseAuditEvent: AuditEvent = {
  id: "audit_1",
  type: "MEMORY_DISCLOSURE",
  actorType: "CLIENT",
  actorId: "client_1",
  clientId: "client_1",
  clientName: "Local Agent",
  memoryRequestId: "request_1",
  metadata: {
    memoryId: "memory_123456789",
    statedPurpose: "Software_Development"
  },
  subjects: [],
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("privacy state helpers", () => {
  it("marks restricted and secret sensitivity as elevated risk", () => {
    expect(sensitivityDescriptor("RESTRICTED")).toMatchObject({
      label: "Restricted",
      tone: "risk"
    });
    expect(sensitivityDescriptor("SECRET")).toMatchObject({
      label: "Secret",
      tone: "danger"
    });
  });

  it("flags policies that grant broad or high-impact access", () => {
    const riskyPolicy: Policy = {
      ...basePolicy,
      allowedCategoryKeys: [],
      maxSensitivity: "SECRET",
      operations: ["READ", "WRITE", "EXPORT"],
      requiresConfirmation: false,
      expiresAt: null
    };

    expect(policyRiskDescriptor(riskyPolicy, 5)).toMatchObject({
      label: "High-risk permissions",
      tone: "danger"
    });
    expect(
      policyRiskFactors(riskyPolicy, 5).map((factor) => factor.label)
    ).toEqual(
      expect.arrayContaining([
        "Allows secret memories",
        "All categories allowed",
        "No confirmation",
        "No expiration",
        "Can write memories",
        "Can export memory"
      ])
    );
  });

  it("turns audit events into human-readable summaries", () => {
    expect(auditEventSummary(baseAuditEvent)).toMatchObject({
      actor: "Local Agent",
      affected: "Memory memory_1...",
      title: "Memory Disclosure",
      tone: "risk"
    });
  });

  it("uses memory titles in disclosure summaries when available", () => {
    const disclosureEvent: AuditEvent = {
      ...baseAuditEvent,
      subjects: [
        {
          type: "MEMORY",
          id: "memory_123456789",
          role: "DISCLOSED",
          label: "Prefers concise implementation help",
          metadata: {}
        }
      ]
    };

    expect(auditEventSummary(disclosureEvent)).toMatchObject({
      affected: "“Prefers concise implementation help”",
      description:
        "Local Agent received “Prefers concise implementation help” with stated purpose “Software_Development”."
    });
  });

  it("does not expose job constants in audit summaries", () => {
    const jobAuditEvent: AuditEvent = {
      ...baseAuditEvent,
      id: "audit_job_1",
      type: "JOB_COMPLETED",
      actorType: "JOB",
      actorId: null,
      clientId: null,
      clientName: null,
      memoryRequestId: null,
      metadata: {},
      subjects: [
        {
          type: "JOB_RUN",
          id: "job_1",
          role: "JOB",
          label: "CONSOLIDATE_MEMORIES",
          metadata: {}
        }
      ]
    };

    const jobSubject = jobAuditEvent.subjects[0];

    if (!jobSubject) {
      throw new Error("Expected job subject");
    }
    expect(subjectDisplayLabel(jobSubject)).toBe("Consolidate memories");
    expect(auditEventSummary(jobAuditEvent)).toMatchObject({
      actor: "Job runner",
      affected: "Consolidate memories job",
      description: "Job runner completed the Consolidate memories job."
    });
  });

  it("names the memory a job ran against", () => {
    const jobAuditEvent: AuditEvent = {
      ...baseAuditEvent,
      type: "JOB_COMPLETED",
      actorType: "JOB",
      clientId: null,
      clientName: null,
      metadata: {},
      subjects: [
        {
          type: "JOB_RUN",
          id: "job_1",
          role: "JOB",
          label: "GENERATE_EMBEDDING",
          metadata: {}
        },
        {
          type: "MEMORY",
          id: "memory_123456789",
          role: "TARGET",
          label: "Privacy should be visible",
          metadata: {}
        }
      ]
    };

    expect(auditEventSummary(jobAuditEvent).description).toBe(
      "Job runner completed the Generate embedding job for “Privacy should be visible”."
    );
  });

  it("pluralizes counts", () => {
    expect(pluralize(1, "client")).toBe("1 client");
    expect(pluralize(2, "client")).toBe("2 clients");
    expect(pluralize(1, "memory", "memories")).toBe("1 memory");
    expect(pluralize(0, "memory", "memories")).toBe("0 memories");
  });

  it("summarizes policies in plain language", () => {
    expect(policySummary(basePolicy)).toBe(
      "Local Agent can read memories up to Internal sensitivity from 1 allowed category. " +
        "Each matching request needs your confirmation. " +
        `Permissions expire on ${new Date("2026-12-31T00:00:00.000Z").toLocaleDateString()}.`
    );
  });

  it("summarizes client access and sensitivity mix as prose", () => {
    const client: Client = {
      id: "client_1",
      name: "Local Agent",
      type: "MCP_CLIENT",
      trustLevel: "APPROVED",
      declaredRetention: "SESSION",
      hasToken: true,
      hasPolicy: true,
      oauthConnector: false,
      lastUsedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };

    expect(clientAccessSummary(client, basePolicy)).toBe(
      "Approved · MCP client · not used yet · permissions up to Internal, 1 category, confirmation required"
    );
    expect(
      sensitivityMixSummary([
        { sensitivity: "PUBLIC", count: 2 },
        { sensitivity: "SECRET", count: 1 },
        { sensitivity: "LOW", count: 0 }
      ])
    ).toBe("2 public · 1 secret");
  });
});
