---
name: devnet-setup
description: Stand up the local Kurtosis devnet (full L1+L2+node stack) for kovanica-chain and run a deposit/withdraw sanity check. Trigger on "spin up the devnet", "start local chain", "run kurtosis", or "test full stack locally".
---

# Devnet Setup

## Steps

1. Confirm Kurtosis is installed: `kurtosis version`. If missing, stop
   and tell the user to install it rather than attempting a silent
   install (https://docs.kurtosis.com/install).
2. Run the devnet package:
   ```
   kurtosis run --enclave kovanica-devnet github.com/ethereum-optimism/optimism-package
   ```
   (substitute this repo's pinned/customized devnet entrypoint if one
   exists — check for a `kurtosis.yml` or `devnet/` config first).
3. Confirm service health:
   ```
   kurtosis enclave inspect kovanica-devnet
   ```
   All services (L1 execution/consensus, op-geth, op-node, op-batcher,
   op-proposer, and op-challenger if fault proofs are enabled) should be
   RUNNING before proceeding.
4. Run a sanity check:
   - Submit a deposit via `OptimismPortal` on L1, confirm the
     corresponding balance/state change lands on L2.
   - Submit an L2 transaction, confirm op-batcher submits a batch to L1
     (check the batch inbox address for new calldata/blob transactions).
   - Initiate a withdrawal, confirm it can be proven once the output
     root/dispute-game result is available, and finalized after the
     (devnet-shortened) challenge period elapses.
5. Report service health and sanity-check results. If anything fails,
   hand off to `rollup-node-engineer` or `bridge-contracts-engineer`
   depending on where the failure occurred (node stack vs contracts).
6. Tear down when done: `kurtosis enclave rm kovanica-devnet` (add `-f`
   only after confirming no state needs preserving).

For generating genesis/rollup config from a specific deployment rather
than the default devnet package, use the `genesis-config` skill instead.
