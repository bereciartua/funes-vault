import {
  type ListChatThreadsQuery,
  type RenameChatThreadRequest
} from "@funes-vault/shared";
import { Injectable, NotFoundException } from "@nestjs/common";

import { buildPagination, paginationSkip } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { chatThreadMessageLimit } from "./chat.constants.js";
import { toChatEntry, toThreadSummary } from "./chat.mapper.js";
/**
 * Owns thread lists, history, creation, and renaming.
 * Tenant boundary: all thread and message queries are scoped to userId.
 * Audit: thread metadata only; memory disclosure and mutation are audited by their owners.
 */
@Injectable()
export class ChatThreadsService {
  constructor(private readonly prisma: PrismaService) {}
  async getCurrentSession(input: { userId: string }) {
    const session = await this.prisma.client.chatSession.findFirst({
      where: { userId: input.userId, messages: { some: {} } },
      orderBy: { updatedAt: "desc" }
    });

    if (!session) {
      return {
        sessionId: null,
        title: null,
        titleLocked: false,
        messages: []
      };
    }

    const messages = await this.prisma.client.chatMessage.findMany({
      where: { userId: input.userId, sessionId: session.id },
      orderBy: { createdAt: "asc" },
      take: chatThreadMessageLimit
    });

    return {
      sessionId: session.id,
      title: session.title,
      titleLocked: session.titleLocked,
      messages: messages.map((message) => toChatEntry(message))
    };
  }

  async startThread(input: { userId: string }) {
    const session = await this.prisma.client.chatSession.create({
      data: {
        userId: input.userId,
        title: null
      }
    });

    return {
      sessionId: session.id,
      title: session.title,
      titleLocked: session.titleLocked,
      messages: []
    };
  }

  async listThreads(input: { userId: string; query: ListChatThreadsQuery }) {
    const query = input.query;
    const where = {
      userId: input.userId,
      messages: { some: {} }
    };
    const total = await this.prisma.client.chatSession.count({ where });
    const pagination = buildPagination(query, total);
    const items =
      total === 0
        ? []
        : await this.prisma.client.chatSession.findMany({
            where,
            include: {
              _count: {
                select: {
                  messages: true
                }
              },
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  content: true
                }
              }
            },
            orderBy: { updatedAt: "desc" },
            skip: paginationSkip(pagination),
            take: pagination.limit
          });

    return {
      items: items.map((thread) => toThreadSummary(thread)),
      pagination
    };
  }

  async getThread(input: { userId: string; sessionId: string }) {
    const session = await this.prisma.client.chatSession.findFirst({
      where: { id: input.sessionId, userId: input.userId }
    });

    if (!session) {
      throw new NotFoundException("Thread not found");
    }

    const messages = await this.prisma.client.chatMessage.findMany({
      where: { userId: input.userId, sessionId: session.id },
      orderBy: { createdAt: "asc" },
      take: chatThreadMessageLimit
    });

    return {
      sessionId: session.id,
      title: session.title,
      titleLocked: session.titleLocked,
      messages: messages.map((message) => toChatEntry(message))
    };
  }

  async renameThread(input: {
    userId: string;
    sessionId: string;
    body: RenameChatThreadRequest;
  }) {
    const request = input.body;
    const result = await this.prisma.client.chatSession.updateMany({
      where: { id: input.sessionId, userId: input.userId },
      data: {
        title: request.title,
        titleLocked: true
      }
    });

    if (result.count === 0) {
      throw new NotFoundException("Thread not found");
    }

    const updated = await this.prisma.client.chatSession.findFirst({
      where: { id: input.sessionId, userId: input.userId },
      include: {
        _count: {
          select: {
            messages: true
          }
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            content: true
          }
        }
      }
    });

    if (!updated) {
      throw new NotFoundException("Thread not found");
    }

    return toThreadSummary(updated);
  }
}
