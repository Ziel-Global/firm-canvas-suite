#!/usr/bin/env node
/**
 * Apply document visibility ACL migration.
 * Usage:
 *   SUPABASE_DB_PASSWORD='your-db-password' node scripts/apply-visibility-migration.mjs
 *
 * Get the password from: Supabase Dashboard → Project Settings → Database → Database password
 */
import { readFileSync } from "fs";
import { Client } from "pg";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) {
  console.error("Set SUPABASE_DB_PASSWORD to your Supabase database password.");
  process.exit(1);
}

const projectRef = readFileSync(join(root, "supabase/.temp/project-ref"), "utf8").trim();
const sql = readFileSync(
  join(root, "supabase/migrations/20260723120000_document_visibility_acl.sql"),
  "utf8",
);

const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log("Applied 20260723120000_document_visibility_acl.sql");
} finally {
  await client.end();
}
