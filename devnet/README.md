# kovanica-chain devnet

Local Kurtosis devnet for **kovanica-chain**, an OP Stack rollup, with
**permissionless fault proofs** enabled. This is **Stage 1** — the local
devnet — per the bootstrapping procedure in
[`../docs/bootstrapping-fault-proof-op-stack-2026.md`](../docs/bootstrapping-fault-proof-op-stack-2026.md).

> **Network stage: local devnet only.** Every timer here is shortened and the
> dev accounts are pre-funded. Nothing in this directory is safe for a public
> testnet or mainnet — those stages restore production timers and SAFE-based
> ownership (see the procedure doc, Stage 2).

## Prerequisites

- [Kurtosis CLI](https://docs.kurtosis.com/install) — `kurtosis version` must work
- Docker running locally

The optimism-package uses `op-deployer` internally to deploy the L1 contracts
and derive genesis/rollup config, so you do **not** need a separate deploy step
for the devnet.

## Bring it up

```bash
make devnet-up          # or: scripts/devnet-up.sh
```

which runs:

```bash
kurtosis run github.com/ethpandaops/optimism-package \
  --args-file ./devnet/network_params.yaml \
  --enclave kovanica-devnet
```

First bring-up takes roughly ~5 minutes while contracts deploy.

## Confirm health

```bash
make devnet-inspect     # kurtosis enclave inspect kovanica-devnet
```

These services should report healthy:

- L1: execution (geth/reth) + consensus client
- L2 per node: `op-el-1-*` (op-geth), `op-cl-1-*` (op-node), `op-batcher`,
  `op-proposer-*`
- `op-challenger-kovanica-challenger` — auto-started from the `challengers:`
  block

Follow the challenger:

```bash
kurtosis service logs kovanica-devnet op-challenger-kovanica-challenger -f
```

Download deployment artifacts (state.json, addresses, genesis/rollup):

```bash
kurtosis files download kovanica-devnet op-deployer-configs ./devnet/out
```

## Stage 1b — the absolute prestate (do this before trusting the challenger)

The single most version-sensitive item in a fault-proof chain is the **Cannon
absolute prestate**. `faultGameAbsolutePrestate` in `network_params.yaml` is a
**placeholder**. Games bisect down to a single MIPS instruction starting from
this prestate; if the on-chain value does not match the prestate file the
op-challenger holds, the challenger refuses to play and **withdrawals never
finalize** (finalize reverts with *"OptimismPortal: output proposal has not
been validated"*).

Because the prestate encodes kovanica's own chain config, a custom chain must
build its own:

1. Bring the devnet up once and download genesis/rollup (`make devnet-inspect`
   + `kurtosis files download` above).
2. Place kovanica's genesis/rollup config in
   `op-program/chainconfig/configs`, check out the matching `op-program/vX.Y.Z`
   tag, and run the prestate generation (see the "Generating absolute prestate"
   tutorial referenced in the procedure doc).
3. Take the printed **Cannon64** hash (64-bit MT-Cannon, post–Upgrade 14 —
   *not* the single-threaded `prestate.bin.gz`):

   ```
   Cannon64  Absolute prestate hash: 0x03eb0710...b72e4fc8
   ```

4. Put that hash in `faultGameAbsolutePrestate`, drop the matching
   `<HASH>.json` / `<HASH>.bin.gz` into `static_files/prestates/`, and re-run
   the devnet.
5. Confirm the challenger logs show it responding to games (no missing/refused
   prestate).

## Sanity check: deposit → withdraw → prove → finalize

The package pre-funds the standard `test test test … junk` dev mnemonic on L2.

- **Deposit:** `cast send <L1StandardBridge|OptimismPortal> --value <amt> …`;
  funds appear on L2 after derivation.
- **Withdraw (modern fault-proof path — do NOT use the legacy L2OutputOracle
  `l2OutputIndex` path):** prove against a dispute-game root claim via the
  `DisputeGameFactory`. viem's op-stack actions implement this end to end:
  `initiateWithdrawal` → `waitToProve` → `getGame`/`getWithdrawals` →
  `buildProveWithdrawal` → `proveWithdrawal` → wait for game resolution +
  `proofMaturityDelaySeconds` + `disputeGameFinalityDelaySeconds` →
  `finalizeWithdrawal`.
- The op-challenger auto-resolves games once clocks expire (`resolveClaim` on
  subgames, then `resolve` on the root); after the finality delay the
  withdrawal can be finalized.

Get the factory address from deployment state:

```bash
DISPUTE_GAME_FACTORY=$(jq -r .DisputeGameFactoryProxy ./devnet/out/state.json)
```

**Stage 1 threshold to proceed:** a deposit and a full prove → finalize
withdrawal both succeed in minutes.

## Tear down

```bash
make devnet-down        # kurtosis enclave rm -f kovanica-devnet
```
