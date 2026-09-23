import { ApiProperty } from "@nestjs/swagger";

import type { HealthService } from "./health.service.js";

export class HealthResponseDto {
  @ApiProperty({ example: "ok" })
  status!: "ok" | "degraded" | "down";

  @ApiProperty({ example: "funes-vault-api" })
  service!: string;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  timestamp!: string;
}

export class HealthReadyResponseDto extends HealthResponseDto {
  @ApiProperty({
    example: {
      api: { status: "ok" },
      database: { status: "ok" },
      redis: { status: "ok" },
      worker: {
        status: "ok",
        embedding: {
          queueConfigured: true,
          workerEnabled: true,
          workerRunning: true
        },
        consolidation: {
          queueConfigured: true,
          workerEnabled: true,
          workerRunning: true
        }
      }
    }
  })
  checks!: Awaited<ReturnType<HealthService["getReadyHealth"]>>["checks"];
}
