# Sequencer failure modes

The sequencer is a **liveness** component, not a **safety** component. On the OP
Stack, L2 state is deterministically derivable from L1 data, so a
misbehaving sequencer can delay or reorder transactions but cannot forge state,
steal funds, or permanently trap users. This runbook defines the failure modes
and the operator/user response for each.

## 1. Sequencer offline (liveness failure)

**Symptom:** no new unsafe L2 blocks; `optimism_syncStatus` unsafe head stops
advancing (see [`../monitoring/`](../monitoring/) and `ops/health/`).

**What still works:**
- **Deposits** (L1→L2) still derive and execute — they don't need the sequencer
  (see [`forced-inclusion.md`](forced-inclusion.md)).
- **Withdrawals** already initiated on L2 can still be proven and finalized on
  L1; new withdrawals can be started via forced inclusion.

**Operator response:**
- Restart / fail over the sequencer (op-conductor / manual). Verify it resumes
  from the correct unsafe head and does not reorg the safe chain.
- Communicate status; do not let the batcher fall behind so far that derivation
  stalls once the sequencer returns.

## 2. Sequencer censoring specific transactions

**Symptom:** a user's transactions are never included though the chain advances.

**Response (user-side):** force the transaction via L1 `OptimismPortal`
(`forced-inclusion.md`). Because the deposit is derived from L1, an honest chain
*must* include it — censorship of an individual transaction is not sustainable.

## 3. Sequencer reordering / MEV / equivocation

**Symptom:** transaction order differs from submission order, or the sequencer
signs conflicting unsafe blocks.

**Safety guarantee:** the *safe* chain is whatever is derived from the batches
actually posted to L1. Two verifiers deriving from the same L1 data reach the
same state, so reordering cannot fork the safe chain — it only affects the
(inherently trust-me) unsafe tip until batches land.

**Response:** monitor unsafe→safe reorgs; alert if the sequencer equivocates on
unsafe blocks. Order-dependent applications should rely on the safe head, not
the unsafe tip, for high-value actions.

## 4. Batcher / DA failure (derivation stall)

**Symptom:** unsafe head advances but the **safe** head lags because batches
aren't reaching L1 (batcher down, or DA — calldata/blobs — unavailable).

**Why it matters:** until batches are on L1, the data needed to reconstruct L2
state isn't available to verifiers, and withdrawals can't finalize against
un-derived state. This is a **data-availability** problem, the property that
lets anyone rebuild the chain from L1 alone (CLAUDE.md §3.4).

**Response:** restore the batcher; confirm all L2 blocks up to the unsafe head
become retrievable from L1 (calldata or blobs). On devnet the batcher default is
`calldata` — prefer it to avoid blob-availability issues.

## L1 reorg handling

A deep enough L1 reorg can invalidate previously-derived L2 blocks. op-node must
re-derive from the new canonical L1 chain; confirm it does not silently diverge
from other verifiers (CLAUDE.md §3.7). Test reorg behavior before any public
network.

## The invariant

Across all of the above: **withdrawals must never be blocked by the sequencer,
and state must always be reconstructable from L1.** If any failure mode breaks
that, it is a safety bug, not an ops incident — escalate to
`chain-security-auditor`.
