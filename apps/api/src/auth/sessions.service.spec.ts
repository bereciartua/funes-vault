import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service.js";
import { hashSessionToken } from "./session.js";
import { SessionsService } from "./sessions.service.js";

describe("privacy: cookie session resolution", () => {
  function setup(value: unknown) {
    const findUnique = vi.fn().mockResolvedValue(value);
    const service = new SessionsService({
      client: { session: { findUnique } }
    } as unknown as PrismaService);

    return { service, findUnique };
  }
  it("does not query without a cookie", async () => {
    const { service, findUnique } = setup(null);
    expect(await service.resolveFromCookieHeader(undefined)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
  it.each([null, { expiresAt: new Date(0) }])(
    "rejects missing or expired sessions",
    async (session) => {
      expect(
        await setup(session).service.resolveFromCookieHeader(
          "funes_vault_session=token"
        )
      ).toBeNull();
    }
  );
  it("hashes the token and only returns public profile fields", async () => {
    const user = {
      id: "user",
      displayName: "User",
      email: "user@example.test",
      role: "USER",
      tokenHash: "never expose"
    };
    const { service, findUnique } = setup({
      id: "session",
      expiresAt: new Date(Date.now() + 60_000),
      user
    });
    expect(
      await service.resolveFromCookieHeader("funes_vault_session=token")
    ).toEqual({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken("token") },
      include: { user: true }
    });
  });
});
