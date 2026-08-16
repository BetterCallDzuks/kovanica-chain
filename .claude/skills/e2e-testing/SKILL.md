---
name: e2e-testing
description: Run or extend the op-e2e full-stack test suite (deposit/execute/withdraw round trips, sequencer failover, batch submission) for kovanica-chain. Trigger on "run e2e tests", "add an e2e test for", or "test the full deposit/withdraw flow".
---

# E2E Testing (op-e2e)

Full-stack tests that spin up real node instances rather than mocking
the Engine API or L1 — the only way to prove op-node, op-geth, the
batcher/proposer, and the contracts actually agree with each other.

## Steps

1. Locate the e2e test package (conventionally `op-e2e/` following
   upstream OP Stack layout) and confirm the test harness this repo uses
   to spin up ephemeral L1+L2 instances for a test run.
2. For a new test, identify which category it belongs to:
   - **Round-trip tests**: deposit → L2 execution → withdrawal → proof →
     finalization.
   - **Failure-mode tests**: sequencer downtime/failover, forced
     inclusion via L1 when the sequencer censors a tx, L1 reorg handling.
   - **Batch/DA tests**: batch submission under both calldata and blob
     modes if this chain supports both, channel/compression edge cases.
3. Write the test against real spun-up services, asserting on actual
   observable state (L2 balance, L1 event logs, proof/finalization
   success) rather than internal mock state.
4. Run the suite:
   ```
   go test ./op-e2e/... -run <TestName> -v
   ```
5. For anything touching derivation, batching, or contract interfaces
   that node code depends on, also run the full Kurtosis devnet sanity
   check (`devnet-setup` skill) — op-e2e's ephemeral harness and the
   Kurtosis devnet can diverge in config, so both give real signal.
6. Report pass/fail per test category and any flake observed (rollup
   e2e tests are timing-sensitive — a flaky test is worth investigating,
   not just re-running until green).
