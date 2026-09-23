import { afterEach, expect, it, vi } from "vitest";

import { randomId } from "./random-id";
afterEach(() => vi.unstubAllGlobals());
it("creates distinct UUIDs on HTTP origins without randomUUID", () => {
  const realCrypto = crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: realCrypto.getRandomValues.bind(realCrypto)
  });
  const first = randomId();
  expect(first).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  expect(randomId()).not.toBe(first);
});
