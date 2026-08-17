# Guardian emergency powers

The **guardian** is the emergency-response role for the bridge and fault-proof
system. It is a safety valve, not an everyday operator account, and it must be a
SAFE (multisig) distinct from the deployer and from the `ProxyAdmin` owner
(CLAUDE.md §3.2). The Sepolia pre-flight gate
(`scripts/validate-sepolia-config.py --deploy`) enforces that `guardian` is set
and (with `L1_RPC_URL`) is a contract.

## What the guardian can do

Depending on the deployed `op-contracts` version, the guardian's powers are
exposed via the `SuperchainConfig` and/or `OptimismPortal` / dispute-game
contracts. Verify the exact entrypoints against the deployed ABIs — do not
assume. The powers, at protocol level:

1. **Pause withdrawals.** Halt withdrawal finalization on L1 (superchain-wide in
   recent versions via `SuperchainConfig.pause`, or portal-scoped in older
   ones). Use if an invalid state root looks likely to be finalized, or a bridge
   bug is suspected. Pausing stops fund outflow; it does not touch L2 liveness.
2. **Blacklist a dispute game.** Mark a specific `FaultDisputeGame` as invalid so
   the portal will not honor a withdrawal proven against it — the response to a
   game that resolved incorrectly or is under attack.
3. **Set the respected game type.** Change which game type `OptimismPortal`
   respects for finalizing withdrawals (e.g. fall back from permissionless
   CANNON to the permissioned game during an incident, or advance after
   Karst-style upgrades). This is a heavyweight action.

## When to use it

- The dispute-game monitor (`ops/dispute-mon/`) or op-dispute-mon flags a
  respected-type game resolving **CHALLENGER_WINS** (a proven-invalid proposal),
  or an anomalous/unresolvable game near finalization → **pause** and/or
  **blacklist** the game before the withdrawal air-gap
  (`disputeGameFinalityDelaySeconds`) elapses.
- A confirmed bug in the portal/bridge withdrawal path → **pause** immediately.

The air-gap between game resolution and finalization exists precisely to give
the guardian time to act — the maximum adversarial withdrawal delay in
production (~19.5 days) is built around this window.

## How to use it (SAFE flow)

1. Convene the guardian SAFE signers (threshold quorum).
2. Construct the exact call (`pause` / blacklist / set-respected-type) against
   the **verified deployed** contract + ABI for this network's version.
3. Simulate against a fork first (`forge script … --fork-url`) if time permits.
4. Execute via the SAFE; confirm the on-chain effect (e.g. `paused()` returns
   true, or the game is blacklisted).
5. Communicate to node operators and users. Track remediation and the unpause
   plan — a pause is a stopgap, not a resolution.

## Guardrails

- The guardian **cannot** upgrade contracts — that is `ProxyAdmin` (a separate
  timelocked multisig). Keep the roles separate.
- Document the guardian SAFE address, signer set, and threshold, and the exact
  incident-response call templates, **before** any real value is at risk.
- Practice the pause/blacklist flow on the devnet/testnet so it is not first
  attempted during a live incident.
