import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { releaseNotes } from "./core.mjs";
import { replaceJsonString } from "./json-string.mjs";
import { fixture, success } from "./test-fixtures.mjs";

test("refresh merges new and pending subsections without duplicating headings", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  const changelog = readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8");
  f.write(
    "CHANGELOG.md",
    changelog.replace(
      "## [Unreleased]\n",
      "## [Unreleased]\n\n### Added\n\n- New candidate feature.\n\n### Fixed\n\n- New correction.\n"
    )
  );
  f.write("app.txt", "new reviewed implementation\n");
  f.commit();
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  success(f.cli("verify.mjs"));
  const notes = releaseNotes(
    readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8"),
    "1.1.0"
  );
  assert.equal(notes.match(/^### Added$/gm).length, 1);
  assert.match(notes, /New candidate feature/);
  assert.match(notes, /Compatible feature/);
  assert.match(notes, /### Fixed\n\n- New correction/);
  assert.doesNotMatch(notes, /Initial release/);
  f.write(
    "CHANGELOG.md",
    readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8").replace(
      "- New correction.",
      "- New correction.\n\n### Added\n\n- Duplicate heading."
    )
  );
  assert.match(f.cli("verify.mjs").stderr, /duplicate release-note/);
});

for (const [bump, expected] of [
  ["major", "2.0.0"],
  ["minor", "1.1.0"],
  ["patch", "1.0.2"]
]) {
  test(`a pending ${bump} release can be reassessed after a merged hotfix`, (t) => {
    const f = fixture(t);
    success(f.cli("prepare.mjs", bump, f.rationale));
    f.commit();
    f.git("switch", "-c", "hotfix/correction", "v1.0.0");
    f.write("hotfix.txt", "production correction\n");
    f.commit();
    f.git("tag", "v1.0.1");
    f.git("switch", "chore/release-next");
    f.git("merge", "--no-ff", "hotfix/correction", "-m", "Merge hotfix");
    assert.notEqual(f.cli("verify.mjs", "--if-pending").status, 0);
    success(f.cli("prepare.mjs", bump, f.rationale));
    f.commit();
    success(f.cli("verify.mjs"));
    const plan = JSON.parse(readFileSync(join(f.cwd, ".release/plan.json")));
    assert.equal(plan.previousTag, "v1.0.1");
    assert.equal(plan.version, expected);
    const changelog = readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8");
    assert.ok(changelog.includes(`compare/v1.0.1...v${expected}`));
    assert.match(releaseNotes(changelog, expected), /Compatible feature/);
  });
}

test("the pending-release CI gate explains the release window to contributors", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  f.write("app.txt", "unrelated feature\n");
  f.commit();
  const result = f.cli("verify.mjs", "--if-pending");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release v1\.1\.0 is pending/);
  assert.match(result.stderr, /main is merged back into develop/);
  assert.doesNotMatch(result.stderr, /rerun release:prepare/);
  assert.match(
    f.cli("verify.mjs").stderr,
    /reassess and rerun release:prepare/
  );
});

test("a release fingerprint survives CRLF and clean/smudge checkout settings", (t) => {
  const f = fixture(t);
  f.write(".gitattributes", "* text=auto\napp.txt filter=releasefixture\n");
  f.write("app.txt", "canonical content\n");
  f.commit();
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  const before = JSON.parse(
    readFileSync(join(f.cwd, ".release/plan.json"))
  ).fingerprint;
  f.git("config", "core.autocrlf", "true");
  f.git("config", "filter.releasefixture.clean", "sed 's/SMUDGED/canonical/g'");
  f.git(
    "config",
    "filter.releasefixture.smudge",
    "sed 's/canonical/SMUDGED/g'"
  );
  // Force a fresh checkout instead of reusing files whose index stat is unchanged.
  for (const path of f.git("ls-files").split("\n")) rmSync(join(f.cwd, path));
  f.git("checkout-index", "--all", "--force");
  assert.match(
    readFileSync(join(f.cwd, "app.txt"), "utf8"),
    /SMUDGED content\r\n/
  );
  assert.equal(f.git("diff"), "");
  success(f.cli("verify.mjs"));
  assert.equal(
    JSON.parse(readFileSync(join(f.cwd, ".release/plan.json"))).fingerprint,
    before
  );
  f.write("app.txt", "new unreviewed code\n");
  assert.notEqual(f.cli("verify.mjs").status, 0);
});

test("unstaged edits inside version files cannot hide behind normalization", (t) => {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  f.write(
    "package.json",
    readFileSync(join(f.cwd, "package.json"), "utf8").replace(
      '"name": "package.json"',
      '"name": "unreviewed"'
    )
  );
  assert.match(
    f.cli("verify.mjs").stderr,
    /reviewed tree changed in package.json/
  );
});

test("patching OpenAPI changes only info.version and preserves compact formatting", () => {
  const source = String.raw`{
  "paths": {"version": [1, 2], "info": {"version": "schema"}},
  "info": {
    "contact": {"version": "contact"},
    "description": "Escaped \"version\" text",
    "version": "1.0.0"
  }
}
`;
  const result = replaceJsonString(source, ["info", "version"], "2.0.0");
  assert.equal(
    result,
    source.replace('"version": "1.0.0"', '"version": "2.0.0"')
  );
  assert.throws(
    () =>
      replaceJsonString(
        '{"info":{"version":"1","version":"2"}}',
        ["info", "version"],
        "3"
      ),
    /Expected one/
  );
});
