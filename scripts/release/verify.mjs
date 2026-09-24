import { git, read, verifyPlan } from "./core.mjs";

try {
  const optional = process.argv.includes("--if-pending");
  const version = JSON.parse(read("package.json")).version;
  const released =
    git("tag", "--merged", "HEAD", "--list", `v${version}`) === `v${version}`;
  if (optional && released) {
    console.log("No pending release plan.");
  } else {
    const plan = verifyPlan();
    console.log(
      `Verified v${plan.version}: ${plan.bump} from ${plan.previousTag}`
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
