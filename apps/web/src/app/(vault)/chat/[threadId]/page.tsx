import { ChatPage } from "../../../../features/chat/ChatPage";
export default async function Page({
  params
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;

  return <ChatPage threadId={threadId} />;
}
