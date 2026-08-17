---
name: solidity-security
description: Deep security analysis, threat modeling, and vulnerability detection for Solidity smart contracts. Use for audits, security reviews, finding reentrancy, access control flaws, oracle manipulation, flash-loan attacks, proxy storage collisions, signature issues, economic exploits, and pre-deployment checklists. Triggers include audit, security review, vulnerability, reentrancy, flash loan, oracle, access control, SWC, threat model, exploit.
---

# Solidity Security

## Overview

Provide expert-level security review and threat modeling for EVM smart contracts. Focus on high-impact vulnerabilities that have caused real losses.

## Instructions

When performing a security review:

1. Scope and Assets — Identify what can be lost (tokens, ETH, governance, reputation) and who controls critical functions.
2. Threat Model — List attackers (external user, malicious owner, compromised oracle, MEV searcher, flash-loan attacker) and their goals.
3. Entry Points — Enumerate every external/public function and its trust assumptions.
4. Check classic classes systematically
   - Reentrancy (classic, cross-function, read-only, cross-contract)
   - Access control and privilege escalation
   - Oracle / price manipulation
   - Flash-loan enabled attacks
   - Signature replay / malleability / missing nonce
   - Proxy / upgrade storage collisions and initialization
   - Integer issues (rarer in 0.8+)
   - DoS via unbounded loops or forced reverts
   - Front-running / sandwich / MEV exposure
   - Token integration risks (fee-on-transfer, rebasing, missing return)
   - Economic attacks (governance, incentive misalignment)
5. Severity — Use Critical / High / Medium / Low / Informational with clear impact + likelihood.
6. PoC — Prefer Foundry-based proof of concept for High/Critical findings.
7. Recommendations — Concrete, minimal changes preferred over large rewrites.

## Common High-Impact Patterns to Flag

- External call before state update without reentrancy guard
- Single-point oracle without staleness or deviation checks
- Upgradeable contract with uninitialized implementation or storage gap missing
- tx.origin for authorization
- Unprotected initialize or selfdestruct
- Arbitrary external call (calldata controlled by user)
- Missing slippage protection on swaps
- Centralized admin with no timelock on critical parameters

## Output Format

For each finding:
- Title
- Severity
- Description (what + why it is exploitable)
- Impact
- Recommended fix
- (Optional) Foundry PoC sketch

Always end with an overall risk assessment and remaining residual risks.

## Code Examples

See `references/code-examples.md` for reentrancy-safe withdraw, two-step ownership, oracle checks, initializer protection, and pull payments.
See also `references/vulnerability-catalog.md` for the high-impact vulnerability list.
