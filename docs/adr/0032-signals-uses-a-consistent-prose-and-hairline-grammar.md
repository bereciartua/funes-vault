# 0032 — Signals Uses A Consistent Prose-And-Hairline Grammar

Date: 2026-07-10

Status: accepted

## Context and problem

The first Signals pass established the palette and page structure, but several management surfaces retained the old fieldset, badge-cluster, and master-detail vocabulary. Recoloring those components preserved the visual density and duplicated policy facts instead of making access decisions easier to read.

## Decision outcome

Signals surfaces follow one shared grammar: one focal content column, hairline section and row separators, prose instead of key-value tables, labeled dots instead of status pills, one solid primary action per view, faint eyebrows with strong values, sentence-form warnings, and humanized domain keys.

## Consequences

New UI states use the visual conventions described in this decision when no mockup covers them. Genuine category/request chips remain allowed, destructive actions stay quiet until confirmation, and reusable prose and label helpers remain centralized in apps/web/src/lib/domain/.
