// Unit tests for the PURE helpers in health.mjs — no network, no fs, no devnet.
// Run: node --test  (or: npm run test:unit)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_HEAD_LAG_THRESHOLD,
  parseThreshold,
  toBlockNumber,
  computeHeadLag,
  exceedsThreshold,
  extractSyncStatus,
  formatSyncStatus,
  extractRollupInfo,
} from './health.mjs';

test('parseThreshold: defaults, valid, and rejected inputs', () => {
  assert.equal(parseThreshold(undefined), DEFAULT_HEAD_LAG_THRESHOLD);
  assert.equal(parseThreshold(null), DEFAULT_HEAD_LAG_THRESHOLD);
  assert.equal(parseThreshold(''), DEFAULT_HEAD_LAG_THRESHOLD);
  assert.equal(parseThreshold('   '), DEFAULT_HEAD_LAG_THRESHOLD);
  assert.equal(parseThreshold('0'), 0);
  assert.equal(parseThreshold('100'), 100);
  assert.equal(parseThreshold(' 42 '), 42);
  // invalid -> fallback
  assert.equal(parseThreshold('-5'), DEFAULT_HEAD_LAG_THRESHOLD);
  assert.equal(parseThreshold('3.5'), DEFAULT_HEAD_LAG_THRESHOLD);
  assert.equal(parseThreshold('abc'), DEFAULT_HEAD_LAG_THRESHOLD);
  // custom fallback honored
  assert.equal(parseThreshold(undefined, 7), 7);
});

test('toBlockNumber: hex, decimal string, number, bigint, and bad input', () => {
  assert.equal(toBlockNumber('0x10'), 16n);
  assert.equal(toBlockNumber('0x0'), 0n);
  assert.equal(toBlockNumber('123'), 123n);
  assert.equal(toBlockNumber(456), 456n);
  assert.equal(toBlockNumber(0), 0n);
  assert.equal(toBlockNumber(789n), 789n);
  // graceful null-degradation
  assert.equal(toBlockNumber(undefined), null);
  assert.equal(toBlockNumber(null), null);
  assert.equal(toBlockNumber(''), null);
  assert.equal(toBlockNumber('   '), null);
  assert.equal(toBlockNumber('0xzz'), null);
  assert.equal(toBlockNumber('not-a-number'), null);
  assert.equal(toBlockNumber(-1), null);
  assert.equal(toBlockNumber(1.5), null);
  assert.equal(toBlockNumber(-4n), null);
});

test('computeHeadLag: normal, zero, and clamped-negative', () => {
  assert.equal(computeHeadLag(100n, 90n), 10n);
  assert.equal(computeHeadLag(50n, 50n), 0n);
  // safe ahead of unsafe should never happen; clamp rather than report huge/neg
  assert.equal(computeHeadLag(40n, 55n), 0n);
  // large values stay exact (bigint, no float loss)
  assert.equal(computeHeadLag(10n ** 18n + 5n, 10n ** 18n), 5n);
  assert.throws(() => computeHeadLag(1, 2n), TypeError);
  assert.throws(() => computeHeadLag(1n, 2), TypeError);
});

test('exceedsThreshold: strict-greater semantics and boundary', () => {
  assert.equal(exceedsThreshold(10n, 50), false);
  assert.equal(exceedsThreshold(50n, 50), false); // equal is healthy
  assert.equal(exceedsThreshold(51n, 50), true);
  assert.equal(exceedsThreshold(0n, 0), false);
  assert.equal(exceedsThreshold(1n, 0), true);
  assert.throws(() => exceedsThreshold(5, 10), TypeError);
});

test('extractSyncStatus: full response', () => {
  const raw = {
    current_l1: { number: '0x64', hash: '0xabc' },
    unsafe_l2: { number: 200, hash: '0xdef' },
    safe_l2: { number: '150', hash: '0x111' },
    finalized_l2: { number: '0x80', hash: '0x222' },
  };
  const s = extractSyncStatus(raw);
  assert.equal(s.currentL1, 100n);
  assert.equal(s.unsafeL2, 200n);
  assert.equal(s.safeL2, 150n);
  assert.equal(s.finalizedL2, 128n);
  assert.equal(s.headLag, 50n);
});

test('extractSyncStatus: partial/missing data degrades to null, no throw', () => {
  const s = extractSyncStatus({ unsafe_l2: { number: '0x10' } });
  assert.equal(s.unsafeL2, 16n);
  assert.equal(s.safeL2, null);
  assert.equal(s.finalizedL2, null);
  assert.equal(s.currentL1, null);
  assert.equal(s.headLag, null); // cannot compute without safe

  // fully empty / garbage inputs
  assert.deepEqual(extractSyncStatus(null), {
    unsafeL2: null,
    safeL2: null,
    finalizedL2: null,
    currentL1: null,
    headLag: null,
  });
  assert.deepEqual(extractSyncStatus(undefined).headLag, null);
  assert.equal(extractSyncStatus('nonsense').unsafeL2, null);
});

test('extractSyncStatus: lag clamps when safe unexpectedly ahead', () => {
  const s = extractSyncStatus({
    unsafe_l2: { number: 10 },
    safe_l2: { number: 20 },
  });
  assert.equal(s.headLag, 0n);
});

test('formatSyncStatus: renders numbers and unavailable fields', () => {
  const lines = formatSyncStatus({
    unsafeL2: 200n,
    safeL2: 150n,
    finalizedL2: null,
    currentL1: 100n,
    headLag: 50n,
  });
  assert.equal(lines.length, 5);
  assert.match(lines[0], /unsafe .*: 200$/);
  assert.match(lines[1], /safe .*: 150$/);
  assert.match(lines[2], /finalized .*: unavailable$/);
  assert.match(lines[3], /current .*: 100$/);
  assert.match(lines[4], /lag .*: 50 block\(s\)$/);
});

test('extractRollupInfo: parses op-node rollup.json fields', () => {
  const raw = {
    l1_chain_id: 900,
    l2_chain_id: 2900,
    batch_inbox_address: '0xff00000000000000000000000000000000000900',
    // extra fields ignored
    block_time: 2,
  };
  const info = extractRollupInfo(raw);
  assert.equal(info.l1ChainId, 900);
  assert.equal(info.l2ChainId, 2900);
  assert.equal(info.batchInboxAddress, '0xff00000000000000000000000000000000000900');
});

test('extractRollupInfo: missing fields -> null, no throw', () => {
  const info = extractRollupInfo({});
  assert.equal(info.l1ChainId, null);
  assert.equal(info.l2ChainId, null);
  assert.equal(info.batchInboxAddress, null);
  assert.deepEqual(extractRollupInfo(null), {
    l1ChainId: null,
    l2ChainId: null,
    batchInboxAddress: null,
  });
});
