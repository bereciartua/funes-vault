"use client";
import type { MemoryCategory } from "@funes-vault/shared";

import { DeleteAccountPanel } from "./DeleteAccountPanel";
import { ExportPanel } from "./ExportPanel";
import { ImportPanel } from "./ImportPanel";
export function DataControl({ categories }: { categories: MemoryCategory[] }) {
  return (
    <section className="data-page" aria-label="Data controls">
      <section className="data-grid">
        <ExportPanel categories={categories} />
        <ImportPanel />
      </section>
      <DeleteAccountPanel />
    </section>
  );
}
