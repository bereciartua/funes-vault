"use client";
import "../composer.css";

import { Mic, Send, Square } from "lucide-react";
import { type FormEvent, type KeyboardEvent, type RefObject } from "react";

import { Button, IconButton } from "../../../components/ui/button";
import { FormField } from "../../../components/ui/form-field";

export function shouldSubmitComposerKey(input: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
}) {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing;
}
function submitComposerOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (
    !shouldSubmitComposerKey({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing
    })
  ) {
    return;
  }
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
export function ChatComposer({
  message,
  onMessageChange,
  onSubmit,
  onStartVoice,
  onStop,
  disabled = false,
  voiceOpen = false,
  textareaRef,
  variant = "chat"
}: {
  message: string;
  onMessageChange: (message: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStartVoice?: () => void;
  onStop?: () => void;
  disabled?: boolean;
  voiceOpen?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  variant?: "chat" | "overview";
}) {
  const overview = variant === "overview";

  return (
    <form className={overview ? undefined : "chat-form"} onSubmit={onSubmit}>
      <FormField
        label={
          <span className="visually-hidden">
            {overview ? "Ask your vault" : "Message"}
          </span>
        }
      >
        <textarea
          value={message}
          rows={overview ? 2 : 3}
          ref={textareaRef}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={submitComposerOnEnter}
          placeholder="Tell me something, or ask what I know…"
          required
        />
      </FormField>
      <div
        className={overview ? "overview-composer-actions" : "prompt-actions"}
      >
        {onStartVoice ? (
          <IconButton
            type="button"
            label={
              overview ? "Start a voice conversation" : "Start voice session"
            }
            title="Voice"
            variant="secondary"
            className="composer-icon-button"
            aria-pressed={voiceOpen}
            disabled={disabled || voiceOpen}
            onClick={onStartVoice}
          >
            <Mic aria-hidden="true" size={18} strokeWidth={2.5} />
          </IconButton>
        ) : null}
        <IconButton
          type="submit"
          label={overview ? "Send to your vault" : "Send message"}
          title="Send"
          className="composer-icon-button composer-send-button"
          disabled={disabled || !message.trim()}
        >
          <Send aria-hidden="true" size={16} strokeWidth={2.5} />
        </IconButton>
        {onStop ? (
          <Button type="button" variant="secondary" onClick={onStop}>
            <Square aria-hidden="true" size={16} strokeWidth={2.5} />
            Stop
          </Button>
        ) : null}
      </div>
    </form>
  );
}
