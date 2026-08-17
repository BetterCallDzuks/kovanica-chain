---
title: Config & Key-Custody Review — Stage 1 devnet / Stage 2 (Sepolia) prep
date: 2026-08-17
reviewer: chain-security-auditor
stage: local devnet (Stage 1); Sepolia (Stage 2) scaffolded, not deployed
tags: [audit, config, key-custody, fault-proofs]
---

# Config & Key-Custody Review

Scope: `devnet/network_params.yaml`, `packages/contracts-bedrock/deploy-config/{devnet,sepolia}.json`,
`deploy/sepolia/{intent.template.toml,README.md}`, `scripts/{gen-prestate.sh,set-prestate.sh,validate_network_params.py}`,
`.gitignore`, `.env.example`. This is a **config / key-custody review** — no core Solidity contracts exist in-repo yet, so it is not a contract audit.

Overall posture is good for this stage: intent is documented correctly nearly everywhere. The findings are about **mechanical enforcement gaps** — today the safety of a Sepolia deploy rests on humans following prose, with no gate that fails a bad config.

## Findings (most severe first)

### [HIGH] No automated gate prevents a bad Sepolia deploy
`deploy/sepolia/sepolia.json` + `intent.template.toml` + `scripts/validate_network_params.py`.
`validate_network_params.py` only inspects `devnet/network_params.yaml`; it never looks at `sepolia.json` or the intent template. An operator could run `op-deployer apply` with `proxyAdminOwner`/`systemConfigOwner`/`guardian`/`challenger` still `0x0000…0000`, `fundDevAccounts` true, or a zero/placeholder prestate. Worst case on-chain: a zero-address `guardian` leaves the portal with no pause / dispute-game blacklist / respected-game-type control; a zero/attacker `proxyAdminOwner` bricks or misassigns upgrades; funded dev accounts seed known-key accounts on a public network.
**Recommendation:** add a Sepolia-config validator (mirror of the devnet one), run in CI and as a mandatory `op-deployer apply` pre-flight, that hard-fails on: any role `== 0x0`, `guardian == deployer`, owner roles not being contract (SAFE) addresses (code-size check at deploy time), `fundDevAccounts != false`, `faultGameAbsolutePrestate == 0x0…0`, and `l2ChainID == 2900` (the devnet id).
**Status: ADDRESSED.** `scripts/validate-sepolia-config.py` implements this gate. Default (lint) mode runs in CI and enforces the always-true invariants (`useFaultProofs`, `fundDevAccounts == false`, valid `respectedGameType`, non-devnet chain id, well-formed roles/prestate), warning on placeholders. Strict `--deploy` mode — wired into the Sepolia runbook (`deploy/sepolia/README.md` step 3) as the mandatory pre-flight — hard-fails on zero-address roles, `guardian == DEPLOYER_ADDRESS`, a zero/known-devnet placeholder prestate, and (when `L1_RPC_URL` is set) owner roles without contract code.

### [MEDIUM] The placeholder absolute-prestate passes validation
`devnet/network_params.yaml`, `deploy-config/devnet.json`, `scripts/validate_network_params.py`.
The validator only checks the prestate is a 66-char `0x` hex string, so the placeholder `0x03c7ae75…` passes green while the real artifact under `devnet/static_files/prestates/` is absent. A devnet brought up before the Stage 1b regen will have on-chain `faultGameAbsolutePrestate` ≠ the challenger's served file → challenger refuses to play → withdrawals never finalize — with CI green.
**Recommendation:** cross-check the configured hash against an actual artifact in `cannon_prestates_path` (or a manifest of its hash) and explicitly reject the known placeholder value; gate CI on it.

### [MEDIUM] Cross-file drift enforced only for the prestate field — *partially addressed*
`network_params.yaml` ↔ `deploy-config/devnet.json`.
`set-prestate.sh` syncs only `faultGameAbsolutePrestate`; nothing checked the other shared values (timers, `game_type`/`respectedGameType`, chain id).
**Status:** `scripts/check-config-consistency.py` (added this cycle, now run in CI) diffs the shared fields between `global_deploy_overrides` and `devnet.json` — chain id, game type, prestate, artifacts locators, and all shared timers — and fails on mismatch. This closes the devnet↔deploy-config half of the finding. A Sepolia equivalent is still owed (see HIGH).

### [LOW] `preimageOracleChallengePeriod` inconsistent with the shortened clocks
`devnet.json` / `sepolia.json`. The 1-day (86400s) preimage challenge period exceeds `faultGameMaxClockDuration` (1200s devnet / 3600s sepolia) and `faultGameWithdrawalDelay` (3600s); in the large-preimage path this window can outlast the dispute clock, breaking devnet game liveness and making Sepolia timing unrepresentative.
**Recommendation:** scale `preimageOracleChallengePeriod` down consistently with the shortened clocks on devnet; add validator checks for `faultGameClockExtension < faultGameMaxClockDuration` and a sane preimage-period-vs-clock relationship.
**Status: ADDRESSED.** Devnet `preimageOracleChallengePeriod` lowered to 300 (≤ `faultGameMaxClockDuration` 300), and `validate_network_params.py` now enforces `preimageOracleChallengePeriod ≤ faultGameMaxClockDuration` and `faultGameClockExtension < faultGameMaxClockDuration`.

### [LOW] Sepolia fault-proof clocks are aggressively short
`sepolia.json` / `intent.template.toml`: `faultGameMaxClockDuration = 3600`, `faultGameClockExtension = 3600` (extension == duration is unusual; extension is normally well below duration). An honest challenger offline ~1h could let an invalid output root resolve. Documented as testnet iteration timers, but a public testnet still exposes this.
**Recommendation:** on Sepolia use `maxClockDuration` of at least a few hours with `clockExtension < maxClockDuration`, and state explicitly that Sepolia carries no meaningful value.
**Status: ADDRESSED.** Sepolia `faultGameMaxClockDuration` raised to 21600 (6h) and `faultGameClockExtension` set to 1800 (30m) in `deploy-config/sepolia.json` and `deploy/sepolia/intent.template.toml`; `validate-sepolia-config.py` now hard-fails if `clockExtension ≥ maxClockDuration`.

### [LOW/INFO] `.env.example` not verified
Reviewer could not read `.env.example` (sandbox permission denied — it is in the tool deny-list, which is itself a good sign). Manually confirm it contains only placeholders (no real keys, no RPC URLs with embedded credentials). `.gitignore` secret coverage is good: `.env`/`.env.*` ignored except `.env.example`, plus `*.pem`, `*keystore*`, `.deployer/`, `devnet/out/`, and the prestate binaries.

### [INFO] Positive posture confirmed
`game_type: 0` (permissionless CANNON) is forced on devnet and enforced by the validator; `respectedGameType` 1→0 bootstrap for Sepolia is documented; `fundDevAccounts: false` on both Sepolia intent and template; guardian-distinct-from-deployer and SAFE-only owner roles documented everywhere; `.deployer/` gitignored; artifacts locators pinned to `op-contracts/v4.0.0` and required to match (L1==L2); the prestate script refuses to guess `MONOREPO_REF` and documents that a prestate cannot be reused across chains. Deposit/forced-inclusion path is standard OptimismPortal with no override disabling it; no custom sequencer-window/channel-timeout override is present, so upstream defaults apply (confirm those meet your censorship-resistance target before Sepolia).

## Verdict

- **(a) Local devnet — GO.** Safe to run as configured. Expected caveat: withdrawals will not finalize until the Stage 1b prestate is regenerated (`scripts/gen-prestate.sh`) and wired in (`scripts/set-prestate.sh`) so the on-chain hash matches the challenger's served file. The current hash is a documented Stage-1 placeholder.
- **(b) Sepolia — NO-GO** until:
  1. Every `0x0000…` role in `sepolia.json` and the generated `.deployer/intent.toml` is a SAFE (contract) address; `guardian` distinct from the deployer; verified on-chain post-deploy.
  2. The **Sepolia** Cannon64 prestate is regenerated and the wired hash equals the file the challenger serves.
  3. A Sepolia-config validation gate exists (finding HIGH) — no zero-address roles, `fundDevAccounts=false`, non-zero prestate, correct chain id — in CI and as an `apply` pre-flight.
  4. The required core-contract `chain-security-auditor` pass is completed before any deploy touching the portal/bridge/dispute game.
  5. The 1h fault-proof clocks are reconsidered before any value rides on Sepolia.

**Key-custody status:** all owner/guardian/challenger roles are unfilled zero-address placeholders with correct documented intent — acceptable pre-deploy, but with no mechanical enforcement it remains a blocking item that must be filled and verified on-chain before Sepolia.
