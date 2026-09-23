# 0033 — Settings Uses Menu Plus One Inline-Editing Pane

Date: 2026-07-10

Status: accepted

## Context and problem

The settings menu turned the old list-plus-detail workbenches into three-column layouts. Real client names, dates, and policy summaries wrapped or duplicated because the remaining content tracks no longer had enough room.

## Decision outcome

Every settings route uses a 240px section menu and one content pane capped near 720px. Details and editing expand inside the relevant feed row; settings routes do not add a permanent sibling detail panel.

## Consequences

Apps & access, Jobs, and Audit use hairline feeds with inline detail. Below 640px the section menu becomes a horizontally scrollable pill row above the same single content pane.
