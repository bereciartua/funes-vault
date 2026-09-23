"use client";
import { type FunesDataParts } from "@funes-vault/shared";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { label } from "../../../lib/domain/labels";
const markdownUrlTransform = (url: string) => {
  if (url.startsWith("funes-memory:")) {
    return url;
  }

  try {
    const parsed = new URL(url, "https://funes-vault.local");
    if (
      parsed.protocol === "https:" ||
      parsed.protocol === "http:" ||
      parsed.protocol === "mailto:"
    ) {
      return url;
    }
  } catch {
    return "";
  }

  return "";
};
function markdownWithCitationLinks(
  text: string,
  citations: Array<FunesDataParts["memory-citation"]>
) {
  const citationsByRef = new Map(
    citations
      .filter((citation) => citation.ref)
      .map((citation) => [citation.ref, citation])
  );

  return text.replace(/\[(\d+)\]/g, (match, citationNumber: string) => {
    const citation =
      citationsByRef.get(match) ?? citations[Number(citationNumber) - 1];

    if (!citation) {
      return match;
    }

    return `[${citationNumber}](funes-memory:${encodeURIComponent(citation.memoryId)})`;
  });
}
export function MemoryMarkdown(input: {
  text: string;
  citations: Array<FunesDataParts["memory-citation"]>;
  onOpenMemory: (memoryId: string) => Promise<void>;
}) {
  const citationsById = new Map(
    input.citations.map((citation) => [citation.memoryId, citation])
  );
  const markdown = markdownWithCitationLinks(input.text, input.citations);

  return (
    <div className="memory-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={markdownUrlTransform}
        components={{
          a({ children, href }) {
            if (href?.startsWith("funes-memory:")) {
              const memoryId = decodeURIComponent(
                href.replace(/^funes-memory:/, "")
              );
              const citation = citationsById.get(memoryId);

              return (
                <button
                  type="button"
                  className="inline-citation"
                  aria-label={
                    citation
                      ? `Citation ${children}: ${citation.title}`
                      : `Citation ${children}`
                  }
                  title={
                    citation
                      ? `${citation.title} · ${label(citation.sensitivity)}`
                      : undefined
                  }
                  onClick={() => void input.onOpenMemory(memoryId)}
                >
                  {children}
                </button>
              );
            }

            if (!href) {
              return <span>{children}</span>;
            }

            return (
              <a href={href} rel="noreferrer" target="_blank">
                {children}
              </a>
            );
          }
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
