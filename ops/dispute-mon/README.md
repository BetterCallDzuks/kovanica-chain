# dispute-mon — fault-proof dispute-game spot check

A lightweight, dependency-light operator spot check over kovanica-chain's
`DisputeGameFactory`. It answers one question fast: **is anything on fire in the
fault-proof system right now?**

The single most important thing it flags is a game of the **respected game type**
resolving `CHALLENGER_WINS` — i.e. an on-chain fault proof concluded that a
proposed L2 output root was **invalid**. That compromises the trust-minimized
withdrawal path and is a CRITICAL alarm; the process exits non-zero so a
cron/CI wrapper can page.

> This is **not** a replacement for `op-dispute-mon`, the production monitor that
> should run continuously with metrics/alerting. Use this for on-call spot
> checks, CI gates, and post-incident triage. See
> `../../docs/monitoring/fault-proofs.md` for the full runbook.

## What it does

1. Resolves the `DisputeGameFactory` address (env override, else
   `devnet/out/state.json`), using the same resolution style as
   `test/e2e/withdrawal-roundtrip/roundtrip.mjs`.
2. Reads `gameCount()` and iterates the most recent `GAMES_TO_SCAN` games:
   `gameAtIndex(i)` → `(gameType, timestamp, proxy)`.
3. For each game reads `status()`, `l2BlockNumber()`, `rootClaim()`.
4. Prints a summary (counts by status, newest games) and lists anomalies.
5. Exits non-zero (`2`) if any CRITICAL alarm is found; `1` on error; `0`
   otherwise.

### ABI / enum caveat

The ABI is intentionally minimal and every function signature and the
`GameStatus` enum (`0=IN_PROGRESS, 1=CHALLENGER_WINS, 2=DEFENDER_WINS`) are
documented inline in `dispute-mon.mjs`. **Verify them against the deployed
contracts / spec** (https://specs.optimism.io,
`ethereum-optimism/optimism` `packages/contracts-bedrock`) before trusting
output on a real network — a mis-mapped enum could turn a critical
`CHALLENGER_WINS` into a silent pass. No contract addresses are hardcoded.

## Environment variables

| Var | Required | Default | Meaning |
|---|---|---|---|
| `L1_RPC_URL` | yes | — | L1 RPC endpoint the factory lives on |
| `DISPUTE_GAME_FACTORY_ADDRESS` | no | — | Factory address; skips `state.json` when set |
| `DEPLOYMENT_STATE_PATH` | no | `../../devnet/out/state.json` | op-deployer state.json (used only if the address env is unset) |
| `RESPECTED_GAME_TYPE` | no | `0` | The chain's respected/canonical game type. A `CHALLENGER_WINS` on this type is the critical alarm |
| `GAMES_TO_SCAN` | no | `20` | How many most-recent games to scan |
| `FAULT_GAME_MAX_CLOCK_DURATION` | no | — | `faultGameMaxClockDuration` (s). If set, enables the "IN_PROGRESS past its clock" liveness warning |
| `PROPOSAL_INTERVAL_SECONDS` | no | — | Expected op-proposer cadence (s). If set, enables the stale-proposer warning |

Address resolution priority: `DISPUTE_GAME_FACTORY_ADDRESS` → flat
`DisputeGameFactoryProxy` in `state.json` → nested
`opChainDeployments[].disputeGameFactoryProxyAddress`.

## Run

```sh
cd ops/dispute-mon
npm install        # installs viem (only needed for the live network path)

# Against a devnet with state.json present:
L1_RPC_URL=http://localhost:8545 npm start

# Or with an explicit factory address and richer heuristics:
L1_RPC_URL=https://sepolia.example \
DISPUTE_GAME_FACTORY_ADDRESS=0x... \
RESPECTED_GAME_TYPE=0 \
GAMES_TO_SCAN=50 \
FAULT_GAME_MAX_CLOCK_DURATION=300 \
PROPOSAL_INTERVAL_SECONDS=600 \
npm start
echo "exit code: $?"   # 2 => CRITICAL (respected-type CHALLENGER_WINS)
```

Exit codes: `0` ok · `1` error (RPC/config/etc.) · `2` critical alarm.

## Test

Pure logic only — no network, no viem needed:

```sh
cd ops/dispute-mon
npm run test:unit    # node --test
```

The pure helpers (`decodeStatus`, `normalizeGame`, `summarize`,
`detectAnomalies`, `hasCriticalAlarm`, address/config resolution) are exported
from `dispute-mon.mjs` and covered in `dispute-mon.test.mjs` with **adversarial**
synthetic game trees (respected-type proven invalid, wrong-type challenger win,
stuck game past its clock, stale proposer), not just honest-vs-honest cases —
because a fault-proof monitor's whole job is catching the degraded/adversarial
case.
