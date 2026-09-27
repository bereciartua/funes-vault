import { existsSync, readFileSync } from "node:fs";

export function readPolicy() {
  // Older releases predate the phase policy and retain production semantics.
  const policy = existsSync(".release/policy.json")
    ? JSON.parse(readFileSync(".release/policy.json", "utf8"))
    : { phase: "production" };
  if (!["pre-production", "production"].includes(policy.phase)) {
    throw new Error("Release phase must be pre-production or production");
  }
  const withdrawn = policy.withdrawnTags ?? {};
  if (
    typeof withdrawn !== "object" ||
    withdrawn === null ||
    Array.isArray(withdrawn) ||
    Object.entries(withdrawn).some(
      ([tag, sha]) =>
        !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) ||
        typeof sha !== "string" ||
        !/^[a-f0-9]{40}$/.test(sha)
    )
  ) {
    throw new Error(
      "Withdrawn tags must map exact version tags to commit SHAs"
    );
  }
  return { ...policy, withdrawnTags: withdrawn };
}

export function releaseBump(phase, impact) {
  if (!["major", "minor", "patch"].includes(impact)) {
    throw new Error("Impact must be major, minor or patch");
  }
  return phase === "pre-production" && impact === "major" ? "minor" : impact;
}

export function assertPhase(plan, policy) {
  const phase = plan.phase ?? "production";
  if (phase !== policy.phase) {
    throw new Error(
      "Release phase changed; reassess and rerun release:prepare"
    );
  }
  if (plan.bump !== releaseBump(phase, plan.impact ?? plan.bump)) {
    throw new Error(
      "Release bump does not match phase and compatibility impact"
    );
  }
  if (
    phase === "pre-production" &&
    (!plan.version.startsWith("1.") || !plan.previousTag.startsWith("v1."))
  ) {
    throw new Error("Pre-production releases must remain on the 1.x line");
  }
}

export function isWithdrawnTag(tag, git, policy = readPolicy()) {
  const sha = policy.withdrawnTags[tag];
  return Boolean(sha && git("rev-parse", `${tag}^{commit}`) === sha);
}

export function assertReplacement(flag, context) {
  if (flag === undefined) return false;
  const { currentVersion, previousTag, version, oldPlan, git, policy } =
    context;
  const tag = `v${currentVersion}`;
  if (
    flag !== `--replace-version=${currentVersion}` ||
    policy.phase !== "pre-production" ||
    !policy.withdrawnTags[tag] ||
    !isWithdrawnTag(tag, git, policy) ||
    oldPlan?.version !== currentVersion ||
    oldPlan.previousTag !== previousTag ||
    !version.startsWith("1.")
  ) {
    throw new Error(
      "Replacement requires the explicitly withdrawn release and its original baseline"
    );
  }
  if (git("tag", "--list", `v${version}`)) {
    throw new Error(
      "Replacement target is already tagged; never replace another release"
    );
  }
  return true;
}
