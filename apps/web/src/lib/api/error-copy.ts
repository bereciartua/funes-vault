import { ApiError, apiErrorMessage } from "./api-client";

export function errorCopy(
  error: unknown,
  fallback = "Something went wrong. Please try again."
) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  if (error.kind === "unreachable") {
    return "The vault is unreachable. Check your connection and try again.";
  }
  if (error.kind === "invalid-response") {
    return "The vault returned an unexpected response. Please try again.";
  }
  if (error.status === 401) {
    return "Your session expired. Sign in again to continue.";
  }
  if (error.status === 403) {
    return "This action is not allowed for your account.";
  }
  if (error.status === 404) {
    return "This item is no longer available.";
  }
  if (error.status === 409) {
    return apiErrorMessage(error, "This item changed. Refresh and try again.");
  }
  if (error.status === 429) {
    return "Too many requests. Wait a moment and try again.";
  }

  return apiErrorMessage(error, fallback);
}
