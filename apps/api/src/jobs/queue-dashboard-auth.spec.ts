import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { SessionsService } from "../auth/sessions.service.js";
import { createQueueDashboardAuthMiddleware } from "./queue-dashboard-auth.js";

describe("queue dashboard privacy boundary", () => {
  it.each([null, "USER", "ADMIN", "OWNER"])("checks role %s", async (role) => {
    const resolveFromCookieHeader = vi
      .fn()
      .mockResolvedValue(role ? { id: "owner", role } : null);
    const sessions = { resolveFromCookieHeader } as unknown as SessionsService;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();
    await createQueueDashboardAuthMiddleware(sessions)(
      { headers: { cookie: "funes_vault_session=token" } } as Request,
      { status } as unknown as Response,
      next
    );
    expect(resolveFromCookieHeader).toHaveBeenCalledWith(
      "funes_vault_session=token"
    );
    if (role === "ADMIN" || role === "OWNER") {
      expect(next).toHaveBeenCalledWith();
      expect(status).not.toHaveBeenCalled();
    } else {
      expect(status).toHaveBeenCalledWith(role ? 403 : 401);
      expect(next).not.toHaveBeenCalled();
    }
  });
});
