// Safe copy of the live database (works while the server is running).
//   npm run backup            -> data/backups/wheelie-<date>.db
// Run it on a schedule (cron / your host's scheduler) and copy the file somewhere else.
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

const source = process.env.DB_PATH ?? "data/wheelie.db";
const dir = process.env.BACKUP_DIR ?? "data/backups";
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const target = `${dir}/wheelie-${stamp}.db`;

const db = new Database(source, { readonly: true, fileMustExist: true });
await db.backup(target);
db.close();
console.log(`Backed up ${source} -> ${target}`);
