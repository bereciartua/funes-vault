"use client";
import "./settings.css";

import { useVaultSession } from "../../shell/AuthGate";
import { useCategories } from "../memories/hooks/use-memories";
import type { SettingsSection } from "./sections";
import { SettingsSurface } from "./SettingsSurface";
export function SettingsPage({ section }: { section: SettingsSection }) {
  const { user, setUser } = useVaultSession();
  const categories = useCategories();

  return (
    <SettingsSurface
      user={user}
      onUserUpdated={setUser}
      categories={categories.data?.items ?? []}
      settingsSection={section}
    />
  );
}
