import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  assert,
  assertCompatibility,
  finalizeChangelog,
  fingerprint,
  git,
  isPublishedVersion,
  latestTag,
  nextVersion,
  planPath,
  read,
  replaceVersion,
  versionPaths,
  verifyPlan
} from "./core.mjs";
import {
  assertPhase,
  assertReplacement,
  readPolicy,
  releaseBump
} from "./policy.mjs";

try {
  const [impact, rationaleFile, option, ...extra] = process.argv.slice(2);
  const exceptionFlag =
    option === "--pre-production-1.1.0" ? option : undefined;
  const replacementFlag = option?.startsWith("--replace-version=")
    ? option
    : undefined;
  assert(
    rationaleFile &&
      !extra.length &&
      (option === undefined || exceptionFlag || replacementFlag),
    "Usage: pnpm release:prepare <major|minor|patch impact> <rationale.md> [--replace-version=X.Y.Z]"
  );
  assert(
    !git("status", "--porcelain"),
    "Start from a clean tree; keep the rationale file outside the repository"
  );
  const branch = git("branch", "--show-current");
  assert(
    branch.startsWith("chore/release-") || branch.startsWith("hotfix/"),
    "Prepare on chore/release-* or hotfix/*"
  );
  const previousTag = latestTag();
  const policy = readPolicy();
  const bump = releaseBump(policy.phase, impact);
  const version = nextVersion(previousTag.slice(1), bump);
  const rationale = read(rationaleFile).trim();
  assert(
    rationale.length >= 20,
    "Describe the compatibility decision and supporting paths/PRs"
  );
  const currentVersion = JSON.parse(read("package.json")).version;
  const oldPlan = existsSync(planPath) ? JSON.parse(read(planPath)) : null;
  const replacing = assertReplacement(replacementFlag, {
    currentVersion,
    previousTag,
    version,
    oldPlan,
    git,
    policy
  });
  if (replacing) {
    assert(
      isPublishedVersion(currentVersion),
      "Restore the original published plan before replacement"
    );
  }
  const pending =
    currentVersion !== previousTag.slice(1) ||
    (oldPlan && !isPublishedVersion(currentVersion));
  assert(
    replacing ||
      !pending ||
      git("tag", "--merged", "HEAD", "--list", `v${currentVersion}`) !==
        `v${currentVersion}`,
    `v${currentVersion} is already published; restore .release/plan.json from the tag instead of reassessing it`
  );
  assert(
    !pending || oldPlan?.version === currentVersion,
    "Unrecognized version changes; reconcile the pending release first"
  );
  if (pending && oldPlan.previousTag !== previousTag) {
    assert(
      /^v\d+\.\d+\.\d+$/.test(oldPlan.previousTag),
      "Invalid pending baseline tag"
    );
    // A merged hotfix advances the baseline; divergent/replaced histories must
    // still be reconciled explicitly rather than silently accepted.
    try {
      git("merge-base", "--is-ancestor", oldPlan.previousTag, previousTag);
    } catch {
      assert(
        false,
        `Pending baseline ${oldPlan.previousTag} is not an ancestor of ${previousTag}; fetch missing tags or reconcile the release history explicitly`
      );
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  const changelog = finalizeChangelog(
    read("CHANGELOG.md"),
    version,
    date,
    pending ? currentVersion : undefined,
    previousTag
  );
  const updates = versionPaths().map((path) => [
    path,
    replaceVersion(path, read(path), version)
  ]);
  const plan = {
    version,
    previousTag,
    phase: policy.phase,
    impact,
    bump,
    date,
    sourceCommit: git("rev-parse", "HEAD"),
    fingerprint: fingerprint(),
    rationale,
    ...(exceptionFlag && { compatibilityException: "pre-production-1.1.0" })
  };
  // Validate all in-memory inputs before touching the working tree.
  assertPhase(plan, policy);
  assertCompatibility(
    plan,
    changelog.split(`## [${version}] - `)[1].split("\n## [")[0]
  );
  for (const [path, content] of updates) writeFileSync(path, content);
  writeFileSync("CHANGELOG.md", changelog);
  mkdirSync(".release", { recursive: true });
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n");
  verifyPlan();
  console.log(
    `Prepared v${version} (${bump}) from ${previousTag}. Review, format and commit these files, then open the preparation PR.`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
