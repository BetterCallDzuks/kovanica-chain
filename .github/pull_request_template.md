<!-- Populate every section. Delete a line only if it truly doesn't apply. -->

## Summary

<!-- What this PR does and why, in a sentence or two. -->

## Network stage

<!-- Which stage does this target? local devnet / Sepolia testnet / mainnet.
     State it explicitly (CLAUDE.md §0). -->

## Changes

-

## Consensus / bridge / fault-proof impact

<!-- Rollup bugs are bridge-of-funds or chain-halt bugs. Check all that apply. -->

- [ ] Touches `OptimismPortal` / bridge / predeploy contracts
- [ ] Touches op-node derivation, batching, or output-proposal logic
- [ ] Touches the fault-proof game / Cannon prestate
- [ ] Touches genesis / rollup / deploy-config
- [ ] None of the above (tooling / docs / tests only)

If any of the first four are checked, a `chain-security-auditor` pass is required
before a real-value deployment (CLAUDE.md §3).

## Validation

- [ ] `make check` passes locally
- [ ] CI green
- [ ] Foundry tests pass (if contracts touched)
- [ ] Devnet round-trip run (if derivation / batching / contract-interface changed)

## Docs

- [ ] Updated relevant README / runbook / audit notes (or N/A)
