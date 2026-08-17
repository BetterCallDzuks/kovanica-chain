---
title: kovanica-chain — Bootstrap Brief
type: project-note
status: stage-1-local-devnet
chain: OP Stack rollup (permissionless fault proofs)
created: 2026-08-17
tags: [kovanica-chain, op-stack, rollup, fault-proofs, devnet]
repo: https://github.com/BetterCallDzuks/kovanica-chain
notion: https://app.notion.com/p/3be4134612c581e48734e3a9f69ef086
---

# kovanica-chain — Bootstrap Brief

> [!info] Status
> **Chain:** OP Stack rollup with permissionless fault proofs
> **Stage:** Local Kurtosis devnet (Stage 1)
> **State:** Bootstrap PR #1 merged to `main`; follow-up PR #2 (contracts scaffold + CI) green, awaiting review.

## Links
- **GitHub repo:** https://github.com/BetterCallDzuks/kovanica-chain
- **Notion project hub:** https://app.notion.com/p/3be4134612c581e48734e3a9f69ef086
- **PR #1 (bootstrap, merged):** https://github.com/BetterCallDzuks/kovanica-chain/pull/1
- **PR #2 (contracts + CI, open):** https://github.com/BetterCallDzuks/kovanica-chain/pull/2

## What is built (Stage 1)
- `.claude/` toolkit: root CLAUDE.md, 7 subagents, 5 skills, 5 slash commands, scoped permissions
- `.claude-plugin/` plugin + marketplace manifest
- `devnet/network_params.yaml` — Kurtosis optimism-package config: permissionless fault proofs (`game_type: 0`), enabled op-challenger, devnet-shortened dispute/finality timers
- `devnet/README.md` — bring-up, health check, absolute-prestate step, deposit → withdraw → prove → finalize loop
- `scripts/` + `Makefile` — devnet-up / devnet-inspect / devnet-logs / devnet-down; `validate_network_params.py`
- `packages/contracts-bedrock/` — Foundry package: `deploy-config/devnet.json` + example scaffold + tests (core OP Stack contracts come from the pinned `op-contracts` tag, **not** hand-written)
- `.github/workflows/ci.yml` — validates devnet config/scripts and runs `forge fmt`/`build`/`test`
- `README.md`, `.env.example`, `.gitignore`, and the 2026 procedure under `docs/`

## Staging roadmap
1. **Local devnet** — full Kurtosis stack with fault proofs. Done when a deposit and a full prove→finalize withdrawal both succeed in minutes.
1b. **Absolute prestate** — build kovanica's Cannon64 prestate, set `faultGameAbsolutePrestate`. Done when the challenger responds to games.
2. **Sepolia testnet** — real `op-deployer apply`, SAFE-based `proxyAdminOwner`/`guardian`, `fundDevAccounts: false`.
3. **Mainnet** — production timers, timelocked multisig custody, Superchain Registry entry.

## Version pins (devnet)
- op-deployer: `v0.4.2`
- op-contracts (L1 + L2): `tag://op-contracts/v4.0.0`
- DA mode: `calldata`
- Respected game type: `0` (permissionless CANNON FaultDisputeGame)

> op-deployer and the op-contracts tag must move together. Bumping the contracts tag ⇒ re-derive genesis/rollup, regenerate the prestate, and match op-node/op-geth.

## Key risk — absolute prestate
> [!warning] Most version-sensitive item
> If on-chain `faultGameAbsolutePrestate` ≠ the challenger's prestate file, the challenger refuses to play and withdrawals never finalize. Post–Upgrade 14 use the 64-bit MT-Cannon (Cannon64) prestate. The value currently in `network_params.yaml` is a **placeholder** to regenerate.

## Security note
> [!danger] Plaintext keys in Drive
> A Drive file (`Kopija ProjektKovanica@EVM.docx`) appears to contain plaintext private keys and a seed phrase. Treat any real keys stored in plaintext as compromised and rotate them; keep secrets out of Drive/Notion/git.

## Open follow-ups
- [ ] Run the devnet once, download artifacts, generate the Cannon64 prestate (Stage 1b)
- [ ] Flip the GitHub default branch to `main` in repo Settings (cosmetic)
- [ ] Scripted viem withdrawal round-trip as the Stage-1 acceptance test
- [ ] Merge PR #2 (contracts scaffold + CI)
