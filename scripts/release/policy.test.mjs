import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixture, history, success } from "./test-fixtures.mjs";

const read = (f, path) => readFileSync(join(f.cwd, path), "utf8");
const plan = (f) => JSON.parse(read(f, ".release/plan.json"));
const policy = (f, phase = "pre-production", withdrawnTags = {}) =>
  f.write(".release/policy.json", JSON.stringify({ phase, withdrawnTags }));
const notes = (f, text) =>
  f.write(
    "CHANGELOG.md",
    read(f, "CHANGELOG.md").replace(
      "## [Unreleased]\n",
      `## [Unreleased]\n\n### Changed\n\n- ${text}\n`
    )
  );

test("pre-production maps repeated breaking releases to minors and compatible fixes to patches", (t) => {
  const f = fixture(t);
  policy(f);
  f.write(
    "CHANGELOG.md",
    history.replace("Compatible feature.", "Breaking: removed alias.")
  );
  f.commit();
  const denied = f.cli("prepare.mjs", "patch", f.rationale);
  assert.notEqual(denied.status, 0);
  assert.equal(f.git("status", "--porcelain"), "");
  for (const [impact, expected, text] of [
    ["major", "1.1.0", "Breaking: removed another field."],
    ["major", "1.2.0", "Compatible fix."],
    ["patch", "1.2.1", "Compatible feature."],
    ["minor", "1.3.0", "Compatible fix."]
  ]) {
    success(f.cli("prepare.mjs", impact, f.rationale));
    f.commit();
    success(f.cli("verify.mjs"));
    assert.equal(plan(f).version, expected);
    assert.equal(plan(f).phase, "pre-production");
    assert.equal(plan(f).impact, impact);
    f.git("tag", `v${expected}`);
    notes(f, text);
    f.commit();
  }
});

test("production graduation invalidates a pending assessment and restores major bumps", (t) => {
  const f = fixture(t);
  policy(f);
  f.commit();
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  policy(f, "production");
  f.commit();
  assert.match(f.cli("verify.mjs").stderr, /phase changed/);
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  f.git("tag", "v1.1.0");
  notes(f, "Breaking: production contract removed.");
  f.commit();
  assert.notEqual(f.cli("prepare.mjs", "minor", f.rationale).status, 0);
  success(f.cli("prepare.mjs", "major", f.rationale));
  f.commit();
  assert.equal(plan(f).version, "2.0.0");
  success(f.cli("verify.mjs"));
});

function replacementFixture(t) {
  const f = fixture(t);
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  f.git("tag", "v1.1.0");
  notes(f, "Breaking: changed processing authority.");
  f.commit();
  success(f.cli("prepare.mjs", "major", f.rationale));
  f.commit();
  f.git("tag", "v2.0.0");
  const withdrawnTags = { "v2.0.0": f.git("rev-parse", "HEAD") };
  policy(f, "pre-production", withdrawnTags);
  f.commit();
  return { f, withdrawnTags };
}

test("explicit replacement aligns metadata and notes while the withdrawn tag still exists", (t) => {
  const { f, withdrawnTags } = replacementFixture(t);
  assert.notEqual(f.cli("prepare.mjs", "major", f.rationale).status, 0);
  assert.equal(f.git("status", "--porcelain"), "");
  success(
    f.cli("prepare.mjs", "major", f.rationale, "--replace-version=2.0.0")
  );
  f.commit();
  assert.equal(plan(f).version, "1.2.0");
  assert.equal(plan(f).previousTag, "v1.1.0");
  assert.doesNotMatch(read(f, "CHANGELOG.md"), /2\.0\.0/);
  assert.match(
    read(f, "CHANGELOG.md"),
    /Breaking: changed processing authority/
  );
  success(f.cli("verify.mjs"));
  f.git("tag", "v1.2.0");
  f.git("tag", "-d", "v2.0.0");
  success(f.cli("verify.mjs"));
  // An old local tag cannot advance the baseline after remote cleanup.
  f.git("tag", "v2.0.0", withdrawnTags["v2.0.0"]);
  notes(f, "Breaking: another pre-production change.");
  f.commit();
  success(f.cli("prepare.mjs", "major", f.rationale));
  f.commit();
  assert.equal(plan(f).version, "1.3.0");
  success(f.cli("verify.mjs"));
  // A future production release with that number and a new SHA is not withdrawn.
  policy(f, "production", withdrawnTags);
  f.commit();
  success(f.cli("prepare.mjs", "major", f.rationale));
  f.commit();
  f.git("tag", "-d", "v2.0.0");
  f.git("tag", "v2.0.0");
  notes(f, "Compatible production fix.");
  f.commit();
  success(f.cli("prepare.mjs", "patch", f.rationale));
  assert.equal(plan(f).version, "2.0.1");
});

test("replacement refuses wrong versions, commits, baselines and existing target tags", (t) => {
  const { f, withdrawnTags } = replacementFixture(t);
  assert.notEqual(
    f.cli("prepare.mjs", "major", f.rationale, "--replace-version=1.1.0")
      .status,
    0
  );
  policy(f, "pre-production", { "v2.0.0": "a".repeat(40) });
  f.commit();
  assert.notEqual(
    f.cli("prepare.mjs", "major", f.rationale, "--replace-version=2.0.0")
      .status,
    0
  );
  policy(f, "pre-production", withdrawnTags);
  f.commit();
  f.git("tag", "v1.1.1", "v1.1.0");
  assert.notEqual(
    f.cli("prepare.mjs", "major", f.rationale, "--replace-version=2.0.0")
      .status,
    0
  );
  f.git("tag", "-d", "v1.1.1");
  f.git("tag", "v1.2.0", "v1.1.0");
  assert.notEqual(
    f.cli("prepare.mjs", "major", f.rationale, "--replace-version=2.0.0")
      .status,
    0
  );
  assert.equal(f.git("status", "--porcelain"), "");
});

test("invalid policy and pre-production outside 1.x fail without edits", (t) => {
  const f = fixture(t);
  policy(f, "typo");
  f.commit();
  assert.match(
    f.cli("prepare.mjs", "minor", f.rationale).stderr,
    /Release phase/
  );
  policy(f, "pre-production", { "v2.0.0": "invalid" });
  f.commit();
  assert.match(
    f.cli("prepare.mjs", "minor", f.rationale).stderr,
    /Withdrawn tags/
  );
  policy(f);
  f.commit();
  f.git("tag", "v2.0.0");
  assert.notEqual(f.cli("prepare.mjs", "major", f.rationale).status, 0);
  assert.equal(f.git("status", "--porcelain"), "");
});
