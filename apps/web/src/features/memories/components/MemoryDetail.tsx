"use client";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";

import { Button, DeleteButton } from "../../../components/ui/button";
import { DotBadge } from "../../../components/ui/dot-badge";
import { formatDate, formatDateTime, formatRelative } from "../../../lib/dates";
import { captureSourceLabel, label } from "../../../lib/domain/labels";
import { isHighSensitivity } from "../../../lib/domain/sensitivity";
import type { MemoryWorkspace } from "../hooks/use-memory-workspace";
import { MemoryProvenancePanel } from "./MemoryProvenancePanel";

export function MemoryDetail(props: MemoryWorkspace["detail"]) {
  const {
    editorMode,
    selectedMemory,
    selectedMemoryIsVisible,
    isSaving,
    selectedMemoryProvenance,
    isLoadingProvenance,
    patchSelected,
    confirmDeleteSelected,
    startEdit
  } = props;

  return (
    <section
      className="detail-panel"
      aria-label="Memory detail"
      hidden={!selectedMemory && editorMode === "create"}
    >
      {selectedMemory ? (
        <>
          <div className="detail-heading">
            <div className="detail-title-block">
              <p className="eyebrow">
                {label(selectedMemory.kind)}
                {selectedMemory.categories[0]
                  ? ` · ${selectedMemory.categories[0].name}`
                  : ""}
              </p>
              <h2>{selectedMemory.title}</h2>
              <p className="detail-subtitle">
                Updated {formatRelative(selectedMemory.updatedAt)} · captured{" "}
                {selectedMemory.source.type === "MANUAL" ? "" : "by "}
                {captureSourceLabel(selectedMemory.source.type)}
                {selectedMemory.lastConfirmedAt ? " · confirmed by you" : ""}
              </p>
            </div>
            <div className="detail-actions" aria-label="Memory actions">
              <Button
                type="button"
                variant="secondary"
                onClick={startEdit}
                disabled={isSaving}
              >
                <Pencil aria-hidden="true" size={16} strokeWidth={2.5} />
                Edit
              </Button>
              <div className="detail-secondary-actions">
                {selectedMemory.status === "ARCHIVED" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSaving}
                    onClick={() => patchSelected("ACTIVE")}
                  >
                    <ArchiveRestore
                      aria-hidden="true"
                      size={16}
                      strokeWidth={2.5}
                    />
                    Restore
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSaving}
                    onClick={() => patchSelected("ARCHIVED")}
                  >
                    <Archive aria-hidden="true" size={16} strokeWidth={2.5} />
                    Archive
                  </Button>
                )}
              </div>
              <div className="detail-danger-actions">
                <DeleteButton
                  type="button"
                  disabled={isSaving}
                  onClick={() => void confirmDeleteSelected()}
                />
              </div>
            </div>
          </div>

          <section
            className="privacy-summary"
            aria-label="Privacy and status summary"
          >
            <div className="memory-dot-strip">
              <DotBadge kind="sensitivity" value={selectedMemory.sensitivity} />
              <span>{label(selectedMemory.status)}</span>
              <span>{label(selectedMemory.reviewState)}</span>
              <span>{label(selectedMemory.source.type)}</span>
            </div>
            {!selectedMemoryIsVisible ? (
              <p className="selection-note">
                This memory is outside the current list page or filters.
              </p>
            ) : null}
            {isHighSensitivity(selectedMemory.sensitivity) ? (
              <p className="risk-note" data-tone="risk">
                This memory has elevated sensitivity and should only appear in
                narrow, confirmed disclosures.
              </p>
            ) : null}
          </section>

          <p className="memory-body">{selectedMemory.body}</p>

          <dl className="memory-facts" aria-label="Memory facts">
            <div>
              <dt>Confidence</dt>
              <dd>{Math.round(selectedMemory.confidence * 100)}%</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{formatDate(selectedMemory.expiresAt) ?? "No expiration"}</dd>
            </div>
            <div>
              <dt>Added</dt>
              <dd>{formatDateTime(selectedMemory.createdAt)}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {label(selectedMemory.source.type)}
                {selectedMemory.source.uri
                  ? ` · ${selectedMemory.source.uri}`
                  : ""}
              </dd>
            </div>
          </dl>
          {selectedMemory.categories.length > 0 ? (
            <div
              className="chips memory-category-chips"
              aria-label="Memory categories"
            >
              {selectedMemory.categories.map((category) => (
                <span key={category.key}>{category.name}</span>
              ))}
            </div>
          ) : (
            <p className="muted">No categories assigned.</p>
          )}
          <MemoryProvenancePanel
            isLoading={isLoadingProvenance}
            provenance={selectedMemoryProvenance}
          />
        </>
      ) : editorMode !== "create" ? (
        <div className="empty-detail">
          <p className="eyebrow">No selection</p>
          <h2>Select a memory</h2>
          <p className="muted">
            Open a memory from the list, or create a new one.
          </p>
        </div>
      ) : null}
    </section>
  );
}
