"use client";
import {
  type AuthResponse,
  authResponseSchema,
  type AuthUser
} from "@funes-vault/shared";
import { FormEvent, useState } from "react";

import { Button } from "../../../components/ui/button";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { FormField } from "../../../components/ui/form-field";
import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation } from "../../../lib/api/use-api";
import { AppearanceSettings } from "./AppearanceSettings";
import { InstallApp } from "./InstallApp";
import { MemoryProcessingSettings } from "./MemoryProcessingSettings";

type ProfileSettingsProps = {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
};

export function ProfileSettings({ user, onUserUpdated }: ProfileSettingsProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation({
    path: "/auth/me",
    method: "PATCH",
    schema: authResponseSchema,
    body: (displayName: string | null) => ({ displayName }),
    invalidate: [queryKeys.session]
  });
  const isSavingProfile = mutation.isPending;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);
    setError(null);

    const trimmedName = displayName.trim();
    let parsed: AuthResponse;
    try {
      parsed = await mutation.mutateAsync(trimmedName || null);
    } catch {
      setError("Could not update your profile.");

      return;
    }

    onUserUpdated(parsed.user);
    setDisplayName(parsed.user.displayName ?? "");
    setProfileMessage("Profile updated.");
  }

  return (
    <section className="profile-panel data-panel">
      <div>
        <p className="eyebrow">Profile</p>
        <h2>User settings</h2>
      </div>

      <div className="profile-grid">
        <form className="form-stack" onSubmit={saveProfile}>
          <div>
            <h3 className="profile-section-title">Identity</h3>
            <p className="setting-help">
              This is the name shown in your vault account.
            </p>
          </div>
          <FormField label="Email">
            <input value={user.email} disabled />
          </FormField>
          <FormField label="Display name">
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="How Funes should address you"
            />
          </FormField>
          <Button type="submit" disabled={isSavingProfile}>
            {isSavingProfile ? "Saving..." : "Save profile"}
          </Button>
          <FeedbackMessages message={profileMessage} />
        </form>

        <AppearanceSettings />
        <MemoryProcessingSettings />

        <section className="form-stack">
          <h3 className="profile-section-title">Sign-in</h3>
          <p className="setting-help">Your account uses Google sign-in.</p>
        </section>
      </div>
      <InstallApp />
      <FeedbackMessages error={error} />
    </section>
  );
}
