#!/usr/bin/env node
// kovanica-chain — Stage 1 devnet acceptance test
//
// Performs the Stage-1 "done criterion" from devnet/README.md end to end:
//   1. deposit ETH L1 -> L2 via OptimismPortal, confirm it lands on L2
//      after derivation.
//   2. initiate an L2 -> L1 withdrawal, prove it against a DisputeGameFactory
//      dispute game (the permissionless fault-proof path — NOT the legacy
//      L2OutputOracle `l2OutputIndex` path), wait for game resolution +
//      proofMaturityDelaySeconds + disputeGameFinalityDelaySeconds, and
//      finalize it.
//
// This script is correct-by-construction: it has not been run against a
// live devnet in this environment (no kurtosis/forge available here). It
// hardcodes NO contract addresses and NO private keys — everything is read
// from env vars and from the op-deployer deployment state
// (devnet/out/state.json, produced by `make devnet-inspect`).
//
// See README.md in this directory for prerequisites and run instructions.

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  parseEther,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import {
  chainConfig,
  getWithdrawals,
  publicActionsL1,
  publicActionsL2,
  walletActionsL1,
  walletActionsL2,
} from 'viem/op-stack';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// test/e2e/withdrawal-roundtrip/ -> repo root is three levels up.
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// The standard "test test test ... junk" mnemonic. This is a PUBLIC, widely
// known, non-secret fixture (used by Anvil/Hardhat/Foundry and pre-funded by
// this repo's devnet — see devnet/README.md: "The package pre-funds the
// standard `test test test … junk` dev mnemonic on L2."). It is not a real
// credential and holds no value outside ephemeral local devnets. It is only
// used as a *default* here — set TEST_MNEMONIC or TEST_PRIVATE_KEY to
// override for any non-devnet environment.
const DEFAULT_DEV_MNEMONIC =
  'test test test test test test test test test test test junk';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function now() {
  return new Date().toISOString();
}

function log(stage, msg) {
  console.log(`[${now()}] [${stage}] ${msg}`);
}

// JSON.stringify replacer that renders bigint fields (viem withdrawal
// structs, wei amounts, etc.) as strings instead of throwing.
function jsonBigint(value) {
  return JSON.stringify(
    value,
    (_key, v) => (typeof v === 'bigint' ? `${v.toString()}n` : v),
    2,
  );
}

function envStr(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`env ${name}=${v} is not a valid number`);
  }
  return n;
}

function assertAddress(value, label) {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(
      `${label} is not a valid address (got: ${JSON.stringify(value)})`,
    );
  }
  return value;
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timed out after ${ms}ms waiting for: ${label}. ` +
              `This usually means a devnet service (op-proposer/op-challenger) ` +
              `is unhealthy, or the configured timers in devnet/network_params.yaml ` +
              `are longer than the timeout you configured — see README.md for the ` +
              `relevant *_TIMEOUT_MS env vars.`,
          ),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadConfig() {
  const L1_RPC_URL = process.env.L1_RPC_URL;
  const L2_RPC_URL = process.env.L2_RPC_URL;
  if (!L1_RPC_URL) throw new Error('env L1_RPC_URL is required');
  if (!L2_RPC_URL) throw new Error('env L2_RPC_URL is required');

  const rawStatePath = envStr(
    'DEPLOYMENT_STATE_PATH',
    join(REPO_ROOT, 'devnet', 'out', 'state.json'),
  );
  const deploymentStatePath = isAbsolute(rawStatePath)
    ? rawStatePath
    : resolve(process.cwd(), rawStatePath);

  return {
    l1RpcUrl: L1_RPC_URL,
    l2RpcUrl: L2_RPC_URL,
    deploymentStatePath,

    depositAmountEth: envStr('DEPOSIT_AMOUNT_ETH', '0.02'),
    withdrawAmountEth: envStr('WITHDRAW_AMOUNT_ETH', '0.01'),

    depositL2Gas: BigInt(envStr('DEPOSIT_L2_GAS', '100000')),
    withdrawL1Gas: BigInt(envStr('WITHDRAW_L1_GAS', '100000')),

    depositPollTimeoutMs: envInt('DEPOSIT_POLL_TIMEOUT_MS', 20 * 60_000),
    depositPollIntervalMs: envInt('DEPOSIT_POLL_INTERVAL_MS', 3_000),

    proveWaitTimeoutMs: envInt('PROVE_WAIT_TIMEOUT_MS', 30 * 60_000),

    finalizePollIntervalMs: envInt('FINALIZE_POLL_INTERVAL_MS', 15_000),
    finalizeTimeoutBufferMs: envInt(
      'FINALIZE_TIMEOUT_BUFFER_MS',
      15 * 60_000,
    ),
    finalizeTimeoutFallbackMs: envInt(
      'FINALIZE_TIMEOUT_FALLBACK_MS',
      2 * 60 * 60_000,
    ),

    // Optional overrides — bypass devnet/out/state.json for a given address.
    optimismPortalOverride: process.env.OPTIMISM_PORTAL_ADDRESS,
    disputeGameFactoryOverride: process.env.DISPUTE_GAME_FACTORY_ADDRESS,
    l1StandardBridgeOverride: process.env.L1_STANDARD_BRIDGE_ADDRESS,
  };
}

// ---------------------------------------------------------------------------
// Deployment state (devnet/out/state.json, from `make devnet-inspect`)
// ---------------------------------------------------------------------------

function loadDeploymentState(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw new Error(
        `Deployment state file not found: ${path}\n` +
          `Run 'make devnet-up && make devnet-inspect' first (see devnet/README.md) ` +
          `to bring up the devnet and download the op-deployer artifacts, or set ` +
          `DEPLOYMENT_STATE_PATH to point at an existing state.json.`,
      );
    }
    throw new Error(`Failed to read deployment state at ${path}: ${err.message}`);
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Deployment state at ${path} is not valid JSON: ${err.message}`);
  }
  return state;
}

// Resolves a contract address, in priority order:
//   1. explicit env override
//   2. flat top-level key on state.json (documented in devnet/README.md,
//      e.g. `jq -r .DisputeGameFactoryProxy ./devnet/out/state.json`)
//   3. nested op-deployer `opChainDeployments[]` schema, as a fallback in
//      case the artifact downloaded by `make devnet-inspect` nests
//      per-chain addresses instead of exposing them flat.
function resolveAddress({ state, statePath, label, envOverride, flatKeys, nestedKeys }) {
  if (envOverride) {
    return assertAddress(envOverride, `${label} (from env override)`);
  }

  for (const key of flatKeys) {
    const v = state?.[key];
    if (typeof v === 'string' && v) {
      return assertAddress(v, `${label} (state.${key})`);
    }
  }

  const chainDeployments = Array.isArray(state?.opChainDeployments)
    ? state.opChainDeployments
    : [];
  for (const deployment of chainDeployments) {
    for (const key of nestedKeys) {
      const v = deployment?.[key];
      if (typeof v === 'string' && v) {
        return assertAddress(
          v,
          `${label} (state.opChainDeployments[].${key})`,
        );
      }
    }
  }

  throw new Error(
    `Could not resolve ${label} from deployment state.\n` +
      `  file:                 ${statePath}\n` +
      `  looked for flat keys: ${flatKeys.join(', ')}\n` +
      `  looked for nested keys (under state.opChainDeployments[]): ${nestedKeys.join(', ')}\n` +
      `  top-level keys present in file: ${Object.keys(state ?? {}).join(', ') || '(none)'}\n` +
      `Confirm 'make devnet-up && make devnet-inspect' completed successfully and that L1 ` +
      `contracts finished deploying (first bring-up takes ~5 minutes per devnet/README.md), ` +
      `or set the matching *_ADDRESS env override.`,
  );
}

function resolveDeploymentAddresses(config) {
  const state = loadDeploymentState(config.deploymentStatePath);

  const optimismPortalAddress = resolveAddress({
    state,
    statePath: config.deploymentStatePath,
    label: 'OptimismPortalProxy',
    envOverride: config.optimismPortalOverride,
    flatKeys: ['OptimismPortalProxy'],
    nestedKeys: ['optimismPortalProxyAddress', 'OptimismPortalProxyAddress'],
  });

  const disputeGameFactoryAddress = resolveAddress({
    state,
    statePath: config.deploymentStatePath,
    label: 'DisputeGameFactoryProxy',
    envOverride: config.disputeGameFactoryOverride,
    flatKeys: ['DisputeGameFactoryProxy'],
    nestedKeys: [
      'disputeGameFactoryProxyAddress',
      'DisputeGameFactoryProxyAddress',
    ],
  });

  const l1StandardBridgeAddress = resolveAddress({
    state,
    statePath: config.deploymentStatePath,
    label: 'L1StandardBridgeProxy',
    envOverride: config.l1StandardBridgeOverride,
    flatKeys: ['L1StandardBridgeProxy'],
    nestedKeys: [
      'l1StandardBridgeProxyAddress',
      'L1StandardBridgeProxyAddress',
    ],
  });

  return { optimismPortalAddress, disputeGameFactoryAddress, l1StandardBridgeAddress };
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

function loadAccount() {
  const pk = process.env.TEST_PRIVATE_KEY?.trim();
  if (pk) {
    const normalized = pk.startsWith('0x') ? pk : `0x${pk}`;
    return privateKeyToAccount(normalized);
  }
  const mnemonic = envStr('TEST_MNEMONIC', DEFAULT_DEV_MNEMONIC).trim();
  const addressIndex = envInt('TEST_ACCOUNT_INDEX', 0);
  return mnemonicToAccount(mnemonic, { addressIndex });
}

// ---------------------------------------------------------------------------
// Chains / clients
// ---------------------------------------------------------------------------

async function getChainIdViaRpc(rpcUrl) {
  const bare = createPublicClient({ transport: http(rpcUrl) });
  return bare.getChainId();
}

async function buildChains({ l1RpcUrl, l2RpcUrl }, addresses) {
  const [l1ChainId, l2ChainId] = await Promise.all([
    getChainIdViaRpc(l1RpcUrl),
    getChainIdViaRpc(l2RpcUrl),
  ]);

  const l1Chain = defineChain({
    id: l1ChainId,
    name: 'kovanica-devnet-l1',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [l1RpcUrl] } },
  });

  // Mirrors how viem's own chain definitions (e.g. viem/chains `optimism`)
  // wire up an OP Stack L2 chain: op-stack predeploy contracts come from
  // `chainConfig.contracts`, and the L1-side contracts (portal, dispute
  // game factory, L1 standard bridge) are keyed by the L1 chain id
  // (`sourceId`) and populated from the resolved deployment addresses —
  // never hardcoded.
  const l2Chain = defineChain({
    ...chainConfig,
    id: l2ChainId,
    name: 'kovanica-devnet-l2',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [l2RpcUrl] } },
    contracts: {
      ...chainConfig.contracts,
      portal: {
        [l1ChainId]: { address: addresses.optimismPortalAddress },
      },
      disputeGameFactory: {
        [l1ChainId]: { address: addresses.disputeGameFactoryAddress },
      },
      l1StandardBridge: {
        [l1ChainId]: { address: addresses.l1StandardBridgeAddress },
      },
    },
    sourceId: l1ChainId,
  });

  return { l1Chain, l2Chain, l1ChainId, l2ChainId };
}

function buildClients({ l1Chain, l2Chain, l1RpcUrl, l2RpcUrl, account }) {
  const publicClientL1 = createPublicClient({
    chain: l1Chain,
    transport: http(l1RpcUrl),
  }).extend(publicActionsL1());

  const walletClientL1 = createWalletClient({
    account,
    chain: l1Chain,
    transport: http(l1RpcUrl),
  }).extend(walletActionsL1());

  const publicClientL2 = createPublicClient({
    chain: l2Chain,
    transport: http(l2RpcUrl),
  }).extend(publicActionsL2());

  const walletClientL2 = createWalletClient({
    account,
    chain: l2Chain,
    transport: http(l2RpcUrl),
  }).extend(walletActionsL2());

  return { publicClientL1, walletClientL1, publicClientL2, walletClientL2 };
}

// ---------------------------------------------------------------------------
// Stage 1: deposit
// ---------------------------------------------------------------------------

async function runDeposit({ config, clients, account, l2Chain, addresses }) {
  const { publicClientL2, walletClientL1 } = clients;
  const depositAmountWei = parseEther(config.depositAmountEth);

  const l2BalanceBefore = await publicClientL2.getBalance({
    address: account.address,
  });
  log(
    'deposit',
    `account ${account.address} L2 balance before: ${formatEther(l2BalanceBefore)} ETH`,
  );

  log(
    'deposit',
    `sending depositTransaction on OptimismPortal ${addresses.optimismPortalAddress} ` +
      `for ${config.depositAmountEth} ETH ...`,
  );
  const depositL1Hash = await walletClientL1.depositTransaction({
    account,
    portalAddress: addresses.optimismPortalAddress,
    targetChain: l2Chain,
    request: {
      to: account.address,
      mint: depositAmountWei,
      gas: config.depositL2Gas,
    },
  });
  log('deposit', `L1 depositTransaction hash: ${depositL1Hash}`);

  const depositL1Receipt = await clients.publicClientL1.waitForTransactionReceipt({
    hash: depositL1Hash,
  });
  if (depositL1Receipt.status !== 'success') {
    throw new Error(
      `depositTransaction reverted on L1 (tx ${depositL1Hash}, status ${depositL1Receipt.status})`,
    );
  }
  log(
    'deposit',
    `L1 deposit tx included in block ${depositL1Receipt.blockNumber}, waiting for L2 derivation ...`,
  );

  const expectedL2Balance = l2BalanceBefore + depositAmountWei;
  const deadline = Date.now() + config.depositPollTimeoutMs;
  let l2BalanceAfter = l2BalanceBefore;
  while (Date.now() < deadline) {
    l2BalanceAfter = await publicClientL2.getBalance({ address: account.address });
    if (l2BalanceAfter >= expectedL2Balance) break;
    await sleep(config.depositPollIntervalMs);
  }

  if (l2BalanceAfter < expectedL2Balance) {
    throw new Error(
      `Deposit did not land on L2 within ${config.depositPollTimeoutMs}ms. ` +
        `Expected balance >= ${formatEther(expectedL2Balance)} ETH, got ${formatEther(l2BalanceAfter)} ETH. ` +
        `Check op-node derivation (kurtosis service logs) and that op-batcher/op-node are healthy.`,
    );
  }

  log(
    'deposit',
    `PASS — L2 balance after derivation: ${formatEther(l2BalanceAfter)} ETH ` +
      `(+${formatEther(l2BalanceAfter - l2BalanceBefore)} ETH)`,
  );

  return { depositL1Hash, l2BalanceAfterDeposit: l2BalanceAfter };
}

// ---------------------------------------------------------------------------
// Stage 2: withdraw -> prove -> finalize (DisputeGameFactory path)
// ---------------------------------------------------------------------------

async function assertFaultProofPortal({ clients, l2Chain, addresses }) {
  const version = await clients.publicClientL1.getPortalVersion({
    targetChain: l2Chain,
    portalAddress: addresses.optimismPortalAddress,
  });
  log('withdraw', `OptimismPortal version: ${version.major}.${version.minor}.${version.patch}`);
  if (version.major < 3) {
    throw new Error(
      `OptimismPortal ${addresses.optimismPortalAddress} reports version ${version.major}.x, ` +
        `which is the legacy L2OutputOracle-based portal (< v3). This test requires the ` +
        `permissionless fault-proof / DisputeGameFactory path (portal v3+) per CLAUDE.md — ` +
        `refusing to fall back to the legacy l2OutputIndex path.`,
    );
  }
}

async function runWithdrawal({ config, clients, account, l2Chain, addresses }) {
  const { walletClientL2, publicClientL1, publicClientL2, walletClientL1 } = clients;

  await assertFaultProofPortal({ clients, l2Chain, addresses });

  const withdrawAmountWei = parseEther(config.withdrawAmountEth);
  const l2BalanceBeforeWithdraw = await publicClientL2.getBalance({
    address: account.address,
  });
  log(
    'withdraw',
    `initiating L2 withdrawal of ${config.withdrawAmountEth} ETH via L2ToL1MessagePasser ` +
      `(L2 balance before: ${formatEther(l2BalanceBeforeWithdraw)} ETH) ...`,
  );

  const initiateHash = await walletClientL2.initiateWithdrawal({
    account,
    request: {
      to: account.address,
      value: withdrawAmountWei,
      gas: config.withdrawL1Gas,
    },
  });
  log('withdraw', `L2 initiateWithdrawal tx hash: ${initiateHash}`);

  const withdrawReceipt = await publicClientL2.waitForTransactionReceipt({
    hash: initiateHash,
  });
  if (withdrawReceipt.status !== 'success') {
    throw new Error(
      `initiateWithdrawal reverted on L2 (tx ${initiateHash}, status ${withdrawReceipt.status})`,
    );
  }

  const [withdrawal] = getWithdrawals(withdrawReceipt);
  if (!withdrawal) {
    throw new Error(
      `L2 withdrawal receipt ${initiateHash} did not contain a MessagePassed log — ` +
        `nothing to prove.`,
    );
  }
  log('withdraw', `withdrawal message:\n${jsonBigint(withdrawal)}`);

  // --- Prove ---------------------------------------------------------------
  //
  // waitToProve polls the DisputeGameFactory (via getGame/getGames) for a
  // game created after this withdrawal's L2 block. On this devnet a new
  // game is proposed roughly every `proposal_internal` (see
  // devnet/network_params.yaml); PROVE_WAIT_TIMEOUT_MS bounds our patience.
  log(
    'withdraw',
    `waiting for a dispute game covering L2 block ${withdrawReceipt.blockNumber} ` +
      `to be created by op-proposer (timeout ${config.proveWaitTimeoutMs}ms) ...`,
  );
  const { game, output, withdrawal: provenWithdrawal } = await withTimeout(
    publicClientL1.waitToProve({
      receipt: withdrawReceipt,
      targetChain: l2Chain,
    }),
    config.proveWaitTimeoutMs,
    'dispute game creation covering this withdrawal (waitToProve)',
  );
  log(
    'withdraw',
    `found dispute game index=${game.index} l2BlockNumber=${game.l2BlockNumber} ` +
      `rootClaim=${game.rootClaim}`,
  );
  if (game.usesSuperRoots) {
    log('withdraw', 'note: dispute game uses super roots (interop-style output).');
  }

  log('withdraw', 'building withdrawal proof against L2ToL1MessagePasser storage ...');
  const proveArgs = await publicClientL2.buildProveWithdrawal({
    account: account.address,
    game,
    output,
    withdrawal: provenWithdrawal,
  });

  log('withdraw', `submitting proveWithdrawalTransaction on OptimismPortal ...`);
  const proveHash = await walletClientL1.proveWithdrawal({
    ...proveArgs,
    account,
    portalAddress: addresses.optimismPortalAddress,
    targetChain: l2Chain,
  });
  log('withdraw', `L1 proveWithdrawal tx hash: ${proveHash}`);

  const proveReceipt = await publicClientL1.waitForTransactionReceipt({
    hash: proveHash,
  });
  if (proveReceipt.status !== 'success') {
    throw new Error(
      `proveWithdrawalTransaction reverted on L1 (tx ${proveHash}, status ${proveReceipt.status})`,
    );
  }
  log('withdraw', `PASS — withdrawal proven in L1 block ${proveReceipt.blockNumber}`);

  // --- Wait for resolution + proofMaturityDelaySeconds + finality delay ---
  //
  // We poll getWithdrawalStatus (rather than the simpler waitToFinalize
  // sleep helper) because it accounts for the *full* set of conditions the
  // OptimismPortal/AnchorStateRegistry actually check before allowing
  // finalization: proofMaturityDelaySeconds since proving AND the dispute
  // game having resolved AND disputeGameFinalityDelaySeconds since
  // resolution. A naive sleep on proofMaturityDelaySeconds alone can race
  // ahead of game resolution.
  let dynamicTimeoutMs = config.finalizeTimeoutFallbackMs;
  try {
    const { seconds } = await publicClientL1.getTimeToFinalize({
      withdrawalHash: provenWithdrawal.withdrawalHash,
      targetChain: l2Chain,
      portalAddress: addresses.optimismPortalAddress,
    });
    dynamicTimeoutMs = seconds * 1000 + config.finalizeTimeoutBufferMs;
    log(
      'withdraw',
      `on-chain reported time to finalize: ${seconds}s ` +
        `(polling with ${config.finalizeTimeoutBufferMs}ms buffer, ` +
        `timeout=${dynamicTimeoutMs}ms)`,
    );
  } catch (err) {
    log(
      'withdraw',
      `could not read getTimeToFinalize (${err.message}); ` +
        `falling back to FINALIZE_TIMEOUT_FALLBACK_MS=${dynamicTimeoutMs}ms`,
    );
  }

  await withTimeout(
    (async () => {
      let lastStatus;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const status = await publicClientL1.getWithdrawalStatus({
          receipt: withdrawReceipt,
          targetChain: l2Chain,
          portalAddress: addresses.optimismPortalAddress,
        });
        if (status !== lastStatus) {
          log('withdraw', `withdrawal status: ${status}`);
          lastStatus = status;
        }
        if (status === 'ready-to-finalize' || status === 'finalized') return status;
        await sleep(config.finalizePollIntervalMs);
      }
    })(),
    dynamicTimeoutMs,
    'withdrawal reaching ready-to-finalize (game resolution + proofMaturityDelaySeconds + disputeGameFinalityDelaySeconds)',
  );

  // --- Finalize --------------------------------------------------------
  const l1BalanceBeforeFinalize = await publicClientL1.getBalance({
    address: account.address,
  });

  log('withdraw', 'submitting finalizeWithdrawalTransaction on OptimismPortal ...');
  const finalizeHash = await walletClientL1.finalizeWithdrawal({
    account,
    withdrawal: provenWithdrawal,
    targetChain: l2Chain,
    portalAddress: addresses.optimismPortalAddress,
  });
  log('withdraw', `L1 finalizeWithdrawal tx hash: ${finalizeHash}`);

  const finalizeReceipt = await publicClientL1.waitForTransactionReceipt({
    hash: finalizeHash,
  });
  if (finalizeReceipt.status !== 'success') {
    throw new Error(
      `finalizeWithdrawalTransaction reverted on L1 (tx ${finalizeHash}, status ${finalizeReceipt.status})`,
    );
  }

  const finalStatus = await publicClientL1.getWithdrawalStatus({
    receipt: withdrawReceipt,
    targetChain: l2Chain,
    portalAddress: addresses.optimismPortalAddress,
  });
  if (finalStatus !== 'finalized') {
    throw new Error(
      `finalizeWithdrawalTransaction succeeded but getWithdrawalStatus reports '${finalStatus}', expected 'finalized'.`,
    );
  }

  const l1BalanceAfterFinalize = await publicClientL1.getBalance({
    address: account.address,
  });
  const finalizeGasCost = finalizeReceipt.gasUsed * finalizeReceipt.effectiveGasPrice;
  const netReceived = l1BalanceAfterFinalize + finalizeGasCost - l1BalanceBeforeFinalize;
  log(
    'withdraw',
    `L1 balance delta from finalize tx (excl. its own gas cost): ${formatEther(netReceived)} ETH ` +
      `(expected ${config.withdrawAmountEth} ETH)`,
  );
  const tolerance = 1_000n; // wei — arithmetic should be exact; tiny buffer for safety.
  if (
    netReceived < withdrawAmountWei - tolerance ||
    netReceived > withdrawAmountWei + tolerance
  ) {
    throw new Error(
      `Finalized withdrawal did not credit the expected amount on L1. ` +
        `Expected ~${formatEther(withdrawAmountWei)} ETH, observed ${formatEther(netReceived)} ETH.`,
    );
  }

  log(
    'withdraw',
    `PASS — withdrawal finalized in L1 block ${finalizeReceipt.blockNumber}, funds released on L1.`,
  );

  return { initiateHash, proveHash, finalizeHash };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  log('setup', `deployment state: ${config.deploymentStatePath}`);

  const addresses = resolveDeploymentAddresses(config);
  log('setup', `OptimismPortalProxy:      ${addresses.optimismPortalAddress}`);
  log('setup', `DisputeGameFactoryProxy:  ${addresses.disputeGameFactoryAddress}`);
  log('setup', `L1StandardBridgeProxy:    ${addresses.l1StandardBridgeAddress}`);

  const account = loadAccount();
  log('setup', `test account: ${account.address}`);

  const { l1Chain, l2Chain, l1ChainId, l2ChainId } = await buildChains(config, addresses);
  log('setup', `L1 chain id: ${l1ChainId} (${config.l1RpcUrl})`);
  log('setup', `L2 chain id: ${l2ChainId} (${config.l2RpcUrl})`);

  const clients = buildClients({
    l1Chain,
    l2Chain,
    l1RpcUrl: config.l1RpcUrl,
    l2RpcUrl: config.l2RpcUrl,
    account,
  });

  const l1BalanceStart = await clients.publicClientL1.getBalance({
    address: account.address,
  });
  log('setup', `L1 balance: ${formatEther(l1BalanceStart)} ETH`);
  if (l1BalanceStart < parseEther(config.depositAmountEth)) {
    throw new Error(
      `Test account ${account.address} has insufficient L1 balance ` +
        `(${formatEther(l1BalanceStart)} ETH) to deposit ${config.depositAmountEth} ETH ` +
        `plus gas. Confirm this is the funded devnet dev account, or set ` +
        `TEST_PRIVATE_KEY/TEST_MNEMONIC to one that is.`,
    );
  }

  const depositResult = await runDeposit({ config, clients, account, l2Chain, addresses });
  const withdrawResult = await runWithdrawal({ config, clients, account, l2Chain, addresses });

  console.log('');
  console.log('=== SUMMARY ================================================');
  console.log(`account:                  ${account.address}`);
  console.log(`OptimismPortalProxy:      ${addresses.optimismPortalAddress}`);
  console.log(`DisputeGameFactoryProxy:  ${addresses.disputeGameFactoryAddress}`);
  console.log(`L1StandardBridgeProxy:    ${addresses.l1StandardBridgeAddress}`);
  console.log(`deposit (L1) tx:          ${depositResult.depositL1Hash}`);
  console.log(`initiateWithdrawal (L2):  ${withdrawResult.initiateHash}`);
  console.log(`proveWithdrawal (L1):     ${withdrawResult.proveHash}`);
  console.log(`finalizeWithdrawal (L1):  ${withdrawResult.finalizeHash}`);
  console.log('RESULT: PASS — deposit and prove->finalize withdrawal both succeeded.');
  console.log('=============================================================');
}

// Only auto-run when executed directly (`node roundtrip.mjs`), not when
// imported — lets the pure helpers below be unit-tested in isolation.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error('');
    console.error('RESULT: FAIL');
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}

// Exported for testing / reuse; not part of the CLI surface.
export {
  loadConfig,
  loadDeploymentState,
  resolveAddress,
  resolveDeploymentAddresses,
  loadAccount,
  main,
};
