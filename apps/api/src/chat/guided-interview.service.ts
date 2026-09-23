import {
  createMemorySuggestionRequestSchema,
  type CreateOnboardingSuggestions
} from "@funes-vault/shared";
import { BadRequestException, Injectable } from "@nestjs/common";

import { parseRequest } from "../common/zod.js";
import { SuggestionIntakeService } from "../memory-suggestions/suggestion-intake.service.js";
import {
  guidedOnboardingPurpose,
  guidedSuggestionConfidence
} from "./chat.constants.js";
import { guidedInterviewQuestions } from "./guided-interview.js";
/**
 * Returns guided questions and converts answers into validated owner suggestions. Suggestion
 * intake owns persistence, policy checks and audit writes; this service has no thread queries or
 * direct audit writes.
 */
@Injectable()
export class GuidedInterviewService {
  constructor(
    private readonly suggestionIntakeService: SuggestionIntakeService
  ) {}

  listGuidedQuestions() {
    return {
      items: guidedInterviewQuestions.map((question) => ({
        id: question.id,
        category: question.category,
        prompt: question.prompt,
        categoryKeys: question.categoryKeys,
        suggestedKind: question.suggestedKind,
        suggestedSensitivity: question.suggestedSensitivity
      }))
    };
  }

  async createOnboardingSuggestions(input: {
    userId: string;
    body: CreateOnboardingSuggestions;
  }) {
    const request = input.body;
    const questionsById = new Map(
      guidedInterviewQuestions.map((question) => [question.id, question])
    );
    const suggestions = [];

    for (const answer of request.answers) {
      if (!questionsById.has(answer.questionId)) {
        throw new BadRequestException("Unknown guided question");
      }
    }

    for (const answer of request.answers) {
      const question = questionsById.get(answer.questionId);
      if (!question) {
        throw new BadRequestException("Unknown guided question");
      }

      const response = await this.suggestionIntakeService.createUserSuggestion({
        userId: input.userId,
        body: parseRequest(createMemorySuggestionRequestSchema, {
          purpose: guidedOnboardingPurpose,
          kind: question.suggestedKind,
          title: question.title,
          body: answer.answer,
          categoryKeys: question.categoryKeys,
          sensitivity: question.suggestedSensitivity,
          evidence: question.prompt,
          confidence: guidedSuggestionConfidence,
          sourceMetadata: {
            questionId: question.id,
            category: question.category
          }
        })
      });
      suggestions.push(response.suggestion);
    }

    return { suggestions };
  }
}
