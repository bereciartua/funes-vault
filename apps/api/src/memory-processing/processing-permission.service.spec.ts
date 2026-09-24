import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { MemoryProcessingConfigService } from "./memory-processing-config.service.js";
import { ProcessingPermissionService } from "./processing-permission.service.js";

describe("privacy: processing provider boundary", () => {
  async function setup(system: "system_1" | "system_2", available = true) {
    const forUser = vi.fn().mockResolvedValue({
      extraction: {
        processors: system === "system_1" ? ["typesafe", "openai"] : ["openai"],
        available
      },
      consolidation: {
        processors: system === "system_1" ? ["typesafe"] : ["openai"],
        available
      }
    });
    const service = await createService(ProcessingPermissionService, [
      { provide: MemoryProcessingConfigService, useValue: { forUser } }
    ]);

    return { service, forUser };
  }

  it("allows the owner's selected TypeSafe task without another consent", async () => {
    const { service, forUser } = await setup("system_1");
    await expect(
      service.check("owner", "extraction", ["typesafe", "openai"])
    ).resolves.toBeUndefined();
    expect(forUser).toHaveBeenCalledWith("owner", undefined);
  });

  it("blocks a TypeSafe call after the owner selects OpenAI", async () => {
    const { service } = await setup("system_2");
    await expect(
      service.check("owner", "extraction", ["typesafe", "openai"])
    ).rejects.toMatchObject({ reason: "processing_provider_changed" });
  });

  it("blocks an OpenAI call after the owner selects TypeSafe", async () => {
    const { service } = await setup("system_1");
    await expect(
      service.check("owner", "consolidation", ["openai"])
    ).rejects.toMatchObject({ reason: "processing_provider_changed" });
  });

  it("blocks an unavailable provider", async () => {
    const { service } = await setup("system_2", false);
    await expect(
      service.check("owner", "consolidation", ["openai"])
    ).rejects.toMatchObject({ reason: "provider_not_configured" });
  });

  it("blocks secret-like payloads before provider lookup", async () => {
    const { service, forUser } = await setup("system_2");
    await expect(
      service.check("owner", "extraction", ["openai"], {
        text: "password=synthetic-secret-value"
      })
    ).rejects.toMatchObject({ reason: "secret_like_content" });
    expect(forUser).not.toHaveBeenCalled();
  });
});
