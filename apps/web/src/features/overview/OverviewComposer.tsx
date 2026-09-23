"use client";
import { FormEvent, useState } from "react";

import { FeedbackMessages } from "../../components/ui/feedback-messages";
import { ChatComposer } from "../chat/components/ChatComposer";

export function OverviewChatComposer({
  error,
  onSubmit,
  onStartVoice
}: {
  error: string | null;
  onSubmit: (message: string) => Promise<void>;
  onStartVoice?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmed = message.trim();

  async function submitComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="overview-composer home-composer"
      aria-label="Start memory chat"
    >
      <ChatComposer
        variant="overview"
        message={message}
        onMessageChange={setMessage}
        onSubmit={(event) => void submitComposer(event)}
        onStartVoice={onStartVoice}
        disabled={isSubmitting}
      />
      <FeedbackMessages error={error} />
    </section>
  );
}
