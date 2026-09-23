import { redirect } from "next/navigation";

import { OverviewPage } from "../../features/overview/OverviewPage";
import { legacySurfaceRedirect } from "../../shell/legacy-redirects";
export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const destination = legacySurfaceRedirect(await searchParams);
  if (destination) {
    redirect(destination);
  }

  return <OverviewPage home />;
}
