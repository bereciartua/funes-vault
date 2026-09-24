# 0045 — Releases publish from verified main merges

Date: 2026-09-24

Status: accepted

## Context and problem

The production packaging contract in [ADR 0019](0019-oci-images-and-compose-shaped-config-are-the-packaging-contract.md)
requires matching container versions. Manual version edits and tag-triggered image
publication can drift from reviewed release notes and tested source. A tag created
with `GITHUB_TOKEN` also does not normally trigger a separate push workflow.

## Decision outcome

Use `develop` for integration and `main` for production. Feature/preparation PRs
are squash-merged into `develop`; release PRs from `develop` or `hotfix/` branches
use merge commits into `main`. Synchronize `main` back into `develop` after release.

Agents choose the highest compatibility impact in the complete candidate using the
[release policy](../releasing.md#choose-the-version-autonomously), record the
rationale, and prepare one version plus a fingerprint of the reviewed source.
Successful push CI for the current release merge on `main` triggers validation,
an immutable annotated tag, a direct call to the reusable image workflow at that
exact SHA, and a GitHub Release after all image builds succeed.

This supersedes publication triggered by a `v*` tag push. Manual workflow dispatch
and the local publisher produce only SHA-tagged diagnostic images. Production
deployment remains separately authorized and follows the release's migration plan.

## Consequences

Publication is tied to a tested and reviewed commit; stale assessments, failed CI,
conflicting tags and partial image builds cannot produce a completed release.
During a pending release, unrelated integration changes wait or require a new
assessment. A merged hotfix advances that assessment's baseline without manual
plan edits. Recovery, compatibility examples and operational prerequisites live in
the [runbook](../releasing.md).

Workflow YAML is loaded from `develop`, while release scripts come from the tested
`main` merge. Workflow changes must remain compatible with scripts on the production
line, including during hotfixes. Branch protections and tag/package permissions
remain repository administration responsibilities.
