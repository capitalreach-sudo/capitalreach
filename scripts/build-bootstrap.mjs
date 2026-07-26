#!/usr/bin/env node
// Concatenates every numbered migration into a single file that can be pasted
// into a fresh Supabase project's SQL editor in one go.
//
// This exists because supabase/migrations/000_combined_for_dashboard.sql was a
// hand-maintained "run this on a new project" bundle that stopped being updated
// around migration 003. Anyone bootstrapping from it silently got a database
// missing everything after that. Generating the bundle instead means it cannot
// drift from the migrations it is built from.
//
// 000 itself is excluded: it duplicates 001-003 and would conflict.
//
//   node scripts/build-bootstrap.mjs

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outFile = join(root, "supabase", "bootstrap.sql");

const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith(".sql"))
  .filter(f => !f.startsWith("000_"))   // superseded by 001-003
  .filter(f => f !== "bootstrap.sql")
  .sort();

if (files.length === 0) {
  console.error("No migrations found in", migrationsDir);
  process.exit(1);
}

const parts = [
  "-- =====================================================================",
  "-- CapitalReach - full schema bootstrap",
  "--",
  "-- GENERATED FILE - do not edit by hand.",
  "-- Regenerate with:  npm run db:bootstrap",
  "--",
  "-- Paste into the SQL editor of a NEW Supabase project and run once.",
  "-- Every migration is idempotent, so re-running is safe.",
  "--",
  `-- Built from ${files.length} migrations on ${new Date().toISOString().slice(0, 10)}:`,
  ...files.map(f => `--   ${f}`),
  "-- =====================================================================",
  "",
];

for (const f of files) {
  parts.push(
    "",
    `-- ---------------------------------------------------------------------`,
    `-- ${f}`,
    `-- ---------------------------------------------------------------------`,
    "",
    readFileSync(join(migrationsDir, f), "utf8").trimEnd(),
    "",
  );
}

writeFileSync(outFile, parts.join("\n") + "\n", "utf8");

const lines = parts.join("\n").split("\n").length;
console.log(`Wrote supabase/bootstrap.sql (${files.length} migrations, ${lines} lines)`);
console.log(files.map(f => "  " + f).join("\n"));
