import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fixture, scripts, success } from "./test-fixtures.mjs";

function setup(t) {
  const f = fixture(t);
  f.write(
    ".release/policy.json",
    JSON.stringify({
      phase: "pre-production",
      withdrawnTags: { "v2.0.0": "806039e9403a99a24e234b0f0cd2ef7326226e77" }
    })
  );
  const dir = dirname(f.cwd);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const data = join(dir, "responses.json");
  const deleted = join(dir, "deleted");
  const responses = {
    "repos/bereciartua/funes-vault/releases/tags/v1.2.0": {
      draft: false,
      prerelease: false,
      html_url: "https://github.com/bereciartua/funes-vault/releases/tag/v1.2.0"
    },
    "repos/bereciartua/funes-vault/releases/latest": { tag_name: "v1.2.0" }
  };
  for (const service of ["api", "web", "mcp"]) {
    responses[
      `users/bereciartua/packages/container/funes-vault-${service}/versions?per_page=100`
    ] = [
      [
        {
          id: 12,
          name: `sha256:new-${service}`,
          metadata: { container: { tags: ["1.2.0", "1.2", "latest"] } }
        },
        {
          id: 20,
          name: `sha256:old-${service}`,
          metadata: { container: { tags: ["2.0.0", "2.0", "sha-806039e"] } }
        }
      ]
    ];
  }
  const mock = join(bin, "gh");
  writeFileSync(
    mock,
    `#!${process.execPath}
const fs = require("node:fs");
const responses = JSON.parse(fs.readFileSync(${JSON.stringify(data)}));
if (process.argv.includes("DELETE")) {
  fs.appendFileSync(${JSON.stringify(deleted)}, process.argv.at(-1) + "\\n");
} else {
  const result = responses[process.argv.at(-1)];
  if (!result) process.exit(1);
  console.log(JSON.stringify(result));
}
`
  );
  chmodSync(mock, 0o755);
  const run = (action) => {
    writeFileSync(data, JSON.stringify(responses));
    return spawnSync(process.execPath, [join(scripts, "withdraw-images.mjs")], {
      cwd: f.cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_REPOSITORY: "bereciartua/funes-vault",
        WITHDRAW_ACTION: action,
        GITHUB_STEP_SUMMARY: join(dir, "summary")
      }
    });
  };
  return { responses, run, deleted };
}

test("withdrawal inspection is read-only and removal targets only the old manifests", (t) => {
  const f = setup(t);
  success(f.run("inspect"));
  assert.equal(existsSync(f.deleted), false);
  success(f.run("remove"));
  assert.deepEqual(
    readFileSync(f.deleted, "utf8").trim().split("\n"),
    ["api", "web", "mcp"].map(
      (service) =>
        `users/bereciartua/packages/container/funes-vault-${service}/versions/20`
    )
  );
});

test("withdrawal rejects an unexpected alias on the last package before deleting anything", (t) => {
  const f = setup(t);
  f.responses[
    "users/bereciartua/packages/container/funes-vault-mcp/versions?per_page=100"
  ][0][1].metadata.container.tags.push("still-in-use");
  assert.match(f.run("remove").stderr, /unexpected tags/);
  assert.equal(existsSync(f.deleted), false);
});

test("withdrawal requires a published replacement with consistent latest aliases", (t) => {
  const f = setup(t);
  f.responses["repos/bereciartua/funes-vault/releases/tags/v1.2.0"].draft =
    true;
  assert.match(f.run("remove").stderr, /Publish 1.2.0/);
  f.responses["repos/bereciartua/funes-vault/releases/tags/v1.2.0"].draft =
    false;
  f.responses[
    "users/bereciartua/packages/container/funes-vault-api/versions?per_page=100"
  ][0][0].metadata.container.tags.pop();
  assert.match(f.run("remove").stderr, /aliases are inconsistent/);
  assert.equal(existsSync(f.deleted), false);
});
