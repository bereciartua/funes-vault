import {
  type ListCategoriesResponse,
  listCategoriesResponseSchema,
  type McpTransport,
  mcpTransportHeaderName,
  type MemoryRequestBundleResponse,
  memoryRequestBundleResponseSchema,
  type MemorySuggestionResponse,
  memorySuggestionResponseSchema
} from "@funes-vault/shared";

import type {
  RequestMemoryToolInput,
  SuggestMemoryToolInput
} from "./tools.js";

export type FunesVaultMcpConfig = {
  apiUrl?: string;
  appUrl?: string;
  clientToken?: string;
  transport?: McpTransport;
};

export type FunesVaultMcpApi = {
  getMemoryRequest(requestId: string): Promise<MemoryRequestBundleResponse>;
  requestMemory(
    input: RequestMemoryToolInput
  ): Promise<MemoryRequestBundleResponse>;
  suggestMemory(
    input: SuggestMemoryToolInput
  ): Promise<MemorySuggestionResponse>;
  listMemoryCategories(): Promise<ListCategoriesResponse>;
};

const defaultApiUrl = "http://localhost:4000";

export class FunesVaultApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "FunesVaultApiError";
  }
}

export class FunesVaultApiClient implements FunesVaultMcpApi {
  private readonly apiUrl: string;
  private readonly clientToken: string;
  private readonly transport: McpTransport;

  constructor(config: FunesVaultMcpConfig = {}) {
    this.apiUrl = normalizeBaseUrl(
      config.apiUrl ?? process.env.FUNES_VAULT_API_URL ?? defaultApiUrl
    );
    this.clientToken =
      config.clientToken ?? process.env.FUNES_VAULT_CLIENT_TOKEN ?? "";
    this.transport = config.transport ?? "stdio";
  }

  async verifyToken() {
    try {
      await this.listMemoryCategories();

      return true;
    } catch (error) {
      if (
        error instanceof FunesVaultApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        return false;
      }

      throw error;
    }
  }

  async requestMemory(input: RequestMemoryToolInput) {
    const response = await this.post("/v1/memory-requests", input);

    return memoryRequestBundleResponseSchema.parse(response);
  }

  async getMemoryRequest(requestId: string) {
    return memoryRequestBundleResponseSchema.parse(
      await this.get(
        `/v1/memory-requests/${encodeURIComponent(requestId)}/result`
      )
    );
  }

  async suggestMemory(input: SuggestMemoryToolInput) {
    const response = await this.post("/v1/memory-suggestions", input);

    return memorySuggestionResponseSchema.parse(response);
  }

  async listMemoryCategories() {
    const response = await this.get("/v1/memory-categories");

    return listCategoriesResponseSchema.parse(response);
  }

  private async get(path: string) {
    return this.fetchJson(path, { method: "GET" });
  }

  private async post(path: string, body: unknown) {
    return this.fetchJson(path, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  private async fetchJson(path: string, init: RequestInit): Promise<unknown> {
    if (!this.clientToken) {
      throw new Error("FUNES_VAULT_CLIENT_TOKEN is required");
    }

    const response = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(30_000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.clientToken}`,
        [mcpTransportHeaderName]: this.transport,
        ...init.headers
      }
    });
    if (!response.ok) {
      throw new FunesVaultApiError(
        `Funes Vault API request failed (${response.status})`,
        response.status
      );
    }

    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;

    return body;
  }
}

function normalizeBaseUrl(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }

  return value.slice(0, end);
}
