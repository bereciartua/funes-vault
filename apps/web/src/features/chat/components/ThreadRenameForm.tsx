"use client";
import { Check, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { IconButton } from "../../../components/ui/button";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { FormField } from "../../../components/ui/form-field";
export function normalizeThreadRenameTitle(title: string) {
  return title.trim();
}
export function ThreadRenameForm({
  threadId,
  initialTitle,
  onRenameThread,
  onClose
}: {
  threadId: string;
  initialTitle: string;
  onRenameThread: (id: string, title: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!threadId) {
      return;
    }

    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [threadId]);

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!threadId) {
      return;
    }

    const title = normalizeThreadRenameTitle(draftTitle);
    if (!title) {
      setRenameError("Thread title cannot be empty.");

      return;
    }

    setRenameError(null);
    setSaving(true);

    try {
      await onRenameThread(threadId, title);
      onClose();
    } catch {
      setRenameError("Could not rename that thread.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {" "}
      <form className="thread-rename-form" onSubmit={saveRename}>
        <FormField label="Title">
          <input
            ref={renameInputRef}
            value={draftTitle}
            maxLength={80}
            onChange={(event) => setDraftTitle(event.target.value)}
            required
          />
        </FormField>
        <div className="thread-rename-actions">
          <IconButton
            type="submit"
            label="Save thread title"
            title="Save"
            disabled={saving}
          >
            <Check aria-hidden="true" size={16} strokeWidth={2.6} />
          </IconButton>
          <IconButton
            type="button"
            label="Cancel rename"
            title="Cancel"
            variant="secondary"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={2.6} />
          </IconButton>
        </div>
      </form>
      <FeedbackMessages error={renameError} />
    </>
  );
}
