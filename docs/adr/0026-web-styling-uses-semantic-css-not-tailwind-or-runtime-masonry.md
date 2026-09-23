# 0026 — Web Styling Uses Semantic CSS, Not Tailwind Or Runtime Masonry

Date: 2026-07-09

Status: superseded

Superseded by: [0042](0042-feature-owned-css.md).

## Context and problem

The July 2026 interface review found that the app had two styling systems: a large bespoke semantic stylesheet plus Tailwind used only in a couple of places. It also found Packery powering one overview grid, adding a GPL/commercial-license dependency and an imperative layout effect for cards that only need regular and wide spans.

## Considered options

(1) standardize on semantic CSS by removing Tailwind and splitting the existing stylesheet into named layers; (2) standardize on Tailwind v4 by registering the tokens and migrating components over time. Option 1 was chosen because the app already has a broad semantic class vocabulary, shared UI primitives, and restrained product surfaces; it removes dependencies immediately with much less churn.

## Decision outcome

The web app uses semantic CSS classes and source-owned Radix-backed primitives as its styling system. Tailwind CSS is removed from `apps/web`, and the former single global stylesheet is split into imported layers for tokens, base rules, primitives, public/auth surfaces, shell, overview, vault, chat, management, responsive rules, and voice. The overview card layout uses CSS grid with dense auto-flow; Packery is removed.

## Consequences

New and touched web UI should add or reuse semantic classes in the appropriate `apps/web/app/styles/*.css` file instead of Tailwind utilities. Layout effects should not be introduced for static card grids unless CSS cannot express the behavior. Tailwind can be reconsidered later only as a deliberate migration, not as an incidental utility escape hatch.
