import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host.js";
import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import type { FunesRequest } from "./auth.types.js";
import { SessionAuthGuard } from "./session-auth.guard.js";
import { SessionsService } from "./sessions.service.js";
describe("privacy: session guard", () => {
  it("attaches only the resolved owner and internal session context", async () => {
    const user = {
      id: "owner",
      email: "owner@example.test",
      displayName: null,
      role: "USER" as const
    };
    const resolveSessionFromCookieHeader = vi
      .fn()
      .mockResolvedValue({ user, sessionId: "session", token: "opaque" });
    const guard = await createService(SessionAuthGuard, [
      { provide: SessionsService, useValue: { resolveSessionFromCookieHeader } }
    ]);
    const request: FunesRequest = {
      headers: { cookie: "funes_vault_session=opaque" }
    };
    expect(await guard.canActivate(new ExecutionContextHost([request]))).toBe(
      true
    );
    expect(request).toMatchObject({
      user,
      sessionId: "session",
      sessionToken: "opaque"
    });
  });
  it.each([undefined, "funes_vault_session=expired"])(
    "rejects missing or invalid sessions",
    async (cookie) => {
      const guard = await createService(SessionAuthGuard, [
        {
          provide: SessionsService,
          useValue: {
            resolveSessionFromCookieHeader: vi.fn().mockResolvedValue(null)
          }
        }
      ]);
      await expect(
        guard.canActivate(new ExecutionContextHost([{ headers: { cookie } }]))
      ).rejects.toMatchObject({ status: 401 });
    }
  );
});
