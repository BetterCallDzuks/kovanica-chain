#!/usr/bin/env node
// kovanica-chain — dispute-game spot-check monitor
//
// A LIGHTWEIGHT operator spot-check over the DisputeGameFactory. It is NOT a
// replacement for op-dispute-mon (the production monitor that should run
// continuously with alerting) — it is a fast, dependency-light command you can
// point at any L1 RPC to answer "is anything on fire right now?".
//
// What it does:
//   1. Resolve the DisputeGameFactory address (env DISPUTE_GAME_FACTORY_ADDRESS
//      or devnet/out/state.json — same resolution style as
//      test/e2e/withdrawal-roundtrip/roundtrip.mjs).
//   2. Read gameCount() and iterate the most recent N games:
//        gameAtIndex(i) -> (gameType, timestamp, proxy)
//        proxy.status() / l2BlockNumber() / rootClaim()
//   3. Print a summary (counts by status, newest games) and FLAG anomalies.
//
// The single most important alarm: a game of the RESPECTED game type resolving
// CHALLENGER_WINS. That means an on-chain fault proof concluded a proposed
// output root was INVALID — i.e. either a broken/malicious proposer produced a
// bad root, or (worse) the fault-proof system itself is misbehaving. Either way
// the trust-minimized withdrawal path is compromised and this is CRITICAL. When
// found, the process exits non-zero so a cron/CI wrapper alerts.
//
// This file is correct-by-construction: it has NOT been run against a live
// devnet in this environment (no devnet available here). The PURE helpers are
// exported and unit-tested in dispute-mon.test.mjs with synthetic records and
// no network. The network path (main) dynamically imports viem so the pure
// helpers stay importable/testable even when viem is not installed.
//
// ABI notes — verify every signature/enum against the DEPLOYED contracts and
// the spec (https://specs.optimism.io, ethereum-optimism/optimism
// packages/contracts-bedrock) before trusting output on a real network:
//   * DisputeGameFactory.gameCount() -> uint256
//   * DisputeGameFactory.gameAtIndex(uint256) -> (GameType uint32,
//     Timestamp uint64, IDisputeGame address). GameType is a uint32 and
//     Timestamp a uint64 in the current contracts; decoded here accordingly.
//   * IDisputeGame.status() -> uint8 GameStatus enum
//       0 = IN_PROGRESS, 1 = CHALLENGER_WINS, 2 = DEFENDER_WINS
//   * IDisputeGame.l2BlockNumber() -> uint256
//   * IDisputeGame.rootClaim() -> bytes32
// If any of these selectors/enum values differ on the deployed contracts,
// FIX THEM HERE — do not let a stale ABI silently mis-decode a CHALLENGER_WINS.

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ops/dispute-mon/ -> repo root is two levels up.
const REPO_ROOT = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// PURE helpers (no network, no viem) — exported and unit-tested.
// ---------------------------------------------------------------------------

// GameStatus enum, per the FaultDisputeGame contract. VERIFY against the
// deployed contract before trusting: the whole point of this tool is that a
// mis-mapped enum could turn a critical CHALLENGER_WINS into a silent pass.
export const GAME_STATUS = Object.freeze({
  IN_PROGRESS: 0,
  CHALLENGER_WINS: 1,
  DEFENDER_WINS: 2,
});

export const STATUS_LABELS = Object.freeze({
  0: 'IN_PROGRESS',
  1: 'CHALLENGER_WINS',
  2: 'DEFENDER_WINS',
});

// Decode a numeric GameStatus into a label. Unknown values are surfaced
// loudly (never silently coerced) — an unexpected enum is itself an anomaly.
export function decodeStatus(status) {
  const n = Number(status);
  if (Object.prototype.hasOwnProperty.call(STATUS_LABELS, n)) {
    return STATUS_LABELS[n];
  }
  return `UNKNOWN(${status})`;
}

// Normalize a raw game record (fields may arrive as bigint from viem, or as
// number/string from tests / JSON) into a canonical shape. Numeric on-chain
// counters that can exceed 2^53 (l2BlockNumber) are kept as BigInt; small,
// bounded values (gameType, status, timestamp seconds) are coerced to Number
// for ergonomic comparison and printing.
export function normalizeGame(raw) {
  const toBig = (v) => (v === undefined || v === null ? null : BigInt(v));
  const toNum = (v) => (v === undefined || v === null ? null : Number(v));
  return {
    index: toNum(raw.index),
    gameType: toNum(raw.gameType),
    // creation timestamp (unix seconds) from gameAtIndex
    timestamp: toNum(raw.timestamp),
    proxy: raw.proxy ?? null,
    status: toNum(raw.status),
    statusLabel: decodeStatus(raw.status),
    l2BlockNumber: toBig(raw.l2BlockNumber),
    rootClaim: raw.rootClaim ?? null,
  };
}

export function isRespectedType(game, respectedGameType) {
  return Number(game.gameType) === Number(respectedGameType);
}

// Summary over a list of (already normalized) game records.
// `records` is expected newest-first but this function does not rely on order.
export function summarize(records) {
  const counts = {
    IN_PROGRESS: 0,
    CHALLENGER_WINS: 0,
    DEFENDER_WINS: 0,
    UNKNOWN: 0,
  };
  for (const g of records) {
    const label = decodeStatus(g.status);
    if (label in counts) counts[label] += 1;
    else counts.UNKNOWN += 1;
  }
  return {
    total: records.length,
    counts,
  };
}

// Detect anomalies over a list of normalized game records.
//
// Options:
//   respectedGameType         - the chain's respected/canonical game type (default 0)
//   now                       - unix seconds "now" (optional; enables time-based checks)
//   maxClockDurationSeconds   - faultGameMaxClockDuration (optional; enables the
//                               "IN_PROGRESS past its clock" check)
//   proposalIntervalSeconds   - expected op-proposer cadence (optional; enables the
//                               "no fresh proposals" staleness check)
//   staleIntervalMultiplier   - how many proposal intervals of silence before we
//                               warn about proposer/cadence staleness (default 3)
//
// Returns an array of { level, code, gameIndex|null, message }. `level` is one
// of 'critical' | 'warning' | 'info'. Only 'critical' should page/exit-nonzero.
export function detectAnomalies(records, options = {}) {
  const {
    respectedGameType = 0,
    now = null,
    maxClockDurationSeconds = null,
    proposalIntervalSeconds = null,
    staleIntervalMultiplier = 3,
  } = options;

  const anomalies = [];

  for (const g of records) {
    const respected = isRespectedType(g, respectedGameType);
    const status = Number(g.status);

    // --- THE critical alarm --------------------------------------------------
    // A respected-game-type game that resolved CHALLENGER_WINS means a proposed
    // output root was proven INVALID on-chain. Withdrawals proven against this
    // root must not be trusted; the trust-minimized path is compromised.
    if (status === GAME_STATUS.CHALLENGER_WINS && respected) {
      anomalies.push({
        level: 'critical',
        code: 'RESPECTED_CHALLENGER_WINS',
        gameIndex: g.index,
        message:
          `Respected game type (${respectedGameType}) game #${g.index} resolved ` +
          `CHALLENGER_WINS — a proposed output root for L2 block ` +
          `${g.l2BlockNumber ?? '?'} (rootClaim ${g.rootClaim ?? '?'}) was proven ` +
          `INVALID. Treat withdrawals finalized/proven against this game as ` +
          `suspect and escalate immediately.`,
      });
    }

    // A non-respected game type resolving CHALLENGER_WINS is far less alarming
    // (that game type does not finalize withdrawals), but is still worth noting
    // — e.g. a mis-configured proposer submitting to the wrong game type.
    if (status === GAME_STATUS.CHALLENGER_WINS && !respected) {
      anomalies.push({
        level: 'info',
        code: 'NONRESPECTED_CHALLENGER_WINS',
        gameIndex: g.index,
        message:
          `Non-respected game type (${g.gameType}) game #${g.index} resolved ` +
          `CHALLENGER_WINS. Not withdrawal-critical, but confirm no honest ` +
          `proposer is submitting to the wrong game type.`,
      });
    }

    // --- Unknown status enum -------------------------------------------------
    if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, status)) {
      anomalies.push({
        level: 'warning',
        code: 'UNKNOWN_STATUS',
        gameIndex: g.index,
        message:
          `Game #${g.index} has unknown status enum ${g.status}. The ABI/enum ` +
          `mapping in this tool may be stale — verify against the deployed ` +
          `contract before trusting any other output.`,
      });
    }

    // --- IN_PROGRESS past its clock -----------------------------------------
    // Heuristic: a game whose age exceeds ~2x faultGameMaxClockDuration should
    // normally be resolvable (both the root claimant's and challenger's clocks
    // have run down). One still IN_PROGRESS well past that may indicate a stuck
    // challenger, an unresolved subgame, or a censorship/liveness problem that
    // could let an invalid root's clock expire in its favor. This is a
    // heuristic threshold — tune per the deployed clock config.
    if (
      status === GAME_STATUS.IN_PROGRESS &&
      now !== null &&
      maxClockDurationSeconds !== null &&
      g.timestamp !== null
    ) {
      const age = Number(now) - Number(g.timestamp);
      const overdueThreshold = 2 * Number(maxClockDurationSeconds);
      if (age > overdueThreshold) {
        anomalies.push({
          level: 'warning',
          code: 'IN_PROGRESS_PAST_CLOCK',
          gameIndex: g.index,
          message:
            `Game #${g.index} is still IN_PROGRESS after ${age}s (> 2x ` +
            `faultGameMaxClockDuration=${maxClockDurationSeconds}s). Check that ` +
            `op-challenger is live and resolving/defending; a stuck game near ` +
            `clock expiry is a liveness risk.`,
        });
      }
    }
  }

  // --- Proposer cadence / staleness -----------------------------------------
  // If the newest game is much older than the expected proposal interval, the
  // proposer may be down — which stalls the withdrawal path (no game to prove
  // against). Uses the max creation timestamp across the scanned window.
  if (
    now !== null &&
    proposalIntervalSeconds !== null &&
    records.length > 0
  ) {
    const timestamps = records
      .map((g) => (g.timestamp === null ? null : Number(g.timestamp)))
      .filter((t) => t !== null);
    if (timestamps.length > 0) {
      const newest = Math.max(...timestamps);
      const gap = Number(now) - newest;
      const staleThreshold =
        Number(proposalIntervalSeconds) * Number(staleIntervalMultiplier);
      if (gap > staleThreshold) {
        anomalies.push({
          level: 'warning',
          code: 'PROPOSER_STALE',
          gameIndex: null,
          message:
            `Newest scanned game is ${gap}s old (> ${staleIntervalMultiplier}x ` +
            `proposal interval ${proposalIntervalSeconds}s). op-proposer may be ` +
            `down or censored — withdrawals cannot be proven without a fresh ` +
            `game covering their L2 block.`,
        });
      }
    }
  }

  return anomalies;
}

export function hasCriticalAlarm(anomalies) {
  return anomalies.some((a) => a.level === 'critical');
}

// Cheap, viem-free address validator so resolveAddress stays a PURE helper.
export function isHexAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

// Resolve a contract address, priority order (mirrors roundtrip.mjs):
//   1. explicit env override
//   2. flat top-level key on state.json (e.g. DisputeGameFactoryProxy)
//   3. nested op-deployer opChainDeployments[] schema.
export function resolveAddress({
  state,
  statePath,
  label,
  envOverride,
  flatKeys,
  nestedKeys,
}) {
  if (envOverride) {
    if (!isHexAddress(envOverride)) {
      throw new Error(
        `${label} (from env override) is not a valid address (got: ${JSON.stringify(
          envOverride,
        )})`,
      );
    }
    return envOverride;
  }

  for (const key of flatKeys) {
    const v = state?.[key];
    if (typeof v === 'string' && v) {
      if (!isHexAddress(v)) {
        throw new Error(
          `${label} (state.${key}) is not a valid address (got: ${JSON.stringify(v)})`,
        );
      }
      return v;
    }
  }

  const chainDeployments = Array.isArray(state?.opChainDeployments)
    ? state.opChainDeployments
    : [];
  for (const deployment of chainDeployments) {
    for (const key of nestedKeys) {
      const v = deployment?.[key];
      if (typeof v === 'string' && v) {
        if (!isHexAddress(v)) {
          throw new Error(
            `${label} (state.opChainDeployments[].${key}) is not a valid address ` +
              `(got: ${JSON.stringify(v)})`,
          );
        }
        return v;
      }
    }
  }

  throw new Error(
    `Could not resolve ${label} from deployment state.\n` +
      `  file:                 ${statePath}\n` +
      `  looked for flat keys: ${flatKeys.join(', ')}\n` +
      `  looked for nested keys (under state.opChainDeployments[]): ${nestedKeys.join(', ')}\n` +
      `  top-level keys present in file: ${Object.keys(state ?? {}).join(', ') || '(none)'}\n` +
      `Set DISPUTE_GAME_FACTORY_ADDRESS or point DEPLOYMENT_STATE_PATH at a valid ` +
      `state.json (make devnet-inspect).`,
  );
}

export function loadDeploymentState(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw new Error(
        `Deployment state file not found: ${path}\n` +
          `Set DISPUTE_GAME_FACTORY_ADDRESS to skip state.json, or run ` +
          `'make devnet-up && make devnet-inspect' and/or set DEPLOYMENT_STATE_PATH.`,
      );
    }
    throw new Error(`Failed to read deployment state at ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Deployment state at ${path} is not valid JSON: ${err.message}`);
  }
}

// Parse/validate CLI config from env. PURE (no I/O beyond reading env).
export function loadConfig(env = process.env) {
  const l1RpcUrl = env.L1_RPC_URL;
  if (!l1RpcUrl) throw new Error('env L1_RPC_URL is required');

  const rawStatePath =
    env.DEPLOYMENT_STATE_PATH && env.DEPLOYMENT_STATE_PATH !== ''
      ? env.DEPLOYMENT_STATE_PATH
      : join(REPO_ROOT, 'devnet', 'out', 'state.json');
  const deploymentStatePath = isAbsolute(rawStatePath)
    ? rawStatePath
    : resolve(process.cwd(), rawStatePath);

  const parseIntEnv = (name, fallback) => {
    const v = env[name];
    if (v === undefined || v === '') return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`env ${name}=${v} must be a non-negative integer`);
    }
    return n;
  };

  return {
    l1RpcUrl,
    deploymentStatePath,
    disputeGameFactoryOverride: env.DISPUTE_GAME_FACTORY_ADDRESS,
    respectedGameType: parseIntEnv('RESPECTED_GAME_TYPE', 0),
    gamesToScan: parseIntEnv('GAMES_TO_SCAN', 20),
    // Optional context for time-based heuristics (seconds). If unset, those
    // checks are skipped rather than guessed.
    maxClockDurationSeconds:
      env.FAULT_GAME_MAX_CLOCK_DURATION === undefined ||
      env.FAULT_GAME_MAX_CLOCK_DURATION === ''
        ? null
        : parseIntEnv('FAULT_GAME_MAX_CLOCK_DURATION', null),
    proposalIntervalSeconds:
      env.PROPOSAL_INTERVAL_SECONDS === undefined ||
      env.PROPOSAL_INTERVAL_SECONDS === ''
        ? null
        : parseIntEnv('PROPOSAL_INTERVAL_SECONDS', null),
  };
}

export function resolveDisputeGameFactory(config) {
  if (config.disputeGameFactoryOverride) {
    return resolveAddress({
      state: {},
      statePath: '(env override)',
      label: 'DisputeGameFactoryProxy',
      envOverride: config.disputeGameFactoryOverride,
      flatKeys: [],
      nestedKeys: [],
    });
  }
  const state = loadDeploymentState(config.deploymentStatePath);
  return resolveAddress({
    state,
    statePath: config.deploymentStatePath,
    label: 'DisputeGameFactoryProxy',
    envOverride: undefined,
    flatKeys: ['DisputeGameFactoryProxy'],
    nestedKeys: [
      'disputeGameFactoryProxyAddress',
      'DisputeGameFactoryProxyAddress',
    ],
  });
}

// ---------------------------------------------------------------------------
// Minimal ABIs — see the "ABI notes" header. VERIFY against deployed contracts.
// ---------------------------------------------------------------------------

export const DISPUTE_GAME_FACTORY_ABI = [
  {
    type: 'function',
    name: 'gameCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'gameCount_', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'gameAtIndex',
    stateMutability: 'view',
    inputs: [{ name: '_index', type: 'uint256' }],
    outputs: [
      { name: 'gameType', type: 'uint32' },
      { name: 'timestamp', type: 'uint64' },
      { name: 'proxy', type: 'address' },
    ],
  },
];

export const DISPUTE_GAME_ABI = [
  {
    type: 'function',
    name: 'status',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'status_', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'l2BlockNumber',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'l2BlockNumber_', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'rootClaim',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'rootClaim_', type: 'bytes32' }],
  },
];

// ---------------------------------------------------------------------------
// Network path (main) — dynamically imports viem so the pure helpers above stay
// importable/testable without viem installed.
// ---------------------------------------------------------------------------

async function fetchGames({ client, factoryAddress, count, scan }) {
  const { getContract } = await import('viem');
  const factory = getContract({
    address: factoryAddress,
    abi: DISPUTE_GAME_FACTORY_ABI,
    client,
  });

  const total = Number(count);
  const n = Math.min(scan, total);
  const records = [];
  // Iterate the most-recent N games, newest-first.
  for (let k = 0; k < n; k += 1) {
    const index = total - 1 - k;
    const [gameType, timestamp, proxy] = await factory.read.gameAtIndex([
      BigInt(index),
    ]);

    const game = getContract({
      address: proxy,
      abi: DISPUTE_GAME_ABI,
      client,
    });

    let status = null;
    let l2BlockNumber = null;
    let rootClaim = null;
    try {
      [status, l2BlockNumber, rootClaim] = await Promise.all([
        game.read.status(),
        game.read.l2BlockNumber(),
        game.read.rootClaim(),
      ]);
    } catch (err) {
      // A game proxy that fails to answer is itself notable; record what we
      // have and let anomaly detection flag the unknown status.
      console.error(
        `[dispute-mon] warning: failed reading game #${index} (${proxy}): ${err.message}`,
      );
    }

    records.push(
      normalizeGame({
        index,
        gameType,
        timestamp,
        proxy,
        status,
        l2BlockNumber,
        rootClaim,
      }),
    );
  }
  return records;
}

function printReport({ factoryAddress, gameCount, records, summary, anomalies, config }) {
  const line = '='.repeat(72);
  console.log(line);
  console.log('kovanica-chain dispute-mon — spot check');
  console.log(line);
  console.log(`DisputeGameFactory:  ${factoryAddress}`);
  console.log(`respected game type: ${config.respectedGameType}`);
  console.log(`gameCount():         ${gameCount}`);
  console.log(`scanned (newest):    ${summary.total}`);
  console.log('');
  console.log('status counts (scanned window):');
  for (const [label, n] of Object.entries(summary.counts)) {
    console.log(`  ${label.padEnd(16)} ${n}`);
  }
  console.log('');
  console.log('newest games:');
  console.log(
    `  ${'idx'.padEnd(8)}${'type'.padEnd(6)}${'status'.padEnd(16)}${'l2Block'.padEnd(14)}proxy`,
  );
  for (const g of records.slice(0, 10)) {
    console.log(
      `  ${String(g.index).padEnd(8)}${String(g.gameType).padEnd(6)}` +
        `${g.statusLabel.padEnd(16)}${String(g.l2BlockNumber ?? '?').padEnd(14)}${g.proxy ?? '?'}`,
    );
  }
  console.log('');

  if (anomalies.length === 0) {
    console.log('anomalies: none in scanned window.');
  } else {
    console.log(`anomalies (${anomalies.length}):`);
    for (const a of anomalies) {
      const tag = a.level.toUpperCase();
      console.log(`  [${tag}] (${a.code}) ${a.message}`);
    }
  }
  console.log(line);
}

export async function main(env = process.env) {
  const config = loadConfig(env);
  const factoryAddress = resolveDisputeGameFactory(config);

  const { createPublicClient, http, getContract } = await import('viem');
  const client = createPublicClient({ transport: http(config.l1RpcUrl) });

  const factory = getContract({
    address: factoryAddress,
    abi: DISPUTE_GAME_FACTORY_ABI,
    client,
  });
  const gameCount = await factory.read.gameCount();

  const records = await fetchGames({
    client,
    factoryAddress,
    count: gameCount,
    scan: config.gamesToScan,
  });

  const summary = summarize(records);
  const anomalies = detectAnomalies(records, {
    respectedGameType: config.respectedGameType,
    now: Math.floor(Date.now() / 1000),
    maxClockDurationSeconds: config.maxClockDurationSeconds,
    proposalIntervalSeconds: config.proposalIntervalSeconds,
  });

  printReport({ factoryAddress, gameCount, records, summary, anomalies, config });

  return { records, summary, anomalies, critical: hasCriticalAlarm(anomalies) };
}

// Only auto-run when executed directly, not when imported (so the pure helpers
// can be unit-tested in isolation without viem installed).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().then(
    (result) => {
      if (result.critical) {
        console.error(
          'RESULT: CRITICAL — a respected-game-type game resolved CHALLENGER_WINS. ' +
            'A proposed output root was proven INVALID. Escalate now.',
        );
        process.exit(2);
      }
      console.log('RESULT: OK — no critical alarm in scanned window.');
      process.exit(0);
    },
    (err) => {
      console.error('RESULT: ERROR');
      console.error(err?.stack || err?.message || err);
      process.exit(1);
    },
  );
}
