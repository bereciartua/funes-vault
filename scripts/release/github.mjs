import { execFileSync } from "node:child_process";
import { assert } from "./core.mjs";

export const gh = (...args) =>
  execFileSync("gh", args, { encoding: "utf8" }).trim();
export const api = (path) => JSON.parse(gh("api", path));

export function validateRun(run, repository, mainSha) {
  assert(
    run.name === "CI" && run.path === ".github/workflows/ci.yml",
    "Expected the CI workflow"
  );
  assert(
    run.event === "push" && run.head_branch === "main",
    "Only a main push can release"
  );
  assert(
    run.head_repository?.full_name === repository,
    "Refusing a foreign repository run"
  );
  assert(
    run.status === "completed" && run.conclusion === "success",
    "CI must complete successfully"
  );
  assert(run.head_sha === mainSha, "This CI run is stale; main has advanced");
}

export function releasePull(pulls, repository, sha) {
  const matches = pulls.filter(
    (pr) =>
      pr.merged_at &&
      pr.merge_commit_sha === sha &&
      pr.base.ref === "main" &&
      pr.base.repo.full_name === repository &&
      pr.head.repo?.full_name === repository &&
      (pr.head.ref === "develop" || pr.head.ref.startsWith("hotfix/"))
  );
  assert(
    matches.length === 1,
    "Expected one merged develop/hotfix PR into main at the CI commit"
  );
  return matches[0];
}
