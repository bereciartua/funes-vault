import { MemorySensitivity } from "@funes-vault/db";
import {
  EMBEDDING_DIMENSIONS,
  sensitivityRank
} from "@funes-vault/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import OpenAI from "openai";

import { apiEnv } from "../config.js";

export const EMBEDDINGS_PROVIDER = Symbol("EMBEDDINGS_PROVIDER");

export type EmbeddingGeneration = {
  provider: string;
  model: string;
  vector: number[];
  metadata: Record<string, unknown>;
};

export interface EmbeddingsProvider {
  readonly provider: string;
  readonly model: string;
  generate(input: string): Promise<EmbeddingGeneration>;
}

/** Embedding-provider adapters convert supplied text into vectors. The embedding service applies the owner and sensitivity boundary before calling them. */
@Injectable()
export class OpenAIEmbeddingsProvider implements EmbeddingsProvider {
  readonly provider = "openai";
  readonly model = apiEnv().OPENAI_EMBEDDING_MODEL;

  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = apiEnv().OPENAI_API_KEY;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          timeout: apiEnv().OPENAI_TIMEOUT_MS,
          maxRetries: 2
        })
      : null;
  }

  async generate(input: string): Promise<EmbeddingGeneration> {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input,
      dimensions: EMBEDDING_DIMENSIONS
    });
    const embedding = response.data[0]?.embedding;

    if (!embedding) {
      throw new Error("OpenAI embeddings response did not include a vector");
    }

    return {
      provider: this.provider,
      model: this.model,
      vector: embedding,
      metadata: {
        usage: response.usage,
        dimensions: embedding.length
      }
    };
  }
}

function maxEmbeddingSensitivity() {
  const configured = apiEnv().EMBEDDINGS_MAX_SENSITIVITY;

  if (
    configured &&
    Object.values(MemorySensitivity).includes(configured as MemorySensitivity)
  ) {
    return configured as MemorySensitivity;
  }

  return MemorySensitivity.SECRET;
}

export function shouldEmbedSensitivity(sensitivity: MemorySensitivity) {
  return (
    sensitivityRank[sensitivity] <= sensitivityRank[maxEmbeddingSensitivity()]
  );
}

export function InjectEmbeddingsProvider() {
  return Inject(EMBEDDINGS_PROVIDER);
}
