// Unit tests for the PURE logic of dispute-mon.mjs — status decoding, record
// normalization, summary, and (most importantly) anomaly detection over a list
// of synthetic game records. NO network, NO viem, NO devnet.
//
//   npm run test:unit          # -> node --test
//
// The anomaly tests deliberately include ADVERSARIAL game trees (a respected
// game type proven invalid, a stuck game near clock expiry, a stale proposer)
// because honest-only coverage proves nothing about a fault-proof monitor: its
// entire job is to notice the dishonest / degraded cases.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  GAME_STATUS,
  decodeStatus,
  normalizeGame,
  isRespectedType,
  summarize,
  detectAnomalies,
  hasCriticalAlarm,
  isHexAddress,
  resolveAddress,
  loadDeploymentState,
  loadConfig,
} from './dispute-mon.mjs';

const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';

// Helper to build a normalized synthetic game record.
function game(overrides = {}) {
  return normalizeGame({
    index: 0,
    gameType: 0,
    timestamp: 1_000_000,
    proxy: ADDR_A,
    status: GAME_STATUS.IN_PROGRESS,
    l2BlockNumber: 100n,
    rootClaim: '0x' + 'ab'.repeat(32),
    ...overrides,
  });
}

// --- decodeStatus ----------------------------------------------------------

test('decodeStatus: maps known enum values', () => {
  assert.equal(decodeStatus(0), 'IN_PROGRESS');
  assert.equal(decodeStatus(1), 'CHALLENGER_WINS');
  assert.equal(decodeStatus(2), 'DEFENDER_WINS');
});

test('decodeStatus: accepts bigint (as viem returns) and coerces', () => {
  assert.equal(decodeStatus(1n), 'CHALLENGER_WINS');
});

test('decodeStatus: surfaces unknown enum loudly, never silently', () => {
  assert.equal(decodeStatus(7), 'UNKNOWN(7)');
});

// --- normalizeGame ---------------------------------------------------------

test('normalizeGame: keeps l2BlockNumber as BigInt, coerces small fields to Number', () => {
  const g = normalizeGame({
    index: 3n,
    gameType: 0n,
    timestamp: 1234n,
    proxy: ADDR_A,
    status: 2n,
    l2BlockNumber: 9007199254740993n, // > 2^53, must not lose precision
    rootClaim: '0xdead',
  });
  assert.equal(typeof g.index, 'number');
  assert.equal(typeof g.gameType, 'number');
  assert.equal(typeof g.status, 'number');
  assert.equal(g.statusLabel, 'DEFENDER_WINS');
  assert.equal(typeof g.l2BlockNumber, 'bigint');
  assert.equal(g.l2BlockNumber, 9007199254740993n);
});

test('normalizeGame: tolerates missing (null) status fields', () => {
  const g = normalizeGame({ index: 1, gameType: 0, timestamp: 1, proxy: ADDR_A });
  assert.equal(g.status, null);
  assert.equal(g.statusLabel, 'UNKNOWN(undefined)');
  assert.equal(g.l2BlockNumber, null);
});

// --- isRespectedType -------------------------------------------------------

test('isRespectedType: compares numerically across bigint/number', () => {
  assert.equal(isRespectedType(game({ gameType: 0n }), 0), true);
  assert.equal(isRespectedType(game({ gameType: 1 }), 0), false);
});

// --- summarize -------------------------------------------------------------

test('summarize: counts by status label incl. unknown', () => {
  const recs = [
    game({ status: 0 }),
    game({ status: 1 }),
    game({ status: 2 }),
    game({ status: 2 }),
    game({ status: 9 }),
  ];
  const s = summarize(recs);
  assert.equal(s.total, 5);
  assert.deepEqual(s.counts, {
    IN_PROGRESS: 1,
    CHALLENGER_WINS: 1,
    DEFENDER_WINS: 2,
    UNKNOWN: 1,
  });
});

// --- detectAnomalies: THE critical alarm -----------------------------------

test('detectAnomalies: respected game type resolving CHALLENGER_WINS is CRITICAL', () => {
  const recs = [game({ index: 5, gameType: 0, status: GAME_STATUS.CHALLENGER_WINS })];
  const anomalies = detectAnomalies(recs, { respectedGameType: 0 });
  const crit = anomalies.filter((a) => a.level === 'critical');
  assert.equal(crit.length, 1);
  assert.equal(crit[0].code, 'RESPECTED_CHALLENGER_WINS');
  assert.equal(crit[0].gameIndex, 5);
  assert.equal(hasCriticalAlarm(anomalies), true);
});

test('detectAnomalies: honest defender wins is NOT an anomaly', () => {
  const recs = [
    game({ index: 1, gameType: 0, status: GAME_STATUS.DEFENDER_WINS }),
    game({ index: 2, gameType: 0, status: GAME_STATUS.DEFENDER_WINS }),
  ];
  const anomalies = detectAnomalies(recs, { respectedGameType: 0 });
  assert.equal(anomalies.length, 0);
  assert.equal(hasCriticalAlarm(anomalies), false);
});

test('detectAnomalies: CHALLENGER_WINS on a NON-respected type is only info, not critical', () => {
  const recs = [game({ index: 4, gameType: 1, status: GAME_STATUS.CHALLENGER_WINS })];
  const anomalies = detectAnomalies(recs, { respectedGameType: 0 });
  assert.equal(hasCriticalAlarm(anomalies), false);
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].level, 'info');
  assert.equal(anomalies[0].code, 'NONRESPECTED_CHALLENGER_WINS');
});

test('detectAnomalies: respected type is configurable (not hardcoded to 0)', () => {
  // On a chain whose respected game type is 1, a type-1 CHALLENGER_WINS is the
  // critical one and a type-0 one is merely informational.
  const recs = [
    game({ index: 1, gameType: 1, status: GAME_STATUS.CHALLENGER_WINS }),
    game({ index: 2, gameType: 0, status: GAME_STATUS.CHALLENGER_WINS }),
  ];
  const anomalies = detectAnomalies(recs, { respectedGameType: 1 });
  const crit = anomalies.filter((a) => a.level === 'critical');
  assert.equal(crit.length, 1);
  assert.equal(crit[0].gameIndex, 1);
});

// --- detectAnomalies: adversarial multi-game tree --------------------------

test('detectAnomalies: mixed adversarial window flags exactly the invalid respected game', () => {
  const recs = [
    game({ index: 10, gameType: 0, status: GAME_STATUS.DEFENDER_WINS }), // honest
    game({ index: 11, gameType: 0, status: GAME_STATUS.IN_PROGRESS }), // in flight
    game({ index: 12, gameType: 0, status: GAME_STATUS.CHALLENGER_WINS }), // BAD proposal caught
    game({ index: 13, gameType: 1, status: GAME_STATUS.CHALLENGER_WINS }), // wrong-type, info
  ];
  const anomalies = detectAnomalies(recs, { respectedGameType: 0 });
  assert.equal(hasCriticalAlarm(anomalies), true);
  const crit = anomalies.filter((a) => a.level === 'critical');
  assert.equal(crit.length, 1);
  assert.equal(crit[0].gameIndex, 12);
});

// --- detectAnomalies: unknown status enum ----------------------------------

test('detectAnomalies: unknown status enum warns about a possibly-stale ABI', () => {
  const recs = [game({ index: 1, status: 42 })];
  const anomalies = detectAnomalies(recs, { respectedGameType: 0 });
  const w = anomalies.filter((a) => a.code === 'UNKNOWN_STATUS');
  assert.equal(w.length, 1);
  assert.equal(w[0].level, 'warning');
});

// --- detectAnomalies: IN_PROGRESS past its clock ---------------------------

test('detectAnomalies: IN_PROGRESS well past 2x max clock is a liveness warning', () => {
  const now = 1_000_000;
  const maxClock = 300;
  // created 700s ago -> age 700 > 2*300 = 600
  const recs = [game({ index: 1, status: GAME_STATUS.IN_PROGRESS, timestamp: now - 700 })];
  const anomalies = detectAnomalies(recs, {
    respectedGameType: 0,
    now,
    maxClockDurationSeconds: maxClock,
  });
  const w = anomalies.filter((a) => a.code === 'IN_PROGRESS_PAST_CLOCK');
  assert.equal(w.length, 1);
  assert.equal(w[0].level, 'warning');
});

test('detectAnomalies: young IN_PROGRESS game within clock is fine', () => {
  const now = 1_000_000;
  const recs = [game({ index: 1, status: GAME_STATUS.IN_PROGRESS, timestamp: now - 100 })];
  const anomalies = detectAnomalies(recs, {
    respectedGameType: 0,
    now,
    maxClockDurationSeconds: 300,
  });
  assert.equal(anomalies.length, 0);
});

test('detectAnomalies: clock check skipped when no clock/now provided', () => {
  const recs = [game({ status: GAME_STATUS.IN_PROGRESS, timestamp: 1 })];
  const anomalies = detectAnomalies(recs, { respectedGameType: 0 });
  assert.equal(anomalies.length, 0);
});

// --- detectAnomalies: proposer staleness -----------------------------------

test('detectAnomalies: stale proposer (no fresh games) warns', () => {
  const now = 1_000_000;
  const interval = 600; // 10m
  // newest game created 3000s ago -> gap 3000 > 3*600 = 1800
  const recs = [
    game({ index: 1, status: GAME_STATUS.DEFENDER_WINS, timestamp: now - 3000 }),
    game({ index: 2, status: GAME_STATUS.DEFENDER_WINS, timestamp: now - 4000 }),
  ];
  const anomalies = detectAnomalies(recs, {
    respectedGameType: 0,
    now,
    proposalIntervalSeconds: interval,
  });
  const w = anomalies.filter((a) => a.code === 'PROPOSER_STALE');
  assert.equal(w.length, 1);
  assert.equal(w[0].level, 'warning');
  assert.equal(w[0].gameIndex, null);
});

test('detectAnomalies: fresh proposer within interval does not warn', () => {
  const now = 1_000_000;
  const recs = [game({ index: 1, status: GAME_STATUS.DEFENDER_WINS, timestamp: now - 100 })];
  const anomalies = detectAnomalies(recs, {
    respectedGameType: 0,
    now,
    proposalIntervalSeconds: 600,
  });
  assert.equal(anomalies.filter((a) => a.code === 'PROPOSER_STALE').length, 0);
});

test('detectAnomalies: empty window produces no anomalies and no crash', () => {
  const anomalies = detectAnomalies([], {
    respectedGameType: 0,
    now: 1,
    proposalIntervalSeconds: 600,
    maxClockDurationSeconds: 300,
  });
  assert.deepEqual(anomalies, []);
});

// --- isHexAddress ----------------------------------------------------------

test('isHexAddress: validates 20-byte hex, rejects junk', () => {
  assert.equal(isHexAddress(ADDR_A), true);
  assert.equal(isHexAddress('0x123'), false);
  assert.equal(isHexAddress('notanaddress'), false);
  assert.equal(isHexAddress(undefined), false);
});

// --- resolveAddress (mirrors roundtrip.mjs resolution) ---------------------

test('resolveAddress: env override wins', () => {
  const got = resolveAddress({
    state: { DisputeGameFactoryProxy: ADDR_B },
    statePath: 's',
    label: 'DisputeGameFactoryProxy',
    envOverride: ADDR_A,
    flatKeys: ['DisputeGameFactoryProxy'],
    nestedKeys: [],
  });
  assert.equal(got, ADDR_A);
});

test('resolveAddress: invalid override rejected', () => {
  assert.throws(
    () =>
      resolveAddress({
        state: {},
        statePath: 's',
        label: 'X',
        envOverride: '0xnope',
        flatKeys: [],
        nestedKeys: [],
      }),
    /not a valid address/,
  );
});

test('resolveAddress: flat key then nested opChainDeployments fallback', () => {
  assert.equal(
    resolveAddress({
      state: { DisputeGameFactoryProxy: ADDR_A },
      statePath: 's',
      label: 'X',
      envOverride: undefined,
      flatKeys: ['DisputeGameFactoryProxy'],
      nestedKeys: [],
    }),
    ADDR_A,
  );
  assert.equal(
    resolveAddress({
      state: { opChainDeployments: [{ disputeGameFactoryProxyAddress: ADDR_B }] },
      statePath: 's',
      label: 'X',
      envOverride: undefined,
      flatKeys: ['DisputeGameFactoryProxy'],
      nestedKeys: ['disputeGameFactoryProxyAddress'],
    }),
    ADDR_B,
  );
});

test('resolveAddress: unresolved throws a helpful error', () => {
  assert.throws(
    () =>
      resolveAddress({
        state: { other: 1 },
        statePath: '/x/state.json',
        label: 'DisputeGameFactoryProxy',
        envOverride: undefined,
        flatKeys: ['DisputeGameFactoryProxy'],
        nestedKeys: ['disputeGameFactoryProxyAddress'],
      }),
    /Could not resolve DisputeGameFactoryProxy/,
  );
});

// --- loadDeploymentState ---------------------------------------------------

test('loadDeploymentState: missing file hint', () => {
  assert.throws(
    () => loadDeploymentState('/nonexistent/state.json'),
    /Deployment state file not found/,
  );
});

test('loadDeploymentState: parses valid json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kovanica-dm-'));
  try {
    const p = join(dir, 'state.json');
    writeFileSync(p, JSON.stringify({ DisputeGameFactoryProxy: ADDR_A }));
    assert.equal(loadDeploymentState(p).DisputeGameFactoryProxy, ADDR_A);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadDeploymentState: invalid json reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kovanica-dm-'));
  try {
    const p = join(dir, 'state.json');
    writeFileSync(p, '{ not json');
    assert.throws(() => loadDeploymentState(p), /not valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- loadConfig ------------------------------------------------------------

test('loadConfig: requires L1_RPC_URL', () => {
  assert.throws(() => loadConfig({}), /L1_RPC_URL is required/);
});

test('loadConfig: defaults respected type 0 and scan 20', () => {
  const c = loadConfig({ L1_RPC_URL: 'http://l1' });
  assert.equal(c.respectedGameType, 0);
  assert.equal(c.gamesToScan, 20);
  assert.equal(c.maxClockDurationSeconds, null);
  assert.equal(c.proposalIntervalSeconds, null);
});

test('loadConfig: reads overrides and rejects bad integers', () => {
  const c = loadConfig({
    L1_RPC_URL: 'http://l1',
    RESPECTED_GAME_TYPE: '1',
    GAMES_TO_SCAN: '50',
    DISPUTE_GAME_FACTORY_ADDRESS: ADDR_A,
    FAULT_GAME_MAX_CLOCK_DURATION: '300',
    PROPOSAL_INTERVAL_SECONDS: '600',
  });
  assert.equal(c.respectedGameType, 1);
  assert.equal(c.gamesToScan, 50);
  assert.equal(c.disputeGameFactoryOverride, ADDR_A);
  assert.equal(c.maxClockDurationSeconds, 300);
  assert.equal(c.proposalIntervalSeconds, 600);

  assert.throws(
    () => loadConfig({ L1_RPC_URL: 'http://l1', GAMES_TO_SCAN: 'x' }),
    /must be a non-negative integer/,
  );
});
