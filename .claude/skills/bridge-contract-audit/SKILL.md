---
name: bridge-contract-audit
description: Run a structured security audit pass on OptimismPortal, CrossDomainMessenger, StandardBridge, or predeploy contracts. Trigger on "audit the bridge", "review the portal contract", "check the predeploys", or before any deployment touching contracts-bedrock.
---

# Bridge Contract Audit

Lighter-weight, single-pass version of the full `chain-security-auditor`
subagent — use for a quick pass during development; escalate to the
subagent for the mandatory pre-deployment audit.

## Steps

1. **Scope** — list the exact contracts/functions in scope, and confirm
   the chain's current stage (Bedrock/Fault Proofs/Interop — this
   determines which withdrawal-verification path is actually live).
2. **Run static analysis:**
   ```
   slither <path> --print human-summary
   forge build --sizes
   ```
3. **Walk message-passing invariants explicitly:**
   - Exactly-once delivery for both directions (no replay).
   - Correct cross-domain sender attribution
     (`xDomainMessageSender`/equivalent) — a wrong sender here lets an
     attacker impersonate a privileged L1 or L2 caller.
   - Withdrawal proof verification checks the *current* valid
     output-root/dispute-game state, correctly rejects proofs against an
     invalidated or stale root, and respects the challenge/finalization
     period.
4. **Standard EVM checklist**: reentrancy, access control, integer/unit
   correctness, signature replay, non-standard-token handling on the
   bridge (fee-on-transfer, rebasing, non-standard return values).
5. **Predeploy-specific check**: confirm any predeploy change is
   compatible with genesis (fixed address, no accidental storage-layout
   shift) since predeploys can't be hot-patched without a hard fork.
6. **Write up findings**, most severe first:
   ```
   [SEVERITY] Component — Issue — Trigger scenario — Recommendation
   ```
7. **State an explicit go/no-go** for the deployment stage in question.
   Escalate to the `chain-security-auditor` subagent for anything beyond
   local devnet testing.
