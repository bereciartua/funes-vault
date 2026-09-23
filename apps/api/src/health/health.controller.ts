import { Controller, Get, Res } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags
} from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";

import { HealthReadyResponseDto, HealthResponseDto } from "./health.dto.js";
import { HealthService } from "./health.service.js";

// Monitoring probes poll these routes; rate limiting them would turn a
// busy prober into a false "down" signal.
@SkipThrottle()
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Check API health" })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth() {
    return this.healthService.getLiveHealth();
  }

  @Get("live")
  @ApiOperation({ summary: "Check API process liveness" })
  @ApiOkResponse({ type: HealthResponseDto })
  getLiveHealth() {
    return this.healthService.getLiveHealth();
  }

  @Get("ready")
  @ApiOperation({
    summary: "Check API readiness with database, Redis, and worker status"
  })
  @ApiOkResponse({ type: HealthReadyResponseDto })
  @ApiServiceUnavailableResponse({ type: HealthReadyResponseDto })
  async getReadyHealth(@Res({ passthrough: true }) response: Response) {
    const health = await this.healthService.getReadyHealth();
    response.status(health.status === "down" ? 503 : 200);

    return health;
  }
}
