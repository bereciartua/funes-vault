import { z } from "zod";

export const nullableDatetimeSchema = z.iso.datetime().nullable().optional();

export const queryStringOrArraySchema = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === "string");
    }

    if (typeof value === "string" && value.length > 0) {
      return [value];
    }

    return undefined;
  },
  z.array(z.string().min(1)).optional()
);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0)
});

export type Pagination = z.infer<typeof paginationSchema>;

export const jsonRecordSchema = z.record(z.string(), z.unknown());
export const deniedMemorySchema = z.object({
  memoryId: z.string().min(1),
  reason: z.string().min(1)
});
export function requireAtLeastOneField(value: object) {
  return Object.keys(value).length > 0;
}
export function queryBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === true || value === "true" || value === "1") {
      return true;
    }
    if (value === false || value === "false" || value === "0") {
      return false;
    }

    return undefined;
  }, z.boolean().default(defaultValue));
}

export type NullableDatetime = z.infer<typeof nullableDatetimeSchema>;

export type QueryStringOrArray = z.infer<typeof queryStringOrArraySchema>;

export type JsonRecord = z.infer<typeof jsonRecordSchema>;

export type DeniedMemory = z.infer<typeof deniedMemorySchema>;
