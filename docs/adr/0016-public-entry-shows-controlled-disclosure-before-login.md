# 0016 — Public Entry Shows Controlled Disclosure Before Login

Date: 2026-07-01

Status: superseded

Superseded by: [0041](0041-public-sign-in-and-runtime-demo.md).

## Context and problem

Funes Vault needs enough public context to explain why controlled
memory sharing matters, but it should not become a broad marketing site or make
privacy claims ahead of implementation. Keeping auth on the same page preserves
the fast local path while making the privacy model visible before account
creation.

## Decision outcome

Anonymous users see a single public home page with the auth form on
the first page, a concrete disclosure-preview visual, and factual copy about
user-owned AI memory. Authenticated users still go directly to the vault after
session detection. Seeded demo credentials are not prefilled; demo access is
shown only in local/non-production builds or when `NEXT_PUBLIC_DEMO_LOGIN=true`.

## Consequences

At this stage, authentication remained directly on the landing page and demo visibility could be selected by a build flag. Later records replace both details without changing this historical decision.
