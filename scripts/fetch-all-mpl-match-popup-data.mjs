import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const seasonKey = process.argv[2] || "season17";
const matchesPath = path.join(repoRoot, "data", seasonKey, "matches.json");
const fetchScriptPath = path.join(repoRoot, "scripts", "fetch-mpl-match-popup-data.mjs");

function runNodeScript(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: "inherit"
    });

    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const matches = JSON.parse(await readFile(matchesPath, "utf8"));
  const targets = matches.filter((match) => {
    const slug = String(match?.mpl?.slug || "").trim();
    return slug && String(match?.teamA || "").trim() && String(match?.teamB || "").trim();
  });

  if (!targets.length) {
    console.log(`No matches with mpl.slug found in ${matchesPath}`);
    return;
  }

  console.log(`Found ${targets.length} match(es) with mpl.slug in ${seasonKey}.`);

  let successCount = 0;
  let failureCount = 0;

  for (const match of targets) {
    const slug = String(match.mpl.slug).trim();
    const teamA = String(match.teamA || "").trim();
    const teamB = String(match.teamB || "").trim();
    console.log(`\n=== ${slug} | ${teamA} vs ${teamB} ===`);

    const exitCode = await runNodeScript([fetchScriptPath, slug, seasonKey, teamA, teamB]);
    if (exitCode === 0) {
      successCount += 1;
    } else {
      failureCount += 1;
    }
  }

  console.log(`\nDone. Success: ${successCount}. Failed: ${failureCount}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
