import type { PrismaClient } from "@funes-vault/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { GoogleProvider } from "../src/auth/google.provider.js";
import { createSessionToken, hashSessionToken } from "../src/auth/session.js";
import {
  EMBEDDINGS_PROVIDER,
  type EmbeddingsProvider
} from "../src/embeddings/embeddings.provider.js";
import { toVectorLiteral } from "../src/embeddings/embeddings.service.js";
import { FakeGoogleProvider } from "./fake-google.js";
import {
  createTestPrismaClient,
  getTestDatabaseUrl
} from "./prisma-test-harness.js";

export { resetTestDatabase } from "./prisma-test-harness.js";

// The e2e app runs against the dedicated test database. Workers stay off,
// and Redis is only wired in when a suite opts in via E2E_REDIS_URL, so
// local runs never touch the development queues.
function prepareE2eEnvironment(options: { redis?: boolean } = {}) {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.JOB_WORKER_ENABLED = "false";
  // Plain JSON logging: the pino-pretty transport spawns worker threads,
  // which vitest teardown does not appreciate.
  process.env.LOG_FORMAT = "json";
  delete process.env.BULL_BOARD_ENABLED;

  if (options.redis && process.env.E2E_REDIS_URL) {
    process.env.REDIS_URL = process.env.E2E_REDIS_URL;
  } else {
    delete process.env.REDIS_URL;
  }
}

const fakeEmbeddingDimensions = 1536;

// Deterministic unit vectors: axis 0 for anything mentioning "typescript",
// axis 1 otherwise. Enough to exercise the pgvector similarity SQL with
// predictable ordering.
export function fakeVector(axis: 0 | 1) {
  const vector = new Array<number>(fakeEmbeddingDimensions).fill(0);
  vector[axis] = 1;

  return vector;
}

const fakeEmbeddingsProvider: EmbeddingsProvider = {
  provider: "fake",
  model: "fake-embedding",
  generate: (input: string) =>
    Promise.resolve({
      provider: "fake",
      model: "fake-embedding",
      vector: fakeVector(input.toLowerCase().includes("typescript") ? 0 : 1),
      metadata: {}
    })
};

export async function createE2eApp(
  options: { redis?: boolean; bullBoard?: boolean } = {}
): Promise<INestApplication> {
  prepareE2eEnvironment(options);

  if (options.bullBoard) {
    process.env.BULL_BOARD_ENABLED = "true";
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(GoogleProvider)
    .useClass(FakeGoogleProvider)
    .overrideProvider(EMBEDDINGS_PROVIDER)
    .useValue(fakeEmbeddingsProvider)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return app;
}

export function createE2ePrismaClient(): PrismaClient {
  return createTestPrismaClient();
}

// Seeds a user and session directly, without an HTTP login bypass so
// suites do not burn the strict auth-route rate budget on setup.
export async function createUserWithSession(
  prisma: PrismaClient,
  email: string
) {
  const user = await prisma.user.create({
    data: {
      email,
      displayName: email.split("@")[0] ?? email,
      googleIdentity: { create: { subject: `test-${email}` } }
    }
  });
  const token = createSessionToken();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });

  return {
    userId: user.id,
    email,
    sessionId: session.id,
    cookie: `funes_vault_session=${token}`
  };
}

export async function insertEmbedding(
  prisma: PrismaClient,
  input: { userId: string; memoryId: string; vector: number[] }
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Embedding" ("id", "userId", "memoryId", "provider", "model", "contentHash", "vector", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW(), NOW())`,
    `emb_${input.memoryId}`,
    input.userId,
    input.memoryId,
    fakeEmbeddingsProvider.provider,
    fakeEmbeddingsProvider.model,
    `hash_${input.memoryId}`,
    toVectorLiteral(input.vector)
  );
}
