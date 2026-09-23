import { Prisma } from "@funes-vault/db";
import {
  type ArgumentsHost,
  BadRequestException,
  NotFoundException
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";

function createHost(requestId?: string) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ requestId })
    })
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe("AllExceptionsFilter", () => {
  it("keeps HttpException status and object bodies, adding the request id", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost("req_1");

    filter.catch(
      new BadRequestException({
        message: "Memory content appears to contain secret-like material",
        findings: ["openai_api_key"]
      }),
      host
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: "Memory content appears to contain secret-like material",
        findings: ["openai_api_key"],
        requestId: "req_1"
      })
    );
  });

  it("wraps string HttpException bodies in the standard envelope", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost("req_2");

    filter.catch(new NotFoundException("Memory not found"), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: "Not Found",
      message: "Memory not found",
      requestId: "req_2"
    });
  });

  it("maps Prisma unique violations to a sanitized 409", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost("req_3");
    const exception = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`email`)",
      { code: "P2002", clientVersion: "test" }
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      error: "Conflict",
      message: "A resource with the same unique value already exists.",
      requestId: "req_3"
    });
    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain("email");
  });

  it("returns a generic 500 without internal details for unknown errors", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost("req_4");

    filter.catch(
      new Error("connect ECONNREFUSED db.internal.example:5432"),
      host
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred.",
      requestId: "req_4"
    });
    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });
});
