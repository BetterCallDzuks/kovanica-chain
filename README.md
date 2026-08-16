# kovanica-chain

An **OP Stack rollup** with **permissionless fault proofs**. This repo holds
the chain's engineering config, devnet orchestration, deployment workflow, and
the working memory / tooling that drives development (`.claude/`).

> **Current stage: local Kurtosis devnet (Stage 1).** Config here uses
> shortened dispute timers and pre-funded dev accounts. Public testnet
> (Sepolia) and mainnet stages restore production timers and SAFE-based
> ownership — see [`docs/bootstrapping-fault-proof-op-stack-2026.md`](docs/bootstrapping-fault-proof-op-stack-2026.md).

## What's here

| Path | Purpose |
|---|---|
| `devnet/network_params.yaml` | Kurtosis `optimism-package` config — fault proofs on (`game_type: 0`), challenger enabled, devnet-shortened timers |
| `devnet/README.md` | Devnet bring-up, health check, absolute-prestate step, deposit→withdraw sanity check |
| `devnet/static_files/prestates/` | Where the op-challenger's Cannon prestate is served from |
| `scripts/` | `devnet-up` / `devnet-inspect` / `devnet-down` wrappers |
| `Makefile` | `make devnet-up`, `devnet-inspect`, `devnet-logs`, `devnet-down` |
| `docs/` | The 2026 fault-proof bootstrapping procedure (reference of record) |
| `.env.example` | Env var template (L1 RPC, deployer/batcher/proposer keys) |
| `.claude/` | Subagents, skills, and slash commands for this repo |
| `.claude-plugin/` | Plugin + marketplace manifest packaging the toolkit |

## Architecture (summary)

L1 (Ethereum) holds `OptimismPortal`, `DisputeGameFactory`, `SystemConfig`,
`L1CrossDomainMessenger`/`L1StandardBridge`, and `ProxyAdmin`. On L2, `op-node`
derives blocks deterministically from L1 data and drives `op-geth` over the
Engine API; `op-batcher` posts L2 data to L1, `op-proposer` posts output roots,
and `op-challenger` plays dispute games. Full detail and the security baseline
are in [`CLAUDE.md`](CLAUDE.md).

Because this chain runs fault proofs, withdrawals finalize against a
**`DisputeGameFactory`** root claim — not the legacy `L2OutputOracle` path.

## Quick start (local devnet)

```bash
# Prereqs: Docker + Kurtosis CLI (https://docs.kurtosis.com/install)
make devnet-up        # ~5 min to deploy contracts and start the stack
make devnet-inspect   # confirm services healthy + pull deployment artifacts
make devnet-logs      # follow the op-challenger
make devnet-down      # tear down
```

Then follow [`devnet/README.md`](devnet/README.md) for **Stage 1b** (regenerate
kovanica's Cannon absolute prestate and set `faultGameAbsolutePrestate`) and the
deposit → withdraw → prove → finalize sanity check.

**Stage 1 done when:** a deposit and a full prove→finalize withdrawal both
succeed in minutes on the local devnet.

## Toolchain (`.claude/`)

Slash commands: `/devnet-up`, `/gen-genesis <network>`, `/deploy-l1 <network>`,
`/e2e-test <suite>`, `/audit-bridge <path>`. These map to the skills and
subagents defined under `.claude/` (see `CLAUDE.md` §6–§8). The plugin under
`.claude-plugin/` packages them for install via the marketplace manifest.

## Version pinning

op-deployer and the `op-contracts/vX.Y.Z` tag must move together — the devnet
pins `op-deployer:v0.4.2` + `op-contracts/v4.0.0`. Whenever the contracts tag
changes, re-derive genesis/rollup, **regenerate the Cannon prestate**, and bump
op-node/op-geth to the same release line. Never mix bare `v<semver>` (Go-only,
no contracts) tags with `op-contracts/*` expectations.
