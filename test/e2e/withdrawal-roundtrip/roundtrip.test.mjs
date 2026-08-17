// Unit tests for the pure logic of roundtrip.mjs — the address-resolution,
// config-loading, and state-parsing helpers that decide which contracts the
// acceptance test talks to. These run WITHOUT a devnet (no RPC, no deploy).
//
//   npm ci && npm run test:unit
//
// The full deposit->withdraw->prove->finalize flow (main) still needs a live
// devnet; see README.md.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { loadConfig, loadDeploymentState, resolveAddress } from './roundtrip.mjs';

// Addresses with no a-f nibbles, so viem's isAddress passes regardless of case.
const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';

// --- resolveAddress --------------------------------------------------------

test('resolveAddress: env override takes priority over state', () => {
  const got = resolveAddress({
    state: { Foo: ADDR_B }, statePath: 's', label: 'Foo',
    envOverride: ADDR_A, flatKeys: ['Foo'], nestedKeys: [],
  });
  assert.equal(got, ADDR_A);
});

test('resolveAddress: invalid override is rejected', () => {
  assert.throws(() => resolveAddress({
    state: {}, statePath: 's', label: 'Foo',
    envOverride: '0xnotanaddress', flatKeys: [], nestedKeys: [],
  }), /not a valid address/);
});

test('resolveAddress: resolves from a flat top-level key', () => {
  const got = resolveAddress({
    state: { DisputeGameFactoryProxy: ADDR_A }, statePath: 's',
    label: 'DisputeGameFactoryProxy', envOverride: undefined,
    flatKeys: ['DisputeGameFactoryProxy'], nestedKeys: [],
  });
  assert.equal(got, ADDR_A);
});

test('resolveAddress: falls back to nested opChainDeployments key', () => {
  const state = { opChainDeployments: [{ disputeGameFactoryProxyAddress: ADDR_B }] };
  const got = resolveAddress({
    state, statePath: 's', label: 'DisputeGameFactoryProxy',
    envOverride: undefined, flatKeys: ['DisputeGameFactoryProxy'],
    nestedKeys: ['disputeGameFactoryProxyAddress'],
  });
  assert.equal(got, ADDR_B);
});

test('resolveAddress: unresolved address throws a helpful error', () => {
  assert.throws(() => resolveAddress({
    state: { somethingElse: 1 }, statePath: '/x/state.json', label: 'Foo',
    envOverride: undefined, flatKeys: ['Foo'], nestedKeys: ['bar'],
  }), /Could not resolve Foo/);
});

// --- loadConfig ------------------------------------------------------------

function withEnv(patch, fn) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k];
    }
    Object.assign(process.env, saved);
  }
}

test('loadConfig: requires L1_RPC_URL', () => {
  withEnv({ L1_RPC_URL: undefined, L2_RPC_URL: 'http://l2' }, () => {
    assert.throws(() => loadConfig(), /L1_RPC_URL is required/);
  });
});

test('loadConfig: requires L2_RPC_URL', () => {
  withEnv({ L1_RPC_URL: 'http://l1', L2_RPC_URL: undefined }, () => {
    assert.throws(() => loadConfig(), /L2_RPC_URL is required/);
  });
});

test('loadConfig: captures RPCs, overrides, and defaults', () => {
  withEnv({
    L1_RPC_URL: 'http://l1', L2_RPC_URL: 'http://l2',
    OPTIMISM_PORTAL_ADDRESS: ADDR_A, DEPOSIT_AMOUNT_ETH: undefined,
  }, () => {
    const c = loadConfig();
    assert.equal(c.l1RpcUrl, 'http://l1');
    assert.equal(c.l2RpcUrl, 'http://l2');
    assert.equal(c.optimismPortalOverride, ADDR_A);
    assert.equal(c.depositAmountEth, '0.02'); // default preserved
  });
});

// --- loadDeploymentState ---------------------------------------------------

test('loadDeploymentState: missing file throws a devnet-setup hint', () => {
  assert.throws(() => loadDeploymentState('/nonexistent/state.json'),
    /Deployment state file not found/);
});

test('loadDeploymentState: parses a valid state.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kovanica-state-'));
  try {
    const p = join(dir, 'state.json');
    writeFileSync(p, JSON.stringify({ OptimismPortalProxy: ADDR_A }));
    assert.equal(loadDeploymentState(p).OptimismPortalProxy, ADDR_A);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadDeploymentState: invalid JSON is reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kovanica-state-'));
  try {
    const p = join(dir, 'state.json');
    writeFileSync(p, '{ not json');
    assert.throws(() => loadDeploymentState(p), /not valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
