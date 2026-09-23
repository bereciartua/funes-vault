import { CategoriesService } from "../memories/categories.service.js";
import { ArchiveSuggestionApplier } from "./archive-suggestion-applier.js";
import { SuggestionBulkReviewService } from "./suggestion-bulk-review.service.js";
import { SuggestionIntakeService } from "./suggestion-intake.service.js";
import { SuggestionReviewService } from "./suggestion-review.service.js";
import { SuggestionWriterService } from "./suggestion-writer.service.js";

export const suggestionProviders = [
  SuggestionIntakeService,
  SuggestionWriterService,
  SuggestionReviewService,
  SuggestionBulkReviewService,
  CategoriesService,
  ArchiveSuggestionApplier
];
