# Changelog

All notable changes to kovanica-chain. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). The chain is pre-launch
(local devnet stage), so there are no released versions yet.

## [Unreleased]

Initial engineering foundation for an OP Stack rollup with permissionless fault
proofs. Network stage: **local Kurtosis devnet**; Sepolia scaffolded (NO-GO
until roles/prestate are filled and audited).

### Added

- **Toolkit** — `.claude/` subagents, skills (rollup-specific + EVM/Solidity
  suite + `ai-to-obsidian`), and slash commands; `.claude-plugin/` manifest.
- **Devnet** — `devnet/network_params.yaml` Kurtosis config with permissionless
  fault proofs (`game_type: 0`), an enabled challenger, and fast-iteration
  timers; `scripts/` + `Makefile` targets (`devnet-up/inspect/logs/down`).
- **Stage 1b prestate** — `scripts/gen-prestate.sh` (reproducible Cannon64
  build) + `scripts/set-prestate.sh` (wires the hash into config without drift).
- **Contracts** — `packages/contracts-bedrock/` Foundry package with
  `deploy-config/{devnet,sepolia}.json` and JSON-invariant tests. Core OP Stack
  contracts come from `op-contracts/v4.0.0` via op-deployer, not hand-written.
- **Stage 2 (Sepolia)** — `deploy/sepolia/` op-deployer intent template +
  runbook; `scripts/validate-sepolia-config.py` (lint + strict `--deploy` gate)
  and `scripts/preflight-sepolia.sh` (consolidated pre-`apply` gate).
- **Version pins** — `versions.json` source of truth + `scripts/check-versions.py`
  drift guard.
- **Validation & CI** — `scripts/check-config-consistency.py`,
  `check-l2-genesis.py`, `scan-secrets.py`; `make check` local gate mirrored by
  CI (config validators, secret scan, JS unit-test matrix, Foundry
  fmt/build/test, ShellCheck); pre-push hook (`make install-hooks`).
- **Observability** — `ops/health/` (chain health CLI) and `ops/dispute-mon/`
  (dispute-game monitor), each with unit tests.
- **Acceptance test** — `test/e2e/withdrawal-roundtrip/` viem deposit→withdraw→
  prove→finalize against the `DisputeGameFactory` path, with unit tests.
- **Docs** — architecture, operations runbooks (forced inclusion, sequencer
  failure, guardian pause), fault-proof monitoring, two security audits, and the
  2026 bootstrapping procedure.
- **Security & hygiene** — `SECURITY.md`, `CONTRIBUTING.md`, CODEOWNERS,
  PR/issue templates, Dependabot (e2e + ops npm, GitHub Actions).

### Security fixes

- Sepolia `--deploy` gate now hard-fails without `L1_RPC_URL`/`DEPLOYER_ADDRESS`,
  so it cannot report `deploy-ready` while skipping SAFE-owner /
  `guardian != deployer` checks.
- Removed a third-party CI action pinned to a mutable branch (ShellCheck now via
  apt).
- Secret scanner extended to credentialed URLs, engine JWT secrets, and unquoted
  mnemonics; JWT/keystore files gitignored.
- Fault-proof clock/preimage sanity (`clockExtension < maxClockDuration`,
  `preimageOracleChallengePeriod <= maxClockDuration`) enforced for devnet and
  Sepolia.

### Known blockers (before Sepolia)

- Fill SAFE-based `proxyAdminOwner`/`systemConfigOwner`/`guardian` and a real
  regenerated Sepolia Cannon prestate.
- Enable branch protection on `main` (required checks + CODEOWNER review).
- `chain-security-auditor` pass over the actual portal/bridge/dispute-game
  contracts once vendored.
