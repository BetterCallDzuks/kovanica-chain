---
description: Deploy or upgrade L1 contracts for a target network
argument-hint: <network>
---

Run the `contract-deployment-l1` skill targeting network `$ARGUMENTS`.
Confirm pre-flight (security audit sign-off, multisig/timelock ownership)
before broadcasting. Dry-run against a fork first, then execute, verify,
and generate genesis/rollup config. Escalate to the `deploy-ops` subagent
for coordinated testnet/mainnet rollouts.
