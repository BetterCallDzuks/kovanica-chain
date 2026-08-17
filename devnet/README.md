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
build its own. Two helper scripts automate this (see `../scripts/`):

**1. Get kovanica's genesis + rollup** from a devnet run:

```bash
make devnet-up && make devnet-inspect   # writes devnet/out/genesis.json + rollup.json
```

**2. Build the Cannon64 prestate** (reproducible, containerized — needs Docker).
Pin `MONOREPO_REF` to the `op-program`/monorepo tag that matches the contracts
tag (`op-contracts/v4.0.0`) — the script refuses to guess:

```bash
MONOREPO_REF=op-program/vX.Y.Z make gen-prestate
# equivalently: MONOREPO_REF=... scripts/gen-prestate.sh
```

The script checks out the monorepo at that ref, stages your configs as
`op-program/chainconfig/configs/2900-genesis-l2.json` and `2900-rollup.json`,
runs `make reproducible-prestate`, copies the artifacts
(`prestate-mt64.bin.gz` + proof json) into `static_files/prestates/`, and prints:

```
Cannon64 absolute prestate hash: 0x03eb0710...b72e4fc8
```

Use the **Cannon64** (64-bit MT-Cannon, post–Upgrade 14) hash — *not* the
single-threaded `prestate.bin.gz`.

**3. Wire the hash in** (updates both `network_params.yaml` and the contracts
`deploy-config/devnet.json` so they never drift):

```bash
make set-prestate HASH=0x03eb0710...b72e4fc8
python3 ../scripts/validate_network_params.py   # confirm
```

**4. Re-run the devnet** so contracts redeploy against the new prestate, then
confirm the challenger logs show it responding to games (no missing/refused
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
