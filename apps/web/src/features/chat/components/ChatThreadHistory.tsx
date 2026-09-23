import { type ChatThreadSummary, type Pagination } from "@funes-vault/shared";
import { Clock, MessageSquareText, Pencil, X } from "lucide-react";
import { useState } from "react";

import { IconButton } from "../../../components/ui/button";
import { PaginationControls } from "../../../components/ui/pagination";
import { formatThreadActivity } from "../../../lib/dates";
import { stripMarkdownPreview } from "../message-parts";
import { ThreadRenameForm } from "./ThreadRenameForm";
function displayThreadTitle(
  thread: Pick<ChatThreadSummary, "title" | "lastMessagePreview">
) {
  return (
    thread.title ??
    (thread.lastMessagePreview
      ? stripMarkdownPreview(thread.lastMessagePreview)
      : null) ??
    "Untitled thread"
  );
}
export function ChatThreadHistory({
  disabled = false,
  isDraftNewThread,
  onClose,
  onPageChange,
  onRenameThread,
  onSelectThread,
  pagination,
  selectedThreadId,
  threads
}: {
  disabled?: boolean;
  isDraftNewThread: boolean;
  onClose?: () => void;
  onPageChange: (page: number) => void;
  onRenameThread: (sessionId: string, title: string) => Promise<void>;
  onSelectThread: (sessionId: string) => Promise<void>;
  pagination: Pagination;
  selectedThreadId: string | null;
  threads: ChatThreadSummary[];
}) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);

  return (
    <aside className="thread-history" aria-label="Previous chat threads">
      <div className="thread-history-heading">
        <div>
          <p className="eyebrow">Threads</p>
          <h2>Previous</h2>
        </div>
        <div className="thread-history-heading-actions">
          {isDraftNewThread ? (
            <span className="thread-draft-pill">Draft</span>
          ) : null}
          {onClose ? (
            <IconButton
              type="button"
              className="thread-history-close"
              label="Close thread history"
              title="Close"
              variant="secondary"
              onClick={onClose}
            >
              <X aria-hidden="true" size={16} strokeWidth={2.6} />
            </IconButton>
          ) : null}
        </div>
      </div>

      {isDraftNewThread ? (
        <div className="thread-draft-summary">
          <MessageSquareText aria-hidden="true" size={18} strokeWidth={2.4} />
          <span>New conversation</span>
        </div>
      ) : null}

      <div className="thread-list" aria-label="Thread list">
        {threads.length === 0 ? (
          <p className="muted">No previous conversations.</p>
        ) : null}
        {threads.map((thread) => {
          const selected = thread.sessionId === selectedThreadId;
          const isEditing = editingThreadId === thread.sessionId;
          const title = displayThreadTitle(thread);

          return (
            <div
              key={thread.sessionId}
              className="thread-row"
              data-selected={selected}
            >
              {isEditing ? (
                <ThreadRenameForm
                  threadId={thread.sessionId}
                  initialTitle={title}
                  onRenameThread={onRenameThread}
                  onClose={() => setEditingThreadId(null)}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="thread-row-main"
                    disabled={disabled || selected}
                    onClick={() => void onSelectThread(thread.sessionId)}
                  >
                    <span className="thread-row-title">{title}</span>
                    <span className="thread-row-preview">
                      {thread.lastMessagePreview
                        ? stripMarkdownPreview(thread.lastMessagePreview)
                        : "No preview available"}
                    </span>
                    <span className="thread-row-meta">
                      <Clock aria-hidden="true" size={14} strokeWidth={2.4} />
                      {formatThreadActivity(thread.updatedAt)}
                      <span>{thread.messageCount} messages</span>
                    </span>
                  </button>
                  {selected ? (
                    <IconButton
                      type="button"
                      className="thread-row-edit"
                      label="Rename selected thread"
                      title="Rename"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => {
                        setEditingThreadId(thread.sessionId);
                      }}
                    >
                      <Pencil aria-hidden="true" size={16} strokeWidth={2.4} />
                    </IconButton>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>

      <PaginationControls
        disabled={disabled}
        itemLabel="thread"
        nextLabel="Older"
        pagination={pagination}
        previousLabel="Newer"
        showPageSize={false}
        variant="compact"
        onLimitChange={() => undefined}
        onPageChange={onPageChange}
      />
    </aside>
  );
}
