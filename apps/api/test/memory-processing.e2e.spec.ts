import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { ChatService } from "../src/chat/chat.service.js";
import type { ExtractionInput } from "../src/memory-processing/contracts.js";
import { ExtractionReconciliationService } from "../src/memory-processing/extraction-reconciliation.service.js";
import { createUserWithSession } from "./e2e-harness.js";
import { output, processingE2eHarness } from "./fixtures/processing-e2e.js";
describe("privacy: memory processing persistence (e2e)", () => {
  const state = processingE2eHarness();
  let app: ReturnType<typeof state>["app"];
  let prisma: ReturnType<typeof state>["prisma"];
  let extraction: ReturnType<typeof state>["extraction"];
  let llm: ReturnType<typeof state>["llm"];
  let jev: ReturnType<typeof state>["jev"];
  let configure: ReturnType<typeof state>["configure"];
  let source: ReturnType<typeof state>["source"];
  beforeEach(() => {
    ({ app, prisma, extraction, llm, jev, configure, source } = state());
  });
  it.each(["system_1", "system_2"] as const)(
    "routes %s through direct policy and review, independently of consolidation",
    async (system) => {
      for (const mode of ["policy", "review"] as const) {
        for (const consolidation of ["system_1", "system_2"]) {
          configure(system, mode, consolidation);
          const user = await createUserWithSession(
            prisma,
            `${system}-${mode}-${consolidation}@example.com`
          );
          await prisma.processingConsent.create({
            data: {
              userId: user.userId,
              processor: "typesafe",
              scope: "extraction",
              version: 1
            }
          });
          const message = await source(user.userId);
          const result = await extraction.process(user.userId, message.id);
          expect(result.status).toBe("completed");
          expect(
            await prisma.memory.count({ where: { userId: user.userId } })
          ).toBe(mode === "policy" ? 1 : 0);
          expect(
            await prisma.memorySuggestion.count({
              where: { userId: user.userId }
            })
          ).toBe(1);
          await extraction.process(user.userId, message.id);
          expect(
            await prisma.memoryCandidateApplication.count({
              where: { run: { userId: user.userId } }
            })
          ).toBe(1);
        }
      }
      expect(system === "system_1" ? jev : llm).toHaveBeenCalledTimes(4);
      expect(system === "system_1" ? llm : jev).not.toHaveBeenCalled();
    }
  );
  it("reuses a new thread on duplicate submission and rejects changed content", async () => {
    const user = await createUserWithSession(prisma, "retry@example.com");
    const send = (message: string) =>
      request(app.getHttpServer())
        .post("/v1/chat/messages")
        .set("Cookie", user.cookie)
        .send({ startNewThread: true, submissionId: "stable", message });
    const first = await send("Remember I prefer concise answers.").expect(201);
    const second = await send("Remember I prefer concise answers.").expect(201);
    expect(second.body.sessionId).toBe(first.body.sessionId);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(
      await prisma.chatMessage.count({
        where: { userId: user.userId, role: "USER" }
      })
    ).toBe(1);
    await send("different").expect(409);
  });
  it("enforces owner isolation and authenticated capabilities", async () => {
    const owner = await createUserWithSession(prisma, "owner@example.com");
    const other = await createUserWithSession(prisma, "other@example.com");
    const message = await source(owner.userId);
    await request(app.getHttpServer())
      .get("/v1/memory-processing/capabilities")
      .expect(401);
    const capabilities = await request(app.getHttpServer())
      .get("/v1/memory-processing/capabilities")
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(JSON.stringify(capabilities.body)).not.toContain("fake");
    await expect(extraction.process(other.userId, message.id)).rejects.toThrow(
      "Source turn not found"
    );
  });
  it("skips missing consent, retries after opt-in, and blocks secret context", async () => {
    configure("system_1", "review");
    const user = await createUserWithSession(prisma, "consent@example.com");
    const message = await source(user.userId);
    expect((await extraction.process(user.userId, message.id)).status).toBe(
      "skipped"
    );
    expect(jev).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post("/v1/memory-processing/consent")
      .set("Cookie", user.cookie)
      .send({ scope: "extraction", granted: true, version: 1 })
      .expect(201);
    expect((await extraction.retry(user.userId, message.id)).status).toBe(
      "completed"
    );
    const secret = await source(
      user.userId,
      "api_key=synthetic_secret_1234567890"
    );
    expect((await extraction.process(user.userId, secret.id)).status).toBe(
      "skipped"
    );
    expect(jev).toHaveBeenCalledTimes(1);
  });
  it("retains pending corrections and requires actual reconciliation receipts", async () => {
    const user = await createUserWithSession(prisma, "correction@example.com");
    const message = await source(
      user.userId,
      "I used to prefer long answers; now concise answers."
    );
    await extraction.process(user.userId, message.id);
    expect(await prisma.memory.count({ where: { userId: user.userId } })).toBe(
      0
    );
    await expect(
      app
        .get(ExtractionReconciliationService)
        .complete(user.userId, message.id, "claim_1", "create")
    ).rejects.toThrow(/Search/);
    await app
      .get(ExtractionReconciliationService)
      .recordTool(
        user.userId,
        message.id,
        "search_memories",
        {},
        { items: [] }
      );
    await app
      .get(ExtractionReconciliationService)
      .recordTool(
        user.userId,
        message.id,
        "list_queued_memory_suggestions",
        {},
        { items: [] }
      );
    await app
      .get(ExtractionReconciliationService)
      .complete(user.userId, message.id, "claim_1", "create");
    await app
      .get(ExtractionReconciliationService)
      .complete(user.userId, message.id, "claim_1", "create");
    expect(await prisma.memory.count({ where: { userId: user.userId } })).toBe(
      1
    );
  });
  it("prevents revoked or cancelled results from committing and can retry failures", async () => {
    configure("system_1", "review");
    const user = await createUserWithSession(prisma, "revoked@example.com");
    const message = await source(user.userId);
    await prisma.processingConsent.create({
      data: {
        userId: user.userId,
        processor: "typesafe",
        scope: "extraction",
        version: 1
      }
    });
    jev.mockImplementationOnce(async (input: ExtractionInput) => {
      await prisma.processingConsent.updateMany({
        where: { userId: user.userId },
        data: { revokedAt: new Date() }
      });

      return output(input);
    });
    expect((await extraction.process(user.userId, message.id)).status).toBe(
      "skipped"
    );
    expect(await prisma.memorySuggestion.count()).toBe(0);
    configure("system_2", "policy");
    const cancelled = await source(user.userId);
    const controller = new AbortController();
    controller.abort();
    expect(
      (
        await extraction.process(
          user.userId,
          cancelled.id,
          "chat",
          controller.signal
        )
      ).status
    ).toBe("failed");
    expect(await prisma.memory.count()).toBe(0);
    expect((await extraction.retry(user.userId, cancelled.id)).status).toBe(
      "completed"
    );
    expect(await prisma.memory.count()).toBe(1);
  });
  it("persists duplicate voice items once and rejects changed finalized text", async () => {
    const user = await createUserWithSession(prisma, "voice@example.com");
    const thread = await prisma.chatSession.create({
      data: { userId: user.userId }
    });
    const voice = await prisma.voiceSession.create({
      data: { userId: user.userId, chatSessionId: thread.id, model: "fake" }
    });
    const input = {
      userId: user.userId,
      sessionId: thread.id,
      voiceSessionId: voice.id,
      itemId: "realtime-item",
      role: "user" as const,
      content: "Remember I prefer concise answers.",
      citations: [],
      suggestedMemoryIds: [],
      provider: {
        provider: "openai",
        model: "fake",
        usesThirdParty: true,
        disclosure: "test"
      }
    };
    const chat = app.get(ChatService);
    const first = await chat.persistVoiceTurn(input);
    const second = await chat.persistVoiceTurn(input);
    expect(second.message.id).toBe(first.message.id);
    expect(llm).toHaveBeenCalledTimes(1);
    await expect(
      chat.persistVoiceTurn({ ...input, content: "changed" })
    ).rejects.toThrow("Finalized transcript cannot change");
    await prisma.voiceSession.update({
      where: { id: voice.id },
      data: { endedAt: new Date(Date.now() - 120000) }
    });
    const late = await chat.persistVoiceTurn({ ...input, itemId: "late-item" });
    expect(late.message.processing).toMatchObject({
      status: "skipped",
      reason: "voice_finalization_window_closed"
    });
    expect(llm).toHaveBeenCalledTimes(1);
  });
});
