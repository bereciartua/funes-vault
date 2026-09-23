import { describe, expect, it } from "vitest";

import { clientAddress } from "./http-request.js";
function request(peer: string, forwarded: string) {
  return {
    socket: { remoteAddress: peer },
    headers: { "x-forwarded-for": forwarded }
  };
}
describe("pre-authentication proxy identity", () => {
  it("ignores spoofed forwarding headers from an untrusted peer", () => {
    expect(clientAddress(request("192.0.2.1", "203.0.113.1"), [])).toBe(
      "192.0.2.1"
    );
  });
  it("uses the nearest valid forwarded hop only for an explicitly trusted proxy", () => {
    expect(
      clientAddress(request("::ffff:192.0.2.1", "spoofed, 203.0.113.2"), [
        "192.0.2.1"
      ])
    ).toBe("203.0.113.2");
    expect(clientAddress(request("192.0.2.1", "invalid"), ["192.0.2.1"])).toBe(
      "192.0.2.1"
    );
  });
});
