import { appendFileSync } from "node:fs";
import { assert, git, read, verifyPlan } from "./core.mjs";
import { api, releasePull, validateRun } from "./github.mjs";

try {
  const repository = process.env.GITHUB_REPOSITORY;
  assert(repository, "Run this entry point in the Release workflow");
  const event = JSON.parse(read(process.env.GITHUB_EVENT_PATH));
  const sha = git("rev-parse", "HEAD");
  const main = api(`repos/${repository}/git/ref/heads/main`).object.sha;
  validateRun(event.workflow_run, repository, main);
  assert(
    sha === event.workflow_run.head_sha,
    "Checkout must match the successful CI commit"
  );
  const parents = git("rev-list", "--parents", "-n", "1", "HEAD").split(" ");
  assert(parents.length === 3, "Release PR must use a two-parent merge commit");
  const pulls = api(`repos/${repository}/commits/${sha}/pulls?per_page=100`);
  const pr = releasePull(pulls, repository, sha);
  const plan = verifyPlan();
  const tag = `v${plan.version}`;
  const existing = git("tag", "--list", tag);
  if (existing) {
    assert(
      git("rev-parse", `${tag}^{commit}`) === sha,
      "Release tag already points elsewhere; never move it"
    );
  } else {
    git("config", "user.name", "github-actions[bot]");
    git(
      "config",
      "user.email",
      "41898282+github-actions[bot]@users.noreply.github.com"
    );
    git("tag", "-a", tag, sha, "-m", `Funes Vault ${plan.version}`);
    git("push", "origin", `refs/tags/${tag}`);
  }
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${plan.version}\nsha=${sha}\ntag=${tag}\n`
  );
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Release ${tag}\n\n- Commit: ${sha}\n- PR: ${pr.html_url}\n- Decision: ${plan.bump}\n\n${plan.rationale}\n`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
