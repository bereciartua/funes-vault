# 0042 — Feature-owned CSS

Date: 2026-09-22

Status: accepted

## Context and problem

The semantic styling decision removed competing systems, but its global layer imports still coupled unrelated pages and responsive rules.

## Decision outcome

Keep semantic CSS and shared tokens. Import each feature or component stylesheet from its owner, including shared composer styles. Keep responsive rules next to the feature rules.

## Consequences

This supersedes ADR 0026’s global layer arrangement while retaining its semantic CSS choice. A route loaded first must receive the same component styling as one reached by navigation.
