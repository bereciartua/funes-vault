# 0012 — Web UI Component Strategy

Date: 2026-06-26

Status: accepted

## Context and problem

Funes Vault needs a consistent product language for repeated intents such as primary actions, secondary actions, destructive actions, icon actions, navigation selection, and confirmation dialogs. Radix primitives provide accessible behavior for components such as alert dialogs without forcing a full third-party visual system. The app should keep the component source in the repository and compose it with semantic CSS classes and global design tokens, rather than adopting a heavier opinionated UI framework.

## Decision outcome

Use source-owned UI primitives backed by Radix where accessibility and interaction behavior matter.

## Consequences

The repository owns component styling and maintenance. Radix supplies interaction behavior, but accessible labels, focus restoration and confirmation copy still need tests.
