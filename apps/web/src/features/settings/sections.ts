import {
  type SettingsSection,
  settingsSections
} from "../../lib/settings-routes";
export type { SettingsSection } from "../../lib/settings-routes";
const settingsSectionTitles: Record<SettingsSection, string> = {
  profile: "Profile",
  jobs: "Jobs",
  data: "Data",
  clients: "Apps & access",
  requests: "Sharing requests",
  audit: "Audit"
};

export const settingsMenuItems: Array<{
  section: SettingsSection;
  title: string;
  description: string;
}> = [
  {
    section: "profile",
    title: settingsSectionTitles.profile,
    description: "Identity, appearance, and Google sign-in."
  },
  {
    section: "jobs",
    title: settingsSectionTitles.jobs,
    description: "Consolidation schedule and recent runs."
  },
  {
    section: "data",
    title: settingsSectionTitles.data,
    description: "Import, export, and account deletion."
  },
  {
    section: "clients",
    title: settingsSectionTitles.clients,
    description: "Connected apps, tokens, and app permissions."
  },
  {
    section: "requests",
    title: settingsSectionTitles.requests,
    description: "Preview and approve one-time disclosures."
  },
  {
    section: "audit",
    title: settingsSectionTitles.audit,
    description: "Inspect disclosure and system events."
  }
];

export function isSettingsSection(
  value: string | null
): value is SettingsSection {
  return settingsSections.some((section) => section === value);
}
