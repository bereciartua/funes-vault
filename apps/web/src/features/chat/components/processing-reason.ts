const reasons: Record<string, string> = {
  voice_finalization_window_closed:
    "Memory processing stopped after the voice session ended. Retry this saved turn to check whether it can now be processed.",
  voice_transcript_arrived_too_late:
    "This voice turn arrived too late after the session ended. Start a new session or send the information as text.",
  reconnect_voice_session:
    "Memory processing settings changed during this voice session. Start a new session or send the information as text.",
  provider_not_configured:
    "Memory processing is not configured on the server. Ask the administrator to configure it before retrying.",
  configuration_unavailable:
    "The original memory processor is unavailable. Ask the administrator to restore its configuration before retrying.",
  processing_consent_required:
    "Memory processing needs your permission in settings before it can continue.",
  secret_like_content:
    "Memory processing was skipped because this text appears to contain a secret.",
  transcript_persistence_failed:
    "The server did not confirm this turn was saved. Check your connection and reload the thread before sending it again."
};

export function processingReason(reason?: string | null) {
  return reason ? reasons[reason] : undefined;
}

export function canRetryProcessing(reason?: string | null) {
  return ![
    "voice_transcript_arrived_too_late",
    "reconnect_voice_session",
    "secret_like_content",
    "transcript_persistence_failed"
  ].includes(reason ?? "");
}
