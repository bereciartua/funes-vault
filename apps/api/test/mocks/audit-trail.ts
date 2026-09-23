import { vi } from "vitest";

import {
  auditMemorySubject,
  memorySubject
} from "../../src/audit-trail/audit-subjects.js";
export function mockAuditTrail() {
  return {
    createAuditEvent: vi.fn().mockResolvedValue({ id: "audit_1" }),
    createMemoryProvenanceEntry: vi.fn().mockResolvedValue({ id: "prov_1" }),
    getSubjectsForSuggestions: vi.fn().mockResolvedValue(new Map()),
    getMemoryProvenance: vi.fn(),
    memorySubject: vi.fn(memorySubject),
    auditMemorySubject: vi.fn(auditMemorySubject)
  };
}
