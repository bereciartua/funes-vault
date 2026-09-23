import { MemoryExtractionRunStatus } from "@funes-vault/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractionInput } from "../src/memory-processing/contracts.js";
import { SuggestionIntakeService } from "../src/memory-suggestions/suggestion-intake.service.js";
import { createUserWithSession } from "./e2e-harness.js";
import { output, processingE2eHarness } from "./fixtures/processing-e2e.js";
describe("privacy: memory processing run lifecycle (e2e)", () => {
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
  it("rolls back a crash between provider return and candidate commit", async () => {
    const user = await createUserWithSession(prisma, "crash@example.com");
    const message = await source(user.userId);
    const save = vi
      .spyOn(app.get(SuggestionIntakeService), "createSuggestion")
      .mockRejectedValueOnce(new Error("simulated commit crash"));
    expect((await extraction.process(user.userId, message.id)).status).toBe(
      "failed"
    );
    expect(await prisma.memory.count()).toBe(0);
    expect(await prisma.memoryCandidateApplication.count()).toBe(0);
    save.mockRestore();
    expect((await extraction.retry(user.userId, message.id)).status).toBe(
      "completed"
    );
    expect(await prisma.memory.count()).toBe(1);
    expect(await prisma.memoryCandidateApplication.count()).toBe(1);
  });
  it("does not let an expired claim overwrite a recovered run", async () => {
    const user = await createUserWithSession(prisma, "lease@example.com");
    const message = await source(user.userId);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    llm.mockImplementationOnce(async (input: ExtractionInput) => {
      entered();
      await gate;

      return output(input);
    });
    const first = extraction.process(user.userId, message.id);
    await started;
    expect((await extraction.process(user.userId, message.id)).status).toBe(
      "pending"
    );
    await prisma.memoryExtractionRun.update({
      where: { sourceMessageId: message.id },
      data: { leaseUntil: new Date(0) }
    });
    expect((await extraction.process(user.userId, message.id)).status).toBe(
      "completed"
    );
    release();
    await first;
    expect(await prisma.memory.count()).toBe(1);
    expect((await extraction.result(user.userId, message.id)).status).toBe(
      "completed"
    );
  });
  it("preserves completed outcomes after switching providers", async () => {
    const user = await createUserWithSession(prisma, "switch@example.com");
    const message = await source(user.userId);
    await extraction.process(user.userId, message.id);
    configure("system_1", "review");
    expect((await extraction.process(user.userId, message.id)).status).toBe(
      "completed"
    );
    expect(jev).not.toHaveBeenCalled();
    expect(await prisma.memory.count()).toBe(1);
  });
  it("requires an explicit audited attempt to adopt a new provider", async () => {
    const user = await createUserWithSession(prisma, "reprocess@example.com");
    const message = await source(user.userId);
    llm.mockRejectedValueOnce(new Error("unavailable"));
    await extraction.process(user.userId, message.id);
    configure("system_1", "review");
    await prisma.processingConsent.create({
      data: {
        userId: user.userId,
        processor: "typesafe",
        scope: "extraction",
        version: 1
      }
    });
    const result = await extraction.reprocess(user.userId, message.id);
    expect(result.status).toBe("completed");
    expect(jev).toHaveBeenCalledOnce();
    expect(await prisma.memory.count()).toBe(0);
    expect(
      await prisma.memorySuggestion.count({
        where: { status: "QUEUED_FOR_REVIEW" }
      })
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: {
          userId: user.userId,
          metadata: { path: ["action"], equals: "explicit_reprocess" }
        }
      })
    ).toBe(1);
    await expect(extraction.reprocess(user.userId, message.id)).rejects.toThrow(
      "Only failed or skipped"
    );
  });
  it("records a failed outcome for a corrupt saved configuration without invoking a provider", async () => {
    const user = await createUserWithSession(
      prisma,
      "corrupt-config@example.com"
    );
    const message = await source(user.userId);
    await prisma.memoryExtractionRun.create({
      data: {
        userId: user.userId,
        sourceMessageId: message.id,
        configuration: { invalid: true },
        fingerprint: "corrupt"
      }
    });
    const result = await extraction.process(user.userId, message.id);
    expect(result.status).toBe("failed");
    const run = await prisma.memoryExtractionRun.findUniqueOrThrow({
      where: { sourceMessageId: message.id }
    });
    expect(run.status).toBe(MemoryExtractionRunStatus.FAILED);
    expect(run.failureReason).toBeTruthy();
    expect(run.leaseUntil).toBeNull();
    expect(run.claimToken).toBeNull();
    expect(llm).not.toHaveBeenCalled();
    expect(jev).not.toHaveBeenCalled();
  });
});
