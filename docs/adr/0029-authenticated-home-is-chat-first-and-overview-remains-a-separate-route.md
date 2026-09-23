# 0029 — Authenticated Home Is Chat-First And Overview Remains A Separate Route

Date: 2026-07-09

Status: accepted

## Context and problem

The aggregate overview had become too busy to serve simultaneously as a landing page and a privacy dashboard. Users need a low-friction place to capture or ask first, without exposing memory titles on landing.

## Decision outcome

`/` is the minimal authenticated home with a single memory/chat composer and three shoulder-surf-safe aggregate signals. The fuller privacy overview remains available at `/overview`; legacy `?surface=overview` URLs redirect there.

## Consequences

Home and overview share one `/v1/overview` request; no memory content is added to home; the service worker precaches both route shells.
