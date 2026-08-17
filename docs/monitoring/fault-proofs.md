# Fault-proof monitoring runbook — kovanica-chain

Operator runbook for the permissionless fault-proof system (respected game type
`0`, CANNON `FaultDisputeGame`). This is the component that lets kovanica-chain
be trust-minimized instead of trusting the proposer: withdrawals finalize
against dispute-game results, so a fault-proof failure is a **bridge-of-funds**
failure.

Two things this runbook covers:

- **What to watch**, why, and suggested thresholds.
- **What each alarm means for withdrawals/funds** and the first response.

Tooling:

- **`op-dispute-mon`** — the production monitor. Run it continuously with
  metrics + paging. It tracks per-game status, forecasts resolution, detects
  games that resolved *against* the honest outcome, and monitors bonds/credits.
  This is your source of truth.
- **`ops/dispute-mon`** (this repo) — a lightweight spot check for on-call
  triage / CI gating. It scans the `DisputeGameFactory` and exits non-zero on
  the one critical condition (respected-type `CHALLENGER_WINS`). It is **not** a
  substitute for `op-dispute-mon` — no continuous history, no bond accounting.

> Confirm fault proofs are actually enabled before using this runbook. On a
> pre-fault-proof (Bedrock / `L2OutputOracle`) chain there is **no dispute game
> at all** — withdrawals trust the proposer directly, a more centralized trust
> model. kovanica-chain runs the `DisputeGameFactory` path (portal v3+, game
> type 0); verify with the portal version and that `respectedGameType()` on the
> `OptimismPortal` returns the expected value.

---

## The one alarm that matters most

**A game of the respected game type resolving `CHALLENGER_WINS`.**

Meaning: an on-chain fault proof concluded that a proposed output root was
**invalid**. Either a broken/malicious proposer produced a bad root, or — worse
— the fault-proof machinery itself misbehaved (a Cannon FPVM ↔ op-geth
divergence, a bad absolute prestate, a dispute-game bug). Either way the
trust-minimized withdrawal path can no longer be assumed sound.

**Impact on funds:** any withdrawal proven or finalized against that game (or
against the same bad output) is suspect. If an *invalid* root ever reaches
finalization, an attacker can withdraw funds that were never locked. This is
critical severity.

**First response:**
1. Page on-call + escalate to `chain-security-auditor`. Do not wait.
2. Identify the affected `l2BlockNumber` / `rootClaim` and every withdrawal
   proven against that game.
3. Consider guardian/Security-Council action: the `OptimismPortal` guardian can
   blacklist a dispute game and/or the respected game type can be switched,
   pausing withdrawals while the root cause is found. Follow the key-custody
   runbook — this requires the guardian multisig, never an EOA.
4. Root-cause: was the losing claim from the honest proposer (→ a real
   fault-proof / FPVM soundness bug, treat as a consensus incident), or from a
   dishonest proposer that the honest challenger correctly beat (→ the system
   worked, but investigate why a bad root was proposed)?

`ops/dispute-mon` exits code `2` on this condition; wire that into alerting.

---

## What to watch

### 1. Game creation cadence vs proposer interval

- **What:** new games should appear on the `DisputeGameFactory` roughly every
  proposal interval. Devnet config: `proposal_internal: 10m`
  (`devnet/network_params.yaml`). Confirm the value for the target network.
- **Why:** withdrawals can only be proven against a game whose `l2BlockNumber`
  is ≥ the withdrawal's L2 block. No fresh games ⇒ the withdrawal path stalls,
  even though nothing is "wrong" on-chain.
- **Threshold (suggested):** warn if `now - newestGameTimestamp` exceeds
  **3× the proposal interval**; page at **6×**. (`ops/dispute-mon` implements
  the 3× warning via `PROPOSAL_INTERVAL_SECONDS`.)
- **Funds impact:** stalled proposer = withdrawals cannot progress (liveness,
  not safety). Funds are not at risk of theft, but users cannot exit.

### 2. Challenger liveness / response

- **What:** `op-challenger` must (a) counter any dishonest claim before its
  clock expires, and (b) resolve games it has won. Watch its process health,
  its ETH balance for bonds + gas, and that it is serving the correct absolute
  prestate (`faultGameAbsolutePrestate` must equal the hash of the prestate the
  challenger serves — a mismatch means it refuses to play and withdrawals never
  finalize; see `devnet/network_params.yaml` Stage-1b note).
- **Why:** soundness of the whole system relies on **at least one honest
  participant playing correctly within the clock**. A challenger that is down,
  broke, or serving the wrong prestate cannot defend against an invalid claim.
- **Thresholds:**
  - Challenger process down > 1 proposal interval → warn; > 2 → page.
  - Challenger balance < enough for N bonds + gas → warn well ahead of time
    (bonds escalate up the bisection tree; budget for a full dispute).
  - Any claim the challenger *should* have responded to still uncontested with
    < ~1/3 of `faultGameMaxClockDuration` left on the relevant clock → page.
- **Funds impact:** an unanswered invalid claim whose clock runs out resolves
  in the dishonest party's favor → potential invalid finalization → theft.

### 3. `CHALLENGER_WINS` on the respected game type

Covered above — the critical alarm. Alert immediately, exit non-zero.

### 4. Unresolved games past their clock

- **What:** games still `IN_PROGRESS` well after their clock should have run
  out. Devnet `faultGameMaxClockDuration: 300` (5m); a game much older than
  ~2× that with no resolution is suspicious.
- **Why:** could be a stuck subgame, a challenger not calling `resolveClaim` /
  `resolve`, a large-preimage step blocked by the preimage challenge window
  (`preimageOracleChallengePeriod`), or a liveness attack aiming to run out an
  honest party's clock. Near clock expiry this can flip a game's outcome.
- **Threshold (suggested):** warn on `IN_PROGRESS` age > **2×
  `faultGameMaxClockDuration`** (`ops/dispute-mon` implements this via
  `FAULT_GAME_MAX_CLOCK_DURATION`); page if it also has contested claims near
  expiry.
- **Funds impact:** if an honest party's clock expires while blocked, an invalid
  root can win → theft. Treat a *contested* stuck game as urgent.

### 5. Bonds, credits, and incentives

- **What:** `op-dispute-mon` tracks bonds posted per claim and credits owed
  after resolution. Watch: bonds not being refunded/withdrawn to the honest
  party (`claimCredit`), abnormally cheap bonds at deep tree levels, or a
  proposer/challenger unable to fund the escalating bond schedule.
- **Why:** bonding is what makes honest play rational and spam/griefing
  expensive. If bonds are mis-priced too low, griefing is cheap; too high and
  legitimate challengers are priced out (a censorship-by-economics risk).
- **Threshold:** reconcile expected vs actual credits after each resolution;
  alert on any honest-party credit not claimable, and on bond parameters
  changing unexpectedly.
- **Funds impact:** indirect — a broken incentive layer erodes the guarantee
  that an honest challenger will show up, which is the load-bearing assumption
  for soundness.

### 6. Anchor state / respected game type config

- **What:** the `OptimismPortal`'s `respectedGameType` and the
  `AnchorStateRegistry` anchor. An unexpected change to the respected game type,
  or a retirement timestamp change, alters which games can finalize withdrawals.
- **Why:** switching respected game type is a guardian-level lever (also used in
  incident response); an *unexpected* change is itself an alarm.
- **Funds impact:** wrong respected type ⇒ withdrawals prove against the wrong
  game class; a maliciously-set type could enable bad finalizations.

---

## Suggested threshold summary

| Signal | Warn | Page | Class |
|---|---|---|---|
| No new game vs proposal interval | 3× interval | 6× interval | liveness |
| Challenger process down | 1× interval | 2× interval | soundness risk |
| Challenger bond balance | low-water (N bonds+gas) | cannot post next bond | soundness risk |
| Respected-type `CHALLENGER_WINS` | — | immediately | **safety (critical)** |
| `IN_PROGRESS` past clock | 2× max clock | +contested near expiry | soundness risk |
| Honest-party credit unclaimable post-resolution | any | persistent | incentive |
| Unexpected respected-game-type / anchor change | any | any | config/safety |

Devnet timer reference (`devnet/network_params.yaml`, **shortened for devnet,
not for any public network**): `proposal_internal 10m`,
`faultGameMaxClockDuration 300s`, `faultGameClockExtension 0`,
`proofMaturityDelaySeconds 120s`, `disputeGameFinalityDelaySeconds 600s`,
`faultGameWithdrawalDelay 120s`, `preimageOracleChallengePeriod 300s`. Public
testnet/mainnet use much longer clocks (max clock on the order of days); recompute
every threshold from the deployed values before relying on it.

---

## Withdrawal-path meaning at a glance

- **Proposer stalls (no fresh games):** users cannot *prove* new withdrawals.
  Liveness only — no theft. Restore the proposer.
- **Challenger stalls / underfunded:** an invalid claim may go unanswered →
  possible invalid finalization. Soundness risk. Restore/fund the challenger,
  consider pausing.
- **Respected-type `CHALLENGER_WINS`:** an invalid root was proven (or the FPVM
  diverged). Safety incident. Escalate, blacklist game / switch respected type
  via guardian, halt finalizations until root-caused.
- **Stuck game near clock expiry:** race to resolve; if an honest clock expires
  the outcome can flip. Soundness risk.

## Running the checks

- Production: keep `op-dispute-mon` running with alerting on all of the above.
- Spot check / CI gate:

  ```sh
  cd ops/dispute-mon
  L1_RPC_URL=... DISPUTE_GAME_FACTORY_ADDRESS=... \
  RESPECTED_GAME_TYPE=0 GAMES_TO_SCAN=50 \
  FAULT_GAME_MAX_CLOCK_DURATION=300 PROPOSAL_INTERVAL_SECONDS=600 \
  npm start
  ```

  Exit `2` ⇒ a respected-type game resolved `CHALLENGER_WINS`; treat as the
  critical incident above. See `ops/dispute-mon/README.md`.

## Escalation

Any doubt about soundness → escalate to `chain-security-auditor` **before** any
mitigation that touches contracts or the game, and do not ship a fault-proof
change to a network with real value at stake while uncertain. Any op-geth
state-transition change must be mirrored in the Cannon FPVM (and vice versa) —
an unmirrored change is exactly what produces a respected-type `CHALLENGER_WINS`
on honest input.
