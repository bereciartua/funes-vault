# 0005 — Frontend Framework

Date: 2026-06-26

Status: accepted

## Context and problem

Next.js fits the desired web app, memory management UI, and Vercel AI SDK integration.

## Decision outcome

Use Next.js for the web application.

## Consequences

The web app needs a Node runtime for server routes. Features must respect server/client boundaries and keep private state out of shared caches.
