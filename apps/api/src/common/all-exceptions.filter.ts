import { Prisma } from "@funes-vault/db";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import type { Response } from "express";

import { getRequestId } from "./request-id.js";

type ErrorEnvelope = {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  [key: string]: unknown;
};

const prismaErrorMappings: Record<
  string,
  { statusCode: number; error: string; message: string }
> = {
  P2002: {
    statusCode: HttpStatus.CONFLICT,
    error: "Conflict",
    message: "A resource with the same unique value already exists."
  },
  P2025: {
    statusCode: HttpStatus.NOT_FOUND,
    error: "Not Found",
    message: "The requested resource was not found."
  }
};

const httpErrorNames: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "Bad Request",
  [HttpStatus.UNAUTHORIZED]: "Unauthorized",
  [HttpStatus.FORBIDDEN]: "Forbidden",
  [HttpStatus.NOT_FOUND]: "Not Found",
  [HttpStatus.CONFLICT]: "Conflict",
  [HttpStatus.TOO_MANY_REQUESTS]: "Too Many Requests",
  [HttpStatus.SERVICE_UNAVAILABLE]: "Service Unavailable"
};

function httpErrorName(statusCode: number) {
  return httpErrorNames[statusCode] ?? "Error";
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const requestId = getRequestId(context.getRequest());
    const envelope = this.toEnvelope(exception, requestId);

    if (envelope.statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `Unhandled exception (requestId=${requestId ?? "unknown"}): ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        stack
      );
    }

    response.status(envelope.statusCode).json(envelope);
  }

  private toEnvelope(
    exception: unknown,
    requestId: string | undefined
  ): ErrorEnvelope {
    if (
      exception instanceof Error &&
      "type" in exception &&
      exception.type === "entity.too.large"
    ) {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: "Payload Too Large",
        message: "Request body exceeds the route limit.",
        requestId
      };
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === "string") {
        return {
          statusCode,
          error: httpErrorName(statusCode),
          message: body,
          requestId
        };
      }

      const objectBody = body as Record<string, unknown>;

      return {
        error: httpErrorName(statusCode),
        message: exception.message,
        ...objectBody,
        statusCode,
        requestId
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapping = prismaErrorMappings[exception.code];

      if (mapping) {
        return { ...mapping, requestId };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: "An unexpected error occurred.",
      requestId
    };
  }
}
