// da-check.mjs — data-availability spot-check for a kovanica-chain devnet.
//
// op-batcher posts compressed L2 data to the L1 batch inbox address. That data
// availability is what lets any honest party reconstruct L2 state from L1 alone
// (CLAUDE.md §3.4). This tool scans recent L1 blocks for transactions to the
// batch inbox and reports batch cadence, flagging a DA stall (the batcher has
// stopped posting, so the safe head will fall behind and withdrawals can't
// finalize against un-derived state).
//
// Reads the batch inbox address from BATCH_INBOX_ADDRESS, else from
// devnet/out/rollup.json (`batch_inbox_address`). Devnet DA mode is calldata,
// so batches are plain transactions to the inbox; for blob DA the same `to`
// applies (blob txs) — see README for the caveat.
//
// Exit: 0 healthy, 1 stall/RPC error, 2 missing required config.
//
// Everything below "PURE HELPERS" is deterministic and network-free (see
// da-check.test.mjs).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// PURE HELPERS (exported, unit-tested, no I/O, no network)
// ---------------------------------------------------------------------------

/** Validate a 20-byte hex address (case-insensitive). */
export function isHexAddress(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
}

/** Normalize an address for comparison. */
export function normAddr(v) {
  return isHexAddress(v) ? v.toLowerCase() : null;
}

/**
 * Resolve the batch inbox address: explicit override wins, else rollup.json's
 * `batch_inbox_address`. Throws with an actionable message if neither is usable.
 */
export function resolveBatchInbox({ override, rollup }) {
  if (override !== undefined && override !== '') {
    if (!isHexAddress(override)) {
      throw new Error(`BATCH_INBOX_ADDRESS is not a valid address: ${JSON.stringify(override)}`);
    }
    return normAddr(override);
  }
  const fromRollup = rollup?.batch_inbox_address;
  if (isHexAddress(fromRollup)) return normAddr(fromRollup);
  throw new Error(
    'Could not resolve the batch inbox address. Set BATCH_INBOX_ADDRESS, or run ' +
      "'make devnet-inspect' so devnet/out/rollup.json (batch_inbox_address) exists.",
  );
}

/**
 * Count batch transactions (to == inbox) across an array of blocks, each shaped
 * { number: bigint, transactions: [{ to }] }. Returns { batchCount,
 * lastBatchBlock } where lastBatchBlock is the highest block with a batch (or
 * null).
 */
export function countBatches(blocks, inbox) {
  const target = normAddr(inbox);
  let batchCount = 0;
  let lastBatchBlock = null;
  for (const block of blocks) {
    let hasBatch = false;
    for (const tx of block.transactions ?? []) {
      if (normAddr(tx?.to) === target) {
        batchCount += 1;
        hasBatch = true;
      }
    }
    if (hasBatch && (lastBatchBlock === null || block.number > lastBatchBlock)) {
      lastBatchBlock = block.number;
    }
  }
  return { batchCount, lastBatchBlock };
}

/** Blocks since the last batch, given the current L1 tip. null if no batch seen. */
export function blocksSinceLastBatch(lastBatchBlock, tip) {
  if (lastBatchBlock === null || lastBatchBlock === undefined) return null;
  const gap = tip - lastBatchBlock;
  return gap < 0n ? 0n : gap;
}

/**
 * Decide DA health. Stalled if no batch was seen in the window, or the gap
 * exceeds stallBlocks. Returns { ok, reason }.
 */
export function assessDa({ batchCount, gap, stallBlocks }) {
  if (batchCount === 0) {
    return { ok: false, reason: `no batches to the inbox in the scanned window` };
  }
  if (gap !== null && gap > stallBlocks) {
    return { ok: false, reason: `DA stall: ${gap} blocks since the last batch (threshold ${stallBlocks})` };
  }
  return { ok: true, reason: `${batchCount} batches; last batch ${gap} block(s) ago` };
}

// ---------------------------------------------------------------------------
// CLI (network + process wiring; not unit-tested)
// ---------------------------------------------------------------------------

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`env ${name}=${v} must be a positive integer`);
  return n;
}

function loadRollup() {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, 'devnet', 'out', 'rollup.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const l1RpcUrl = process.env.L1_RPC_URL;
  if (!l1RpcUrl) {
    console.error('env L1_RPC_URL is required');
    process.exit(2);
  }

  let inbox;
  try {
    inbox = resolveBatchInbox({ override: process.env.BATCH_INBOX_ADDRESS, rollup: loadRollup() });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  const scanBlocks = BigInt(envInt('DA_SCAN_BLOCKS', 64));
  const stallBlocks = BigInt(envInt('DA_STALL_BLOCKS', 50));

  const { createPublicClient, http } = await import('viem');
  const client = createPublicClient({ transport: http(l1RpcUrl) });

  let tip;
  try {
    tip = await client.getBlockNumber();
  } catch (err) {
    console.error(`could not reach L1 at ${l1RpcUrl}: ${err.shortMessage || err.message}`);
    process.exit(1);
  }

  const from = tip - scanBlocks + 1n > 0n ? tip - scanBlocks + 1n : 0n;
  console.log(`Scanning L1 blocks ${from}..${tip} for batches to inbox ${inbox}`);

  const blocks = [];
  for (let n = from; n <= tip; n += 1n) {
    try {
      const block = await client.getBlock({ blockNumber: n, includeTransactions: true });
      blocks.push({ number: n, transactions: block.transactions });
    } catch (err) {
      console.error(`failed to fetch L1 block ${n}: ${err.shortMessage || err.message}`);
      process.exit(1);
    }
  }

  const { batchCount, lastBatchBlock } = countBatches(blocks, inbox);
  const gap = blocksSinceLastBatch(lastBatchBlock, tip);
  const { ok, reason } = assessDa({ batchCount, gap, stallBlocks });

  console.log(`batches: ${batchCount}  last-batch-block: ${lastBatchBlock ?? 'none'}  tip: ${tip}`);
  console.log(`${ok ? 'OK' : 'ALARM'}: ${reason}`);
  process.exit(ok ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
