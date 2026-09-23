import { MemoryStatus, type Prisma } from "@funes-vault/db";
import { type UpdateMemoryRequest } from "@funes-vault/shared";

import { toDateOrNull, toJson } from "../common/serialization.js";
import { memoryContentFields, memorySourceFields } from "./memory-fields.js";
export function toCategoryConnect(categoryKeys: string[]) {
  return {
    connect: [...new Set(categoryKeys)].map((key) => ({ key }))
  };
}

export function toUpdateData(request: UpdateMemoryRequest) {
  const data: Prisma.MemoryUpdateInput = {};

  if (request.kind !== undefined) {
    data.kind = request.kind;
  }
  if (request.title !== undefined) {
    data.title = request.title;
  }
  if (request.body !== undefined) {
    data.body = request.body;
  }
  if (request.sensitivity !== undefined) {
    data.sensitivity = request.sensitivity;
  }
  if (request.confidence !== undefined) {
    data.confidence = request.confidence;
  }
  if (request.status !== undefined) {
    data.status = request.status;
  }
  if (request.reviewState !== undefined) {
    data.reviewState = request.reviewState;
  }
  if (request.sourceType !== undefined) {
    data.sourceType = request.sourceType;
  }
  if (request.sourceUri !== undefined) {
    data.sourceUri = request.sourceUri;
  }
  if (request.sourceMetadata !== undefined) {
    data.sourceMetadata = toJson(request.sourceMetadata);
  }
  if (request.expiresAt !== undefined) {
    data.expiresAt = toDateOrNull(request.expiresAt);
  }
  if (request.categoryKeys !== undefined) {
    data.categories = {
      set: [...new Set(request.categoryKeys)].map((key) => ({ key }))
    };
  }
  if (isConsolidationRelevantUpdate(request)) {
    data.consolidationRelevantAt = new Date();
  }

  return data;
}

function isConsolidationRelevantUpdate(request: UpdateMemoryRequest) {
  if (request.status === MemoryStatus.ACTIVE) {
    return true;
  }

  return [
    ...memoryContentFields,
    ...memorySourceFields,
    "reviewState" as const
  ].some((field) => request[field] !== undefined);
}
