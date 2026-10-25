// Adds a morning route to your own streets and school, with a path that follows real roads,
// and moves Sam and Ava onto it. Everyone else stays where they are.
//
//   cd server
//   npx tsx scripts/use-my-streets.ts            # preview only: shows what it found, changes nothing
//   npx tsx scripts/use-my-streets.ts --apply    # makes the change
//
// Stop the server first (Ctrl+C), then start it again afterwards. Needs MAPBOX_TOKEN in .env.
// Edit STOPS and SCHOOL below, or pass --school "name, street, town" and --near "lat,lng" if it picks the wrong town.

import { flushNow } from "../src/data/store.js";
import { directions, geocode, mapboxEnabled } from "../src/services/mapbox.js";
import { relocateDemo, SetupError } from "../src/services/demoSetup.js";

const STOPS = ["61 Tingley Lane", "61 Teaberry Drive"]; // in driving order
const SCHOOL = "St. Thomas Aquinas";  // or pass --school "St. Thomas Aquinas, 123 Main St, Town, NJ"
const DEFAULT_NEAR = { lat: 40.5187, lng: -74.4121 }; // Edison, NJ

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const nearArg = args[args.indexOf("--near") + 1];
const near = args.includes("--near") && nearArg ? { lat: Number(nearArg.split(",")[0]), lng: Number(nearArg.split(",")[1]) } : DEFAULT_NEAR;

const schoolArg = args.indexOf("--school") >= 0 ? args[args.indexOf("--school") + 1] : undefined;

async function main() {
  if (!mapboxEnabled()) throw new SetupError("MAPBOX_TOKEN isn't set in server/.env.");
  const r = await relocateDemo({ stops: STOPS, school: schoolArg || SCHOOL, near, apply }, { geocode, directions });

  console.log(apply ? "\nDone. Changes saved.\n" : "\nPreview only. Nothing was changed.\n");
  console.log("Found:");
  for (const p of r.places) console.log(`  ${p.query}  ->  ${p.found}${p.others.length ? `\n      other matches: ${p.others.join(" | ")}` : ""}`);
  console.log(`\nDestination: ${r.school.name}, ${r.school.address}`);
  console.log(`Route "${r.route.name}"${r.route.replaced ? " (updating the one from before)" : " (new)"}: ${r.route.miles} mi, about ${r.route.minutes} min on real roads`);
  console.log("\nStudents:");
  for (const a of r.assignments) console.log(`  ${a.student} -> ${a.stop}`);
  if (!apply) console.log("\nIf the addresses above are right, run again with --apply.");
  if (apply) flushNow();
}

main().catch((e) => {
  console.error("\n" + (e instanceof SetupError ? e.message : e?.message ?? e));
  process.exit(1);
}).finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 100));
