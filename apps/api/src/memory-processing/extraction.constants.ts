export const ProcessorName = {
  classifier: "typesafe",
  openai: "openai"
} as const;
export type ProcessorName = (typeof ProcessorName)[keyof typeof ProcessorName];
export const extractionLeaseSlackMs = 5_000;
export const voiceFinalizationWindowMs = 60_000;
export const extractionHistoryLimit = 6;
export const extractionContextCharacterLimit = 2_000;
export const reconciliationMatchLimit = 100;
export const extractionTransactionTimeoutMs = 15_000;
export const extractionConfidence = 0.7;
export const toolReceiptPrefix = "_tool_";
export const classifierReconciliationThreshold = 0.65;
export const classifierCategoryThreshold = 0.7;
export const classifierSupportThreshold = 0.5;
