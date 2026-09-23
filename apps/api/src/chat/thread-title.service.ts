import { openai } from "@ai-sdk/openai";
import { Injectable, Logger } from "@nestjs/common";
import { generateText } from "ai";

import { apiEnv } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { clip, safeErrorMessage } from "./chat.utils.js";
const CHAT_THREAD_TITLE_MAX_LENGTH = 80;
const CHAT_THREAD_TITLE_MAX_AUTO_MESSAGES = 4;
/**
 * Generates a short title from the supplied conversation and updates an unlocked thread for the
 * supplied owner. The caller owns conversation selection. Title generation writes no audit
 * events.
 */
@Injectable()
export class ThreadTitleService {
  private readonly logger = new Logger(ThreadTitleService.name);
  private readonly model = apiEnv().OPENAI_CHAT_MODEL;
  constructor(private readonly prisma: PrismaService) {}
  async maybeUpdateAutomaticThreadTitle(input: {
    userId: string;
    sessionId: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }) {
    const session = await this.prisma.client.chatSession.findFirst({
      where: {
        id: input.sessionId,
        userId: input.userId,
        titleLocked: false
      },
      select: {
        title: true,
        _count: {
          select: {
            messages: true
          }
        }
      }
    });

    if (!session) {
      return null;
    }

    if (session._count.messages > CHAT_THREAD_TITLE_MAX_AUTO_MESSAGES) {
      return null;
    }

    const title = await this.generateThreadTitle(input.messages);

    if (!title) {
      return null;
    }

    const result = await this.prisma.client.chatSession.updateMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
        titleLocked: false
      },
      data: {
        title
      }
    });

    return result.count > 0 ? title : null;
  }

  async generateThreadTitle(
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ) {
    try {
      const transcript = messages
        .slice(0, 6)
        .map(
          (message) =>
            `${message.role === "user" ? "User" : "Assistant"}: ${clip(
              message.content.replace(/\s+/gu, " ").trim(),
              500
            )}`
        )
        .join("\n");

      if (!transcript) {
        return null;
      }

      const result = await generateText({
        model: openai(this.model),
        abortSignal: AbortSignal.timeout(apiEnv().OPENAI_TIMEOUT_MS),
        system:
          "Generate a concise, human-readable title for this chat thread. Return only the title, with no quotes, labels, punctuation-only output, or summary paragraph.",
        messages: [
          {
            role: "user",
            content: `Conversation:\n${transcript}`
          }
        ]
      });
      const text = typeof result.text === "string" ? result.text : "";
      const normalized = text
        .replace(/["'`]/gu, "")
        .replace(/\s+/gu, " ")
        .trim();

      return normalized ? clip(normalized, CHAT_THREAD_TITLE_MAX_LENGTH) : null;
    } catch (error) {
      this.logger.warn(
        `OpenAI chat title generation failed: ${safeErrorMessage(error)}`
      );

      return null;
    }
  }
}
