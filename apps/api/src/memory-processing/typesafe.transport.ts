import { Injectable } from "@nestjs/common";
import {
  type EntryType,
  type Questions,
  TypeSafeClient
} from "@typesafe-ai/sdk";

import { apiEnv } from "../config.js";
import type { ProcessingContext } from "./contracts.js";
/** Runs bounded TypeSafe requests using supplied processing configuration. Callers check the owner's provider choice and scope the payload; transport performs no vault writes. */
@Injectable()
export class TypeSafeTransport {
  async ask(
    state: unknown,
    questions: Questions,
    model: string,
    context: ProcessingContext
  ) {
    await context.beforeCall({ state, questions });
    context.signal.throwIfAborted();
    const client = new TypeSafeClient({
      apiKey: apiEnv().TYPESAFE_API_KEY,
      defaultModel: model,
      logLevel: "off",
      fetch: async (url, init) => {
        await context.beforeCall({ state, questions });
        context.signal.throwIfAborted();

        return fetch(url, init);
      },
      retry: { maxRetries: 1 }
    });

    return client.systemOne(
      { state: state as EntryType, questions, model },
      {
        signal: context.signal,
        timeout: Math.max(1, context.deadline - Date.now())
      }
    );
  }
}
