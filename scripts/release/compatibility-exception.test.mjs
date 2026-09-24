import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { assertCompatibility } from "./core.mjs";
import { fixture, history, success } from "./test-fixtures.mjs";

const flag = "--pre-production-1.1.0";
const exception = "pre-production-1.1.0";
const breaking = "- **Breaking:** removed a supported alias.";

function breakingFixture(t) {
  const f = fixture(t);
  f.write("CHANGELOG.md", history.replace("- Compatible feature.", breaking));
  f.commit();
  return f;
}

const plan = (f) => JSON.parse(readFileSync(join(f.cwd, ".release/plan.json")));

test("the explicit exception prepares and verifies breaking 1.1.0 notes", (t) => {
  const f = breakingFixture(t);
  const denied = f.cli("prepare.mjs", "minor", f.rationale);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /Breaking release notes require a major bump/);
  assert.equal(f.git("status", "--porcelain"), "");
  success(f.cli("prepare.mjs", "minor", f.rationale, flag));
  f.commit();
  assert.equal(plan(f).version, "1.1.0");
  assert.equal(plan(f).compatibilityException, exception);
  assert.ok(
    readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8").includes(breaking)
  );
  success(f.cli("verify.mjs"));

  const withoutException = plan(f);
  delete withoutException.compatibilityException;
  f.write(".release/plan.json", JSON.stringify(withoutException));
  const invalid = f.cli("verify.mjs");
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Breaking release notes require a major bump/);
});

test("compatibility exceptions reject other versions, baselines and bump types", () => {
  const valid = {
    version: "1.1.0",
    previousTag: "v1.0.0",
    bump: "minor",
    compatibilityException: exception
  };
  for (const override of [
    { version: "1.2.0" },
    { previousTag: "v1.0.1" },
    { bump: "patch" },
    { bump: "major" },
    { compatibilityException: "unrecognized" },
    { compatibilityException: null }
  ]) {
    assert.throws(() =>
      assertCompatibility({ ...valid, ...override }, breaking)
    );
  }
});

test("reassessment requires the flag again and future releases do not inherit it", (t) => {
  const f = breakingFixture(t);
  success(f.cli("prepare.mjs", "minor", f.rationale, flag));
  f.commit();
  const denied = f.cli("prepare.mjs", "minor", f.rationale);
  assert.notEqual(denied.status, 0);
  assert.equal(f.git("status", "--porcelain"), "");
  success(f.cli("prepare.mjs", "minor", f.rationale, flag));
  f.commit();
  f.git("tag", "v1.1.0");
  const changelog = readFileSync(join(f.cwd, "CHANGELOG.md"), "utf8");
  f.write(
    "CHANGELOG.md",
    changelog.replace(
      "## [Unreleased]\n",
      "## [Unreleased]\n\n### Added\n\n- Compatible capability.\n"
    )
  );
  f.commit();
  const later = f.cli("prepare.mjs", "minor", f.rationale, flag);
  assert.notEqual(later.status, 0);
  assert.match(later.stderr, /exception applies only/);
  assert.equal(f.git("status", "--porcelain"), "");
  success(f.cli("prepare.mjs", "minor", f.rationale));
  f.commit();
  assert.equal(plan(f).version, "1.2.0");
  assert.equal(plan(f).compatibilityException, undefined);
  success(f.cli("verify.mjs"));
});
