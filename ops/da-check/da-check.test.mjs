// Unit tests for da-check pure logic (no network, no viem).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assessDa,
  blocksSinceLastBatch,
  countBatches,
  isHexAddress,
  resolveBatchInbox,
} from './da-check.mjs';

const INBOX = '0xff00000000000000000000000000000000000000';
const OTHER = '0x1111111111111111111111111111111111111111';

test('isHexAddress accepts/rejects correctly', () => {
  assert.ok(isHexAddress(INBOX));
  assert.ok(!isHexAddress('0x123'));
  assert.ok(!isHexAddress('nope'));
});

test('resolveBatchInbox: override wins and is validated', () => {
  assert.equal(resolveBatchInbox({ override: INBOX, rollup: null }), INBOX);
  assert.throws(() => resolveBatchInbox({ override: '0xbad', rollup: null }), /not a valid address/);
});

test('resolveBatchInbox: falls back to rollup.json', () => {
  assert.equal(
    resolveBatchInbox({ override: undefined, rollup: { batch_inbox_address: INBOX } }),
    INBOX,
  );
});

test('resolveBatchInbox: throws when neither source is usable', () => {
  assert.throws(() => resolveBatchInbox({ override: '', rollup: {} }), /Could not resolve the batch inbox/);
});

test('countBatches counts txs to the inbox and tracks the last block', () => {
  const blocks = [
    { number: 10n, transactions: [{ to: OTHER }, { to: INBOX }] },
    { number: 11n, transactions: [{ to: OTHER }] },
    { number: 12n, transactions: [{ to: INBOX }, { to: INBOX }] },
  ];
  const { batchCount, lastBatchBlock } = countBatches(blocks, INBOX);
  assert.equal(batchCount, 3);
  assert.equal(lastBatchBlock, 12n);
});

test('countBatches: none found → zero and null', () => {
  const { batchCount, lastBatchBlock } = countBatches([{ number: 1n, transactions: [{ to: OTHER }] }], INBOX);
  assert.equal(batchCount, 0);
  assert.equal(lastBatchBlock, null);
});

test('blocksSinceLastBatch computes the gap and clamps negatives', () => {
  assert.equal(blocksSinceLastBatch(90n, 100n), 10n);
  assert.equal(blocksSinceLastBatch(100n, 90n), 0n);
  assert.equal(blocksSinceLastBatch(null, 100n), null);
});

test('assessDa: healthy within threshold', () => {
  assert.deepEqual(assessDa({ batchCount: 3, gap: 5n, stallBlocks: 50n }).ok, true);
});

test('assessDa: no batches is an alarm', () => {
  const r = assessDa({ batchCount: 0, gap: null, stallBlocks: 50n });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no batches/);
});

test('assessDa: gap over threshold is a stall alarm', () => {
  const r = assessDa({ batchCount: 2, gap: 80n, stallBlocks: 50n });
  assert.equal(r.ok, false);
  assert.match(r.reason, /DA stall/);
});
