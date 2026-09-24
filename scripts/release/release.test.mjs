import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import {
  finalizeChangelog,
  hasBreakingNotes,
  nextVersion,
  releaseNotes
} from "./core.mjs";
import { releasePull, validateRun } from "./github.mjs";

const scripts = resolve(import.meta.dirname);
const history = `# Changelog

## [Unreleased]

### Added

- Compatible feature.

## [1.0.0] - 2026-09-23

### Added

- Initial release.

[Unreleased]: https://github.com/example/vault/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/example/vault/releases/tag/v1.0.0
`;

test("version increments use the selected compatibility impact", () => {
  assert.equal(nextVersion("1.9.7", "patch"), "1.9.8");
  assert.equal(nextVersion("1.9.7", "minor"), "1.10.0");
  assert.equal(nextVersion("1.9.7", "major"), "2.0.0");
  for (const value of ["01.0.0", "v1.0.0", "1.0.0-beta.1", "1.0"]) {
    assert.throws(() => nextVersion(value, "patch"));
  }
  assert.throws(() => nextVersion("1.0.0", "automatic"));
});

test("only explicit breaking markers impose the changelog major-bump guard", () => {
  assert.equal(hasBreakingNotes("A non-breaking correction."), false);
  assert.equal(hasBreakingNotes("No breaking changes."), false);
  assert.equal(hasBreakingNotes("- **Breaking:** removed an alias."), true);
  assert.equal(hasBreakingNotes("- Breaking: removed an alias."), true);
  assert.equal(
    hasBreakingNotes("### Breaking changes\n\nRemoved an alias."),
    true
  );
});

test("release notes exclude historical entries and comparison links", () => {
  const result = finalizeChangelog(history, "1.1.0", "2026-09-24");
  assert.equal(
    releaseNotes(result, "1.1.0"),
    "### Added\n\n- Compatible feature."
  );
  assert.match(result, /compare\/v1\.0\.0\.\.\.v1\.1\.0/);
  assert.match(result, /## \[Unreleased\]\n\n## \[1.1.0\]/);
});

test("reassessment replaces the pending version and preserves its baseline", () => {
  const first = finalizeChangelog(history, "1.1.0", "2026-09-24");
  const result = finalizeChangelog(
    first,
    "2.0.0",
    "2026-09-25",
    "1.1.0",
    "v1.0.0"
  );
  assert.equal(
    releaseNotes(result, "2.0.0"),
    "### Added\n\n- Compatible feature."
  );
  assert.doesNotMatch(result, /1\.1\.0/);
  assert.match(result, /compare\/v1\.0\.0\.\.\.v2\.0\.0/);
});

const repository = "example/vault";
const sha = "a".repeat(40);
const run = {
  name: "CI",
  path: ".github/workflows/ci.yml",
  event: "push",
  head_branch: "main",
  head_repository: { full_name: repository },
  status: "completed",
  conclusion: "success",
  head_sha: sha
};
const pull = {
  merged_at: "2026-09-24",
  merge_commit_sha: sha,
  base: { ref: "main", repo: { full_name: repository } },
  head: { ref: "develop", repo: { full_name: repository } }
};

test("publication rejects failed, stale, foreign and PR CI runs", () => {
  assert.doesNotThrow(() => validateRun(run, repository, sha));
  for (const override of [
    { conclusion: "failure" },
    { status: "in_progress" },
    { event: "pull_request" },
    { head_branch: "develop" },
    { head_repository: { full_name: "fork/vault" } },
    { head_sha: "b".repeat(40) },
    { path: ".github/workflows/other.yml" }
  ])
    assert.throws(() => validateRun({ ...run, ...override }, repository, sha));
});

test("only merged same-repository develop/hotfix PRs can release", () => {
  assert.equal(releasePull([pull], repository, sha), pull);
  assert.doesNotThrow(() =>
    releasePull(
      [{ ...pull, head: { ...pull.head, ref: "hotfix/login" } }],
      repository,
      sha
    )
  );
  for (const override of [
    { merged_at: null },
    { merge_commit_sha: "b".repeat(40) },
    { head: { ...pull.head, ref: "feat/something" } },
    { head: { ...pull.head, repo: { full_name: "fork/vault" } } }
  ])
    assert.throws(() =>
      releasePull([{ ...pull, ...override }], repository, sha)
    );
  assert.throws(() => releasePull([pull, pull], repository, sha));
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "funes-release-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cwd = join(directory, "repo");
  mkdirSync(cwd);
  const write = (path, value) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), value);
  };
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  const cli = (file, ...args) =>
    spawnSync(process.execPath, [join(scripts, file), ...args], {
      cwd,
      encoding: "utf8"
    });
  const commit = () => {
    git("add", ".");
    git("commit", "-m", "fixture", "--allow-empty");
  };
  git("init", "-b", "main");
  git("config", "user.name", "Release test");
  git("config", "user.email", "release@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", "/dev/null");
  for (const path of [
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "packages/mcp/package.json",
    "packages/db/package.json",
    "packages/shared/package.json"
  ]) {
    write(
      path,
      JSON.stringify({ name: path, version: "1.0.0" }, null, 2) + "\n"
    );
  }
  write("README.md", "Version **1.0.0** targets self-hosting.\n");
  write("apps/api/src/openapi.ts", 'builder.setVersion("1.0.0");\n');
  write(
    "docs/openapi.json",
    JSON.stringify({ info: { version: "1.0.0" }, paths: {} }, null, 2) + "\n"
  );
  write("CHANGELOG.md", history);
  write("app.txt", "reviewed code\n");
  commit();
  git("tag", "v1.0.0");
  git("switch", "-c", "chore/release-next");
  const rationale = join(directory, "rationale.md");
  writeFileSync(
    rationale,
    "Adds a compatible capability in app.txt; existing integrations continue to work."
  );
  return { cwd, write, git, cli, commit, rationale };
}

function success(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("preparation aligns all versions, preserves history and validates after commit", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  success(f.cli("verify.mjs"));
  for (const path of [
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "packages/mcp/package.json",
    "packages/db/package.json",
    "packages/shared/package.json"
  ]) {
    assert.equal(JSON.parse(readFileSync(join(f.cwd, path))).version, "1.1.0");
  }
  assert.equal(f.git("tag", "--list"), "v1.0.0");
  f.write("app.txt", "unreviewed change\n");
  const failure = f.cli("verify.mjs");
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /reviewed tree changed/);
  f.commit();
  success(f.cli("prepare.mjs", "major", f.rationale));
  f.commit();
  success(f.cli("verify.mjs"));
  assert.equal(
    JSON.parse(readFileSync(join(f.cwd, "package.json"))).version,
    "2.0.0"
  );
});

test("version-only drift and empty or breaking notes are rejected", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  const manifest = readFileSync(
    join(f.cwd, "packages/mcp/package.json"),
    "utf8"
  );
  f.write("packages/mcp/package.json", manifest.replace("1.1.0", "1.2.0"));
  assert.match(f.cli("verify.mjs").stderr, /Version mismatch/);
  f.write("packages/mcp/package.json", manifest);
  const changelog = readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8");
  f.write(
    "CHANGELOG.md",
    changelog.replace("Compatible feature.", "Breaking: removed MCP aliases.")
  );
  assert.match(f.cli("verify.mjs").stderr, /major bump/);
  f.write(
    "CHANGELOG.md",
    changelog.replace("### Added\n\n- Compatible feature.", "")
  );
  assert.match(f.cli("verify.mjs").stderr, /notes are empty/);
});

test("dirty trees and preparation on main cannot modify release files", (t) => {
  const f = fixture(t);
  f.write("untracked.txt", "do not touch\n");
  assert.match(f.cli("prepare.mjs", "patch", f.rationale).stderr, /clean tree/);
  rmSync(join(f.cwd, "untracked.txt"));
  f.git("switch", "main");
  assert.match(
    f.cli("prepare.mjs", "patch", f.rationale).stderr,
    /chore\/release-/
  );
  assert.equal(f.git("status", "--porcelain"), "");
});

test("CI rejects an untagged version without a release plan", (t) => {
  const f = fixture(t);
  const manifest = readFileSync(join(f.cwd, "package.json"), "utf8");
  f.write("package.json", manifest.replace("1.0.0", "1.1.0"));
  assert.notEqual(f.cli("verify.mjs", "--if-pending").status, 0);
});

test("released plans allow subsequent development but new pending changes require assessment", (t) => {
  const f = fixture(t);
  success(f.cli("verify.mjs", "--if-pending"));
  success(f.cli("prepare.mjs", "patch", f.rationale));
  f.commit();
  f.git("tag", "v1.0.1");
  f.write("app.txt", "next development cycle\n");
  f.commit();
  success(f.cli("verify.mjs", "--if-pending"));
  assert.notEqual(f.cli("verify.mjs").status, 0);
});

test("publication uses the tested merge, safely retries and never moves a conflicting tag", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  f.git("switch", "main");
  f.git("merge", "--no-ff", "chore/release-next", "-m", "Release merge");
  const mergeSha = f.git("rev-parse", "HEAD");
  const temporary = dirname(f.cwd);
  const remote = join(temporary, "remote.git");
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  f.git("remote", "add", "origin", remote);
  f.git("push", "origin", "main", "--tags");
  const bin = join(temporary, "bin");
  mkdirSync(bin);
  const responses = {
    [`repos/${repository}/git/ref/heads/main`]: { object: { sha: mergeSha } },
    [`repos/${repository}/commits/${mergeSha}/pulls?per_page=100`]: [
      { ...pull, merge_commit_sha: mergeSha }
    ],
    [`repos/${repository}/releases?per_page=100`]: [[]],
    [`repos/${repository}/releases/tags/v1.1.0`]: {
      tag_name: "v1.1.0",
      draft: false,
      prerelease: false,
      html_url: "https://github.com/example/vault/releases/tag/v1.1.0"
    }
  };
  const responsesFile = join(temporary, "responses.json");
  writeFileSync(responsesFile, JSON.stringify(responses));
  const mock = join(bin, "gh");
  writeFileSync(
    mock,
    `#!${process.execPath}
const fs = require("node:fs");
const file = ${JSON.stringify(responsesFile)};
const responses = JSON.parse(fs.readFileSync(file));
if (process.argv[2] === "release" && process.argv[3] === "create") {
  const notes = process.argv[process.argv.indexOf("--notes-file") + 1];
  fs.appendFileSync(file + ".created", fs.readFileSync(notes));
  responses["repos/${repository}/releases?per_page=100"] = [[responses["repos/${repository}/releases/tags/v1.1.0"]]];
  fs.writeFileSync(file, JSON.stringify(responses));
  console.log("created");
} else {
  const result = responses[process.argv.at(-1)];
  if (!result) process.exit(1);
  console.log(JSON.stringify(result));
}
`
  );
  chmodSync(mock, 0o755);
  const event = join(temporary, "event.json");
  writeFileSync(
    event,
    JSON.stringify({ workflow_run: { ...run, head_sha: mergeSha } })
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GITHUB_REPOSITORY: repository,
    GITHUB_EVENT_PATH: event,
    GITHUB_OUTPUT: join(temporary, "output"),
    GITHUB_STEP_SUMMARY: join(temporary, "summary")
  };
  const tag = () =>
    spawnSync(process.execPath, [join(scripts, "tag.mjs")], {
      cwd: f.cwd,
      encoding: "utf8",
      env
    });
  success(tag());
  assert.equal(f.git("rev-parse", "v1.1.0^{commit}"), mergeSha);
  const originalTag = f.git("rev-parse", "v1.1.0");
  success(tag());
  assert.equal(f.git("rev-parse", "v1.1.0"), originalTag);
  const publish = () =>
    spawnSync(process.execPath, [join(scripts, "publish.mjs")], {
      cwd: f.cwd,
      encoding: "utf8",
      env
    });
  success(publish());
  const notes = readFileSync(responsesFile + ".created", "utf8");
  assert.match(notes, /Compatible feature/);
  assert.match(notes, /vault-mcp:1\.1\.0/);
  assert.doesNotMatch(notes, /Initial release/);
  success(publish());
  assert.equal(readFileSync(responsesFile + ".created", "utf8"), notes);
  f.git("tag", "-f", "v1.1.0", "v1.0.0");
  assert.match(tag().stderr, /already points elsewhere/);
  assert.equal(f.git("rev-parse", "v1.1.0"), f.git("rev-parse", "v1.0.0"));
});
