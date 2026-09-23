import { Injectable, type PipeTransform } from "@nestjs/common";
import { type z, ZodError } from "zod";

import { zodBadRequest } from "./zod.js";

// Controller-boundary validation: `@Body(new ZodValidationPipe(schema))`
// hands the service an already-typed value, replacing per-service
// parseRequest calls.
/** Parses controller input with the supplied shared schema and emits sanitized validation errors. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly schema: z.ZodType<T>,
    private readonly message = "Invalid request"
  ) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw zodBadRequest(error, this.message);
      }

      throw error;
    }
  }
}
