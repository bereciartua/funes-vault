import { appendFileSync } from "node:fs";
import { assert } from "./core.mjs";
import { api, gh } from "./github.mjs";
import { readPolicy } from "./policy.mjs";

// This maintenance entry point is limited to the approved numbering correction.
try {
  const repository = process.env.GITHUB_REPOSITORY;
  const action = process.env.WITHDRAW_ACTION;
  assert(repository === "bereciartua/funes-vault", "Unexpected repository");
  assert(["inspect", "remove"].includes(action), "Choose inspect or remove");
  const sha = readPolicy().withdrawnTags["v2.0.0"];
  assert(
    sha === "806039e9403a99a24e234b0f0cd2ef7326226e77",
    "Unexpected withdrawn commit"
  );
  const replacement = api(`repos/${repository}/releases/tags/v1.2.0`);
  assert(
    !replacement.draft && !replacement.prerelease,
    "Publish 1.2.0 before cleanup"
  );
  assert(
    api(`repos/${repository}/releases/latest`).tag_name === "v1.2.0",
    "1.2.0 must be Latest"
  );
  const allowed = new Set(["2.0.0", "2.0", `sha-${sha.slice(0, 7)}`]);
  const targets = [];
  // Validate all packages before deleting any of them.
  for (const service of ["api", "web", "mcp"]) {
    const path = `users/bereciartua/packages/container/funes-vault-${service}/versions`;
    const versions = JSON.parse(
      gh("api", "--paginate", "--slurp", `${path}?per_page=100`)
    ).flat();
    const current = versions.find((v) =>
      v.metadata.container.tags.includes("1.2.0")
    );
    assert(
      current &&
        ["1.2", "latest"].every((tag) =>
          current.metadata.container.tags.includes(tag)
        ),
      `${service}: replacement aliases are inconsistent`
    );
    const old = versions.filter((v) =>
      v.metadata.container.tags.some((tag) => tag === "2.0.0" || tag === "2.0")
    );
    for (const version of old) {
      const tags = version.metadata.container.tags;
      assert(
        tags.every((tag) => allowed.has(tag)),
        `${service}: old image has unexpected tags; inspect before deletion`
      );
      assert(
        tags.includes(`sha-${sha.slice(0, 7)}`),
        `${service}: old image must carry the withdrawn commit tag`
      );
      assert(
        version.id !== current.id && version.name !== current.name,
        `${service}: replacement shares the withdrawn image`
      );
      targets.push({
        path,
        service,
        id: version.id,
        digest: version.name,
        tags
      });
    }
    console.log(
      JSON.stringify({
        service,
        replacement: current.name,
        targets: old.map((v) => ({
          id: v.id,
          digest: v.name,
          tags: v.metadata.container.tags
        }))
      })
    );
  }
  if (action === "remove") {
    for (const target of targets) {
      gh("api", "--method", "DELETE", `${target.path}/${target.id}`);
      console.log(`Removed ${target.service} version ${target.id}`);
    }
  }
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Action: ${action}\n\nReplacement: ${replacement.html_url}\n\n` +
      targets
        .map(
          (target) =>
            `- ${target.service}: ${target.digest}, version ID ${target.id}, tags ${target.tags.join(", ")}`
        )
        .join("\n") +
      "\n"
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
