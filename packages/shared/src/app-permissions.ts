import type { MemoryRequestReason } from "./enums.js";
export const webChatClientName = "Funes Vault Web Chat";
export const voiceClientName = "Funes Vault Voice";
export const webChatPurpose = "memory_chat";
export const voicePurpose = "memory_voice";
export function isFirstPartyClient(client: { name: string; type: string }) {
  return (
    client.type === "WEB_APP" &&
    [webChatClientName, voiceClientName].includes(client.name)
  );
}
export function appPermissionsLabel(name?: string | null) {
  return name ? `${name} permissions` : "App permissions";
}
export const memoryRequestReasonLabels: Record<MemoryRequestReason, string> = {
  unknown_or_blocked_client: "This app is unavailable or blocked.",
  no_client_policy:
    "This app has no permissions. Set them up in Apps & access.",
  policy_expired: "This app’s permissions have expired.",
  operation_not_allowed:
    "This app does not have permission for this operation.",
  no_matching_memories: "No matching memories were found.",
  no_allowed_memories: "No matching memories meet this app’s permissions.",
  confirmation_required:
    "Your approval is required before sharing these memories.",
  policy_changed:
    "The permissions, app or memories changed. Review a fresh preview.",
  inactive_memory: "The memory is inactive.",
  unapproved_memory: "The memory has not been approved.",
  expired_memory: "The memory has expired.",
  above_sensitivity_ceiling: "The memory exceeds this app’s sensitivity limit.",
  denied_category: "The memory belongs to a denied category.",
  category_not_allowed: "The memory is outside this app’s allowed categories."
};
export function memoryRequestReasonLabel(reason: MemoryRequestReason | null) {
  return reason ? memoryRequestReasonLabels[reason] : "Not evaluated";
}
