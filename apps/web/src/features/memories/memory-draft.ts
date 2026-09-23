import { type Memory } from "@funes-vault/shared";

import { toDateInputValue } from "../../lib/dates";
export type Draft = {
  title: string;
  body: string;
  kind: Memory["kind"];
  sensitivity: Memory["sensitivity"];
  confidence: string;
  status: Memory["status"];
  reviewState: Memory["reviewState"];
  categoryKeys: string[];
  expiresAt: string;
  sourceType: Memory["source"]["type"];
  sourceUri: string;
};
export type MemoryEditorMode = "closed" | "create" | "edit";
export const emptyDraft: Draft = {
  title: "",
  body: "",
  kind: "PREFERENCE",
  sensitivity: "LOW",
  confidence: "1",
  status: "ACTIVE",
  reviewState: "APPROVED",
  categoryKeys: [],
  expiresAt: "",
  sourceType: "MANUAL",
  sourceUri: ""
};
export function toDraft(memory: Memory): Draft {
  return {
    title: memory.title,
    body: memory.body,
    kind: memory.kind,
    sensitivity: memory.sensitivity,
    confidence: String(memory.confidence),
    status: memory.status,
    reviewState: memory.reviewState,
    categoryKeys: memory.categoryKeys,
    expiresAt: toDateInputValue(memory.expiresAt),
    sourceType: memory.source.type,
    sourceUri: memory.source.uri ?? ""
  };
}
export function confidenceToPercent(confidence: string) {
  const parsed = Number(confidence);

  if (!Number.isFinite(parsed)) {
    return "";
  }

  return String(Math.round(Math.min(Math.max(parsed, 0), 1) * 100));
}
export function percentToConfidence(percent: string) {
  const parsed = Number(percent);

  if (!Number.isFinite(parsed)) {
    return "1";
  }

  return String(Math.min(Math.max(parsed, 0), 100) / 100);
}
