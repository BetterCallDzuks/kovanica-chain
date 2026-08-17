// health.mjs — operator health-check CLI for a kovanica-chain OP Stack devnet.
//
// Reports:
//   * L1 latest block number       (from L1_RPC_URL)
//   * L2 latest block number       (from L2_RPC_URL)
//   * op-node sync status          (from ROLLUP_NODE_RPC_URL, optional):
//       unsafe / safe / finalized L2 heads, current L1, and unsafe->safe lag
//   * rollup.json summary          (from devnet/out/rollup.json, if present)
//
// Exit code is non-zero when:
//   * any configured RPC is unreachable, OR
//   * the unsafe->safe head lag exceeds HEAD_LAG_THRESHOLD (default 50).
//
// The op-node RPC method is `optimism_syncStatus` (op-node RPC namespace).
// See https://specs.optimism.io and the ethereum-optimism/optimism monorepo
// (op-service/eth SyncStatus). Field names are snake_case: unsafe_l2, safe_l2,
// finalized_l2, current_l1, each an L2/L1 block ref carrying `.number`.
//
// Everything below the "PURE HELPERS" banner is deterministic and network-free
// so it can be unit-tested without a live devnet (see health.test.mjs).

import { createPublicClient, http } from 'viem';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// PURE HELPERS (exported, unit-tested, no I/O, no network)
// ---------------------------------------------------------------------------

export const DEFAULT_HEAD_LAG_THRESHOLD = 50;

/**
 * Parse the HEAD_LAG_THRESHOLD env value into a non-negative integer.
 * Falls back to `fallback` for undefined/empty/invalid input.
 * @param {string|undefined} raw
 * @param {number} [fallback]
 * @returns {number}
 */
export function parseThreshold(raw, fallback = DEFAULT_HEAD_LAG_THRESHOLD) {
  if (raw === undefined || raw === null) return fallback;
  const trimmed = String(raw).trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return fallback;
  return n;
}

/**
 * Coerce a block-ref `number` field (which JSON-RPC may return as a hex
 * string, a decimal string, or a JS number) into a bigint. Returns null when
 * the value is missing or unparseable, so callers can degrade gracefully.
 * @param {unknown} value
 * @returns {bigint|null}
 */
export function toBlockNumber(value) {
  if (value === undefined || value === null) return null;
  try {
    if (typeof value === 'bigint') return value >= 0n ? value : null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
      return BigInt(value);
    }
    if (typeof value === 'string') {
      const t = value.trim();
      if (t === '') return null;
      // BigInt() natively understands "0x"-prefixed hex and decimal strings.
      const n = BigInt(t);
      return n >= 0n ? n : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Compute the unsafe->safe head lag in blocks. Both args are bigint block
 * numbers. A negative difference (safe ahead of unsafe — should not happen)
 * is clamped to 0n so it never masquerades as "healthy" nor as a huge lag.
 * @param {bigint} unsafe
 * @param {bigint} safe
 * @returns {bigint}
 */
export function computeHeadLag(unsafe, safe) {
  if (typeof unsafe !== 'bigint' || typeof safe !== 'bigint') {
    throw new TypeError('computeHeadLag expects bigint block numbers');
  }
  const lag = unsafe - safe;
  return lag > 0n ? lag : 0n;
}

/**
 * Threshold check for the unsafe->safe lag. Lag is a bigint (blocks),
 * threshold a number. Returns true when the lag is strictly greater than the
 * threshold (i.e. unhealthy).
 * @param {bigint} lag
 * @param {number} threshold
 * @returns {boolean}
 */
export function exceedsThreshold(lag, threshold) {
  if (typeof lag !== 'bigint') throw new TypeError('lag must be a bigint');
  const t = parseThreshold(String(threshold), NaN);
  if (!Number.isFinite(t)) throw new TypeError('threshold must be a non-negative integer');
  return lag > BigInt(t);
}

/**
 * Extract and normalize the fields we care about from a raw
 * `optimism_syncStatus` response. Tolerant of missing/partial data: any
 * unavailable block number comes back as null rather than throwing, so a
 * partially-synced node still reports usefully.
 * @param {any} raw
 * @returns {{unsafeL2:bigint|null, safeL2:bigint|null, finalizedL2:bigint|null, currentL1:bigint|null, headLag:bigint|null}}
 */
export function extractSyncStatus(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const refNumber = (ref) => (ref && typeof ref === 'object' ? toBlockNumber(ref.number) : null);

  const unsafeL2 = refNumber(obj.unsafe_l2);
  const safeL2 = refNumber(obj.safe_l2);
  const finalizedL2 = refNumber(obj.finalized_l2);
  const currentL1 = refNumber(obj.current_l1);

  const headLag = unsafeL2 !== null && safeL2 !== null ? computeHeadLag(unsafeL2, safeL2) : null;

  return { unsafeL2, safeL2, finalizedL2, currentL1, headLag };
}

/**
 * Render a normalized sync status (from extractSyncStatus) as human-readable
 * lines. Pure: returns an array of strings, no console side effects.
 * @param {ReturnType<typeof extractSyncStatus>} s
 * @returns {string[]}
 */
export function formatSyncStatus(s) {
  const show = (v) => (v === null || v === undefined ? 'unavailable' : v.toString());
  return [
    `  unsafe    L2 head : ${show(s.unsafeL2)}`,
    `  safe      L2 head : ${show(s.safeL2)}`,
    `  finalized L2 head : ${show(s.finalizedL2)}`,
    `  current   L1      : ${show(s.currentL1)}`,
    `  unsafe->safe lag  : ${show(s.headLag)} block(s)`,
  ];
}

/**
 * Extract the operator-relevant fields from a parsed rollup.json object.
 * Field names follow the op-node rollup config (top-level snake_case):
 * l1_chain_id, l2_chain_id, batch_inbox_address. Missing fields => null.
 * @param {any} raw
 * @returns {{l1ChainId:number|null, l2ChainId:number|null, batchInboxAddress:string|null}}
 */
export function extractRollupInfo(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const toInt = (v) => {
    const n = toBlockNumber(v);
    return n === null ? null : Number(n);
  };
  const addr =
    typeof obj.batch_inbox_address === 'string' && obj.batch_inbox_address.trim() !== ''
      ? obj.batch_inbox_address
      : null;
  return {
    l1ChainId: toInt(obj.l1_chain_id),
    l2ChainId: toInt(obj.l2_chain_id),
    batchInboxAddress: addr,
  };
}

// ---------------------------------------------------------------------------
// IMPURE: network + fs + process wiring (not unit-tested)
// ---------------------------------------------------------------------------

/** Minimal JSON-RPC POST for the op-node RPC (viem has no op-node namespace). */
async function jsonRpc(url, method, params = [], { timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const body = await res.json();
    if (body.error) throw new Error(`RPC error ${body.error.code}: ${body.error.message}`);
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function log(msg = '') {
  process.stdout.write(`${msg}\n`);
}
function errline(msg) {
  process.stderr.write(`${msg}\n`);
}

async function main() {
  const L1_RPC_URL = process.env.L1_RPC_URL;
  const L2_RPC_URL = process.env.L2_RPC_URL;
  const ROLLUP_NODE_RPC_URL = process.env.ROLLUP_NODE_RPC_URL;
  const threshold = parseThreshold(process.env.HEAD_LAG_THRESHOLD);

  const failures = [];

  log('kovanica-chain health check');
  log('===========================');

  // Config validation -------------------------------------------------------
  if (!L1_RPC_URL) failures.push('L1_RPC_URL is not set (required)');
  if (!L2_RPC_URL) failures.push('L2_RPC_URL is not set (required)');
  if (failures.length > 0) {
    for (const f of failures) errline(`FATAL: ${f}`);
    errline('Set the required env vars and retry. See README.md.');
    process.exitCode = 2;
    return;
  }

  // L1 latest block ---------------------------------------------------------
  try {
    const l1 = createPublicClient({ transport: http(L1_RPC_URL) });
    const n = await l1.getBlockNumber();
    log(`L1 latest block : ${n.toString()}  (${L1_RPC_URL})`);
  } catch (e) {
    failures.push(`L1 RPC unreachable at ${L1_RPC_URL}: ${e.message}`);
    errline(`ERROR: L1 RPC unreachable at ${L1_RPC_URL}: ${e.message}`);
  }

  // L2 latest block ---------------------------------------------------------
  try {
    const l2 = createPublicClient({ transport: http(L2_RPC_URL) });
    const n = await l2.getBlockNumber();
    log(`L2 latest block : ${n.toString()}  (${L2_RPC_URL})`);
  } catch (e) {
    failures.push(`L2 RPC unreachable at ${L2_RPC_URL}: ${e.message}`);
    errline(`ERROR: L2 RPC unreachable at ${L2_RPC_URL}: ${e.message}`);
  }

  // op-node sync status -----------------------------------------------------
  if (ROLLUP_NODE_RPC_URL) {
    log('');
    log(`op-node sync status (${ROLLUP_NODE_RPC_URL}):`);
    try {
      const raw = await jsonRpc(ROLLUP_NODE_RPC_URL, 'optimism_syncStatus');
      const s = extractSyncStatus(raw);
      for (const line of formatSyncStatus(s)) log(line);

      if (s.headLag === null) {
        errline('WARN: unsafe/safe heads unavailable; cannot evaluate head lag threshold.');
      } else if (exceedsThreshold(s.headLag, threshold)) {
        failures.push(
          `unsafe->safe head lag ${s.headLag.toString()} exceeds threshold ${threshold} ` +
            `(op-node is not deriving/verifying fast enough, or is stalled)`,
        );
        errline(
          `ERROR: unsafe->safe head lag ${s.headLag.toString()} exceeds threshold ${threshold}`,
        );
      } else {
        log(`  lag within threshold (${threshold})`);
      }
    } catch (e) {
      failures.push(`op-node RPC unreachable at ${ROLLUP_NODE_RPC_URL}: ${e.message}`);
      errline(`ERROR: op-node RPC (optimism_syncStatus) failed at ${ROLLUP_NODE_RPC_URL}: ${e.message}`);
    }
  } else {
    log('');
    log('op-node sync status : skipped (ROLLUP_NODE_RPC_URL not set)');
  }

  // rollup.json summary (best-effort, non-fatal) ----------------------------
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // ops/health -> repo root is two levels up; rollup config lives at devnet/out/rollup.json
    const rollupPath = resolve(here, '..', '..', 'devnet', 'out', 'rollup.json');
    if (existsSync(rollupPath)) {
      const info = extractRollupInfo(JSON.parse(readFileSync(rollupPath, 'utf8')));
      log('');
      log(`rollup config (${rollupPath}):`);
      log(`  L1 chain id        : ${info.l1ChainId ?? 'unavailable'}`);
      log(`  L2 chain id        : ${info.l2ChainId ?? 'unavailable'}`);
      log(`  batch inbox address: ${info.batchInboxAddress ?? 'unavailable'}`);
    }
  } catch (e) {
    errline(`WARN: could not read devnet/out/rollup.json: ${e.message}`);
  }

  // Verdict -----------------------------------------------------------------
  log('');
  if (failures.length > 0) {
    errline(`UNHEALTHY: ${failures.length} problem(s):`);
    for (const f of failures) errline(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  log('HEALTHY: all checks passed.');
  process.exitCode = 0;
}

// Only run the CLI when invoked directly, not when imported by the test file.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    errline(`FATAL: unexpected error: ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  });
}
