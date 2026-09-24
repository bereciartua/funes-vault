/** Shared HTTP and MCP input limits; preprocessing is transport-specific. */
export const memoryInputLimits = {
  purpose: 160,
  task: 1000,
  tokenBudgetMin: 100,
  tokenBudgetMax: 8000,
  tokenBudgetDefault: 1200,
  requestedCategories: 24,
  processors: 12,
  processorName: 120,
  title: 180,
  body: 10000,
  categoryKeys: 12,
  evidence: 2000
} as const;
