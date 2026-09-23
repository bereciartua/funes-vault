import {
  type ChatProviderDisclosure,
  type FunesDataParts
} from "@funes-vault/shared";
import { type UIMessageStreamWriter } from "ai";

import type { FunesUIMessage } from "./chat-generation.service.js";
import { type StewardToolEvent } from "./steward-tool.types.js";
export class StewardEventWriter {
  constructor(
    private readonly writer?: UIMessageStreamWriter<FunesUIMessage>
  ) {}

  writeStewardEvent(event: StewardToolEvent) {
    switch (event.type) {
      case "memory-citation":
        this.writeMemoryCitation(event.data);
        break;
      case "policy-decision":
        this.writePolicyDecision(event.data);
        break;
      case "memory-suggestion":
        this.writeMemorySuggestion(event.data);
        break;
      case "audit-event":
        this.writeAuditEvent(event.data);
        break;
      case "tool-trace":
        this.writeToolTrace(event.data);
        break;
    }
  }

  writeMemoryCitation(data: FunesDataParts["memory-citation"]) {
    this.writer?.write({
      type: "data-memory-citation",
      id: `${data.memoryId}-${data.ref ?? "citation"}`,
      data
    });
  }

  writeProviderDisclosure(data: ChatProviderDisclosure) {
    this.writer?.write({
      type: "data-provider-disclosure",
      id: `${data.provider}-${data.model}`,
      data
    });
  }

  writePolicyDecision(data: FunesDataParts["policy-decision"]) {
    this.writer?.write({
      type: "data-policy-decision",
      id: `${data.operation}-${data.policyId ?? "none"}-${Date.now()}`,
      data
    });
  }

  writeMemorySuggestion(data: FunesDataParts["memory-suggestion"]) {
    this.writer?.write({
      type: "data-memory-suggestion",
      id: data.suggestionId ?? `failed-${Date.now()}`,
      data
    });
  }

  writeAuditEvent(data: FunesDataParts["audit-event"]) {
    this.writer?.write({
      type: "data-audit-event",
      id: data.auditEventId,
      data
    });
  }

  writeToolTrace(data: FunesDataParts["tool-trace"]) {
    this.writer?.write({
      type: "data-tool-trace",
      id: data.toolCallId,
      data
    });
  }
}
