import { writeFileSync } from "fs";
import { resolve } from "path";

import { constructProblem } from "@/lib/solver/construct-problem";

export {};

const EVENT_ID = "event_0d20db85-91b1-40e0-aa72-28b2ea2fda4f";
const OUTPUT_PATH = resolve(
  __dirname,
  "../solver/tests/fixtures/scale-problem.json"
);

async function main() {
  const problem = await constructProblem(EVENT_ID);
  writeFileSync(OUTPUT_PATH, JSON.stringify(problem, null, 2) + "\n");
  console.log(
    `Wrote problem with ${problem.trippers.length} trippers to ${OUTPUT_PATH}`
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to dump problem:", error);
  process.exit(1);
});
