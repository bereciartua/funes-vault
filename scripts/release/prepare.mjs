import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  assert,
  finalizeChangelog,
  fingerprint,
  git,
  hasBreakingNotes,
  latestTag,
  nextVersion,
  planPath,
  read,
  replaceVersion,
  versionPaths,
  verifyPlan
} from "./core.mjs";

try {
  const [bump, rationaleFile] = process.argv.slice(2);
  assert(
    rationaleFile,
    "Usage: pnpm release:prepare <major|minor|patch> <rationale.md>"
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
  const version = nextVersion(previousTag.slice(1), bump);
  const rationale = read(rationaleFile).trim();
  assert(
    rationale.length >= 20,
    "Describe the compatibility decision and supporting paths/PRs"
  );
  const currentVersion = JSON.parse(read("package.json")).version;
  const pending = currentVersion !== previousTag.slice(1);
  const oldPlan = existsSync(planPath) ? JSON.parse(read(planPath)) : null;
  assert(
    !pending ||
      (oldPlan?.version === currentVersion &&
        oldPlan.previousTag === previousTag),
    "Unrecognized version changes; reconcile the pending release first"
  );
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
    bump,
    date,
    sourceCommit: git("rev-parse", "HEAD"),
    fingerprint: fingerprint(),
    rationale
  };
  // Validate all in-memory inputs before touching the working tree.
  assert(
    bump === "major" ||
      !hasBreakingNotes(
        changelog.split(`## [${version}] - `)[1].split("\n## [")[0]
      ),
    "Breaking release notes require a major bump"
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
