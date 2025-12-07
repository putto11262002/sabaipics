#!/usr/bin/env node

/**
 * Dev Tunnel Script
 *
 * Starts both wrangler dev server and ngrok tunnel in parallel.
 * Reads NGROK_DOMAIN from .dev.vars file.
 *
 * Usage: pnpm --filter=@sabaipics/api dev:tunnel
 */

import { spawn } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const devVarsPath = join(__dirname, "..", ".dev.vars");

// Parse .dev.vars to get NGROK_DOMAIN
function getNgrokDomain() {
	try {
		const content = readFileSync(devVarsPath, "utf-8");
		const match = content.match(/^NGROK_DOMAIN=(.+)$/m);
		if (match) {
			return match[1].trim();
		}
	} catch (err) {
		// File doesn't exist or can't be read
	}
	return null;
}

const ngrokDomain = getNgrokDomain();

if (!ngrokDomain) {
	console.error("❌ NGROK_DOMAIN not found in .dev.vars");
	console.error("   Add: NGROK_DOMAIN=your-domain.ngrok-free.dev");
	console.error("   Get your free domain at: https://dashboard.ngrok.com/domains");
	process.exit(1);
}

console.log("🚀 Starting dev server with ngrok tunnel...\n");
console.log(`   Local:  http://localhost:8081`);
console.log(`   Tunnel: https://${ngrokDomain}\n`);

// Start wrangler dev
const wrangler = spawn("wrangler", ["dev"], {
	stdio: "inherit",
	shell: true,
});

// Start ngrok with static domain (--log=stdout disables TUI, streams logs instead)
const ngrok = spawn("ngrok", ["http", "--domain", ngrokDomain, "--log=stdout", "--log-format=logfmt", "8081"], {
	stdio: "inherit",
	shell: true,
});

// Handle process exit
function cleanup() {
	wrangler.kill();
	ngrok.kill();
	process.exit();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

wrangler.on("exit", (code) => {
	if (code !== 0) {
		console.error(`Wrangler exited with code ${code}`);
	}
	cleanup();
});

ngrok.on("exit", (code) => {
	if (code !== 0) {
		console.error(`ngrok exited with code ${code}`);
	}
	cleanup();
});
