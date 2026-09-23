# 0025 — Keep hand-written Swagger DTOs; derive enums from Prisma instead of generating OpenAPI from Zod

Date: 2026-07-08

Status: accepted

## Context and problem

The API contract review found three-way drift risk between Prisma enums, shared Zod schemas, and Swagger DTO enum arrays — and one real instance of drift (the audit DTO was missing the four OAUTH_* audit event types). Full generation (`zod-openapi` / `@anatine/zod-openapi` / `nestjs-zod`) was evaluated as step 3.

## Considered options

(1) generate OpenAPI schemas from the shared Zod schemas and delete the DTO classes; (2) keep DTOs but eliminate the drift-prone parts. Option 1 removes the remaining duplication but couples the public API contract to internal validation schemas, requires annotating the shared package with OpenAPI metadata (examples, descriptions), and the current generators have uneven support for the Zod v4 API the repo uses. Option 2 keeps the contract explicit and reviewable at the current API size (~40 routes).

## Decision outcome

Do not adopt a Zod-to-OpenAPI generation library for now. Swagger documentation stays in hand-written DTO classes, but every enum list in a DTO is now derived with `Object.values(<PrismaEnum>)` instead of a hand-copied string array, and controller-boundary validation uses `ZodValidationPipe` around the shared Zod schemas (piloted in the memories module).

## Consequences

Field-level shape drift between Zod schemas and DTO classes is still possible (enum drift is not); revisit generation if the route count grows substantially or when Zod v4 support in generators matures.
