---
name: genesis-config
description: Generate genesis.json and rollup.json for kovanica-chain from a finalized L1 contract deployment. Trigger on "generate genesis", "create rollup config", or "regenerate genesis for <network>".
---

# Genesis & Rollup Config Generation

`genesis.json` (L2 genesis state, including predeploy bytecode/storage)
and `rollup.json` (derivation config — batch inbox address, L1 genesis
hash/number, chain IDs, hard-fork activation times) must exactly match
the L1 contract deployment they correspond to. Generating these before
contracts are deployed and finalized is a common source of an
unrecoverable network-wide mismatch.

## Steps

1. **Confirm the L1 deployment is final** for the target network — check
   `deployments/<network>/` for the recorded addresses and confirm
   they're verified on-chain, not just locally scripted.
2. **Generate the config** from the deployed contracts (using this
   repo's equivalent of `op-node genesis l2`, pointed at the L1 RPC and
   the deployment artifact):
   ```
   op-node genesis l2 \
     --deploy-config deploy-config/<network>.json \
     --l1-deployments deployments/<network>/.deploy \
     --outfile.l2 genesis.json \
     --outfile.rollup rollup.json \
     --l1-rpc $L1_RPC_URL
   ```
   (adjust to this repo's actual script/tool if it wraps or replaces the
   upstream command).
3. **Cross-check** the generated `rollup.json` fields (batch inbox
   address, L1 system config address, genesis L1 hash/number) against
   the actual on-chain `SystemConfig` values — a mismatch here means
   every node will derive incorrectly.
4. **Distribute the config** to node operators alongside the exact
   commit/version of node software it's paired with — genesis and node
   software version drift is a common cause of a devnet/testnet that
   silently forks.
5. Hand off to `devnet-ops` to bring up nodes against the new config and
   run the deposit/withdraw sanity check before declaring the network
   ready.
