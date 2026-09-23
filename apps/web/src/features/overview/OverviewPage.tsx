"use client";
import "./overview.css";

import { useRouter } from "next/navigation";

import { FeedbackMessages } from "../../components/ui/feedback-messages";
import { errorCopy } from "../../lib/api/error-copy";
import { randomId } from "../../lib/random-id";
import { useVaultSession } from "../../shell/AuthGate";
import { useChatLaunch } from "../../shell/chat-launch";
import { HomeSurface } from "./HomeSurface";
import { PrivacyOverview } from "./OverviewSurface";
import { useOverview } from "./use-overview";

export function OverviewPage({ home = false }: { home?: boolean }) {
  const query = useOverview();
  const router = useRouter();
  const { user } = useVaultSession();
  const { setPending, providerNotice } = useChatLaunch();
  if (query.isPending) {
    return <p role="status">Loading vault overview...</p>;
  }
  if (!query.data) {
    return <FeedbackMessages error={errorCopy(query.error)} />;
  }
  if (!home) {
    return (
      <PrivacyOverview overview={query.data} providerNotice={providerNotice} />
    );
  }

  return (
    <HomeSurface
      overview={query.data}
      user={user}
      error={null}
      onStartChat={async (text) => {
        setPending({ id: randomId(), text, startNewThread: true });
        router.push("/chat/new");
      }}
      onStartVoice={() => {
        setPending({ voice: true });
        router.push("/chat/new");
      }}
    />
  );
}
