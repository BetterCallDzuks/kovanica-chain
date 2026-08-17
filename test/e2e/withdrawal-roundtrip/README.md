# withdrawal-roundtrip

Stage-1 devnet acceptance test for **kovanica-chain**. Performs the exact
"done criterion" documented in [`../../../devnet/README.md`](../../../devnet/README.md):

> a deposit and a full prove → finalize withdrawal both succeed.

This is a real end-to-end test against a running Kurtosis devnet — it
submits real transactions via [viem](https://viem.sh) and its
[`viem/op-stack`](https://viem.sh/op-stack) actions, and polls real on-chain
state. It does **not** mock anything.

It uses the **permissionless fault-proof / `DisputeGameFactory` path**
(`getGame`/`getWithdrawals`/`buildProveWithdrawal`/`proveWithdrawal`, then
`getWithdrawalStatus`/`getTimeToFinalize`/`finalizeWithdrawal`), per
kovanica-chain's `network_params.yaml` (`game_type: 0`,
`DisputeGameFactoryProxy`). It deliberately refuses to run against a portal
older than v3 (the legacy `L2OutputOracle`/`l2OutputIndex` path) — see
`assertFaultProofPortal()` in `roundtrip.mjs`.

## Prerequisites

1. Bring up the devnet and download the op-deployer deployment state
   (contract addresses, genesis, rollup config) from the repo root:

   ```bash
   make devnet-up
   make devnet-inspect     # writes devnet/out/state.json (+ genesis/rollup)
   ```

   Confirm all services report healthy (see `devnet/README.md`) before
   running this test — L1, `op-el-*`/`op-cl-*`, `op-batcher`,
   `op-proposer-*`, and `op-challenger-kovanica-challenger`.

2. **Stage 1b must be done** (the Cannon absolute prestate wired into
   `network_params.yaml` / `deploy-config/devnet.json`) — otherwise
   `op-challenger` refuses to play games and this test's finalize step will
   time out. See `devnet/README.md` → "Stage 1b".

3. Node.js v22+.

4. Install dependencies:

   ```bash
   cd test/e2e/withdrawal-roundtrip
   npm install
   ```

## Required environment variables

| Var | Required | Description |
|---|---|---|
| `L1_RPC_URL` | yes | L1 execution client RPC (from `kurtosis enclave inspect kovanica-devnet` — the L1 execution service's RPC port). |
| `L2_RPC_URL` | yes | L2 execution client (`op-geth`) RPC. |

Everything else has a devnet-appropriate default; see the tables below.
**No contract address or private key is hardcoded anywhere in this test** —
addresses are read from `devnet/out/state.json`, and the test key is derived
from a mnemonic/private key supplied via env (defaulting to the standard,
publicly known, non-secret `test test test … junk` devnet fixture mnemonic
that kovanica's devnet pre-funds — see `devnet/README.md`).

### Deployment state

| Var | Default | Description |
|---|---|---|
| `DEPLOYMENT_STATE_PATH` | `<repo root>/devnet/out/state.json` | Produced by `make devnet-inspect`. Must expose (flat top-level keys, or the nested op-deployer `opChainDeployments[]` schema as a fallback) `OptimismPortalProxy`, `DisputeGameFactoryProxy`, `L1StandardBridgeProxy`. The script **fails with a clear message** listing exactly what it looked for and what it found if any are missing. |
| `OPTIMISM_PORTAL_ADDRESS` | (from state.json) | Optional override, bypasses state.json for this one address. |
| `DISPUTE_GAME_FACTORY_ADDRESS` | (from state.json) | Optional override. |
| `L1_STANDARD_BRIDGE_ADDRESS` | (from state.json) | Optional override. |

### Test account

| Var | Default | Description |
|---|---|---|
| `TEST_PRIVATE_KEY` | (unset) | If set, used directly (takes precedence over the mnemonic). |
| `TEST_MNEMONIC` | `test test test test test test test test test test test junk` | Standard devnet dev mnemonic, pre-funded by kovanica's Kurtosis devnet on L2 (and funded on the devnet L1 by `ethereum_package`). Not a secret — do not reuse for testnet/mainnet. |
| `TEST_ACCOUNT_INDEX` | `0` | HD derivation index (`m/44'/60'/0'/0/<index>`) when using the mnemonic. |

### Amounts / gas

| Var | Default |
|---|---|
| `DEPOSIT_AMOUNT_ETH` | `0.02` |
| `WITHDRAW_AMOUNT_ETH` | `0.01` |
| `DEPOSIT_L2_GAS` | `100000` |
| `WITHDRAW_L1_GAS` | `100000` |

### Timeouts / polling

Devnet timers are intentionally shortened (`devnet/network_params.yaml` →
`op_contract_deployer_params.global_deploy_overrides`:
`faultGameWithdrawalDelay`, `disputeGameFinalityDelaySeconds`,
`proofMaturityDelaySeconds`, `faultGameMaxClockDuration`) — **but as
currently configured in this repo those are each set to 3600s (1 hour) and
1200s**, not the "minutes" the devnet README's Stage-1 threshold implies.
Worst case, a full round trip (game proposal interval + game clock +
`max(proofMaturityDelaySeconds, disputeGameFinalityDelaySeconds after
resolution)`) can take on the order of an hour on this specific
configuration. If you've tightened those timers further, lower the
timeouts below to fail fast instead of waiting on defaults sized for the
current values; if not, budget for it (or reduce
`devnet/network_params.yaml`'s overrides and redeploy — outside this
directory's scope).

| Var | Default | Bounds |
|---|---|---|
| `DEPOSIT_POLL_TIMEOUT_MS` | `1200000` (20m) | Waiting for the L2 balance to reflect the deposit after derivation. |
| `DEPOSIT_POLL_INTERVAL_MS` | `3000` | Poll interval for the above. |
| `PROVE_WAIT_TIMEOUT_MS` | `1800000` (30m) | Waiting for a dispute game covering the withdrawal's L2 block to be created (`waitToProve`). |
| `FINALIZE_POLL_INTERVAL_MS` | `15000` | Poll interval while waiting for `getWithdrawalStatus` to report `ready-to-finalize`. |
| `FINALIZE_TIMEOUT_BUFFER_MS` | `900000` (15m) | Added on top of the on-chain-reported `getTimeToFinalize` seconds. |
| `FINALIZE_TIMEOUT_FALLBACK_MS` | `7200000` (2h) | Used only if `getTimeToFinalize` can't be read. |

## Run

```bash
cd test/e2e/withdrawal-roundtrip
export L1_RPC_URL=http://127.0.0.1:<l1-rpc-port>
export L2_RPC_URL=http://127.0.0.1:<l2-rpc-port>
node roundtrip.mjs
```

(Get the RPC ports from `kurtosis enclave inspect kovanica-devnet` /
`make devnet-inspect` output.)

## What it does, stage by stage

1. **Setup** — loads config, resolves `OptimismPortalProxy` /
   `DisputeGameFactoryProxy` / `L1StandardBridgeProxy` from
   `devnet/out/state.json`, derives the test account, discovers L1/L2 chain
   IDs from the RPCs themselves (`eth_chainId` — never hardcoded), and
   builds a viem OP Stack L2 chain object wiring those addresses under the
   L1 chain ID, mirroring how `viem/chains`' `optimism` is defined.
2. **Deposit** — records the L2 balance, calls
   `OptimismPortal.depositTransaction` (via `walletClientL1.depositTransaction`)
   to mint `DEPOSIT_AMOUNT_ETH` on L2 for the test account, waits for the L1
   tx to land, then polls the L2 balance until it reflects the deposit
   (derivation). Fails loudly (with remediation hints) if it doesn't land
   within `DEPOSIT_POLL_TIMEOUT_MS`.
3. **Withdraw → prove → finalize** —
   - Asserts the portal is fault-proof-enabled (v3+); refuses to fall back
     to the legacy `L2OutputOracle` path.
   - `initiateWithdrawal` on L2 (`L2ToL1MessagePasser`), waits for the
     receipt, extracts the withdrawal message via `getWithdrawals`.
   - `waitToProve` (polls the `DisputeGameFactory` for a game covering this
     withdrawal's L2 block), `buildProveWithdrawal` (L2 storage proof
     against `L2ToL1MessagePasser`), `proveWithdrawal` on L1.
   - Polls `getWithdrawalStatus` (not a blind sleep) until it reports
     `ready-to-finalize` — this correctly accounts for game resolution,
     `proofMaturityDelaySeconds` since proving, and
     `disputeGameFinalityDelaySeconds` since resolution together, which a
     naive `proofMaturityDelaySeconds`-only sleep would not.
   - `finalizeWithdrawal` on L1, confirms `getWithdrawalStatus` reports
     `finalized`, and cross-checks that the L1 balance increase (net of the
     finalize tx's own gas cost) matches `WITHDRAW_AMOUNT_ETH`.
4. Logs every stage with a timestamp, and prints a summary of the addresses
   and tx hashes used at the end.

## Pass criterion

Exit code `0` and a final line:

```
RESULT: PASS — deposit and prove->finalize withdrawal both succeeded.
```

Any failure (RPC error, timeout, reverted tx, balance mismatch, or a
detected legacy/pre-fault-proof portal) prints `RESULT: FAIL` with the
error and exits non-zero.

## Notes for reviewers

- This script has **not been executed against a live devnet in the
  environment it was written in** (no `kurtosis`/`forge` available there).
  It was validated by: (a) reading the installed `viem@2.55.17`
  `op-stack` action source directly to confirm parameter shapes
  (`buildProveWithdrawal`, `proveWithdrawal`, `waitToProve`,
  `getWithdrawalStatus`, `getTimeToFinalize`, `finalizeWithdrawal`,
  `initiateWithdrawal`, `depositTransaction`, `getWithdrawals`), and (b)
  standalone smoke tests (not checked in) exercising the pure
  config/address-resolution/account-derivation logic against fixture
  `state.json` files and a mock JSON-RPC server for chain-ID discovery.
  Run it end to end against the real devnet before relying on it as a CI
  gate.
- Addresses come **only** from `devnet/out/state.json` (or explicit env
  overrides) — never hardcoded. The test account comes **only** from env
  (`TEST_PRIVATE_KEY`/`TEST_MNEMONIC`), defaulting to the well-known public
  devnet fixture mnemonic this repo's own `devnet/README.md` documents as
  pre-funded.
- `devnet/out/` is git-ignored (see root `.gitignore`); this test reads it
  at runtime and never commits it.
