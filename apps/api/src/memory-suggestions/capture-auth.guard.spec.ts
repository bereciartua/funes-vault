import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host.js";
import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ClientAuthGuard } from "../clients/client-auth.guard.js";
import { captureActor, CaptureAuthGuard } from "./capture-auth.guard.js";
describe("privacy: capture authentication selection", () => {
  it("never falls back to a cookie when bearer authentication fails", async () => {
    const client = {
        canActivate: vi.fn().mockRejectedValue(new Error("invalid bearer"))
      },
      session = { canActivate: vi.fn() };
    const guard = await createService(CaptureAuthGuard, [
      { provide: ClientAuthGuard, useValue: client },
      { provide: SessionAuthGuard, useValue: session }
    ]);
    await expect(
      guard.canActivate(
        new ExecutionContextHost([
          { headers: { authorization: "Bearer invalid", cookie: "valid" } }
        ])
      )
    ).rejects.toThrow("invalid bearer");
    expect(session.canActivate).not.toHaveBeenCalled();
  });
  it("uses cookie authentication when no bearer header is present", async () => {
    const client = { canActivate: vi.fn() },
      session = { canActivate: vi.fn().mockResolvedValue(true) };
    const guard = await createService(CaptureAuthGuard, [
      { provide: ClientAuthGuard, useValue: client },
      { provide: SessionAuthGuard, useValue: session }
    ]);
    expect(
      await guard.canActivate(new ExecutionContextHost([{ headers: {} }]))
    ).toBe(true);
    expect(client.canActivate).not.toHaveBeenCalled();
  });
  it("does not invent an owner without an authenticated actor", () =>
    expect(() => captureActor({ headers: {} })).toThrow());
});
