import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";

export const planPath = ".release/plan.json";
export const read = (path) => readFileSync(path, "utf8");
export const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
export const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const hasBreakingNotes = (notes) =>
  /\*\*Breaking:?\*\*:?(?:\s)|(?:^|\n)\s*(?:[-*]\s*)?Breaking:|(?:^|\n)#{2,6} Breaking\b/i.test(
    notes
  );

export function nextVersion(previous, bump) {
  assert(stableVersion.test(previous), "Expected a stable X.Y.Z version");
  const parts = previous.split(".").map(Number);
  const index = ["major", "minor", "patch"].indexOf(bump);
  assert(index >= 0, "Bump must be major, minor or patch");
  parts[index]++;
  for (let i = index + 1; i < 3; i++) parts[i] = 0;
  return parts.join(".");
}

export function latestTag(exclude) {
  const tags = git("tag", "--merged", "HEAD", "--list", "v*")
    .split("\n")
    .filter((tag) => tag !== exclude && stableVersion.test(tag.slice(1)))
    .sort((a, b) => {
      const x = a.slice(1).split(".").map(Number);
      const y = b.slice(1).split(".").map(Number);
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
    });
  assert(
    tags.length,
    "No reachable stable release tag; fetch tags and merge main into the source branch"
  );
  return tags[0];
}

let manifestPaths;
function manifests() {
  return (manifestPaths ??= git("ls-files")
    .split("\n")
    .filter((path) =>
      /^(package\.json|(apps|packages)\/[^/]+\/package\.json)$/.test(path)
    ));
}

export function replaceVersion(path, content, version) {
  if (manifests().includes(path)) {
    const value = JSON.parse(content);
    value.version = version;
    return JSON.stringify(value, null, 2) + "\n";
  }
  if (path === "docs/openapi.json") {
    const value = JSON.parse(content);
    value.info.version = version;
    return JSON.stringify(value, null, 2) + "\n";
  }
  if (path === "apps/api/src/openapi.ts") {
    assert(
      (content.match(/\.setVersion\("[^"\n]+"\)/g) || []).length === 1,
      "Expected one OpenAPI version"
    );
    return content.replace(
      /\.setVersion\("[^"\n]+"\)/,
      `.setVersion("${version}")`
    );
  }
  if (path === "README.md") {
    assert(
      (content.match(/Version \*\*\d+\.\d+\.\d+\*\*/g) || []).length === 1,
      "Expected one README version"
    );
    return content.replace(
      /Version \*\*\d+\.\d+\.\d+\*\*/,
      `Version **${version}**`
    );
  }
  return content;
}

export function versionPaths() {
  return [
    ...manifests(),
    "docs/openapi.json",
    "apps/api/src/openapi.ts",
    "README.md"
  ];
}

// Bind the assessment to the reviewed tree, allowing only version edits and
// release notes. Later code/config/dependency changes require reassessment.
export function fingerprint() {
  const hash = createHash("sha256");
  const entries = git("ls-files", "--stage", "-z").split("\0").filter(Boolean);
  for (const entry of entries) {
    const [metadata, path] = entry.split("\t");
    if ([planPath, "CHANGELOG.md"].includes(path)) continue;
    const mode = metadata.split(" ")[0];
    const content =
      mode === "120000"
        ? readlinkSync(path)
        : versionPaths().includes(path)
          ? replaceVersion(path, read(path), "0.0.0")
          : readFileSync(path);
    hash.update(`${mode}\0${path}\0`).update(content).update("\0");
  }
  return hash.digest("hex");
}

export function releaseNotes(changelog, version) {
  const start = changelog.indexOf(`## [${version}] - `);
  assert(start >= 0, `Missing dated changelog section for ${version}`);
  const rest = changelog.slice(start);
  const end = rest.slice(1).search(/\n## \[|\n\[Unreleased\]:/);
  const section = end < 0 ? rest : rest.slice(0, end + 1);
  const body = section.slice(section.indexOf("\n") + 1).trim();
  assert(body.length > 0, "Release notes are empty");
  return body;
}

export function finalizeChangelog(
  changelog,
  version,
  date,
  pendingVersion,
  previousTag
) {
  let text = changelog;
  if (pendingVersion) {
    const heading = new RegExp(
      `^## \\[${pendingVersion.replaceAll(".", "\\.")}\\] - .+$`,
      "m"
    );
    assert(heading.test(text), "Pending release section is missing");
    text = text.replace(heading, "");
    text = text.replace(
      new RegExp(`^\\[${pendingVersion.replaceAll(".", "\\.")}\\]:.*\\n?`, "m"),
      ""
    );
  }
  assert(text.includes("## [Unreleased]\n"), "Missing Unreleased section");
  text = text.replace(
    "## [Unreleased]\n",
    `## [Unreleased]\n\n## [${version}] - ${date}\n`
  );
  assert(
    /^\[Unreleased\]: https:\/\/github\.com\/[^\n]+\/compare\/[^\n]+$/m.test(
      text
    ),
    "Missing changelog comparison link"
  );
  const repo = text.match(
    /^\[Unreleased\]: (https:\/\/github\.com\/[^\n]+)\/compare\//m
  )[1];
  const previous =
    previousTag ??
    text.match(/^\[Unreleased\]: .*\/compare\/(v[\d.]+)\.\.\./m)[1];
  text = text.replace(
    /^\[Unreleased\]: .*$/m,
    `[Unreleased]: ${repo}/compare/v${version}...HEAD\n[${version}]: ${repo}/compare/${previous}...v${version}`
  );
  return text.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function verifyPlan() {
  const plan = JSON.parse(read(planPath));
  assert(stableVersion.test(plan.version), "Invalid release version");
  assert(
    plan.previousTag === latestTag(`v${plan.version}`),
    "Release baseline changed; reassess the release"
  );
  assert(
    plan.version === nextVersion(plan.previousTag.slice(1), plan.bump),
    "Version does not match the selected bump"
  );
  assert(
    typeof plan.rationale === "string" && plan.rationale.trim().length >= 20,
    "Record a compatibility rationale with evidence"
  );
  assert(
    /^[a-f0-9]{40}$/.test(plan.sourceCommit),
    "Invalid reviewed source commit"
  );
  assert(
    plan.fingerprint === fingerprint(),
    "The reviewed tree changed; reassess and rerun release:prepare"
  );
  for (const path of versionPaths()) {
    // JSON formatting is not a version mismatch.
    const actual = path.endsWith(".json")
      ? JSON.stringify(JSON.parse(read(path)))
      : read(path);
    const expectedText = replaceVersion(path, read(path), plan.version);
    const expected = path.endsWith(".json")
      ? JSON.stringify(JSON.parse(expectedText))
      : expectedText;
    assert(actual === expected, `Version mismatch in ${path}`);
  }
  const changelog = read("CHANGELOG.md");
  assert(
    changelog.includes(`## [${plan.version}] - ${plan.date}\n`),
    "Release date differs from the changelog"
  );
  const notes = releaseNotes(changelog, plan.version);
  assert(
    plan.bump === "major" || !hasBreakingNotes(notes),
    "Breaking release notes require a major bump"
  );
  assert(
    changelog.includes("## [Unreleased]\n") &&
      !changelog.split("## [Unreleased]\n")[1]?.split("\n## [")[0].trim(),
    "Move all Unreleased entries into the release"
  );
  return { ...plan, notes };
}
