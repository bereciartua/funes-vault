import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fixture, success } from "./test-fixtures.mjs";

test("the local publisher accepts only the checkout's SHA tag", (t) => {
  const f = fixture(t);
  f.write(
    "scripts/publish-images.sh",
    readFileSync(join(import.meta.dirname, "../publish-images.sh"), "utf8")
  );
  f.commit();
  const bin = join(dirname(f.cwd), "bin");
  mkdirSync(bin);
  const log = join(dirname(f.cwd), "docker.log");
  writeFileSync(
    join(bin, "docker"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PUBLISH_TEST_LOG"\n'
  );
  chmodSync(join(bin, "docker"), 0o755);
  const publish = (...args) =>
    spawnSync("bash", ["scripts/publish-images.sh", ...args], {
      cwd: f.cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        REGISTRY_BASE: "ghcr.io/example/vault",
        PUBLISH_TEST_LOG: log
      }
    });
  for (const tag of ["latest", "2", "2.0", "2.0.0", "v2.0.0", "custom"]) {
    const result = publish(tag);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SHA tags only/);
  }
  success(publish());
  const commands = readFileSync(log, "utf8");
  const builds = commands
    .split("\n")
    .filter((line) => line.startsWith("buildx build"));
  assert.equal(builds.length, 3);
  for (const service of ["api", "web", "mcp"]) {
    assert.ok(
      commands.includes(
        `--tag ghcr.io/example/vault-${service}:sha-${f.git("rev-parse", "--short=7", "HEAD")}`
      )
    );
  }
  assert.doesNotMatch(commands, /:latest|:2\.0/);
  assert.equal((commands.match(/--tag /g) || []).length, 3);
});
