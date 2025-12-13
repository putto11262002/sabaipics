#!/usr/bin/env node
/**
 * Deploy script that provisions infrastructure before deploying.
 * Usage: node scripts/deploy.js <environment>
 */

import { execSync } from "child_process";

const env = process.argv[2];
if (!["staging", "production"].includes(env)) {
  console.error("Usage: node scripts/deploy.js <staging|production>");
  process.exit(1);
}

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

// Queue names per environment
const queues =
  env === "staging"
    ? ["photo-processing-staging", "photo-processing-dlq-staging"]
    : ["photo-processing", "photo-processing-dlq"];

// Provision queues (ignore if already exists)
for (const queue of queues) {
  try {
    run(`pnpm wrangler queues create ${queue}`);
  } catch {
    console.log(`Queue "${queue}" already exists, skipping.`);
  }
}

// Deploy worker
run(`pnpm wrangler deploy --env ${env} --minify`);
