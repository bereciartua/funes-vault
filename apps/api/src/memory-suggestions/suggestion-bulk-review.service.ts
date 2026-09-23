import { MemorySuggestionStatus } from "@funes-vault/db";
import { type BulkReviewMemorySuggestionsRequest } from "@funes-vault/shared";
import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";

import { CategoriesService } from "../memories/categories.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SuggestionReviewService } from "./suggestion-review.service.js";

/**
 * Processes a bounded set of owner suggestion decisions through the individual review service.
 * Returns per-item outcomes so a failed decision does not conceal successful reviews.
 */
@Injectable()
export class SuggestionBulkReviewService {
  private readonly logger = new Logger(SuggestionBulkReviewService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly review: SuggestionReviewService
  ) {}

  async bulkReviewUserSuggestions(
    userId: string,
    input: BulkReviewMemorySuggestionsRequest
  ) {
    const ids = [...new Set(input.ids)];
    const suggestions = await this.prisma.client.memorySuggestion.findMany({
      where: { id: { in: ids }, userId }
    });
    const suggestionsById = new Map(
      suggestions.map((suggestion) => [suggestion.id, suggestion])
    );
    const results = [];

    if (input.action === "apply") {
      const categoryKeys = suggestions
        .filter(
          (suggestion) =>
            suggestion.status === MemorySuggestionStatus.QUEUED_FOR_REVIEW
        )
        .flatMap((suggestion) => suggestion.suggestedCategories);

      try {
        await this.categories.assertExist(categoryKeys);
      } catch (error) {
        for (const id of ids) {
          results.push({
            id,
            status: "failed",
            error: this.reviewErrorMessage(error, id)
          });
        }

        return {
          action: input.action,
          requested: ids.length,
          succeeded: 0,
          failed: ids.length,
          results
        };
      }
    }

    for (const id of ids) {
      try {
        const suggestion = suggestionsById.get(id);

        if (!suggestion) {
          throw new NotFoundException("Memory suggestion not found");
        }

        if (suggestion.status !== MemorySuggestionStatus.QUEUED_FOR_REVIEW) {
          throw new ConflictException("Memory suggestion is not reviewable");
        }

        if (input.action === "apply") {
          const result = await this.review.applyLoadedUserSuggestion(
            userId,
            suggestion
          );

          results.push({
            id,
            status: "applied",
            suggestion: result.suggestion,
            memory: result.memory
          });
        } else {
          const result = await this.review.rejectLoadedUserSuggestion(
            userId,
            suggestion
          );

          results.push({
            id,
            status: "rejected",
            suggestion: result.suggestion
          });
        }
      } catch (error) {
        results.push({
          id,
          status: "failed",
          error: this.reviewErrorMessage(error, id)
        });
      }
    }

    const failed = results.filter(
      (result) => result.status === "failed"
    ).length;

    return {
      action: input.action,
      requested: ids.length,
      succeeded: ids.length - failed,
      failed,
      results
    };
  }

  reviewErrorMessage(error: unknown, suggestionId: string) {
    if (error instanceof HttpException && error.message.length > 0) {
      return error.message;
    }

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(
      `Bulk memory suggestion review failed for ${suggestionId}: ${message}`,
      stack
    );

    return "Could not review this suggestion.";
  }
}
