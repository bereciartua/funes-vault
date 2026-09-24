# Memory processing providers

Memory extraction turns a conversation into checked, durable claims or reviewable
suggestions. Consolidation reviews related saved memories. A classifier predicts
labels for text; an LLM generates or normalizes text. Neither prediction nor generated
prose authorizes a database write.

The configuration names borrow the familiar fast-judgment/deliberate-reasoning
metaphor: **System 1** (`system_1`) is the classifier-led pipeline; **System 2**
(`system_2`) is the LLM pipeline. They are names, not measured speed or quality
claims. TypeSafe is the classifier vendor, **Jev** its model, and **Noul probabilities**
are its SDK's per-label probability outputs used by application thresholds.

Conversational extraction and semantic consolidation are independent deployment tasks. Each defaults to System 2 (OpenAI). System 1 uses TypeSafe Jev; extraction additionally uses OpenAI to normalize selected passages. Chat answering, explicit memory editing, voice transport, embeddings and retrieval retain their existing providers. External MCP suggestions, manual CRUD, quick capture, import and standalone guided onboarding keep their contracts.

## Configuration

API and worker must receive identical task settings and restart together. Empty selectors retain credential-free vault access and report unavailable capabilities; explicitly selecting a task validates its credentials at startup. Credentials remain server-side environment secrets.

| Variable                                                                                      | Default                  |
| --------------------------------------------------------------------------------------------- | ------------------------ |
| MEMORY_EXTRACTION_SYSTEM / MEMORY_CONSOLIDATION_SYSTEM                                        | system_2 when omitted    |
| MEMORY_EXTRACTION_LLM_MODEL / MEMORY_CONSOLIDATION_LLM_MODEL / MEMORY_NORMALIZATION_LLM_MODEL | OPENAI_CHAT_MODEL        |
| MEMORY_EXTRACTION_JEV_MODEL / MEMORY_CONSOLIDATION_JEV_MODEL                                  | jev-1.13.0               |
| TYPESAFE_API_KEY                                                                              | unset                    |
| MEMORY_EXTRACTION_TIMEOUT_MS                                                                  | 15000                    |
| MEMORY_CONSOLIDATION_TIMEOUT_MS                                                               | 60000                    |
| MEMORY_EXTRACTION_WRITE_MODE                                                                  | policy (or review)       |
| MEMORY_CONSOLIDATION_APPLY_MODE                                                               | user_setting (or review) |
| MEMORY_CONSOLIDATION_MAX_SENSITIVITY                                                          | INTERNAL                 |

For initial Jev use set the chosen selector to `system_1`, configure TypeSafe credentials, and set the relevant review override to `review`. Extraction needs OpenAI credentials in both systems. Jev consolidation independently works without OpenAI credentials. The user then enables the corresponding TypeSafe permission in Profile settings. Do not copy keys into configuration responses, logs or the browser.

The effective non-secret configuration and fingerprint are logged at startup and available through authenticated `GET /v1/memory-processing/capabilities`. Compare API and worker startup fingerprints after every deployment. A mismatch requires correcting environment variables and restarting both processes before enabling jobs. Existing voice sessions must reconnect after a switch.

## Processing and privacy

Jev extraction selects source passages, OpenAI normalizes only selected passages, and Jev independently checks support, atomicity, kind, sensitivity and each category. A rejected selection does not invoke normalization. No provider automatically falls back to another. Question/rubric v1 thresholds are conservative product rules, not measured accuracy. Distribution confidence, Noul probabilities and LLM confidence remain distinct diagnostics; candidate epistemic confidence is not replaced by classifier probability.

TypeSafe consent is version 1, separate for extraction and consolidation, revocable, and audited. Deployment selection is not user consent. Extraction sends unlabelled current text plus limited preceding context, so its disclosure happens before inferred sensitivity. Every stage checks permission and scans the complete outbound payload for secret-like content. Revocation stops subsequent stages and commit; already transmitted text cannot be recalled. Voice audio continues to go only to OpenAI Realtime. Consolidation filters known sensitivity and secret-like content before serialization. The new default INTERNAL ceiling intentionally skips sensitive memories; local expiration and exact duplicate maintenance are unchanged.

## Durable outcomes

Text clients should supply `submissionId` on both message routes. Uniqueness is per owner, including first-message thread creation; changed text under the same ID is a conflict. Voice clients supply `itemId` on finalized transcript requests. Uniqueness is per owned voice session/item/role; changed finalized text is rejected. Assistant transcripts never trigger extraction. A 60-second finalization window allows late user transcripts after session end. Eligibility uses the persisted transcript arrival time, so a valid source can be retried after the window closes without bypassing current processor permission checks. Older `voice_finalization_window_closed` outcomes remain retryable; transcripts actually received too late return `voice_transcript_arrived_too_late`; late tool mutations still require a live session.

One `MemoryExtractionRun` belongs to each source turn. Claims have attempt counters, expiring leases and claim tokens. Provider calls happen outside database transactions. Commit locks the owner/run, rechecks permission, validates the claim, and atomically writes candidates, suggestions/memories, provenance and durable result links. An expired owner cannot commit after a replacement claim. Cancellation before commit leaves no candidate writes; a completed commit survives answer failure. Source/candidate identity prevents retries from normalizing into duplicate writes.

Results distinguish completed no-op, partial, skipped and failed. Source-turn processing metadata survives reconnect; `GET /v1/memory-processing/sources/:sourceId` reads it and `POST .../:sourceId/retry` retries incomplete work. Completed turns never rerun on deployment changes. Ordinary retries use the original configuration snapshot, even after a deployment switch. Unavailable original credentials return `configuration_unavailable`. An explicit `POST .../:sourceId/reprocess` can adopt the current configuration for a failed or skipped run; it records the old and new fingerprints in an audit. Completed sources are never reprocessed.

Voice capture-result and completion calls wait up to 30 seconds for their bound user item to finish transcript persistence and extraction, including when a tool arrives before transcription. On timeout the server still returns the authoritative current status; pending is not evidence that a run is actively running. Starting a new utterance does not rebind an already waiting call. Skipped outcomes show their recovery reason, and the UI omits retries for expired voice sessions, changed voice configuration and secret-like input because replaying the same source cannot resolve those conditions.

The assistant can read `memory_capture_result`, but cannot submit arbitrary titles or bodies through the removed first-party `suggest_memory` tool. Corrections/retractions remain pending until searches and actual update/archive/reject operations provide reconciliation receipts. `complete_memory_capture` accepts only issued candidate IDs and handled/create/defer resolutions, is idempotent, and cannot create a retraction. Explicit editing remains an independently authorized first-party workflow.

Semantic consolidation uses supplied pair IDs, source versions and timestamps computed in code. Shared action validation preserves a canonical survivor and rejects self-archival, competing targets and archive cycles. Both automatic and reviewed archival recheck active status and content versions in the write transaction. Semantic progress is separate from deterministic maintenance. Expected memory exclusions (sensitivity, approval, expiration, possible credentials, or unavailable records) do not fail a run: jobs complete with aggregate skipped-memory counts and reasons. Excluded source versions remain uninspected so they can be reconsidered if eligibility changes. No memory bodies or secret values are added to these diagnostics.

Provider failures, missing configuration or consent, changed source versions and comparison limits still leave the job incomplete. Failed outcomes emit `JOB_FAILED`; completed runs, including expected exclusions, emit `JOB_COMPLETED`. The job detail explains the cause and offers Retry for transient failures. Cases requiring changed settings, permission, content or a new run explain that action instead. Older runs without exclusion reasons retain their recorded status and explicitly say those reasons were not recorded. Job details do not describe memory counts as pair comparisons.

Full vault export includes processing runs, pending candidate payloads, result links and consent records. Filtered memory exports omit unlabelled processing records. Import does not activate exported consent or replay extraction. Account deletion cascades processing records. Audits contain identifiers and operational metadata, never raw prompts, provider error bodies or credentials.

## Verification and live smoke

Ordinary CI uses synthetic sources and fake providers. Fixtures cover preferences, several claims, remember requests, acknowledgments, quotations, hypotheticals, third-person statements, confirmation, correction/retraction, scope, dates, negation, secrets and Spanish. Database integration tests cover routing, policy/review, tenant isolation, durable retries, revoked consent, cancellation, reconciliation and voice identity.

To exercise paid providers without writing to the vault, first build the API, then explicitly run:

```sh
MEMORY_EXTRACTION_SYSTEM=system_1 pnpm --filter @funes-vault/api smoke:memory-processing extraction remember
MEMORY_CONSOLIDATION_SYSTEM=system_1 pnpm --filter @funes-vault/api smoke:memory-processing consolidation
```

The smoke command uses committed synthetic fixtures only. `extraction all` runs the full fixture set; expected secret blocking is reported as such. It prints output, actual model versions, usage and elapsed time. These are observations, not quality or speed claims. Browser verification uses an isolated test vault, enables TypeSafe consent, sends synthetic claims, checks queued outcomes, then reviews them in the inbox. Real microphone/Realtime transport needs a separate manual session; mocked transport proves application integration only.

## Deployment

See [rollout and rollback](deployment-and-operations.md#memory-processing-rollout-and-rollback).

Vendor references: [primitives](https://docs.typesafe.ai/primitives), [models](https://docs.typesafe.ai/models), [SDK cancellation and retries](https://docs.typesafe.ai/sdk/javascript/api/interfaces/RequestOptions).

### Opt-in voice smoke

`e2e-live/voice-live.spec.ts` is discovered only by `playwright.live.config.ts`.
See [live verification](testing-and-release.md#live-provider-verification) for the
explicit synthetic-WAV and provider-credential command. It checks persistence and
processing structure, not exact model wording, and revokes its test consent afterward.
