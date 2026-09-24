import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, git, verifyPlan } from "./core.mjs";
import { api, gh } from "./github.mjs";

let temporary;
try {
  const repository = process.env.GITHUB_REPOSITORY;
  assert(
    repository,
    "Run this entry point in the Release workflow after all image jobs succeed"
  );
  const plan = verifyPlan();
  const tag = `v${plan.version}`;
  assert(
    git("rev-parse", `${tag}^{commit}`) === git("rev-parse", "HEAD"),
    "Tag must match the release checkout"
  );
  assert(
    api(`repos/${repository}/git/ref/heads/main`).object.sha ===
      git("rev-parse", "HEAD"),
    "Main advanced; do not publish a stale release"
  );
  const releases = JSON.parse(
    gh(
      "api",
      "--paginate",
      "--slurp",
      `repos/${repository}/releases?per_page=100`
    )
  ).flat();
  const existing = releases.find((release) => release.tag_name === tag);
  if (existing) {
    assert(
      !existing.draft && !existing.prerelease,
      "Existing release is draft/prerelease; resolve it before retrying"
    );
    console.log(`Already published: ${existing.html_url}`);
  } else {
    temporary = mkdtempSync(join(tmpdir(), "funes-release-"));
    const notes = join(temporary, "notes.md");
    const body = `${plan.notes}\n\n### Version decision\n\n${plan.rationale}\n\n### Images\n\nAll images support linux/amd64 and linux/arm64. Pin the following version or the digests recorded in the image job summaries:\n\n${["api", "web", "mcp"].map((service) => `- \`ghcr.io/${repository.toLowerCase()}-${service}:${plan.version}\``).join("\n")}\n`;
    writeFileSync(notes, body);
    console.log(
      gh(
        "release",
        "create",
        tag,
        "--repo",
        repository,
        "--verify-tag",
        "--title",
        `Funes Vault ${plan.version}`,
        "--notes-file",
        notes
      )
    );
  }
  const release = api(`repos/${repository}/releases/tags/${tag}`);
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Published: ${release.html_url}\n\nProduction deployment is a separate operation.\n`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true });
}
