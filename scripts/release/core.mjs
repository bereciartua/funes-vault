import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { replaceJsonString } from "./json-string.mjs";

export const planPath = ".release/plan.json";
export const read = (path) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");
export const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
export const assert = (condition, message, code) => {
  if (!condition) throw Object.assign(new Error(message), { code });
};
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const hasBreakingNotes = (notes) =>
  /\*\*Breaking:?\*\*:?(?:\s)|(?:^|\n)\s*(?:[-*]\s*)?Breaking:|(?:^|\n)#{2,6} Breaking\b/i.test(
    notes
  );

export function assertCompatibility(plan, notes) {
  const exception = plan.compatibilityException;
  if (exception !== undefined) {
    assert(
      exception === "pre-production-1.1.0" &&
        plan.previousTag === "v1.0.0" &&
        plan.version === "1.1.0" &&
        plan.bump === "minor",
      "The pre-production compatibility exception applies only to v1.0.0 -> v1.1.0 (minor)"
    );
  }
  assert(
    plan.bump === "major" ||
      exception !== undefined ||
      !hasBreakingNotes(notes),
    "Breaking release notes require a major bump"
  );
}

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

export function isPublishedVersion(version) {
  const tag = `v${version}`;
  if (git("tag", "--merged", "HEAD", "--list", tag) !== tag) return false;
  let publishedPlan;
  try {
    publishedPlan = JSON.parse(
      execFileSync("git", ["show", `${tag}:${planPath}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      })
    );
  } catch {
    // Releases predating this automation do not contain a plan.
    return !existsSync(planPath);
  }
  return (
    existsSync(planPath) &&
    JSON.stringify(publishedPlan) === JSON.stringify(JSON.parse(read(planPath)))
  );
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
    return replaceJsonString(content, ["version"], version);
  }
  if (path === "docs/openapi.json") {
    return replaceJsonString(content, ["info", "version"], version);
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

function normalizedVersion(path, content) {
  const normalized = replaceVersion(path, content, "0.0.0");
  return path.endsWith(".json")
    ? JSON.stringify(JSON.parse(normalized))
    : normalized;
}

const indexContent = (path) =>
  execFileSync("git", ["show", `:${path}`], { encoding: "utf8" });

// Hash canonical staged content: checkout line endings and smudge filters do not
// change an assessment. Normalize only the small set of version-bearing files.
export function fingerprint() {
  const hash = createHash("sha256");
  const entries = git("ls-files", "--stage", "-z").split("\0").filter(Boolean);
  for (const entry of entries) {
    const [metadata, path] = entry.split("\t");
    if ([planPath, "CHANGELOG.md"].includes(path)) continue;
    const [mode, blob, stage] = metadata.split(" ");
    assert(stage === "0", "Resolve index conflicts before assessing a release");
    const content = versionPaths().includes(path)
      ? normalizedVersion(path, indexContent(path))
      : blob;
    hash.update(`${mode}\0${path}\0`).update(content).update("\0");
  }
  return hash.digest("hex");
}

function assertReviewedWorkspace() {
  const paths = versionPaths();
  const changed = git(
    "diff",
    "--name-only",
    "--",
    ".",
    ...[planPath, "CHANGELOG.md", ...paths].map((path) => `:(exclude)${path}`)
  );
  assert(
    !changed,
    "The reviewed tree changed; stage or commit source edits before reassessing the release",
    "RELEASE_TREE_CHANGED"
  );
  for (const path of paths) {
    // Apply Git's clean filters to working content before comparing with the index.
    const clean = execFileSync(
      "git",
      ["hash-object", "--path", path, "--stdin"],
      {
        input: normalizedVersion(path, read(path)),
        encoding: "utf8"
      }
    ).trim();
    const indexed = execFileSync("git", ["hash-object", "--stdin"], {
      input: normalizedVersion(path, indexContent(path)),
      encoding: "utf8"
    }).trim();
    assert(
      clean === indexed,
      `The reviewed tree changed in ${path}; stage or commit source edits before reassessing the release`,
      "RELEASE_TREE_CHANGED"
    );
  }
}

function changelogSection(changelog, version) {
  const heading = new RegExp(
    `^## \\[${version.replaceAll(".", "\\.")}\\]${version === "Unreleased" ? "" : " - [^\\n]+"}\\n`,
    "m"
  );
  const match = heading.exec(changelog);
  assert(match, `Missing changelog section for ${version}`);
  const bodyStart = match.index + match[0].length;
  const rest = changelog.slice(bodyStart);
  const next = rest.search(/^## \[|^\[Unreleased\]:/m);
  const end = next < 0 ? changelog.length : bodyStart + next;
  return {
    start: match.index,
    end,
    body: changelog.slice(bodyStart, end).trim()
  };
}

export function releaseNotes(changelog, version) {
  const { body } = changelogSection(changelog, version);
  assert(body.length > 0, "Release notes are empty");
  const headings = [...body.matchAll(/^### (.+)$/gm)].map((match) =>
    match[1].trim().toLowerCase()
  );
  assert(
    new Set(headings).size === headings.length,
    "Merge duplicate release-note subsection headings"
  );
  return body;
}

function mergeSubsections(notes) {
  const [intro, ...parts] = notes.split(/^### (.+)$/m);
  const sections = new Map();
  for (let i = 0; i < parts.length; i += 2) {
    const title = parts[i].trim();
    const key = title.toLowerCase();
    const section = sections.get(key) ?? { title, bodies: [] };
    if (parts[i + 1].trim()) section.bodies.push(parts[i + 1].trim());
    sections.set(key, section);
  }
  const order = [
    "added",
    "changed",
    "deprecated",
    "removed",
    "fixed",
    "security"
  ];
  const rank = ({ title }) => {
    const index = order.indexOf(title.toLowerCase());
    return index < 0 ? order.length : index;
  };
  return [
    intro.trim(),
    ...[...sections.values()]
      .sort((a, b) => rank(a) - rank(b))
      .map(({ title, bodies }) => `### ${title}\n\n${bodies.join("\n\n")}`)
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function finalizeChangelog(
  changelog,
  version,
  date,
  pendingVersion,
  previousTag
) {
  let text = changelog;
  let pendingNotes = "";
  if (pendingVersion) {
    const pending = changelogSection(text, pendingVersion);
    pendingNotes = pending.body;
    text = text.slice(0, pending.start) + text.slice(pending.end);
    text = text.replace(
      new RegExp(`^\\[${pendingVersion.replaceAll(".", "\\.")}\\]:.*\\n?`, "m"),
      ""
    );
  }
  const unreleased = changelogSection(text, "Unreleased");
  const notes = mergeSubsections(
    [unreleased.body, pendingNotes].filter(Boolean).join("\n\n")
  );
  assert(notes, "Release notes are empty");
  text =
    text.slice(0, unreleased.start) +
    `## [Unreleased]\n\n## [${version}] - ${date}\n\n${notes}\n\n` +
    text.slice(unreleased.end);
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
    "The reviewed tree changed; reassess and rerun release:prepare",
    "RELEASE_TREE_CHANGED"
  );
  assertReviewedWorkspace();
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
  assertCompatibility(plan, notes);
  assert(
    changelog.includes("## [Unreleased]\n") &&
      !changelog.split("## [Unreleased]\n")[1]?.split("\n## [")[0].trim(),
    "Move all Unreleased entries into the release"
  );
  return { ...plan, notes };
}
