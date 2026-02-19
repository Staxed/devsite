#!/usr/bin/env node
/**
 * Backfill script for pearls API endpoint.
 * Calls /api/pearls/backfill repeatedly until all contracts are complete.
 *
 * Usage:
 *   node scripts/backfill.mjs [options]
 *
 * Options:
 *   --payouts         Backfill payouts instead of NFT transfers
 *   --delay <ms>      Delay between batches in ms (default: 2000)
 *   --url <base>      API base URL (default: http://localhost:3434)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Parse .env.local manually (no dotenv dependency)
// ---------------------------------------------------------------------------
function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    // File not found — fall back to process.env only
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Only set if not already in environment (process.env takes precedence)
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    payouts: false,
    delay: 2000,
    url: 'http://localhost:3434',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--payouts':
        opts.payouts = true;
        break;
      case '--delay':
        opts.delay = parseInt(args[++i], 10);
        if (isNaN(opts.delay) || opts.delay < 0) {
          console.error('--delay must be a non-negative integer (ms)');
          process.exit(1);
        }
        break;
      case '--url':
        opts.url = args[++i];
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ---------------------------------------------------------------------------
// Single API call with one retry on network failure
// ---------------------------------------------------------------------------
async function callBackfill(baseUrl, secret, backfillPayouts) {
  const url = `${baseUrl}/api/pearls/backfill`;
  const body = backfillPayouts ? { backfill_payouts: true } : {};

  const attempt = async () =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': secret,
      },
      body: JSON.stringify(body),
    });

  let response;
  try {
    response = await attempt();
  } catch (networkErr) {
    console.warn(`Network error, retrying once… (${networkErr.message})`);
    await sleep(1000);
    try {
      response = await attempt();
    } catch (retryErr) {
      throw new Error(`Network failure after retry: ${retryErr.message}`);
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  loadEnvLocal();

  const opts = parseArgs(process.argv);

  const secret = process.env.BACKFILL_ADMIN_SECRET;
  if (!secret) {
    console.error(
      'Error: BACKFILL_ADMIN_SECRET is not set in environment or .env.local'
    );
    process.exit(1);
  }

  const mode = opts.payouts ? 'payouts' : 'NFT transfers';
  console.log(`Starting pearls backfill (${mode})`);
  console.log(`  API: ${opts.url}/api/pearls/backfill`);
  console.log(`  Delay between batches: ${opts.delay}ms`);
  console.log('');

  // Track per-contract stats: key = "name (chain)"
  const stats = {}; // { [contractKey]: { pages: number, transfers: number } }

  let page = 1;

  while (true) {
    let data;
    try {
      data = await callBackfill(opts.url, secret, opts.payouts);
    } catch (err) {
      console.error(`Fatal error on page ${page}: ${err.message}`);
      process.exit(1);
    }

    const { results, allCompleted } = data;

    if (!Array.isArray(results) || results.length === 0) {
      console.warn('Warning: API returned no results — stopping.');
      break;
    }

    for (const contract of results) {
      const { name, chain, processed, hasMore, completed } = contract;
      const key = `${name} (${chain})`;

      // Initialise stats entry on first sight
      if (!stats[key]) {
        stats[key] = { pages: 0, transfers: 0 };
      }

      // Only count pages where this contract was active (processed > 0 or not yet completed)
      if (!stats[key].done) {
        stats[key].pages += 1;
        stats[key].transfers += processed ?? 0;
      }

      // Determine status label
      let statusMsg;
      if (completed && !hasMore) {
        if (processed === 0 && stats[key].pages === 1) {
          statusMsg = 'completed (0 remaining)';
          stats[key].alreadyComplete = true;
        } else {
          statusMsg = `${processed} transfers processed, completed!`;
        }
        stats[key].done = true;
      } else if (hasMore) {
        statusMsg = `${processed} transfers processed, more pages remaining…`;
      } else {
        statusMsg = `${processed} transfers processed`;
      }

      console.log(`[Page ${page}] ${key}: ${statusMsg}`);
    }

    if (allCompleted) {
      break;
    }

    if (opts.delay > 0) {
      await sleep(opts.delay);
    }

    page += 1;
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('');
  console.log('---');
  console.log('Backfill complete!');

  for (const [key, info] of Object.entries(stats)) {
    if (info.alreadyComplete && info.transfers === 0) {
      console.log(`  ${key}: 0 transfers (already complete)`);
    } else {
      const pageWord = info.pages === 1 ? 'page' : 'pages';
      console.log(
        `  ${key}: ${info.transfers} transfers across ${info.pages} ${pageWord}`
      );
    }
  }
}

main();
