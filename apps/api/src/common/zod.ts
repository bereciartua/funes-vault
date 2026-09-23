import { BadRequestException } from "@nestjs/common";
import { z, ZodError } from "zod";

// Field paths and validation messages only — request values never make it
// into the response, since they can contain secret-like content.
export function zodBadRequest(
  error: ZodError,
  message = "Invalid request"
): BadRequestException {
  return new BadRequestException({
    message,
    errors: z.flattenError(error).fieldErrors
  });
}

export function parseRequest<T>(
  schema: z.ZodType<T>,
  input: unknown,
  errorMessage = "Invalid request"
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw zodBadRequest(error, errorMessage);
    }

    throw error;
  }
}
