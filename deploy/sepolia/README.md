# kovanica-chain — Sepolia deployment (Stage 2)

Runbook for deploying kovanica-chain's L1 contracts to **Sepolia** (public
testnet) via `op-deployer`/OPCM. This is a real-network stage — the bar is much
higher than the local devnet.

> [!danger] Gate before you deploy
> - **`chain-security-auditor` pass is required** before any Sepolia deployment
>   touching `OptimismPortal`, the bridge contracts, derivation, or the dispute
>   game (CLAUDE.md §3). Do not skip stages: devnet → Sepolia → mainnet.
> - **Ownership must be SAFE-based.** `proxyAdminOwner` / `systemConfigOwner` /
>   `guardian` must be smart-contract (SAFE) accounts, never the deployer EOA.
>   Keep the guardian distinct from the deployer.
> - **`fundDevAccounts: false`** for anything public.

## Prerequisites

- Funded **deployer** wallet: ~1.5–3.5 Sepolia ETH (gas-dependent). Prefer a
  keystore over a raw env key.
- **Batcher** and **proposer** addresses funded with ~0.5 Sepolia ETH each.
- SAFE addresses created for the owner/guardian roles.
- `op-deployer` pinned to the release that maps to `op-contracts/v4.0.0`
  (mixing versions → `unknown selector` errors).
- Env (see repo `.env.example`): `L1_RPC_URL`, `L1_BEACON_URL` (if blobs),
  `DEPLOYER_PRIVATE_KEY`, `BATCHER_PRIVATE_KEY`, `PROPOSER_PRIVATE_KEY`,
  `CHALLENGER_PRIVATE_KEY`.

## Steps

1. **Init** — generates `.deployer/intent.toml` + `state.json` (pre-populates
   OPCM/locators on Sepolia):
   ```bash
   op-deployer init --l1-chain-id 11155111 --l2-chain-ids <L2_CHAIN_ID> \
     --workdir .deployer --intent-type standard-overrides
   ```
2. **Edit the intent** to match `intent.template.toml` here and
   `../../packages/contracts-bedrock/deploy-config/sepolia.json` — SAFE roles,
   `fundDevAccounts=false`, fault-proof timers. Fill every `0x0000…` placeholder.
3. **Pre-flight gate** — the config must pass the strict validator before you
   apply (fails on zero-address roles, `fundDevAccounts`, a placeholder/devnet
   prestate, or the devnet chain id). This is the mechanical gate from the
   config audit (`docs/audits/stage2-config-review.md`, finding HIGH):
   ```bash
   DEPLOYER_ADDRESS=0x<deployer> L1_RPC_URL=$L1_RPC_URL \
     scripts/preflight-sepolia.sh
   ```
   This chains the version-pin check, the strict Sepolia config/custody gate
   (SAFE owners, `guardian != deployer`, real prestate), and the L2 genesis
   structure check. Do not proceed until it prints `PREFLIGHT: all gates passed`.
4. **Apply** — deploys L1 contracts:
   ```bash
   op-deployer apply --workdir .deployer --l1-rpc-url $L1_RPC_URL \
     --private-key $DEPLOYER_PRIVATE_KEY
   ```
   Records all addresses/roles to `.deployer/state.json` (gitignored).
5. **Inspect** — derive L2 genesis/rollup from the finalized deployment (never
   hand-edit these):
   ```bash
   op-deployer inspect genesis --workdir .deployer <L2_CHAIN_ID> > .deployer/genesis.json
   op-deployer inspect rollup  --workdir .deployer <L2_CHAIN_ID> > .deployer/rollup.json
   ```
6. **Generate the Sepolia prestate** and wire it in (the devnet prestate does
   not apply):
   ```bash
   MONOREPO_REF=op-program/vX.Y.Z L2_CHAIN_ID=<L2_CHAIN_ID> \
     GENESIS=.deployer/genesis.json ROLLUP=.deployer/rollup.json \
     scripts/gen-prestate.sh
   scripts/set-prestate.sh 0x<hash>   # updates deploy-config/sepolia.json too — verify it
   ```
7. **Bring up nodes** against the generated config, start op-batcher /
   op-proposer / op-challenger with the matching prestate.
8. **Post-deploy verification** — read back `ProxyAdmin` owner, `SystemConfig`
   params, and the guardian; confirm they match intent and are SAFE-owned.
9. **Go permissionless** — once `op-dispute-mon` shows healthy games and the
   challenger reliably resolves them, flip `respectedGameType` 1 → 0.

## Record for the Superchain Registry

Record the `op-deployer` version, `op-contracts` tag, and commit hash alongside
the deployment artifacts — you'll need them for a future Superchain Registry
entry.

> `.deployer/` (state.json, keys, genesis/rollup) is gitignored. Never commit
> deployment state or secrets.
