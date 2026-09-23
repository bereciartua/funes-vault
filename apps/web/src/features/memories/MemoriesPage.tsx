"use client";
import "./memories.css";

import { FeedbackMessages } from "../../components/ui/feedback-messages";
import { MemoryDetail } from "./components/MemoryDetail";
import { MemoryEditor } from "./components/MemoryEditor";
import { MemoryListSidebar } from "./components/MemoryListSidebar";
import { useMemoryWorkspace } from "./hooks/use-memory-workspace";

export function MemoriesPage() {
  const memory = useMemoryWorkspace();

  return (
    <section className="vault-layout" aria-labelledby="vault-heading">
      <h1 id="vault-heading" className="visually-hidden">
        Memory vault
      </h1>
      <MemoryListSidebar
        list={memory.list}
        filters={memory.filters}
        pagination={memory.pagination}
        startCreate={memory.startCreate}
      />
      <div className="vault-main">
        <FeedbackMessages {...memory.feedback} />
        <MemoryDetail {...memory.detail} />
        {memory.editor.editorMode !== "closed" ? (
          <MemoryEditor {...memory.editor} />
        ) : null}
      </div>
    </section>
  );
}
