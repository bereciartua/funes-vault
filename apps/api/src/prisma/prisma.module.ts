import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";

/** Registers one process-wide PrismaService for database connection lifecycle and transactions. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
