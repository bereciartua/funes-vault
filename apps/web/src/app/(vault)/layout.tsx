import { type ReactNode, Suspense } from "react";

import { ApiProvider } from "../../lib/api/api-context";
import { resolveApiUrl } from "../../lib/api/api-url";
import { AuthGate } from "../../shell/AuthGate";
import { VaultShell } from "../../shell/VaultShell";
export const dynamic = "force-dynamic";
export default function VaultAppLayout({ children }: { children: ReactNode }) {
  return (
    <ApiProvider apiUrl={resolveApiUrl(process.env)}>
      <Suspense fallback={<p role="status">Loading vault...</p>}>
        <AuthGate>
          <VaultShell>{children}</VaultShell>
        </AuthGate>
      </Suspense>
    </ApiProvider>
  );
}
