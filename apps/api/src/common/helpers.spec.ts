import type { Prisma } from "@funes-vault/db";
import { describe, expect, it, vi } from "vitest";

import { lockMemories, lockUser } from "./db-locks.js";
import { errorMessage } from "./errors.js";
import { isPrismaError } from "./prisma-errors.js";
import { toDateOrNull, toJson } from "./serialization.js";

describe("common boundaries", () => {
  it("extracts errors and recognizes only matching database codes", () => {
    expect(errorMessage(new Error("failure"))).toBe("failure");
    expect(errorMessage(null, "fallback")).toBe("fallback");
    expect(isPrismaError({ code: "P2002" }, "P2002")).toBe(true);
    expect(isPrismaError(null, "P2002")).toBe(false);
    expect(isPrismaError({ code: "P2025" }, "P2002")).toBe(false);
  });
  it("serializes dates and omits undefined object fields", () => {
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull("2026-09-22T00:00:00Z")?.toISOString()).toBe(
      "2026-09-22T00:00:00.000Z"
    );
    expect(
      toJson({ at: new Date("2026-09-22T00:00:00Z"), missing: undefined })
    ).toEqual({ at: "2026-09-22T00:00:00.000Z" });
  });
  it("keeps lock identifiers parameterized and handles empty sets", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    await lockUser(tx, "owner' OR 1=1");
    expect(query.mock.calls[0]?.[1]).toBe("owner' OR 1=1");
    await lockMemories(tx, "owner", []);
    expect(query).toHaveBeenCalledOnce();
    await lockMemories(tx, "owner", ["b", "a", "b"]);
    const sql = query.mock.calls[1]?.[0] as Prisma.Sql;
    expect(sql.values).toEqual(["owner", "a", "b"]);
  });
});

it("normalizes absent JSON roots without throwing", () => {
  expect(toJson(undefined)).toEqual({});
});
