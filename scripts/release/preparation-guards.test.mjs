import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { finalizeChangelog, releaseNotes } from "./core.mjs";
import { fixture, history, success } from "./test-fixtures.mjs";

test("editing a published plan cannot rebrand its changelog as a new release", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "major", f.rationale));
  f.commit();
  f.git("tag", "v2.0.0");
  const published = readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8");
  const plan = JSON.parse(readFileSync(join(f.cwd, ".release/plan.json")));
  plan.rationale += " A later prose touch-up.";
  f.write(".release/plan.json", JSON.stringify(plan, null, 2) + "\n");
  f.commit();
  const result = f.cli("prepare.mjs", "major", f.rationale);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /v2\.0\.0 is already published; restore \.release\/plan.json from the tag/
  );
  assert.equal(readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8"), published);
  assert.equal(f.git("status", "--porcelain"), "");

  f.git("restore", "--source=v2.0.0", "--", ".release/plan.json");
  f.write(
    "CHANGELOG.md",
    published.replace(
      "## [Unreleased]\n",
      "## [Unreleased]\n\n### Changed\n\n- Breaking: new contract.\n"
    )
  );
  f.commit();
  success(f.cli("prepare.mjs", "major", f.rationale));
  const next = readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8");
  assert.equal(releaseNotes(next, "2.0.0"), releaseNotes(published, "2.0.0"));
  assert.equal(
    releaseNotes(next, "3.0.0"),
    "### Changed\n\n- Breaking: new contract."
  );
});

test("a hotfix version collision requires reconciliation and preserves published notes", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "patch", f.rationale));
  f.commit();
  const pendingNotes = releaseNotes(
    readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8"),
    "1.0.1"
  );
  f.git("switch", "-c", "hotfix/correction", "v1.0.0");
  f.write("hotfix.txt", "production correction\n");
  f.write(
    "CHANGELOG.md",
    history.replace("Compatible feature.", "Hotfix correction.")
  );
  f.commit();
  success(f.cli("prepare.mjs", "patch", f.rationale));
  f.commit();
  f.git("tag", "v1.0.1");
  const publishedNotes = releaseNotes(
    readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8"),
    "1.0.1"
  );
  f.git("switch", "chore/release-next");
  f.git(
    "merge",
    "--no-ff",
    "-X",
    "ours",
    "hotfix/correction",
    "-m",
    "Merge hotfix"
  );
  const result = f.cli("prepare.mjs", "patch", f.rationale);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /v1\.0\.1 is already published/);
  assert.equal(f.git("status", "--porcelain"), "");

  f.git(
    "restore",
    "--source=v1.0.1",
    "--",
    ".release/plan.json",
    "CHANGELOG.md"
  );
  const restored = readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8");
  f.write(
    "CHANGELOG.md",
    restored.replace(
      "## [Unreleased]\n",
      `## [Unreleased]\n\n${pendingNotes}\n`
    )
  );
  f.commit();
  success(f.cli("prepare.mjs", "patch", f.rationale));
  f.commit();
  success(f.cli("verify.mjs"));
  const next = readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8");
  assert.equal(releaseNotes(next, "1.0.1"), publishedNotes);
  assert.equal(releaseNotes(next, "1.0.2"), pendingNotes);
});

test("a divergent baseline reports a recovery instruction without modifying files", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "patch", f.rationale));
  f.commit();
  f.git("tag", "v1.0.1");
  f.write(
    "CHANGELOG.md",
    readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8").replace(
      "## [Unreleased]\n",
      "## [Unreleased]\n\n### Changed\n\n- Breaking: new contract.\n"
    )
  );
  f.commit();
  success(f.cli("prepare.mjs", "major", f.rationale));
  f.commit();
  f.git("tag", "v1.0.5", "v1.0.0");
  const result = f.cli("prepare.mjs", "major", f.rationale);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Pending baseline v1\.0\.1 is not an ancestor of v1\.0\.5/
  );
  assert.match(result.stderr, /reconcile the release history explicitly/);
  assert.doesNotMatch(result.stderr, /Command failed/);
  assert.equal(f.git("status", "--porcelain"), "");
});

test("refreshed subsections use canonical order and retain unknown-heading order", () => {
  const pending = finalizeChangelog(history, "1.1.0", "2026-09-24");
  const additions = [
    "Migration notes",
    "Fixed",
    "Security",
    "Added",
    "Changed",
    "Upgrade notes",
    "Removed",
    "Deprecated"
  ]
    .map((title) => `### ${title}\n\n- ${title} entry.`)
    .join("\n\n");
  const source = pending.replace(
    "## [Unreleased]\n",
    `## [Unreleased]\n\n${additions}\n`
  );
  const result = finalizeChangelog(
    source,
    "1.1.0",
    "2026-09-24",
    "1.1.0",
    "v1.0.0"
  );
  const notes = releaseNotes(result, "1.1.0");
  assert.deepEqual(
    [...notes.matchAll(/^### (.+)$/gm)].map((match) => match[1]),
    [
      "Added",
      "Changed",
      "Deprecated",
      "Removed",
      "Fixed",
      "Security",
      "Migration notes",
      "Upgrade notes"
    ]
  );
  assert.match(notes, /Added entry/);
  assert.match(notes, /Compatible feature/);
});
