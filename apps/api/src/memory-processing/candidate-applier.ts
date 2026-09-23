import { MemorySuggestionStatus } from "@funes-vault/db";
import { MemoryStatus, Prisma } from "@funes-vault/db";
import {
  createMemorySuggestionRequestSchema,
  memoryProcessingOutcomeSchema
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { toJson } from "../common/serialization.js";
import { parseRequest } from "../common/zod.js";
import {
  voicePurpose,
  webChatPurpose
} from "../first-party-access/first-party-access.service.js";
import { SuggestionIntakeService } from "../memory-suggestions/suggestion-intake.service.js";
import { SuggestionWriterService } from "../memory-suggestions/suggestion-writer.service.js";
import { type Candidate } from "./contracts.js";
import { extractionConfidence } from "./extraction.constants.js";
import { type ProcessingConfiguration } from "./memory-processing-config.service.js";

/**
 * Validates provider candidates through the public suggestion contract before calling intake in
 * the existing transaction. Source/candidate receipts prevent duplicate application; only
 * committed memories are queued for embedding.
 */
@Injectable()
export class CandidateApplier {
  constructor(
    private readonly suggestionIntakeService: SuggestionIntakeService,
    private readonly suggestionWriterService: SuggestionWriterService
  ) {}

  async applyCandidate(
    tx: Prisma.TransactionClient,
    userId: string,
    runId: string,
    sourceMessageId: string,
    clientId: string,
    channel: "chat" | "voice",
    candidate: Candidate,
    configuration: ProcessingConfiguration
  ) {
    const existing = await tx.memoryCandidateApplication.findUnique({
      where: { runId_candidateId: { runId, candidateId: candidate.id } }
    });
    if (existing) {
      return memoryProcessingOutcomeSchema.parse(existing.result);
    }
    const memory = await tx.memory.findFirst({
      where: {
        userId,
        status: MemoryStatus.ACTIVE,
        body: { equals: candidate.body, mode: "insensitive" },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      }
    });
    const suggestion = memory
      ? null
      : await tx.memorySuggestion.findFirst({
          where: {
            userId,
            status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
            body: { equals: candidate.body, mode: "insensitive" }
          }
        });
    const response =
      memory || suggestion
        ? {
            status: "deduplicated",
            memoryId: memory?.id ?? null,
            suggestionId: suggestion?.id ?? null
          }
        : await this.suggestionIntakeService.createSuggestion({
            userId,
            clientId,
            transaction: tx,
            reviewOnly: configuration.extraction.writeMode === "review",
            body: parseRequest(createMemorySuggestionRequestSchema, {
              ...candidate,
              purpose: channel === "voice" ? voicePurpose : webChatPurpose,
              confidence: extractionConfidence,
              evidence: candidate.evidence.map((e) => e.quote).join("\n"),
              sourceMetadata: {
                runId,
                candidateId: candidate.id,
                sourceMessageId,
                evidence: candidate.evidence,
                fingerprint: configuration.fingerprint,
                model: configuration.extraction.model,
                rubric: configuration.rubric,
                processors: configuration.extraction.processors
              }
            })
          });
    const result = {
      candidateId: candidate.id,
      title: candidate.title,
      categoryKeys: candidate.categoryKeys,
      sensitivity: candidate.sensitivity,
      ...response
    };
    await tx.memoryCandidateApplication.create({
      data: { runId, candidateId: candidate.id, result: toJson(result) }
    });

    return result;
  }

  async enqueueApplied(userId: string, outcomes: Record<string, unknown>[]) {
    for (const outcome of outcomes) {
      if (
        outcome.status === MemorySuggestionStatus.APPLIED &&
        typeof outcome.memoryId === "string"
      ) {
        await this.suggestionWriterService.enqueueEmbeddingGeneration(
          userId,
          outcome.memoryId
        );
      }
    }
  }
}
