import { Module } from "@nestjs/common";

import { FirstPartyAccessModule } from "../first-party-access/first-party-access.module.js";
import { MemoriesModule } from "../memories/memories.module.js";
import { MemoryProcessingModule } from "../memory-processing/memory-processing.module.js";
import { MemoryRequestsModule } from "../memory-requests/memory-requests.module.js";
import { MemorySuggestionsModule } from "../memory-suggestions/memory-suggestions.module.js";
import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";
import { ChatGenerationService } from "./chat-generation.service.js";
import { ChatMemoryToolsService } from "./chat-memory-tools.service.js";
import { ChatThreadsService } from "./chat-threads.service.js";
import { GuidedInterviewService } from "./guided-interview.service.js";
import { ThreadTitleService } from "./thread-title.service.js";

/** Connects persisted chat threads and model generation to policy-controlled memory tools and extraction. */
@Module({
  imports: [
    MemoryProcessingModule,
    FirstPartyAccessModule,

    MemoryRequestsModule,
    MemorySuggestionsModule,
    MemoriesModule
  ],
  controllers: [ChatController],
  exports: [ChatService, ChatMemoryToolsService],
  providers: [
    GuidedInterviewService,
    ChatThreadsService,
    ThreadTitleService,
    ChatGenerationService,
    ChatMemoryToolsService,
    ChatService
  ]
})
export class ChatModule {}
