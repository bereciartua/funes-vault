# 0030 — Capture Trends Use UTC Day Buckets

Date: 2026-07-09

Status: accepted

## Context and problem

UTC gives deterministic server behavior and avoids silently using the deployment host's local timezone. Users far from UTC may see a capture near midnight appear on an adjacent local day.

## Decision outcome

The 30-day capture series returned by `/v1/overview` is bucketed and zero-filled by UTC calendar day.

## Consequences

If local-day precision becomes important, the API will gain an explicit timezone parameter rather than changing the existing response semantics.
