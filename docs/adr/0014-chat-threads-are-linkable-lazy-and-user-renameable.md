# 0014 — Chat Threads Are Linkable, Lazy, And User-Renameable

Date: 2026-06-29

Status: accepted

## Context and problem

Passive empty thread creation made history noisy and created privacy/product cleanup questions. Lazy draft creation keeps history meaningful, while direct thread URLs and rename controls make transcripts navigable without promoting chat logs into durable memories. Automatic title generation may use the configured chat model for early unlocked threads, but manual rename sets `titleLocked = true` and automatic updates must include that lock in the database update path.

## Decision outcome

Persisted chat transcripts are first-class thread records in the authenticated UI. The web app lists non-empty current-user threads, supports direct `/chat/[threadId]` URLs, lets users rename threads, and starts new conversations as local drafts until the first message is accepted with `startNewThread: true`. Legacy `?surface=chat&threadId=...` links redirect to the route form.

## Consequences

An empty draft creates no database thread. First-turn persistence must update its URL without discarding text the user is already composing.
