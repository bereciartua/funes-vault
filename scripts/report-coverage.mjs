import { appendFile, readFile } from "node:fs/promises";

const [file, label] = process.argv.slice(2);
if (!file || !label) {
  throw new Error("Usage: report-coverage.mjs <coverage-summary.json> <label>");
}
const { total } = JSON.parse(await readFile(file, "utf8"));
const rows = ["statements", "branches", "functions", "lines"].map((metric) => {
  const { pct, covered, total: count } = total[metric];

  return `| ${metric} | ${pct}% | ${covered} / ${count} |`;
});
const report = `## ${label} coverage\n\n| Metric | Coverage | Covered / total |\n| --- | --- | --- |\n${rows.join("\n")}\n\nDownload the coverage artifact for the HTML report and LCOV data.\n`;
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
} else {
  console.log(report);
}
