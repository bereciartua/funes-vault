# 0007 — Semantic Embeddings

Date: 2026-06-26

Status: accepted

## Context and problem

OpenAI embeddings provide strong semantic search quickly. The implementation should keep the provider replaceable.

## Decision outcome

Use the OpenAI embeddings API for the first version.

## Consequences

Embedding generation sends eligible text to OpenAI and requires credentials. Operators can lower the sensitivity ceiling or leave embeddings unconfigured; lexical retrieval remains available.
