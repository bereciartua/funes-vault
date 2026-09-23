import { Module } from "@nestjs/common";

import { ChatModule } from "../chat/chat.module.js";
import { FirstPartyAccessModule } from "../first-party-access/first-party-access.module.js";
import { MemoryProcessingModule } from "../memory-processing/memory-processing.module.js";
import { RealtimeClientService } from "./realtime-client.service.js";
import { VoiceSessionsController } from "./voice-sessions.controller.js";
import { VoiceSessionsService } from "./voice-sessions.service.js";

/** Owner-authenticated voice sessions; ephemeral provider tokens and policy-gated tools. */
@Module({
  imports: [ChatModule, FirstPartyAccessModule, MemoryProcessingModule],
  controllers: [VoiceSessionsController],
  providers: [VoiceSessionsService, RealtimeClientService]
})
export class VoiceModule {}
