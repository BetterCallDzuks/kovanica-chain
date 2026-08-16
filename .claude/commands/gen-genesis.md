---
description: Generate genesis.json and rollup.json from a finalized L1 deployment
argument-hint: <network>
---

Run the `genesis-config` skill for network `$ARGUMENTS`. Confirm the L1
deployment for that network is final and verified before generating, and
cross-check the generated `rollup.json` against on-chain `SystemConfig`
values.
