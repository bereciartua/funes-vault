# 0017 — Stored Memories Are Embeddable By Default

Date: 2026-07-01

Status: accepted

## Context and problem

Semantic discovery is core to the vault experience. Keeping sensitive and restricted memories out of embeddings caused relevant stored facts to be missed or buried, especially in memory chat where semantic search helped unrelated low-sensitivity memories outrank exact sensitive matches. Secret-like material is still rejected before durable storage, and embedding providers remain replaceable so future local/self-hosted embeddings can reduce third-party exposure.

## Decision outcome

The default embedding sensitivity ceiling is `SECRET`, making every stored memory sensitivity level eligible for provider embeddings unless an operator lowers `EMBEDDINGS_MAX_SENSITIVITY`.

## Consequences

The default permits provider transmission of any stored sensitivity level. Deployments with stricter processor boundaries must configure a lower ceiling before generating embeddings.
