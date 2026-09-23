import {
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";

import { safeErrorMessage as safeToolErrorMessage } from "../chat/chat.utils.js";
import { realtimeToolSchemas } from "../chat/steward-tools.js";
import { apiEnv } from "../config.js";
import { voiceTranscriptionModel } from "./voice.config.js";
import { realtimeMintTimeoutMs } from "./voice.constants.js";
const realtimeClientSecretUrl =
  "https://api.openai.com/v1/realtime/client_secrets";
const clientSecretTtlSeconds = 120;
type MintedClientSecret = {
  value: string;
  expiresAt: string;
};
/**
 * Owns short-lived provider credential minting.
 * Tenant boundary: caller verifies the owner before minting an ephemeral credential.
 * Audit: no persistence; only sanitized provider failures are logged.
 */
@Injectable()
export class RealtimeClientService {
  private readonly logger = new Logger(RealtimeClientService.name);
  async mintClientSecret(input: {
    model: string;
    voice: string;
    instructions: string;
  }): Promise<MintedClientSecret> {
    let response: Response;

    try {
      response = await fetch(realtimeClientSecretUrl, {
        method: "POST",
        // The mint call gates session start; a hung upstream should fail
        // fast into the ServiceUnavailableException below.
        signal: AbortSignal.timeout(realtimeMintTimeoutMs),
        headers: {
          Authorization: `Bearer ${apiEnv().OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          expires_after: {
            anchor: "created_at",
            seconds: clientSecretTtlSeconds
          },
          session: {
            type: "realtime",
            model: input.model,
            instructions: input.instructions,
            tools: realtimeToolSchemas(),
            tool_choice: "auto",
            audio: {
              input: {
                transcription: {
                  model: voiceTranscriptionModel()
                }
              },
              output: {
                voice: input.voice
              }
            }
          }
        })
      });
    } catch (error) {
      this.logger.warn(
        `Realtime client secret minting failed: ${safeToolErrorMessage(error)}`
      );
      throw new ServiceUnavailableException(
        "The voice provider is unreachable."
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `Realtime client secret minting returned ${response.status}`
      );
      throw new ServiceUnavailableException(
        "The voice provider rejected the session request."
      );
    }

    const payload = (await response.json()) as {
      value?: string;
      expires_at?: number;
    };

    if (!payload.value) {
      throw new ServiceUnavailableException(
        "The voice provider returned an unusable session token."
      );
    }

    return {
      value: payload.value,
      expiresAt: new Date(
        payload.expires_at
          ? payload.expires_at * 1000
          : Date.now() + clientSecretTtlSeconds * 1000
      ).toISOString()
    };
  }
}
