# Repo Posture Review — kovanica-chain

Scope: the controls added since `stage2-config-review.md` — `scan-secrets.py`,
the config validators, `.github/workflows/ci.yml`, `make check`, `.gitignore`,
supply-chain config, and the e2e/Foundry scaffolds. Read-only controls/posture
review (no OP Stack bridge/portal/predeploy Solidity exists in-repo yet). Stage:
local devnet live, Sepolia scaffolded but not deployed.

> **Fixes applied.** Findings marked **[FIXED]** were addressed in the same
> change that adds this document; remaining items are follow-ups.

## Findings (most severe first)

### [HIGH] [FIXED] `validate-sepolia-config.py --deploy` could print `deploy-ready` while skipping custody checks
The SAFE-contract (`eth_getCode`) and `guardian != deployer` checks ran only
when `L1_RPC_URL` / `DEPLOYER_ADDRESS` were set, yet strict mode still exited
`OK (deploy-ready)` when they weren't — so an operator could green-light
EOA-owned `ProxyAdmin`/`SystemConfig` with `guardian == deployer`.
**Fix:** `--deploy` now hard-fails if `L1_RPC_URL` or `DEPLOYER_ADDRESS` is
unset, so a `deploy-ready` verdict is impossible while any custody check was
skipped.

### [MEDIUM/HIGH] [FIXED] Third-party CI action pinned to a mutable branch
`ludeeus/action-shellcheck@master` ran on every push with the workflow token —
a compromise or force-push to that branch would run arbitrary code in CI.
**Fix:** removed the third-party action; ShellCheck now installs from `apt` and
runs inline, eliminating the external dependency. First-party actions
(`actions/*`, `foundry-rs/foundry-toolchain@v1`) remain on major tags —
SHA-pinning them is a follow-up (blocked here by egress limits on resolving
external SHAs).

### [MEDIUM] [FIXED] Secret-scanner blind spots vs the shapes this project handles
No pattern for basic-auth URLs (RPC creds), Engine-API JWT secrets, or unquoted
mnemonics; keystore/JWT files weren't gitignored.
**Fix:** `scan-secrets.py` now flags credentialed URLs, `jwt`-context 64-hex
secrets (without false-positiving 0x-prefixed prestate hashes), and unquoted
`mnemonic:`-labelled phrases; `.gitignore` now covers `jwt.txt`, `jwtsecret`,
`*.jwt`, `UTC--*`, and `keystore/`.

### [MEDIUM] [FIXED] Sepolia preimage window outlasted the game clock, and the invariant wasn't enforced
`sepolia.json` had `preimageOracleChallengePeriod 86400` against a 6h game clock;
the devnet-only check wasn't ported to Sepolia.
**Fix:** lowered Sepolia `preimageOracleChallengePeriod` to 3600 and added
`preimageOracleChallengePeriod <= faultGameMaxClockDuration` (and the existing
`clockExtension < maxClockDuration`) to `validate-sepolia-config.py`.

### [MEDIUM] [FOLLOW-UP] Enforcement rests on branch protection that isn't in-repo
CODEOWNERS and CI only bind merges if branch protection requires them, and
`ci.yml` triggers on `push: [main]` (implying direct pushes are possible). CI
runs the Sepolia validator in **lint** mode (green with placeholder roles) — the
real gate is the manual `--deploy` step.
**Action for the repo owner (cannot be set from code):** enable branch
protection on `main` — require the `config-and-scripts`, `js-unit`, and
`contracts` checks, require CODEOWNER review, and disallow direct/force pushes.
Treat `validate-sepolia-config.py --deploy` as a release-blocking manual step
with a signed checklist.

### [LOW/INFO] [FIXED] Green checks that assert little
The Foundry job compiles only the scaffold `Counter` + JSON tests; the genesis
and rollup checks `SKIP` in CI. **Fix:** step/job names now say so
(`Check L2 genesis (skips in CI …)`, a scaffold NOTE on the contracts job) so
"all green" isn't mistaken for contract/genesis coverage. A real Foundry suite +
`chain-security-auditor` pass gate any portal/bridge/dispute-game deploy.

### [INFO] Confirmed-positive posture
`scan-secrets.py` scans only git-tracked files (untracked `.env`/keystores can't
leak through it); `viem` is exact-pinned with committed lockfiles and `npm ci`;
`.gitignore` covers `.env*`, `*.pem`, `.deployer/`, `devnet/out/`, and prestate
binaries; `check-config-consistency.py` closes devnet↔deploy-config drift; e2e
unit tests exercise real logic; devnet `game_type=0` + challenger are enforced;
CI has no `continue-on-error`.

## Verdict

- **(a) Continued devnet work — GO.** The validators, `make check`, and CI raise
  the floor. Caveat unchanged: withdrawals won't finalize until the Stage-1b
  Cannon prestate is regenerated and the on-chain hash matches the challenger's
  file (`devnet.json` still carries the documented placeholder).
- **(b) Proceeding toward Sepolia — NO-GO.** Blocking items: all owner/guardian
  roles are `0x0` and the Sepolia prestate is the zero placeholder (fill + regen
  required); enable branch protection (above); and a `chain-security-auditor`
  pass over the actual portal/bridge/dispute-game contracts is owed once they're
  vendored. The mechanical `--deploy` gate now enforces custody correctly once
  those are filled.
