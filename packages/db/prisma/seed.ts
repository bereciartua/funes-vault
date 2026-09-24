import {
  defaultMemoryCategories as categories,
  demoAccountEmail
} from "@funes-vault/shared/domain";
import { hashToken } from "@funes-vault/shared/tokens";
import { config as loadEnv } from "dotenv";

import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  ClientRetention,
  ClientTrustLevel,
  ClientType,
  createPrismaClient,
  MemoryKind,
  MemoryProvenanceEntryType,
  MemoryRequestStatus,
  MemorySensitivity,
  MemorySuggestionStatus,
  PolicyOperation,
  ProvenanceSubjectRole,
  ProvenanceSubjectType,
  SourceType
} from "../src/index.js";

loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });
const prisma = createPrismaClient();

import type {
  Client,
  Memory,
  MemoryRequest,
  MemorySuggestion,
  Policy,
  User
} from "../src/index.js";

async function seedDemoUser(email: string, displayName: string) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      displayName
    },
    create: {
      email,
      displayName
    }
  });

  await prisma.auditEvent.deleteMany({ where: { userId: user.id } });
  await prisma.session.deleteMany({
    where: { userId: user.id }
  });
  await prisma.jobRun.deleteMany({ where: { userId: user.id } });
  await prisma.memorySuggestion.deleteMany({ where: { userId: user.id } });
  await prisma.memoryRequest.deleteMany({ where: { userId: user.id } });
  await prisma.policy.deleteMany({ where: { userId: user.id } });
  await prisma.embedding.deleteMany({ where: { userId: user.id } });
  await prisma.memory.deleteMany({ where: { userId: user.id } });
  await prisma.client.deleteMany({ where: { userId: user.id } });

  await prisma.chatSession.deleteMany({ where: { userId: user.id } });
  await prisma.processingConsent.deleteMany({ where: { userId: user.id } });

  return user;
}

async function seedCategories() {
  await Promise.all(
    categories.map((category) =>
      prisma.memoryCategory.upsert({
        where: { key: category.key },
        update: {
          name: category.name,
          description: category.description
        },
        create: category
      })
    )
  );
}

async function seedClientAndPolicy(user: User) {
  const client = await prisma.client.create({
    data: {
      userId: user.id,
      name: "Local Coding Agent",
      type: ClientType.MCP_CLIENT,
      trustLevel: ClientTrustLevel.APPROVED,
      declaredRetention: ClientRetention.NO_STORAGE,
      tokenHash: hashToken("fvlt_seed_demo_token")
    }
  });

  const policy = await prisma.policy.create({
    data: {
      userId: user.id,
      clientId: client.id,

      maxSensitivity: MemorySensitivity.INTERNAL,
      operations: [PolicyOperation.READ, PolicyOperation.SUGGEST],
      requiresConfirmation: false,
      allowedCategories: {
        connect: [
          { key: "communication_style" },
          { key: "software_development" },
          { key: "project_context" }
        ]
      },
      deniedCategories: {
        connect: [{ key: "health" }, { key: "finance" }, { key: "legal" }]
      }
    }
  });

  return { client, policy };
}

async function seedMemories(user: User) {
  const communicationMemory = await prisma.memory.create({
    data: {
      userId: user.id,
      kind: MemoryKind.PREFERENCE,
      title: "Prefers concise implementation help",
      body: "The user prefers concise technical answers and likes implementation when intent is clear.",
      sensitivity: MemorySensitivity.LOW,
      sourceType: SourceType.MANUAL,
      categories: {
        connect: [
          { key: "communication_style" },
          { key: "software_development" }
        ]
      }
    }
  });

  const stackMemory = await prisma.memory.create({
    data: {
      userId: user.id,
      kind: MemoryKind.PREFERENCE,
      title: "Uses a TypeScript-first stack for Funes Vault",
      body: "Funes Vault is planned around NestJS, Next.js, Prisma, Postgres, MCP, OpenAI embeddings, and the Vercel AI SDK.",
      sensitivity: MemorySensitivity.INTERNAL,
      sourceType: SourceType.MANUAL,
      categories: {
        connect: [{ key: "software_development" }, { key: "project_context" }]
      }
    }
  });

  const privacyMemory = await prisma.memory.create({
    data: {
      userId: user.id,
      kind: MemoryKind.INSTRUCTION,
      title: "Privacy should be visible",
      body: "Privacy behavior should be explicit, inspectable, revocable, and present in normal product flows.",
      sensitivity: MemorySensitivity.INTERNAL,
      sourceType: SourceType.MANUAL,
      categories: {
        connect: [{ key: "privacy_preferences" }, { key: "project_context" }]
      }
    }
  });

  return { communicationMemory, stackMemory, privacyMemory };
}

async function seedReviewItems(
  user: User,
  client: Client,
  communicationMemory: Memory
) {
  const memoryRequest = await prisma.memoryRequest.create({
    data: {
      userId: user.id,
      clientId: client.id,
      statedPurpose: "Help with software development",
      task: "Help the user work on the Funes Vault repository.",
      status: MemoryRequestStatus.FULFILLED,
      requestedCategories: ["communication_style", "software_development"],
      retention: ClientRetention.NO_STORAGE,
      fulfilledAt: new Date(),
      items: {
        create: [
          {
            memoryId: communicationMemory.id,
            text: communicationMemory.body,
            categoryKey: "communication_style",
            sensitivity: communicationMemory.sensitivity,
            relevanceScore: 0.92
          }
        ]
      }
    }
  });

  const seedSuggestion = await prisma.memorySuggestion.create({
    data: {
      userId: user.id,
      sourceType: SourceType.CHAT,
      sourceClientId: client.id,
      title: "Prefers local-first privacy-sensitive tools",
      body: "The user tends to prefer local-first architecture when privacy-sensitive memory is involved.",
      suggestedKind: MemoryKind.PREFERENCE,
      suggestedSensitivity: MemorySensitivity.LOW,
      suggestedCategories: ["privacy_preferences"],
      evidence: "Seeded example suggestion for the review inbox.",
      confidence: 0.74,
      status: MemorySuggestionStatus.QUEUED_FOR_REVIEW
    }
  });

  return { memoryRequest, seedSuggestion };
}

async function seedAuditTrail(input: {
  user: User;
  client: Client;
  policy: Policy;
  communicationMemory: Memory;
  stackMemory: Memory;
  privacyMemory: Memory;
  memoryRequest: MemoryRequest;
  seedSuggestion: MemorySuggestion;
}) {
  const {
    user,
    client,
    policy,
    communicationMemory,
    stackMemory,
    privacyMemory,
    memoryRequest,
    seedSuggestion
  } = input;
  for (const memory of [communicationMemory, stackMemory, privacyMemory]) {
    const entry = await prisma.memoryProvenanceEntry.create({
      data: {
        userId: user.id,
        memoryId: memory.id,
        type: MemoryProvenanceEntryType.CREATED,
        actorType: AuditActorType.SYSTEM,
        sourceType: memory.sourceType,
        sourceClientId: memory.sourceClientId,
        sourceUri: memory.sourceUri,
        metadata: { seed: true }
      }
    });

    await prisma.memoryProvenanceSubject.create({
      data: {
        userId: user.id,
        provenanceEntryId: entry.id,
        subjectType: ProvenanceSubjectType.MEMORY,
        subjectId: memory.id,
        role: ProvenanceSubjectRole.TARGET,
        labelSnapshot: memory.title,
        metadata: { seed: true }
      }
    });
  }

  const clientAuditEvent = await prisma.auditEvent.create({
    data: {
      userId: user.id,
      clientId: client.id,
      type: AuditEventType.CLIENT_CREATED,
      actorType: AuditActorType.SYSTEM,
      metadata: { seed: true, clientId: client.id, clientName: client.name }
    }
  });
  const policyAuditEvent = await prisma.auditEvent.create({
    data: {
      userId: user.id,
      clientId: client.id,
      type: AuditEventType.POLICY_CREATED,
      actorType: AuditActorType.SYSTEM,
      metadata: {
        seed: true,
        policyId: policy.id,
        purpose: `${client.name} permissions`
      }
    }
  });
  const suggestionAuditEvent = await prisma.auditEvent.create({
    data: {
      userId: user.id,
      clientId: client.id,
      type: AuditEventType.MEMORY_SUGGESTION_CREATED,
      actorType: AuditActorType.SYSTEM,
      metadata: {
        seed: true,
        suggestionId: seedSuggestion.id,
        clientId: client.id
      }
    }
  });
  const disclosureAuditEvent = await prisma.auditEvent.create({
    data: {
      userId: user.id,
      clientId: client.id,
      memoryRequestId: memoryRequest.id,
      type: AuditEventType.MEMORY_DISCLOSURE,
      actorType: AuditActorType.CLIENT,
      actorId: client.id,
      metadata: {
        seed: true,
        requestId: memoryRequest.id,
        clientId: client.id,
        policyId: policy.id,
        memoryIds: [communicationMemory.id],
        statedPurpose: memoryRequest.statedPurpose
      }
    }
  });

  await prisma.auditEventSubject.createMany({
    data: [
      {
        userId: user.id,
        auditEventId: clientAuditEvent.id,
        subjectType: AuditSubjectType.CLIENT,
        subjectId: client.id,
        role: AuditSubjectRole.CLIENT,
        labelSnapshot: client.name,
        metadata: { seed: true }
      },
      {
        userId: user.id,
        auditEventId: policyAuditEvent.id,
        subjectType: AuditSubjectType.POLICY,
        subjectId: policy.id,
        role: AuditSubjectRole.POLICY,
        labelSnapshot: `${client.name} permissions`,
        metadata: { seed: true }
      },
      {
        userId: user.id,
        auditEventId: suggestionAuditEvent.id,
        subjectType: AuditSubjectType.MEMORY_SUGGESTION,
        subjectId: seedSuggestion.id,
        role: AuditSubjectRole.SUGGESTION,
        labelSnapshot: seedSuggestion.title,
        metadata: { seed: true }
      },
      {
        userId: user.id,
        auditEventId: suggestionAuditEvent.id,
        subjectType: AuditSubjectType.CLIENT,
        subjectId: client.id,
        role: AuditSubjectRole.CLIENT,
        labelSnapshot: client.name,
        metadata: { seed: true }
      },
      {
        userId: user.id,
        auditEventId: disclosureAuditEvent.id,
        subjectType: AuditSubjectType.MEMORY,
        subjectId: communicationMemory.id,
        role: AuditSubjectRole.DISCLOSED,
        labelSnapshot: communicationMemory.title,
        metadata: { seed: true }
      },
      {
        userId: user.id,
        auditEventId: disclosureAuditEvent.id,
        subjectType: AuditSubjectType.MEMORY_REQUEST,
        subjectId: memoryRequest.id,
        role: AuditSubjectRole.REQUEST,
        labelSnapshot: memoryRequest.statedPurpose,
        metadata: { seed: true }
      },
      {
        userId: user.id,
        auditEventId: disclosureAuditEvent.id,
        subjectType: AuditSubjectType.CLIENT,
        subjectId: client.id,
        role: AuditSubjectRole.CLIENT,
        labelSnapshot: client.name,
        metadata: { seed: true }
      },
      {
        userId: user.id,
        auditEventId: disclosureAuditEvent.id,
        subjectType: AuditSubjectType.POLICY,
        subjectId: policy.id,
        role: AuditSubjectRole.POLICY,
        labelSnapshot: `${client.name} permissions`,
        metadata: { seed: true }
      }
    ],
    skipDuplicates: true
  });
}

async function main() {
  await seedCategories();
  const user = await seedDemoUser(demoAccountEmail, "Demo User");
  await seedDemoUser("second-user@funes-vault.local", "Second Demo User");
  const { client, policy } = await seedClientAndPolicy(user);
  const memories = await seedMemories(user);
  const reviews = await seedReviewItems(
    user,
    client,
    memories.communicationMemory
  );
  await seedAuditTrail({ user, client, policy, ...memories, ...reviews });
  console.log(
    "Seeded demo Funes Vault data for demo@funes-vault.local and second-user@funes-vault.local"
  );
  console.log(
    "Run pnpm dev and choose Use demo account to open the seeded vault. Google sign-in creates a separate vault."
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
