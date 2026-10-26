// Starts the server and an ngrok tunnel on your free static domain together.
// Set NGROK_DOMAIN in server/.env (e.g. NGROK_DOMAIN=your-name.ngrok-free.app).
import "dotenv/config";
import { spawn } from "node:child_process";

const domain = (process.env.NGROK_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
if (!domain) {
  console.error("Add NGROK_DOMAIN=your-name.ngrok-free.app to server/.env first (claim it at dashboard.ngrok.com > Domains).");
  process.exit(1);
}
const port = process.env.PORT || "4000";
const run = (cmd, args) => spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

const server = run("npx", ["tsx", "src/index.ts"]);
const tunnel = run("ngrok", ["http", `--url=${domain}`, port]);
console.log(`\nPublic address: https://${domain}\n`);

const stop = () => { server.kill(); tunnel.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
tunnel.on("exit", (c) => { if (c) console.error("ngrok exited. Is it installed and is your authtoken set?"); stop(); });
server.on("exit", stop);
