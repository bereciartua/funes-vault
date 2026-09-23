import { createPrismaClient } from "@funes-vault/db";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

/**
 * Owns Prisma connection startup and shutdown.
 * Tenant boundary: callers must supply userId for user-owned records.
 * Audit: connection lifecycle only; domain services own audits and transactions.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client = createPrismaClient();

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
