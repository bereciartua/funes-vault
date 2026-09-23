import type { Prisma, PrismaClient } from "@funes-vault/db";
import { type Mock, vi } from "vitest";

type Delegate<T> = {
  [Key in keyof T]: T[Key] extends (...args: never[]) => unknown
    ? T[Key] & Mock
    : T[Key];
};
export type MockPrisma = {
  [Key in keyof PrismaClient]: PrismaClient[Key] extends (
    ...args: never[]
  ) => unknown
    ? PrismaClient[Key] & Mock
    : Delegate<PrismaClient[Key]>;
};

/** Lazy Prisma boundary double. Unconfigured operations return undefined and cannot touch a database. */
export function mockPrisma<T extends object = Record<never, never>>(
  overrides?: T
): MockPrisma & T {
  const properties = new Map<PropertyKey, unknown>();
  const client = new Proxy(
    {},
    {
      get(_target, key) {
        if (!properties.has(key)) {
          const value = String(key).startsWith("$")
            ? vi.fn()
            : new Proxy(
                {},
                {
                  get(target: Record<PropertyKey, Mock>, method) {
                    return (target[method] ??= vi.fn());
                  }
                }
              );
          properties.set(key, value);
        }

        return properties.get(key);
      }
    }
  );
  properties.set(
    "$transaction",
    vi.fn(
      async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(client as Prisma.TransactionClient)
    )
  );

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      // The transaction mock always receives the same client as normal queries.
      if (key !== "$transaction") {
        if (!key.startsWith("$") && value && typeof value === "object") {
          Object.assign(Reflect.get(client, key), value);
        } else {
          properties.set(key, value);
        }
      }
    }
  }

  // The sole structural cast is confined to the mock boundary; callers keep real Prisma method types.
  return client as MockPrisma & T;
}
