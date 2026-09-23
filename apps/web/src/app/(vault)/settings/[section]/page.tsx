import { notFound, redirect } from "next/navigation";

import { SettingsPage } from "../../../../features/settings/SettingsPage";
import { routes } from "../../../../lib/routes";
import { normalizeSettingsSection } from "../../../../shell/legacy-redirects";

type Params = Promise<{ section: string }>;

export default async function SettingsSectionPage({
  params
}: {
  params: Params;
}) {
  const { section: rawSection } = await params;
  const section = normalizeSettingsSection(rawSection);

  if (!section) {
    notFound();
  }

  if (section !== rawSection) {
    redirect(routes.settings(section));
  }

  return <SettingsPage section={section} />;
}
