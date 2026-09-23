import { Fragment, type RefObject } from "react";

import { Button } from "../../../components/ui/button";
import { ScrollArea } from "../../../components/ui/scroll-area";
import type { VoiceTranscriptLine } from "../../voice/voice-session-state";
import { VoiceTranscript } from "../../voice/VoiceSessionPanel";
import { chatDateDividerLabel } from "../chat-dates";
import {
  type FunesUIMessage,
  type MemoryChatProps,
  starterPrompts
} from "../types";
import { MemoryMessage } from "./MemoryMessage";
type Props = Pick<MemoryChatProps, "onOpenInbox" | "onOpenMemory"> & {
  transcriptRef: RefObject<HTMLDivElement | null>;
  showThreadStarters: boolean;
  messages: FunesUIMessage[];
  voiceLines: VoiceTranscriptLine[];
  isVoiceLive: boolean;
  isVoiceOpen: boolean;
  onPrompt: (prompt: string) => void;
};
export function ChatTranscript({
  onOpenInbox,
  onOpenMemory,
  transcriptRef,
  showThreadStarters,
  messages,
  voiceLines,
  isVoiceLive,
  isVoiceOpen,
  onPrompt
}: Props) {
  return (
    <ScrollArea
      ariaLabel="Conversation transcript"
      className="chat-transcript"
      contentClassName={
        showThreadStarters
          ? "chat-transcript-content chat-transcript-content--new-thread"
          : "chat-transcript-content"
      }
      viewportRef={transcriptRef}
    >
      {messages.map((entry, index) => {
        const dividerLabel = chatDateDividerLabel(messages, index);

        return (
          <Fragment key={entry.id}>
            {dividerLabel ? (
              <div className="chat-date-divider">
                <span>{dividerLabel}</span>
              </div>
            ) : null}
            <MemoryMessage
              message={entry}
              onOpenInbox={onOpenInbox}
              onOpenMemory={onOpenMemory}
            />
          </Fragment>
        );
      })}
      {isVoiceOpen || voiceLines.length > 0 ? (
        <VoiceTranscript lines={voiceLines} live={isVoiceLive} />
      ) : null}
      {showThreadStarters ? (
        <div
          className="starter-prompts starter-prompts--centered"
          aria-label="Conversation starters"
        >
          {starterPrompts.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="secondary"
              onClick={() => onPrompt(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>
      ) : null}
    </ScrollArea>
  );
}
