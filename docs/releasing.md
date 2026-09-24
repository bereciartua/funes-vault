# Releasing Funes Vault

This is the maintainer and AI-agent runbook. Release preparation is local and
reviewable; publication runs in GitHub Actions. Deployment is a separate operation.
Use Node 24, the pinned pnpm, Git and authenticated `gh`. Do not install a Git Flow
extension: the repository uses ordinary branches and pull requests.

## Authorization and responsibilities

- **Prepare a release** authorizes assessing compatibility, choosing the version,
  updating metadata and notes, running checks, and opening preparation/release PRs.
  Leave them open for review unless merging is already authorized.
- **Publish the release** also authorizes merging its ready PRs according to branch
  policy. Merging the release PR into `main` opts into automatic tagging, image
  publication and the GitHub Release after successful CI. Do not ask separately
  for routine version arithmetic or each automated step.
- **Deploy the release** authorizes an explicitly named environment's upgrade and
  its documented migration/verification procedure. Preparation or publication alone
  does not authorize deployment, database resets or repository visibility changes.
- Existing explicit user instructions take precedence. If the scope is unclear,
  complete the reviewable preparation first. Ask only about missing authorization
  or a concrete compatibility-policy gap, not a decision this policy resolves.

The agent evaluates semantics and writes notes. Scripts perform version arithmetic,
align metadata and reject inconsistent or stale plans. The scripts do not claim to
prove compatibility from commit subjects or a scan for breaking-change keywords.

## Choose the version autonomously

Funes uses one stable `X.Y.Z` version across its packages, runtime OpenAPI document,
changelog, Git tag and container images. For releases from 1.0.0 onward, compare
the entire candidate with the latest stable release on the production line.
Review the actual diff, tests and migration notes, using PR descriptions and
Conventional Commit subjects as evidence rather than the final authority.

| Impact | Rule                                                                                             | Examples                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch  | Preserve supported contracts while correcting behavior or maintaining the project.               | Fix an expired-session check; optimize retrieval without changing results; update dependencies compatibly; change internal layout/CSS; improve release tooling or docs.                       |
| Minor  | Add supported capabilities while all existing supported uses remain compatible.                  | Add an optional HTTP field with a compatible default; add an MCP tool; add an opt-in feature or non-destructive automatic migration.                                                          |
| Major  | An existing supported use needs adaptation, loses compatibility, or changes authority semantics. | Remove/rename an API or MCP field; reject accepted enum values; drop an import format; require a renamed deployment variable without fallback; change which permissions authorize disclosure. |

Use the highest impact present: a release containing patches and one breaking
change is major. Size of the diff, number of PRs, marketing significance, a new
database migration, and a UI redesign do not by themselves determine the bump.
No prerelease or build-metadata versions are supported by this automation yet.

Assess every supported surface; record "unchanged" where appropriate:

1. **HTTP:** documented routes, shared request/response contracts, accepted fields
   and enums, error contracts and client-visible behavior.
2. **MCP:** tool names, input/output schemas, accepted aliases and protocol behavior.
3. **Identity/OAuth:** login, token/grant compatibility, refresh and revocation.
4. **Authority:** app permissions, disclosure approvals and processing consent.
   Requiring owners to reconstruct permissions or invalidating previously valid
   approvals because the authority model changed is a major change.
5. **Data:** supported export/import formats, preservation of existing vault data
   and the documented upgrade path from the previous release.
6. **Deployment:** documented environment variables, image/service names, runtime
   requirements, routes and operator configuration.

Internal functions, private database layout, unspecified ordering and accidental
security vulnerabilities are not supported contracts. Correcting a bypass to
restore documented authorization is normally patch; changing the documented
authority model is major. An additive migration that preserves data and supported
behavior is not automatically major. Removing previously supported import formats
is major even when the live database migrates automatically. Do not reset a real
vault to manufacture a compatible upgrade.

For ambiguity, look for evidence in published docs, contracts, tests and previous
release notes. Ask only when that evidence cannot establish whether the use was
supported. Record the resolved boundary here for future releases. Do not silently
choose a larger bump as a substitute for investigating uncertainty.

### Worked decisions

- `1.4.2` plus compatible fixes → `1.4.3`.
- `1.4.2` plus fixes and an optional new MCP tool → `1.5.0`.
- `1.4.2` plus those changes and removal of an MCP alias → `2.0.0`.
- The app-permissions changes following `1.0.0` require **`2.0.0`**: they change
  authorization semantics, remove accepted MCP aliases and drop v1 export import
  compatibility. The additive SQL migration does not negate those breaks. See
  [the migration guide](deployment-and-operations.md#app-permissions-migration).

Write a concise rationale outside the checkout, for example `/tmp/funes-release.md`:

```markdown
Selected major: 1.0.0 → 2.0.0.

- MCP: removed snake_case aliases; integrations must update inputs.
  Evidence: CHANGELOG.md and the MCP schemas/tests in packages/mcp.
- Authority: app permissions replace purpose-selected policies and old approvals.
  Evidence: docs/adr/0044-app-permissions-and-stated-purpose.md.
- Data: v1 exports cannot be imported; live data uses a documented migration.
  Evidence: docs/deployment-and-operations.md#app-permissions-migration.
- HTTP, OAuth and deployment: record the actual findings from the release diff.
```

Replace examples and placeholders with verified findings. Never infer that a
surface is unchanged solely because its directory did not change.

## Prepare and review

1. Fetch branches and tags with `git fetch origin --prune --tags`. Use a clean,
   isolated checkout. Confirm the previous production release has been merged back
   into `develop`; `git merge-base --is-ancestor origin/main origin/develop` should
   succeed. If it does not, open a `main → develop` synchronization PR first and
   merge it with a **merge commit** under the existing merge authorization.
2. Inspect `git log <previous-tag>..origin/develop` and
   `git diff <previous-tag> origin/develop`. Assess all changes using the policy
   above. Create `chore/release-X.Y.Z` from `origin/develop`.
3. Complete `CHANGELOG.md`'s `Unreleased` entries, including breaking changes,
   migration ordering, compatibility and rollback implications. Commit these edits
   before preparation; the command requires a clean tree. Keep the rationale file
   outside the repository.
4. Run `pnpm release:prepare major /tmp/funes-release.md`, substituting the assessed
   `minor` or `patch` when appropriate. It computes the version from the latest
   reachable stable tag and updates all workspace manifests, API version,
   generated OpenAPI version, README status, dated changelog/comparison links and
   `.release/plan.json`. It does not create a tag, push, publish or deploy.
5. Review the diff. Run `pnpm format`, `pnpm release:verify` and the relevant checks
   in [Testing and release](testing-and-release.md#release-verification), including
   production smoke/migration checks. Confirm formatting did not change unrelated
   source; that would require reassessment. Record exactly which manual and live
   checks ran. Commit and push the preparation branch.
6. Write a PR body to a file containing the version rationale, migration notes and
   validation evidence. Open the preparation PR with
   `gh pr create --base develop --head chore/release-X.Y.Z --title "chore(release): prepare vX.Y.Z" --body-file /tmp/funes-release-pr.md`.
   Wait for required checks/review. Squash-merge when authorized.
7. Open the release PR with
   `gh pr create --base main --head develop --title "Release vX.Y.Z" --body-file /tmp/funes-release-pr.md`.
   Review its complete diff and verify the plan again on its current head. Merge
   with **Create a merge commit**, or `gh pr merge <number> --merge`, when authorized
   and required checks/review pass. Never squash/rebase this PR or delete `develop`.

If equivalent open PRs already exist, update/reuse them (`gh pr list --base ...
--head ...`) instead of creating duplicates. A source PR into `develop` does not
publish anything. The preparation PR and release PR are intentionally distinct.

### Changes after preparation

The plan records a source commit, compatibility rationale and SHA-256 fingerprint
of the reviewed tracked tree. Versions are normalized for that fingerprint;
`CHANGELOG.md` and the plan itself are excluded so notes can be finalized. All
other code, configuration and dependency changes invalidate the assessment.
CI validates pending plans and prevents unnoticed additions to the candidate.

To refresh: incorporate the new candidate into the preparation branch, review the
new complete diff, commit a clean tree, update the rationale, and rerun
`release:prepare` with the appropriate bump. It replaces the pending version and
retains the original release baseline and existing pending notes. Run formatting,
verification and checks again. If preparation already merged, use a new
`chore/release-*` PR into `develop`. Prefer pausing unrelated merges into `develop`
during final release review. A recorded source commit may be a pre-squash commit;
the content fingerprint, not that commit's continued ancestry, binds the assessment.

## Automatic publication

After the release merge's **push CI on `main` succeeds**, `release.yml`:

1. Checks that this is the current `main` commit, from this repository's CI, and
   the two-parent merge of a `develop` or same-repository `hotfix/` PR into `main`.
2. Verifies the release plan, synchronized versions, notes and reviewed content.
3. Creates annotated `vX.Y.Z` at that exact commit. An existing tag is accepted only
   if it resolves to the same commit; tags are never moved or deleted.
4. Calls the reusable image workflow for the exact SHA. API, web and MCP images
   build for amd64 and arm64 with provenance/SBOMs. Each job records its digest.
5. Creates the GitHub Release with the changelog entry, version rationale and image
   references only after all three image jobs succeed. An existing published
   release is reused, without rewriting its notes.

Image names are `ghcr.io/<owner>/funes-vault-{api,web,mcp}:X.Y.Z`; API also serves
worker and migration containers. Versioned releases also update `X.Y`, `latest`
and `sha-<commit>` aliases. Pin a version or digest in deployments, not `latest`.
Partial image failures can leave some image tags present; only a completed Release
workflow and published GitHub Release establish publication success.

Tag pushes alone no longer publish images. The workflow invokes image building
directly because events produced with `GITHUB_TOKEN` do not normally trigger
another workflow ([GitHub documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)).
Manual **Publish Images** dispatch remains available for diagnostic builds with a
platform choice, but publishes only a SHA tag, including when dispatched at a tag.
It cannot publish a GitHub Release or move stable version/`latest` aliases.

### Repository prerequisites

Keep `develop` as default. The Release workflow must exist there for the
`workflow_run` trigger; merging the automation PR into `develop` enables it for
the next prepared release. No custom PAT, deployment secret or GitHub App is needed:
the jobs request scoped `contents: write`, `pull-requests: read` and
`packages: write` permissions from `GITHUB_TOKEN` where needed.

Configure branch rules for `develop` and `main` to require PRs, passing CI and the
CodeQL/security checks described in [Testing and release](testing-and-release.md),
and block force pushes. Allow merge commits for releases. Any tag rules must allow
this workflow to create `v*` tags without allowing tag rewrites. Organization
Actions policy must permit the requested token permissions. Check these settings;
this code does not create rulesets or imply that protections are active. Ensure
GHCR package visibility permits the intended deployment's pulls.

## Recovery and completion

| State                                  | Action                                                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation fails                      | Nothing is published. Inspect the error and local diff, correct the input and retry from a clean preparation branch.                                                                                       |
| CI fails                               | Fix through the normal PR flow. No release tag is created by this workflow.                                                                                                                                |
| Tree/baseline changed                  | Reassess and refresh preparation; do not bypass the fingerprint or edit it by hand.                                                                                                                        |
| Tag creation denied                    | Correct repository token/tag permissions, then rerun the Release workflow. Do not add a broad personal token as a workaround.                                                                              |
| Some image jobs fail                   | Do not deploy. While this SHA is still current `main`, rerun failed jobs in the same Release run; successful jobs need not repeat. If a code fix is required after tagging, prepare a new version.         |
| Images succeed, release creation fails | Rerun the failed publication job. The same tag/SHA is reused and an already published release is not duplicated. Resolve any existing draft/prerelease explicitly.                                         |
| Stale run or whole workflow retry      | A retry is allowed only while its SHA is still current `main`; the same tag is reused. Never move a conflicting tag. Once `main` advances, prepare a new release instead of rebuilding old stable aliases. |

After publication, open `main → develop` and merge it with a **merge commit** to
carry the release ancestry/tag into the next development cycle. Do not delete
either long-lived branch. This step is also required after a hotfix.

Report the chosen version and rationale, preparation/release PR URLs, exact commit,
tag, CI/Release run links, GitHub Release URL, image digests and whether deployment
was requested/completed. Do not report success from the presence of a tag alone.

## Hotfixes and deployment

For an urgent fix, branch `hotfix/<description>` from updated `origin/main`.
Implement and test the focused correction, assess its actual compatibility impact,
then prepare on that branch with the same command. Open its PR directly into
`main` and use a merge commit. The same CI and publication gates apply. Merge
`main` back into `develop` afterward; reconcile any pending release plan.

Deployment remains separately triggered. Follow [Deployment and operations](deployment-and-operations.md):
verify a database backup, review the release's migration/rollback instructions,
select matching image versions in Compose/Portainer, apply migrations in the
documented order and verify API/web/MCP health, worker heartbeat and relevant
authenticated flows. A code rollback is insufficient after an incompatible schema
change. Never reuse the one-time 1.0.0 development-database reset as an upgrade step.
