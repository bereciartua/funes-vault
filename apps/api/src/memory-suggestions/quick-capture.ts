export const quickCapturePurpose = "quick_capture";
const quickCaptureTitleLimit = 80;
export const quickCaptureSensitivity = "INTERNAL" as const;
/** @internal */
export function quickCaptureTitle(text: string) {
  const firstLine =
    text
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find((line) => line.length > 0) ?? "Quick capture";

  if (firstLine.length <= quickCaptureTitleLimit) {
    return firstLine;
  }

  return `${firstLine.slice(0, quickCaptureTitleLimit - 1).trimEnd()}…`;
}
