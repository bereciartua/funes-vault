import { describe, expect, it } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

describe("HealthController", () => {
  it("returns a healthy response", async () => {
    const response = (
      await createService(HealthController, [
        {
          provide: HealthService,
          useValue: {
            getLiveHealth: () => ({
              status: "ok",
              service: "funes-vault-api",
              timestamp: "2026-06-27T00:00:00.000Z"
            })
          }
        }
      ])
    ).getHealth();

    expect(response.status).toBe("ok");
    expect(response.service).toBe("funes-vault-api");
  });
});
