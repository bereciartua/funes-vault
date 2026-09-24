import { isPublishedVersion, read, verifyPlan } from "./core.mjs";

try {
  const optional = process.argv.includes("--if-pending");
  const version = JSON.parse(read("package.json")).version;
  const released = isPublishedVersion(version);
  if (optional && released) {
    console.log("No pending release plan.");
  } else {
    const plan = verifyPlan();
    console.log(
      `Verified v${plan.version}: ${plan.bump} from ${plan.previousTag}`
    );
  }
} catch (error) {
  if (
    process.argv.includes("--if-pending") &&
    error.code === "RELEASE_TREE_CHANGED"
  ) {
    const version = JSON.parse(read("package.json")).version;
    console.error(
      `Release v${version} is pending; merge this change after it is published and main is merged back into develop. A release maintainer must reassess the candidate to include it in this release.`
    );
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}
