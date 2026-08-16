---
name: contract-deployment-l1
description: Deploy or upgrade kovanica-chain's L1 contracts via Foundry against the appropriate deploy-config. Trigger on "deploy the L1 contracts", "deploy contracts to <network>", or "upgrade the portal/bridge contracts".
---

# L1 Contract Deployment

## Steps

1. **Confirm target network** and locate the matching
   `deploy-config/<network>.json`. Review every field against intent —
   challenge period, L1 anchor block, batch inbox address, initial
   `SystemConfig` params. Wrong values here are expensive or impossible
   to fix after deployment.
2. **Pre-flight:**
   - Confirm `chain-security-auditor` (or the `bridge-contract-audit`
     skill for a lighter pass) has reviewed the contracts being deployed.
   - Confirm the intended `ProxyAdmin`/`SystemConfig` owner is a
     timelocked multisig for anything beyond internal devnet — not a
     deployer EOA.
3. **Dry-run against a fork** of the target L1 network first:
   ```
   forge script script/Deploy.s.sol --fork-url $L1_RPC_URL -vvvv
   ```
4. **Execute for real:**
   ```
   forge script script/Deploy.s.sol --rpc-url $L1_RPC_URL \
     --broadcast --verify
   ```
5. **Record the deployment** — every address, constructor arg, and tx
   hash — to `deployments/<network>/` as a permanent artifact.
6. **Verify on the L1 block explorer** if `--verify` didn't complete
   automatically.
7. **Generate genesis/rollup config** from this finalized deployment
   (hand off to the `genesis-config` skill) — never generate config
   before the deployment is confirmed final.
8. **Post-deploy sanity check** — read back `ProxyAdmin` owner,
   `SystemConfig` params, and confirm they match intent.
9. For coordinated testnet/mainnet rollouts spanning contracts + node
   infra + hard-fork timing, escalate to the `deploy-ops` subagent.
