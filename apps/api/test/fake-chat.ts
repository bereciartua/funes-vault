import type { INestApplication } from "@nestjs/common";

import { ChatGenerationService } from "../src/chat/chat-generation.service.js";
import { ExtractionRunService } from "../src/memory-processing/extraction-run.service.js";

/** Browser tests keep real owner/thread persistence and replace only provider work. */
export function installFakeChat(app: INestApplication) {
  const generation = app.get(ChatGenerationService);
  generation.disclosure = () => ({
    provider: "synthetic",
    model: "browser-test",
    usesThirdParty: false,
    disclosure: "Synthetic browser test provider."
  });
  app.get(ExtractionRunService).process = async () => ({
    status: "skipped",
    reason: "browser_test"
  });
  generation.writeStreamedAnswer = async (input) => {
    const message = await input.persistAssistantTurn({
      userId: input.userId,
      sessionId: input.sessionId,
      content: "Synthetic answer",
      citations: [],
      suggestedMemoryIds: [],
      provider: input.provider
    });
    input.writer.write({ type: "start", messageId: message.id });
    input.writer.write({
      type: "data-thread-state",
      data: {
        sessionId: input.sessionId,
        title: input.title,
        titleLocked: input.titleLocked,
        persisted: true
      }
    });
    input.writer.write({ type: "text-start", id: message.id });
    input.writer.write({
      type: "text-delta",
      id: message.id,
      delta: message.content
    });
    input.writer.write({ type: "text-end", id: message.id });
    input.writer.write({ type: "finish" });
  };
}
