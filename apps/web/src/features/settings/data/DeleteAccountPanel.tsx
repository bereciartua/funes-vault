"use client";
import { okResponseSchema } from "@funes-vault/shared";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { DeleteButton } from "../../../components/ui/button";
import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { FormField } from "../../../components/ui/form-field";
import { ApiError } from "../../../lib/api/api-client";
import { useApiUrl } from "../../../lib/api/api-context";
import { useApiMutation } from "../../../lib/api/use-api";
export function DeleteAccountPanel() {
  const apiUrl = useApiUrl();
  const params = useSearchParams();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const deletion = useApiMutation({
    path: "/auth/me",
    method: "DELETE",
    schema: okResponseSchema,
    body: (confirmation: string) => ({ confirmation })
  });
  const isBusy = deletion.isPending;
  const verificationError = params.has("authError")
    ? "Google verification was canceled or failed. Use the Google account associated with this vault and try again."
    : null;
  const verificationMessage =
    params.get("verified") === "1"
      ? "Google account verified. Confirm deletion within five minutes."
      : null;
  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const confirmed = await confirm({
      title: "Delete your account?",
      body: "This permanently removes your account, all memories, clients, policies, and audit history. There is no way to recover them afterwards.",
      confirmLabel: "Delete everything",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    setMessage(null);
    setError(null);

    try {
      await deletion.mutateAsync(deleteConfirmation);
    } catch (error) {
      setError(
        error instanceof ApiError && error.status === 403
          ? "Verify your Google account, then confirm deletion within five minutes."
          : "Could not delete the account. Try again."
      );

      return;
    }

    window.location.assign("/");
  }

  return (
    <>
      {" "}
      <section className="data-panel danger-zone" aria-label="Danger zone">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Danger zone</p>
            <h2>Delete account</h2>
          </div>
        </div>
        <p className="muted">
          Permanently deletes your account, every memory, all clients and
          policies, and the audit trail. Export your vault first if you want a
          copy. This cannot be undone.
        </p>
        <p>
          First verify your Google account, then return here to confirm deletion
          within five minutes.
        </p>
        <a href={`${apiUrl.replace(/\/$/, "")}/auth/google/verify-deletion`}>
          Verify Google account
        </a>
        <form className="danger-zone-form" onSubmit={deleteAccount}>
          <FormField label="Type DELETE to confirm">
            <input
              type="text"
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              required
            />
          </FormField>
          <DeleteButton
            type="submit"
            disabled={isBusy || deleteConfirmation !== "DELETE"}
          />
        </form>
      </section>
      <FeedbackMessages
        message={message ?? verificationMessage}
        error={error ?? verificationError}
      />
    </>
  );
}
