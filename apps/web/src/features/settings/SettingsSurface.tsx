"use client";
import type { AuthUser, MemoryCategory } from "@funes-vault/shared";
import Link from "next/link";

import { routes } from "../../lib/routes";
import { AppsAccessPanel } from "./apps-access/AppsAccess";
import { AuditPanel } from "./audit/AuditLog";
import { DataControl } from "./data/DataControl";
import { JobsPanel } from "./jobs/JobsPanel";
import { ProfileSettings } from "./profile/ProfileSettings";
import { DisclosureReviews } from "./requests/DisclosureReviews";
import { settingsMenuItems, type SettingsSection } from "./sections";
import { SettingsPane } from "./settings-scaffolding";

export function SettingsSurface({
  categories,
  settingsSection,
  user,
  onUserUpdated
}: {
  categories: MemoryCategory[];
  settingsSection: SettingsSection;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
}) {
  return (
    <section className="settings-page" aria-label="Settings">
      <nav className="settings-subnav" aria-label="Settings sections">
        {settingsMenuItems.map((item) => (
          <Link
            key={item.section}
            href={routes.settings(item.section)}
            className="quiet-list-row"
            data-selected={settingsSection === item.section}
            aria-current={settingsSection === item.section ? "page" : undefined}
          >
            <strong>{item.title}</strong>
            <span className="settings-subnav-description">
              {item.description}
            </span>
          </Link>
        ))}
      </nav>

      <div className="settings-content">
        {settingsSection === "profile" ? (
          <SettingsPane
            title="Profile"
            description="Manage your identity, appearance, and account security."
          >
            <ProfileSettings user={user} onUserUpdated={onUserUpdated} />
          </SettingsPane>
        ) : null}
        {settingsSection === "jobs" ? <JobsPanel /> : null}
        {settingsSection === "data" ? (
          <SettingsPane
            title="Data control"
            description="Export, restore, or permanently remove your vault data."
          >
            <DataControl categories={categories} />
          </SettingsPane>
        ) : null}
        {settingsSection === "clients" ? (
          <AppsAccessPanel categories={categories} />
        ) : null}
        {settingsSection === "requests" ? <DisclosureReviews /> : null}
        {settingsSection === "audit" ? <AuditPanel /> : null}
      </div>
    </section>
  );
}
