import { createVoiceSessionRequestSchema } from "@funes-vault/shared";
import {
  HttpException,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPrismaMock,
  createService,
  stubClientSecretFetch
} from "../../test/fixtures/voice-sessions.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: VoiceSessionsService.createVoiceSession", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv("OPENAI_API_KEY", undefined);
  });
  it("requires a configured provider key", async () => {
    vi.stubEnv("OPENAI_API_KEY", undefined);
    const { service } = await createService();

    await expect(
      service.createVoiceSession({
        userId: "user_1",
        body: createVoiceSessionRequestSchema.parse({})
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("mints an ephemeral client secret server-side with the voice prompt and shared tools", async () => {
    const fetchMock = stubClientSecretFetch();
    const { service, prisma, firstPartyAccess } = await createService();

    const response = await service.createVoiceSession({
      userId: "user_1",
      body: createVoiceSessionRequestSchema.parse({})
    });

    expect(firstPartyAccess.ensureVoiceAccess).toHaveBeenCalledWith("user_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test"
        })
      })
    );

    const mintBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(mintBody.session.model).toBe("gpt-realtime-2");
    expect(mintBody.session.instructions).toContain("realtime voice");
    expect(mintBody.session.instructions).toContain(
      "Never read bracket labels"
    );
    expect(
      mintBody.session.tools.map((tool: { name: string }) => tool.name)
    ).toContain("memory_capture_result");
    expect(mintBody.expires_after.seconds).toBeLessThanOrEqual(300);

    expect(response.voiceSessionId).toBe("voice_1");
    expect(response.model).toBe("gpt-realtime-2");
    expect(response.clientSecret.value).toBe("ek_test_secret");
    expect(response.provider.channel).toBe("voice");
    expect(response.limits.dailySessionsUsed).toBe(1);
    expect(prisma.client.voiceSession.create).toHaveBeenCalled();

    // The provider API key itself never appears in the response payload.
    expect(JSON.stringify(response)).not.toContain("sk-test");
  });
  it("enforces the daily session cap", async () => {
    stubClientSecretFetch();
    const prisma = createPrismaMock();
    prisma.client.voiceSession.count.mockResolvedValue(20);
    const { service } = await createService({ prisma });

    await expect(
      service.createVoiceSession({
        userId: "user_1",
        body: createVoiceSessionRequestSchema.parse({})
      })
    ).rejects.toBeInstanceOf(HttpException);
    expect(prisma.client.voiceSession.create).not.toHaveBeenCalled();
  });
  it("attaches to an existing thread and rejects foreign threads", async () => {
    stubClientSecretFetch();
    const prisma = createPrismaMock();
    const { service } = await createService({ prisma });

    const response = await service.createVoiceSession({
      userId: "user_1",
      body: createVoiceSessionRequestSchema.parse({ sessionId: "session_1" })
    });
    expect(response.sessionId).toBe("session_1");
    expect(response.title).toBe("Existing thread");

    prisma.client.chatSession.findFirst.mockResolvedValue(null);
    await expect(
      service.createVoiceSession({
        userId: "user_1",
        body: createVoiceSessionRequestSchema.parse({
          sessionId: "someone_elses"
        })
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
