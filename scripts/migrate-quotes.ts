/**
 * Migrate quotes from activity-bot's PostgreSQL database to ActivityOS Supabase.
 *
 * Usage:
 *   npx tsx scripts/migrate-quotes.ts
 *
 * Environment variables:
 *   OLD_DB_URL - PostgreSQL connection string for the activity-bot database
 *                (e.g., postgresql://user:pass@host:5432/dbname)
 *
 * Alternatively, provide a CSV file:
 *   QUOTES_CSV - Path to a CSV file with columns: text, author
 *
 * The script skips quotes whose text already exists in the Supabase quotes table.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLD_DB_URL = process.env.OLD_DB_URL;
const QUOTES_CSV = process.env.QUOTES_CSV;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

interface QuoteRow {
  text: string;
  author: string | null;
}

async function fetchFromOldDb(): Promise<QuoteRow[]> {
  if (!OLD_DB_URL) throw new Error("OLD_DB_URL not set");

  // Dynamic import to avoid requiring pg if using CSV mode
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require("pg") as { Client: new (opts: { connectionString: string }) => { connect(): Promise<void>; query(sql: string): Promise<{ rows: QuoteRow[] }>; end(): Promise<void> } };
  const client = new pg.Client({ connectionString: OLD_DB_URL });
  await client.connect();

  const result = await client.query("SELECT text, author FROM quotes");
  await client.end();

  return result.rows as QuoteRow[];
}

function fetchFromCsv(): QuoteRow[] {
  if (!QUOTES_CSV) throw new Error("QUOTES_CSV not set");

  const content = readFileSync(QUOTES_CSV, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  // Skip header if present
  const startIdx = lines[0].toLowerCase().includes("text") ? 1 : 0;

  return lines.slice(startIdx).map((line) => {
    // Handle CSV with quoted fields
    const match = line.match(/^"?([^"]*)"?,\s*"?([^"]*)"?$/);
    if (match) {
      return { text: match[1].trim(), author: match[2].trim() || null };
    }
    // Simple comma split
    const parts = line.split(",");
    const text = parts.slice(0, -1).join(",").trim();
    const author = parts[parts.length - 1].trim() || null;
    return { text, author };
  });
}

async function migrate() {
  console.log("Fetching quotes...");

  let quotes: QuoteRow[];
  if (QUOTES_CSV) {
    quotes = fetchFromCsv();
    console.log(`Read ${quotes.length} quotes from CSV`);
  } else if (OLD_DB_URL) {
    quotes = await fetchFromOldDb();
    console.log(`Fetched ${quotes.length} quotes from old database`);
  } else {
    console.error("Provide either OLD_DB_URL or QUOTES_CSV");
    process.exit(1);
  }

  // Fetch existing quotes to skip duplicates
  const { data: existing } = await supabase.from("quotes").select("text");
  const existingTexts = new Set((existing || []).map((q) => q.text));

  const newQuotes = quotes.filter((q) => !existingTexts.has(q.text));
  console.log(`${newQuotes.length} new quotes to insert (${quotes.length - newQuotes.length} duplicates skipped)`);

  if (newQuotes.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Insert in batches
  for (let i = 0; i < newQuotes.length; i += 100) {
    const batch = newQuotes.slice(i, i + 100);
    const { error } = await supabase.from("quotes").insert(batch);
    if (error) {
      console.error(`Batch insert failed at offset ${i}:`, error.message);
    } else {
      console.log(`Inserted ${Math.min(i + 100, newQuotes.length)}/${newQuotes.length}`);
    }
  }

  console.log("Migration complete!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
