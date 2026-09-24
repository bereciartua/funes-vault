# 0018 — Policies Are Managed Inside Apps & Access

Date: 2026-07-03

Status: superseded

Superseded by: [0044](0044-app-permissions-and-stated-purpose.md)

## Context and problem

A policy cannot exist without a client (`Policy.clientId` is required with cascade delete), and the old sibling-section layout forced users to create a client in one section, switch sections, and re-pick the same client from a dropdown. It also allowed duplicate policies for the same client and purpose, of which the evaluator silently used only the most recently updated one. Folding policy management into the client detail view matches the domain hierarchy, and the uniqueness constraint makes stored policies match evaluation behavior. Cross-client risk visibility remains through the overview's broadest-policy card and per-client policy badges.

## Decision outcome

The standalone Policies settings section is removed. Policies are created, edited, and deleted inside the client detail view of the renamed `Apps & access` settings section (URL value stays `clients`; legacy `settings=policies` links map to it). Each client can have at most one policy per purpose, enforced by a unique `(clientId, purpose)` database constraint.

## Consequences

Policy editing is contextual to a client. Legacy policy links need a redirect, and client summaries must show the actual policy reach.
