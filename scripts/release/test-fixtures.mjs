import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const scripts = resolve(import.meta.dirname);
export const history = `# Changelog

## [Unreleased]

### Added

- Compatible feature.

## [1.0.0] - 2026-09-23

### Added

- Initial release.

[Unreleased]: https://github.com/example/vault/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/example/vault/releases/tag/v1.0.0
`;

export function fixture(t) {
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

export function success(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
